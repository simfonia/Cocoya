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

/// 雲端 AI（遠端訓練）全域開關已移除（見 log/plan/RemoteTrainingRefactor.md D1）。
#[tauri::command]
pub fn close_window(window: Window) {
    let _ = window.close();
}

/// 以系統檔案總管開啟本機資料夾（訓練完成後開啟模型目錄等）
#[tauri::command]
pub fn open_folder(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("路徑不存在: {}", path));
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
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

#[tauri::command]
pub fn open_help(handle: AppHandle, help_id: String) -> Result<(), String> {
    use tauri::Manager;
    
    // 組合檔案路徑: docs/help/{help_id}.html
    let resource_path = handle
        .path()
        .resolve("docs/help", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    
    let help_path = resource_path.join(format!("{}.html", help_id));
    
    if !help_path.exists() {
        return Err(format!("Help file not found: {:?}", help_path));
    }
    
    // 使用預設瀏覽器開啟
    open::that(&help_path).map_err(|e| e.to_string())?;
    Ok(())
}
