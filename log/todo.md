# Cocoya 專案任務清單 (Todo List)
**專案名稱**：Cocoya (Code, Compute, Yield AI)
**核心目標**：建立一個以 Blockly 為介面，幫助 Python 初學者進入 AI 世界的 VSCode extension。

## [已完成] 里程碑 v1.0 ~ v2.3 (核心架構、視覺 AI、AR 與遊戲化)
- [x] UI 佈局、積木定位、硬體部署基礎。
- [x] MediaPipe 手勢偵測 (ai_hand) 與手勢邏輯 (OK 手勢)。
- [x] MediaPipe 臉部網格 (ai_face) 與 AR 濾鏡技術 (皇冠)。
- [x] MediaPipe 姿勢偵測 (ai_pose) 33 點追蹤與骨架標註。
- [x] 影像中文顯示支援 (PIL Bridge) 與半透明 UI 標註。
- [x] 運動計數邏輯 (深蹲、彎舉) 與向量角度運算 (atan2)。
- [x] AI 體感互動遊戲 (12_NosePopper, 13_Advanced)。
- [x] 核心積木擴充：三元運算、文字格式化 (zfill)、夾角圓弧。

## [待辦] 里程碑 v2.4: 動作分析與教學優化
- [ ] **高階動作判定**：
    - [ ] 實作「跳躍」高度計算法。
    - [ ] 實作「開合跳」自動偵測。
- [ ] **效能與穩定性**：
    - [ ] 提升 `Overlay Image` 在高解析度下的運算效能 (NumPy 優化)。
    - [ ] 建立「環境診斷」功能：自動偵測並一鍵安裝缺失之 Python 庫。

## [待辦] 里程碑 v3.0: 硬體通訊與物聯網
- [ ] **MCU 腳位控制 (Hardware)**：
    - [ ] Digital/PWM 控制、I2C 感測器讀取積木。
- [ ] **PC-MCU 橋樑**：
    - [ ] PC 端 Serial 傳送積木 (將 AI 辨識結果轉發至硬體)。

## [待辦] 里程碑 v4.0: 跨平台支援
- [ ] **跨平台支援 (Linux/macOS Adapter)**：
    - [ ] 重構序列埠偵測邏輯（支援 `/dev/tty`）。
    - [ ] 適應 Linux 磁碟掛載路徑以支援 MCU 部署。

---
*更新日期：2026-02-18 (v2.3 穩定版)*
