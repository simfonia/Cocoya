use std::process::{Command, Stdio};
use std::io::{BufReader, BufRead};
use std::collections::HashMap;
use std::fs;
use tauri::{State, Window, Emitter};
use crate::state::AppState;

#[tauri::command]
pub async fn run_python(
    window: Window,
    state: State<'_, AppState>,
    code: String,
    python_path: String,
) -> Result<(), String> {
    // 1. 停止該視窗的舊程序
    stop_python(window.clone(), state.clone()).await?;

    // 2. 準備暫存檔案
    let temp_dir = std::env::temp_dir().join("cocoya_tauri");
    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    }
    let script_path = temp_dir.join(format!("cocoya_run_{}.py", window.label()));
    fs::write(&script_path, &code).map_err(|e| e.to_string())?;

    // 3. 啟動進程
    let mut child = Command::new(&python_path)
        .arg("-u") // Unbuffered mode
        .arg(&script_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start Python: {}", e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    // 將進程存入狀態以便停止
    {
        let mut procs = state.python_processes.lock().unwrap();
        procs.insert(window.label().to_string(), child);
    }

    // 4. 即時串流日誌到前端
    let window_clone = window.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = window_clone.emit("python-log", l);
            }
        }
    });

    let window_clone_err = window.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = window_clone_err.emit("python-error", l);
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_python(window: Window, state: State<'_, AppState>) -> Result<(), String> {
    let mut procs = state.python_processes.lock().unwrap();
    if let Some(mut child) = procs.remove(window.label()) {
        let _ = child.kill();
    }
    Ok(())
}

#[tauri::command]
pub async fn start_training(
    window: Window,
    state: State<'_, AppState>,
    project_name: String,
    task_type: String,
    backend: String,
    ssh_config: Option<serde_json::Value>,
) -> Result<(), String> {
    use std::io::Write;
    
    let sidecar_path = std::env::current_dir()
        .map_err(|e| e.to_string())?
        .join("resources")
        .join("dataset_manager")
        .join("dataset_sidecar.py");
    
    let mut cmd = Command::new("python");
    cmd.arg(&sidecar_path)
       .stdin(Stdio::piped())
       .stdout(Stdio::piped())
       .stderr(Stdio::piped());
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    
    let mut child = cmd.spawn().map_err(|e| format!("Failed to start sidecar: {}", e))?;
    
    let mut stdin = child.stdin.take().ok_or("Failed to open stdin")?;
    let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to open stderr")?;
    
    // 構建指令
    let mut command_msg = serde_json::json!({
        "command": "trainLocal",
        "requestId": "train_".to_string() + &uuid::Uuid::new_v4().to_string(),
        "projectName": project_name,
        "taskType": task_type
    });
    
    // 如果是 DGX 模式，加入 SSH 配置
    if backend == "dgx" && ssh_config.is_some() {
        // 這裡應該處理 DGX 訓練流程
        // 目前先專注在本地訓練
        window.emit("training-error", serde_json::json!({
            "error": "DGX 訓練功能開發中，請使用本地訓練"
        })).ok();
        return Err("DGX training not implemented yet".to_string());
    }
    
    // 發送指令到 sidecar
    let cmd_str = serde_json::to_string(&command_msg).map_err(|e| e.to_string())?;
    stdin.write_all(cmd_str.as_bytes()).map_err(|e| e.to_string())?;
    stdin.write_all(b"\n").map_err(|e| e.to_string())?;
    drop(stdin);
    
    // 讀取回應
    let window_clone = window.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(l) = line {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&l) {
                    if json.get("type") == Some(&serde_json::Value::String("event".to_string())) {
                        if json.get("event") == Some(&serde_json::Value::String("trainingLog".to_string())) {
                            let _ = window_clone.emit("training-log", json.get("data"));
                        }
                    } else if json.get("type") == Some(&serde_json::Value::String("response".to_string())) {
                        let _ = window_clone.emit("training-complete", json);
                    }
                }
            }
        }
    });
    
    // 讀取 stderr
    let window_clone_err = window.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = window_clone_err.emit("training-error", serde_json::json!({"error": l}));
            }
        }
    });
    
    // 等待進程結束
    let status = child.wait().map_err(|e| e.to_string())?;
    
    if status.success() {
        Ok(())
    } else {
        Err(format!("Training process failed with exit code: {:?}", status.code()))
    }
}

#[tauri::command]
pub async fn check_environment(python_path: String) -> Result<HashMap<String, bool>, String> {
    let check_script = r#"
import importlib.util
import json
import sys

modules = ['cv2', 'mediapipe', 'PIL', 'serial', 'esptool']
results = {}
for m in modules:
    results[m] = importlib.util.find_spec(m) is not None
print(json.dumps(results))
"#;

    let mut cmd = Command::new(&python_path);
    cmd.arg("-c").arg(check_script);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().map_err(|e| format!("Failed to run Python: {}", e))?;

    if output.status.success() {
        let out_str = String::from_utf8_lossy(&output.stdout);
        let results: HashMap<String, bool> = serde_json::from_str(out_str.trim()).map_err(|e| e.to_string())?;
        Ok(results)
    } else {
        let mut results = HashMap::new();
        results.insert("cv2".to_string(), false);
        results.insert("mediapipe".to_string(), false);
        results.insert("PIL".to_string(), false);
        results.insert("serial".to_string(), false);
        results.insert("esptool".to_string(), false);
        Ok(results)
    }
}
