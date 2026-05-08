pub mod state;
pub mod utils;
pub mod commands;

use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tauri::{Emitter, Manager, State};
use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            python_processes: Arc::new(Mutex::new(HashMap::new())),
            current_paths: Arc::new(Mutex::new(HashMap::new())),
            file_locks: Arc::new(Mutex::new(HashMap::new())),
            dirty_states: Arc::new(Mutex::new(HashMap::new())),
        })
        .invoke_handler(tauri::generate_handler![
            commands::run_python, 
            commands::stop_python,
            commands::get_manifest,
            commands::get_module_toolbox,
            commands::open_file,
            commands::save_file,
            commands::get_serial_ports,
            commands::deploy_mcu,
            commands::open_serial_monitor,
            commands::setup_stable_mode,
            commands::erase_filesystem,
            commands::auto_backup,
            commands::clear_backup,
            commands::reject_recovery,
            commands::reset_firmware,
            commands::create_window,
            commands::set_window_title,
            commands::pick_python_path,
            commands::get_version,
            commands::check_environment,
            commands::set_dirty,
            commands::close_window,
            commands::check_startup_backup
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state: State<AppState> = window.state();
                let label = window.label().to_string();
                
                let is_dirty = {
                    let dirty_states = state.dirty_states.lock().unwrap();
                    *dirty_states.get(&label).unwrap_or(&false)
                };

                if is_dirty {
                    api.prevent_close();
                    let _ = window.emit_to(&label, "closeRequested", ());
                } else {
                    {
                        let mut locks = state.file_locks.lock().unwrap();
                        locks.retain(|_, owner| owner != &label);
                    }
                    {
                        let mut paths = state.current_paths.lock().unwrap();
                        paths.remove(&label);
                        let mut dirty_states = state.dirty_states.lock().unwrap();
                        dirty_states.remove(&label);
                    }
                    {
                        let mut procs = state.python_processes.lock().unwrap();
                        if let Some(mut child) = procs.remove(&label) {
                            let _: std::process::Child = child;
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
