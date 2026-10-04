use std::sync::{Arc, Mutex};
use std::sync::atomic::AtomicBool;
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
    pub stopped: Arc<AtomicBool>,
}

unsafe impl Send for SerialMonitorSession {}
unsafe impl Sync for SerialMonitorSession {}

/// 視窗「想要」監控的串列埠設定（跨失焦持續保留，供重新聚焦後自動重開）。
pub struct SerialMonitorWant {
    pub port: String,
    pub python_path: String,
    pub lang: String,
    pub raw_dump_enabled: bool,
}

pub struct AppState {
    pub python_processes: Arc<Mutex<HashMap<String, Child>>>,
    /// Window Label -> 進行中的 pip 安裝子進程。
    /// 必須獨立於 `python_processes`：pip 安裝不應走 `run_python`（其開頭會 `stop_python`，
    /// 會誤殺使用者正在執行的程式並誤釋放該視窗的串列埠監看）。
    pub install_processes: Arc<Mutex<HashMap<String, Child>>>,
    pub current_paths: Arc<Mutex<HashMap<String, PathBuf>>>,
    pub file_locks: Arc<Mutex<HashMap<PathBuf, String>>>, // Path -> Window Label
    pub dirty_states: Arc<Mutex<HashMap<String, bool>>>, // Window Label -> isDirty
    pub sidecar_processes: Arc<Mutex<HashMap<String, SidecarProcess>>>, // Window Label -> sidecar
    pub sidecar_responses: Arc<Mutex<HashMap<String, String>>>, // requestId -> raw response line
    pub serial_monitors: Arc<Mutex<HashMap<String, SerialMonitorSession>>>, // Window Label -> 啟用中的監控 session
    pub serial_wants: Arc<Mutex<HashMap<String, SerialMonitorWant>>>, // Window Label -> 重設焦點時該視窗想重開的監控埠
}

/// 釋放指定視窗持有的**所有**檔案鎖（不動其他視窗的）。
///
/// 【為何需要這個函式 —— 2026-10-03 實測缺陷】
/// `file_locks` 原本只在兩處被釋放：關窗（`lib.rs` CloseRequested）與回首頁（`release_session`）。
/// 但**開新檔不會釋放舊檔的鎖**。實測症狀：
///   視窗1 開 A → 視窗1 開 B → 新視窗開 A  →  被判定唯讀 ❌
/// 原因是此時 `file_locks[A]` 仍指向視窗1，但視窗1 早已不持有 A —— 鎖洩漏（stale lock）。
/// 連續開檔還會**無限累積**鎖，直到關窗或重啟 App 才清除。
///
/// 【呼叫時機】視窗將持有「不同於目前錨定路徑」的檔案時，即：
///   - `open_file`   開啟某檔（可能換檔）
///   - `open_examples` 開啟範例（切換工作副本）
///   - `save_file`   另存到不同路徑（開新專案流程即走此路徑）
///
/// 【為何是「全釋放」而非「釋放單一路徑」】
/// 一個視窗在任一時間只開啟一個檔案，故持有最多一把鎖。
/// 全釋放語意等價且更不易漏（未來若支援分頁開檔，此處需改為精確釋放）。
///
/// 【回傳】實際釋放的鎖數，供呼叫端除錯／日誌使用。
pub fn release_file_locks_for(state: &AppState, label: &str) -> usize {
    let mut locks = state.file_locks.lock().unwrap();
    let before = locks.len();
    locks.retain(|_, owner| owner != label);
    before - locks.len()
}
