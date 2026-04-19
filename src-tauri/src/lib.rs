use std::process::{Command, Stdio, Child};
use std::sync::{Arc, Mutex};
use std::io::{BufReader, BufRead};
use tauri::{State, Window, Emitter, Manager};
use std::fs;

// --- 全域進度與狀態管理 ---
struct AppState {
    python_process: Arc<Mutex<Option<Child>>>,
}

#[tauri::command]
async fn run_python(
    window: Window,
    state: State<'_, AppState>,
    code: String,
    python_path: String,
) -> Result<(), String> {
    // 1. 停止舊程序
    stop_python(state.clone()).await?;

    // 2. 準備暫存檔案
    let temp_dir = std::env::temp_dir().join("cocoya_tauri");
    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    }
    let script_path = temp_dir.join("cocoya_run.py");
    fs::write(&script_path, &code).map_err(|e| e.to_string())?;

    // 3. 啟動進程
    let mut child = Command::new(&python_path)
        .arg(&script_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start Python: {}", e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    // 將進程存入狀態以便停止
    {
        let mut proc = state.python_process.lock().unwrap();
        *proc = Some(child);
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
async fn stop_python(state: State<'_, AppState>) -> Result<(), String> {
    let mut proc = state.python_process.lock().unwrap();
    if let Some(mut child) = proc.take() {
        let _ = child.kill();
    }
    Ok(())
}

#[tauri::command]
fn get_manifest(handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let resource_path = handle
        .path()
        .resolve("resources/core_manifest.json", tauri::path::BaseDirectory::Resource);
    
    let target_path = match resource_path {
        Ok(p) if p.exists() => p,
        _ => {
            // Fallback: 開發模式，需考慮工作目錄可能在 src-tauri 內
            let mut dev_path = std::env::current_dir().unwrap();
            if dev_path.ends_with("src-tauri") { dev_path.pop(); }
            dev_path.push("ui");
            dev_path.push("src");
            dev_path.push("core_manifest.json");
            dev_path
        }
    };
    
    let content = fs::read_to_string(&target_path).map_err(|e| format!("Failed to read manifest at {:?}: {}", target_path, e))?;
    let json: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
fn get_module_toolbox(handle: tauri::AppHandle, path: String) -> Result<String, String> {
    let resource_path = handle
        .path()
        .resolve(format!("resources/modules/{}", path), tauri::path::BaseDirectory::Resource);

    let target_path = match resource_path {
        Ok(p) if p.exists() => p,
        _ => {
            let mut dev_path = std::env::current_dir().unwrap();
            if dev_path.ends_with("src-tauri") { dev_path.pop(); }
            dev_path.push("ui");
            dev_path.push("src");
            dev_path.push("modules");
            
            for part in path.split('/') {
                dev_path.push(part);
            }
            dev_path
        }
    };

    fs::read_to_string(&target_path).map_err(|e| format!("Failed to read toolbox at {:?}: {}", target_path, e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            python_process: Arc::new(Mutex::new(None)),
        })
        .invoke_handler(tauri::generate_handler![
            run_python, 
            stop_python,
            get_manifest,
            get_module_toolbox
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
