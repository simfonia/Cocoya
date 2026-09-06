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

/// 內建範例唯讀保護（Release 模式）：若選擇的檔案位於打包資源的 examples 內，
/// 詢問使用者後將整個範例專案資料夾複製到使用者工作區（Documents\Cocoya\Projects\<名稱>）
/// 並回傳複本中的檔案路徑；Dev 模式（repo 原始 examples）不複製，允許直接開啟修改。
/// 使用者取消時回傳 Err("EXAMPLES_READ_ONLY")。
fn resolve_example_open_path(window: &Window, handle: &AppHandle, path: std::path::PathBuf) -> Result<std::path::PathBuf, String> {
    let examples_dir = get_examples_path(handle);
    if !path.starts_with(&examples_dir) || crate::utils::is_dev_examples_dir() {
        return Ok(path);
    }

    let confirmed = handle.dialog()
        .message("此為內建唯讀範例，是否複製到使用者工作區（文件\\Cocoya\\Projects）？\nThis built-in example is read-only. Copy it to your user workspace?")
        .title("Cocoya")
        .parent(window)
        .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancelCustom(
            "複製並開啟".into(),
            "取消".into(),
        ))
        .blocking_show();
    if !confirmed {
        return Err("EXAMPLES_READ_ONLY".into());
    }

    let file_name = path.file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid example path".to_string())?
        .to_string();
    let src_dir = path.parent().ok_or_else(|| "Invalid example path".to_string())?.to_path_buf();

    let docs = handle.path().document_dir().map_err(|e| e.to_string())?;
    let projects_root = docs.join("Cocoya").join("Projects");
    fs::create_dir_all(&projects_root).map_err(|e| e.to_string())?;

    // 複製粒度判斷：
    // - 專案型範例（資料夾含 dataset/ 或 model/，多個相關 xml 共用資料集/模型輸出）→ 整包複製
    // - 單檔型範例（Basic/πCar/Mediapipe 等互相獨立的 xml）→ 只複製該 xml 與共用子資料夾
    //   （如 Mediapipe/resources/，維持 xml 內相對路徑引用可用；不複製其他 .xml 兄弟範例）
    let is_project_example = src_dir.join("dataset").is_dir() || src_dir.join("model").is_dir();

    let base_name = if is_project_example {
        src_dir.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("example")
            .to_string()
    } else {
        path.file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or("example")
            .to_string()
    };
    let mut dst_dir = projects_root.join(&base_name);
    let mut n = 2;
    while dst_dir.exists() {
        dst_dir = projects_root.join(format!("{}_{}", base_name, n));
        n += 1;
    }

    if is_project_example {
        copy_dir_recursive(&src_dir, &dst_dir)?;
    } else {
        fs::create_dir_all(&dst_dir).map_err(|e| e.to_string())?;
        fs::copy(path, dst_dir.join(&file_name)).map_err(|e| e.to_string())?;
        for entry in fs::read_dir(src_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            if entry.file_type().map_err(|e| e.to_string())?.is_dir() {
                copy_dir_recursive(&entry.path(), &dst_dir.join(entry.file_name()))?;
            }
        }
    }
    Ok(dst_dir.join(file_name))
}

/// 遞迴複製資料夾（不覆寫目標，因為呼叫端已確保 dst 不存在）
fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        let target = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), &target).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn open_file(window: Window, handle: AppHandle, state: State<'_, AppState>) -> Result<OpenFileResult, String> {
    let file_path = handle.dialog().file()
        .add_filter("Cocoya XML", &["xml"])
        .set_parent(&window)
        .blocking_pick_file();

    if let Some(p) = file_path {
        let mut path = p.into_path().map_err(|_| "Failed to parse path".to_string())?;
        // --- 內建範例唯讀保護（Release）：可能重導向到使用者工作區複本 ---
        path = resolve_example_open_path(&window, &handle, path)?;
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
        .set_parent(&window)
        .blocking_pick_file();

    if let Some(p) = file_path {
        let mut path = p.into_path().map_err(|_| "Failed to parse path".to_string())?;
        // --- 內建範例唯讀保護（Release）：可能重導向到使用者工作區複本 ---
        path = resolve_example_open_path(&window, &handle, path)?;
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
pub async fn save_file(window: Window, handle: AppHandle, state: State<'_, AppState>, xml: String, save_as: bool, force_examples: Option<bool>, dialog_title: Option<String>) -> Result<String, String> {
    let allow_examples = force_examples.unwrap_or(false);
    let current_path = {
        let paths = state.current_paths.lock().unwrap();
        paths.get(window.label()).cloned()
    };
    let mut path_to_save = if save_as { None } else { current_path.clone() };

    if path_to_save.is_none() {
        let mut builder = handle.dialog().file()
            .add_filter("Cocoya XML", &["xml"])
            .set_file_name("未命名專案.xml");
        // 開新專案流程（saveFileAs + tag=newProject）時用「開新專案」語意標題，
        // 避免與「另存專案」混淆（前端於 data.tag==='newProject' 時傳入）。
        if let Some(title) = dialog_title {
            builder = builder.set_title(&title);
        }
        let picked = builder.blocking_save_file();
        
        if let Some(p) = picked {
            let path = p.into_path().map_err(|_| "Failed to parse save path".to_string())?;
            path_to_save = Some(path);
        } else {
            return Err("Canceled".into());
        }
    }

    if let Some(path) = path_to_save {
        // ★ 防呆（2026-09-06）：另存/開新專案若命中「目前專案檔」位置，禁止覆寫自己。
        // 開新專案時 saveFileAs 寫入的是目標平台的乾淨初始積木（非工作區內容），
        // 若使用者誤把「另存」存到與原檔相同路徑，原檔內容會被乾淨初始積木覆寫。此判斷
        // 無論是否 examples 目錄都成立，先於 examples 檢查執行。
        if save_as {
            if let Some(ref current) = current_path {
                if &path == current {
                    return Err("SAME_AS_CURRENT".to_string());
                }
            }
        }

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
/// 檔案不存在 → Err("FILE_NOT_FOUND: ...")（前端據此仍移除縮圖但提示，非靜默成功）
#[tauri::command]
pub fn delete_file(path: String) -> Result<(), String> {
    if fs::metadata(&path).is_err() {
        return Err("FILE_NOT_FOUND: image file does not exist on disk".into());
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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickDataFileResult {
    pub path: String,
    pub content: String,
}

/// 選擇資料夾並掃描影像（供 datasetManager pickFolder 使用）
/// default_path：對話框起始目錄（XML 專案根），僅作為起始位置，不限制選取
#[tauri::command]
pub async fn pick_folder(handle: AppHandle, default_path: Option<String>) -> Result<PickFolderResult, String> {
    use tauri_plugin_dialog::DialogExt;
    let mut builder = handle.dialog().file()
        .set_title("選取資料集資料夾");

    if let Some(dp) = default_path {
        let p = std::path::PathBuf::from(&dp);
        if p.is_dir() {
            builder = builder.set_directory(p);
        }
    }

    let picked = builder.blocking_pick_folder();

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

/// 選取資料檔（CSV/JSON）並讀取內容（供 datasetManager 檔案匯入，預設起始目錄 = XML 專案根）
#[tauri::command]
pub fn pick_data_file(handle: AppHandle, default_path: Option<String>) -> Result<PickDataFileResult, String> {
    use tauri_plugin_dialog::DialogExt;
    let mut builder = handle.dialog().file()
        .set_title("選取資料檔 (CSV/JSON)")
        .add_filter("Data File", &["csv", "json"]);

    if let Some(dp) = default_path {
        let p = std::path::PathBuf::from(&dp);
        if p.is_dir() {
            builder = builder.set_directory(p);
        }
    }

    let picked = builder.blocking_pick_file();
    let file_path = match picked {
        Some(p) => p.into_path().map_err(|_| "Failed to parse file path".to_string())?,
        None => return Err("Canceled".into()),
    };

    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("IO_ERROR: {}", e))?;

    Ok(PickDataFileResult {
        path: file_path.to_string_lossy().to_string(),
        content,
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

/// 遞迴合併複製：將 src 內容複製到 dst，已存在的檔案跳過（不覆寫），回傳複製的檔案數。
fn copy_dir_merge(src: &std::path::Path, dst: &std::path::Path) -> Result<u64, String> {
    fs::create_dir_all(dst).map_err(|e| format!("IO_ERROR: Failed to create dir {}: {}", dst.display(), e))?;
    let mut copied: u64 = 0;
    let entries = fs::read_dir(src).map_err(|e| format!("IO_ERROR: Failed to read {}: {}", src.display(), e))?;
    for entry in entries.flatten() {
        let target = dst.join(entry.file_name());
        if entry.path().is_dir() {
            copied += copy_dir_merge(&entry.path(), &target)?;
        } else if !target.exists() {
            fs::copy(entry.path(), &target)
                .map_err(|e| format!("IO_ERROR: Failed to copy {}: {}", entry.path().display(), e))?;
            copied += 1;
        }
    }
    Ok(copied)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatasetImportResult {
    /// "use"（來源即 canonical）| "confirm_required"（來源在外，需使用者確認複製）| "copied"（已複製完成）
    pub action: String,
    pub path: Option<String>,
    pub canonical_dir: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub copied_files: Option<u64>,
    pub images: Vec<ScanedImage>,
    pub label_counts: std::collections::HashMap<String, u32>,
    pub label_map: std::collections::HashMap<String, u32>,
}

fn scan_folder_result(folder: &std::path::Path, handle: &AppHandle) -> (Vec<ScanedImage>, std::collections::HashMap<String, u32>, std::collections::HashMap<String, u32>) {
    let images = scan_images(folder, handle);
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
    (images, label_counts, label_map)
}

fn normalize_for_compare(p: &str) -> String {
    let s = p.replace('\\', "/");
    let trimmed = s.trim_end_matches('/');
    if cfg!(windows) { trimmed.to_lowercase() } else { trimmed.to_string() }
}

/// 資料集匯入前置檢查與複製（2026-08-26 產品決策；用詞：project_name = dataset/ 下的「資料集名稱」，非 xml 積木專案）：
/// 資料集必須位於「<專案根>/dataset/<資料集名稱>」。若選擇其他資料夾：
/// - confirmed=false → 回傳 confirm_required（前端提示使用者確認複製）
/// - confirmed=true  → 遞迴複製到 canonical（已存在檔案跳過）並掃描 canonical
#[tauri::command]
pub fn dataset_import_from_folder(
    window: Window,
    state: State<'_, AppState>,
    source_path: String,
    project_name: String,
    confirmed: bool,
    handle: AppHandle,
) -> Result<DatasetImportResult, String> {
    // 專案根（錨定 SSOT）：目前 .xml 所在資料夾
    let project_root = {
        let paths = state.current_paths.lock().unwrap();
        paths.get(window.label()).and_then(|p| p.parent().map(|d| d.to_path_buf()))
    };
    let project_root = match project_root {
        Some(r) => r,
        None => return Err("PROJECT_ROOT_REQUIRED: 未錨定專案，請先開新或開啟一個 .xml 專案".to_string()),
    };

    let name = project_name.trim();
    let name_valid = !name.is_empty()
        && name != "."
        && name != ".."
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    if !name_valid {
        return Err("PROJECT_NAME_INVALID: project name may only contain [A-Za-z0-9_-]".to_string());
    }

    let canonical_dir = project_root.join("dataset").join(name);
    let canonical_str = canonical_dir.to_string_lossy().replace('\\', "/");

    if normalize_for_compare(&source_path) == normalize_for_compare(&canonical_str) {
        let (images, label_counts, label_map) = scan_folder_result(&canonical_dir, &handle);
        return Ok(DatasetImportResult {
            action: "use".to_string(),
            path: Some(canonical_str.clone()),
            canonical_dir: canonical_str,
            copied_files: None,
            images, label_counts, label_map,
        });
    }

    if !confirmed {
        return Ok(DatasetImportResult {
            action: "confirm_required".to_string(),
            path: None,
            canonical_dir: canonical_str,
            copied_files: None,
            images: Vec::new(),
            label_counts: std::collections::HashMap::new(),
            label_map: std::collections::HashMap::new(),
        });
    }

    let src = std::path::PathBuf::from(&source_path);
    if !src.is_dir() {
        return Err("IO_ERROR: source folder does not exist".to_string());
    }
    let copied = copy_dir_merge(&src, &canonical_dir)?;
    let (images, label_counts, label_map) = scan_folder_result(&canonical_dir, &handle);
    Ok(DatasetImportResult {
        action: "copied".to_string(),
        path: Some(canonical_str.clone()),
        canonical_dir: canonical_str,
        copied_files: Some(copied),
        images, label_counts, label_map,
    })
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
/// 專案名稱驗證對齊 core/pathPolicy 契約：[A-Za-z0-9_-]+，拒絕 . / .. / traversal。
#[tauri::command]
pub fn dataset_save_progress(folder_path: String, project_name: String, spec_json: String) -> Result<String, String> {
    let name = project_name.trim();
    let name_valid = !name.is_empty()
        && name != "."
        && name != ".."
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    if !name_valid {
        return Err("PROJECT_NAME_INVALID: project name may only contain [A-Za-z0-9_-]".to_string());
    }

    let dataset_dir = std::path::Path::new(&folder_path).join("dataset").join(name);
    if let Err(e) = fs::create_dir_all(&dataset_dir) {
        return Err(format!("IO_ERROR: Failed to create dataset dir: {}", e));
    }
    let spec_path = dataset_dir.join("dataset.json");
    fs::write(&spec_path, &spec_json)
        .map_err(|e| format!("IO_ERROR: Failed to write dataset.json: {}", e))?;
    Ok(spec_path.to_string_lossy().replace('\\', "/"))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatasetProgressResult {
    pub has_progress: bool,
    pub spec: Option<serde_json::Value>,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
}

fn read_progress_spec(spec_path: &std::path::Path) -> Result<DatasetProgressResult, String> {
    let content = fs::read_to_string(spec_path)
        .map_err(|e| format!("IO_ERROR: Failed to read dataset.json: {}", e))?;
    let spec: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("JSON_INVALID: Failed to parse dataset.json: {}", e))?;
    Ok(DatasetProgressResult {
        has_progress: true,
        spec: Some(spec),
        path: spec_path.to_string_lossy().replace('\\', "/"),
        error_code: None,
    })
}

/// 讀取資料集標註進度（等級一存讀）
/// 契約（2026-08-26 canonical-only 匯入閘後精簡）：
/// folderPath 必為 `<專案根>/dataset/<專案名>`，直接讀取 `<folder_path>/dataset.json`；
/// 無檔案 → has_progress=false + PROGRESS_NOT_FOUND（外部資料夾匯入已在匯入閘擋下，不再掃描 dataset/* fallback）。
#[tauri::command]
pub fn dataset_load_progress(folder_path: String) -> Result<DatasetProgressResult, String> {
    let direct_path = std::path::Path::new(&folder_path).join("dataset.json");

    if !direct_path.exists() {
        return Ok(DatasetProgressResult {
            has_progress: false,
            spec: None,
            path: direct_path.to_string_lossy().replace('\\', "/"),
            error_code: Some("PROGRESS_NOT_FOUND".to_string()),
        });
    }
    read_progress_spec(&direct_path)
}
