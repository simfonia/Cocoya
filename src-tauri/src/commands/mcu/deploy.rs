// P2-5（2026-10-03）自 mcu.rs 拆分。MCU 韌體上傳（deploy_mcu.py） 
//! 對外 API（#[tauri::command] 與 pub 函式）維持不變，由 mod.rs 以 pub use 重新導出。


use std::process::{Child, Command, Stdio};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::sync::{Arc, Mutex, mpsc};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State, Window};
use crate::state::AppState;
use crate::utils::get_deployer_path;
use crate::commands::python::stop_python;

use super::board::detect_board_type_by_port;
use super::raw_dump::{configure_serial_raw_dump, resolve_serial_raw_dump_path};
use super::stream::{forward_stream_with_backpressure, forward_stream_with_controls, StreamMarker};

type UploadLeaseStdin = Arc<Mutex<Option<std::process::ChildStdin>>>;

fn acquire_hub_upload_lease(
    python_path: &str,
    hub_script: &std::path::Path,
    port: &str,
    lang: &str,
) -> Result<(Child, UploadLeaseStdin), String> {
    let mut command = Command::new(python_path);
    command.arg("-u")
        .arg(hub_script)
        .arg("--lease")
        .arg(port)
        .arg("115200")
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    let mut child = command.spawn().map_err(|error| format!("SERIAL_HUB_START_FAILED: {}", error))?;
    let stdout = child.stdout.take().ok_or_else(|| "SERIAL_HUB_START_FAILED: missing helper stdout".to_string())?;
    let stdin = child.stdin.take().ok_or_else(|| "SERIAL_HUB_START_FAILED: missing helper stdin".to_string())?;
    let (sender, receiver) = mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let mut line = String::new();
        let result = BufReader::new(stdout).read_line(&mut line).map(|_| line);
        let _ = sender.send(result);
    });

    let line = match receiver.recv_timeout(Duration::from_secs(10)) {
        Ok(Ok(line)) => line,
        Ok(Err(error)) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("SERIAL_HUB_START_FAILED: {}", error));
        }
        Err(_) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err("SERIAL_HUB_START_TIMEOUT".to_string());
        }
    };

    if !line.trim().eq("__COCOYA_UPLOAD_LEASE_READY__") {
        let _ = child.wait();
        let code = line.trim().strip_prefix("__COCOYA_UPLOAD_LEASE_ERROR__:")
            .unwrap_or("SERIAL_PORT_BUSY");
        let hint = if lang == "zh-hant" {
            format!("序列埠 {} 目前由其他視窗或程式寫入／占用，請關閉佔用的視窗或序列埠程式後再試。", port)
        } else {
            format!("Serial port {} is in use. Close the window or serial application using it, then try again.", port)
        };
        return Err(format!("{}: {}", code, hint));
    }

    let lease_stdin = Arc::new(Mutex::new(Some(stdin)));
    Ok((child, lease_stdin))
}

fn release_hub_upload_lease(lease_stdin: &UploadLeaseStdin) {
    let mut stdin_guard = lease_stdin.lock().unwrap();
    if let Some(mut stdin) = stdin_guard.take() {
        let _ = stdin.write_all(b"RELEASE\n");
        let _ = stdin.flush();
    }
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
    raw_dump_enabled: Option<bool>,
) -> Result<(), String> {
    let raw_dump_enabled = raw_dump_enabled.unwrap_or(false);
    // 驗證錨定必須在停止既有程序之前完成，避免設定錯誤時中斷目前工作。
    resolve_serial_raw_dump_path(&state, window.label(), raw_dump_enabled)?;
    let temp_dir = std::env::temp_dir().join("cocoya_tauri");
    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    }
    let script_path = temp_dir.join(format!("mcu_code_{}.py", window.label()));
    fs::write(&script_path, &code).map_err(|e| e.to_string())?;

    let deployer_path = get_deployer_path(&handle);
    let hub_script = deployer_path.parent().unwrap_or_else(|| std::path::Path::new("."))
        .join("deploy").join("serial_hub.py");

    // 根據 VID/PID 偵測板子類型
    let board_type = detect_board_type_by_port(&port);

    let mut cmd = Command::new(&python_path);
    // 編碼修復（對齊 PC run_python）：Windows pipe 下 Python 預設輸出 cp950，
    // 使 deploy_mcu.py 的中文訊息（MESSAGES zh-hant）以 UTF-8 輸出，Rust 端 from_utf8_lossy 解讀才不會亂碼
    cmd.env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1");
    let serial_hub_path = get_deployer_path(&handle)
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .join("deploy")
        .join("serial_hub.py");
    cmd.env("COCOYA_SERIAL_HUB_ENABLED", "1")
        .env("COCOYA_SERIAL_HUB_SCRIPT", serial_hub_path);
    configure_serial_raw_dump(
        &mut cmd,
        &state,
        window.label(),
        raw_dump_enabled,
    )?;
    cmd.arg("-u")
        .arg(&deployer_path)
        .arg(&port)
        .arg(&script_path)
        .arg("--lang")
        .arg(&lang)
        .arg("--tauri")
        .arg("--board-type")
        .arg(&board_type);

    if serial_upload_only {
        cmd.arg("--no-monitor");
    }

    // Acquire before stopping any existing PC process: a busy writer must fail without
    // destroying the process that currently owns the user's serial-write lease.
    let (mut lease_child, lease_stdin) = acquire_hub_upload_lease(
        &python_path, &hub_script, &port, &lang
    )?;
    if let Err(error) = stop_python(window.clone(), state.clone()).await {
        release_hub_upload_lease(&lease_stdin);
        let _ = lease_child.wait();
        return Err(error);
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW：隱藏 python console 黑窗（對齊 python.rs run_python）
    }

    cmd.env("COCOYA_SERIAL_HUB_EXTERNAL_UPLOAD_LEASE", "1");
    let mut child = match cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn() {
        Ok(child) => child,
        Err(error) => {
            release_hub_upload_lease(&lease_stdin);
            let _ = lease_child.wait();
            return Err(format!("Failed to execute deployer: {}", error));
        }
    };

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    {
        let mut procs = state.python_processes.lock().unwrap();
        procs.insert(window.label().to_string(), child);
    }

    let own_label = window.label().to_string();
    let generation = state.serial_monitor_registry.next_generation();
    state.serial_monitor_registry.register_deploy(&own_label, port.clone(), generation);
    let pending = state.serial_monitor_registry.snapshot(&own_label);
    let _ = window.emit_to(&own_label, "serial-monitor-state", pending);

    let marker_registry = state.serial_monitor_registry.clone();
    let marker_window = window.clone();
    let marker_label = own_label.clone();
    let active_lease_stdin = lease_stdin.clone();
    let active_marker = StreamMarker {
        token: "__COCOYA_MONITOR_ACTIVE__\n",
        on_detected: std::sync::Arc::new(move || {
            release_hub_upload_lease(&active_lease_stdin);
            if let Some(snapshot) = marker_registry.start_deploy_monitor(&marker_label, generation) {
                let _ = marker_window.emit_to(&marker_label, "serial-monitor-state", snapshot);
            }
        }),
    };

    let connected_registry = state.serial_monitor_registry.clone();
    let connected_window = window.clone();
    let connected_label = own_label.clone();
    let connected_marker = StreamMarker {
        token: "__COCOYA_SERIAL_CONNECTED__\n",
        on_detected: std::sync::Arc::new(move || {
            if let Some(snapshot) = connected_registry.set_connected(&connected_label, generation, true) {
                let _ = connected_window.emit_to(&connected_label, "serial-monitor-state", snapshot);
            }
        }),
    };

    let disconnected_registry = state.serial_monitor_registry.clone();
    let disconnected_window = window.clone();
    let disconnected_label = own_label.clone();
    let disconnected_marker = StreamMarker {
        token: "__COCOYA_SERIAL_DISCONNECTED__\n",
        on_detected: std::sync::Arc::new(move || {
            if let Some(snapshot) = disconnected_registry.set_connected(&disconnected_label, generation, false) {
                let _ = disconnected_window.emit_to(&disconnected_label, "serial-monitor-state", snapshot);
            }
        }),
    };

    let finished_registry = state.serial_monitor_registry.clone();
    let finished_window = window.clone();
    let finished_label = own_label.clone();
    let finished_lease_stdin = lease_stdin.clone();
    std::thread::spawn(move || {
        let _ = lease_child.wait();
    });

    forward_stream_with_controls(
        stdout,
        window.clone(),
        own_label.clone(),
        "python-log",
        None,
        Some("serial-monitor-stopped"),
        vec![active_marker, connected_marker, disconnected_marker],
        Some(std::sync::Arc::new(move || {
            release_hub_upload_lease(&finished_lease_stdin);
            if let Some(snapshot) = finished_registry.finish(&finished_label, generation) {
                let _ = finished_window.emit_to(&finished_label, "serial-monitor-state", snapshot);
            }
        })),
    );

    forward_stream_with_backpressure(
        stderr,
        window.clone(),
        own_label,
        "python-error",
        None,
        None,
    );

    Ok(())
}
