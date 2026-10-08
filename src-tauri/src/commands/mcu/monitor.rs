// P2-5（2026-10-03）自 mcu.rs 拆分。序列埠監看（開啟/切換/視窗焦點交接與釋放） 
//! 對外 API（#[tauri::command] 與 pub 函式）維持不變，由 mod.rs 以 pub use 重新導出。


use std::process::{Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State, Window};
use crate::state::AppState;
use crate::utils::get_deployer_path;
use crate::commands::python::stop_python;

use super::raw_dump::{configure_serial_raw_dump, resolve_serial_raw_dump_path};
use super::stream::{forward_stream_with_backpressure, forward_stream_with_controls, StreamMarker};

fn emit_monitor_snapshot(window: &Window, label: &str, snapshot: crate::state::SerialMonitorSnapshot) {
    let _ = window.emit_to(label, "serial-monitor-state", snapshot);
}

fn monitor_marker(
    token: &'static str,
    registry: Arc<crate::state::SerialMonitorRegistry>,
    window: Window,
    label: String,
    generation: u64,
    connected: Option<bool>,
) -> StreamMarker {
    StreamMarker {
        token,
        on_detected: Arc::new(move || {
            let snapshot = match connected {
                Some(value) => registry.set_connected(&label, generation, value),
                None => registry.start_dedicated(&label, String::new(), generation),
            };
            if let Some(snapshot) = snapshot {
                emit_monitor_snapshot(&window, &label, snapshot);
            }
        }),
    }
}

#[tauri::command]
pub async fn get_serial_monitor_state(
    window: Window,
    state: State<'_, AppState>,
) -> Result<crate::state::SerialMonitorSnapshot, String> {
    Ok(state.serial_monitor_registry.snapshot(window.label()))
}

pub fn stop_serial_monitor(state: State<'_, AppState>, label: String) -> bool {
    let session_opt = {
        let mut monitors = state.serial_monitors.lock().unwrap();
        monitors.remove(&label)
    };

    if let Some(mut session) = session_opt {
        // 1. 設定停止旗標，使 reader/forwarder thread 能儘速中斷
        session.stopped.store(true, Ordering::SeqCst);

        // 2. 終止進程樹（Windows 下 taskkill /F /T 確保所有子孫完全終止）
        crate::commands::python::kill_tree(&mut session.child);

        // 3. 等待子進程結束（最多等候 1.5 秒）
        let start = Instant::now();
        loop {
            match session.child.try_wait() {
                Ok(Some(_status)) => break,
                Ok(None) => {
                    if start.elapsed() > Duration::from_millis(1500) {
                        let _ = session.child.kill();
                        let _ = session.child.wait();
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(25));
                }
                Err(_) => {
                    let _ = session.child.kill();
                    let _ = session.child.wait();
                    break;
                }
            }
        }

        // 4. 短暫冷卻（100ms），讓 Windows 串列埠驅動徹底釋放 Handle，避免再次上傳或重開時撞到 AccessDenied
        std::thread::sleep(Duration::from_millis(100));
        return true;
    }
    false
}

/// 啟動串列埠監視進程（open_serial_monitor 與重新聚焦自動重取共用）
pub(crate) fn spawn_serial_monitor(
    window: Window,
    state: State<'_, AppState>,
    handle: AppHandle,
    port: String,
    python_path: String,
    lang: String,
    raw_dump_enabled: bool,
) -> Result<(), String> {
    let label = window.label().to_string();
    // 在搶占其他視窗序列埠前先驗證 ProjectRoot。
    resolve_serial_raw_dump_path(&state, &label, raw_dump_enabled)?;

    // 記錄「想要」的監看埠（跨失焦保留，供重新聚焦後自動重開）
    {
        let mut wants = state.serial_wants.lock().unwrap();
        wants.insert(label.clone(), crate::state::SerialMonitorWant {
            port: port.clone(),
            python_path: python_path.clone(),
            lang: lang.clone(),
            raw_dump_enabled,
        });
    }

    let script_path = get_deployer_path(&handle);

    let mut cmd = Command::new(&python_path);
    // 編碼修復（對齊 deploy_mcu）：monitor 轉發 MCU 回傳的中文 print，Host 端必須同樣強制 UTF-8
    cmd.env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1");
    let serial_hub_path = get_deployer_path(&handle)
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .join("deploy")
        .join("serial_hub.py");
    cmd.env("COCOYA_SERIAL_HUB_ENABLED", "1")
        .env("COCOYA_SERIAL_HUB_SCRIPT", serial_hub_path);
    configure_serial_raw_dump(&mut cmd, &state, &label, raw_dump_enabled)?;
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW：隱藏 python console 黑窗（對齊 python.rs run_python）
    }
    let mut child = cmd
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

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    let stopped = Arc::new(AtomicBool::new(false));
    let generation = state.serial_monitor_registry.next_generation();

    {
        let mut monitors = state.serial_monitors.lock().unwrap();
        monitors.insert(
            label.clone(),
            crate::state::SerialMonitorSession {
                generation,
                port: port.clone(),
                python_path: python_path.clone(),
                lang: lang.clone(),
                child: child,
                stopped: stopped.clone(),
            },
        );
    }

    let registry = state.serial_monitor_registry.clone();
    registry.register_dedicated_process(&label, port.clone(), generation);
    if let Some(snapshot) = registry.start_dedicated(&label, port.clone(), generation) {
        emit_monitor_snapshot(&window, &label, snapshot);
    }

    let active_marker = monitor_marker(
        "__COCOYA_MONITOR_ACTIVE__\n",
        registry.clone(),
        window.clone(),
        label.clone(),
        generation,
        None,
    );
    let connected_marker = monitor_marker(
        "__COCOYA_SERIAL_CONNECTED__\n",
        registry.clone(),
        window.clone(),
        label.clone(),
        generation,
        Some(true),
    );
    let disconnected_marker = monitor_marker(
        "__COCOYA_SERIAL_DISCONNECTED__\n",
        registry.clone(),
        window.clone(),
        label.clone(),
        generation,
        Some(false),
    );
    let finished_window = window.clone();
    let finished_label = label.clone();
    let finished_registry = registry.clone();
    let finished_monitors = state.serial_monitors.clone();
    forward_stream_with_controls(
        stdout,
        window.clone(),
        label.clone(),
        "python-log",
        Some(stopped.clone()),
        Some("serial-monitor-stopped"),
        vec![active_marker, connected_marker, disconnected_marker],
        Some(Arc::new(move || {
            if let Some(snapshot) = finished_registry.finish(&finished_label, generation) {
                let finished_session = {
                    let mut monitors = finished_monitors.lock().unwrap();
                    if monitors.get(&finished_label).map(|session| session.generation) == Some(generation) {
                        monitors.remove(&finished_label)
                    } else {
                        None
                    }
                };
                if let Some(mut session) = finished_session {
                    let _ = session.child.wait();
                }
                emit_monitor_snapshot(&finished_window, &finished_label, snapshot);
            }
        })),
    );

    forward_stream_with_backpressure(
        stderr,
        window.clone(),
        label,
        "python-error",
        Some(stopped),
        None,
    );

    Ok(())
}

/// 切換序列埠監看（序列監看按鈕 toggle 用）：
/// 已有啟用中的 monitor → 停止並清除 wants（明確終止意圖，不再自動重取）；
/// 無 → 對指定埠啟動監看。回傳 "opened" / "stopped"。
#[tauri::command]
pub async fn toggle_serial_monitor(
    window: Window,
    state: State<'_, AppState>,
    handle: AppHandle,
    port: Option<String>,
    python_path: Option<String>,
    lang: Option<String>,
    raw_dump_enabled: Option<bool>,
) -> Result<String, String> {
    let label = window.label().to_string();
    if let Some((generation, source)) = state.serial_monitor_registry.current_source(&label) {
        match source {
            crate::state::SerialMonitorSource::Dedicated => {
                let _ = stop_serial_monitor(state.clone(), label.clone());
                let snapshot = state.serial_monitor_registry.finish(&label, generation);
                if let Some(snapshot) = snapshot {
                    emit_monitor_snapshot(&window, &label, snapshot);
                }
            }
            crate::state::SerialMonitorSource::Deploy => {
                stop_python(window.clone(), state.clone()).await?;
            }
        }
        state.serial_wants.lock().unwrap().remove(&label);
        return Ok("stopped".to_string());
    }
    if state.serial_monitor_registry.has_deploy_process(&label) {
        stop_python(window.clone(), state.clone()).await?;
        state.serial_wants.lock().unwrap().remove(&label);
        return Ok("stopped".to_string());
    }
    let _ = stop_serial_monitor(state.clone(), label.clone());
    state.serial_wants.lock().unwrap().remove(&label);
    let port = port.ok_or_else(|| "NO_PORT".to_string())?;
    let pp = python_path.unwrap_or_else(|| "python".to_string());
    let lg = lang.unwrap_or_else(|| "en".to_string());
    let raw_dump_enabled = raw_dump_enabled.unwrap_or(false);
    spawn_serial_monitor(window.clone(), state.clone(), handle, port, pp, lg, raw_dump_enabled)?;
    Ok("opened".to_string())
}

#[tauri::command]
pub async fn open_serial_monitor(
    window: Window,
    state: State<'_, AppState>,
    handle: AppHandle,
    port: String,
    python_path: String,
    lang: String,
    raw_dump_enabled: Option<bool>,
) -> Result<(), String> {
    let raw_dump_enabled = raw_dump_enabled.unwrap_or(false);
    resolve_serial_raw_dump_path(&state, window.label(), raw_dump_enabled)?;
    stop_python(window.clone(), state.clone()).await?;
    let _ = spawn_serial_monitor(
        window.clone(), state.clone(), handle, port, python_path, lang, raw_dump_enabled
    )?;
    Ok(())
}

/// 視窗焦點切換（前端 document blur/focus 事件觸發）。Hub 支援多個讀取訂閱，
/// 因此 blur 不再釋放本視窗 monitor；focus 只恢復意外結束且仍有 wants 的 session。
#[tauri::command]
pub async fn set_window_focus(
    window: Window,
    handle: AppHandle,
    state: State<'_, AppState>,
    focused: bool,
    raw_dump_enabled: Option<bool>,
) -> Result<(), String> {
    let label = window.label().to_string();
    if focused {
        // 部署中或執行中守門：若此視窗已有 python_processes，不可自動重開 serial monitor 造成衝突
        let is_running_or_deploying = {
            let procs = state.python_processes.lock().unwrap();
            procs.contains_key(&label)
        };
        if is_running_or_deploying {
            return Ok(());
        }

        // 使用者可能在 monitor 執行期間調整設定；focus 重取前同步 wants 的開關狀態。
        if let Some(enabled) = raw_dump_enabled {
            if let Some(want) = state.serial_wants.lock().unwrap().get_mut(&label) {
                want.raw_dump_enabled = enabled;
            }
        }

        let want: Option<crate::state::SerialMonitorWant> = {
            let wants = state.serial_wants.lock().unwrap();
            wants.get(&label)
                .map(|w| crate::state::SerialMonitorWant {
                    port: w.port.clone(),
                    python_path: w.python_path.clone(),
                    lang: w.lang.clone(),
                    raw_dump_enabled: w.raw_dump_enabled,
                })
        };
        let already_active = {
            let monitors = state.serial_monitors.lock().unwrap();
            monitors.contains_key(&label)
        };
        if let Some(w) = want {
            if !already_active {
                // 略為延遲讓 OS 徹底釋放前一位鎖定的埠，再重開避免衝突
                std::thread::sleep(std::time::Duration::from_millis(400));
                let _ = spawn_serial_monitor(
                    window.clone(), state.clone(), handle,
                    w.port, w.python_path, w.lang, w.raw_dump_enabled
                )?;
            }
        }
    } else {
        // Hub 是實體埠唯一 owner；其他視窗切為前景時，本視窗仍保留自己的讀取訂閱。
    }
    Ok(())
}
