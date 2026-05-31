# Cocoya 專案任務清單 (Todo List)
**專案名稱**：Cocoya (Code, Compute, Yield AI)
**核心目標**：建立一個以 Blockly 為介面，幫助 Python 初學者進入 AI 世界的 VSCode extension 與獨立桌面應用程式。

## [核心開發原則]
- **SSOT (單一事實來源)**：所有積木、產生器與前端邏輯必須統一存放在 `ui/src` 下，由 VSIX 與 Tauri 共享。
- **通訊抽象化**：前端必須透過 `CocoyaBridge` 與後端通訊，禁止在 UI 層直接使用環境專屬 API。

## [已完成] 里程碑 v1.0 ~ v4.9 (功能對齊與 Bug 修復)
- [x] MediaPipe AI 視覺模組、πCar 硬體控制與 MCU 部署基礎。
- [x] **[重大修復]** 解決 VSIX 模式下搜尋影子積木遺失、Minimap 不同步、Python 縮排位移等 Bug。
- [x] **[重大修復]** 強化 MCU 部署韌性，解決 Windows 磁碟鎖定 (Errno 22) 並整合 VS Code 進度通知。
- [x] **[Bug 修復]** 解決積木欄位輸入值未按 Enter 即點擊按鈕導致代碼未更新的問題 (2026-05-20)。
- [x] **[功能開發]** 支援 Geek 270 度舵機，具備型號選單預設值與小車動作安全限位機制 (2026-05-20)。
- [x] **[Bug 修復]** 解決 Geek 270 舵機歸位截斷、平滑移動死鎖與 Sticky Drag 問題 (2026-05-25)。
- [x] **[Bug 修復]** 解決 MicroPython 模式下，積木 lazy init 導致的 `NameError: local variable referenced before assignment` 問題 (2026-05-31)。
- [x] **[UI/UX]** 優化 Minimap 顯示，移除捲軸並實作滿版縮圖模式 (2026-05-31)。
- [x] **[風格優化]** 將 Time 分類積木重構為 Python 函式描述風格 (2026-05-25)。

## [已完成] 里程碑 v6.0: 全面轉向 MicroPython
- [x] **[核心] 底層通訊重構**：重寫 `deploy_mcu.py`，改採全序列埠 (Raw REPL) 傳輸，解決磁碟鎖定問題。
- [x] **[核心] 硬體產生器 (HAL) 遷移**：重寫馬達、舵機、超音波、音樂引擎與 Camera 驅動邏輯 (使用 `machine` 庫)。
- [x] **[UI] 介面清理與環境優化**：重新設計設定選單，移除過時的 USB 鎖定功能，實作「深度修復磁碟」。
- [x] **[UI/UX]** 為「深度修復」加入 Hover說明與垃圾桶圖示，修正「重建磁區」誤導術語。
- [x] **[核心/VSIX]** 實作序列埠智慧辨識 (Smart Labeling) 與高效能非同步偵測。
- [x] **[核心/VSIX]** 實作 Terminal Singleton 模式，徹底解決 COM 埠佔用衝突。

## [進行中] 里程碑 v6.0: MicroPython 模式補完
- [x] **[核心] 基礎硬體產生器遷移**：將 `hardware_generators.js` 中的 `board`, `digitalio`, `pwmio` 替換為 MicroPython 的 `machine` 庫。
- [x] **[核心] 數學模組 MicroPython 相容性**：修正 `math_generators.js` 中的隨機種子初始化。
- [ ] **[UI/UX]** (已取消) 自製捲動感應器。目前已將原本插件預設值設為關閉。
- [ ] **[範例] 範例專案更新**：補完並測試 MicroPython 模式下的所有範例專案。
- [ ] **[韌體] 資源包準備**：準備各型號板子的 MicroPython 韌體資源包 (.uf2 / .bin)。

## [進行中] 里程碑 v5.0: 雙模架構轉型 (VSIX + Tauri)
- [x] **資源遷移與目錄重構**：建立 `ui/` SSOT 結構，徹底移除 `media/`。
- [x] **通訊抽象層實作**：建立 `CocoyaBridge` 並支援非同步 API 加載機制。
- [x] **VSIX 模式穩定化**：完成路徑適配與體備優化 (.vscodeignore)。
- [ ] **Tauri 獨立 App 開發**：
    - [x] 建立 `src-tauri` 核心架構 (Rust, Capabilities, tauri.conf.json).
    - [x] 實現部分指令鏡像：`run_python` (含串流日誌)、`get_manifest`、`get_module_toolbox`.
    - [x] 實現檔案系統指令：`save_file` (含 dialog)、`open_file`.
    - [x] 實現序列埠 hardware 指令：`get_serial_ports`、`deploy_mcu`.
    - [x] **[重大修復]** 徹底解決視窗關閉攔截失效、權限缺失與標題同步問題.
    - [x] **[重大修復]** 實作多視窗備份隔離與自動清理機制.
    - [x] **[重大修復]** **Rust 後端模組化重構**：完成 `lib.rs` 切割與 API SSOT 建立。
    - [x] **UI 邏輯架構重構 (Modularization)**:
        - [x] 建立 `api_manifest.md` 作為重構參考。
        - [x] 遷移 Terminal 邏輯至 `ui/terminal.js`。
        - [x] 遷移 Renderer & Layout 邏輯至 `ui/renderer.js`。
        - [x] 遷移 Hardware 控制邏輯至 `ui/hardware.js`。
        - [x] 遷移 Dialog & Feedback 邏輯至 `ui/dialogs.js`。
        - [x] 模組化 `main.js` (App 核心、Workspace、Persistence)。
        - [x] **[DONE]** 分拆 `utils.js` 到獨立子模組 (積木、產生器、工具函式)。
        - [x] **[DONE]** 優化 `AppController` 為 Map 映射處理器模式。
    - [ ] 整合 `deploy_mcu.py` 作為 Tauri Sidecar 以利打包發布.
    - [ ] 實作重置韌體功能 (Reset Firmware)：
        - [x] 策略 A：UF2 複製模式 (適用於 RP2040)。
        - [ ] 策略 B：Serial 模式 (適用於 ESP32-S3，需整合 esptool Sidecar)。
    - [x] 實現 Tauri 模式下的 **環境診斷** (check_environment)。
- [x] **建置自動化**：配置 Vite Build (vite.config.js)，實作自動資產同步外掛，解決 Tauri 生產環境 JS缺失問題。
- [x] **[UI/UX] 響應式工具列修正**：解決視窗過小時工具列溢出疊加問題，導入媒體查詢與 `minWidth` 限制。
- [x] **[UI/UX] 程式碼預覽面板收合與縮放**：實作可切換的收合把手 (對齊 #wavecode) 與手動調整垂直分割面積功能。
- [x] **[Bug 修復]** 修復 VSIX 模式下 Python 套件檢查 (check_environment) 卡住的問題。

## [已完成] 雲端 AI 模型訓練整合 (第一階段)
- [x] **模式切換**：於工具列右上角加入「雲端 AI 模式」開關。開啟時，所有 Python 執行與檔案讀寫將自動導向遠端伺服器。
- [x] **Tauri 版隔離**：本功能初期僅限 VSIX 版本，透過 `CocoyaBridge` 進行環境隔離，隱藏不支援選項。
- [x] **自動路徑管理**：根據學生電腦 Hostname，在伺服器端自動建立隔離路徑 (如 `~/cocoya_ai/sessions/[MachineID]/`)。

## [進行中] 雲端 AI 模型訓練 (NVIDIA NGX Spark 整合)
- **核心方針**：利用 VSIX (VS Code Extension) 作為載體，結合 Remote-SSH 插件實現「本地編寫、雲端訓練、跨端部署」。
- [ ] **環境診斷**：針對遠端環境 (Remote Host) 進行專屬的 CUDA、Docker 與 Python 模組檢查。
- [ ] **雙向同步**：實現積木生成代碼 (.py) 與資料集 (Images/CSV) 的非同步上傳機制。
- [ ] **伺服器端容器化訓練**：建立基於 NGC TAO 鏡像的訓練容器與模板程式。
- [ ] **PC 模式推論支援**：支援直接在雲端執行推論程式，並將辨識結果串流回本地。
- [ ] **MCU 模式部署**：自動將訓練出的 `.tflite` 下載並燒錄至 πCar (XIAO S3 Sense)。

## [待辦] 里程碑 v5.1: 跨平台與 TinyML
- [ ] **[核心/跨平台]** 實作 macOS/Linux 的序列埠 Friendly Name 偵測 (ioreg/udevadm)。
- [ ] **TinyML 工具整合**：在獨立應用程式模式下提供影像標註與資料採集面板。
- [ ] **IMU 數據即時折線圖**：實作數據視覺化面板，協助理解特徵波形。
- [ ] **Micro:bit 2.0 強化**：無線電積木補完與加速度計數據流壓縮。

---
*最後更新日期：2026-05-20 (修復積木欄位焦點未同步 Bug)*

## [進行中] Dataset Manager 資料集管理器 (2026-05-28)
- [x] **[規格]** 建立 `log/todo/dataset_manager_development_spec.md`，整理 Dataset Manager 開發流程、載入策略、Dataset Spec JSON 與分階段交付標準。
- [x] **[Phase 1]** 建立 `ui/src/modules/dataset_manager/spec.js`，實作 `DatasetSpec`、Schema 偵測與驗證邏輯。
- [x] **[Phase 1]** 建立 `ui/src/modules/dataset_manager/index.js`，以靜態 ESM 掛載 `window.CocoyaDataset`。
- [x] **[Phase 1]** 更新 `ui/index.html`，將 Dataset Manager 載入順序放在 `bridge.js` 之後、`main.js` 之前。
- [x] **[Phase 2]** 建立 Dataset Manager Modal UI、CSS 與 open/close/toggle 實作。
- [x] **[Phase 3]** 實作 CSV/JSON 匯入與 Field Mapper。
- [x] **[Phase 4]** 實作影像目錄批次匯入、縮圖網格 (Grid) 預覽、標籤自動提取與互動標註畫布。
- [x] **[優化] Phase 3~4 技術債清理**：升級強健型 CSV Parser、實作 XSS 防護、解耦 Canvas 事件監聽並修正 Schema 套用邏輯 (2026-05-29)。
- [x] **[Phase 5]** 實作 Dataset Runtime Sidecar 採集架構 (Sidecar Runtime)：
    - [x] **[架構]** 整合 Python Sidecar 通訊，移除 Webview 攝影機依賴。
    - [x] **[#trim]** 徹底移除 Legacy 採集腳本與語法歧義 (2026-05-31)。
    - [x] **[UX]** 重構標籤管理介面，實作「方案 A」獨立新增按鈕模式。
    - [x] **[修復]** 實作攝影機視窗手動關閉偵測與 UI 狀態非同步同步。
- [x] **[Phase 6]** 實作資料集匯出與 ZIP 打包功能 (2026-06-03)：
    - [x] 擴充 Python Sidecar 支援 `exportDataset` 指令。
    - [x] Extension 端實作原生資料夾挑選器，支援路徑記憶 (`globalState`)。
    - [x] **[修復]** 解決 Webview 401 錯誤 (透過動態磁碟根目錄許可與 CSP 優化)。
    - [x] **[修復]** 實作匯出前自動檔案同步機制，確保 ZIP 包含完整影像。
    - [x] UI 端整合匯出按鈕，保留 `safeBaseDir` 等智慧填寫邏輯。
- [ ] **[Phase 7]** 對接 NVIDIA NGX Spark 雲端訓練介面。
- [x] **[規範]** 優化專案根目錄 `.antigravity.md` 與 `AGENTS.md`，整合轉義字元與換行處理規範，並修正工作日誌副檔名為 `.html` (2026-06-04)。
- [x] **[修復]** 實作 Dataset Manager 狀態與模式切換重構，包含 Type-Mode 選項關聯與切換時的主動硬體相機清理 (2026-06-04)。
- [x] **[修復]** 解決補拍影像未匯出 Bug，優化 extension 與匯出的 baseDir 對齊為工作區根目錄，並優化補拍縮圖置前排列 (2026-06-04)。
- [x] **[功能]** 新增「清除資料」按鈕，實作一鍵狀態與硬體快取重置，解決關閉後重啟之狀態殘留問題 (2026-06-04)。
- [x] **[修復]** 實作標註畫布上下欄分割排版（資訊欄置上），修復 Flexbox 居中對齊導致列表溢出時滾動條無法捲動到頂部的 CSS Bug (2026-06-04)。
- [x] **[功能]** 實作自駕車循線偵測標註功能，支援滑鼠拖曳與點按兩點雙模繪圖、起終點座標限幅貼齊邊界（適用於 BBox 與 Line），並重構 `spec.js` 移除違規的 spread operator `...` 語法以徹底對齊開發規範 (2026-06-04)。


---
*最後更新日期：2026-06-04 (重構標註版面與修復滾動 Bug)*



