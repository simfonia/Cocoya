use std::process::{Command, Stdio, Child};
use std::sync::{Arc, Mutex};
use std::io::{BufReader, BufRead};
use tauri::{State, Window, Emitter, Manager};
use std::fs;
use std::path::PathBuf;
use std::collections::HashMap;
use tauri_plugin_dialog::DialogExt;

// --- 全域進度與狀態管理 (按視窗隔離) ---
struct AppState {
    python_processes: Arc<Mutex<HashMap<String, Child>>>,
    current_paths: Arc<Mutex<HashMap<String, PathBuf>>>,
}

#[tauri::command]
async fn run_python(
    window: Window,
    state: State<'_, AppState>,
    code: String,
    python_path: String,
) -> Result<(), String> {
    // 1. 停止該視窗的舊程序
    stop_python(window.clone(), state.clone()).await?;

    // 2. 準備暫存檔案
    let temp_dir = std::env::temp_dir().join("cocoya_tauri");
    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    }
    let script_path = temp_dir.join(format!("cocoya_run_{}.py", window.label()));
    fs::write(&script_path, &code).map_err(|e| e.to_string())?;

    // 3. 啟動進程
    let mut child = Command::new(&python_path)
        .arg("-u") // Unbuffered mode: 確保 print 內容能即時傳回
        .arg(&script_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start Python: {}", e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    // 將進程存入狀態以便停止
    {
        let mut procs = state.python_processes.lock().unwrap();
        procs.insert(window.label().to_string(), child);
    }

    // 4. 即時串流日誌到前端 (僅傳給發起的視窗)
    let window_clone = window.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = window_clone.emit("python-log", l);
            }
        }
    });

    let window_clone_err = window.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = window_clone_err.emit("python-error", l);
            }
        }
    });

    Ok(())
}

#[tauri::command]
async fn stop_python(window: Window, state: State<'_, AppState>) -> Result<(), String> {
    let mut procs = state.python_processes.lock().unwrap();
    if let Some(mut child) = procs.remove(window.label()) {
        let _ = child.kill();
    }
    Ok(())
}

#[tauri::command]
fn get_manifest(window: Window, handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let resource_path = handle
        .path()
        .resolve("resources/core_manifest.json", tauri::path::BaseDirectory::Resource);
    
    let target_path = match resource_path {
        Ok(p) if p.exists() => p,
        _ => {
            // Fallback: 開發模式，需考慮工作目錄可能在 src-tauri 內
            let mut dev_path = std::env::current_dir().unwrap();
            if dev_path.ends_with("src-tauri") { dev_path.pop(); }
            dev_path.push("ui");
            dev_path.push("src");
            dev_path.push("core_manifest.json");
            dev_path
        }
    };
    
    let content = fs::read_to_string(&target_path).map_err(|e| format!("Failed to read manifest at {:?}: {}", target_path, e))?;
    let json: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    // --- 檢查並搜尋孤兒備份 (Orphaned Backups) ---
    let temp_dir = std::env::temp_dir().join("cocoya_tauri");
    if temp_dir.exists() {
        // 1. 獲取所有目前正在運行的視窗 Label
        let active_labels: Vec<String> = handle.webview_windows()
            .keys()
            .cloned()
            .collect();

        // 2. 掃描暫存目錄
        if let Ok(entries) = fs::read_dir(&temp_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

                // 檢查是否為未命名的備份檔
                if filename.starts_with("untitled_backup") && filename.ends_with(".xml") {
                    let mut should_recover = false;

                    if filename == "untitled_backup.xml" {
                        // 舊版或通用備份，直接恢復
                        should_recover = true;
                    } else if let Some(label_part) = filename.strip_prefix("untitled_backup_") {
                        if let Some(label) = label_part.strip_suffix(".xml") {
                            // 如果該備份所屬的視窗 Label 目前不在活躍清單中，則視為孤兒
                            if !active_labels.contains(&label.to_string()) {
                                should_recover = true;
                            }
                        }
                    }

                    if should_recover {
                        if let Ok(bak_xml) = fs::read_to_string(&path) {
                            // 透過事件主動推播備份給特定的視窗
                            window.emit("recoveryData", serde_json::json!({ "xml": bak_xml })).ok();
                            // 找到一個就夠了，避免一次噴出太多恢復視窗
                            break; 
                        }
                    }
                }
            }
        }
    }

    Ok(json)
}

#[tauri::command]
fn get_module_toolbox(handle: tauri::AppHandle, path: String) -> Result<String, String> {
    let resource_path = handle
        .path()
        .resolve(format!("resources/modules/{}", path), tauri::path::BaseDirectory::Resource);

    let target_path = match resource_path {
        Ok(p) if p.exists() => p,
        _ => {
            let mut dev_path = std::env::current_dir().unwrap();
            if dev_path.ends_with("src-tauri") { dev_path.pop(); }
            dev_path.push("ui");
            dev_path.push("src");
            dev_path.push("modules");
            
            for part in path.split('/') {
                dev_path.push(part);
            }
            dev_path
        }
    };

    fs::read_to_string(&target_path).map_err(|e| format!("Failed to read toolbox at {:?}: {}", target_path, e))
}

#[tauri::command]
async fn open_file(window: Window, handle: tauri::AppHandle, state: State<'_, AppState>) -> Result<OpenFileResult, String> {
    let file_path = handle.dialog().file().add_filter("Cocoya XML", &["xml"]).blocking_pick_file();

    if let Some(p) = file_path {
        let path = p.into_path().map_err(|_| "Failed to parse path".to_string())?;
        let xml = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let filename = path.file_name().unwrap().to_str().unwrap().to_string();
        
        let platform = if xml.contains("platform=\"MicroPython\"") { "MicroPython" } else { "PC" };

        // --- 檢查實體備份 ---
        let mut backup_xml = None;
        let parent = path.parent().unwrap();
        let bak_path = parent.join(format!(".{}.bak", filename));
        if bak_path.exists() {
            if let Ok(b_xml) = fs::read_to_string(&bak_path) {
                if b_xml.trim() != xml.trim() {
                    backup_xml = Some(b_xml);
                }
            }
        }

        {
            let mut paths = state.current_paths.lock().unwrap();
            paths.insert(window.label().to_string(), path);
        }

        Ok(OpenFileResult {
            xml: xml,
            filename: filename,
            platform: platform.into(),
            backup_xml: backup_xml
        })
    } else {
        Err("Canceled".into())
    }
}

#[derive(serde::Serialize)]
struct OpenFileResult {
    xml: String,
    filename: String,
    platform: String,
    backup_xml: Option<String>
}

#[tauri::command]
fn auto_backup(window: Window, state: State<'_, AppState>, xml: String) -> Result<(), String> {
    let backup_path = {
        let paths = state.current_paths.lock().unwrap();
        if let Some(path) = paths.get(window.label()) {
            let dir = path.parent().unwrap();
            let name = path.file_name().unwrap().to_str().unwrap();
            dir.join(format!(".{}.bak", name))
        } else {
            let temp_dir = std::env::temp_dir().join("cocoya_tauri");
            if !temp_dir.exists() { fs::create_dir_all(&temp_dir).ok(); }
            temp_dir.join("untitled_backup.xml")
        }
    };
    fs::write(backup_path, xml).map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_backup(window: Window, state: State<'_, AppState>) -> Result<(), String> {
    let paths = state.current_paths.lock().unwrap();
    if let Some(path) = paths.get(window.label()) {
        let bak_path = path.parent().unwrap().join(format!(".{}.bak", path.file_name().unwrap().to_str().unwrap()));
        if bak_path.exists() { let _ = fs::remove_file(bak_path); }
    }
    let untitled_bak = std::env::temp_dir().join("cocoya_tauri").join("untitled_backup.xml");
    if untitled_bak.exists() { let _ = fs::remove_file(untitled_bak); }
    Ok(())
}

#[tauri::command]
fn reject_recovery(window: Window, state: State<'_, AppState>) -> Result<(), String> {
    let backup_path = {
        let paths = state.current_paths.lock().unwrap();
        if let Some(path) = paths.get(window.label()) {
            let dir = path.parent().unwrap();
            let name = path.file_name().unwrap().to_str().unwrap();
            Some(dir.join(format!(".{}.bak", name)))
        } else {
            let p = std::env::temp_dir().join("cocoya_tauri").join(format!("untitled_backup_{}.xml", window.label()));
            if p.exists() { Some(p) } else {
                let legacy = std::env::temp_dir().join("cocoya_tauri").join("untitled_backup.xml");
                if legacy.exists() { Some(legacy) } else { None }
            }
        }
    };

    if let Some(p) = backup_path {
        if p.exists() {
            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
            let archive_path = format!("{}.old_{}", p.to_str().unwrap(), timestamp);
            let _ = fs::rename(p, archive_path);
        }
    }
    Ok(())
}

#[tauri::command]
async fn reset_firmware(handle: tauri::AppHandle, model: String, should_clear: bool) -> Result<(), String> {
    // 1. 定位韌體源檔案
    let uf2_file: std::path::PathBuf = if model == "custom" {
        let picked = handle.dialog().file()
            .add_filter("UF2 Firmware", &["uf2"])
            .blocking_pick_file()
            .ok_or_else(|| "Canceled".to_string())?;
        picked.into_path().map_err(|_| "Failed to parse firmware path".to_string())?
    } else {
        let resource_path = handle.path().resolve(
            format!("resources/firmware/MicroPython/{}", model),
            tauri::path::BaseDirectory::Resource
        );

        let firmware_dir = match resource_path {
            Ok(p) if p.exists() => p,
            _ => {
                // Fallback: 開發模式
                let mut dev_path = std::env::current_dir().unwrap();
                if dev_path.ends_with("src-tauri") { dev_path.pop(); }
                dev_path.push("resources");
                dev_path.push("firmware");
                dev_path.push("MicroPython");
                dev_path.push(&model);
                dev_path
            }
        };

        if !firmware_dir.exists() {
            return Err(format!("Firmware directory not found: {:?}", firmware_dir));
        }

        fs::read_dir(&firmware_dir)
            .map_err(|e| format!("Failed to read firmware dir {:?}: {}", firmware_dir, e))?
            .filter_map(|entry| entry.ok())
            .find(|entry| entry.path().extension().map_or(false, |ext| ext == "uf2"))
            .ok_or_else(|| format!("No .uf2 file found in {:?}", firmware_dir))?
            .path()
    };

    // 2. 尋找 RPI-RP2 磁碟
    #[cfg(target_os = "windows")]
    let burn_target = {
        let mut target = None;
        for letter in b'D'..=b'Z' {
            let drive = format!("{}:\\", letter as char);
            let path = std::path::Path::new(&drive);
            if path.exists() && path.join("INFO_UF2.TXT").exists() {
                target = Some(path.to_path_buf());
                break;
            }
        }
        target.ok_or_else(|| "Please put MCU into BOOTSEL mode (RPI-RP2 drive not found)".to_string())?
    };

    // 3. 執行燒錄 (複製 UF2)
    let dest_uf2 = burn_target.join(uf2_file.file_name().unwrap());
    fs::copy(&uf2_file, &dest_uf2).map_err(|e| format!("Failed to burn UF2: {}", e))?;

    if !should_clear { return Ok(()); }

    // 4. 輪詢等待 CIRCUITPY 磁碟重啟 (最多等 15 秒)
    let mut circuit_py_drive = None;
    for _ in 0..15 {
        std::thread::sleep(std::time::Duration::from_secs(1));
        for letter in b'D'..=b'Z' {
            let drive = format!("{}:\\", letter as char);
            let path = std::path::Path::new(&drive);
            if path.exists() && (path.join("boot_out.txt").exists() || path.join("code.txt").exists()) {
                circuit_py_drive = Some(path.to_path_buf());
                break;
            }
        }
        if circuit_py_drive.is_some() { break; }
    }

    // 5. 自動寫入空的 code.py
    if let Some(drive) = circuit_py_drive {
        let code_path = drive.join("code.py");
        let default_content = "# Empty project\nprint(\"Cocoya Firmware Reset Done!\")\n";
        let _ = fs::write(code_path, default_content);
    }

    Ok(())
}

#[tauri::command]
async fn save_file(window: Window, handle: tauri::AppHandle, state: State<'_, AppState>, xml: String, save_as: bool) -> Result<String, String> {
    let mut path_to_save = {
        let paths = state.current_paths.lock().unwrap();
        if save_as { None } else { paths.get(window.label()).cloned() }
    };

    if path_to_save.is_none() {
        let picked = handle.dialog().file()
            .add_filter("Cocoya XML", &["xml"])
            .set_file_name("project.xml")
            .blocking_save_file();
        
        if let Some(p) = picked {
            let path = p.into_path().map_err(|_| "Failed to parse save path".to_string())?;
            path_to_save = Some(path);
        } else {
            return Err("Canceled".into());
        }
    }

    if let Some(path) = path_to_save {
        fs::write(&path, &xml).map_err(|e| e.to_string())?;
        let filename = path.file_name().unwrap().to_str().unwrap().to_string();
        
        {
            let mut paths = state.current_paths.lock().unwrap();
            paths.insert(window.label().to_string(), path);
        }
        Ok(filename)
    } else {
        Err("No path".into())
    }
}

#[derive(serde::Serialize)]
struct SerialPortResult {
    port: String,
    label: String,
    vid: Option<String>,
    pid: Option<String>,
}

#[tauri::command]
fn get_serial_ports() -> Result<Vec<SerialPortResult>, String> {
    let ports = serialport::available_ports().map_err(|e| e.to_string())?;
    let mut results = Vec::new();

    for p in ports {
        let mut port_info = SerialPortResult {
            port: p.port_name.clone(),
            label: p.port_name.clone(),
            vid: None,
            pid: None,
        };

        if let serialport::SerialPortType::UsbPort(info) = p.port_type {
            let vid_hex = format!("{:04X}", info.vid);
            let pid_hex = format!("{:04X}", info.pid);
            port_info.vid = Some(vid_hex.clone());
            port_info.pid = Some(pid_hex.clone());

            // --- 智慧標籤辨識 (Smart Labeling) ---
            let hw_name = match (vid_hex.as_str(), pid_hex.as_str()) {
                ("2E8A", "0005") => "Maker Pi RP2040",
                ("2E8A", "0003") => "Raspberry Pi Pico",
                ("303A", _) => "XIAO / ESP32-S3",
                ("10C4", "EA60") => "Silicon Labs CP210x",
                ("1A86", "7523") => "CH340 (Arduino)",
                _ => "USB Serial",
            };

            port_info.label = format!("{} ({})", p.port_name, hw_name);
        }

        results.push(port_info);
    }

    Ok(results)
}

fn get_deployer_path(handle: &tauri::AppHandle) -> std::path::PathBuf {
    let resource_path = handle.path().resolve("resources/deploy_mcu.py", tauri::path::BaseDirectory::Resource);
    match resource_path {
        Ok(p) if p.exists() => p,
        _ => {
            let mut dev_path = std::env::current_dir().unwrap();
            if dev_path.ends_with("src-tauri") { dev_path.pop(); }
            dev_path.push("resources");
            dev_path.push("deploy_mcu.py");
            dev_path
        }
    }
}

#[tauri::command]
async fn setup_stable_mode(handle: tauri::AppHandle, port: String, lang: String) -> Result<(), String> {
    let python_path = "python"; 
    let script_path = get_deployer_path(&handle);

    Command::new(python_path)
        .arg(script_path)
        .arg(port)
        .arg("--setup-stable")
        .arg("--lang")
        .arg(&lang)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn deploy_mcu(
    window: Window,
    state: State<'_, AppState>,
    handle: tauri::AppHandle,
    python_path: String,
    port: String,
    code: String,
    serial_upload_only: bool,
    lang: String,
) -> Result<(), String> {
    // 0. 釋放序列埠 (停止該視窗舊的監控或程式)
    stop_python(window.clone(), state.clone()).await?;

    // 1. 準備暫存檔案
    let temp_dir = std::env::temp_dir().join("cocoya_tauri");
    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    }
    let script_path = temp_dir.join(format!("mcu_code_{}.py", window.label()));
    fs::write(&script_path, &code).map_err(|e| e.to_string())?;

    // 2. 獲取 deploy_mcu.py 路徑
    let deployer_path = get_deployer_path(&handle);

    // 3. 啟動部署進程 (使用 -u 確保即時輸出)
    let mut cmd = Command::new(&python_path);
    cmd.arg("-u")
        .arg(&deployer_path)
        .arg(&port)
        .arg(&script_path)
        .arg("--lang")
        .arg(&lang)
        .arg("--tauri");
    
    // 如果不是僅上傳，預設會進入 monitor 模式
    if serial_upload_only {
        cmd.arg("--no-monitor");
    }

    let mut child = cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to execute deployer: {}", e))?;

    let mut stdout = child.stdout.take().unwrap();
    let mut stderr = child.stderr.take().unwrap();

    // 4. 將進程存入狀態
    {
        let mut procs = state.python_processes.lock().unwrap();
        procs.insert(window.label().to_string(), child);
    }

    // 5. 即時轉發日誌
    let window_clone = window.clone();
    std::thread::spawn(move || {
        use std::io::Read;
        let mut buffer = [0; 1024];
        while let Ok(n) = stdout.read(&mut buffer) {
            if n == 0 { break; }
            let s = String::from_utf8_lossy(&buffer[..n]).to_string();
            let _ = window_clone.emit("python-log", s);
        }
    });

    let window_clone_err = window.clone();
    std::thread::spawn(move || {
        use std::io::Read;
        let mut buffer = [0; 1024];
        while let Ok(n) = stderr.read(&mut buffer) {
            if n == 0 { break; }
            let s = String::from_utf8_lossy(&buffer[..n]).to_string();
            let _ = window_clone_err.emit("python-error", s);
        }
    });

    Ok(())
}

#[tauri::command]
async fn open_serial_monitor(
    window: Window,
    state: State<'_, AppState>,
    handle: tauri::AppHandle,
    port: String,
    python_path: String,
    lang: String,
) -> Result<(), String> {
    // 1. 停止該視窗舊的監控或程式
    stop_python(window.clone(), state.clone()).await?;

    let script_path = get_deployer_path(&handle);

    // 2. 啟動監控進程 (加入 -u 確保即時輸出)
    let mut child = Command::new(&python_path)
        .arg("-u")
        .arg(&script_path)
        .arg(&port)
        .arg("--monitor-only")
        .arg("--lang")
        .arg(&lang)
        .arg("--tauri")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start serial monitor with {}: {}", python_path, e))?;

    let mut stdout = child.stdout.take().unwrap();
    let mut stderr = child.stderr.take().unwrap();

    // 3. 存入狀態以便停止
    {
        let mut procs = state.python_processes.lock().unwrap();
        procs.insert(window.label().to_string(), child);
    }

    // 4. 即時轉發日誌 (使用 lossy 避免編碼報錯)
    let window_clone = window.clone();
    std::thread::spawn(move || {
        use std::io::Read;
        let mut buffer = [0; 1024];
        while let Ok(n) = stdout.read(&mut buffer) {
            if n == 0 { break; }
            let s = String::from_utf8_lossy(&buffer[..n]).to_string();
            let _ = window_clone.emit("python-log", s);
        }
    });

    let window_clone_err = window.clone();
    std::thread::spawn(move || {
        use std::io::Read;
        let mut buffer = [0; 1024];
        while let Ok(n) = stderr.read(&mut buffer) {
            if n == 0 { break; }
            let s = String::from_utf8_lossy(&buffer[..n]).to_string();
            let _ = window_clone_err.emit("python-error", s);
        }
    });

    Ok(())
}
#[tauri::command]
async fn erase_filesystem(
    window: Window, 
    state: State<'_, AppState>,
    handle: tauri::AppHandle, 
    port: String,
    python_path: String,
    lang: String,
) -> Result<(), String> {
    // 0. 釋放序列埠
    stop_python(window.clone(), state.clone()).await?;

    let script_path = get_deployer_path(&handle);
    println!(">>> [Erase] Python: {}, Script: {}, Port: {}", python_path, script_path.display(), port);

    if !script_path.exists() {
        return Err(format!("Deployer script not found at {:?}", script_path));
    }

    // 1. 啟動進程
    let mut child = Command::new(&python_path)
        .arg("-u") 
        .arg(&script_path)
        .arg(&port)
        .arg("--erase-filesystem")
        .arg("--lang")
        .arg(&lang)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start erase process ({}): {}", python_path, e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    // 2. 轉發日誌 (讓 Loading 視窗下方的 Console 也能看到進度)
    let window_clone = window.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = window_clone.emit("python-log", l);
            }
        }
    });

    let window_clone_err = window.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = window_clone_err.emit("python-error", l);
            }
        }
    });

    // 3. 等待完成
    let status = child.wait().map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("Erase process failed. Check log for details.".into());
    }

    // 4. 緩衝等待重啟
    std::thread::sleep(std::time::Duration::from_secs(5));

    Ok(())
}

#[tauri::command]
async fn create_window(handle: tauri::AppHandle) -> Result<(), String> {
    tauri::WebviewWindowBuilder::new(&handle, format!("window-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()), tauri::WebviewUrl::App("index.html".into()))
        .title("Cocoya Blockly Editor")
        .inner_size(1200.0, 800.0)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn set_window_title(window: Window, title: String) -> Result<(), String> {
    window.set_title(&title).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn pick_python_path(handle: tauri::AppHandle) -> Result<String, String> {
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
fn get_version(handle: tauri::AppHandle) -> String {
    handle.package_info().version.to_string()
}

#[tauri::command]
async fn check_environment(python_path: String) -> Result<HashMap<String, bool>, String> {
    let check_script = r#"
import importlib.util
import json
import sys

modules = ['cv2', 'mediapipe', 'PIL', 'serial']
results = {}
for m in modules:
    results[m] = importlib.util.find_spec(m) is not None
print(json.dumps(results))
"#;

    let mut cmd = Command::new(&python_path);
    cmd.arg("-c").arg(check_script);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().map_err(|e| format!("Failed to run Python: {}", e))?;

    if output.status.success() {
        let out_str = String::from_utf8_lossy(&output.stdout);
        let results: HashMap<String, bool> = serde_json::from_str(out_str.trim()).map_err(|e| e.to_string())?;
        Ok(results)
    } else {
        // 如果 Python 執行失敗（例如路徑錯誤），則全部視為 false
        let mut results = HashMap::new();
        results.insert("cv2".to_string(), false);
        results.insert("mediapipe".to_string(), false);
        results.insert("PIL".to_string(), false);
        results.insert("serial".to_string(), false);
        Ok(results)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            python_processes: Arc::new(Mutex::new(HashMap::new())),
            current_paths: Arc::new(Mutex::new(HashMap::new())),
        })
        .invoke_handler(tauri::generate_handler![
            run_python, 
            stop_python,
            get_manifest,
            get_module_toolbox,
            open_file,
            save_file,
            get_serial_ports,
            deploy_mcu,
            open_serial_monitor,
            setup_stable_mode,
            erase_filesystem,
            auto_backup,
            clear_backup,
            reject_recovery,
            reset_firmware,
            create_window,
            set_window_title,
            pick_python_path,
            get_version,
            check_environment
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
