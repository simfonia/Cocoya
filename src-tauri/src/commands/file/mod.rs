// P2-5（2026-10-03）：file.rs（925 行）拆分為 7 個模組。
//
// 拆分原則：**純搬移，對外 API 完全不變**。所有 #[tauri::command] 的註冊路徑改為
// 完整子模組路徑（Tauri 的 __cmd__ 巨集無法經 pub use 跨模組轉出，見 mcu/mod.rs 註解）。
//
// 模組職責：
//   manifest — 模組清單與 toolbox 讀取
//   anchor   — 專案錨定狀態（ProjectAnchor）與 session 釋放
//   examples — 內建範例：路徑守衛、複製並開啟、seed 還原
//   openfile — 開檔（open_file / open_examples）
//   savefile — 存檔（含另存新檔、examples 唯讀保護、跨視窗檔案鎖）
//   backup   — 自動備份 / 啟動恢復 / 清除備份 / 拒絕恢復 / 刪檔
//   dataset  — Dataset Manager 支援指令（標籤改名、匯入掃描、標註進度存讀、選檔）

pub mod anchor;
pub mod backup;
pub mod dataset;
pub mod examples;
pub mod manifest;
pub mod openfile;
pub mod savefile;

// 跨子模組共用（examples / openfile 需要 anchor 的 ProjectAnchor 與範例路徑守衛）
