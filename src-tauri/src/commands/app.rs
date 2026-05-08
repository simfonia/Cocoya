use tauri::{AppHandle, State, Window};
use crate::state::AppState;

#[tauri::command]
pub async fn create_window(handle: AppHandle) -> Result<(), String> {
    let label = format!("window-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());
    tauri::WebviewWindowBuilder::new(&handle, label, tauri::WebviewUrl::App("index.html".into()))
        .title("Cocoya Blockly Editor")
        .inner_size(1200.0, 800.0)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn set_window_title(window: Window, title: String) -> Result<(), String> {
    window.set_title(&title).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_version(handle: AppHandle) -> String {
    handle.package_info().version.to_string()
}

#[tauri::command]
pub fn set_dirty(window: Window, state: State<'_, AppState>, is_dirty: bool) {
    let mut dirty_states = state.dirty_states.lock().unwrap();
    dirty_states.insert(window.label().to_string(), is_dirty);
}

#[tauri::command]
pub fn close_window(window: Window) {
    let _ = window.close();
}

#[tauri::command]
pub async fn pick_python_path(handle: AppHandle) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;
    let file_path = handle.dialog().file()
        .add_filter("Python Executable", &["exe", "py"])
        .set_title("Select Python Executable")
        .blocking_pick_file();

    if let Some(p) = file_path {
        Ok(p.into_path().map_err(|_| "Failed to parse path".to_string())?.to_str().unwrap().to_string())
    } else {
        Err("Canceled".into())
    }
}
