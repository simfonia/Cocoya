# Cocoya 專案指南 (Codex/Copilot AGENTS.md)

## 專案概述
Cocoya 是一個針對 Python AI 視覺的教學工具。它透過 Blockly 產生 PC 端的 Python (AI) 與 MCU 端的 MicroPython (Hardware) 代碼。

## 技術規範
- **核心架構**：混合架構 (Hybrid)，支援 VSIX 與 Tauri 雙模共用前端 SSOT。
- **目標語言**：
    - PC: Python 3 (MediaPipe, OpenCV)。
    - MCU: MicroPython (XIAO S3 Sense, Maker Pi RP2040)。
- **通訊方式**：Serial (USB)。

### Tauri 2.0 安全與指令規範
- **指令權限二階段定義 (Permission Workflow)**：
    1. **定義 (Define)**：在 `src-tauri/permissions/` 下建立 `.toml` 或 `.json` 檔案（例如 `commands.toml`），定義 `identifier` 並將指令加入 `commands.allow` 陣列。
    2. **分配 (Assign)**：在 `src-tauri/capabilities/default.json` 的 `permissions` 陣列中引用該 `identifier`（例如 `"allow-all-commands"`）。
- **權限重要性**：若未完成上述二階段定義，指令在生產環境 (Release Build) 會被攔截，導致功能失效。
- **能力分發**：偏好透過 `bridge.capabilities` (前端) 查詢環境特性，而非直接檢查 `isTauri` 旗標。

### 多視窗完整性規範 (Multi-Window Integrity Protocol)
- **精準通訊**：在 Tauri 後端發送視窗專屬事件時，必須使用 `window.emit_to(&label, "event-name", payload)`，嚴禁使用全域廣播的 `emit`，以防止觸發多個視窗 of 對話框。
- **原子化狀態同步**：前端在執行「儲存並關閉」流程時，必須 `await window.CocoyaBridge.send('setDirty', { isDirty: false })` 確保後端狀態更新後，才呼叫 `close_window`。
- **備份宣示權**：處理未命名備份時，必須遵循「偵測後立即重新命名為 `.recovering`」的宣示模式，確保同一個備份檔不會被多個視窗同時抓取。
- **強制鎖定**：後端 `save_file` 指令必須檢查路徑擁有者。若非目前視窗鎖定的路徑，必須回傳錯誤並由前端 Alert 提示使用者「另存新檔」。

### 產生器開發規範 (Generator Standards)
- **基準縮排 (Base 4-Space Indent)**: 
    - **強制要求**: 所有在產生器 (.js) 中以字串形式定義的靜態 Python 程式碼（例如注入 `generator.definitions_` 的輔助函式），**必須統一使用 4 個空白** 作為縮排基準。
    - **原理**: `ui/src/utils.js` 中的全域攔截器會自動偵測行首的 4 空白倍數，並根據使用者選定的 `INDENT` (如 2 或 8) 進行等比例縮放。若不遵守 4 空白基準，將導致全域區程式碼對齊失效。
- **路徑處理**: 
    - 專案內檔案與資料集路徑一律使用正斜線 `/` 作為統一分隔符號，在傳入後端平台前由通訊橋樑進行環境適配，避免 Windows 與 Unix-like 系統路徑斜線衝突。

### 轉義字元與換行處理規範
當處理 Blockly 產生器 (.js) 與產出的 Python/MicroPython 代碼時，必須严格遵守以下規範：
1. **產生器 JS 中的字串與換行**：
   - **實體換行禁止**：在單引號 `'` 或雙引號 `"` 定義的字串中，絕對禁止出現實體換行。若需換行，必須寫成 `\\n` (透過工具寫入時) 或 `\n` (執行時)。
   - **模板字串**：在 JS 中使用反引號 `` ` `` (Template Literals) 時，可以使用實體換行，這在注入長篇 Python/C 類別時最為安全。
2. **代碼產出規範**：
   - **代碼換行**：產生器 `return` 的字串中，若要讓生成的程式檔換行，請在字串結尾加上 `\n`。
   - **正規表達式**：在 JavaScript 中使用反斜線的字串或 Regex 時，注意層級轉義，確保在最終生成的代碼中反斜線維持正確的字面量。

## 開發慣例
- **積木與產生器**：參考 `piBlockly` 風格，模組化設計。
- **代碼風格**：
    - Extension: TypeScript (Strict)。
    - Webview: ES6 JavaScript。
- **系統規格書**：`docs/system_spec.html`。
    - **強制規範**：在進行任何積木或產生器開發前，**必須先詳細閱讀系統規格書**，以確保 ID 注入機制、轉義字元 (\\n) 與 AI 座標規範被嚴格執行。
- **日誌與備份保護原則**：
    - **日誌追加保護 (Append-Only)**：異動需記錄於 `log/work/yyyy-mm-dd.html` 與 `log/todo.md`。處理 `log/` 下的檔案時，**嚴禁**使用覆寫，必須先讀取全文，將新內容串接在舊內容之後再寫入，不得刪除歷史紀錄。
    - **覆寫前置備份**：如果因結構重整必須使用 `write_file` 覆寫任何檔案，**必須先備份**原檔到 `backup/` 資料夾，檔名加入時間戳記 (yyyyMMdd_HHmmss)。

## 重要路徑
- **模組路徑**：`ui/src/modules/` (雙模共用內建模組 SSOT)。
- **模組快取路徑**：`globalStorage/modules/` 為 VS Code Extension 執行期快取位置，不是 repo 內固定目錄。
