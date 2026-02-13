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