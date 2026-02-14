# Cocoya 專案任務清單 (Todo List)
**專案名稱**：Cocoya (Code, Compute, Yield AI)
**核心目標**：建立一個以 Blockly 為介面，幫助 Python 初學者進入 AI 世界的 VSCode extension。

## [已完成] 里程碑 v1.0: 基礎開發容器 (Base Container)
- [x] **UI 佈局**：雙欄 (Blockly + Python Preview)、語法高亮、點擊定位。
- [x] **變數系統**：Prompt 橋樑、Global 宣告、Local 變數區隔。
- [x] **積木變形 (Mutator)**：
    - [x] `if-elif-else` 精確增減與 Undo 支援。
    - [x] `List`, `Dict`, `Tuple` 動態增減。
    - [x] `Function` 參數動態增減。
- [x] **核心模組**：
    - [x] Structure: `import`, `Definition Zone`, `Main`。
    - [x] Logic, Loops, Math, Text, Tools。
- [x] **限制規則**：孤兒積木自動變灰且不產生代碼。
- [x] **工具列與檔案操作**：
    - [x] 實作 Toolbar UI (New, Open, Save, SaveAs, Run, Stop)。
    - [x] 實作 Dirty State 髒狀態追蹤與視覺回饋。
    - [x] 實作 Extension Host 檔案讀寫邏輯。

## [待辦] 里程碑 v2.0: AI 與硬體模組
- [ ] **AI Vision (MediaPipe)**
    - [ ] Face Mesh 偵測積木。
    - [ ] Hand Tracking 偵測積木。
    - [ ] Pose Estimation 偵測積木。
- [ ] **OpenCV 影像處理**
    - [ ] 讀取鏡頭、顯示畫面。
    - [ ] 畫線、畫圓、寫字。
- [ ] **硬體控制 (Serial/CircuitPython)**
    - [ ] Serial 通訊積木。
    - [ ] MCU 腳位控制 (Digital/PWM)。

---
*更新日期：2026-02-14*
