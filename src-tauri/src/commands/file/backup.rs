// P2-5（2026-10-03）自 file.rs 拆分。自動備份 / 啟動恢復 / 清除備份 / 拒絕恢復 / 刪檔
//! 純搬移：對外 API 與行為完全不變。


use std::fs;
use tauri::{AppHandle, State, Window, Manager};
use crate::state::AppState;


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

/// 刪除單一檔案（供 datasetDeleteImage 使用）
/// 檔案不存在 → Err("FILE_NOT_FOUND: ...")（前端據此仍移除縮圖但提示，非靜默成功）
#[tauri::command]
pub fn delete_file(path: String) -> Result<(), String> {
    if fs::metadata(&path).is_err() {
        return Err("FILE_NOT_FOUND: image file does not exist on disk".into());
    }
    fs::remove_file(&path).map_err(|e| format!("Failed to delete file: {}", e))
}
