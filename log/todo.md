# Cocoya 專案任務清單 (Todo List)
**專案名稱**：Cocoya (Code, Compute, Yield AI)
**核心目標**：建立一個以 Blockly 為介面，幫助 Python 初學者進入 AI 世界的 VSCode extension。

## [核心開發原則]
- **跨平台相容性**：開發 `core/*` 目錄下的基礎 Python 核心積木時，**必須優先考慮與 CircuitPython 的語法相容性**。
- **產生器分支**：若 PC 與 MCU 語法無法統一（如 Serial 庫），必須透過 `generator.PLATFORM` 實作條件分支。

## [已完成] 里程碑 v1.0 ~ v2.4 (核心架構、視覺 AI、資料處理、硬體通訊)
- [x] UI 佈局、積木定位、硬體部署基礎。
- [x] MediaPipe 手勢/臉部/姿勢偵測 (33/468 點全追蹤)。
- [x] AR 濾鏡 (Overlay PNG) 與中文顯示 (Pillow Bridge)。
- [x] 運動計數邏輯 (深蹲、彎舉) 與向量角度運算。
- [x] **[New]** 建立 `IO` 分類，整合終端機與序列埠 (Serial) 通訊。
- [x] **[New]** 實作「智慧排空」讀取邏輯，解決感測器時差問題。
- [x] **[New]** 建立 `Types` 操作積木：型別轉換、List/Dict 取值、排序、長度。
- [x] **[New]** 模組重構：`Tools` 更名為 `Coding`，優化分組標籤。
- [x] **[New]** 建立產生器引號規範 (`f"""..."""`)，解決 SyntaxError。

## [待辦] 里程碑 v2.5: 動作分析與教學優化
- [x] **平台相容性優化 (PC & MCU)**：
    - [x] 實作 `Blockly.Python.PLATFORM` 偵測機制。
    - [x] 重構 Serial 積木，適配 PC (pyserial) 與 MCU (usb_cdc)。
    - [x] 優化 `py_main` 與硬體初始化積木的平台分支代碼。
- [ ] **高階動作判定**：
    - [ ] 實作「跳躍」高度計算法。
    - [ ] 實作「開合跳」自動偵測。
- [ ] **效能與穩定性**：
    - [ ] 提升 `Overlay Image` 在高解析度下的運算效能 (NumPy 優化)。
    - [ ] 建立「環境診斷」功能：自動偵測並一鍵安裝缺失之 Python 庫。

## [待辦] 里程碑 v3.0: 硬體腳位控制與物聯網
- [ ] **MCU 腳位控制 (Hardware)**：
    - [ ] Digital/PWM 控制、I2C 感測器讀取積木。
- [ ] **PC-MCU 橋樑應用**：
    - [ ] 實作範例：AI 手勢遠端控制 Arduino LED (PC 轉發模式)。

## [待辦] 里程碑 v4.0: 跨平台支援
- [ ] **跨平台支援 (Linux/macOS Adapter)**：
    - [ ] 重構序列埠偵測邏輯（支援 `/dev/tty`）。
    - [ ] 適應 Linux 磁碟掛載路徑以支援 MCU 部署。

---
*更新日期：2026-02-21 (v2.4 強化版)*
