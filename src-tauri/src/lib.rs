use std::process::{Command, Stdio, Child};
use std::sync::{Arc, Mutex};
use std::io::{BufReader, BufRead};
use tauri::{State, Window, Emitter, Manager};
use std::fs;
use std::path::PathBuf;
use tauri_plugin_dialog::DialogExt;

// --- 全域進度與狀態管理 ---
struct AppState {
    python_process: Arc<Mutex<Option<Child>>>,
    current_path: Arc<Mutex<Option<PathBuf>>>,
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

    // --- 檢查是否有未命名的自動備份 ---
    let temp_dir = std::env::temp_dir().join("cocoya_tauri");
    let untitled_bak = temp_dir.join("untitled_backup.xml");
    if untitled_bak.exists() {
        if let Ok(bak_xml) = fs::read_to_string(&untitled_bak) {
            // 透過事件主動推播備份給前端
            handle.emit("recoveryData", serde_json::json!({ "xml": bak_xml })).ok();
        }
    }

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

#[tauri::command]
async fn open_file(handle: tauri::AppHandle, state: State<'_, AppState>) -> Result<OpenFileResult, String> {
    let file_path = handle.dialog().file().add_filter("Cocoya XML", &["xml"]).blocking_pick_file();

    if let Some(path) = file_path {
        let xml = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let filename = path.file_name().unwrap().to_str().unwrap().to_string();
        
        let platform = if xml.contains("platform=\"CircuitPython\"") { "CircuitPython" } else { "PC" };

        // --- 檢查實體備份 ---
        let mut backup_xml = None;
        let parent = path.parent().unwrap();
        let bak_path = parent.join(format!(".{}.bak", filename));
        if bak_path.exists() {
            if let Ok(b_xml) = fs::read_to_string(&bak_path) {
                if b_xml.trim() != xml.trim() {
                    backup_xml = Some(b_xml);
                }
            }
        }

        {
            let mut current = state.current_path.lock().unwrap();
            *current = Some(path.into());
        }

        Ok(OpenFileResult {
            xml: xml,
            filename: filename,
            platform: platform.into(),
            backup_xml: backup_xml
        })
    } else {
        Err("Canceled".into())
    }
}

#[derive(serde::Serialize)]
struct OpenFileResult {
    xml: String,
    filename: String,
    platform: String,
    backup_xml: Option<String>
}

#[tauri::command]
fn auto_backup(state: State<'_, AppState>, xml: String) -> Result<(), String> {
    let backup_path = {
        let current = state.current_path.lock().unwrap();
        if let Some(path) = &*current {
            let dir = path.parent().unwrap();
            let name = path.file_name().unwrap().to_str().unwrap();
            dir.join(format!(".{}.bak", name))
        } else {
            let temp_dir = std::env::temp_dir().join("cocoya_tauri");
            if !temp_dir.exists() { fs::create_dir_all(&temp_dir).ok(); }
            temp_dir.join("untitled_backup.xml")
        }
    };
    fs::write(backup_path, xml).map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_backup(state: State<'_, AppState>) -> Result<(), String> {
    let current = state.current_path.lock().unwrap();
    if let Some(path) = &*current {
        let bak_path = path.parent().unwrap().join(format!(".{}.bak", path.file_name().unwrap().to_str().unwrap()));
        if bak_path.exists() { let _ = fs::remove_file(bak_path); }
    }
    let untitled_bak = std::env::temp_dir().join("cocoya_tauri").join("untitled_backup.xml");
    if untitled_bak.exists() { let _ = fs::remove_file(untitled_bak); }
    Ok(())
}

#[tauri::command]
fn reject_recovery(state: State<'_, AppState>) -> Result<(), String> {
    let backup_path = {
        let current = state.current_path.lock().unwrap();
        if let Some(path) = &*current {
            let dir = path.parent().unwrap();
            let name = path.file_name().unwrap().to_str().unwrap();
            Some(dir.join(format!(".{}.bak", name)))
        } else {
            let p = std::env::temp_dir().join("cocoya_tauri").join("untitled_backup.xml");
            if p.exists() { Some(p) } else { None }
        }
    };

    if let Some(p) = backup_path {
        if p.exists() {
            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
            let archive_path = format!("{}.old_{}", p.to_str().unwrap(), timestamp);
            let _ = fs::rename(p, archive_path);
        }
    }
    Ok(())
}

#[tauri::command]
async fn save_file(handle: tauri::AppHandle, state: State<'_, AppState>, xml: String, save_as: bool) -> Result<String, String> {
    let mut path_to_save = {
        let current = state.current_path.lock().unwrap();
        if save_as { None } else { current.clone() }
    };

    if path_to_save.is_none() {
        let picked = handle.dialog().file()
            .add_filter("Cocoya XML", &["xml"])
            .set_file_name("project.xml")
            .blocking_save_file();
        
        if let Some(p) = picked {
            path_to_save = Some(p.into());
        } else {
            return Err("Canceled".into());
        }
    }

    if let Some(path) = path_to_save {
        fs::write(&path, &xml).map_err(|e| e.to_string())?;
        let filename = path.file_name().unwrap().to_str().unwrap().to_string();
        
        {
            let mut current = state.current_path.lock().unwrap();
            *current = Some(path);
        }
        Ok(filename)
    } else {
        Err("No path".into())
    }
}

#[tauri::command]
fn get_serial_ports() -> Result<Vec<String>, String> {
    let ports = serialport::available_ports().map_err(|e| e.to_string())?;
    Ok(ports.into_iter().map(|p| p.port_name).collect())
}

#[tauri::command]
async fn deploy_mcu(
    handle: tauri::AppHandle,
    python_path: String,
    port: String,
    code: String,
) -> Result<(), String> {
    // 1. 準備暫存檔案
    let temp_dir = std::env::temp_dir().join("cocoya_tauri");
    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    }
    let script_path = temp_dir.join("mcu_code.py");
    fs::write(&script_path, &code).map_err(|e| e.to_string())?;

    // 2. 獲取 deploy_mcu.py 路徑
    let resource_path = handle
        .path()
        .resolve("resources/deploy_mcu.py", tauri::path::BaseDirectory::Resource);

    let deployer_path = match resource_path {
        Ok(p) if p.exists() => p,
        _ => {
            let mut dev_path = std::env::current_dir().unwrap();
            if dev_path.ends_with("src-tauri") { dev_path.pop(); }
            dev_path.push("resources");
            dev_path.push("deploy_mcu.py");
            dev_path
        }
    };

    // 3. 執行部署程序 (使用 --no-monitor 以便獲取結束狀態)
    let output = Command::new(&python_path)
        .arg(&deployer_path)
        .arg(&port)
        .arg(&script_path)
        .arg("--no-monitor")
        .output()
        .map_err(|e| format!("Failed to execute deployer: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let err = String::from_utf8_lossy(&output.stdout); // deploy_mcu.py 的錯誤訊息可能在 stdout
        Err(format!("Deployment failed: {}", err))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            python_process: Arc::new(Mutex::new(None)),
            current_path: Arc::new(Mutex::new(None)),
        })
        .invoke_handler(tauri::generate_handler![
            run_python, 
            stop_python,
            get_manifest,
            get_module_toolbox,
            open_file,
            save_file,
            get_serial_ports,
            deploy_mcu,
            auto_backup,
            clear_backup,
            reject_recovery
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
