// P2-5（2026-10-03）：mcu.rs（1018 行）拆分為 6 個模組。
//
// 拆分原則：**純搬移，對外 API 完全不變**。所有原本的 `pub` 項目在此以 `pub use`
// 重新導出，因此 `commands::mcu::*` 與 `commands::*` 的路徑維持不變，
// lib.rs 的 `generate_handler![commands::xxx]` 與既有呼叫端零改動。
//
// 模組職責：
//   raw_dump — 序列埠 Raw Dump 路徑解析與環境變數注入
//   stream   — 串流轉發（背壓 + 時間窗聚合，高頻 print 保護）
//   board    — 序列埠列舉與板子辨識（VID/PID → boardId / board-type）
//   deploy   — MCU 韌體上傳（deploy_mcu.py）
//   monitor  — 序列埠監看（開啟/切換/視窗焦點交接）
//   firmware — 檔案系統重建與韌體重置（esptool / UF2）

pub mod board;
pub mod deploy;
pub mod firmware;
pub mod monitor;
pub mod raw_dump;
pub mod stream;

// 對外 API 重導出：保持拆分前的呼叫路徑 `commands::mcu::<fn>` 不變，
// 既有呼叫端（lib.rs 視窗焦點輪詢的 spawn_serial_monitor）零改動。
//
// ⚠ Tauri 邊界注意：`#[tauri::command]` 產生的 `__cmd__<fn>` 巨集**無法經 pub use 跨模組轉出**
// （Rust 巨集與 pub use 語義衝突，會得到 E0433 failed to resolve `__cmd__xxx`）。
// 因此 lib.rs 的 `generate_handler!` 必須寫**完整子模組路徑**
// （如 `commands::mcu::board::get_serial_ports`），不可寫 `commands::get_serial_ports`。
// 這是拆分成子模組後 lib.rs 唯一必要的改動。
pub(crate) use monitor::stop_serial_monitor;   // python.rs::stop_python 會呼叫（釋放 serial）
pub(crate) use board::list_serial_ports;  // lib.rs 熱插拔輪詢