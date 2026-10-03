// P2-5（2026-10-03）自 mcu.rs 拆分。MCU 檔案系統重建與韌體重置（esptool / UF2） 
//! 對外 API（#[tauri::command] 與 pub 函式）維持不變，由 mod.rs 以 pub use 重新導出。


use std::io::{BufReader, BufRead};
use std::process::{Command, Stdio};
use std::fs;
use tauri_plugin_dialog::DialogExt;
use tauri::{AppHandle, Emitter, State, Window};
use crate::state::AppState;
use crate::utils::{get_deployer_path, get_firmware_dir};
use crate::commands::python::stop_python;

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

    let mut erase_cmd = Command::new(&python_path);
    // 編碼修復（對齊 deploy_mcu）：--erase-filesystem 同樣經 deploy_mcu.py 輸出中文，強制 UTF-8
    erase_cmd.env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        erase_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW：隱藏 python console 黑窗（對齊 python.rs run_python）
    }
    let mut child = erase_cmd
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

    let own_label = window.label().to_string();

    let erase_stdout_label = own_label.clone();

    let window_clone = window.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = window_clone.emit_to(&erase_stdout_label, "python-log", l);
            }
        }
    });

    let erase_stderr_label = own_label.clone();

    let window_clone_err = window.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = window_clone_err.emit_to(&erase_stderr_label, "python-error", l);
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

/// P1-6 F1：燒錄韌體時的 Python 直譯器選擇。
/// 使用者可在硬體頁設定自訂 Python 路徑（venv、conda、pyenv…）；esptool 必須安裝在
/// **同一個**直譯器環境才能 `python -m esptool` 運作，硬編碼 "python" 會讓燒錄失敗。
/// 空值或全空白時回退 "python"（交由 PATH 解析，維持舊行為）。
fn reset_firmware_python(python_path: &Option<String>) -> &str {
    match python_path {
        Some(p) if !p.trim().is_empty() => p.trim(),
        _ => "python",
    }
}

#[tauri::command]
pub async fn reset_firmware(
    window: Window,
    state: State<'_, AppState>,
    handle: AppHandle, 
    model: String, 
    should_clear: bool,
    serial_port: Option<String>,
    // P1-6 F1：原硬編碼 Command::new("python")，會忽略使用者於硬體頁設定的 Python 路徑
    // → 若使用者指向 venv/自訂安裝，esptool 會因裝在該環境而燒錄失敗（且 PATH 上的
    // python 可能根本不存在或版本不符）。改為接收 python_path，缺空值才回退 "python"。
    python_path: Option<String>,
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
        // serial_port is Option<String>; serial mode requires a non-empty port
        let serial_port: String = serial_port
            .filter(|s| !s.is_empty())
            .ok_or_else(|| "Serial port is required for serial mode".to_string())?;

        stop_python(window.clone(), state.clone()).await?;

        // 偵測是否為 ESP32-S3 (根據目錄名或型號)
        let chip = if model.contains("ESP32_S3") { "esp32s3" } else { "auto" };

        let mut cmd = Command::new(reset_firmware_python(&python_path));
        // 編碼修復（對齊 PC run_python）：esptool 輸出經 Rust from_utf8_lossy 解讀，強制 UTF-8 避免 cp950 亂碼
        cmd.env("PYTHONIOENCODING", "utf-8")
            .env("PYTHONUTF8", "1");
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

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW：隱藏 esptool console 黑窗（對齊 python.rs run_python）
        }

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

        let own_label = window.label().to_string();
        let reset_stdout_label = own_label.clone();

        let window_clone = window.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(l) = line {
                    let _ = window_clone.emit_to(&reset_stdout_label, "python-log", l);
                }
            }
        });

        let reset_stderr_label = own_label.clone();

        let window_clone_err = window.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(l) = line {
                    let _ = window_clone_err.emit_to(&reset_stderr_label, "python-error", l);
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