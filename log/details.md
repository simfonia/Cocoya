# Cocoya 技術細節 (Details)
... (略)

## 關鍵技術實作紀錄 (2026-05-09 更新)

### 1. Tauri 2.0 二階段權限工作流 (Permission Workflow)
- **問題**：Tauri 2.0 的生產版本 (Release Build) 具有極嚴格的指令攔截機制。單純在 `capabilities/default.json` 寫上指令名稱會導致 `Permission not found`。
- **解決方案**：
    1.  **定義層 (Define)**：在 `src-tauri/permissions/commands.toml` 中使用 `[[permission]]` 定義權限 ID（如 `allow-all-commands`），並在 `commands.allow` 陣列中列出所有 `snake_case` 的 Rust 指令名稱。
    2.  **分配層 (Assign)**：在 `src-tauri/capabilities/default.json` 的 `permissions` 陣列中引用該 ID。
- **優勢**：集中管理自定義指令權限，避免 `tauri.conf.json` 或 `default.json` 過於臃腫。

### 2. AppController 映射分發模式 (Map-based Dispatcher)
- **原理**：將原本 `handleCommand` 中的 `switch-case` 結構替換為 `Map` 物件。
- **實作細節**：
    - 在 `constructor` 中執行 `this.handlers = new Map()` 並調用 `_initHandlers()`。
    - **擴展性**：新增後端事件監聽時，只需 `this.handlers.set('cmd', (m) => ...)`。
    - **穩定性**：統一封裝 `try...catch` 於分發層，防止單一處理器錯誤中斷整個 Webview 訊息循環。

### 3. Utils 模組化與命名空間保護 (Namespace Preservation)
- **挑戰**：在傳統 `<script>` 載入環境下進行模組化，必須防止命名空間衝突與載入順序問題。
- **解決方案**：
    - 建立 `utils.js` 作為 Entry Point，僅負責執行 `window.CocoyaUtils = window.CocoyaUtils || {};`。
    - 各子模組 (`core.js`, `search.js` 等) 使用 **IIFE (立即執行函式)** 封裝，透過 `Object.assign` 向全域物件注入功能。
- **ESM 兼容性警告**：在傳統腳本中嚴禁使用 `export` 關鍵字，否則會觸發 `Uncaught SyntaxError`。必須透過全域賦值 (`window.X = X`) 導出內容。

### 4. 跨平台指令參數一致化 (Flag Synchronization)
- **實作**：在 `mcu.rs` 的 `erase_filesystem` 調用中補齊 `--tauri` 旗標。
- **目的**：確保 `deploy_mcu.py` 輸出的是適合終端機面板顯示的簡潔日誌格式，而非預設的帶顏色轉義字元或重複提示。
