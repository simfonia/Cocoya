# Cocoya 專案任務清單 (Todo List)
**專案名稱**：Cocoya (Code, Compute, Yield AI)
**核心目標**：建立一個以 Blockly 為介面，幫助 Python 初學者進入 AI 世界的 VSCode extension。

## [已完成] 里程碑 v1.0: 核心架構與基礎功能
- [x] **UI 佈局**：雙欄佈局、語法高亮、積木-代碼雙向導航。
- [x] **工具列功能**：New, Open, Save, SaveAs, Execute, Settings, Update。
- [x] **系統規格**：完成 `system_spec.html` 系統規格書與標準開發規範。
- [x] **多國語系 (i18n)**：Webview UI 與 Extension Host 對話框全面支援雙語。
- [x] **色彩管理**：建立專業的 Hex 色譜，並與變數圖示色碼對齊。
- [x] **專案模式系統 (Mode Locking)**：
    - [x] 支援 Python (PC) 與 CircuitPython (MCU) 模式強制切換。
    - [x] 實現 XML 屬性標記與「開檔即自動偵測模式」。
    - [x] Toolbox 動態過濾與自動化入口積木。
- [x] **硬體部署系統**：
    - [x] 實作 `resources/deploy_mcu.py` 進行裝置傳輸。
    - [x] 支援 `CIRCUITPY` 磁碟直接寫入與 Serial REPL 備援。
    - [x] 整合 Serial Monitor，部署後自動顯示 `print()` 訊息。

## [待辦] 里程碑 v2.0: AI Vision 模組開發
- [ ] **OpenCV 基礎模組 (cv_basic)**
    - [ ] 鏡頭初始化、畫面讀取。
    - [ ] 視窗顯示與鍵盤中斷 (`waitKey`).
- [ ] **MediaPipe 手勢偵測 (ai_hand)**
    - [ ] 模型初始化與特徵點獲取。
    - [ ] 座標正規化與 21 個關節點索引。
    - [ ] 邏輯判斷 (如：手指伸直偵測)。
- [ ] **影像標註模組 (cv_draw)**
    - [ ] 畫圓、畫線、繪製矩形。
    - [ ] 在影像上寫入文字 (putText).
- [ ] **進階 AI 功能**
    - [ ] Face Mesh 臉部網格。
    - [ ] Pose Estimation 姿勢偵測。

## [待辦] 里程碑 v3.0: 硬體通訊與整合
- [ ] **MCU 腳位控制 (Hardware)**
    - [ ] Digital/PWM 控制、I2C 感測器。
- [ ] **PC-MCU 橋樑**
    - [ ] PC 端 Serial 傳送積木 (與 AI 結果整合)。

---
*更新日期：2026-02-14*
