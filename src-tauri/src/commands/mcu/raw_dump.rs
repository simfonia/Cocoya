// P2-5（2026-10-03）自 mcu.rs 拆分。序列埠 Raw Dump 路徑解析与环境變數注入 
//! 對外 API（#[tauri::command] 與 pub 函式）維持不變，由 mod.rs 以 pub use 重新導出。


use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::State;
use crate::state::AppState;


/// 由目前錨定的 XML 檔案推導 Raw Dump 路徑：`<ProjectRoot>/raw_dump.log`。
/// 關閉時回傳 None；開啟但未錨定時拒絕啟動，不猜測或回退到安裝目錄。
pub(crate) fn raw_dump_path_for_project(
    project_file: Option<&Path>,
    enabled: bool,
) -> Result<Option<PathBuf>, String> {
    if !enabled {
        return Ok(None);
    }
    let project_file = project_file.ok_or_else(|| {
        "PROJECT_ROOT_REQUIRED: 請先開啟並儲存 XML 專案，再啟用 MCU 序列埠 Raw Dump".to_string()
    })?;
    let project_root = project_file.parent().ok_or_else(|| {
        format!("PROJECT_ROOT_REQUIRED: 無法由專案檔案推導 ProjectRoot: {}", project_file.display())
    })?;
    Ok(Some(project_root.join("raw_dump.log")))
}

pub(crate) fn resolve_serial_raw_dump_path(
    state: &State<'_, AppState>,
    window_label: &str,
    enabled: bool,
) -> Result<Option<PathBuf>, String> {
    let project_file = {
        let paths = state.current_paths.lock().unwrap();
        paths.get(window_label).cloned()
    };
    raw_dump_path_for_project(project_file.as_deref(), enabled)
}

pub(crate) fn configure_serial_raw_dump(
    cmd: &mut Command,
    state: &State<'_, AppState>,
    window_label: &str,
    enabled: bool,
) -> Result<(), String> {
    match resolve_serial_raw_dump_path(state, window_label, enabled)? {
        Some(path) => {
            cmd.env("COCOYA_SERIAL_RAW_DUMP", "1");
            cmd.env("COCOYA_SERIAL_RAW_DUMP_PATH", path);
        }
        None => {
            // UI 關閉必須是權威狀態，不可意外繼承 shell/父程序既有的診斷旗標。
            cmd.env("COCOYA_SERIAL_RAW_DUMP", "0");
            cmd.env_remove("COCOYA_SERIAL_RAW_DUMP_PATH");
        }
    }
    Ok(())
}

#[cfg(test)]
mod raw_dump_tests {
    use super::raw_dump_path_for_project;
    use std::path::Path;

    #[test]
    fn raw_dump_path_is_project_root_file() {
        let path = raw_dump_path_for_project(Some(Path::new("C:/robot/line.xml")), true)
            .expect("anchored project should resolve");
        assert_eq!(path, Some("C:/robot/raw_dump.log".into()));
    }

    #[test]
    fn raw_dump_requires_anchor_only_when_enabled() {
        assert_eq!(raw_dump_path_for_project(None, false), Ok(None));
        let error = raw_dump_path_for_project(None, true).expect_err("unanchored project must fail");
        assert!(error.starts_with("PROJECT_ROOT_REQUIRED:"));
    }
}
