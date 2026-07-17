use std::fs;
use tauri::{AppHandle, State, Window, Manager};
use tauri_plugin_dialog::DialogExt;
use crate::state::AppState;
use crate::utils::{get_resource_path, get_examples_path};

#[derive(serde::Serialize)]
pub struct OpenFileResult {
    pub xml: String,
    pub filename: String,
    pub platform: String,
    pub backup_xml: Option<String>,
    pub is_read_only: bool
}

#[tauri::command]
pub fn get_manifest(handle: AppHandle) -> Result<serde_json::Value, String> {
    let target_path = get_resource_path(&handle, "core_manifest.json");
    let content = fs::read_to_string(&target_path).map_err(|e| format!("Failed to read manifest at {:?}: {}", target_path, e))?;
    let json: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
pub fn get_module_toolbox(handle: AppHandle, path: String) -> Result<String, String> {
    let relative_path = format!("modules/{}", path);
    let target_path = get_resource_path(&handle, &relative_path);
    fs::read_to_string(&target_path).map_err(|e| format!("Failed to read toolbox at {:?}: {}", target_path, e))
}

#[tauri::command]
pub async fn open_file(window: Window, handle: AppHandle, state: State<'_, AppState>) -> Result<OpenFileResult, String> {
    let file_path = handle.dialog().file().add_filter("Cocoya XML", &["xml"]).blocking_pick_file();

    if let Some(p) = file_path {
        let path = p.into_path().map_err(|_| "Failed to parse path".to_string())?;
        let xml = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let filename = path.file_name().unwrap().to_str().unwrap().to_string();
        
        let platform = if xml.contains("platform=\"MicroPython\"") { "MicroPython" } else { "PC" };

        // --- 檢查鎖定 ---
        let mut locks = state.file_locks.lock().unwrap();
        let is_read_only = if let Some(owner) = locks.get(&path) {
            owner != window.label()
        } else {
            locks.insert(path.clone(), window.label().to_string());
            false
        };

        // --- 檢查實體備份 ---
        let mut backup_xml = None;
        if !is_read_only {
            let parent = path.parent().unwrap();
            let bak_path = parent.join(format!(".{}.bak", filename));
            if bak_path.exists() {
                if let Ok(b_xml) = fs::read_to_string(&bak_path) {
                    if b_xml.trim() != xml.trim() {
                        backup_xml = Some(b_xml);
                    }
                }
            }
        }

        {
            let mut paths = state.current_paths.lock().unwrap();
            paths.insert(window.label().to_string(), path);
        }

        Ok(OpenFileResult {
            xml,
            filename,
            platform: platform.into(),
            backup_xml,
            is_read_only
        })
    } else {
        Err("Canceled".into())
    }
}

#[tauri::command]
pub async fn open_examples(window: Window, handle: AppHandle, state: State<'_, AppState>) -> Result<OpenFileResult, String> {
    // 預設指向 examples 目錄
    let examples_dir = get_examples_path(&handle);
    
    let file_path = handle.dialog().file()
        .add_filter("Cocoya XML", &["xml"])
        .set_directory(&examples_dir)
        .blocking_pick_file();

    if let Some(p) = file_path {
        let path = p.into_path().map_err(|_| "Failed to parse path".to_string())?;
        let xml = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let filename = path.file_name().unwrap().to_str().unwrap().to_string();
        
        let platform = if xml.contains("platform=\"MicroPython\"") { "MicroPython" } else { "PC" };

        // 註冊路徑到 current_paths
        {
            let mut paths = state.current_paths.lock().unwrap();
            paths.insert(window.label().to_string(), path.clone());
        }

        Ok(OpenFileResult {
            xml,
            filename,
            platform: platform.into(),
            backup_xml: None,
            is_read_only: false
        })
    } else {
        Err("Canceled".into())
    }
}

#[tauri::command]
pub async fn save_file(window: Window, handle: AppHandle, state: State<'_, AppState>, xml: String, save_as: bool) -> Result<String, String> {
    let mut path_to_save = {
        let paths = state.current_paths.lock().unwrap();
        if save_as { None } else { paths.get(window.label()).cloned() }
    };

    if path_to_save.is_none() {
        let picked = handle.dialog().file()
            .add_filter("Cocoya XML", &["xml"])
            .set_file_name("project.xml")
            .blocking_save_file();
        
        if let Some(p) = picked {
            let path = p.into_path().map_err(|_| "Failed to parse save path".to_string())?;
            path_to_save = Some(path);
        } else {
            return Err("Canceled".into());
        }
    }

    if let Some(path) = path_to_save {
        // --- 檢查是否為 examples 目錄 ---
        let examples_dir = get_examples_path(&handle);
        if path.starts_with(&examples_dir) {
            return Err("EXAMPLES_PATH".to_string());
        }

        {
            let mut locks = state.file_locks.lock().unwrap();
            if let Some(owner) = locks.get(&path) {
                if owner != window.label() {
                    return Err("檔案已被其他視窗開啟，無法存回原檔，請使用另存新檔。".to_string());
                }
            } else {
                locks.insert(path.clone(), window.label().to_string());
            }
        }

        let bak_path = path.parent().unwrap().join(format!(".{}.bak", path.file_name().unwrap().to_str().unwrap()));
        
        fs::write(&path, &xml).map_err(|e| e.to_string())?;
        let filename = path.file_name().unwrap().to_str().unwrap().to_string();
        
        {
            let mut paths = state.current_paths.lock().unwrap();
            paths.insert(window.label().to_string(), path);
        }

        if bak_path.exists() { let _ = fs::remove_file(bak_path); }
        let temp_dir = std::env::temp_dir().join("cocoya_tauri");
        let untitled_bak = temp_dir.join(format!("untitled_backup_{}.xml", window.label()));
        if untitled_bak.exists() { let _ = fs::remove_file(untitled_bak); }
        
        Ok(filename)
    } else {
        Err("No path".into())
    }
}

#[tauri::command]
pub fn auto_backup(window: Window, state: State<'_, AppState>, xml: String) -> Result<(), String> {
    let backup_path = {
        let paths = state.current_paths.lock().unwrap();
        if let Some(path) = paths.get(window.label()) {
            let dir = path.parent().unwrap();
            let name = path.file_name().unwrap().to_str().unwrap();
            dir.join(format!(".{}.bak", name))
        } else {
            let temp_dir = std::env::temp_dir().join("cocoya_tauri");
            if !temp_dir.exists() { fs::create_dir_all(&temp_dir).ok(); }
            temp_dir.join(format!("untitled_backup_{}.xml", window.label()))
        }
    };
    fs::write(backup_path, xml).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn check_startup_backup(_window: Window, handle: AppHandle) -> Option<String> {
    let temp_dir = std::env::temp_dir().join("cocoya_tauri");
    if !temp_dir.exists() { return None; }

    let active_labels: Vec<String> = handle.webview_windows().keys().cloned().collect();
    
    if let Ok(entries) = fs::read_dir(&temp_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            
            if filename.starts_with("untitled_backup") && filename.ends_with(".xml") {
                let mut should_recover = false;
                if filename == "untitled_backup.xml" {
                    should_recover = true;
                } else if let Some(label_part) = filename.strip_prefix("untitled_backup_") {
                    if let Some(label) = label_part.strip_suffix(".xml") {
                        if !active_labels.contains(&label.to_string()) {
                            should_recover = true;
                        }
                    }
                }
                
                if should_recover {
                    if let Ok(xml) = fs::read_to_string(&path) {
                        let new_path = path.with_extension("xml.recovering");
                        if let Ok(_) = fs::rename(&path, &new_path) {
                            return Some(xml);
                        }
                    }
                }
            }
        }
    }
    None
}

#[tauri::command]
pub fn clear_backup(window: Window, state: State<'_, AppState>) -> Result<(), String> {
    let paths = state.current_paths.lock().unwrap();
    if let Some(path) = paths.get(window.label()) {
        let bak_path = path.parent().unwrap().join(format!(".{}.bak", path.file_name().unwrap().to_str().unwrap()));
        if bak_path.exists() { let _ = fs::remove_file(bak_path); }
    }
    
    let temp_dir = std::env::temp_dir().join("cocoya_tauri");
    let untitled_bak = temp_dir.join(format!("untitled_backup_{}.xml", window.label()));
    if untitled_bak.exists() { let _ = fs::remove_file(&untitled_bak); }
    
    let recovering = untitled_bak.with_extension("xml.recovering");
    if recovering.exists() { let _ = fs::remove_file(recovering); }

    let legacy = temp_dir.join("untitled_backup.xml");
    if legacy.exists() { let _ = fs::remove_file(&legacy); }
    let legacy_recovering = legacy.with_extension("xml.recovering");
    if legacy_recovering.exists() { let _ = fs::remove_file(legacy_recovering); }
    
    Ok(())
}

#[tauri::command]
pub fn reject_recovery(window: Window, state: State<'_, AppState>) -> Result<(), String> {
    let temp_dir = std::env::temp_dir().join("cocoya_tauri");
    let backup_paths = vec![
        {
            let paths = state.current_paths.lock().unwrap();
            paths.get(window.label()).map(|path| {
                path.parent().unwrap().join(format!(".{}.bak", path.file_name().unwrap().to_str().unwrap()))
            })
        },
        Some(temp_dir.join(format!("untitled_backup_{}.xml", window.label()))),
        Some(temp_dir.join(format!("untitled_backup_{}.xml.recovering", window.label()))),
        Some(temp_dir.join("untitled_backup.xml")),
        Some(temp_dir.join("untitled_backup.xml.recovering")),
    ];

    for p_opt in backup_paths {
        if let Some(p) = p_opt {
            if p.exists() {
                let timestamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
                let archive_path = format!("{}.old_{}", p.to_str().unwrap(), timestamp);
                let _ = fs::rename(p, archive_path);
            }
        }
    }
    Ok(())
}
