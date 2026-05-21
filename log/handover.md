# Cocoya 任務交接 (Handover)

## 2026-02-12 專案啟動
... (略)

## 2026-05-09 核心架構模組化與安全性加固 (里程碑 v5.0 Phase 2 完成)
- **核心進度**：
    - **[重構] 前端工具模組化 (utils.js Refactor)**: 
        - 成功將單一龐大的 `ui/src/utils.js` 拆分為 5 個專用子模組：`core`, `toolbox`, `generators`, `mutator`, `search`。
    - **[優化] AppController 指令分發**: 
        - 將指令處理邏輯由 `switch` 重構為 `Map` 映射處理器模式。
    - **[安全性] Tauri 2.0 權限白名單**: 
        - 實作 Tauri 2.0 二階段權限定義，解決生產環境下自定義指令被攔截的問題。
- **目前狀態**：架構高度解耦，安全性達標。

## 2026-05-14 雲端 AI 模型訓練整合 (第一階段) 與產生器架構重構
- **核心進度**：
    - **[重構] Blockly 產生器解耦**:
        - 徹底改寫 `py_function_def`、`py_import` 產生器，利用 `generator.definitions_` 強制將定義置於主執行流之前，解決了「先呼叫後定義」導致的 `NameError`。
    - **[修復] 硬體初始化作用域**:
        - 修正馬達與舵機積木在函式內使用時的變數衝突問題，將初始化邏輯移至全域定義區。
    - **[實作] 雲端 AI 模式 (VSIX 專屬)**:
        - 在右上角新增 **Cloud AI** 開關，具備霓虹燈視覺效果。
        - 實作 **環境連線感知**，透過 `vscode.env.remoteName` 偵測 Remote-SSH 狀態。
        - 實作 **遠端路徑自動沙盒化**，根據主機名自動建立 `~/cocoya_ai/sessions/[MachineID]/` 系列目錄。
    - **[優化] 狀態持久化與同步**:
        - 重構 Bridge 為動態能力架構，修復啟動時雲端模式狀態無法正確維持的 Bug。
- **文檔與術語**：
    - 完成「Local」至「Parameter」的術語統一化工程（含 UI、i18n 與 Key 值）。
    - 在 `log/todo.md` 建立「雲端 AI 模型訓練」專屬里程碑章節。
- **下一步目標**：
    - 開發「雲端影像採集」積木：實作 OpenCV 捕捉並非同步上傳至伺服器 `/dataset` 目錄。
    - 建立伺服器端 Docker 訓練模板 (NVIDIA TAO Toolkit)。
    - 實作模型 (.tflite) 回傳與 MCU 自動燒錄機制。
