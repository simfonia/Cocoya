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
2.  **單一事實來源 (SSOT)**：所有模組定義與 XML 儲存於 `ui/src/modules` 下，由 VSIX 與 Tauri 共享。

## 關鍵技術實作紀錄 (2026-02-13 更新)

### 1. 雙欄佈局與積木定位 (Precise Positioning)
- **實作方式**：
    - 在 `Blockly.Python.scrub_` 注入自定義 ID 標籤。陳述句使用 `# ID:xxx`，運算式使用不可見字元 `\u0001ID:xxx\u0002` 標記。
    - 前端 `ui_manager.js` 解析這些標記，建立 `blockId -> DOM Line` 的映射表。
    - 點擊積木時，利用 `scrollIntoView` 與黃色高亮色塊實現同步導航。

### 2. VS Code Webview Prompt 解決方案
- **問題**：Webview 沙盒禁止原生 `prompt()`，導致無法建立變數。
- **解決**：透過 `postMessage` 向 Host 請求 `vscode.window.showInputBox` 並使用 requestId 追蹤回調。

## 關鍵技術實作紀錄 (2026-04-30 更新)

### 1. Terminal Singleton (單一終端機模式)
- **問題**：多次操作造成序列埠佔用衝突（PermissionError 13）。
- **解決**：在 `extension.ts` 實作 `stopAllCocoyaTerminals()`。執行維護指令前，先發送 Ctrl+C 並 `dispose()` 舊視窗，強迫釋放控制權。

### 2. 智慧硬體辨識 (Smart Hardware Labeling)
- **原理**：抓取 `PNPDeviceID` 提取 VID/PID。
- **實作**：建立 `boardMap` 對照表，將技術代碼映射為 `Maker Pi RP2040` 等易讀名稱，優化教學引導。

## 關鍵技術實作紀錄 (2026-05-01 更新)

### 1. Tauri 多視窗進程管理與狀態隔離
- **核心架構**：
    - 在 `lib.rs` 的 `AppState` 使用 `HashMap<String, Child>` 與 `HashMap<String, PathBuf>`。
    - 以 `window.label()` (時間戳記唯一標籤) 作為 Key。
    - **效果**：視窗 A 存檔不會誤用視窗 B 的路徑；視窗 A 的 Python 無窮迴圈不會影響視窗 B 的執行。
- **孤兒備份搜尋 (Orphan Scavenger)**：
    - 啟動時掃描 `temp/cocoya_tauri/` 下不屬於當前活躍標籤的 `untitled_backup_*.xml`。
    - 主動推送 `recoveryData` 事件，確保異常關閉的進度能被任何新視窗救回。

### 2. 整合式終端機 (Webview-side Terminal)
- **同步緩衝技術**：
    - 修改 `appendTerminal` 邏輯：若傳入文字無 `\n` 且類型相同，則 `textContent += text`。
    - **解決問題**：修復了斷線重連時 `.` 指示符一直跳行的視覺缺陷。
- **狀態控制 (isTerminalAutoScroll)**：
    - 預設開啟。按下工具列「執行」時，系統會強制恢復自動捲動，確保使用者看到最新的 Boot 日誌。
- **視覺優化**：
    - 自定義 `::-webkit-scrollbar` 樣式為深灰色，對齊終端機黑色背景。

### 3. MicroPython 深度修復 (Recursive Deep Repair)
- **通訊協議**：加入 **DTR/RTS** 硬體流控支援，確保連線成功率。
- **軟硬兼施中斷**：連發 5 次 `\x03` 後自動嘗試 `\x04` 軟重啟，解決無限 print 導致 Raw REPL 進入失敗的問題。
- **遞迴清理**：在 Python 端注入遞迴 `wipe()` 函式，深度掃除 MicroPython 根目錄下所有殘留檔案與目錄。

### 4. 跨平台 UI/UX 對齊 (VSIX vs Tauri)
- **條件式按鈕**：
    - VSIX：保留「關閉(X)」按鈕對應 `closeEditor`。
    - Tauri：隱藏「關閉(X)」按鈕，將「停止」按鈕移至執行鈕旁。
- **Unbuffered 傳輸**：
    - 所有 Python 調用（PC/MCU/Monitor）統一強制加上 **`-u`** 參數。
    - 確保 Python -> Rust -> JS 之間的日誌流即時穿透，不再受 Python 緩衝區扣留。

### 5. 生產環境權限配置 (Tauri v2)
- **檢查更新**：需在 `capabilities/default.json` 開啟 `shell:allow-open` 並放行 `http/https` 協議。
- **除錯工具**：需同步在 `tauri.conf.json` (`devtools: true`) 與 `Cargo.toml` (`features = ["devtools"]`) 開啟特性。

## 關鍵技術實作紀錄 (2026-05-03 更新)

### 1. 響應式工具列與溢出處理 (Responsive Toolbar)
- **問題分析**：
    - 原本 `.toolbar-group` 使用 `flex-wrap: nowrap`，導致其總寬度若大於 `#blocklyArea` 時會直接溢出並疊加在相鄰的 `#codeArea` 上。
    - `#file-breadcrumb` 佔用過多空間，且缺乏動態縮放機制。
- **解決方案**：
    - **內部換行**：將 `.toolbar-group` 改為 `flex-wrap: wrap`。當視窗變窄時，設定按鈕會自動推擠至下一行，維持在 `#blocklyArea` 內部。
    - **漸進式隱藏**：
        - 1000px ~ 850px：縮減路徑標籤最大寬度。
        - < 700px：完全隱藏路徑標籤 (`display: none`)。這在 VS Code 的分割視窗（Split View）模式下尤為重要，確保即使在 1/3 寬度下功能按鈕依然可用。
- **邊界防護**：
    - 在 `tauri.conf.json` 配置 `minWidth: 960`。此數值是根據 `(Left Group ~500px) + (Right Area ~400px)` 計算得出的安全值，確保在不換行的情況下擁有最佳視覺效果。
