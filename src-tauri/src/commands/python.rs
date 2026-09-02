use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use std::collections::HashMap;
use std::fs;
use tauri::{State, Window, Emitter};
use crate::state::AppState;

/// 過濾 ANSI 色碼序列（如 `\x1b[1m`, `\x1b[32m` 等）
/// 確保終端機輸出與 VSIX 版一致（VSCode 終端機原生處理色碼）
fn strip_ansi_codes(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            // ESC 字元，開始 ANSI 序列
            if chars.peek() == Some(&'[') {
                chars.next(); // 消費 '['
                // 消費直到遇到 letter（序列結束符）
                while let Some(&next) = chars.peek() {
                    chars.next();
                    if next.is_ascii_alphabetic() {
                        break;
                    }
                }
            } else {
                // 單獨 ESC 字元，保留
                result.push(c);
            }
        } else {
            result.push(c);
        }
    }
    result
}

// SSOT: Python 套件檢查清單（從 config/python_modules.json 同步）
// 當修改 config/python_modules.json 時，必須同步更新此常數
const PYTHON_MODULES_JSON: &str = r#"[{"id":"serial","name":"pyserial","description":"MCU 通訊"},{"id":"esptool","name":"esptool (Firmware)","description":"ESP32 韌體燒錄"},{"id":"cv2","name":"opencv-python","description":"OpenCV - 影像處理"},{"id":"mediapipe","name":"mediapipe","description":"MediaPipe - 姿態/人臉/手勢偵測"},{"id":"PIL","name":"Pillow (Image)","description":"Pillow - 影像處理"},{"id":"tensorflow","name":"tensorflow","description":"深度學習框架"},{"id":"numpy","name":"numpy","description":"數值計算"},{"id":"sklearn","name":"scikit-learn","description":"機器學習工具（class_weight）"},{"id":"matplotlib","name":"matplotlib","description":"訓練報告視覺化"},{"id":"paramiko","name":"paramiko (SSH)","description":"SSH/SFTP 連線（遠端訓練）"}]"#;

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
    // 設定工作目錄為當前檔案的專案目錄（與 VSIX 一致），確保相對路徑（如 dataset/）能正確解析
    let current_path = {
        let paths = state.current_paths.lock().unwrap();
        paths.get(window.label()).cloned()
    };

    let work_dir = match current_path {
        Some(ref p) => p.parent().map(|d| d.to_path_buf()).unwrap_or_else(|| {
            let mut dev = std::env::current_dir().unwrap();
            if dev.ends_with("src-tauri") { dev.pop(); }
            dev
        }),
        None => {
            let mut dev = std::env::current_dir().unwrap();
            if dev.ends_with("src-tauri") { dev.pop(); }
            dev
        }
    };

    let mut cmd = Command::new(&python_path);
    cmd.arg("-u") // Unbuffered mode
        .arg(&script_path)
        .current_dir(&work_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Windows: 隱藏 console 視窗
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to start Python: {}", e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    // 將進程存入狀態以便停止
    {
        let mut procs = state.python_processes.lock().unwrap();
        procs.insert(window.label().to_string(), child);
    }

    // 4. 即時串流日誌到前端
    // 對齊 VSIX 版：顯示實際執行命令，讓使用者知道使用了哪個腳本
    let own_label = window.label().to_string();
    // 精準單播：只發給本視窗，避免多視窗終端機互相污染
    let _ = window.emit_to(&own_label, "python-log", format!(
        "& \"{}\" \"{}\"\n",
        python_path, script_path.display()
    ));

    let run_stdout_label = own_label.clone();

    let window_clone = window.clone();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut buffer = Vec::new();
        loop {
            buffer.clear();
            match reader.read_until(b'\n', &mut buffer) {
                Ok(0) => break, // EOF
                Ok(_) => {
                    // 用 from_utf8_lossy 處理編碼，避免中文亂碼
                    let raw = String::from_utf8_lossy(&buffer);
                    // 過濾 ANSI 色碼，對齊 VSIX 終端機輸出
                    let cleaned = strip_ansi_codes(&raw);
                    let _ = window_clone.emit_to(&run_stdout_label, "python-log", cleaned);
                }
                Err(_) => break,
            }
        }
    });

    // stderr 使用獨立事件，前端可用不同樣式顯示
    // 不再混入 stdout 串流，避免亂碼片段出現在正常輸出中
    let run_stderr_label = own_label.clone();

    let window_clone_err = window.clone();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        let mut buffer = Vec::new();
        loop {
            buffer.clear();
            match reader.read_until(b'\n', &mut buffer) {
                Ok(0) => break, // EOF
                Ok(_) => {
                    let raw = String::from_utf8_lossy(&buffer);
                    let cleaned = strip_ansi_codes(&raw);
                    let _ = window_clone_err.emit_to(&run_stderr_label, "python-error", cleaned);
                }
                Err(_) => break,
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_python(window: Window, state: State<'_, AppState>) -> Result<(), String> {
    {
        let mut procs = state.python_processes.lock().unwrap();
        if let Some(mut child) = procs.remove(window.label()) {
            let _ = child.kill();
        }
    }
    // 一併釋放該視窗的串列埠監看（若有），避免與執行/部署資源重疊
    let _ = crate::commands::mcu::stop_serial_monitor(state, window.label().to_string());
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
    
    // 2026-09-01：Release 模式 sidecar CWD 在 Program Files，相對路徑寫入失敗。
    // 以 COCOYA_PROJECT_ROOT 環境變數讓 sidecar chdir 到專案根目錄。
    let project_root = {
        let paths = state.current_paths.lock().unwrap();
        paths.get(window.label()).and_then(|p| p.parent().map(|x| x.to_string_lossy().to_string()))
    };

    let mut cmd = Command::new("python");
    cmd.arg(&sidecar_path)
       .stdin(Stdio::piped())
       .stdout(Stdio::piped())
       .stderr(Stdio::piped())
       .env("PYTHONIOENCODING", "utf-8") // 2026-09-01：修正正體中文 Windows (cp950) 終端機中文亂碼
       .env("PYTHONUNBUFFERED", "1");

    if let Some(root) = &project_root {
        cmd.env("COCOYA_PROJECT_ROOT", root);
    }
    
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
    
    let own_label = window.label().to_string();

    // 如果是 DGX 模式，加入 SSH 配置
    if backend == "dgx" && ssh_config.is_some() {
        // 這裡應該處理 DGX 訓練流程
        // 目前先專注在本地訓練
        window.emit_to(&own_label, "training-error", serde_json::json!({
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
    let train_stdout_label = own_label.clone();

    let window_clone = window.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(l) = line {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&l) {
                    if json.get("type") == Some(&serde_json::Value::String("event".to_string())) {
                        if json.get("event") == Some(&serde_json::Value::String("trainingLog".to_string())) {
                            let _ = window_clone.emit_to(&train_stdout_label, "training-log", json.get("data"));
                        }
                    } else if json.get("type") == Some(&serde_json::Value::String("response".to_string())) {
                        let _ = window_clone.emit_to(&train_stdout_label, "training-complete", json);
                    }
                }
            }
        }
    });
    
    // 讀取 stderr
    let train_stderr_label = own_label.clone();

    let window_clone_err = window.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = window_clone_err.emit_to(&train_stderr_label, "training-error", serde_json::json!({"error": l}));
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
pub async fn check_environment(python_path: String) -> Result<serde_json::Value, String> {
    // 從 SSOT JSON 解析模組清單
    let module_defs: Vec<serde_json::Value> = serde_json::from_str(PYTHON_MODULES_JSON).map_err(|e| e.to_string())?;
    let module_ids: Vec<String> = module_defs.iter()
        .filter_map(|m| m.get("id").and_then(|v| v.as_str().map(String::from)))
        .collect();
    
    // 建立 Python 檢查腳本
    let modules_json = serde_json::json!(module_ids).to_string();
    let check_script = format!(
        r#"
import importlib.util
import json
import sys

modules = {}
results = {{}}
for m in modules:
    try:
        results[m] = importlib.util.find_spec(m) is not None
    except:
        results[m] = False
print(json.dumps(results))
"#,
        modules_json
    );

    let mut cmd = Command::new(&python_path);
    cmd.arg("-c").arg(&check_script);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().map_err(|e| format!("Failed to run Python: {}", e))?;

    let results: HashMap<String, bool> = if output.status.success() {
        let out_str = String::from_utf8_lossy(&output.stdout);
        serde_json::from_str(out_str.trim()).unwrap_or_default()
    } else {
        let mut results = HashMap::new();
        for m in module_ids {
            results.insert(m, false);
        }
        results
    };

    // 直接使用 SSOT 的模組定義
    let modules: Vec<serde_json::Value> = module_defs.into_iter()
        .filter(|m| results.contains_key(m.get("id").and_then(|v| v.as_str()).unwrap_or("")))
        .collect();

    Ok(serde_json::json!({
        "results": results,
        "modules": modules
    }))
}
