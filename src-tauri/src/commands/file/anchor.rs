// P2-5（2026-10-03）自 file.rs 拆分。專案錨定狀態（ProjectAnchor）與 session 釋放
//! 純搬移：對外 API 與行為完全不變。


use tauri::{State, Window};
use crate::state::AppState;


/// 專案根錨定狀態（供前端 Startup Home / Dataset Manager 查詢）
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectAnchor {
    pub is_anchored: bool,
    pub project_root: Option<String>,
}

#[tauri::command]
pub fn get_project_anchor(window: Window, state: State<'_, AppState>) -> ProjectAnchor {
    let paths = state.current_paths.lock().unwrap();
    let project_root = paths.get(window.label()).map(|p| {
        p.parent()
            .map(|x| x.to_string_lossy().to_string())
            .unwrap_or_else(|| p.to_string_lossy().to_string())
    });
    ProjectAnchor {
        is_anchored: project_root.is_some(),
        project_root,
    }
}
