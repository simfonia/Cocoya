use std::fs;
use std::path::Path;
use serde::Serialize;
use tauri::{State, Window};
use crate::state::AppState;

/// 訓練報告資訊（回傳給前端）
#[derive(Serialize)]
pub struct ReportInfo {
    pub path: String,
    pub project_name: String,
    pub mtime_millis: u128,
}

/// 用系統預設瀏覽器開啟 HTML 訓練報告
/// 支援相對路徑：若 report_path 為相對路徑，從當前視窗的專案目錄解析
#[tauri::command]
pub async fn open_report(
    window: Window,
    state: State<'_, AppState>,
    report_path: String,
) -> Result<(), String> {
    let path = Path::new(&report_path);

    // 若為相對路徑，從當前視窗的專案目錄解析
    let resolved_path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        let current_path = {
            let paths = state.current_paths.lock().unwrap();
            paths.get(window.label()).cloned()
        };

        match current_path {
            Some(ref p) => {
                match p.parent() {
                    Some(parent) => parent.join(&report_path),
                    None => path.to_path_buf(),
                }
            }
            None => {
                // fallback: 從當前工作目錄解析
                let mut dev = std::env::current_dir().map_err(|e| e.to_string())?;
                if dev.ends_with("src-tauri") { dev.pop(); }
                dev.join(&report_path)
            }
        }
    };

    if !resolved_path.exists() {
        return Err(format!("找不到訓練報告檔案: {}", resolved_path.display()));
    }

    open::that(&resolved_path).map_err(|e| format!("開啟失敗: {}", e))?;
    Ok(())
}

/// 搜尋當前專案 model 目錄下的訓練報告
#[tauri::command]
pub fn find_latest_training_report(
    window: Window,
    state: State<'_, AppState>,
) -> Result<Vec<ReportInfo>, String> {
    // 取得當前視窗的檔案路徑
    let current_path = {
        let paths = state.current_paths.lock().unwrap();
        paths.get(window.label()).cloned()
    };

    let base_dir = match current_path {
        Some(ref p) => {
            match p.parent() {
                Some(parent) => parent.to_path_buf(),
                None => return Ok(Vec::new()),
            }
        }
        None => {
            // 未開啟檔案，回傳空陣列
            return Ok(Vec::new());
        }
    };

    let model_dir = base_dir.join("model");
    if !model_dir.exists() {
        return Ok(Vec::new());
    }

    let mut reports: Vec<ReportInfo> = Vec::new();
    walk_reports(&model_dir, &mut reports)?;

    // 根據修改時間排序（最新的在前）
    reports.sort_by(|a, b| b.mtime_millis.cmp(&a.mtime_millis));

    Ok(reports)
}

/// 遞迴搜尋 *_training_report.html 檔案
fn walk_reports(dir: &Path, reports: &mut Vec<ReportInfo>) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("讀取目錄失敗: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("讀取項目失敗: {}", e))?;
        let path = entry.path();

        if path.is_dir() {
            walk_reports(&path, reports)?;
        } else if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.ends_with("_training_report.html") {
                let metadata = fs::metadata(&path)
                    .map_err(|e| format!("讀取檔案資訊失敗: {}", e))?;
                let mtime = metadata.modified()
                    .map_err(|e| format!("讀取修改時間失敗: {}", e))?;
                let mtime_millis = mtime
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis())
                    .unwrap_or(0);

                let project_name = path
                    .parent()
                    .and_then(|p| p.file_name())
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
                    .to_string();

                reports.push(ReportInfo {
                    path: path.to_string_lossy().to_string(),
                    project_name,
                    mtime_millis,
                });
            }
        }
    }

    Ok(())
}