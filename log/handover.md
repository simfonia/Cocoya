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
    - **環境優化**：移除不必要的 npm 依賴 (blockly)，大幅提升 `tsc` 編編速度。
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
    - **Types 分類大升級**: 實作型別轉換 (int, str), 	ype() 檢查, len(), pop(), append(), in 判斷, sorted() 與 list.sort()。
    - **序列埠智慧讀取**: 實作「智慧排空」邏輯，確保每次讀取均為緩衝區中最新的一行，解決感測器時差問題。
- **下一階段目標**：
    - 進入里程碑 v2.5：開發高階動作判定（跳躍高度、開合跳計數）。
    - 準備里程碑 v3.0：實作 PC-MCU 橋樑應用（AI 手勢控制 Arduino）。
- **目前狀態**：系統已具備完善的資料處理與硬體通訊能力。
