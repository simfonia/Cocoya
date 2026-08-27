# Cocoya 專案任務清單 (Todo List)
**專案名稱**：Cocoya (Code, Compute, Yield AI)
**核心目標**：以 Blockly 為介面，幫助 Python 初學者進入 AI 世界的 VSCode extension 與獨立桌面應用程式。

## [核心開發原則]
- **SSOT (單一事實來源)**：所有積木、產生器與前端邏輯統一存放於 `ui/src`，由 VSIX 與 Tauri 共享。
- **通訊抽象化**：前端一律透過 `CocoyaBridge` 與後端通訊，禁止在 UI 層直接使用環境專屬 API。
- 完整技術知識請參閱 `log/KNOWLEDGE_BASE.md`（2026-08-24 蒸餾自全部工作日誌並已對照程式碼求證）。

---

## [進行中 / 待辦]

### [規劃完成] Dataset Manager 重構計畫 (2026-08-24)
- 計畫文件：`log/plan/DatasetManagerRefactor.md`
- 目標：拆解 ui_layout.js 上帝模組（108KB/60+ 函式）為 core/io/ui 三層；CSS 變數化主題；i18n 補齊；雙橋接集中於 io/bridge.js
- Phase 2 io 抽出 ☐ / Phase 3 UI 拆解 ☐ / Phase 4 樣式重構 ☐ / Phase 5 文件與知識蒸餾 ☐ / Phase 6 清理總驗證 ☐（Phase 0/1 已完成，見下方 Stage 1 結案）
- 注意：showStatusMessage 定義位置遷移至 ui/statusMessage.js 後須同步 AGENTS.md
- Phase 0 基線備份 ✅ / Phase 1 core 抽出 ✅ / Phase 2 io 抽出 ☐ / Phase 3 UI 拆解 ☐ / Phase 4 樣式重構 ☐ / Phase 5 文件與知識蒸餾 ☐ / Phase 6 清理總驗證 ☐
- **Stage 1（2026-08-26）結案**：交付 `core/{labelMap,stats,state,projectNaming,pathPolicy}.js` + `core/pathPolicy.test.mjs`(11 測試全過)；後端 canonical save/load（VSIX+Tauri）含 errorCode；canonical-only 匯入閘（資料集必須於「專案根/dataset/<資料集名稱>」，外部資料夾提示複製/拒絕中止）；載入 direct canonical 並移除 fallback/AMBIGUOUS 死碼；進入 Dataset Manager 前權威錨定閘；修復自動落盤被快照擋、縮圖 convertFileSrc、Ctrl+R/F5 回首頁、close 誤彈。自動化全綠(node/test/vite/tsc/compile/cargo check/test)。手動 Tauri Dev 實測 PASS(落盤/匯入複製/縮圖/Ctrl+R)。待補：VSIX 對應手動案例、Tauri Release 安裝 smoke、SSH/SFTP 遠端驗證(BLOCKED 主機不通)。
- 下階段：Phase 2 io 層抽出。

### [待辦] 引入 tauri-codegen 產生 typed invoke (2026-08-19)
- [ ] 評估 tauri-codegen / @tauri-apps/types：自動從 #[tauri::command] 簽名生成 TS invoke<cmd>(args)
- [ ] 目標：command 參數缺漏在 tsc 編譯期發現（而非執行期 invalid args）
- [ ] 相依：與 docs/backend_api_manifest.md Parameters 表同步維護 (SSOT -> generate type -> manifest)

### [待辦] 遠端訓練與 SSH 整合（沿用 VSIX 既有 Python sidecar / paramiko 模式）
- [ ] **SSH/Sidecar 上傳流程整合**：實作 `extension.ts` 中 `backend === 'remote'` 的分支（VSIX 已透過 `dataset_sidecar.py` paramiko SFTP 上傳並原位解壓；`checkRemoteEnvironmentResult`/`datasetUploadResult` 已回前端）
- [ ] **Tauri 版 SSH/雲端訓練藍圖**（規劃細節見備份 todo.md_20260824 之「Tauri 版 SSH/雲端訓練實作藍圖」L560）：
  - 新增 `resources/ssh_sidecar.py` 封裝 paramiko（SSH 連線、指令執行、SFTP 傳輸）
  - 新增 Rust `ssh.rs` 指令：`check_remote_env`、`upload_dataset`、`start_remote_training`、`download_results`
  - DGX 流程：「上傳資料集 → SSH 啟動容器 → 監控進度 → 下載結果」；訓練對話框後端選擇（local/DGX）在 Tauri 啟用；SSH 帳密儲存（Tauri 可考慮 `tauri-plugin-store`）
  - 遠端推論 API 整合
- [ ] **Tauri `datasetUploadArchive`**：需後端支援（VSIX 已透過 sidecar SFTP，Tauri 前端仍為空殼 `_dispatchToFrontend`）
- [ ] **容器化訓練腳本**：建立基於 DGX 鏡像（NGC `nvcr.io/nvidia/pytorch` ARM64）的訓練容器與模板程式（舊 Docker 模板已封存於 mvp_hand_gesture/train_templates/）

### [待辦] 長期優化
- [ ] 跨平台序列埠 Friendly Name（macOS/Linux 顯示優化；Windows 已有 VID/PID 映射）
- [ ] 重置韌體 esptool 整合為 Tauri Sidecar 的可行性評估

### 實機驗證未完成項彙整（截至 2026-08-24）
- [ ] Dataset Manager 第二輪 UI：統計同步、label id、三處標籤管理器一致性、排序與顏色（VSIX+Tauri）
- [ ] Startup Home 開新專案流程雙平台（dirty 提示、另存錨定、取消零副作用）、btn-new-window 開新視窗
- [ ] 主題系統：candy 主題實機配色、auto 跟隨系統、重啟記住偏好、VSIX 切語系 reloadWebview
- [ ] [NEW 2026-08-26] 設定選單語言開關 + 主題子選單（ui/index.html + base.js）雙平台實機驗證
- [ ] Tauri 多視窗：雙視窗 run/serial 不污染、失焦釋放/聚焦重取 serial
- [ ] VSIX Deep Repair 實機（Tauri 已驗證）；XIAO CAMERA/FACTORY 模式燒錄埠檢查提醒
- [ ] M4b dataset.json 存讀混合資料（Live+File）套回回驗證（雙平台）

---

## [已完成里程碑總覽]（時間序精簡版，詳情見 log/work/ 對應日期日誌）

### 2026-02 — 專案誕生 v1.0 ~ v2.x
- 02-12 專案命名 Cocoya、混合架構確立、Webview 通訊修復、Python 產生器整合
- 02-13~14 雙欄佈局、ID 定位註解 (# ID:xxx)、工具列/髒狀態/CocoyaManager 模組化、PC/CircuitPython 雙模式
- 02-16~19 AI 視覺模組 (cv_basic/cv_draw/ai_hand/ai_face)、S_ID/E_ID 區間高亮、MediaPipe ai_pose、中文繪圖 PIL Bridge
- 02-21~24 IO/Coding 分類、Serial 模組、平台產生器切換 (PLATFORM)、環境診斷助手

### 2026-03 — 硬體整合 v3.x
- mcu_camera/mcu_huskylens/mcu_car (Maker Pi RP2040 PWM 零依賴)、πCar 全面移植（PiCarServo/MusicEngine）、Minimap/搜尋引擎/ScrollOptions 插件

### 2026-04 — 雙模架構與 Tauri 啟動 v5.0
- 04-09 SSOT 目錄重構、CocoyaBridge 抽象化
- 04-18 deploy_mcu.py Errno22 修復（原生 copy + 內容校驗）
- 04-19 Tauri 2.0 後端啟動（Rust lib.rs、bridge.js 鏡像）
- 04-24~26 主題同步、Minimap NaN 防護、實體自動備份系統（跟隨專案路徑+Forking 保護）、UF2 韌體重置 Strategy A
- 04-29 **重大決策：放棄 CircuitPython 改 MicroPython (Serial REPL)**，deploy_mcu.py 全序列埠 Raw REPL 重寫，硬體產生器遷移 machine 模組
- 04-30 Terminal Singleton 解決 COM 佔用、序列埠智慧辨識 (VID/PID)

### 2026-05 — 架構成熟 v5.x/v6.0
- 05-03~04 響應式佈局、面板收合縮放、Tauri 關閉攔截+3按鈕存檔確認、備份視窗隔離 untitled_backup_{label}
- 05-06~09 **大重構**：ui_manager/main.js/utils.js 模組化拆分、Rust lib.rs 拆 state/utils/commands、AppController Map 分發、Capabilities 能力系統、Tauri 二階段權限定義鐵律確立
- 05-06 MWIP 多視窗完整性協議（file_locks、emit_to 單播、.recovering 備份宣示權）
- 05-14 產生器 definitions_ 解耦（解 NameError）、雲端 AI 模式一期（Remote-SSH 感知、路徑沙盒化）
- 05-20 Blockly.hideChaff 強制寫回值、Geek 270°舵機安全限位
- 05-27~31 **Dataset Manager Phase 1-4**（DatasetSpec/Modal UI/Importer/影像匯入+BBox 標註）、Python Sidecar 架構轉型（OpenCV 原生預覽繞過 Webview getUserMedia 封鎖）

### 2026-06 — 資料集與雲端訓練
- 06-03 Phase 6 匯出 ZIP、401 localResourceRoots 根治
- 04(補)~05 循線標註、畫布 clamp 限幅、遠端 Base64 上傳、zipfile 原位解壓、PATH 注入解 nvidia-smi 找不到
- 07 XIAO S3 全面支援（esptool Serial 燒錄、多段 Factory 韌體、128-byte 分塊）、REPL 雙向通訊、Silence Mode 修打字失焦
- 11 SSH Sidecar 方案 C 閉環（paramiko SFTP 上傳解壓）
- 20 Y姿勢控制 πCar 範例
- 24 DGX Spark Docker 訓練鏈路驗證完成（94.68% vs 本地 92.55%）、ARM64 用 NGC pytorch 容器
- 25~29 通用訓練模板 train_templates/、訓練積木 py_ai_train_run、推論積木 py_ai_model_init/predict、i18n BKY_ 前綴規則確立

### 2026-07 — 訓練生態完善
- 05~08 訓練報告 HTML 化、extension.ts 模組化重構（handlers/*.ts）、範例英文化（中文路徑 openExternal 0x2 坑）
- 09~10 多攝影機選擇、刪除照片同步磁碟、pickFolder 修復
- 11~12 MicroPython 入門範例 6 個、AI 訓練積木擴充（common/*.py 共同模組、通用推論 _ModelInference、4 解析積木）、Help 系統 docs/help/
- 18 Tauri sidecar 三指令（start_sidecar/sidecar_send/stop_sidecar）、逐 byte 讀 stdout 防 BufReader 吃 event
- 29 serde camelCase 鐵律確立（ScanedImage blob_url 坑）、datasetExport Rust 版、Value 積木定位 findLocatableBlock、工作區註解功能（registerCommentOptions）、Minimap 註解同步 v2/v3
- 30~31 Dataset Manager 7 項優化、sidecar ping 輕量健康檢查、i18n.js 共享 t() 模組

### 2026-08 — 錨定、多視窗與主題系統
- 01~02 openTrainingReport Tauri 版、訓練確定性（TF 種子+deterministic ops）、MODEL_OUTPUT 下拉與推論 MODEL_TYPE
- 04 detector_train.py（MobileNetV2 回歸頭 Dense(4)）、YOLO 匯出、py_ai_get_bbox_center
- 06~09 BBox 全寬 3 欄標註 UI、分類標籤校正模式、validate() 類型感知分級、sidecar 區域 import 遮蔽全殘 bug
- 10~15 **專案根錨定 SSOT**（get_project_anchor、Startup Home、_refreshAnchor）、live savePath 接回、M4b dataset.json 等級一存讀、自動落盤方案 A（800ms 防抖）、savePath basename 單一時間戳鐵律
- 17 Dataset Manager 第二輪 UI（showStatusMessage 集中化、名稱衝突警示、FNV-1a 標籤配色、nextLabelId）
- 19 reset_firmware invalid args 修復（Option<String>）、backend_api_manifest.md Parameters SSOT、跨語言簽名同步規範
- 20 **多視窗終端機隔離**（emit_to 全轉換）+ serial 失焦釋放/聚焦重取方案 B（set_window_focus）
- 21~24 Startup Home 平台選擇/範例/快速設定、「先確認後破壞」開新流程、tag 回傳鏈、乾淨初始 XML、**Theme Manager 主題模組**（registry/msgColours/cssVars/reloadWebview+時間戳強制重建）、candy 第三主題驗證資料驅動換膚

*本清單於 2026-08-24 精簡重整（原始完整版備份於 backup/todo.md_20260824_231017.bak）*
