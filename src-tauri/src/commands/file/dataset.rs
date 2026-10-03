// P2-5（2026-10-03）自 file.rs 拆分。Dataset Manager 支援指令：標籤改名、資料夾匯入掃描、標註進度存讀、選檔
//! 純搬移：對外 API 與行為完全不變。


use std::fs;
use tauri::{AppHandle, State, Window, Manager};
use crate::state::AppState;
use crate::utils::copy_dir_merge;


#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenamedPath {
    pub old_path: String,
    pub new_path: String,
}

/// 標籤段名稱驗證（對齊 core/pathPolicy 契約：[A-Za-z0-9_-]+，拒絕 . / .. / traversal）
fn validate_label_segment(label: &str) -> Result<(), String> {
    let l = label.trim();
    if l.is_empty() || l == "." || l == ".."
        || !l.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err(format!("LABEL_NAME_INVALID: invalid label segment: {}", label));
    }
    Ok(())
}

/// 標籤改名磁碟同步（供 datasetRenameLabel 使用，2026-09-16 Part B）
/// 僅作用於 canonical dataset/<專案>/<label>/ 落盤區（來源資料夾由前端隔離，不會傳入此處）：
/// 1. `<dataset_dir>/<old_label>` 目錄存在 → 整個目錄改名為 `<new_label>`（目標已存在 → LABEL_DIR_CONFLICT）
/// 2. 目錄內前綴 `<old_label>_` 的檔案 → 檔名前綴改為 `<new_label>_`
/// 回傳逐一改名的 (oldPath, newPath) 清單（serde camelCase），供前端對帳 img.path / img.diskPath。
#[tauri::command]
pub fn dataset_rename_label(dataset_dir: String, old_label: String, new_label: String) -> Result<Vec<RenamedPath>, String> {
    validate_label_segment(&old_label)?;
    validate_label_segment(&new_label)?;
    if old_label == new_label {
        return Ok(Vec::new());
    }
    let src_dir = std::path::Path::new(&dataset_dir).join(&old_label);
    if !src_dir.is_dir() {
        // 無落盤資料夾（例如 file 匯入未落盤、或從未 live 採集該標籤）→ no-op 成功
        return Ok(Vec::new());
    }
    let dst_dir = std::path::Path::new(&dataset_dir).join(&new_label);
    if dst_dir.exists() {
        return Err(format!("LABEL_DIR_CONFLICT: target label dir already exists: {}", dst_dir.display()));
    }
    fs::rename(&src_dir, &dst_dir).map_err(|e| format!("IO_ERROR: failed to rename label dir: {}", e))?;

    let mut renamed: Vec<RenamedPath> = Vec::new();
    let old_prefix = format!("{}_", old_label);
    let new_prefix = format!("{}_", new_label);
    let entries = fs::read_dir(&dst_dir).map_err(|e| format!("IO_ERROR: failed to read renamed dir: {}", e))?;
    for entry in entries.flatten() {
        let p = entry.path();
        if !p.is_file() { continue; }
        if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
            if let Some(rest) = name.strip_prefix(&old_prefix) {
                let new_name = format!("{}{}", new_prefix, rest);
                let new_p = p.with_file_name(&new_name);
                if let Err(e) = fs::rename(&p, &new_p) {
                    // 單檔失敗不中斷（目錄已改名，不回滾）；記錄並繼續，前端對帳以成功清單為準
                    eprintln!("[dataset_rename_label] file rename failed: {} -> {}: {}",
                        p.display(), new_p.display(), e);
                    continue;
                }
                renamed.push(RenamedPath {
                    old_path: p.to_string_lossy().replace('\\', "/"),
                    new_path: new_p.to_string_lossy().replace('\\', "/"),
                });
            }
        }
    }
    Ok(renamed)
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

#[tauri::command]
pub fn release_session(window: Window, state: State<'_, AppState>) -> Result<(), String> {
    // 回首頁（backToHome）：釋放本視窗的 session 狀態——
    // 錨定（current_paths）、本視窗持有的檔案鎖（file_locks）、dirty 旗標。
    // 沿用 CloseRequested 的清理語意（lib.rs），但不關視窗；下次開新/開啟時重新錨定。
    let label = window.label().to_string();
    {
        let mut paths = state.current_paths.lock().unwrap();
        paths.remove(&label);
    }
    {
        let mut locks = state.file_locks.lock().unwrap();
        locks.retain(|_, owner| owner != &label);
    }
    {
        let mut dirty = state.dirty_states.lock().unwrap();
        dirty.remove(&label);
    }
    Ok(())
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

// copy_dir_merge 已移至 utils.rs（2026-09-17，examples seeding 共用），改由上方 import 使用。

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
