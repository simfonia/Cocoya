// P2-5（2026-10-03）自 mcu.rs 拆分。MCU 韌體上傳（deploy_mcu.py） 
//! 對外 API（#[tauri::command] 與 pub 函式）維持不變，由 mod.rs 以 pub use 重新導出。


use std::process::{Command, Stdio};
use std::fs;
use tauri::{AppHandle, State, Window};
use crate::state::AppState;
use crate::utils::get_deployer_path;
use crate::commands::python::stop_python;

use super::board::detect_board_type_by_port;
use super::raw_dump::{configure_serial_raw_dump, resolve_serial_raw_dump_path};
use super::stream::forward_stream_with_backpressure;

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
    stop_python(window.clone(), state.clone()).await?;

    let temp_dir = std::env::temp_dir().join("cocoya_tauri");
    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    }
    let script_path = temp_dir.join(format!("mcu_code_{}.py", window.label()));
    fs::write(&script_path, &code).map_err(|e| e.to_string())?;

    let deployer_path = get_deployer_path(&handle);

    // 根據 VID/PID 偵測板子類型
    let board_type = detect_board_type_by_port(&port);

    let mut cmd = Command::new(&python_path);
    // 編碼修復（對齊 PC run_python）：Windows pipe 下 Python 預設輸出 cp950，
    // 使 deploy_mcu.py 的中文訊息（MESSAGES zh-hant）以 UTF-8 輸出，Rust 端 from_utf8_lossy 解讀才不會亂碼
    cmd.env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1");
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

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW：隱藏 python console 黑窗（對齊 python.rs run_python）
    }

    let mut child = cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to execute deployer: {}", e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    {
        let mut procs = state.python_processes.lock().unwrap();
        procs.insert(window.label().to_string(), child);
    }

    let own_label = window.label().to_string();

    forward_stream_with_backpressure(
        stdout,
        window.clone(),
        own_label.clone(),
        "python-log",
        None,
        None,
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
