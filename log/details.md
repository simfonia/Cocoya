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
- **色彩策略**：避開 warm tones (0-100)，預留給 AI 與硬體模組。

### 6. 多行字串縮排修正
- **對策**：使用 `'\n'.join([...])` 代替 `"""` 產出，確保字串內容不受 Python 外部縮排影響，維持「所見即所得」。

## 關鍵技術實作紀錄 (2026-02-14 更新)

### 1. 專業級 UI 佈局與同步
- **頁籤標題同步**: 透過 vscode.postMessage 觸發 Host 端 updateTitle，標題格式定為 Cocoya Editor: [檔名.xml*]。
- **Hex 色譜管理**: 棄用 Hue 值，改用 Hex 色碼以確保與品牌色 (#FE2F89) 一致。
- **i18n 自動套用**: 前端 applyI18n() 支援自動替換 span, title 與 option 標籤中的 %{BKY_...}。

### 2. 專案模式自動偵測 (XML Metadata)
- **實作方式**: 在存檔時於 XML 根節點注入 platform="PC" 或 platform="CircuitPython"。
- **優點**: 解決了單純靠積木特徵判斷的不確定性，達成 100% 準確的模式切換。

### 3. MCU 部署引擎 (Deployer)
- **部署工具**: 獨立 Python 腳本 resources/deploy_mcu.py。
- **優先策略**: 
    1. 掃描 GetLogicalDrives() 尋找標籤為 CIRCUITPY 的磁碟機進行直接檔案寫入。
    2. 若失敗，則降級為 Serial REPL 模式，透過 f.write() 傳輸程式碼。
- **監控模式**: 部署後不關閉序列埠，自動進入監聽迴圈顯示 print() 訊息。

### 4. 程式碼清理與安全性
- **字串處理**: 嚴格遵守 \\n 轉義規範，避免產生器 JS 中的實體換行。
- **ID 清理**: 執行前使用 Regex /\u0001ID:.*?\u0002/g 與 /# ID:.*?\n/g 確保產出純淨 Python 代碼。

## 關鍵技術實作紀錄 (2026-02-16 更新)

### 1. 扁平化模組架構 (Flattened Module Structure)
- **目錄變更**：所有模組統一移至 `media/modules/` 下，核心模組位於 `modules/core/`。
- **平行載入**：`module_loader.js` 使用 `Promise.all` 加載模組，回傳物件包含 ID 與 XML，確保分組與排序一致。
- **載入邏輯**：`loadModule` 自動偵測 ID 中的路徑（如 `core/logic`）並動態加載對應的 `blocks.js` 與 `generators.js`。

### 2. 語系分散化管理 (Modular i18n)
- **機制**：各模組在載入積木前，會先嘗試加載 `i18n/[lang].js`。
- **核心瘦身**：`media/zh-hant.js` 僅保留全域 UI 文字，大幅提昇維護性。

### 3. 完美同步與 ID 定位 (Regex Deep Dive)
- **Execute the Preview**：將 Preview 處理後的代碼作為唯一真理傳給執行引擎，徹底消除行號位移。
- **行尾註解 ID**：陳述句使用 `  # ID:xxx` 行尾註解。解析正則為 `/  # ID:([^\s\n]+)/g`，支援多重 ID（容器積木）且不影響 Python 縮排。
- **效能檢查**：孤兒檢查改為 $O(N)$ Top-Down 遍歷，配合 150ms 防抖，垃圾桶動畫流暢度大幅提升。

### 4. 積木標準化 (Standardization)
- **JSON 化**：現有積木定義全面改用 `jsonInit` + `args0` 模式重構。
- **精簡積木**：針對 CV Draw 實作 `py_ai_point` 與 `py_ai_color` 固定尺寸積木，取代變形 Tuple。

### 5. UI/UX 增強
- **縮排輔助線**：在 Preview 中動態繪製灰線，支援 2/4 Spaces 切換且同步剪貼簿。
- **複製功能**：實作品牌色 Hover 複製按鈕，自動清理定位 ID。
- **路徑導航**：標題列與狀態列同步顯示完整檔案路徑。

## 關鍵技術實作紀錄 (2026-02-17 更新)

### 1. 非同步對話框系統 (Bridge Architecture)
- **問題**：Webview 禁止原生 prompt() / confirm()，導致變數更名無效且報錯。
- **解決**：
    - 使用 Blockly.dialog.setPrompt() 與 setConfirm() 攔截核心對話框。
    - 結合 
equestId 追蹤與 Map 存儲 callback，將 UI 呈現交給 VS Code Host 執行。
- **優點**：不改動核心，徹底相容 Webview 沙盒。

### 2. 進階影像覆蓋 (Alpha Blending)
- **演算法**：在 Python 注入 cocoya_overlay_image 輔助函式。
- **透明度處理**：使用 NumPy 廣播運算執行 alpha * src + (1-alpha) * dst。
- **旋轉補償**：使用 getRotationMatrix2D 搭配邊框計算，防止旋轉後邊角被裁切。

### 3. 座標自動轉整數 (Int Casting)
- **背景**：OpenCV 繪圖函式嚴禁浮點數。
- **修正**：在 cv_draw 產生器中統一加入 	uple(map(int, ...)) 包裝，容許數學積木運算出的浮點座標自動轉換為像素整數。

### 4. 智慧標註 (Range Filtering)
- **臉部編號**：針對 Face Mesh 實作 START 與 END 參數過濾，讓開發者能分區域觀察特徵點，解決 468 個編號擠在一起的混亂。

## 關鍵技術實作紀錄 (2026-02-18 更新)

### 1. 遊戲化碰撞與防抖 (Debouncing Physics)
- **挑戰**: 偵測點進入球體半徑後會觸發多重加分。
- **解決**: 引入 **方向性判定**。僅當球體垂直速度 `vy > 0` (下落中) 時才觸發碰撞。撞擊後立即賦予 `vy = -bounce_power`，使其進入向上噴飛狀態，從而避開連續加分判定。

### 2. UI 排版穩定化 (Visual Consistency)
- **zfill 應用**: 透過 `str().zfill(3)` 固定角度顯示寬度，防止數字從兩位數變三位數時文字抖動。
- **霧面背景**: 實作 `addWeighted` Alpha 混合技術，在文字下方繪製半透明矩形，提升在複雜 AI 畫面背景下的可讀性。

### 3. 變數初始化策略 (Initialization)
- **強制宣告**: 變數 `angle` 等需在 `while` 迴圈外頂層初始化。
- **原因**: Python 若在區塊內賦值會判定為局部變數，若 AI 漏偵測導致跳過賦值，讀取時會報 `NameError`。初始化可保證作用域安全。

### 4. 動態視覺反饋 (Conditional Styling)
- **三元運算**: 實作 `py_logic_ternary` 支援行內顏色切換 (如：達標綠、未達標黃)，增強教學互動感。
- **目標燈號**: 整合 `if-else` 與 `draw_circle` 實作指示燈系統與 「GOAL!!」標註。
