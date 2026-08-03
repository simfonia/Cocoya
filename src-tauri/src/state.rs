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

pub struct AppState {
    pub python_processes: Arc<Mutex<HashMap<String, Child>>>,
    pub current_paths: Arc<Mutex<HashMap<String, PathBuf>>>,
    pub file_locks: Arc<Mutex<HashMap<PathBuf, String>>>, // Path -> Window Label
    pub dirty_states: Arc<Mutex<HashMap<String, bool>>>, // Window Label -> isDirty
    pub sidecar_processes: Arc<Mutex<HashMap<String, SidecarProcess>>>, // Window Label -> sidecar
    pub sidecar_responses: Arc<Mutex<HashMap<String, String>>>, // requestId -> raw response line
}
