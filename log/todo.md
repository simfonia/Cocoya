# Cocoya 專案任務清單 (Todo List)
**專案名稱**：Cocoya (Code, Compute, Yield AI)
**核心目標**：建立一個以 Blockly 為介面，幫助 Python 初學者進入 AI 世界的 VSCode extension。

## [已完成] 里程碑 v1.0: 核心架構與基礎功能
- [x] **UI 佈局**：雙欄佈局、語法高亮、積木-代碼雙向導航。
- [x] **工具列功能**：New, Open, Save, SaveAs, Execute, Settings, Update。
- [x] **系統規格**：完成 `system_spec.html` 系統規格書與標準開發規範。
- [x] **多國語系 (i18n)**：Webview UI 與 Extension Host 對話框全面支援雙語。
- [x] **色彩管理**：建立專業的 Hex 色譜，並與變數圖示色碼對齊。
- [x] **專案模式系統 (Mode Locking)**：支援 PC/MCU 強制切換與 XML 屬性自動偵測。
- [x] **硬體部署系統**：實作真實的 MCU 部署邏輯與 Serial Monitor。

## [已完成] 里程碑 v1.5: 架構優化與標準化 (2026-02-16)
- [x] **模組結構重整**：將所有模組統一放置於 `media/modules/` 下，簡化路徑邏輯。
- [x] **平行載入機制**：實作 `Promise.all` 加載模組，提昇啟動速度並確保順序一致。
- [x] **語系分散化 (Modular i18n)**：實作分散式語系檔，解決核心語系檔過於臃腫的問題。
- [x] **除錯同步優化**：實現「Preview 即執行檔」1:1 同步，改用行尾 ID 註解，解決位移與縮排錯誤。
- [x] **效能提昇**：優化孤兒檢查演算法為 $O(N)$ Top-Down 模式，解決垃圾桶動畫 Lag。
- [x] **積木定義標準化**：全面改用 `jsonInit` + `args0` 模式重構現有積木。
- [x] **UI 進階功能**：新增「縮排對齊線」與「2/4 Spaces 切換」、「複製程式碼」功能。

## [已完成] 里程碑 v2.0: AI Vision 基礎 (2026-02-16)
- [x] **OpenCV 基礎模組 (cv_basic)**
    - [x] 鏡頭初始化、畫面讀取、影像翻轉。
    - [x] 視窗顯示與鍵盤中斷 (`waitKey`).
- [x] **影像標註模組 (cv_draw)**
    - [x] 畫圓、畫線、繪製矩形。
    - [x] 在影像上寫入文字 (putText).
    - [x] 實作精簡版座標與顏色輸入積木。

## [待辦] 里程碑 v2.1: MediaPipe 整合
- [ ] **MediaPipe 手勢偵測 (ai_hand)**
    - [ ] 模型初始化與特徵點獲取。
    - [ ] 座標正規化與 21 個關節點索引。
    - [ ] 邏輯判斷 (如：手指伸直偵測)。
- [ ] **進階 AI 功能**
    - [ ] Face Mesh 臉部網格。
    - [ ] Pose Estimation 姿勢偵測。

## [待辦] 里程碑 v3.0: 硬體通訊與整合
- [ ] **MCU 腳位控制 (Hardware)**
    - [ ] Digital/PWM 控制、I2C 感測器。
- [ ] **PC-MCU 橋樑**
    - [ ] PC 端 Serial 傳送積木 (與 AI 結果整合)。

---
*更新日期：2026-02-16*
