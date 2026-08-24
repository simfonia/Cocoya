use std::fs;
use tauri::{AppHandle, State, Window, Manager};
use tauri_plugin_dialog::DialogExt;
use crate::state::AppState;
use crate::utils::{get_resource_path, get_examples_path};

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

/// 專案根錨定狀態（供前端 Startup Home / Dataset Manager 查詢）
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectAnchor {
    pub is_anchored: bool,
    pub project_root: Option<String>,
}

#[tauri::command]
pub fn get_project_anchor(window: Window, state: State<'_, AppState>) -> ProjectAnchor {
    let paths = state.current_paths.lock().unwrap();
    let project_root = paths.get(window.label()).map(|p| {
        p.parent()
            .map(|x| x.to_string_lossy().to_string())
            .unwrap_or_else(|| p.to_string_lossy().to_string())
    });
    ProjectAnchor {
        is_anchored: project_root.is_some(),
        project_root,
    }
}

#[tauri::command]
pub async fn open_file(window: Window, handle: AppHandle, state: State<'_, AppState>) -> Result<OpenFileResult, String> {
    let file_path = handle.dialog().file().add_filter("Cocoya XML", &["xml"]).blocking_pick_file();

    if let Some(p) = file_path {
        let path = p.into_path().map_err(|_| "Failed to parse path".to_string())?;
        let xml = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let filename = path.file_name().unwrap().to_str().unwrap().to_string();
        
        let platform = if xml.contains("platform=\"MicroPython\"") { "MicroPython" } else { "PC" };

        // --- 檢查鎖定 ---
        let mut locks = state.file_locks.lock().unwrap();
        let is_read_only = if let Some(owner) = locks.get(&path) {
            owner != window.label()
        } else {
            locks.insert(path.clone(), window.label().to_string());
            false
        };

        // --- 檢查實體備份 ---
        let mut backup_xml = None;
        if !is_read_only {
            let parent = path.parent().unwrap();
            let bak_path = parent.join(format!(".{}.bak", filename));
            if bak_path.exists() {
                if let Ok(b_xml) = fs::read_to_string(&bak_path) {
                    if b_xml.trim() != xml.trim() {
                        backup_xml = Some(b_xml);
                    }
                }
            }
        }

        {
            let mut paths = state.current_paths.lock().unwrap();
            paths.insert(window.label().to_string(), path);
        }

        Ok(OpenFileResult {
            xml,
            filename,
            platform: platform.into(),
            backup_xml,
            is_read_only
        })
    } else {
        Err("Canceled".into())
    }
}

#[tauri::command]
pub async fn open_examples(window: Window, handle: AppHandle, state: State<'_, AppState>) -> Result<OpenFileResult, String> {
    // 預設指向 examples 目錄
    let examples_dir = get_examples_path(&handle);
    
    let file_path = handle.dialog().file()
        .add_filter("Cocoya XML", &["xml"])
        .set_directory(&examples_dir)
        .blocking_pick_file();

    if let Some(p) = file_path {
        let path = p.into_path().map_err(|_| "Failed to parse path".to_string())?;
        let xml = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let filename = path.file_name().unwrap().to_str().unwrap().to_string();
        
        let platform = if xml.contains("platform=\"MicroPython\"") { "MicroPython" } else { "PC" };

        // 註冊路徑到 current_paths
        {
            let mut paths = state.current_paths.lock().unwrap();
            paths.insert(window.label().to_string(), path.clone());
        }

        Ok(OpenFileResult {
            xml,
            filename,
            platform: platform.into(),
            backup_xml: None,
            is_read_only: false
        })
    } else {
        Err("Canceled".into())
    }
}

#[tauri::command]
pub async fn save_file(window: Window, handle: AppHandle, state: State<'_, AppState>, xml: String, save_as: bool, force_examples: Option<bool>) -> Result<String, String> {
    let allow_examples = force_examples.unwrap_or(false);
    let current_path = {
        let paths = state.current_paths.lock().unwrap();
        paths.get(window.label()).cloned()
    };
    let mut path_to_save = if save_as { None } else { current_path.clone() };

    if path_to_save.is_none() {
        let picked = handle.dialog().file()
            .add_filter("Cocoya XML", &["xml"])
            .set_file_name("未命名專案.xml")
            .blocking_save_file();
        
        if let Some(p) = picked {
            let path = p.into_path().map_err(|_| "Failed to parse save path".to_string())?;
            path_to_save = Some(path);
        } else {
            return Err("Canceled".into());
        }
    }

    if let Some(path) = path_to_save {
        // --- 檢查是否為 examples 目錄 ---
        let examples_dir = get_examples_path(&handle);
        if path.starts_with(&examples_dir) {
            if !allow_examples {
                if save_as {
                    if let Some(ref current) = current_path {
                        if &path == current {
                            return Err("EXAMPLES_PATH".to_string());
                        }
                    }
                } else {
                    return Err("EXAMPLES_PATH".to_string());
                }
            }
        }

        {
            let mut locks = state.file_locks.lock().unwrap();
            if let Some(owner) = locks.get(&path) {
                if owner != window.label() {
                    return Err("檔案已被其他視窗開啟，無法存回原檔，請使用另存新檔。".to_string());
                }
            } else {
                locks.insert(path.clone(), window.label().to_string());
            }
        }

        let bak_path = path.parent().unwrap().join(format!(".{}.bak", path.file_name().unwrap().to_str().unwrap()));
        
        fs::write(&path, &xml).map_err(|e| e.to_string())?;
        let filename = path.file_name().unwrap().to_str().unwrap().to_string();
        
        {
            let mut paths = state.current_paths.lock().unwrap();
            paths.insert(window.label().to_string(), path);
        }

        if bak_path.exists() { let _ = fs::remove_file(bak_path); }
        let temp_dir = std::env::temp_dir().join("cocoya_tauri");
        let untitled_bak = temp_dir.join(format!("untitled_backup_{}.xml", window.label()));
        if untitled_bak.exists() { let _ = fs::remove_file(untitled_bak); }
        
        Ok(filename)
    } else {
        Err("No path".into())
    }
}

#[tauri::command]
pub fn auto_backup(window: Window, state: State<'_, AppState>, xml: String) -> Result<(), String> {
    let backup_path = {
        let paths = state.current_paths.lock().unwrap();
        if let Some(path) = paths.get(window.label()) {
            let dir = path.parent().unwrap();
            let name = path.file_name().unwrap().to_str().unwrap();
            dir.join(format!(".{}.bak", name))
        } else {
            let temp_dir = std::env::temp_dir().join("cocoya_tauri");
            if !temp_dir.exists() { fs::create_dir_all(&temp_dir).ok(); }
            temp_dir.join(format!("untitled_backup_{}.xml", window.label()))
        }
    };
    fs::write(backup_path, xml).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn check_startup_backup(_window: Window, handle: AppHandle) -> Option<String> {
    let temp_dir = std::env::temp_dir().join("cocoya_tauri");
    if !temp_dir.exists() { return None; }

    let active_labels: Vec<String> = handle.webview_windows().keys().cloned().collect();
    
    if let Ok(entries) = fs::read_dir(&temp_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            
            if filename.starts_with("untitled_backup") && filename.ends_with(".xml") {
                let mut should_recover = false;
                if filename == "untitled_backup.xml" {
                    should_recover = true;
                } else if let Some(label_part) = filename.strip_prefix("untitled_backup_") {
                    if let Some(label) = label_part.strip_suffix(".xml") {
                        if !active_labels.contains(&label.to_string()) {
                            should_recover = true;
                        }
                    }
                }
                
                if should_recover {
                    if let Ok(xml) = fs::read_to_string(&path) {
                        let new_path = path.with_extension("xml.recovering");
                        if let Ok(_) = fs::rename(&path, &new_path) {
                            return Some(xml);
                        }
                    }
                }
            }
        }
    }
    None
}

#[tauri::command]
pub fn clear_backup(window: Window, state: State<'_, AppState>) -> Result<(), String> {
    let paths = state.current_paths.lock().unwrap();
    if let Some(path) = paths.get(window.label()) {
        let bak_path = path.parent().unwrap().join(format!(".{}.bak", path.file_name().unwrap().to_str().unwrap()));
        if bak_path.exists() { let _ = fs::remove_file(bak_path); }
    }
    
    let temp_dir = std::env::temp_dir().join("cocoya_tauri");
    let untitled_bak = temp_dir.join(format!("untitled_backup_{}.xml", window.label()));
    if untitled_bak.exists() { let _ = fs::remove_file(&untitled_bak); }
    
    let recovering = untitled_bak.with_extension("xml.recovering");
    if recovering.exists() { let _ = fs::remove_file(recovering); }

    let legacy = temp_dir.join("untitled_backup.xml");
    if legacy.exists() { let _ = fs::remove_file(&legacy); }
    let legacy_recovering = legacy.with_extension("xml.recovering");
    if legacy_recovering.exists() { let _ = fs::remove_file(legacy_recovering); }
    
    Ok(())
}

#[tauri::command]
pub fn reject_recovery(window: Window, state: State<'_, AppState>) -> Result<(), String> {
    let temp_dir = std::env::temp_dir().join("cocoya_tauri");
    let backup_paths = vec![
        {
            let paths = state.current_paths.lock().unwrap();
            paths.get(window.label()).map(|path| {
                path.parent().unwrap().join(format!(".{}.bak", path.file_name().unwrap().to_str().unwrap()))
            })
        },
        Some(temp_dir.join(format!("untitled_backup_{}.xml", window.label()))),
        Some(temp_dir.join(format!("untitled_backup_{}.xml.recovering", window.label()))),
        Some(temp_dir.join("untitled_backup.xml")),
        Some(temp_dir.join("untitled_backup.xml.recovering")),
    ];

    for p_opt in backup_paths {
        if let Some(p) = p_opt {
            if p.exists() {
                let timestamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
                let archive_path = format!("{}.old_{}", p.to_str().unwrap(), timestamp);
                let _ = fs::rename(p, archive_path);
            }
        }
    }
    Ok(())
}

/// 刪除單一檔案（供 datasetDeleteImage 使用）
#[tauri::command]
pub fn delete_file(path: String) -> Result<(), String> {
    if fs::metadata(&path).is_err() {
        // 檔案不存在視為成功（同 VSIX 行為）
        return Ok(());
    }
    fs::remove_file(&path).map_err(|e| format!("Failed to delete file: {}", e))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanedImage {
    pub name: String,
    pub path: String,
    pub label: String,
    pub blob_url: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickFolderResult {
    pub path: String,
    pub images: Vec<ScanedImage>,
    pub label_counts: std::collections::HashMap<String, u32>,
    pub label_map: std::collections::HashMap<String, u32>,
}

/// 選擇資料夾並掃描影像（供 datasetManager pickFolder 使用）
#[tauri::command]
pub async fn pick_folder(handle: AppHandle) -> Result<PickFolderResult, String> {
    let picked = handle.dialog().file()
        .set_title("選取資料集資料夾")
        .blocking_pick_folder();

    let folder_path = match picked {
        Some(p) => p.into_path().map_err(|_| "Failed to parse folder path".to_string())?,
        None => return Err("Canceled".into()),
    };

    let path_str = folder_path.to_string_lossy().to_string();
    let images = scan_images(&folder_path, &handle);

    // 統計標籤
    let mut label_counts: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
    let mut label_map: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
    let mut next_id: u32 = 0;
    for img in &images {
        *label_counts.entry(img.label.clone()).or_insert(0) += 1;
        if !label_map.contains_key(&img.label) {
            label_map.insert(img.label.clone(), next_id);
            next_id += 1;
        }
    }

    Ok(PickFolderResult {
        path: path_str,
        images,
        label_counts,
        label_map,
    })
}

fn scan_images(folder: &std::path::Path, handle: &AppHandle) -> Vec<ScanedImage> {
    let mut images = Vec::new();
    let image_extensions = ["jpg", "jpeg", "png", "webp", "bmp"];
    walk_folder(folder, std::path::Path::new(""), folder, handle, &image_extensions, &mut images);
    images
}

fn walk_folder(
    base: &std::path::Path,
    rel: &std::path::Path,
    current: &std::path::Path,
    handle: &AppHandle,
    exts: &[&str],
    out: &mut Vec<ScanedImage>,
) {
    if let Ok(entries) = fs::read_dir(current) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let rel_path = rel.join(&name);

            if path.is_dir() {
                walk_folder(base, &rel_path, &path, handle, exts, out);
            } else {
                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                if exts.contains(&ext.as_str()) {
                    // 標籤 = 上一層資料夾名稱
                    let label = rel.file_name()
                        .and_then(|n| n.to_str())
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| "unlabeled".to_string());

                    let rel_path_str = rel_path.to_string_lossy().replace('\\', "/");
                    // 存原始絕對路徑，由前端 convertFileSrc 轉換
                    let blob_url = path.to_string_lossy().to_string();

                    out.push(ScanedImage {
                        name,
                        path: rel_path_str,
                        label,
                        blob_url,
                    });
                }
            }
        }
    }
}

/// URL 編碼檔案路徑（保留路徑分隔符）
fn url_encode_path(path: &str) -> String {
    path.split('/')
        .map(|segment| {
            segment.chars().map(|c| {
                if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' || c == '~' {
                    c.to_string()
                } else {
                    format!("%{:02X}", c as u8)
                }
            }).collect::<String>()
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// 儲存資料集標註進度（等級一存讀）
/// 寫入「<folder_path>/dataset/<project_name>/dataset.json」，回傳完整寫入路徑。
#[tauri::command]
pub fn dataset_save_progress(folder_path: String, project_name: String, spec_json: String) -> Result<String, String> {
    let dataset_dir = std::path::Path::new(&folder_path).join("dataset").join(&project_name);
    if let Err(e) = fs::create_dir_all(&dataset_dir) {
        return Err(format!("Failed to create dataset dir: {}", e));
    }
    let spec_path = dataset_dir.join("dataset.json");
    fs::write(&spec_path, &spec_json).map_err(|e| format!("Failed to write dataset.json: {}", e))?;
    Ok(spec_path.to_string_lossy().replace('\\', "/"))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatasetProgressResult {
    pub has_progress: bool,
    pub spec: Option<serde_json::Value>,
    pub path: String,
}

/// 讀取資料集標註進度（等級一存讀）
/// 檢查「<folder_path>/dataset.json」是否存在；存在則回傳 spec（JSON 物件）。
#[tauri::command]
pub fn dataset_load_progress(folder_path: String) -> Result<DatasetProgressResult, String> {
    let spec_path = std::path::Path::new(&folder_path).join("dataset.json");
    let path_str = spec_path.to_string_lossy().replace('\\', "/");

    if !spec_path.exists() {
        return Ok(DatasetProgressResult { has_progress: false, spec: None, path: path_str });
    }

    let content = fs::read_to_string(&spec_path).map_err(|e| format!("Failed to read dataset.json: {}", e))?;
    let spec: serde_json::Value = serde_json::from_str(&content).map_err(|e| format!("Failed to parse dataset.json: {}", e))?;
    Ok(DatasetProgressResult { has_progress: true, spec: Some(spec), path: path_str })
}
