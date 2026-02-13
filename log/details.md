# Cocoya 技術細節 (Details)

## 專案核心架構 (2026-02-12)
- **名稱意義**：Code, Compute, Yield AI (編碼、運算、產出人工智慧)。
- **開發平台**：VS Code Extension。
- **視覺化程式碼**：Blockly。
- **目標語言**：
    - PC 端：Python 3 (OpenCV, MediaPipe)。
    - MCU 端：CircuitPython (用於 Maker Pi RP2040 與 XIAO ESP32-S3)。
- **通訊協議**：規劃使用 Serial (USB) 作為 PC 與 MCU 的指令橋樑。

## 模組加載架構：混合體 (Hybrid Architecture)
為了兼顧更新靈活性與教學環境的穩定性，採用以下設計：
1.  **單一儲存庫 (Monorepo)**：核心與模組位於同一 Repo，便於開發與版本控管。
2.  **內建 + 快取機制**：
    - **內建 (Built-in)**：發佈時包含基礎模組，確保離線可用。
    - **快取 (GlobalStorage)**：啟動時自動從雲端檢查更新，下載至 VS Code 的 `globalStorage`。
3.  **優先權載入**：Webview 優先讀取 `globalStorage` 版模組，達成「熱更新」而無需頻繁發佈 Extension。

## 關鍵技術實作紀錄 (2026-02-13 更新)

### 1. 雙欄佈局與積木定位 (Precise Positioning)
- **實作方式**：
    - 在 `Blockly.Python.scrub_` 注入自定義 ID 標籤。陳述句使用 `# ID:xxx`，運算式使用 `@@ID:xxx@@` 行內標記。
    - 前端 `ui_manager.js` 解析這些標記，建立 `blockId -> DOM Line` 的映射表。
    - 點擊積木時，利用 `scrollIntoView` 與黃色高亮色塊實現同步導航。
- **防抖 (Debounce)**：程式碼預覽渲染加入 200ms 延遲，防止高頻率操作下的效能抖動。

### 2. VS Code Webview Prompt 解決方案
- **問題**：Webview 沙盒禁止原生 `prompt()`，導致無法建立變數。
- **解決**：
    - 在 `main.js` 徹底覆寫 `window.prompt` 與 `Blockly.prompt`。
    - 透過 `postMessage` 向 Host 請求 `vscode.window.showInputBox`。
    - 採用非同步回調機制 (Map 儲存 requestId) 接收使用者輸入並回傳給 Webview。

### 3. 孤兒積木限制規則 (Orphan Protection)
- **核心規則**：僅允許 `py_main`、變數設定、函式定義作為頂層積木；其餘積木若脫離容器必須變灰且不產生程式碼。
- **API 踩坑 (Blockly V12.3.1)**：
    - 原生 `Blockly.Events.disableOrphans` 過於嚴格，不適用於 Python 腳本風格。
    - `block.setEnabled()` 在 V12 中視覺回饋不穩定，且會被內部邏輯覆蓋。
    - **最終方案**：使用 `block.setDisabledReason(true, 'orphan')`。這能強制積木變灰，且必須配合 `Blockly.Python.scrub_` 攔截 `!block.isEnabled()` 的積木以防產生無效程式碼。
- **時序問題**：檢測邏輯必須包裹在 `setTimeout(..., 0)` 中，確保在積木移動完成、模型關係更新後才執行啟用/禁用判斷。

### 4. 變數分類動態化 (Engineer Style)
- **自定義 Flyout**：透過 `workspace.registerToolboxCategoryCallback('VARIABLE', ...)` 接管變數分類。
- **視覺一致性**：為了維持「Engineer Mode」風格，捨棄 Blockly 預設變數積木，改為動態產出 `py_variables_set` (=) 與 `py_variables_get`。

## 關鍵踩坑與解決紀錄 (2026-02-12)
1. **Webview 通訊失效**：改用標準 `postMessage` 流程。
2. **Python 產生器換行符號**：JS 檔案內必須維持 `\n` 字面量。
3. **動態載入衝突**：強制使用 `[moduleId]_blocks.js` 識別化命名。
