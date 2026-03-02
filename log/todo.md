# Cocoya 專案任務清單 (Todo List)
**專案名稱**：Cocoya (Code, Compute, Yield AI)
**核心目標**：建立一個以 Blockly 為介面，幫助 Python 初學者進入 AI 世界的 VSCode extension。

## [核心開發原則]
- **跨平台相容性**：開發 `core/*` 目錄下的基礎 Python 核心積木時，**必須優先考慮與 CircuitPython 的語法相容性**。
- **產生器分支**：若 PC 與 MCU 語法無法統一（如 Serial 庫），必須透過 `generator.PLATFORM` 實作條件分支。

## [已完成] 里程碑 v1.0 ~ v3.1 (核心架構、視覺 AI、硬體對齊)
- [x] UI 佈局、積木定位、硬體部署基礎。
- [x] MediaPipe 手勢/臉部/姿勢偵測。
- [x] AR 濾鏡 (Overlay PNG) 與中文顯示。
- [x] 平台相容性優化：適配 PC (pyserial) 與 MCU (usb_cdc)。
- [x] 硬體 AI 整合：實作 mcu_camera (XIAO S3), mcu_huskylens, mcu_car (RP2040) 模組。
- [x] 效能優化：實作全域圖片快取，提升 AI 繪圖流暢度。
- [x] 環境診斷：實作 Python 套件需求檢查與一鍵安裝助手。
- [x] **[New] Webview 深度重構**：CSS 抽離、CSP 強化、NaN 屬性攔截、代碼模組化。
- [x] **[New] πCar 功能全面移植**：對齊 #piBlockly 規格，包含運動、感測、音樂與 NeoPixel 系統。
- [x] **[New] MCU 基礎腳位控制 (v3.1 部分)**：實作數位輸出/入、類比讀入、PWM 輸出與 I2C 掃描。

## [待辦] 里程碑 v3.2: 橋樑應用與物聯網
- [ ] **PC-MCU 橋樑應用**：
    - [ ] 實作範例：AI 手勢遠端控制 Arduino LED (PC 轉發模式)。
- [ ] **I2C 感測器擴充**：
    - [ ] 實作常用 I2C 感測器（如 OLED, AHT20）的基礎讀取積木。

## [待辦] 里程碑 v3.3: TinyML 流程與 PC 協力
- [ ] **TinyML 資料採集 (Extension Host)**：
    - [ ] 在 VS Code SideBar 或 Webview 實作影像接收與儲存面板。
    - [ ] 實作自動分類儲存邏輯。
- [ ] **PC-MCU 橋樑應用 (進階)**：
    - [ ] 實作範例：AI 手勢遠端控制 πCar (WiFi/Serial 混合模式)。

## [待辦] 里程碑 v4.0: 跨平台支援
- [ ] **跨平台支援 (Linux/macOS Adapter)**：
    - [ ] 重構序列埠偵測邏輯（支援 `/dev/tty`）。
    - [ ] 適應 Linux 磁碟掛載路徑以支援 MCU 部署。

---
*更新日期：2026-03-02 (v3.1 重構完成版)*
