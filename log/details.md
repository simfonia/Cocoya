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
    - 在 `Blockly.Python.scrub_` 注入自定義 ID 標籤。陳述句使用 `# ID:xxx`，運算式使用不可見字元 `\u0001ID:xxx\u0002` 標記。
    - 前端 `ui_manager.js` 解析這些標記，建立 `blockId -> DOM Line` 的映射表。
    - 點擊積木時，利用 `scrollIntoView` 與黃色高亮色塊實現同步導航。
- **防抖 (Debounce)**：程式碼預覽渲染加入 200ms 延遲，防止高頻率操作下的效能抖動。

### 2. VS Code Webview Prompt 解決方案
- **問題**：Webview 沙盒禁止原生 `prompt()`，導致無法建立變數。
- **解決**：
    - 在 `main.js` 徹底覆寫 `window.prompt` 與 `Blockly.prompt`。
    - 透過 `postMessage` 向 Host 請求 `vscode.window.showInputBox`。
    - 採用非同步回調機制 (Map 儲存 requestId) 接收使用者輸入。

### 3. 變形積木的終極 Undo 方案 (A-E 流程)
- **問題**：Plus-Minus 積木在有連線內容時，減少項次會導致連線遞補事件與 Mutation 事件衝突，毀壞 Undo 棧。
- **解決 (A-E 流程)**：
    1.  **A (Record)**: 紀錄舊 Mutation。
    2.  **B (Data)**: 修改數據 (count--)。
    3.  **C (Disable)**: `Blockly.Events.disable()` 暫停事件紀錄。
    4.  **D (Shape)**: 執行 `updateShape_` (包含斷開並遞補連線)。
    5.  **E (Enable)**: `Blockly.Events.enable()` 恢復紀錄。
    6.  **Fire**: 手動發送 Mutation 事件。
- **結果**：Undo 時，分支會恢復，但被踢出的積木保持浮動，不會崩潰。

### 4. 孤兒串檢測 (Chain-aware Orphan Protection)
- **遞迴檢查**：`updateBlocksEnabledState` 現在會向上追溯至根積木。只要根積木不在白名單（Main, Global Def, Function Def）內，整串積木都會自動變灰。
- **API (V12.3.1)**：優先使用 `block.setDisabledReason(true, 'orphan')`。

### 5. 視覺風格與 i18n 顏色管理
- **中央集權**：所有分類與積木顏色均定義在語系檔中的 `COLOUR_...` 標籤。
- **色彩策略**：避開暖色系 (0-100)，預留給 AI 與硬體模組。

### 6. 多行字串縮排修正
- **對策**：使用 `'\n'.join([...])` 代替 `"""` 產出，確保字串內容不受 Python 外部縮排影響，維持「所見即所得」。

## 關鍵踩坑與解決紀錄 (2026-02-12)
1. **Webview 通訊失效**：改用標準 `postMessage` 流程。
2. **Python 產生器換行符號**：JS 檔案內必須維持 `\n` 字面量。
3. **動態載入衝突**：強制使用 `[moduleId]_blocks.js` 識別化命名。

## 關鍵技術實作紀錄 (2026-02-14 更新)

### 1. 專業級 UI 佈局與同步
- **頁籤標題同步**: 透過 vscode.postMessage 觸發 Host 端 updateTitle，標題格式定為 Cocoya Editor: [檔名.xml*]。
- **Hex 色譜管理**: 棄用 Hue 值，改用 Hex 色碼以確保與品牌色 (#FE2F89) 一致。
- **i18n 自動套用**: 前端 applyI18n() 支援自動替換 span, 	itle 與 option 標籤中的 %{BKY_...}。

### 2. 專案模式自動偵測 (XML Metadata)
- **實作方式**: 在存檔時於 XML 根節點注入 platform="PC" 或 platform="CircuitPython"。
- **優點**: 解決了單純靠積木特徵判斷的不確定性，達成 100% 準確的模式切換。

### 3. MCU 部署引擎 (Deployer)
- **部署工具**: 獨立 Python 腳本 
esources/deploy_mcu.py。
- **優先策略**: 
    1. 掃描 GetLogicalDrives() 尋找標籤為 CIRCUITPY 的磁碟機進行直接檔案寫入。
    2. 若失敗，則降級為 Serial REPL 模式，透過 f.write() 傳輸程式碼。
- **監控模式**: 部署後不關閉序列埠，自動進入監聽迴圈顯示 print() 訊息。

### 4. 程式碼清理與安全性
- **字串處理**: 嚴格遵守 \\n 轉義規範，避免產生器 JS 中的實體換行。
- **ID 清理**: 執行前使用 Regex /\u0001ID:.*?\u0002/g 與 /# ID:.*?\n/g 確保產出純淨 Python 代碼。

## 關鍵踩坑與解決紀錄 (2026-02-14)
1. **Webview URI 權限 (403)**: 發現 JS 動態修改 img.src 會導致路徑失效。解決方案：預放所有圖示並透過 CSS Class 切換。
2. **終端機崩潰 (-1073741510)**: 因自動發送 \u0003 導致 PowerShell 中斷。解決方案：改由使用者手動控制。
