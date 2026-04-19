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
    - 透過 `postMessage`向 Host 請求 `vscode.window.showInputBox`。
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
    - 結合 requestId 追蹤與 Map 存儲 callback，將 UI 呈現交給 VS Code Host 執行。
- **優點**：不改動核心，徹底相容 Webview 沙盒。

### 2. 進階影像覆蓋 (Alpha Blending)
- **演算法**：在 Python 注入 cocoya_overlay_image 輔助函式。
- **透明度處理**：使用 NumPy 廣播運算執行 alpha * src + (1-alpha) * dst。
- **旋轉補償**：使用 getRotationMatrix2D 搭配邊框計算，防止旋轉後邊角被裁切。

### 3. 座標自動轉整數 (Int Casting)
- **背景**：OpenCV 繪圖函式嚴禁浮點數。
- **修正**：在 cv_draw 產生器中統一加入 tuple(map(int, ...)) 包裝，容許數學積木運算出的浮點座標自動轉換為像素整數。

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

## 產生器規範與硬體優化 (2026-02-21 更新)

### 1. f-string 引號衝突終極解決方案
- **問題**: 使用 f'...' 拼接時，若內部包含字典鍵值（如 scores['Alice']），會因單引號衝突引發 SyntaxError.
- **規範**: 凡涉及 join 或複雜拼接之產生器，統一使用三雙引號 **f"""..."""**。三引號能完美容納內部任何單/雙引號內容而不必轉義。

### 2. 序列埠「拿最新一筆」邏輯
- **問題**: 慢速輪詢 (如 sleep(1)) 快速發送設備 (如超音波) 時，readline() 會讀到堆積的舊資料。
- **解決**: 在 Read 產生器中注入 while s.in_waiting > 0: line = s.readline() 迴圈。這會不斷排空緩衝區直到最後一筆，保證數據的即時性。

### 3. CPU 節能輪詢技巧
- **對策**: 在 Available 檢查中使用 (time.sleep(0.001) or ser.in_waiting > 0)。
- **原理**: time.sleep 回傳 None (False)，強制每輪循環至少休息 1ms，將 CPU 佔用從 100% 降至 1% 以下，同時維持高反應度。

### 4. JavaScript 寫入轉義陷阱
- **提醒**: 透過 write_file 寫入產生器 JS 時，字串中的 \n 常被展開。必須寫成 \\n 才能在磁碟檔案中保持為字面量，避免 SyntaxError: Invalid token。

## 系統標準化與 πCar 全能化 (2026-02-28 更新)


### 1. 產生器環境變數注入
- **機制**: 在 main.js 的 setPlatformUI 中，將 this.currentPlatform 賦值給 Blockly.Python.PLATFORM。
- **用途**: 讓 forBlock 產生器函式能透過 generator.PLATFORM 判斷當前是 PC 或 MCU 模式，從而產出不同的 Python 代碼。

### 2. 積木級別平台過濾 (Platform Filtering)
- **實作**: 在 `toolbox.xml` 的 `<block>` 標籤中支援 `platform` 屬性（如 `platform="PC"`）。
- **機制**: `main.js` 中的 `filterToolboxXML` 函式在載入時動態解析 DOM，根據當前 `PLATFORM` 狀態移除不符積木，實現 Toolbox 的動態適配。

### 3. 結構與入口適配 (Structure)
- **py_main**: 
    - PC 模式：產出 if __name__ == "__main__":。
    - MCU 模式：直接產出內容（不包含入口檢查），適配 CircuitPython 的線性執行特性。

### 4. 通訊協議適配 (Serial IO)
- **PC (pyserial)**: 使用 import serial 與 serial.Serial(port, baud)。
- **MCU (CircuitPython)**: 使用 import usb_cdc 與 usb_cdc.data。這允許使用者透過數據通道與電腦端 Cocoya 進行通訊。
### 5. 雙軌制視覺風格 (Dual-Track Visual Style)
- **核心語法**: 維持 **Source Code Style**（如 `if`, `import`, `while`），強化學生的程式碼連結感。
- **應用模組**: 採用 **Friendly UI Style**（如「設定馬達速度」、「播放音符」），降低硬體操作門檻。

### 6. 旋律解析器 (Regex Melody Parser)
- **技術**: 在 Python 注入 `MusicEngine` 類別，使用正則表達式 `([A-GR][#S]?)([0-8])?([WHQEST])(\.)?(_T)?` 解析旋律。
- **功能**: 支援音名、八度、六種時值、附點與三連音，並內建休止符 (`R`) 處理。

### 7. 序列埠強健性 (Robust Serial Monitor)
- **程序衝突解決**: 在 Host 端啟動新部署前，發送 `Ctrl-C` (`\u0003`) 訊號至終端機，強制中斷舊的監控程序以釋放序列埠。
- **熱插拔支援**: `deploy_mcu.py` 的 `monitor` 函式實作了 `try-except` 重連迴圈，在拔掉 USB 時進入等待模式，插回時自動恢復連線。

### 8. 高精度感測器驅動 (Helper Injection)
- **超音波**: 實作手動脈衝計時類別，利用 `time.monotonic_ns()` 進行微秒級的高電位時長測量，達成免依賴 adafruit 庫的距離偵測。
- **Servo校準**: 實作狀態化 `PiCarServo` 類別，支援 `min_us` / `max_us` 校準，並內建漸進式流暢移動演算法。

## 關鍵技術實作紀錄 (2026-03-01 更新)

### 1. 全局 SVG 屬性安全攔截 (NaN Protection)
- **問題**：插件（如 Minimap）在主工作區渲染未完成時嘗試計算位移，產生 	ranslate(NaN,NaN) 報錯導致控制台刷屏。
- **解決**：在 main.js 最外層覆寫 Element.prototype.setAttribute。
- **邏輯**：攔截所有包含 NaN 或 Infinity 的字串與數值。這從底層保障了不論哪種插件出錯，都不會影響瀏覽器渲染效能與報錯日誌。

### 2. 自定義積木搜尋引擎 (Fuzzy Text Indexing)
- **索引機制**：CocoyaUtils.BlockSearcher 會在啟動時建立一個 Map。
- **文字提取**：透過 workspace.newBlock(type) 建立臨時積木，遍歷其所有 inputList 下的 fieldRow 獲取真實顯示文字（包含 i18n 標籤與下拉選單文字）。
- **保護措施**：建立索引期間強制呼叫 Blockly.Events.disable()，解決了「積木剛建就被刪」導致地圖插件同步報錯的 Bug。

### 3. 多舵機並行控制 (Sync Servo Movement)
- **演算法**：在 PiCarServo 類別中新增 @staticmethod move_sync(servos, targets, speed)。
- **並行機制**：使用單一 while 迴圈遍歷所有傳入的舵機物件，每輪循環各步進 1 度直到所有目標達成。這解決了原本「先右再左」的依序動作感。
- **速度曲線**：將速度 10 定義為「不延遲定位」，其餘映射為 0.01s 至 0.1s 的平滑步進延遲。

### 4. 嵌入式 UI 注入技術 (Toolbox Extension)
- **技術**：使用 MutationObserver 監控 BlocklyToolboxDiv 的生成。
- **佈局**：透過 insertBefore(container, firstChild) 將 HTML 搜尋框完美嵌入至 Blockly 的側邊欄分類清單頂端，實現與 Toolbox 的一體化滾動。

## 關鍵技術實作紀錄 (2026-03-02 更新)

### 1. Webview 資源加載與路徑轉換
- **問題**：將內聯 CSS 抽離至獨立檔案後，Webview 無法透過相對路徑載入資源。
- **解決**：在 `src/extension.ts` 的 `getWebviewContent` 中，新增對 `href` 屬性的正規表達式替換，統一呼叫 `webview.asWebviewUri` 進行轉換。
- **CSP 優化**：同步更新 Content Security Policy，使用 `${cspSource}` 精確放行本地資源，並加入 `https:` 權限以支援 Blockly 核心圖示。

### 2. 前端架構重構與註解保留
- **策略**：將 `main.js` 中的通用邏輯（XML 過濾、產生器覆寫、搜尋注入）移至 `utils.js` 的 `CocoyaUtils` 物件中。
- **挑戰**：在不使用 `write_file` 覆寫大檔案的前提下，透過精確的 `replace` 操作達成重構，並百分之百保留了原始開發註解。
- **NaN 攔截器**：將 NaN 攔截器移至應用進入點的最頂層（IIFE 頂部），確保所有後續載入的插件均受其保護。

### 3. 產生器物件管理自動化
- **問題**：MCU 腳位控制積木若重複使用同一個腳位，會產生重複的初始化代碼。
- **解決**：在 `hardware_generators.js` 中，利用 `generator.definitions_['init_' + pinVar]` 鍵值唯一性，將腳位初始化與 `import` 邏輯標籤化。這保證了代碼整潔，且即便多個積木操作同一腳位，初始化也只會執行一次。

## 關鍵技術實作紀錄 (2026-04-19 更新)

### 1. 搜尋引擎影子積木修復 (Search Shadow Fix)
- **問題**：原先 BlockSearcher 只回傳積木類型 (type)，導致搜尋結果產出的積木遺失了 toolbox.xml 中定義的影子積木 (<shadow>) 或預設欄位值。
- **解決**：參考 #WaveCode 實作，改為直接從 workspace.options.languageTree (Toolbox 原始定義樹) 遞迴提取完整的 XML/JSON 定義並進行快取。
- **優點**：搜尋結果現在與側邊欄拖出的積木完全一致。同時加入 IME (中文輸入法) 狀態偵測，避免在輸入中文時頻繁觸發搜尋導致的輸入卡頓。

### 2. 全域縮排比例縮放器 (Global Indent Scaler)
- **背景**：Blockly 產生器的 statementToCode 能自動處理動態縮排，但靜態注入 definitions_ 的程式碼字串是寫死的，導致切換 2/4 縮排時，全域函式定義區會發生對齊位移。
- **機制**：在 Blockly.Python.finish 階段實作攔截器，自動偵測行首的 4 空白倍數，並根據 generator.INDENT 進行比例縮放。
- **規範**：建立「基準 4 空白 (Base 4-Space)」開發約定，要求所有產生器中的靜態模板統一以 4 空白撰寫，由系統自動處理轉譯。

### 3. MCU 部署狀態與進度整合
- **UI 強化**：將「上傳中」與「上傳完畢」的提示從終端機文字提升至 VS Code 原生訊息通知欄位。
- **技術**：使用 vscode.window.withProgress 結合 child_process.exec。為了精確獲取結束回調，為 deploy_mcu.py 新增 --no-monitor 參數，將部署與監控流程拆分執行。

### 4. VSIX 體積優化 (.vscodeignore)
- **修正**：針對雙模式開發導致的體積膨脹，新增 .vscodeignore 排除 ui/node_modules、src-tauri、backup 與 log 等非執行期必要檔案。
- **結果**：VSIX 檔案大小從 50MB 回降至 1MB 左右。
