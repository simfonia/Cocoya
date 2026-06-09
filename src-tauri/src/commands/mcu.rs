use std::process::{Command, Stdio};
use std::io::{BufReader, BufRead};
use std::fs;
use tauri::{AppHandle, State, Window, Emitter};
use tauri_plugin_dialog::DialogExt;
use crate::state::AppState;
use crate::utils::{get_deployer_path, get_firmware_dir};
use crate::commands::python::stop_python;

#[derive(serde::Serialize)]
pub struct SerialPortResult {
    pub port: String,
    pub label: String,
    pub vid: Option<String>,
    pub pid: Option<String>,
}

#[tauri::command]
pub fn get_serial_ports() -> Result<Vec<SerialPortResult>, String> {
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

#[tauri::command]
pub async fn setup_stable_mode(handle: AppHandle, port: String, lang: String) -> Result<(), String> {
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
pub async fn deploy_mcu(
    window: Window,
    state: State<'_, AppState>,
    handle: AppHandle,
    python_path: String,
    port: String,
    code: String,
    serial_upload_only: bool,
    lang: String,
) -> Result<(), String> {
    stop_python(window.clone(), state.clone()).await?;

    let temp_dir = std::env::temp_dir().join("cocoya_tauri");
    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    }
    let script_path = temp_dir.join(format!("mcu_code_{}.py", window.label()));
    fs::write(&script_path, &code).map_err(|e| e.to_string())?;

    let deployer_path = get_deployer_path(&handle);

    let mut cmd = Command::new(&python_path);
    cmd.arg("-u")
        .arg(&deployer_path)
        .arg(&port)
        .arg(&script_path)
        .arg("--lang")
        .arg(&lang)
        .arg("--tauri");
    
    if serial_upload_only {
        cmd.arg("--no-monitor");
    }

    let mut child = cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to execute deployer: {}", e))?;

    let mut stdout = child.stdout.take().unwrap();
    let mut stderr = child.stderr.take().unwrap();

    {
        let mut procs = state.python_processes.lock().unwrap();
        procs.insert(window.label().to_string(), child);
    }

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
pub async fn open_serial_monitor(
    window: Window,
    state: State<'_, AppState>,
    handle: AppHandle,
    port: String,
    python_path: String,
    lang: String,
) -> Result<(), String> {
    stop_python(window.clone(), state.clone()).await?;

    let script_path = get_deployer_path(&handle);

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

    {
        let mut procs = state.python_processes.lock().unwrap();
        procs.insert(window.label().to_string(), child);
    }

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
pub async fn erase_filesystem(
    window: Window, 
    state: State<'_, AppState>,
    handle: AppHandle, 
    port: String,
    python_path: String,
    lang: String,
) -> Result<(), String> {
    stop_python(window.clone(), state.clone()).await?;

    let script_path = get_deployer_path(&handle);

    if !script_path.exists() {
        return Err(format!("Deployer script not found at {:?}", script_path));
    }

    let mut child = Command::new(&python_path)
        .arg("-u") 
        .arg(&script_path)
        .arg(&port)
        .arg("--erase-filesystem")
        .arg("--lang")
        .arg(&lang)
        .arg("--tauri")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start erase process ({}): {}", python_path, e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

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

    let status = child.wait().map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("Erase process failed. Check log for details.".into());
    }

    std::thread::sleep(std::time::Duration::from_secs(5));

    Ok(())
}

#[tauri::command]
pub async fn reset_firmware(
    window: Window,
    state: State<'_, AppState>,
    handle: AppHandle, 
    model: String, 
    should_clear: bool,
    serial_port: String,
) -> Result<(), String> {
    let firmware_dir = if model == "custom" {
        None
    } else {
        // --- 關鍵對應：將 UI ID 映射到實際目錄 ---
        let sub_dir = if model.contains("CAMERA") {
            "XIAO_ESP32_S3/Sense_microPython"
        } else if model.contains("FACTORY") {
            "XIAO_ESP32_S3/Sense_Factory"
        } else if model.contains("RP2040") {
            "MakerPi_RP2040"
        } else {
            "XIAO_ESP32_S3" // Default fallback
        };

        let dir = get_firmware_dir(&handle, sub_dir);
        if !dir.exists() {
            return Err(format!("Firmware directory not found: {:?}", dir));
        }
        Some(dir)
    };

    // 1. 決定燒錄參數 (單一檔案 或 多段組態)
    let mut flash_segments: Vec<(String, std::path::PathBuf)> = Vec::new();
    let is_serial = model.contains("CAMERA") || model.contains("FACTORY") || model == "custom";

    if model == "custom" {
        // ... (保持原本的 custom 邏輯) ...
        let picked = handle.dialog().file()
            .add_filter("Firmware", &["uf2", "bin"])
            .blocking_pick_file()
            .ok_or_else(|| "Canceled".to_string())?;
        let path = picked.into_path().map_err(|_| "Failed to parse path".to_string())?;
        flash_segments.push(("0x0".to_string(), path));
    } else {
        let dir = firmware_dir.as_ref().unwrap();
        
        // 檢查是否有專案組態檔 (支援多段燒錄)
        let config_path = dir.join("project_config.json");
        if is_serial && config_path.exists() {
            let config_str = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
            let config: serde_json::Value = serde_json::from_str(&config_str).map_err(|e| e.to_string())?;
            
            // 尋找匹配的專案 (例如 xiao_esp32_sense_factory)
            let project_key = if model.contains("SENSE") { "xiao_esp32_sense_factory" } else { "xiao_esp32_factory" };
            if let Some(files) = config.get(project_key).and_then(|v| v.as_object()) {
                for (addr, filename) in files {
                    let f_name = filename.as_str().unwrap();
                    let f_path = dir.join(f_name);
                    if f_path.exists() {
                        flash_segments.push((addr.clone(), f_path));
                    }
                }
            }
        }

        // 如果沒有組態，搜尋目錄下的第一個 bin/uf2
        if flash_segments.is_empty() {
            let files: Vec<_> = fs::read_dir(dir)
                .map_err(|e| e.to_string())?
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .collect();

            if is_serial {
                let bin = files.iter().find(|p| p.extension().map_or(false, |ext| ext == "bin"))
                    .ok_or_else(|| "No .bin file found for serial mode".to_string())?;
                flash_segments.push(("0x0".to_string(), bin.clone()));
            } else {
                let uf2 = files.iter().find(|p| p.extension().map_or(false, |ext| ext == "uf2"))
                    .ok_or_else(|| "No .uf2 file found for UF2 mode".to_string())?;
                flash_segments.push(("UF2".to_string(), uf2.clone()));
            }
        }
    }

    // 2. 執行燒錄
    if is_serial {
        // --- B 方案：Serial 模式 (esptool) ---
        if serial_port.is_empty() {
            return Err("Serial port is required for serial mode".into());
        }

        stop_python(window.clone(), state.clone()).await?;

        // 偵測是否為 ESP32-S3 (根據目錄名或型號)
        let chip = if model.contains("ESP32_S3") { "esp32s3" } else { "auto" };

        let mut cmd = Command::new("python");
        cmd.arg("-m")
            .arg("esptool")
            .arg("--chip")
            .arg(chip)
            .arg("--port")
            .arg(&serial_port)
            .arg("--baud")
            .arg("921600")
            .arg("--before")
            .arg("default-reset")
            .arg("--after")
            .arg("hard-reset")
            .arg("write-flash")
            .arg("-z")
            .arg("--flash-mode")
            .arg("dio")
            .arg("--flash-freq")
            .arg("80m")
            .arg("--flash-size")
            .arg("8MB");

        // 加入所有片段
        for (addr, path) in flash_segments {
            cmd.arg(addr).arg(path);
        }

        let mut child = cmd.stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start esptool: {}", e))?;

        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();

        {
            let mut procs = state.python_processes.lock().unwrap();
            procs.insert(window.label().to_string(), child);
        }

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

        // 這裡不一定要 wait，因為我們已經在串流了，但燒錄韌體通常希望前端知道何時結束
        // 為了簡單起見，我們讓它非同步執行，前端透過日誌觀察進度即可
        return Ok(());
    } else {
        // --- A 方案：UF2 模式 (磁碟複製) ---
        let uf2_file = flash_segments.get(0).map(|s| &s.1).ok_or("UF2 file not found")?;
        
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

        let dest_uf2 = burn_target.join(uf2_file.file_name().unwrap());
        fs::copy(uf2_file, &dest_uf2).map_err(|e| format!("Failed to burn UF2: {}", e))?;

        if !should_clear { return Ok(()); }

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

        if let Some(drive) = circuit_py_drive {
            let code_path = drive.join("code.py");
            let default_content = "# Empty project\nprint(\"Cocoya Firmware Reset Done!\")\n";
            let _ = fs::write(code_path, default_content);
        }
    }

    Ok(())
}
