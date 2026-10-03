// P2-5（2026-10-03）自 mcu.rs 拆分。序列埠列舉與板子辨識（VID/PID → boardId / board-type） 
//! 對外 API（#[tauri::command] 與 pub 函式）維持不變，由 mod.rs 以 pub use 重新導出。



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
pub(crate) fn detect_board_type(vid: Option<&str>, pid: Option<&str>) -> String {
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
pub(crate) fn detect_board_id(vid: Option<&str>, pid: Option<&str>) -> String {
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
pub(crate) fn detect_board_type_by_port(port: &str) -> String {
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

// 2026-09-30 移除 setup_stable_mode command：CircuitPython 遺留功能。
// 後端 resources/deploy/*.py 的 setup_stable_mode() 三個實作都只印一行訊息，
// 不寫入 boot.py、也不鎖定磁碟；Cocoya 已不再支援 CircuitPython。
