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
