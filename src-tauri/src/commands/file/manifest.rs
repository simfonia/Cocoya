// P2-5（2026-10-03）自 file.rs 拆分。模組清單與 toolbox 讀取（core_manifest.json / modules/<id>/toolbox.xml）
//! 純搬移：對外 API 與行為完全不變。


use std::fs;
use tauri::AppHandle;
use crate::utils::get_resource_path;



#[derive(serde::Serialize)]
pub struct OpenFileResult {
    pub xml: String,
    pub filename: String,
    pub platform: String,
    pub backup_xml: Option<String>,
    pub is_read_only: bool
}

#[tauri::command]
pub fn get_manifest(handle: AppHandle) -> Result<serde_json::Value, String> {
    let target_path = get_resource_path(&handle, "core_manifest.json");
    let content = fs::read_to_string(&target_path).map_err(|e| format!("Failed to read manifest at {:?}: {}", target_path, e))?;
    let json: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
pub fn get_module_toolbox(handle: AppHandle, path: String) -> Result<String, String> {
    let relative_path = format!("modules/{}", path);
    let target_path = get_resource_path(&handle, &relative_path);
    fs::read_to_string(&target_path).map_err(|e| format!("Failed to read toolbox at {:?}: {}", target_path, e))
}
