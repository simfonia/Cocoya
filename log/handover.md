# Cocoya 任務交接 (Handover)

## 2026-02-12 專案啟動
- **進度**：完成專案命名 Cocoya (Code, Compute, Yield AI)。
- **目標**：開發針對高中生的 Python 視覺 AI 教學工具。
- **目前重點**：基礎建設規劃與硬體選型確認。
- **待辦**：
    - 初始化 `package.json`。
    - 建立目錄結構。
    - 規劃 Blockly 與 Python/CircuitPython 的整合。

## 2026-02-12 進度更新 (里程碑 v1.0 準備)
- **核心進度**：
    - 成功建立 VS Code Webview 通訊標準 (使用 postMessage 與 asWebviewUri)。
    - 整合官方 Python 產生器 (`python_compressed.js`) 並實現即時預覽。
    - 完成模組化載入器，支援 `[id]_blocks.js` 識別化命名規範。
    - 實作 `logic` 與 `loops` 的 Engineer Mode 積木原型。
- **下一階段目標**：
    - 實作「雙欄佈局」UI，加入 Code Preview 視窗。
    - 實作「精確定位」技術：在產生器注入 Block ID 註解，實現積木與程式碼行號同步。
    - 補完 Math/Variables 基礎積木。
- **目前狀態**：基礎容器運作穩定，準備進入 UI 精緻化階段。

## 2026-02-13 核心架構與基礎積木補全 (里程碑 v1.0 完成)
- **核心進度**：
    - **UI/UX**：實作雙欄佈局、語法高亮 (Highlight.js) 與積木-程式碼雙向定位。
    - **變形系統 (Plus-Minus)**：建立 `CocoyaUtils.Mutator` 方案，支援高階 Undo/Redo 與靜默連線重組，解決複雜積木變形時的崩潰問題。
    - **安全性與規則**：實作嚴格的「頂層限制規則」，僅允許 `Main`, `Global Definitions`, `Function Def` 存在於頂層，孤兒積木自動變灰且不產出代碼。
    - **模組化補全**：補齊 Logic (if-elif-else), Loops (enumerate, items), Math, Text (f-string, multiline), Types (List, Dict, Tuple), Variables, Structure (Import), Tools (Raw Code, Comment)。
    - **環境優化**：移除不必要的 npm依賴 (blockly)，大幅提升 `tsc` 編編速度。
- **下一階段目標**：
    - 進入里程碑 v2.0：實作 AI Vision (MediaPipe) 相關積木。
    - 實作 OpenCV 影像處理積木。
    - 實作硬體通訊 (Serial) 與 CircuitPython 部署機制。
- **目前狀態**：開發容器已完全成熟，具備穩定的 Engineer Mode 操作體驗。

## 2026-02-14 系統成熟與硬體部署 (里程碑 v1.5 完成)
- **核心進度**：
    - **架構重構**：全面引入 OOP 模式，建立 `CocoyaManager` (Host) 與 `CocoyaApp` (Webview) 管理物件，程式碼結構清晰且易於維護。
    - **模式切換系統**：實作 Python (PC) 與 CircuitPython (MCU) 模式隔離，支援「模式鎖定」、Toolbox 動態過濾與 XML 屬性自動偵測。
    - **硬體部署引擎**：完成真實的 MCU 部署邏輯，支援 `CIRCUITPY` 磁碟直接寫入與 Serial REPL 模式。
    - **UI 精緻化**：實作「分隔線群組」佈局、頁籤標題同步 (`*` 標記)、以及專業的 Hex 色譜配色。
    - **i18n 全面化**：語系檔現在掌控了從積木、分類到對話框、工具列 Tooltip 的所有文字。
- **下一階段目標**：
    - 進入里程碑 v2.0：正式實作 AI Vision (MediaPipe) 與 OpenCV 系列積木。
    - 優化 MCU 的部署速度與穩定性。
- **目前狀態**：系統基礎建設已達生產級水準，準備迎接 AI 功能擴充。

## 2026-02-16 結構統整與 AI 視覺基礎 (里程碑 v1.5+v2.0 補強)
- **核心進度**：
    - **目錄統整**：完成 `media/modules/` 的扁平化結構，將 `core` 模組納入統一管理。
    - **語系分散化**：落實「核心管 UI，模組管積木」標準，各模組擁有獨立 `i18n` 目錄。
    - **AI 視覺基礎**：完成 `cv_basic` 與 `cv_draw` 模組開發。
    - **除錯同步革命**：確立「Execute the Preview」策略，改用行尾 `# ID` 註解。
    - **積木定義標準化**：現有積木全面改用 `jsonInit` + `args0` 模式重構。
- **目前狀態**：架構已達極度穩定與高效。

## 2026-02-17 MediaPipe 手勢偵測實作 (里程碑 v2.1 階段性完成)
- **核心進度**：
    - **AI 手勢模組 (ai_hand)**：完成 `py_ai_hand_init`, `py_ai_hand_process`, `py_ai_hand_is_detected`, `py_ai_hand_get_landmarks`, `py_ai_hand_get_landmark`, `py_ai_hand_get_landmark_xy`, `py_ai_hand_is_finger_up`, `py_ai_hand_draw` 等 8 個核心積木。
    - **座標轉換系統**：實作 Normalized 到 Pixel 座標的轉換邏輯，並提供專用的「特徵點選取」積木。
    - **手指偵測邏輯**：內建手指伸直 (is_finger_up) 判斷逻辑。
    - **自動匯入機制**：產生器會自動在代碼頂端注入 `import mediapipe as mp` 與 `import cv2`。
- **下一階段目標**：
    - 實作 Face Mesh (ai_face) 與 Pose Estimation (ai_pose)。
    - 擴充手勢識別的種類 (如：握拳、比讚等)。

## 2026-02-17 臉部與手勢 AI 強化 (里程碑 v2.1+v2.2 完成)
- **核心進度**：
    - **AI 模組開發**：完成 ai_hand (手勢) 與 ai_face (臉部網格) 模組。實作 468 點臉部追蹤。
    - **AR 繪圖突破**：實作 Overlay Image 積木，支援 PNG 透明度與自動 Alpha 混合，解決虛擬濾鏡需求。
    - **UX 革命**：透過 Blockly.dialog 橋樑徹底解決 Webview 禁止同步 Prompt 的限制，變數更名功能回復正常。
    - **規範落實**：完成全模組 generator.INDENT 縮排標準化，並更新 system_spec.html 至 v2.2。
- **下一階段目標**：
    - 進入里程碑 v2.3：實作 MediaPipe 姿勢偵測 (ai_pose)。
    - 優化圖片覆蓋積木的效能。
- **目前狀態**：系統已具備開發高難度 AI 互動（如 AR 皇冠、表情觸發）的能力。

## 未來開發導向 (Future Roadmap)
- **跨平台計畫**：計畫重構 src/extension.ts 中的硬體偵測邏輯，將 powershell 指令抽象化，以支援 Linux 與 macOS 環境。
- **在地化影像增強**：預計開發 cv_draw_text_pil 積木，整合 Pillow 庫以支援在 AI 畫面中顯示繁體中文標註，解決 OpenCV 的原生限制。

## 2026-02-18 MediaPipe 姿勢偵測與中文顯示補完 (里程碑 v2.3 完成)
- **核心進度**：
    - **ai_pose 模組**: 實作 33 點人體姿勢偵測，支援骨架繪製與索引標註。
    - **cv_draw 強化**: 實作 `py_ai_draw_text_zh` (Pillow Bridge) 支援繁體中文；新增 `py_ai_draw_angle_arc` 繪製夾角圓弧；新增 `py_ai_draw_rect_alpha` 支援半透明 UI。
    - **核心積木補全**: 新增 `py_logic_ternary` (三元運算) 與 `py_text_zfill` (補零格式化) 以優化 UI 排版。
    - **範例精緻化**: 建立 08~13 號範例，包含深蹲、彎舉計數器（含達標提示燈與動態圓弧變色）及 AI 鼻子撞球遊戲。
- **關鍵修復**:
    - 全面改採 `mp_..._model` 命名規範，解決模型實例被使用者變數覆蓋的 `AttributeError`。
    - 實作「物理防抖」邏輯 (vy > 0 判定)，解決遊戲中單次撞擊重複得分問題。
    - 確立「進入 Main 即初始化」策略，徹底解決沒偵測到人時的 `NameError`。
- **下一階段目標**：
    - 里程碑 v2.4: 開發高階動作分析 (如開合跳、跳躍高度偵測)。
    - 里程碑 v3.0: 啟動硬體腳位控制與 Serial 通訊模組。

## 2026-02-21 資料結構與 IO 強化 (里程碑 v2.4 完成)
- **核心進度**：
    - **IO 分類建立**: 抽離 print, input 並新增 Serial (序列埠) 與 sleep 積木。
    - **分類重構**: 將 Tools 全面更名為 Coding，並在 Toolbox 加入水平分隔線 (<sep>)。
    - **Types 分類大升級**: 實作型別轉換 (int, str), type() 檢查, len(), pop(), append(), in 判斷, sorted() 與 list.sort()。
    - **序列埠智慧讀取**: 實作「智慧排空」邏輯，確保每次讀取均為緩衝區中最新的一行，解決感測器時差問題。
- **下一階段目標**：
    - 進入里程碑 v2.5：開發高階動作判定（跳躍高度、開合跳計數）。
    - 準備里程碑 v3.0：實作 PC-MCU 橋樑應用（AI 手勢控制 Arduino）。
- **目前狀態**：系統已具備完善的資料處理與硬體通訊能力。

## 2026-02-24 平台相容性與空氣拳擊實作 (里程碑 v2.5 完成)
- **核心進度**：
    - **跨平台轉型**: 實作 Blockly.Python.PLATFORM 注入，基礎積木（Main, Serial, LED）現在能根據 PC 或 MCU 模式自動切換代碼。
    - **結構統一**: MCU 模式現在也強制使用「定義區 + 入口區」架構，並預設帶入 while True，建立良好的程式結構教育。
    - **AI 空氣拳擊 (ai_pose)**: 考慮教學空間限制，捨棄全身偵測，改推「上半身互動」。實作距離計算、位移速度與出拳偵測積木。
    - **系統修復**: 完成 py_tools 全域遷移至 py_coding 的範例修補，修復範例 13 無法開啟的問題。
- **關鍵規範**: 確立「核心積木開發必須兼顧 CircuitPython 相容性」原則。
- **下一階段目標**:
    - 里程碑 v2.6: 優化 Overlay Image 在高解析度下的效能 (NumPy 廣播優化)。
    - 里程碑 v3.0: 正式開發硬體 IO 控制積木。
- **目前狀態**: 系統已具備極強的教學靈活性與跨平台擴充性。

## 2026-02-28 系統成熟與硬體部署 (里程碑 v3.1+v3.2 完成)
- **核心進度**：
    - **硬體 AI 整合**：完成 `mcu_camera` (XIAO S3 採集)、`mcu_huskylens` (I2C 物體偵測) 模組。
    - **πCar 全能移植**：對齊 #piBlockly 實作馬達、舵機、超音波(手動脈衝)、循跡、NeoPixel、8顆 IO LED。
    - **音樂引擎突破**：實作 `MusicEngine` 類別，具備 Regex 旋律解析器，支援 `C4Q, R4H` 等複合語法與 BPM 控制。
    - **架構重大更新**：
        - 實作「積木級別平台過濾」，動態切換 PC/MCU 專屬積木。
        - 完成核心 10 大模組的 **i18n 全面標準化**，並確立「雙軌制外觀」規範。
        - 實作 MCU 專屬初始結構 (`mcu_main` + `while True`)。
- **部署優化**：
    - 修復序列埠衝突：上傳前自動發送 `Ctrl-C` 中斷舊監控。
    - 實作「熱插拔重連」：`deploy_mcu.py` 現在能耐受 USB 拔插並自動恢復監控。
- **目前狀態**：硬體支援度與教學美學已達新高度，為 TinyML 教學奠定基礎。

## 2026-03-01 UI/UX 升級與硬體精準化 (Milestone v3.2+ 強化)
- **核心進度**：
    - **自研搜尋引擎**：實作 BlockSearcher 文字索引系統，支援全文字匹配（包含中文字串中間詞）與單字元即時觸發，並嵌入至 Toolbox 頂部。
    - **地圖與導航**：整合 Workspace Minimap 並實作「收合/展開」按鈕，針對 Webview 進行穩定性強化與自動縮放優化。
    - **πCar 邏輯修正**：經實測校正，Maker Pi RP2040 之馬達邏輯為 Low=Brake, High=Coast；Servo 系統支援獨立校準與「雙手同步」移動。
    - **穩定性革命**：實作全局 SVG 屬性攔截器，徹底解決 NaN 報錯與積木刪除時的同步崩潰問題。
- **下一階段目標**：
    - 進入里程碑 v3.1 剩餘部分：實作 TinyML 資料採集面板。
    - 進入里程碑 v4.0：跨平台（Linux/macOS）序列埠路徑適適配。
- **目前狀態**：編輯器已具備專業 IDE 級別的導航與搜尋能力，硬體控制精度達到工業級。

## 2026-03-02 Webview 重構與基礎腳位補完 (里程碑 v3.1 強化)
- **核心進度**：
    - **Webview 深度重構**：
        - 實作 **CSS 獨立化**：將內聯樣式抽離至 `media/style.css`，並優化後端 URI 轉換與 CSP 策略。
        - 實作 **代碼模組化**：建立 `CocoyaUtils` 工具集，瘦身 `main.js` 並保留完整原始註解。
    - **Hardware 模組補完**：
        - 實作數位輸出/讀入、類比讀入 (ADC)、PWM 輸出與 I2C 掃描積木。
        - 實作 **腳位影子系統 (`mcu_pin_shadow`)**，支援 `board.GPx` 選取。
        - 實作 **產生器自動化**：自動處理 CircuitPython 物件初始化，防止代碼重複與冗餘。
    - **UI 優化**：統一積木命名規範（類別 + 腳位 + 動作），精簡 Tooltip 並重整 Toolbox 間距。
- **下一階段目標**：
    - 進入里程碑 v3.1 剩餘部分：實作 PC-MCU 橋樑應用（AI 控制 LED 範例）。
    - 進入里程碑 v3.3：實作 TinyML 資料採集與儲存面板。
- **目前狀態**：前端架構已臻完美，硬體底層控制力已補齊，準備進入高階 AI 應用階段。

## 2026-04-19 雙模架構關鍵進展
- **進度**: 
  - 徹底修復 VSIX 模式下的所有已知 UI 與部署 Bug。
  - **[里程碑]** 成功建立並啟動 Tauri 獨立桌面應用模式。
- **已完成**:
  - 實作「全域縮排縮放器」，支援 2/4 空白動態切換。
  - 強化 deploy_mcu.py, 解決 Windows 磁碟損毀/鎖定導致的寫入失敗。
  - 重構 BlockSearcher, 搜尋結果現在完整包含影子積木與預設值。
  - 配置 src-tauri 核心架構 (Rust, Capabilities, tauri.conf.json).
- **待辦 (下一階段)**:
  - 實作 Tauri 模式下的 **檔案操作指令** (Save/Save As)。
  - 實作 Tauri 模式下的 **序列埠偵測與部署** 指令。
  - 整合 deploy_mcu.py 作為 Tauri 的 Sidecar 以利打包發布。

## 2026-04-26 實體自動備份系統與 Tauri 核心功能補完
- **核心進度**：
    - **[里程碑] 實體化自動備份系統**：
        - 徹底解決學校 PC 還原系統導致的資料遺失問題，棄用 `localStorage` 改採實體備份。
        - **分叉保護 (Forking)**：實作拒絕恢復時自動改名封存（`.bak.old_[timestamp]`），防止舊進度覆蓋心血。
        - **雙模式適配**：同步完成 VS Code Extension 與 Tauri 獨立版的備份對接。
    - **Tauri 後端強化**：
        - 實作 `get_serial_ports`, `deploy_mcu`, `auto_backup`, `clear_backup`, `reject_recovery` 等 Rust 指令.
        - 智慧偵測：啟動時自動掃描系統 `temp` 下的未命名備份並推播至前端。
    - **UI/UX 精進**：
        - 設定按鈕升級為下拉選單，引入 Python Logo 圖示與深色主題適配。
        - 修正 VS Code 模式下對話框重複取消按鈕與語系同步 Bug。
- **關鍵維護**：
    - 更新 `variables_blocks.js` 棄用 API，對齊 Blockly 最新版本。
- **目前狀態**：系統已具備極高的資料安全性，Tauri 獨立版功能已接近 VSIX 版，準備進入封裝測試階段。

## 2026-04-29 全面遷移至 MicroPython (里程碑 v6.0 啟動)
- **進度**：正式放棄 CircuitPython (USB MSC) 模式，全面遷移至 **MicroPython (Serial REPL)** 模式。
- **核心進度**：
    - **部署工具革命**：重寫 `deploy_mcu.py`，改採全序列埠 Raw REPL 推送代碼。徹底解決 Windows 磁碟鎖定、毀損與權限衝突問題。
    - **硬體產生器換血**：完成 `machine` 模組遷移。重寫馬達、舵機、超音波、音樂引擎與 Camera 驅動邏輯.
    - **介面大整頓**：重新設計設定選單，建立「韌體設定」子選單。移除過時的 USB 鎖定與穩定模式補丁功能。
    - **維修工具補完**：實作一鍵「深度修復磁碟 (Erase Filesystem)」，並加入後端終端機自動清理機制，避免 COM 埠衝突。
- **目前狀態**：核心上傳機制已達到前所未有的穩定性。

## 2026-04-30 UI/UX 精進與 MicroPython 術語對齊
- **進度**：
  - **[UI/UX]** 為「深度修復」選單加入詳細的 Hover 說明（Tooltip），支援中英雙語。
  - **[UI/UX]** 更新深度修復圖示為 `delete_24dp_FE2F89.png`，視覺上更符合「刪除/清空」之意。
  - **[術語修正]** 修正深度修復的確認對話框文字。將原有的「重建磁區」修正為「清空使用者檔案」，以符合 MicroPython (LittleFS) 的真實運作機制，避免使用者誤解。
  - **[Serial 穩定性]** 實作 Terminal Singleton 模式，徹底解決 VSIX 模式下上傳程式與監控器之間的 COM 埠佔用衝突（PermissionError 13）。
  - **[硬體辨識]** 實作「硬體智慧辨識 (Smart Labeling)」，透過 VID/PID 解析自動在序列埠清單顯示開發板型號（如 Maker Pi, XIAO）。
  - **[性能優化]** 優化 WMI 偵測指令，將偵測延遲從 3s 縮短至 0.2s，並改為非同步執行提升介面靈敏度。
- **目前狀態**：系統在 MicroPython 模式下的引導與維護介面已趨於完善。
