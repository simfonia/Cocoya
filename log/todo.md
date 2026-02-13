# Cocoya 專案任務清單 (Todo List)
**專案名稱**：Cocoya (Code, Compute, Yield AI)
**核心目標**：建立一個支援「Engineer Mode」的通用積木開發容器，具備 Python 代碼預覽與精確定位功能。

## [進行中] 里程碑 v1.0: 基礎開發容器 (Base Container)
- [ ] **UI 佈局優化**
    - [x] 實作雙欄佈局 (Left: Blockly, Right: Code Preview)。
    - [ ] 實作預覽窗格的顯示/隱藏與自動調整大小 (svgResize)。
    - [ ] 預留模式切換 UI (PC / MCU 模式切換鈕)。
- [ ] **精確定位功能 (Code-Block Sync)**
    - [x] 在 Python 產生器核心中實作 `scrub_` 攔截器，自動注入 `# ID:[block_id]` 標記。
    - [ ] 實作 Webview 端代碼解析器：建立 `block_id` 與「行號」的映射表。
    - [ ] 實作選取同步：點擊積木時，預覽窗自動捲動至對應程式碼行。
- [x] **基礎 Python 積木補完 (Engineer Mode)**
    - [x] Math: `+ - * / %` (視覺風格：`a + b`)。
    - [x] Variables: `name = value` (視覺風格：`var = `)。
    - [x] Text: `print()`, `"string"`。

## [未完成] 跨端開發模式 (PC vs MCU)
- [ ] **PC 模式 (Python 3)**
    - [ ] 載入 OpenCV / MediaPipe 專屬模組。
    - [ ] 實作檔案儲存為 `.py`。
- [ ] **MCU 模式 (CircuitPython)**
    - [ ] 載入硬體腳位 (Digital/PWM/I2C) 專屬模組。
    - [ ] 實作檔案儲存至 USB 磁碟 (CircuitPython 部署模式)。
- [ ] **跨端通訊積木**
    - [ ] PC 端發送 (Serial Write)。
    - [ ] MCU 端接收 (Serial Read)。

## [已完成] 專案基礎建設
- [x] 修復 Webview 與 Extension Host 通訊機制 (postMessage Flow)。
- [x] 整合 Python 產生器核心 (`python_compressed.js`)。
- [x] 實作動態模組載入器 (`module_loader.js`)。
- [x] 建立具備識別度的模組命名規範 (`[id]_blocks.js`, `[id]_generators.js`)。
- [x] 建立 `logic` 與 `loops` 基礎 Engineer Mode 積木。

---
*更新日期：2026-02-13*