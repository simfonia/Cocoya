use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::process::Child;
use std::path::PathBuf;

pub struct AppState {
    pub python_processes: Arc<Mutex<HashMap<String, Child>>>,
    pub current_paths: Arc<Mutex<HashMap<String, PathBuf>>>,
    pub file_locks: Arc<Mutex<HashMap<PathBuf, String>>>, // Path -> Window Label
    pub dirty_states: Arc<Mutex<HashMap<String, bool>>>, // Window Label -> isDirty
}
