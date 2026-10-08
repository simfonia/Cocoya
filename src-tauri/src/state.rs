use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::collections::HashMap;
use std::process::Child;
use std::path::PathBuf;
use serde::Serialize;

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
    pub generation: u64,
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SerialMonitorSource {
    Dedicated,
    Deploy,
}

#[derive(Clone)]
struct SerialMonitorActivity {
    generation: u64,
    port: String,
    connected: bool,
    revision: u64,
    source: SerialMonitorSource,
}

#[derive(Clone)]
struct SerialMonitorProcess {
    generation: u64,
    port: String,
}

#[derive(Default)]
struct SerialMonitorRegistryData {
    activities: HashMap<String, SerialMonitorActivity>,
    processes: HashMap<String, SerialMonitorProcess>,
}

/// Authoritative per-window monitor/deploy state. Generations prevent delayed reader
/// callbacks from an old child process from changing the replacement process state.
pub struct SerialMonitorRegistry {
    next_generation: AtomicU64,
    data: std::sync::Mutex<SerialMonitorRegistryData>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SerialMonitorSnapshot {
    pub active: bool,
    pub connected: bool,
    pub port: Option<String>,
    pub generation: u64,
    pub revision: u64,
}

impl Default for SerialMonitorRegistry {
    fn default() -> Self {
        Self {
            next_generation: AtomicU64::new(1),
            data: std::sync::Mutex::new(SerialMonitorRegistryData::default()),
        }
    }
}

impl SerialMonitorRegistry {
    pub fn next_generation(&self) -> u64 {
        self.next_generation.fetch_add(1, Ordering::Relaxed)
    }

    /// Reserve the generation for a deploy child before its output reader starts.
    pub fn register_deploy(&self, label: &str, port: String, generation: u64) {
        let mut data = self.data.lock().unwrap();
        data.processes.insert(label.to_string(), SerialMonitorProcess { generation, port });
        data.activities.remove(label);
    }

    pub fn register_dedicated_process(&self, label: &str, port: String, generation: u64) {
        let mut data = self.data.lock().unwrap();
        data.processes.insert(label.to_string(), SerialMonitorProcess { generation, port });
    }

    pub fn deploy_generation(&self, label: &str) -> Option<u64> {
        self.data.lock().unwrap().processes.get(label).map(|p| p.generation)
    }

    pub fn start_dedicated(&self, label: &str, port: String, generation: u64) -> Option<SerialMonitorSnapshot> {
        let mut data = self.data.lock().unwrap();
        if let Some(activity) = data.activities.get(label) {
            if activity.generation == generation {
                return None;
            }
        }
        let activity = SerialMonitorActivity {
            generation,
            port,
            connected: false,
            revision: 1,
            source: SerialMonitorSource::Dedicated,
        };
        let snapshot = Self::snapshot_for(&activity);
        data.activities.insert(label.to_string(), activity);
        Some(snapshot)
    }

    pub fn start_deploy_monitor(&self, label: &str, generation: u64) -> Option<SerialMonitorSnapshot> {
        let mut data = self.data.lock().unwrap();
        let process = data.processes.get(label)?;
        if process.generation != generation {
            return None;
        }
        let activity = SerialMonitorActivity {
            generation,
            port: process.port.clone(),
            connected: false,
            revision: 1,
            source: SerialMonitorSource::Deploy,
        };
        let snapshot = Self::snapshot_for(&activity);
        data.activities.insert(label.to_string(), activity);
        Some(snapshot)
    }

    pub fn set_connected(&self, label: &str, generation: u64, connected: bool) -> Option<SerialMonitorSnapshot> {
        let mut data = self.data.lock().unwrap();
        let activity = data.activities.get_mut(label)?;
        if activity.generation != generation || activity.connected == connected {
            return None;
        }
        activity.connected = connected;
        activity.revision += 1;
        Some(Self::snapshot_for(activity))
    }

    /// Finish only the matching generation. A late EOF from an old process is a no-op.
    pub fn finish(&self, label: &str, generation: u64) -> Option<SerialMonitorSnapshot> {
        let mut data = self.data.lock().unwrap();
        if data.processes.get(label).map(|p| p.generation) == Some(generation) {
            data.processes.remove(label);
        }
        let activity = data.activities.get(label)?;
        if activity.generation != generation {
            return None;
        }
        let inactive = SerialMonitorSnapshot {
            active: false,
            connected: false,
            port: Some(activity.port.clone()),
            generation,
            revision: activity.revision + 1,
        };
        data.activities.remove(label);
        Some(inactive)
    }

    /// Invalidate any active or pending operation for a window, typically on stop/close.
    pub fn finish_current(&self, label: &str) -> Option<SerialMonitorSnapshot> {
        let generation = {
            let data = self.data.lock().unwrap();
            data.activities.get(label).map(|a| a.generation)
                .or_else(|| data.processes.get(label).map(|p| p.generation))
        }?;
        self.finish(label, generation)
    }

    /// Preserve the user's monitor intent across focus handoff while invalidating
    /// callbacks from the process being stopped.
    pub fn suspend(&self, label: &str, generation: u64) -> Option<SerialMonitorSnapshot> {
        let mut data = self.data.lock().unwrap();
        if data.activities.get(label)?.generation != generation {
            return None;
        }
        data.processes.remove(label);
        let activity = data.activities.get_mut(label)?;
        activity.generation = self.next_generation();
        activity.connected = false;
        activity.revision += 1;
        Some(Self::snapshot_for(activity))
    }

    pub fn current_source(&self, label: &str) -> Option<(u64, SerialMonitorSource)> {
        self.data.lock().unwrap().activities.get(label)
            .map(|a| (a.generation, a.source))
    }

    pub fn snapshot(&self, label: &str) -> SerialMonitorSnapshot {
        let data = self.data.lock().unwrap();
        if let Some(activity) = data.activities.get(label) {
            return Self::snapshot_for(activity);
        }
        if let Some(process) = data.processes.get(label) {
            return SerialMonitorSnapshot {
                active: false,
                connected: false,
                port: Some(process.port.clone()),
                generation: process.generation,
                revision: 0,
            };
        }
        SerialMonitorSnapshot {
            active: false,
            connected: false,
            port: None,
            generation: 0,
            revision: 0,
        }
    }

    pub fn has_deploy_process(&self, label: &str) -> bool {
        self.data.lock().unwrap().processes.contains_key(label)
    }

    fn snapshot_for(activity: &SerialMonitorActivity) -> SerialMonitorSnapshot {
        SerialMonitorSnapshot {
            active: true,
            connected: activity.connected,
            port: Some(activity.port.clone()),
            generation: activity.generation,
            revision: activity.revision,
        }
    }
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
    pub serial_monitor_registry: Arc<SerialMonitorRegistry>, // Window label -> generation-scoped deploy/monitor state
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

#[cfg(test)]
mod serial_monitor_registry_tests {
    use super::{SerialMonitorRegistry, SerialMonitorSource};

    #[test]
    fn deploy_monitor_state_transitions_and_snapshot_use_camel_case() {
        let registry = SerialMonitorRegistry::default();
        let generation = registry.next_generation();
        registry.register_deploy("editor-a", "COM7".to_string(), generation);

        let pending = registry.snapshot("editor-a");
        assert!(!pending.active);
        assert!(!pending.connected);
        assert_eq!(pending.port.as_deref(), Some("COM7"));

        let started = registry.start_deploy_monitor("editor-a", generation).unwrap();
        assert!(started.active);
        assert!(!started.connected);
        assert_eq!(started.revision, 1);

        let connected = registry.set_connected("editor-a", generation, true).unwrap();
        assert!(connected.active);
        assert!(connected.connected);
        assert_eq!(connected.revision, 2);

        let serialized = serde_json::to_value(&connected).unwrap();
        assert_eq!(serialized["connected"], true);
        assert_eq!(serialized["generation"], generation);
        assert!(serialized.get("is_connected").is_none());

        let stopped = registry.finish("editor-a", generation).unwrap();
        assert!(!stopped.active);
        assert!(!stopped.connected);
        assert_eq!(stopped.revision, 3);
        assert!(registry.finish("editor-a", generation).is_none());
    }

    #[test]
    fn stale_generation_cannot_start_update_or_finish_replacement() {
        let registry = SerialMonitorRegistry::default();
        let old_generation = registry.next_generation();
        let new_generation = registry.next_generation();
        registry.register_deploy("editor-b", "COM8".to_string(), new_generation);

        assert!(registry.start_deploy_monitor("editor-b", old_generation).is_none());
        assert!(registry.start_deploy_monitor("editor-b", new_generation).is_some());
        assert!(registry.set_connected("editor-b", old_generation, true).is_none());
        assert!(registry.finish("editor-b", old_generation).is_none());

        let current = registry.snapshot("editor-b");
        assert!(current.active);
        assert!(!current.connected);
        assert_eq!(current.generation, new_generation);
        assert_eq!(registry.current_source("editor-b").unwrap().1, SerialMonitorSource::Deploy);
    }

    #[test]
    fn suspend_preserves_monitor_intent_but_invalidates_old_process_callbacks() {
        let registry = SerialMonitorRegistry::default();
        let generation = registry.next_generation();
        registry.register_dedicated_process("editor-c", "COM9".to_string(), generation);
        let started = registry.start_dedicated("editor-c", "COM9".to_string(), generation).unwrap();
        assert!(started.active);
        registry.set_connected("editor-c", generation, true).unwrap();

        let suspended = registry.suspend("editor-c", generation).unwrap();
        assert!(suspended.active);
        assert!(!suspended.connected);
        assert!(suspended.generation > generation);
        assert!(registry.finish("editor-c", generation).is_none());

        let current = registry.snapshot("editor-c");
        assert!(current.active);
        assert!(!current.connected);
        assert_eq!(current.generation, suspended.generation);
    }
}
