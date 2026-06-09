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
