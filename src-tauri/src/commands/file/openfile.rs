// P2-5（2026-10-03）自 file.rs 拆分。開檔（open_file / open_examples）：空積木防護與唯讀保護
//! 純搬移：對外 API 與行為完全不變。


use std::fs;
use tauri::{AppHandle, State, Window, Manager};
use tauri_plugin_dialog::DialogExt;
use crate::state::AppState;
use crate::utils::{get_examples_path, get_examples_seed_dir, copy_dir_overwrite};
use super::manifest::OpenFileResult;
use super::examples::resolve_example_open_path;


#[tauri::command]
pub async fn open_file(window: Window, handle: AppHandle, state: State<'_, AppState>) -> Result<OpenFileResult, String> {
    let file_path = handle.dialog().file()
        .add_filter("Cocoya XML", &["xml"])
        .set_parent(&window)
        .blocking_pick_file();

    if let Some(p) = file_path {
        let mut path = p.into_path().map_err(|_| "Failed to parse path".to_string())?;
        // --- 內建範例唯讀保護（Release）：可能重導向到使用者工作區複本 ---
        path = resolve_example_open_path(&window, &handle, path)?;
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
        .set_parent(&window)
        .blocking_pick_file();

    if let Some(p) = file_path {
        let mut path = p.into_path().map_err(|_| "Failed to parse path".to_string())?;
        // --- 內建範例唯讀保護（Release）：可能重導向到使用者工作區複本 ---
        path = resolve_example_open_path(&window, &handle, path)?;
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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreExamplesResult {
    /// 實際覆寫/寫回的檔案數
    pub restored_count: u64,
    /// 還原後 examples 的實際位置（AppData 播種目錄）
    pub examples_path: String
}

/// 還原內建範例：把 Resource 內的原始 examples 強制覆寫回 AppData 播種目錄。
///
/// 與 `ensure_examples_seeded` 的差異（不可混用）：
///   - 啟動播種：**只補缺檔**（copy_dir_merge），保護使用者自行加入的檔案
///   - 使用者主動還原：**強制覆寫**（copy_dir_overwrite），把被改壞的檔案救回來
///
/// Dev 模式（is_dev_examples_dir）直接回 0：此時 examples 就是 repo 原始檔，
/// 本來就沒有「被搞壞的副本」可還原。
#[tauri::command]
pub fn restore_examples(handle: AppHandle) -> Result<RestoreExamplesResult, String> {
    if crate::utils::is_dev_examples_dir() {
        return Ok(RestoreExamplesResult {
            restored_count: 0,
            examples_path: get_examples_path(&handle).to_string_lossy().to_string(),
        });
    }

    let src = handle
        .path()
        .resolve("examples", tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("無法解析範例資源目錄: {}", e))?;
    if !src.exists() {
        return Err(format!("找不到內建範例資源目錄: {}", src.display()));
    }
    let src = crate::utils::strip_extended_prefix_public(src);

    let dst = get_examples_seed_dir(&handle);
    let count = copy_dir_overwrite(&src, &dst)?;

    Ok(RestoreExamplesResult {
        restored_count: count,
        examples_path: dst.to_string_lossy().to_string(),
    })
}
