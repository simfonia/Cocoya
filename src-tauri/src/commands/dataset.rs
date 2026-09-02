use std::fs;
use std::process::{Command, Stdio};
use std::io::{BufReader, BufRead, Write};
use std::sync::Mutex;
use tauri::{Manager, State, Window, Emitter};
use base64::Engine;
use tauri_plugin_dialog::DialogExt;
use crate::state::{AppState, SidecarProcess};

#[cfg(test)]
mod tests {
    use super::build_sidecar_message;

    #[test]
    fn preserves_internal_request_id_when_payload_contains_request_id() {
        let payload = r#"{"requestId":"client-123","label":"cat"}"#;
        let msg = build_sidecar_message("captureImage", payload, "internal-456").unwrap();

        assert_eq!(msg["command"], "captureImage");
        assert_eq!(msg["requestId"], "internal-456");
        assert_eq!(msg["label"], "cat");
    }
}

fn build_sidecar_message(command: &str, payload: &str, request_id: &str) -> Result<serde_json::Value, String> {
    let mut msg = serde_json::json!({
        "command": command,
        "requestId": request_id,
    });

    if let Ok(payload_obj) = serde_json::from_str::<serde_json::Value>(payload) {
        if let Some(obj) = payload_obj.as_object() {
            for (k, v) in obj {
                if k == "requestId" {
                    continue;
                }
                msg[k] = v.clone();
            }
        }
    }

    Ok(msg)
}

/// 啟動 dataset sidecar 進程
#[tauri::command]
pub async fn start_sidecar(
    window: Window,
    state: State<'_, AppState>,
    python_path: String,
) -> Result<(), String> {
    // 1. 先停止舊的 sidecar
    stop_sidecar_inner(window.label(), &state.sidecar_processes);

    // 2. 找到 sidecar 腳本路徑
    let sidecar_dir = get_sidecar_dir(&window.app_handle())?;
    let script_path = sidecar_dir.join("dataset_sidecar.py");
    if !script_path.exists() {
        return Err(format!("Sidecar script not found: {}", script_path.display()));
    }

    // 2b. 取得專案根目錄（Release 模式 sidecar CWD 會在 Program Files，
    //     導致訓練等相對路徑寫入失敗；以環境變數讓 sidecar chdir 到專案根）
    let project_root = {
        let paths = state.current_paths.lock().unwrap();
        paths.get(window.label()).and_then(|p| p.parent().map(|x| x.to_string_lossy().to_string()))
    };

    // 3. 啟動進程
    let mut cmd = Command::new(&python_path);
    cmd.arg("-u")
        .arg(&script_path)
        .current_dir(&sidecar_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("PYTHONIOENCODING", "utf-8") // 2026-09-01：修正正體中文 Windows (cp950) 終端機中文亂碼
        .env("PYTHONUNBUFFERED", "1");

    if let Some(root) = &project_root {
        cmd.env("COCOYA_PROJECT_ROOT", root);
    }

    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to start sidecar: {}", e))?;

    let stdin = child.stdin.take().ok_or_else(|| "Failed to open sidecar stdin".to_string())?;
    let stdout = child.stdout.take().ok_or_else(|| "Failed to open sidecar stdout".to_string())?;
    let stderr = child.stderr.take().ok_or_else(|| "Failed to open sidecar stderr".to_string())?;

    // 4. 包裝進程
    let sidecar = SidecarProcess {
        child,
        stdin: Some(stdin),
    };

    // 5. 儲存進程
    {
        let mut procs = state.sidecar_processes.lock().unwrap();
        procs.insert(window.label().to_string(), sidecar);
    }

    // 6. 啟動 stderr 監聽執行緒 (輸出 sidecar 日誌)
    let window_clone = window.clone();
    let sidecar_log_label = window.label().to_string();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(l) = line {
                let trimmed = l.trim().to_string();
                if !trimmed.is_empty() {
                    let _ = window_clone.emit_to(&sidecar_log_label, "sidecar-log", trimmed);
                }
            }
        }
    });

    // 7. 啟動 stdout 監聽執行緒，收集 response 與 event，並即時轉發給前端
    let window_stdout = window.clone();
    let sidecar_event_label = window.label().to_string();
    let responses = state.sidecar_responses.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(raw_line) = line {
                let trimmed = raw_line.trim().to_string();
                if trimmed.is_empty() {
                    continue;
                }

                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&trimmed) {
                    if val.get("type").and_then(|t| t.as_str()) == Some("response") {
                        if let Some(request_id) = val.get("requestId").and_then(|r| r.as_str()) {
                            let mut map = responses.lock().unwrap();
                            map.insert(request_id.to_string(), trimmed.clone());
                        }
                    }

                    if val.get("type").and_then(|t| t.as_str()) == Some("event") {
                        let _ = window_stdout.emit_to(&sidecar_event_label, "sidecar-event", &trimmed);
                    }
                }
            }
        }
    });

    Ok(())
}

/// 發送指令到 sidecar 並等待回應
#[tauri::command]
pub async fn sidecar_send(
    window: Window,
    state: State<'_, AppState>,
    command: String,
    payload: String,
    timeout_secs: Option<u64>,
) -> Result<String, String> {
    let label = window.label().to_string();
    let request_id = format!("req_{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap_or_default()
        .as_nanos());

    // 1. 取得 sidecar 的 stdin
    {
        let mut procs = state.sidecar_processes.lock().unwrap();
        let sidecar = procs.get_mut(&label)
            .ok_or_else(|| "Sidecar not started. Call start_sidecar first.".to_string())?;

        let stdin = sidecar.stdin.as_mut()
            .ok_or_else(|| "Sidecar stdin not available".to_string())?;

        // 2. 構建 JSON 指令，保留內部 requestId，避免前端 payload 的 requestId 覆蓋掉通訊標記
        let msg = build_sidecar_message(&command, &payload, &request_id)?;

        // 3. 發送指令
        let cmd_str = serde_json::to_string(&msg)
            .map_err(|e| format!("Failed to serialize command: {}", e))?;

        stdin.write_all(cmd_str.as_bytes())
            .map_err(|e| format!("Failed to write to sidecar stdin: {}", e))?;
        stdin.write_all(b"\n")
            .map_err(|e| format!("Failed to write newline to sidecar stdin: {}", e))?;
    }

    // 4. 透過共享 response map 等待對應的 response（預設 30 秒超時；長時任務如遠端訓練可由前端指定 timeout_secs）
    let start_time = std::time::Instant::now();
    let timeout_duration = std::time::Duration::from_secs(timeout_secs.unwrap_or(30));

    loop {
        let maybe_response = {
            let mut responses = state.sidecar_responses.lock().unwrap();
            responses.remove(&request_id)
        };

        if let Some(line) = maybe_response {
            return Ok(line);
        }

        if start_time.elapsed() > timeout_duration {
            return Err("Sidecar response timeout (30s)".to_string());
        }

        std::thread::sleep(std::time::Duration::from_millis(50));
    }
}

/// 停止 sidecar 進程
#[tauri::command]
pub async fn stop_sidecar(
    window: Window,
    state: State<'_, AppState>,
) -> Result<(), String> {
    stop_sidecar_inner(window.label(), &state.sidecar_processes);
    Ok(())
}

fn stop_sidecar_inner(label: &str, processes: &Mutex<std::collections::HashMap<String, SidecarProcess>>) {
    let mut procs = processes.lock().unwrap();
    if let Some(mut sidecar) = procs.remove(label) {
        // 關閉 stdin 讓 sidecar 正常終止
        drop(sidecar.stdin.take());
        let _ = sidecar.child.kill();
        let _ = sidecar.child.wait();
    }
}

/// 匯出資料集：複製檔案到 staging → 透過 sidecar 打包 ZIP → 存檔對話框
#[tauri::command]
pub async fn export_dataset(
    window: Window,
    state: State<'_, AppState>,
    spec_json: String,
    source_folder_path: String,
    python_path: String,
) -> Result<String, String> {
    // 1. 解析 spec 取得專案名稱
    let spec: serde_json::Value = serde_json::from_str(&spec_json)
        .map_err(|e| format!("Failed to parse spec: {}", e))?;
    let project_name = spec["project"]["name"].as_str().unwrap_or("dataset");

    // 2. 建立 staging 目錄
    let temp_dir = std::env::temp_dir().join("cocoya_tauri").join("export").join(project_name);
    if temp_dir.exists() {
        let _ = fs::remove_dir_all(&temp_dir);
    }
    fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create staging dir: {}", e))?;

    // 3. 從 sourceFolderPath 複製影像到 staging
    let source = std::path::Path::new(&source_folder_path);
    if source.exists() && source.is_dir() {
        copy_dir_recursive(source, &temp_dir)?;
    }

    // 4. 寫入 dataset.json
    let spec_path = temp_dir.join("dataset.json");
    fs::write(&spec_path, &spec_json).map_err(|e| format!("Failed to write dataset.json: {}", e))?;

    // 5. 開存檔對話框選 ZIP 輸出位置
    let picked = window.dialog().file()
        .set_title("匯出資料集")
        .add_filter("ZIP Archive", &["zip"])
        .set_file_name(&format!("{}.zip", project_name))
        .blocking_save_file();

    let output_zip = match picked {
        Some(p) => p.into_path().map_err(|_| "Failed to parse output path".to_string())?,
        None => {
            let _ = fs::remove_dir_all(&temp_dir);
            return Err("Canceled".into());
        }
    };

    // 6. 透過 sidecar 打包 ZIP
    // 先確保 sidecar 已啟動
    let sidecar_ready = {
        let procs = state.sidecar_processes.lock().unwrap();
        procs.contains_key(window.label())
    };

    if !sidecar_ready {
        // 啟動 sidecar
        let sidecar_dir = get_sidecar_dir(&window.app_handle())?;
        let script_path = sidecar_dir.join("dataset_sidecar.py");
        if !script_path.exists() {
            let _ = fs::remove_dir_all(&temp_dir);
            return Err(format!("Sidecar script not found: {}", script_path.display()));
        }

        let mut child = Command::new(&python_path)
            .arg("-u")
            .arg(&script_path)
            .current_dir(&sidecar_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start sidecar: {}", e))?;

        let stdin = child.stdin.take().ok_or_else(|| "Failed to open stdin".to_string())?;
        let stdout = child.stdout.take().ok_or_else(|| "Failed to open stdout".to_string())?;
        let stderr = child.stderr.take().ok_or_else(|| "Failed to open stderr".to_string())?;

        // stderr 監聽
        let wc = window.clone();
        let export_log_label = window.label().to_string();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(l) = line {
                    let t = l.trim().to_string();
                    if !t.is_empty() { let _ = wc.emit_to(&export_log_label, "sidecar-log", t); }
                }
            }
        });

        // stdout response 監聽：export_dataset 會等待此 map 裡的 requestId。
        let export_responses = state.sidecar_responses.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(raw_line) = line {
                    let trimmed = raw_line.trim().to_string();
                    if trimmed.is_empty() {
                        continue;
                    }
                    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&trimmed) {
                        if value.get("type").and_then(|kind| kind.as_str()) == Some("response") {
                            if let Some(response_id) = value.get("requestId").and_then(|id| id.as_str()) {
                                let mut responses = export_responses.lock().unwrap();
                                responses.insert(response_id.to_string(), trimmed.clone());
                            }
                        }
                    }
                }
            }
        });

        let sidecar = SidecarProcess {
            child,
            stdin: Some(stdin),
        };

        let mut procs = state.sidecar_processes.lock().unwrap();
        procs.insert(window.label().to_string(), sidecar);
    }

    // 7. 發送 exportDataset 指令到 sidecar
    let request_id = format!("export_{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap_or_default()
        .as_nanos());

    let msg = serde_json::json!({
        "command": "exportDataset",
        "requestId": request_id,
        "sourceDir": temp_dir.to_string_lossy().to_string().replace('\\', "/"),
        "outputZip": output_zip.to_string_lossy().to_string().replace('\\', "/"),
    });

    {
        let mut procs = state.sidecar_processes.lock().unwrap();
        let sidecar = procs.get_mut(window.label())
            .ok_or_else(|| "Sidecar lost".to_string())?;

        let stdin = sidecar.stdin.as_mut()
            .ok_or_else(|| "Stdin not available".to_string())?;

        let cmd_str = serde_json::to_string(&msg)
            .map_err(|e| format!("Serialize error: {}", e))?;

        stdin.write_all(cmd_str.as_bytes())
            .map_err(|e| format!("Write to stdin failed: {}", e))?;
        stdin.write_all(b"\n")
            .map_err(|e| format!("Write newline failed: {}", e))?;
    }

    // 8. 讀取 sidecar 回應
    let start_time = std::time::Instant::now();
    let timeout_duration = std::time::Duration::from_secs(30);

    loop {
        let maybe_response = {
            let mut responses = state.sidecar_responses.lock().unwrap();
            responses.remove(&request_id)
        };

        if let Some(line) = maybe_response {
            let _ = fs::remove_dir_all(&temp_dir);

            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) {
                if val.get("success").and_then(|s| s.as_bool()).unwrap_or(false) {
                    let path = val.get("path").and_then(|p| p.as_str()).unwrap_or("");
                    return Ok(path.to_string());
                } else {
                    let err = val.get("error").and_then(|e| e.as_str()).unwrap_or("Export failed");
                    return Err(err.to_string());
                }
            }

            return Err("Export failed".to_string());
        }

        if start_time.elapsed() > timeout_duration {
            return Err("Sidecar response timeout (30s)".to_string());
        }

        std::thread::sleep(std::time::Duration::from_millis(50));
    }
}

/// 遞迴複製目錄
fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    if let Ok(entries) = fs::read_dir(src) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name();
            let dst_path = dst.join(&name);

            if path.is_dir() {
                fs::create_dir_all(&dst_path).map_err(|e| format!("Create dir failed: {}", e))?;
                copy_dir_recursive(&path, &dst_path)?;
            } else {
                fs::copy(&path, &dst_path).map_err(|e| format!("Copy file failed: {}", e))?;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn dataset_upload_chunk(
    file_id: String,
    chunk_index: u32,
    total_chunks: u32,
    zip_data_chunk: String,
    project_name: String,
    is_last: bool,
) -> Result<Option<String>, String> {
    if file_id.is_empty()
        || file_id.len() > 100
        || !file_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err("Invalid upload file id".to_string());
    }
    if total_chunks == 0 || total_chunks > 4096 || chunk_index >= total_chunks {
        return Err("Invalid upload chunk range".to_string());
    }
    if project_name.is_empty()
        || project_name.len() > 100
        || !project_name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err("Invalid project name".to_string());
    }
    if is_last && chunk_index + 1 != total_chunks {
        return Err("Last upload chunk index does not match total chunks".to_string());
    }

    let upload_root = std::env::temp_dir().join("cocoya_dataset_upload");
    let chunk_dir = upload_root.join(&file_id);
    fs::create_dir_all(&chunk_dir).map_err(|e| format!("Failed to create upload dir: {}", e))?;
    let chunk_path = chunk_dir.join(format!("chunk_{:04}", chunk_index));
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(zip_data_chunk.as_bytes())
        .map_err(|e| format!("Invalid upload chunk encoding: {}", e))?;
    if bytes.len() > 1024 * 1024 {
        return Err("Upload chunk exceeds 1 MiB limit".to_string());
    }
    fs::write(&chunk_path, bytes).map_err(|e| format!("Failed to write upload chunk: {}", e))?;

    if !is_last {
        return Ok(None);
    }

    let output_path = upload_root.join(format!("{}_{}_upload.zip", project_name, file_id));
    let mut output = fs::File::create(&output_path)
        .map_err(|e| format!("Failed to create upload archive: {}", e))?;
    for index in 0..total_chunks {
        let current_path = chunk_dir.join(format!("chunk_{:04}", index));
        if !current_path.exists() {
            let _ = fs::remove_dir_all(&chunk_dir);
            let _ = fs::remove_file(&output_path);
            return Err(format!("Missing upload chunk {}", index));
        }
        let current = fs::read(&current_path)
            .map_err(|e| format!("Failed to read upload chunk {}: {}", index, e))?;
        output.write_all(&current)
            .map_err(|e| format!("Failed to assemble upload archive: {}", e))?;
    }
    output.flush().map_err(|e| format!("Failed to flush upload archive: {}", e))?;
    let _ = fs::remove_dir_all(&chunk_dir);
    Ok(Some(output_path.to_string_lossy().replace('\\', "/")))
}

fn get_sidecar_dir(handle: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    if let Ok(resource_path) = handle.path().resolve(
        "resources/dataset_manager",
        tauri::path::BaseDirectory::Resource,
    ) {
        if resource_path.exists() {
            return Ok(resource_path);
        }
    }

    // 開發模式：從專案根目錄找
    let mut dev_path = std::env::current_dir().map_err(|e| e.to_string())?;
    if dev_path.ends_with("src-tauri") {
        dev_path.pop();
    }
    let sidecar_dir = dev_path.join("resources").join("dataset_manager");
    if sidecar_dir.exists() {
        return Ok(sidecar_dir);
    }

    Err(format!("Sidecar directory not found: {}", sidecar_dir.display()))
}