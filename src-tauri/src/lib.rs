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
            install_processes: Arc::new(Mutex::new(HashMap::new())),
            current_paths: Arc::new(Mutex::new(HashMap::new())),
            file_locks: Arc::new(Mutex::new(HashMap::new())),
            dirty_states: Arc::new(Mutex::new(HashMap::new())),
            sidecar_processes: Arc::new(Mutex::new(HashMap::new())),
            sidecar_responses: Arc::new(Mutex::new(HashMap::new())),
            serial_monitors: Arc::new(Mutex::new(HashMap::new())),
            serial_wants: Arc::new(Mutex::new(HashMap::new())),
        })
        .invoke_handler(tauri::generate_handler![
            commands::run_python, 
            commands::stop_python,
            commands::get_manifest,
            commands::get_module_toolbox,
            commands::open_file,
            commands::open_examples,
            commands::save_file,
            commands::get_serial_ports,
            commands::deploy_mcu,
            commands::open_serial_monitor,
            commands::toggle_serial_monitor,
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
            commands::install_python_module,
            commands::abort_install_module,
            commands::set_dirty,
            commands::close_window,
            commands::check_startup_backup,
            commands::start_sidecar,
            commands::sidecar_send,
            commands::stop_sidecar,
            commands::dataset_upload_chunk,
            commands::delete_file,
            commands::pick_folder,
            commands::pick_data_file,
            commands::export_dataset,
            commands::open_report,
            commands::find_latest_training_report,
            commands::get_project_anchor,
            commands::dataset_save_progress,
            commands::dataset_load_progress,
            commands::dataset_import_from_folder,
            commands::open_folder,
            commands::open_help,
            commands::set_window_focus
        ])
        .setup(|app| {
            // 序列埠熱插拔輪詢（全程序單一共用執行緒，多視窗共享一份 diff 快照）：
            // 只列舉不開埠；有變化才逐一 emit_to 各視窗 serial-ports-changed（廣播全域事實，非視窗專屬資料）
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut last: Vec<String> = Vec::new();
                loop {
                    std::thread::sleep(std::time::Duration::from_millis(1500));
                    let ports = commands::mcu::list_serial_ports();
                    let sig: Vec<String> = ports
                        .iter()
                        .map(|p| format!(
                            "{}|{}|{}|{}",
                            p.port,
                            p.vid.clone().unwrap_or_default(),
                            p.pid.clone().unwrap_or_default(),
                            p.board_id
                        ))
                        .collect();
                    if sig != last {
                        last = sig;
                        for w in handle.webview_windows().values() {
                            let _ = w.emit_to(w.label(), "serial-ports-changed", ports.clone());
                        }
                    }
                }
            });
            Ok(())
        })
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
                    {
                        // 關窗即中止安裝（E4-B）：避免 pip 子進程成為孤兒（視窗關了還在裝）。
                        // 僅在此分支（視窗確定關閉）執行；dirty 分支只做 prevent_close，
                        // 使用者可能取消關閉，此時不應中止安裝。
                        // 使用 kill_tree：Windows 下 pip 會 spawn build backend 子進程，
                        // Child::kill() 只殺直接子進程，會留下殘留。
                        let mut installs = state.install_processes.lock().unwrap();
                        if let Some(mut child) = installs.remove(&label) {
                            crate::commands::python::kill_tree(&mut child);
                        }
                    }
                    {
                        let mut monitors = state.serial_monitors.lock().unwrap();
                        if let Some(mut session) = monitors.remove(&label) {
                            let _: crate::state::SerialMonitorSession = session;
                            let _ = session.child.kill();
                        }
                        let mut wants = state.serial_wants.lock().unwrap();
                        wants.remove(&label);
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
