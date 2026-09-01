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
- **Stage 2 切片 1-5（2026-08-29）**：補做指引 Stage 2（Ports/Adapter）——新增 `dataset_manager/io/bridge.js`（唯一 Bridge Port：request correlation/timeout/cancel/unsubscribe/dispose，fake transport 測試 8/8 PASS）；`ui_layout.js` 與 `sampler.js` 全部通訊改經 datasetBridge，direct `window.CocoyaBridge` 殘留 = 0；行為契約未變、後端零修改。A2-5/6/7（雲端上傳）標 N/A（RemoteTrainingRefactor D2 已移除）。詳見 `log/work/2026-08-29.md`。
- **Stage 3 切片 4（2026-08-29）**：新增 `application/annotationMutations.js`（10 純函式 + 7 測試）；ui_layout 5 處 mutation 接線、exportUseCases 計數共用。**Stage 3 收斂**（指引 §6.2 步驟 1-5 完成，cloud upload N/A）；enter/exit 模式編排屬 Stage 4。U3-1~U3-4 實機待測（backlog）。
- **Stage 3 切片 3（2026-08-29）**：新增 `application/exportUseCases.js`（exportDataset 編排：未標註/未分類 confirm + Spec 驗證 + datasetExport correlation）；ui_layout 匯出入口改委派 wrapper（3 處 onclick 零改動）。自動化全綠。Stage 3 剩：annotation/classification mutation 搬移（建議下一輪獨立切片）。
- **Stage 3 切片 2（2026-08-29）**：新增 `application/importUseCases.js`（parseDataFileRows 純轉換 + importDataFile/importDirectory 編排，測試 7/7）；ui_layout 匯入入口改委派 wrapper。自動化全綠；U3-3 實機待測（backlog）。下一切片：exporter 抽出（handleExportDataset → application/exportUseCases.js，U3-1 匯出側）。
- **Stage 3 切片 1（2026-08-29）**：新增 `application/progressUseCases.js`（load/save/autosave/cancelAutoSave use-case，依賴注入、通訊經 io/bridge.js）；ui_layout 保留同名 wrapper；close 時 cancelAutoSave + Sampler.dispose。自動化全綠；U3-1/U3-2 實機待測（backlog）。下一切片：importer/exporter 純轉換與 I/O 分離（U3-3）。
- **手動測試延後決策（2026-08-29）**：A2-1~A2-4、C1 遺留、U3-* 統一登錄 `log/plan/DatasetManagerManualTestBacklog.md`，最後集中執行；Gate 簽核延後。
- **Stage 4 切片 1（2026-08-30）**：新增 `ui/statusMessage.js`（集中式狀態訊息 Presenter：showStatusMessage/dispose，計時器重置與 dispose 語意不變，documentRef 可注入）；`ui_layout.js` 移除全域 statusMessageTimer/STATUS_MESSAGE_DURATION/showStatusMessage function，改模組頂部 const 暴露（use-case 注入不變），closeDatasetManager 補 statusMessagePresenter.dispose()；新增 `ui/statusMessage.test.mjs`（7 測試）；AGENTS.md 定義位置 + FILE_STRUCTURE.md 同步。自動化全綠（node --check ×3、node --test 40/40、vite build）。UI4-4 實機待測（backlog）。下一切片：ui/modal.js（createModal/bindModalEvents/open-close 生命週期，§7.2 步驟 2）。
- **Stage 4 切片 2（2026-08-30）**：新增 `ui/modal.js`（buildModalTemplate 純函式，modal 模板自 createModal 原樣移出、DOM 契約零變更）+ `ui/modal.test.mjs`（5 測試）；`ui_layout.js` createModal 改用之；**修正訂閱洩漏**——offBridgeMessage 原被丟棄致 refreshI18n 重建累積重複 listener，改掛 modal._offBridgeMessage 並於卸載前解除。自動化全綠（node --check ×3、node --test 45/45、vite build）。UI4-1 實機待測（backlog）。下一切片：ui/form.js（§7.2 步驟 3：form 讀寫與 spec sync 分離）。
- **Stage 4 切片 3（2026-08-30）**：新增 `ui/form.js`（createFormPresenter({getModalRoot})→{getFormValue,getColumnsFromUI,dispose}，唯讀、modal root 可注入）+ `ui/form.test.mjs`（7 測試）；`ui_layout.js` 改 formPresenter 委派 wrapper（呼叫點零改動）；`syncSpecFromUI` 依「form 讀寫與 spec sync 分離」留在協調層、讀取改經 presenter。自動化全綠（node --check ×3、node --test 52/52、vite build）。下一切片：ui/thumbnails.js（§7.2 步驟 4：scroll save/restore 集中管理）。
- **Stage 4 切片 4（2026-08-30）**：新增 `ui/thumbnails.js`（createGridScrollManager({state,getContainer,hasImages})→{saveGridScroll,restoreGridScroll,dispose}；state._savedGridScrollTop 契約不變、container 缺失早退不清空等原語意逐行對齊）+ `ui/thumbnails.test.mjs`（8 測試含 round-trip）；`ui_layout.js` 改 gridScrollManager 委派 wrapper（四處呼叫點零改動）。自動化全綠（node --check ×3、node --test 60/60、vite build）。UI4-3 實機待測（backlog）。下一切片：ui/classification.js（§7.2 步驟 5：分離 classification state machine）。
- **Stage 4 切片 5（2026-08-30）**：新增 `ui/classification.js`（createClassificationController——分類校正模式五函式 enter/load/renderControls/updateProgress/keyboard bind-unbind + dispose；依賴全注入、沿用 state.annotationMode 統一狀態機、classificationKeyHandler 改閉包私有）+ `ui/classification.test.mjs`（7 測試）；`ui_layout.js` 改五個同名委派 wrapper（呼叫點零改動），closeDatasetManager 補 classificationController.dispose()。自動化全綠（node --check ×3、node --test 67/67、vite build）。UI4-2 實機待測（backlog）。
- **Stage 4 切片 6（2026-08-30）**：新增 `ui/annotation.js`（createAnnotationController——bbox/line 標註模式八函式 enter/save/load(UICanvas.init+debounce)/renderControls/renderListUI/progress/畫布鍵盤/delete + dispose；mutation 純函式 import application/annotationMutations.js；image 分流與 exit/navigate/updateThumbnailHighlight 共用邏輯留協調層）+ `ui/annotation.test.mjs`（7 測試）；`ui_layout.js` 改同名委派 wrapper（呼叫點零改動），closeDatasetManager 補 annotationController.dispose()。自動化全綠（node --check ×3、node --test 74/74、vite build）。UI4-2 bbox 側自動化 PASS、實機待測（backlog）。下一切片：ui/panels.js（§7.2 步驟 7）。
- **Stage 4 切片 7（2026-08-30）**：新增 `ui/panels.js`（createPanelsPresenter——renderColumnRow/renderValidation/renderPreviewTable/addColumn/renderAllColumns + dispose；唯呈現層、依賴全注入）+ `ui/panels.test.mjs`（6 測試）；`ui_layout.js` 改同名委派 wrapper；`refreshDynamicPanels`（Sampler/label manager 重度耦合編排）留協調層。自動化全綠（node --check ×3、node --test 80/80、vite build）。Stage 4 剩餘：Gate 收斂（手動案例集中測）。

### [待辦] 引入 tauri-codegen 產生 typed invoke (2026-08-19)
- [ ] 評估 tauri-codegen / @tauri-apps/types：自動從 #[tauri::command] 簽名生成 TS invoke<cmd>(args)
- [ ] 目標：command 參數缺漏在 tsc 編譯期發現（而非執行期 invalid args）
- [ ] 相依：與 docs/backend_api_manifest.md Parameters 表同步維護 (SSOT -> generate type -> manifest)

### [待辦] 遠端訓練與 SSH 整合（沿用 VSIX 既有 Python sidecar / paramiko 模式）
- [x] **D1 (2026-08-28) 模板 smart 同步**：sidecar trainRemote 前自動上傳變更的 `train_templates/`（find+zip+sftp+遠端解壓至 `~/cocoya_ai/sessions/{machine}/templates`）；未變更零上傳
- [x] **D2 (2026-08-28) docker_cmd 改掛 /workspace + 依 task_type**：`-v templates:/workspace python3 /workspace/{task}/{task}_train.py`，傳完整 hyperparams + `--model_output`（none→只產報告 / keras→產keras）
- [x] **D3 (2026-08-28) 全參數傳遞 + 本地 TFLite 轉換**：tauri.js/VSIX trainingOps.ts 解析 modelOutput/taskType/backbone 等全參；新增 `_local_convert_tflite.py` 掃本地 dataset 建 representative 依 model_output 轉 int8/f32/all（對齊 classifier_train 命名）
- [x] **D4 (2026-08-28) 產物路徑回傳**：sidecar 回傳 report/keras/curve/history 絕對路徑；前端開啟報告正確位置
- [ ] D5 文件同步收尾（parity matrix / manifest / FILE_STRUCTURE / help）
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
- **Stage 4 Gate 收斂盤點（2026-08-30）**：§7.4 Gate 逐項盤點完成——項 1/3/5 自動化 PASS（80/80、index.js/sampler.js/ui_canvas.js 零修改）；項 2/4 部分達成（UI4-1~UI4-5 實機集中測待執行、Object URL revoke 無自動化測試）；項 6 簽核 PENDING。§7.2 步驟 6 之 sampler/canvas lifecycle 判定：sampler.js 已於 Stage 2 controller 化（dispose/correlation/revoke）、UICanvas init 已注入 annotation controller，邊界清楚、不需第八切片；選配可補 sampler Object URL revoke 單元測試。剩餘：手動測試集中執行 → Gate 簽核。

## AI Agent Handoff（Stage 5 切片 1：CSS 色彩盤點）

- 日期：2026-08-30
- Agent：Cline
- 階段：Stage 5 切片 1（§8.2 步驟 1：列出現有色彩/尺寸/focus/error/disabled selector）
- 狀態：READY_FOR_REVIEW（純盤點，零程式碼/視覺變更）
- HEAD：`7705536`（Stage 4 已 commit；本切片僅新增 log/plan/DatasetManagerStyleTokens.md + 日誌）
- 產出：`log/plan/DatasetManagerStyleTokens.md`——207 處色彩/99 唯一值/var()=0/dark 覆寫 128 行的總量盤點；品牌粉/中性灰/暗表面/成功綠/錯誤紅/警示橘/資訊藍/遮罩八組語意分組；focus/error/warning 狀態 selector 位置（disabled 無 selector，需補 token）；`--dsm-*` token 對照表提案；VSIX 靜態載入與 theme_manager cssVars 層級相容性風險（關鍵：light 預設須掛 :root/body 而非 dialog，否則主題換膚失效）
- 修改檔案：log/plan/DatasetManagerStyleTokens.md（新）、log/work/2026-08-30.md、log/todo.md、parity matrix
- 測試命令與結果：N/A（無程式碼變更）；盤點數據以 Select-String 統計（207 處、99 唯一、var()=0、dark selector 128 行）
- 下一個 agent 第一動作：Stage 5 切片 2（§8.2 步驟 2）——依盤點文件 §4 對照表，以 `:root`/body 定義 `--dsm-*` light 預設值，逐批把高頻色彩（#FE2F89 19 處、灰階文字/邊框）改為 var() 參照；每批後 node --test + vite build + light/dark/candy 三主題目視對照
- 禁止重做或修改的事項：§8.2 步驟 2 鐵律——token 化不改視覺值；不得動 ESLint config/Vite classic warnings；不得將 BLOCKED 標 PASS
- 需要產品決策的問題：① alpha 變體收斂幅度（brand 7 種 → 1-2 種？）② disabled 態目前無樣式，是否補定義 ③ 尺寸 token（間距/圓角）是否納入本 Stage 或僅做色彩
- 交接者：Cline

## 下次啟動方向 (Next Steps)

- Stage 5 切片 2：token 定義 + 高頻色彩 var() 化（依 DatasetManagerStyleTokens.md §4/§6）；決策點見 Handoff。
- **Stage 5 切片 2（2026-08-30）**：token 定義（:root：--dsm-brand/soft/strong + disabled 三 token）+ 品牌粉 19 處 var() 化 + alpha 7 處收斂（soft .15/strong .3，使用者裁示）+ dialog disabled 規則。事故：regex 誤替換 :root 致循環參照已修正。自動化全綠（80/80、build PASS）。三主題目視待實機。下一切片：灰階 token 化 + dark 區塊收斂（切片 3）。
- **Stage 5 切片 3（2026-08-30）**：灰階 token 化——`:root` 補 5 個 text/border token（精確等值）+ light 側 21 處 var() 化；dark 區塊留切片 4。事故：substring Replace 誤傷 dark 區塊 border-color（7 處），以區間掃描器偵測還原。自動化全綠（80/80、build PASS）。下一切片：dark/HC token 覆寫收斂（切片 4）。
- **Stage 5 切片 4（2026-08-30）**：dark/HC token 覆寫——`body.vscode-dark/high-contrast` 定義 text/border 五 token dark 值（等值），dark 區塊 24 處 var() 化；語意色與 surface 背景保留。自動化全綠（80/80、build PASS）。下一切片：candy/dark 主題 cssVars 補 `--dsm-*`（切片 5，解決 candy 換膚 DM 無變化）。
- **Stage 5 切片 5（2026-08-30）**：candy/dark/light 三主題 cssVars 各補 11 個 --dsm-*（DM 隨主題換膚真正生效）；light 也補確保切回無殘留（theme_manager 不清舊 cssVars）。node --check ×3、80/80、build PASS。下一切片：i18n key parity（切片 6）。
- **Stage 5 切片 5b（2026-08-30）**：DM 容器背景 token 化（--dsm-surface/-alt，light/dark/candy 三值），修正「DM 背景未套用主題」。每主題 --dsm-* 13 key。node --check ×3、80/80、build PASS。
- **（長遠債）--`--dsm-*` dark/token 收斂（延伸，Stage 5）**：vscode-dark 覆寫（16）與 cocoya_dark 主題 cssVars（22）各持有 --dsm-* dark 值、非單一事實來源（例 --dsm-error-bg 兩處 #3d1b1b / #2d1515）。目前互斥無實際衝突，但調色需改兩處。建議設計「一份深色基底 token」為單一事實來源（log/plan/DatasetManagerDarkThemeFinish.md 一）。
- **Stage 5 切片 5c（2026-08-30）**：深色收尾＋遠端面板移除——①--dsm-list-item-bg（標註列表）②tauri.js 全域 .cocoya-prompt-* token 化（影響所有模組 prompt，含 fallback）+ --dsm-success-*（打包 ZIP 面板）③DM 遠端環境面板前端移除（模板/綁定/訂閱/i18n DSM_CLOUD_* ×16 兩語系/_offBridgeMessage 機制）；**後端 checkRemoteEnvironment/trainRemote 保留**。node --check ×5、80/80、build 183ms 全綠。手動驗證清單見 log/work/2026-08-30.md。
- **（中斷任務）Tauri SSH 遠端訓練三案修復（2026-08-31，已結案實測通過）**：①模板同步 WinError 123（`\\?\` 前綴+混合斜線，剝前綴+os.sep）②殘留 keras 誤下載（遠端 output 清空+下載白名單+none 不掃 keras）③本地 TFLite 轉換卡住（子進程改環境白名單+DEVNULL+CREATE_NO_WINDOW+watchdog；f32 免掃樣本 need_rep）。實測 int8+f32 產出 2820KB/9331KB 正常。詳見 log/work/2026-08-31.md。
- **（長遠債）Tauri dev 模式 sidecar 路徑優先序**：`get_sidecar_dir` Resource 目錄（target\debug\resources）優先於專案根原始檔，違反 AGENTS.md「開發模式優先原始檔案」；改 sidecar 後須手動同步 dev 副本+重啟 app。建議 dev 優先序對調或 build 時自動同步。
- **Stage 5 切片 6（2026-09-01，i18n key parity）**：①修正 5 處 key 呼叫錯誤（STATUS_CAPTURETTING 拼字、NEED_ANCHOR/IMPORT_* 共 6 處雙重前綴）——英文語系此前永遠 fallback 中文；②zh/en 各刪 21 個未使用 key（含 ERROR_UPLOAD_RESULT_IGNORED、SAVE_PROGRESS 系列——「儲存進度」按鈕已移除）；CLOSE_UNSAVED_CONFIRM 依 ui_layout 註解決策保留。自動化全綠（node --check ×4、node --test 80/80、vite build 532ms）；zh/en 118/118 全對齊。實機 T5-1/T5-2 語系切換待測。詳見 log/work/2026-09-01.md。
- **下一切片：Stage 5 收尾**——§8.2 步驟 5-6（locale refresh/reload 測試、文案長度/溢位檢查）+ T5-1~T5-3 實機；之後 Stage 5 Gate 簽核 → Stage 6（文件、冗餘清理與相容性確認）。
