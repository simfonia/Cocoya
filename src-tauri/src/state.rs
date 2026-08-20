use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::process::Child;
use std::path::PathBuf;

/// Sidecar process wrapper that holds stdin handle and child process
pub struct SidecarProcess {
    pub child: Child,
    pub stdin: Option<std::process::ChildStdin>,
}

unsafe impl Send for SidecarProcess {}
unsafe impl Sync for SidecarProcess {}

/// 串列埠監控 session（一視窗一筆）。`child` 為 deploy_mcu.py --monitor-only 進程。
/// 視窗失焦時自動釋放（kill + 移除），重新聚焦時依 `AppState.serial_wants` 自動重取。
pub struct SerialMonitorSession {
    pub port: String,
    pub python_path: String,
    pub lang: String,
    pub child: Child,
}

unsafe impl Send for SerialMonitorSession {}
unsafe impl Sync for SerialMonitorSession {}

/// 視窗「想要」監控的串列埠設定（跨失焦持續保留，供重新聚焦後自動重開）。
pub struct SerialMonitorWant {
    pub port: String,
    pub python_path: String,
    pub lang: String,
}

pub struct AppState {
    pub python_processes: Arc<Mutex<HashMap<String, Child>>>,
    pub current_paths: Arc<Mutex<HashMap<String, PathBuf>>>,
    pub file_locks: Arc<Mutex<HashMap<PathBuf, String>>>, // Path -> Window Label
    pub dirty_states: Arc<Mutex<HashMap<String, bool>>>, // Window Label -> isDirty
    pub sidecar_processes: Arc<Mutex<HashMap<String, SidecarProcess>>>, // Window Label -> sidecar
    pub sidecar_responses: Arc<Mutex<HashMap<String, String>>>, // requestId -> raw response line
    pub serial_monitors: Arc<Mutex<HashMap<String, SerialMonitorSession>>>, // Window Label -> 啟用中的監控 session
    pub serial_wants: Arc<Mutex<HashMap<String, SerialMonitorWant>>>, // Window Label -> 重設焦點時該視窗想重開的監控埠
}
