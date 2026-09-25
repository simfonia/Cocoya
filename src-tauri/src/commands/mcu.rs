use std::process::{Command, Stdio};
use std::io::{BufReader, BufRead, Read};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, State, Window, Emitter};
use tauri_plugin_dialog::DialogExt;
use crate::state::AppState;
use crate::utils::{get_deployer_path, get_firmware_dir};
use crate::commands::python::stop_python;

/// 由目前錨定的 XML 檔案推導 Raw Dump 路徑：`<ProjectRoot>/raw_dump.log`。
/// 關閉時回傳 None；開啟但未錨定時拒絕啟動，不猜測或回退到安裝目錄。
fn raw_dump_path_for_project(
    project_file: Option<&Path>,
    enabled: bool,
) -> Result<Option<PathBuf>, String> {
    if !enabled {
        return Ok(None);
    }
    let project_file = project_file.ok_or_else(|| {
        "PROJECT_ROOT_REQUIRED: 請先開啟並儲存 XML 專案，再啟用 MCU 序列埠 Raw Dump".to_string()
    })?;
    let project_root = project_file.parent().ok_or_else(|| {
        format!("PROJECT_ROOT_REQUIRED: 無法由專案檔案推導 ProjectRoot: {}", project_file.display())
    })?;
    Ok(Some(project_root.join("raw_dump.log")))
}

fn resolve_serial_raw_dump_path(
    state: &State<'_, AppState>,
    window_label: &str,
    enabled: bool,
) -> Result<Option<PathBuf>, String> {
    let project_file = {
        let paths = state.current_paths.lock().unwrap();
        paths.get(window_label).cloned()
    };
    raw_dump_path_for_project(project_file.as_deref(), enabled)
}

fn configure_serial_raw_dump(
    cmd: &mut Command,
    state: &State<'_, AppState>,
    window_label: &str,
    enabled: bool,
) -> Result<(), String> {
    match resolve_serial_raw_dump_path(state, window_label, enabled)? {
        Some(path) => {
            cmd.env("COCOYA_SERIAL_RAW_DUMP", "1");
            cmd.env("COCOYA_SERIAL_RAW_DUMP_PATH", path);
        }
        None => {
            // UI 關閉必須是權威狀態，不可意外繼承 shell/父程序既有的診斷旗標。
            cmd.env("COCOYA_SERIAL_RAW_DUMP", "0");
            cmd.env_remove("COCOYA_SERIAL_RAW_DUMP_PATH");
        }
    }
    Ok(())
}

#[cfg(test)]
mod raw_dump_tests {
    use super::raw_dump_path_for_project;
    use std::path::Path;

    #[test]
    fn raw_dump_path_is_project_root_file() {
        let path = raw_dump_path_for_project(Some(Path::new("C:/robot/line.xml")), true)
            .expect("anchored project should resolve");
        assert_eq!(path, Some("C:/robot/raw_dump.log".into()));
    }

    #[test]
    fn raw_dump_requires_anchor_only_when_enabled() {
        assert_eq!(raw_dump_path_for_project(None, false), Ok(None));
        let error = raw_dump_path_for_project(None, true).expect_err("unanchored project must fail");
        assert!(error.starts_with("PROJECT_ROOT_REQUIRED:"));
    }
}

/// UTF-8 chunk 邊界保護：回傳 buf 尾端不完整多位元組序列的位元組數（0 表完整）。
/// 背景：deploy/monitor 以 1024-byte chunk 直通＋from_utf8_lossy 逐塊解碼，
/// 中文字（3 bytes）若被切在邊界會變 �。此函式偵測尾端殘缺序列，呼叫端將其
/// 留到下一批合併後再解碼（對齊 PC run_python 的行式 read_until 完整性）。
fn utf8_incomplete_tail_len(buf: &[u8]) -> usize {
    if buf.is_empty() {
        return 0;
    }
    let mut cont: usize = 0;
    for &b in buf.iter().rev().take(4) {
        if (b & 0xC0) == 0x80 {
            cont += 1;
        } else {
            let expected = if b < 0x80 {
                1
            } else if (b & 0xE0) == 0xC0 {
                2
            } else if (b & 0xF0) == 0xE0 {
                3
            } else if (b & 0xF8) == 0xF0 {
                4
            } else {
                1
            };
            if cont + 1 < expected {
                return cont + 1;
            } else {
                return 0;
            }
        }
    }
    cont
}

/// 具備背壓與時間窗聚合的串流轉發函式
/// 解決高頻 print (如 while True: print("hello")) 造成的 Tauri IPC 洪水與 WebView 卡死
fn forward_stream_with_backpressure<R: Read + Send + 'static>(
    mut reader: R,
    window: Window,
    label: String,
    event_name: &'static str,
    stopped: Option<Arc<AtomicBool>>,
    on_finished_event: Option<&'static str>,
) {
    std::thread::spawn(move || {
        use std::sync::mpsc::sync_channel;
        // 有界通道：最多緩衝 128 個 chunk (~128 KB)，防止記憶體無界膨脹
        let (tx, rx) = sync_channel::<Vec<u8>>(128);
        let dropped_bytes = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let dropped_clone = dropped_bytes.clone();
        let stopped_reader = stopped.clone();

        // 讀取執行緒：以阻塞方式讀取 pipe，在隊列滿時丟棄並記錄 dropped，保證快速清空 stdout pipe 避免 Python 子進程卡死
        let reader_thread = std::thread::spawn(move || {
            let mut buf = [0u8; 1024];
            while let Ok(n) = reader.read(&mut buf) {
                if n == 0 {
                    break;
                }
                if let Some(ref st) = stopped_reader {
                    if st.load(Ordering::SeqCst) {
                        break;
                    }
                }
                let chunk = buf[..n].to_vec();
                if let Err(std::sync::mpsc::TrySendError::Full(_)) = tx.try_send(chunk) {
                    dropped_clone.fetch_add(n, Ordering::Relaxed);
                }
            }
        });

        // 聚合轉發迴圈：以 30ms 時間窗或批次大小累積發送
        const FLUSH_INTERVAL: Duration = Duration::from_millis(30);
        const BATCH_SIZE_THRESHOLD: usize = 4096;
        let mut pending: Vec<u8> = Vec::new();
        let mut last_emit = Instant::now();

        loop {
            if let Some(ref st) = stopped {
                if st.load(Ordering::SeqCst) {
                    break;
                }
            }

            let timeout = FLUSH_INTERVAL.saturating_sub(last_emit.elapsed());
            match rx.recv_timeout(timeout) {
                Ok(chunk) => {
                    pending.extend_from_slice(&chunk);
                    if pending.len() >= BATCH_SIZE_THRESHOLD || last_emit.elapsed() >= FLUSH_INTERVAL {
                        let tail = utf8_incomplete_tail_len(&pending);
                        let split = pending.len() - tail;
                        if split > 0 {
                            let mut s = String::from_utf8_lossy(&pending[..split]).to_string();
                            let dropped = dropped_bytes.swap(0, Ordering::Relaxed);
                            if dropped > 0 {
                                let warn = format!("\n[Cocoya Warning: 序列埠輸出過於頻繁，已略過約 {} KB 日誌]\n", (dropped + 1023) / 1024);
                                s = warn + &s;
                            }
                            let _ = window.emit_to(&label, event_name, s);
                            pending.drain(..split);
                            last_emit = Instant::now();
                        }
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    if !pending.is_empty() {
                        let tail = utf8_incomplete_tail_len(&pending);
                        let split = pending.len() - tail;
                        if split > 0 {
                            let mut s = String::from_utf8_lossy(&pending[..split]).to_string();
                            let dropped = dropped_bytes.swap(0, Ordering::Relaxed);
                            if dropped > 0 {
                                let warn = format!("\n[Cocoya Warning: 序列埠輸出過於頻繁，已略過約 {} KB 日誌]\n", (dropped + 1023) / 1024);
                                s = warn + &s;
                            }
                            let _ = window.emit_to(&label, event_name, s);
                            pending.drain(..split);
                            last_emit = Instant::now();
                        }
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    // Reader thread 退出 (EOF)
                    break;
                }
            }
        }

        // 清空剩餘資料
        if !pending.is_empty() {
            let mut s = String::from_utf8_lossy(&pending).to_string();
            let dropped = dropped_bytes.swap(0, Ordering::Relaxed);
            if dropped > 0 {
                let warn = format!("\n[Cocoya Warning: 序列埠輸出過於頻繁，已略過約 {} KB 日誌]\n", (dropped + 1023) / 1024);
                s = warn + &s;
            }
            let _ = window.emit_to(&label, event_name, s);
        }

        let _ = reader_thread.join();

        if let Some(finished_event) = on_finished_event {
            let _ = window.emit_to(&label, finished_event, ());
        }
    });
}


#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SerialPortResult {
    pub port: String,
    pub label: String,
    pub vid: Option<String>,
    pub pid: Option<String>,
    /// 細粒度板子 ID（對應 ui/src/modules/hardware/board_defs.js 的 boards key）
    /// 未知板子回空字串，由前端 fallback 手動選板
    pub board_id: String,
}

/// 根據 VID/PID 判斷板子類型（對應 deploy_mcu.py 的 board-type 參數）
/// 返回 "micropython", "pybricks", 或 "auto"（未知時 fallback）
/// 注意：LEGO 系（0694~0698）故意走 "auto"——兩種韌體（官方 SPIKE / Pybricks）
/// 同 VID/PID，VID 判不出韌體；交給 deploy_mcu.py 上傳前 REPL 握手自動分流
/// （pybricks banner → pybricks；spike/prime banner＋無 raw → spike-official）。
fn detect_board_type(vid: Option<&str>, pid: Option<&str>) -> String {
    match (vid, pid) {
        // LEGO SPIKE/Essential/Inventor/Technic/BOOST/City：官方與 Pybricks 韌體
        // 同 VID/PID → 統一走 "auto"，由上傳前 REPL 握手自動分流（見上）
        (Some("0694"), _) => "auto".to_string(),  // SPIKE Prime
        (Some("0695"), _) => "auto".to_string(),  // SPIKE Essential
        (Some("0696"), _) => "auto".to_string(),  // Robot Inventor
        (Some("0693"), _) => "auto".to_string(),  // Technic Hub
        (Some("0697"), _) => "auto".to_string(),  // BOOST Move Hub
        (Some("0698"), _) => "auto".to_string(),  // City Hub
        // MicroPython 生態系
        (Some("2E8A"), _) => "micropython".to_string(),  // Raspberry Pi (Pico / Maker Pi)
        (Some("303A"), _) => "micropython".to_string(),  // Espressif ESP32-S3 (XIAO)
        (Some("0D28"), _) => "micropython".to_string(),  // Micro:bit V1/V2
        (Some("10C4"), _) => "micropython".to_string(),  // Silicon Labs CP210x
        (Some("1A86"), _) => "micropython".to_string(),  // CH340 (Arduino)
        // 未知：交給 deploy_mcu.py 的 auto-detect
        _ => "auto".to_string(),
    }
}

/// 根據 VID/PID 判斷細粒度 boardId（SSOT: ui/src/modules/hardware/board_defs.js 的 vidPid 欄位）
/// 注意：新增板子請先改 board_defs.json，再同步更新此表（未來可改為執行期讀取同一份 JSON）。
/// 通用橋接晶片（CP210x/CH340）無法辨識後端 MCU，回空字串交由前端手動選板。
fn detect_board_id(vid: Option<&str>, pid: Option<&str>) -> String {
    match (vid, pid) {
        (Some("2E8A"), Some("0003")) => "picow".to_string(),
        (Some("2E8A"), Some("0005")) => "maker-pi".to_string(),
        (Some("303A"), _) => "xiao-s3".to_string(),
        (Some("0D28"), _) => "microbit".to_string(),  // Micro:bit V1/V2
        (Some("0694"), Some("0009")) => "spike-prime".to_string(),  // LEGO SPIKE Prime（官方/Pybricks 韌體同 VID/PID）
        _ => String::new(),
    }
}

/// 根據埠名查找對應的 VID/PID 並判斷板子類型
fn detect_board_type_by_port(port: &str) -> String {
    if let Ok(ports) = serialport::available_ports() {
        for p in ports {
            if p.port_name == port {
                if let serialport::SerialPortType::UsbPort(info) = p.port_type {
                    let vid_hex = format!("{:04X}", info.vid);
                    let pid_hex = format!("{:04X}", info.pid);
                    return detect_board_type(Some(&vid_hex), Some(&pid_hex));
                }
            }
        }
    }
    "auto".to_string()
}

/// 列舉序列埠（get_serial_ports 指令與熱插拔輪詢共用）
pub fn list_serial_ports() -> Vec<SerialPortResult> {
    let mut results = Vec::new();
    let Ok(ports) = serialport::available_ports() else { return results; };

    for p in ports {
        let mut port_info = SerialPortResult {
            port: p.port_name.clone(),
            label: p.port_name.clone(),
            vid: None,
            pid: None,
            board_id: String::new(),
        };

        if let serialport::SerialPortType::UsbPort(info) = p.port_type {
            let vid_hex = format!("{:04X}", info.vid);
            let pid_hex = format!("{:04X}", info.pid);
            port_info.vid = Some(vid_hex.clone());
            port_info.pid = Some(pid_hex.clone());
            port_info.board_id = detect_board_id(Some(&vid_hex), Some(&pid_hex));

            let hw_name = match (vid_hex.as_str(), pid_hex.as_str()) {
                ("2E8A", "0005") => "Maker Pi RP2040",
                ("2E8A", "0003") => "Raspberry Pi Pico",
                ("2E8A", _) => "Raspberry Pi (Other)",
                ("303A", _) => "XIAO / ESP32-S3",
                ("0D28", "0204") => "Micro:bit V1",
                ("0D28", "0209") => "Micro:bit V2",
                ("0D28", _) => "Micro:bit",
                ("0694", _) => "LEGO SPIKE Prime",
                ("0695", _) => "LEGO SPIKE Essential",
                ("0696", _) => "LEGO Robot Inventor",
                ("0693", _) => "LEGO Technic Hub",
                ("0697", _) => "LEGO BOOST",
                ("0698", _) => "LEGO City Hub",
                ("10C4", "EA60") => "Silicon Labs CP210x",
                ("1A86", "7523") => "CH340 (Arduino)",
                _ => "USB Serial",
            };

            port_info.label = format!("{} ({})", p.port_name, hw_name);
        }

        results.push(port_info);
    }
    results
}

#[tauri::command]
pub fn get_serial_ports() -> Result<Vec<SerialPortResult>, String> {
    Ok(list_serial_ports())
}

#[tauri::command]
pub async fn setup_stable_mode(handle: AppHandle, port: String, lang: String) -> Result<(), String> {
    let python_path = "python"; 
    let script_path = get_deployer_path(&handle);

    let mut ss_cmd = Command::new(python_path);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        ss_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW：隱藏 python console 黑窗（對齊 python.rs run_python）
    }
    ss_cmd
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

/// 停止指定視窗的串列埠監視 session（失焦釋放與上傳交接用）。
/// 包含安全終止 child 進程樹、等待 child 完全退出、冷卻讓 OS 釋放 COM 埠 handle。
/// 保留 `serial_wants` 以便重新聚焦自動重開（使用者明確關閉則由呼叫端手動清除 wants）。
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
                Err(_) => break,
            }
        }

        // 4. 短暫冷卻（100ms），讓 Windows 串列埠驅動徹底釋放 Handle，避免再次上傳或重開時撞到 AccessDenied
        std::thread::sleep(Duration::from_millis(100));
        return true;
    }
    false
}

/// 啟動串列埠監視進程（open_serial_monitor 與重新聚焦自動重取共用）
fn spawn_serial_monitor(
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

    // 若同一埠已被其他視窗佔用 → 先停止該視窗，避免雙重衝突
    let occupied_by: Option<String> = {
        let mut owner: Option<String> = None;
        let monitors = state.serial_monitors.lock().unwrap();
        for (other_label, sess) in monitors.iter() {
            if *other_label != label && sess.port == port {
                owner = Some(other_label.to_string());
                break;
            }
        }
        owner
    };
    if let Some(occupier) = occupied_by {
        let _ = stop_serial_monitor(state.clone(), occupier);
    }

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

    {
        let mut monitors = state.serial_monitors.lock().unwrap();
        monitors.insert(
            label.clone(),
            crate::state::SerialMonitorSession {
                port: port.clone(),
                python_path: python_path.clone(),
                lang: lang.clone(),
                child: child,
                stopped: stopped.clone(),
            },
        );
    }

    forward_stream_with_backpressure(
        stdout,
        window.clone(),
        label.clone(),
        "python-log",
        Some(stopped.clone()),
        Some("serial-monitor-stopped"),
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
    let had = stop_serial_monitor(state.clone(), label.clone());
    if had {
        state.serial_wants.lock().unwrap().remove(&label);
        return Ok("stopped".to_string());
    }
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

/// 視窗焦點切換（前端 document blur/focus 事件觸發）。
/// - focused=true ：若此視窗先前有串列埠監看設定 → 自動重新開啟監看。
/// - focused=false：釋放此視窗的串列埠監看（保留 wants 供下次聚焦自動重取）。
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
        // 失焦：釋放監看（保留 wants）
        let _ = stop_serial_monitor(state, label);
    }
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

#[tauri::command]
pub async fn reset_firmware(
    window: Window,
    state: State<'_, AppState>,
    handle: AppHandle, 
    model: String, 
    should_clear: bool,
    serial_port: Option<String>,
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

        let mut cmd = Command::new("python");
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
