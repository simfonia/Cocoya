# Cocoya 專案任務清單 (Todo List)
**專案名稱**：Cocoya (Code, Compute, Yield AI)
**核心目標**：以 Blockly 為介面，幫助 Python 初學者進入 AI 世界的 VSCode extension 與獨立桌面應用程式。

## [核心開發原則]
- **SSOT (單一事實來源)**：所有積木、產生器與前端邏輯統一存放於 `ui/src`，由 VSIX 與 Tauri 共享。
- **通訊抽象化**：前端一律透過 `CocoyaBridge` 與後端通訊，禁止在 UI 層直接使用環境專屬 API。
- **任務前快取現況**：先讀 `log/COCOYA_STATE.md`（現況快覽）再讀本檔對應章節；技術深層知識見 `log/KNOWLEDGE_BASE.md`；每日細節見 `log/work/`。

---
## [進行中 / 待辦]
### [2026-09-10] Dataset Manager 類型鎖定改造（M1 完成，M2 待辦）
- [x] M1：卡片入口＋類型鎖定＋dev 徽章/banner（typePolicy／entryCards／sessionManager＋9 新測試；layout/modal/i18n/CSS/三主題；45/45＋tsc＋cargo check＋vite＋parity 142/142）——計畫 `log/plan/DatasetManagerTypeLockedWorkflow.md`，日誌 `log/work/2026-09-10.md`
- [ ] M2：重構收斂（R4 去重＋html.js／R5 labelManager／R6 samplerPanel／R7 表格落盤／R8 匯出分流／R9 後端實機）＋雙平台實機＋三主題目視
  - [x] R4：`core/html.js`＋5 測試；三處去重＋修損壞轉義（86/86＋check×4＋vite PASS；備份 `backup/*pre_R4*`＋`*20260911_120000.bak`）
  - [x] R5：`ui/labelManager.js`＋2 測試；上帝函式抽出＋委派（88/88＋check×4＋vite PASS；備份 `backup/*pre_R5*`）
  - [x] R6：`ui/samplerPanel.js`＋3 測試；live 段抽出＋委派（91/91＋check×2＋vite PASS；備份 `backup/*pre_R6*`）
  - [x] R7：表格 samples 落盤——spec.js `buildTableSamples(rows,limit)`＋`stats.samples_truncated` 契約＋`TABLE_SAMPLES_PERSIST_LIMIT=2000`；syncSpecFromUI 非影像系落盤 samples（舊一律 [] 修正）；spec.test 6 測（97/97＋check×3＋vite PASS；備份 `backup/*pre_R7*`）
  - [x] R8：匯出按類型分流——typePolicy `isDevType/needsAnnotationCheck/needsUnclassifiedCheck`；feature/serial 擋下＋`ERROR_EXPORT_DEV_UNAVAILABLE`；exportUseCases.test 2 測；i18n parity 147/147（99/99＋check×4＋vite PASS；備份 `backup/*pre_R8*`）
  - [x] R9 後端對齊：後端零 command 改動（spec.type/stats.samples_truncated 透傳不解讀）；cargo check（3 既有 warning）＋cargo test 1/0＋tsc＋npm run compile＋vite 全綠
  - [ ] R9 雙平台實機（VSIX+Tauri 每類卡→徽章→匯出/存讀各一次）＋三主題目視（entry 卡片＋banner＋徽章＋dev 擋下訊息）——使用者 backlog
- [ ] M3：表格＋循線模板跑通（M-T1 table / M-L1 line_following）——計畫 `log/plan/DatasetManagerTypeLockedWorkflow.md` §10，日誌 `log/work/2026-09-12.md`
  - [x] T-1：`common/table_dataset.py`（label 欄 type 判定分類/回歸；分類依 label 值分層＋教學保護；回歸隨機切＋報告註明）
  - [x] T-2：`table/table_train.py`（MLP 頭依任務：Dense(n,softmax)／Dense(1,linear)；TFLite＋labels.txt＋報告；RESULT 契約相容）
  - [x] T-3：sidecar 匯出 table 分流（spec.samples＋schema.columns→`data.csv`，UTF-8；truncated 警告）
  - [x] T-4：訓練映射——sidecar `trainLocal` 依 task_type 映射檔名（修硬編碼 classifier＋誤傳 `--model_type`）；遠端 script_rel 對齊實檔（`detector/detector_train.py`、`line_follower/line_follower_train.py`，修幽靈 `object_detection/`）
  - [x] L-1：sidecar 匯出 line 分流（annotations→`lines/` 同名 .txt，`x1 y1 x2 y2`；未標註跳過＋>50% 警告）
  - [x] L-2：`common/line_dataset.py`（images/＋lines/；隨機切＋報告註明；<2 樣本報錯）
  - [x] L-3：`line_follower/line_follower_train.py`（重用 detector Dense(4,sigmoid) 回歸頭，語意為端點；MSE＋報告）
  - [x] 實機：table 分類/回歸訓練跑通＋f32 TFLite＋labels.txt；line 訓練跑通＋f32 TFLite；sidecar exportDataset e2e（`temp_scripts/m3_export_e2e.py`，含逗號 CSV 引號＋未標註跳過）全 PASS
  - [ ] T-5/L-5 殘：table int8 量化本機驗證（命令逾時，背景 job 執行中）；VSIX+Tauri 雙平台 GUI 實機（UI 匯出→訓練維）——使用者 backlog
- [ ] M4：特徵最小可用（M-F1）；M5：文件＋清理——計畫 `log/plan/DatasetManagerFeatureMinimalM4.md`（Phase 0~5＋風險評估，2026-09-12 定稿；決策 2026-09-14 拍板）
  - [x] ✅ 決策拍板：①採集=納入完整 Phase 4 live 採集 panel ②點維度=採集時選含 z 與否（動態 schema）③訓練檔=新建 feature/feature_train.py
  - [x] Phase 1：sidecar 特徵提取（media_pipe_service.py 重寫 extract_landmarks(frame, use_z)）＋collectFeature＋缺裝降級 FEATURE_MEDIAPIPE_MISSING
  - [x] Phase 2：匯出分流（feature→data.csv）＋解封 exportUseCases/typePolicy/entryCards（feature 轉 stable，modes live+file）
  - [x] Phase 3：訓練管線 feature_train.py（動態 num_features）＋trainLocal/trainRemote 幽靈映射收斂
  - [x] Phase 4：DM 前端 live 採集 panel（ui/featurePanel.js＋相機＋特徵擷取＋含 z 開關＋依標籤累計 row）
  - [x] Phase 5：i18n（DSM_FEATURE_* zh/en parity）/測試 116/116＋vite build＋cargo check＋py_compile／文件（FILE_STRUCTURE/plan §8）
  - [x] Phase 5 補修：feature live 警示仍顯示 file 模式訊息——spec.js validate() 新增 isFeatureLive 豁免分支＋DSM_VALIDATE_NO_SAMPLES_FEATURE（119/119 PASS）
  - [ ] 雙平台 GUI 實機（VSIX+Tauri live 採集→匯出→訓練整鏈）＋三主題目視——使用者 backlog
  - [x] 徽章復原（2026-09-14）：實測問題多，entryCards feature 標回 dev 徽章（typePolicy 維持 stable，匯出/訓練可繼續除錯）；entryCards.test 同步（119/119 PASS）
- [ ] M4-FEATURE 除錯任務（使用者實測回報，待逐項處理）
  - [ ] 實測問題盤點：請使用者提供具體問題清單（操作步驟／預期 vs 實際／截圖），逐項登記為子任務
  - [ ] 已知線索 ①：live 模式警示訊息（已修 isFeatureLive 豁免，需複驗含 z 開關、採集後欄位/統計同步）
  - [ ] 已知線索 ②：live 採集整鏈實機驗證——相機預覽→擷取特徵點→依標籤累計 row→表格預覽→存讀進度（dataset.json samples/schema 一致性）
  - [ ] 已知線索 ③：匯出分流——feature spec（動態 columns 108/162 維）→ sidecar exportDataset→data.csv 欄序/UTF-8/truncated 警告
  - [ ] 已知線索 ④：訓練整鏈——feature_train.py 動態 num_features、分類/回歸分層切分、TFLite 產出
  - [ ] 已知線索 ⑤：MediaPipe 缺裝降級路徑（FEATURE_MEDIAPIPE_MISSING 提示＋file 模式回退）與相機燈點狀態
  - [ ] 已知線索 ⑥：file 模式（CSV/JSON 匯入）與 live 混用情境的欄位衝突防護（spec.js 註記：file 匯入表格樣本不與 live 混用）


### tauri-codegen 產生 typed invoke (待辦, 2026-08-19)
- [ ] 評估 tauri-codegen / @tauri-apps/types：自動從 #[tauri::command] 簽名生成 TS invoke<cmd>(args)
- [ ] 目標：command 參數缺漏在 tsc 編譯期發現（而非執行期 invalid args）
- [ ] 相依：與 docs/backend_api_manifest.md Parameters 表同步維護 (SSOT -> generate type -> manifest)

### 遠端訓練與 SSH 整合（待辦, 未完項）
- [ ] **D5 文件同步收尾**（parity matrix / manifest / FILE_STRUCTURE / help）
- [ ] **SSH/Sidecar 上傳流程整合**：實作 `extension.ts` 中 `backend === 'remote'` 的分支（VSIX 已透過 `dataset_sidecar.py` paramiko SFTP 上傳並原位解壓）
- [ ] **Tauri 版 SSH/雲端訓練藍圖**（舊規劃細節見備份 todo.md_20260824「Tauri 版 SSH/雲端訓練實作藍圖」L560）：新增 ssh_sidecar.py(paramiko) + Rust ssh.rs 指令(check_remote_env/upload_dataset/start_remote_training/download_results) + DGX 流程(上傳→SSH 啟動容器→監控→下載)；訓練對話框後端選擇在 Tauri 啟用；SSH 帳密儲存(可考慮 tauri-plugin-store)
- [ ] 遠端推論 API 整合
- [ ] **Tauri `datasetUploadArchive`**：需後端支援（Tauri 前端仍為空殼 _dispatchToFrontend）
- [ ] **容器化訓練腳本**：基於 DGX 鏡像（NGC nvcr.io/nvidia/pytorch ARM64）的訓練容器與模板

### 長期優化（待辦）
- [ ] 跨平台序列埠 Friendly Name（macOS/Linux；Windows 已有 VID/PID 映射）
- [ ] 重置韌體 esptool 整合為 Tauri Sidecar 的可行性評估

### 實機驗證未完成項彙整（截至 2026-08-24，跨任務 backlog）
- [ ] Dataset Manager 第二輪 UI：統計同步、label id、三處標籤管理器一致性、排序與顏色（VSIX+Tauri）
- [ ] Startup Home 開新專案流程雙平台（dirty 提示、另存錨定、取消零副作用）、btn-new-window 開新視窗
- [ ] 主題系統：candy 主題實機配色、auto 跟隨系統、重啟記住偏好、VSIX 切語系 reloadWebview
- [ ] [NEW 2026-08-26] 設定選單語言開關 + 主題子選單（ui/index.html + base.js）雙平台實機驗證
- [ ] Tauri 多視窗：雙視窗 run/serial 不污染、失焦釋放/聚焦重取 serial
- [ ] VSIX Deep Repair 實機（Tauri 已驗證）；XIAO CAMERA/FACTORY 模式燒錄埠檢查提醒
- [ ] M4b dataset.json 存讀混合資料（Live+File）套回回驗證（雙平台）
- [ ] [NEW 2026-09-08] code→積木 反向定位實機驗證（點擊 code 行 → 捲動並選取對應積木；實作於 renderer.js locateBlockByLineIndex，VSIX+Tauri 雙平台）

### Dataset Manager 三層重構 - 收尾（Stage 1-6 已完成；僅剩下項）
- [ ] 手動測試 backlog（log/plan/DatasetManagerManualTestBacklog.md：A2-1~A2-4、C1、U3-*、UI4-*）
- [ ] Stage 6 Gate 簽核（§9.3 六項）＋ D6-2/B0-1 公開 API 實機對照（console Object.keys(window.CocoyaDataset).sort()）
- [ ] Stage 7 總驗證（compile/lint/cargo check+test/tauri build + E2E 矩陣 §10）
- （長遠債）--dsm-* dark/token 收斂（vscode-dark CSS 覆寫與 cocoya_dark 主題 cssVars 各持一份，非 SSOT；見 log/plan/DatasetManagerDarkThemeFinish.md）
- （長遠債）spec.js 直用 t() transitional boundary（core 層文案耦合 i18n）
- （長遠債）Tauri dev 模式 sidecar 路徑優先序（get_sidecar_dir Resource 目錄優先於專案根原始檔）
- （長遠債）Tauri 深色 prompt hover 白底（--dsm-btn-hover-bg 深色值未定義→fallback 白）
- （低優先）Tauri webview 下 .serial-dropdown-label query 為 null 的環境因素（已被鐵壁版繞過）

### [2026-09-05] Lego SPIKE Prime 多層分類（模組/部署已完成，未完項）
- [ ] 實機驗證：切換 MicroPython 模式 → toolbox 顯示「Lego SPIKE Prime」外層分類 → 展開 7 子分類 → 子分類可展開顯示積木
- Phase 0 續（log/plan/SpikeModuleDesign.md）：deploy/pybricks.py 上傳支援、serialOps.ts/mcu.rs VID/PID（Pybricks hub）

### [2026-09-02] Tauri Release 訓練範例三案（已完成，未完項）
- [ ] 實機驗證：Release 開 02_PC_train.xml 全流程；Dev 模式直開範例回歸
- （妥協債）native 確認框文案 hard-code 於 Rust，未來改前端自訂對話框以 i18n

### [2026-09-03] VSIX 訓練終端機除錯（已完成，未完項）
- [ ] 實機驗證：遠端訓練 VS Code 終端機出現日誌＋點點提前停；本地訓練顯示 Training complete

### [2026-09-04] 模型檔本地轉換（已完成，follow-up）
- [ ] 重 build msi → 重測遠端訓練→本地 TFLite 轉換（int8 須重新產生；新參數加 _STRIP_KEYS）
- （評估債）遠端容器 TF 版本與本地對齊，根除跨版本序列化差異

### [2026-09-05] terminal UI 新增功能（已完成，未完項）
- [ ] 實機驗證（VSIX+Tauri）：字體記憶、複製、拖曳高度、收合/展開、深淺主題、首頁診斷成功訊息彈出
- [ ] 實機驗證：資料夾/檔案 dialog 起始目錄皆為專案根
- [ ] 實機驗證：刪縮圖正常流程＋手動移除真檔後應提示「原始檔已不存在」

### [2026-09-06] 語系切換對齊主題切換（已完成，未完項）
- [ ] 實機驗證：VSIX+Tauri 切換語系後編輯區積木保留、dirty 狀態保留

### [2026-09-06] Try/Except 例外處理積木（已完成，未完項）
- [ ] 實機驗證：VSIX+Tauri 下拉選單、代碼產生、MicroPython 燒錄執行
- [ ] 收斂確認：舊工作檔 BACKEND auto 值被 FieldDropdown validator 攔截遷移到 local

### [2026-09-06] MCU 硬體控制模組一般化（多數完成，未完項）
- [ ] Python deploy 端對齊：resources/deploy/base.py 讀同一份 board_defs 的 vidPid，回傳相同 boardId（避免兩套 drift）
- [ ] 實機驗證：插 Pico/XIAO 自動切板、腳位下拉只列該板腳位、未指定板合併清單、未知腳位錯誤註解
- [ ] 依 tags 過濾腳位下拉（digital_write→digital/pwm、analog_read→adc）+ 補齊各板完整 pinout（目前為常用子集）
- [ ] 實機驗證：Maker Pi RP2040 上 mcu_car 積木（伺服/超音波/按鈕/循跡）代碼與遷移前一致
- [ ] 實機驗證 board_init 五情境（①開新 MCU 見 board_init(maker-pi) ②無宣告 GPIO 可解析 ③改下拉 pin 即時刷新 ④插板與宣告不符 confirm 攔截 ⑤πCar 開檔即 maker-pi）
- [ ] （未來）Rust/VSIX vidPid 表改執行期讀 board_defs.js 或 codegen，消除手動同步

### [2026-09-07] 開發板偵測及上傳除錯（多數完成，未完項）
- [ ] 實機驗證：Tauri dev 下 deploy/ 正確打包、Serial Monitor 可啟動（無 ModuleNotFoundError）
- [ ] 實機驗證：選擇序列埠後重新整理，label 不會被清空
- [ ] 實機驗證：①拆鈕後偵測/監看各自行為 ②熱插拔 1.5s 自動換埠切板 ③拔 Maker Pi 插 SPIKE 正確更新 ④上傳含 print() 開頭不被吃、點點同行 ⑤microbit Pin(n) 語義與 P5/P11 共用腳位 ⑥新 MCU 檔三塊不重疊+帽子外觀 ⑦SSH Enter 連線 ⑧多視窗輪詢不污染
---
## [已完成任務歸檔]（壓縮指針；詳細與每日異動一律見 log/work/ 與計畫文件）

### Archive A：Dataset Manager 三層重構 Stage 0-6（2026-08-24 ~ 09-01，已完成）
- 拆解 ui_layout.js（108KB/60+ 函式）為 core/io/ui/application 四層＋CSS 變數化主題＋i18n 補齊＋雙橋接集中於 io/bridge.js（唯一 Bridge Port）。
- Stage 1(08-26) core 抽出＋後端 canonical save/load(VSIX+Tauri,errorCode)＋canonical-only 匯入閘＋權威錨定閘。
- Stage 2(08-29) io/bridge.js（request correlation/timeout/cancel/unsubscribe，fake transport 8/8）；ui_layout/sampler 全通訊改造，direct Bridge 殘留=0。
- Stage 3(08-29) application/{progressUseCases,importUseCases,exportUseCases,annotationMutations}.js。
- Stage 4(08-30) ui/{statusMessage,modal,form,thumbnails,classification,annotation,panels}.js（取代 showStatusMessage global）；修正訂閱洩漏(offBridgeMessage)。
- Stage 5(08-30~09-01) 色彩盤點(DatasetManagerStyleTokens.md：207 處/99 唯一值)＋--dsm-* token 化（三主題各 13 key）＋i18n key parity(zh/en 118/118)。
- Stage 6(09-01) manifest 核對＋訊息責任定義(AGENTS.md)＋DatasetManager_DevGuide.html＋DM 深色確認框 token 化自訂對話框＋三份舊 DSM 計畫標 SUPERSEDED＋system_spec 增補〈24. DM 模組規範〉。
- 詳細：log/work/2026-08-24.md、2026-08-26.md、2026-08-28.md、2026-08-29.md、2026-08-30.md、2026-08-31.md、2026-09-01.md；計畫 log/plan/DatasetManagerRefactor.md；SOP log/mappings/DatasetManager_DevGuide.html；token 計畫 log/plan/DatasetManagerStyleTokens.md。

### Archive B：里程碑總覽 2026-02 ~ 2026-08（已完成）
- 逐月摘要原本位在本檔「已完成里程碑總覽」章節；2026-08-24 已精簡一次；**完整版備份 backup/todo.md_20260824_231017.bak**。
- 逐日執行細節一律見 log/work/2026-{02..08}-*.md。

### Archive C：2026-09 各任務（已完成部分；未完項見上方對應節）
| 日期 | 已完成摘要 | 對應工作日誌 |
|---|---|---|
| 09-02 | Tauri Release 訓練三案（cp950 亂碼 PYTHONIOENCODING/PYTHONUTF8 + 模板路徑 COCOYA_TRAIN_TEMPLATES + examples 唯讀保護） | log/work/2026-09-02.md |
| 09-03 | SPIKE 部署計畫(plan/SpikeModuleDesign.md)；VSIX 訓練終端機除錯（onEvent 例外/點點提前停/本地誤標 remote/i18n hostI18n.ts hostMsg） | log/work/2026-09-03.html |
| 09-04 | 模型檔本地轉換（esptool pin 4.7.0 / _sanitize_keras_config renorm/quantization_config+_STRIP_KEYS / 遠端權重快取 keras_cache / int8 代表集補 1/255 正規化） | log/work/2026-09-04.md |
| 09-05 | SPIKE 多層分類最小模組（toolbox 巢狀 7 子類+22 積木/generators/i18n/COLOUR_SPIKE，已註冊 core_manifest）；terminal UI 五功能；DSM 刪縮圖保守處理/資料選取路徑=專案根/hover 完整路徑 | log/work/2026-09-05.md + 2026-09-05.html |
| 09-06 | MCU 硬體一般化多數（board_defs.js 取代 JSON+CocoyaBoard+cocoyaResolvePinNum 嚴格 gpioMap+board_init 帽子積木+vidPid 連動）；語系切換保留編輯區積木；Try/Except 積木（含 Help 檔/auto→local 遷移）；examples dirty 開新檔雙平台修復；SAME_AS_CURRENT 防呆+開新重試迴圈 | log/work/2026-09-06.md |
| 09-07 | 開發板偵測除錯（deploy/ 打包、_applyBoardFromPort、下拉保留）；serial「(無序列埠)」最終根治（鐵壁版）；偵測/監看按鈕拆分+toggle_serial_monitor+serial-monitor-stopped/serial-ports-changed；1.5s 熱插拔輪詢；Micro:bit；board_init 帽子積木+初始座標重排 | log/work/2026-09-07.md |

*本清單於 2026-09-08 精簡重整（#task[整理todo]）；原始版本備份於 backup/todo_trim_20260908_132601.md。*
- [x] [2026-09-09] SPIKE Prime：detect_board_id(0694:0009→spike-prime) + board_defs 條目（空 pins）+ spike 積木韌體雙模式（官方 SPIKE 3 / Pybricks，import 注入修補 + wait_button bug 修復）+ 序列埠 tooltip VID:PID——全驗證綠
- [ ] 實機検証：SPIKE 官方模式 display/speaker/button/imu API 簽名、REPL 多行上傳、兩模式生成碼在 hub 執行
- [ ] （未來里程碑）Pybricks 韌體支援：WinUSB 傳輸層（nusb/rusb + Pybricks USB 協議）+ 「偵測到 LEGO hub 但無 COM」UI 提示（引導刷官方韌體或用 code.pybricks.com）
- [x] [2026-09-09] SPIKE 支援凍結（實驗性）：現況說明 log/plan/SpikeSupportStatus.md（含決策理由、已完成清單、已知限制、Pybricks 里程碑啟動條件、相關日誌索引、重啟檢查清單）——日後重啟由此進入
- [x] [2026-09-09] 上傳 RP2040 終端只顯示「OK」而非 complete_banner：根因「OK」為 Raw REPL 執行成功之韌體標記；complete_banner 未被印出因 monitor() 逾時檢查被關在 `ser.in_waiting>0` 區塊內、raw 模式不回 `>>>`，永遠觸發不到。修正：逾時兜底移至 while 層級強制補印（log/work/2026-09-09.md）
- [x] [2026-09-09] 上傳 RP2040 空行不穩定復現（根治）：Raw REPL 換行 `b'\r\n'` 與內文**分批到達**、時序漂移 → 空行位置每次不同。三層分工修復：base.py 過濾純換行批+壓平+OK後補空行（單一源頭排版）、mcu.rs 回復 chunk 直通（不拆整行）、tauri.js 剝 `\r`；同步 target/debug 副本。實機確認成功（log/work/2026-09-09.md 踩坑記錄 6 條）

## 2026-09-13
- [x] 校訂 py_ai_train_run 教學文件第 1~6 頁觀念（模型=架構+參數、Loss 定義、谷底=平均損失）。
- [x] 新增第 7 頁交叉熵簡介頁，後續頁碼 +1（全 23 頁）。
- [ ] 可選後續：第 14 頁骨幹頁可回頭呼應「模型=架構+參數」；交叉熵頁可再補 softmax 歸一化的簡短說明。

- [x] [2026-09-14] DM P2 live 三 bugs 修正（X 關窗回位＋自動掃描＋黑區改最近一次拍攝 B 方案）——日誌 log/work/2026-09-14.md；待使用者雙平台實機
- [x] [2026-09-14] Sidecar 啟動失敗友善提示：Rust start_sidecar 路徑驗證＋700ms 存活檢查；tauri.js 啟動後 re-ping，失敗回 SIDECAR_START_FAILED；sampler 記錄 lastCameraError＋ui_layout onStartCamera 顯示 DSM_SIDECAR_START_FAILED 文案（i18n 中英同步）
- [x] [2026-09-14] Python 環境設定整合：toolbar/首頁兩入口合併為單一「Python 環境設定」視窗（diagnose-modal 擴充路徑列）＋首次啟動自動彈出（localStorage 完成旗標）——日誌 log/work/2026-09-14.md；待使用者雙平台實機
- [x] [2026-09-15] Python 環境設定安裝流程重構（問題：pip 進度在 modal 背後看不到＋安裝完不會更新為已安裝）。根因：①pip 輸出被送往 modal 外的終端機（Tauri 底部 #terminalArea 被 z-index 10050 遮罩蓋住／VSIX 原生終端機）②兩端皆無完成訊號（VSIX 靠 setTimeout 猜 5 秒、Tauri 根本不重檢）③Tauri 舊流程走 run_python → 開頭 stop_python 會誤殺使用者程式與 serial monitor。解法：新增 Rust 專用命令 install_python_module / abort_install_module（獨立 install_processes map＋install-module-log/done 事件＋try_wait 輪詢＋kill_tree 殺進程樹）、VSIX 改 spawn＋事件、前端 _envInstall 持久狀態機（modal 內進度橫幅＋逐列狀態＋詳細輸出收合＋一鍵安裝＋中止安裝＋90 秒停滯偵測）。附帶修正既有 bug：A) 路徑無效時 modal 永遠卡在「正在偵測…」B) 找不到 Python 與未安裝套件在 UI 上無法區分 C) 路徑列未顯示 sys.executable 解析結果 D) #save-confirm-modal z-index 1000 < 10050 導致確認框隱形＋_isClosing latch 永久卡死（視窗關不掉）E) 關窗遺留孤兒 pip F) Windows Child::kill() 殺不掉進程樹。決策：安裝中禁止關閉 modal（唯一逃生口＝中止安裝）＋不做 prevent_close 攔截（E4-B：以「視窗永遠關得掉」優先）＋E1/E2/E3 逃逸路徑（Ctrl+R、語系、主題切換）全數攔截。用詞分立：中止安裝≠卸載。驗證：cargo check PASS／tsc PASS／vite build PASS／node --check ×10 PASS／i18n 20 個新 key 雙語齊備 PASS／Python 檢查腳本實跑輸出格式相符 PASS／pip flags dry-run PASS。日誌 log/work/2026-09-15.md；待使用者雙平台實機
- [ ] [2026-09-15] （選）停滯偵測「300 秒建議中止」文案；docs/system_spec.html 與 README 若提及舊終端機安裝流程需同步更新
- [x] [2026-09-15] #task[開啟專案目錄、DM字級]：①toolbar 專案名標籤點擊 → 系統檔案總管開啟專案目錄（base.js currentProjectRoot + initToolbar click 綁定；VSIX cocoyaManager.ts 新增 openFolder case 補缺口；Tauri 既有 open_folder 零改動；has-path cursor 提示）②DM 字級縮放唯一變數 `--dsm-font-scale`（dataset_manager.css :root 第 10 行，預設 1.2；43 處 font-size 改 calc(Npx * var(--dsm-font-scale))）。驗證 node --check/tsc/vite build 全 PASS；日誌 log/work/2026-09-15.md；待雙平台實機
- [x] [2026-09-15] 實機回饋三項：①Tauri 點專案名開到「文件」——根因前端送正斜線路徑、explorer 無法辨識；修 app.rs open_folder Windows 分支 `/`→`\` 正規化（SSOT 涵蓋所有呼叫者）②toolbar 設定鈕移至最右（關閉之前），其餘按鈕靠左；index.html 搬移 + 第二 spacer + #settings-dropdown 主/子選單向左展開 CSS ③序列埠重插自動跳回——hardware.js 新增 _preferredSerialPort（僅使用者明確選擇時更新、localStorage 跨 reload）、updateSerialPorts 選取埠消失時優先跳回偏好埠。驗證 node --check/cargo check/vite build 全 PASS；待雙平台實機
- [x] [2026-09-16] #task[字級SSOT] 字級縮放拆畫面（5 變數 baseline=1 + calc 全面化）：新增 `ui/src/font_scale.css`（--fs-h/--fs-e/--fs-p1/--fs-p2/--fs-p3；index.html L13 載入）＋ style.css 22 處、index.html 行內 14 處、DM JS 行內 11 處改 calc ＋ DM 以 overlay 變數重綁定映射 P1/P2/P3（既有 43 處 calc 零改動；P1 靠 ui_layout.js 新增 `dataset-entry-phase`）＋ Blockly 12 toolbox 分類 label 16px 與列高 22px **同源縮放**（`.blocklyToolboxDiv .blocklyToolboxCategoryLabel` 提高特異度覆蓋 runtime 注入 CSS）。E 僅動 toolbox 分類與 UI 文字，積木本體不動（使用者確認自帶 +/- 控制項）。驗證 `node --check` ×4 / `vite build` PASS、殘留裸 px 僅 T 範圍 14 處；日誌 log/work/2026-09-16.md；**待使用者手動調值**（只改 font_scale.css 後 reload 即生效）
- [ ] [2026-09-16] 字級 UI 化（下一步）：設定面板 + localStorage 覆寫 :root 5 變數（架構已預留，零元件 CSS 改動）；破版收斂：把該畫面容器 height/padding/line-height 綁同一變數；T1~T5 畫面（diagnose modal/通用 modal/序列埠監看/AI modal）字級待指示
- [x] [2026-09-16] 追加修正（同日）：`dataset_manager.css` 43 處 font-size 補上 `calc(Npx * var(--dsm-font-scale))`。原以為是昨日已 calc 化版本，實際昨日已**退回成裸 px**——若無 calc 讀取點，P1/P2/P3 映射規則完全不會生效（本次差點漏掉）。重建後實測：產物 `main-fjIki1C7.css` 讀取點 43、`:root` 指向上游 `--fs-p2`、`vite build` PASS
- [x] [2026-09-16] 追加修正（同日）：`dataset_manager.css` 43 處 font-size 補上 `calc(Npx * var(--dsm-font-scale))`。原以為是昨日已 calc 化版本，實際昨日已**退回成裸 px**——若無 calc 讀取點，P1/P2/P3 映射規則完全不會生效（本次差點漏掉）。重建後實測：產物 `main-fjIki1C7.css` 讀取點 43、`:root` 指向上游 `--fs-p2`、`vite build` PASS
- [x] [2026-09-16] 實機回饋 H/E：H（1.2）OK；E 設定下拉＋韌體子選單文字放大後換行——根因 `.dropdown-content`/`.submenu-content` 絕對定位只給 min-width（父層僅 32px 寬 → shrink-to-fit 被釘死）。修：`width: max-content` + `max-width: calc(100vw - 24px)` + `.dropdown-item { white-space: nowrap }`。附帶修好 #ai-dropdown。`vite build` PASS
- [x] [2026-09-16] #task[字體大小優化] P2 UI 版面優化（live 標籤管理收斂＋啟動預覽獨立行）：ui_components 刪除右欄新增標籤 UI（+鈕/輸入列/setAddMode）並將啟動預覽獨立一行（width:100%）；sampler/feature 新增標籤不再覆寫 structure innerHTML（改走 refreshStructurePanel 重建管理器＋統計）；ui_layout 新增 renderStructurePanel（影像系＋全 live 一律統一標籤管理器，僅表格 file 用欄位編輯）＋refreshLiveLabelOptions（中欄增改刪同步右欄兩下拉）；labelManager 新增 onLabelMapChanged 回呼；i18n 空標籤佔位文案指向中欄面板（舊 key 保留）；測試 sampler 7/feature 7 全綠、DM 全套 21 檔 fail 0、check×7＋vite build PASS；備份 backup/*_pre_P2_20260916.bak；日誌 log/work/2026-09-16.md；待使用者雙平台實機（四 live 類型管理器常駐＋下拉同步＋放大字體啟動預覽不溢出）
- [x] [2026-09-16] #task[更改DM版面] P2 匯出鈕移至上方清除鈕左側：modal.js header 新增匯出鈕（dataset-secondary-btn＋與清除鈕相同行內風格，字級走 --dsm-font-scale）＋移除右欄粉紅匯出鈕；ui_layout setHeaderButtons 同步控制匯出顯隱（P2 顯示／P1、P3 隱藏）、setAnnotationHeaderActions 移除舊選擇器。驗證 node --check×2＋DM 120/120＋vite build PASS；日誌 log/work/2026-09-16.md；待雙平台實機
- [x] [2026-09-16] #task[MCU 終端 cp950 問題]：Tauri MCU 四 spawn 補 PYTHONIOENCODING/PYTHONUTF8（deploy/monitor/erase/esptool）＋deploy 5 py 補 reconfigure(utf-8)＋chunk 邊界 carryover；cargo check（3 既有 warning）＋py_compile 5 檔 PASS；日誌 log/work/2026-09-16.md；待使用者實機
- [x] [2026-09-16] #task[MCU 終端 cp950 問題] 追加：黑窗修復——mcu.rs 全 5 個 spawn（setup-stable/deploy/monitor/erase/esptool）補 CREATE_NO_WINDOW（0x08000000，cfg windows），對齊 python.rs；cargo check PASS；待使用者實機
- [x] [2026-09-16] #task[首頁切設定誤標dirty]：lifecycle _restoreReloadSnapshot 原本無條件 setDirty(true)——首頁未命名乾淨專案切語系/主題後被誤標髒、開檔遭存檔警告攔截。修：快照新增 isDirty 欄位（persistence.js）＋還原時忠實還原髒狀態（lifecycle.js 回傳 snap 物件）；編輯中 dirty 專案行為不變。node --check×2＋vite build PASS；待實機
- [x] [2026-09-16] #task[首頁切設定誤標dirty] 追加：_restoreReloadSnapshot 成功結尾誤回布林 true（true.isDirty=undefined→dirty恆false），編輯中切語系/主題後 dirty 遺失。修：return true→return snap。node --check＋vite build PASS；待實機
- [x] [2026-09-16] #task[DM spec 訊息調整]：分類/live「尚未指定 Label 欄位」誤導訊息——影像類標籤在每張樣本（schema.label 不適用），spec.js validate() 影像類全豁免 NO_LABEL、改回報 stats.label_counts.unlabeled 未標籤照片數；驗證按鈕改即時驗證+showStatusMessage 回饋（原綁 refreshPreview 300ms 防抖零回饋＝沒反應）；renderValidation ok+warnings 新增 warn 狀態「可用，尚有提醒」避免矛盾；i18n zh/en +4 key parity；DM 測試 122/122＋vite build PASS；待實機
- [x] [2026-09-16] #task[標籤改名同步]：①Part A 縮圖徽章即時刷新——ui_layout 新增 refreshThumbnailBadges 掛 onLabelMapChanged（列表模式重繪 renderImageGrid＋restoreGridScroll；標註模式重繪縮圖列）②Part B 磁碟同步——新指令 datasetRenameLabel（Tauri file.rs dataset_rename_label＋VSIX datasetOps handleDatasetRenameLabel 同構；目錄整體改名＋<old>_ 前綴檔改名；回傳 RenamedPath{oldPath,newPath} camelCase 對帳；LABEL_DIR_CONFLICT/LABEL_NAME_INVALID 錯誤碼；來源資料夾不碰）＋tauri.js 橋接＋ui_layout handleLabelRenamedOnDisk 對帳 img.diskPath/path/spec samples＋i18n 2 key parity＋backend_api_manifest SSOT。cargo check＋tsc＋node --check×6＋DM 122/122＋vite build 全綠；待雙平台實機
- [x] [2026-09-17] #task[DM P2 標籤管理UI消失]：①拍照後中欄標籤管理 UI 消失——根因 addSampleFromSampler/handleDeleteImage 仍以 renderLabelStats 覆寫 #dataset-structure-content（P2 病根漏改兩處，管理器被統計 HTML 蓋掉）；移除覆寫＋renderStatsPanels 加「管理器在、統計容器不在→renderStructurePanel()」守門。②改名後縮圖 hover tooltip 未同步、spec image_path 只更新資料夾名——根因後端 renames 已正規化正斜線、img.diskPath（savePath）為反斜線 → 比對 miss 落到「只改目錄段」；新增 application/labelRenameReconcile.js 純函式 reconcileRenamedPaths（normalizePath 比對＋檔名唯一兜底）＋對帳後補 refreshThumbnailBadges()。node --check×2＋DM 129/129（+7 新測試）＋vite build PASS；後端零改動（manifest 契約不變）；待雙平台實機
- [x] [2026-09-17] DM 契約補登（#task[DM P2 標籤管理UI消失] 後續）：①`#dataset-structure-content` 為複合容器、統計只寫 `#view-label-stats`（**禁** renderLabelStats 指向父容器；renderStatsPanels 已加守門）②改動 img.path/label/diskPath 後**必**呼叫 refreshThumbnailBadges()（refreshPreview 不碰縮圖 DOM）③標籤改名磁碟對帳走 application/labelRenameReconcile.js（normalizePath 比對＋檔名唯一兜底）。已寫入 `AGENTS.md`「Dataset Manager 結構面板與縮圖同步契約 (2026-09-17)」＋`log/mappings/DatasetManager_DevGuide.html` §5。
- [x] [2026-09-22] #task[DM物件偵測模組除錯] 物件偵測 dataset 對齊影像分類（P0-P4 完成）：P1 sidecar 匯出期 staging 加建 images/（扁平化 + manifest + labels/lines 配對 + -1 過濾；e2e 驗 ZIP）；P2 Tauri canonical 全量 + source 合併、VSIX 改專案根 SSOT（修本檔下條 backlog 第二項）；P4 detector_dataset 略過 class_id<0；P3 pathPolicy relabel/match + 匯入回填 + applyLoadedProgress 兜底。驗證：py_compile / node --check x3 / DM 136/136 / tsc+compile / cargo check（3 既有 warning）/ vite build 全 PASS。待雙平台實機。
- [ ] [2026-09-17] DM ui_layout.js 精簡切片（S1~S5，**暫緩施工 PAUSED**）：使用者拍板先不動，待下方「M4-FEATURE 除錯任務」線索 ①~⑥ 收斂後啟動。切片順序／預估減行（1823 → S1~S4 約 1330 → 含 S5 約 1150）與動工前置 SSOT 見 `log/plan/DatasetManagerTypeLockedWorkflow.md` §11。S1 `application/specSync.js`（syncSpecFromUI）／S2 `application/progressApply.js`（applyLoadedProgress）／S3 `ui/navigation.js`（P1/P2/P3 導航）／S4 `ui/modalEvents.js`（bindModalEvents）／S5 `application/imageSamples.js`（handleDeleteImage→addSampleFromSampler）；明確不做：硬拆 refreshDynamicPanels、刪仍被呼叫的 wrapper。
- [x] [2026-09-17] DM 資料集名稱漂移政策「方案 A」：`core/projectNaming.js` 新增 `detectDatasetNameDrift`／`datasetNameFromImagePath`／`datasetNameFromFolderPath`（無 IO，證據＝`img.diskPath` 尾段反推＋`sourceFolderPath` canonical 段，取不到一律視為無漂移）＋`ui_layout.js` `applyDatasetNameDriftHint`（標紅＋`NAME_DRIFT_TIP`，同組漂移只提示一次）＋i18n `DSM_NAME_DRIFT_TIP`（parity 172/172）＋`core/projectNaming.test.mjs` 12 測。node --check×2＋DM 141/141＋vite build PASS；零後端改動。政策「未落盤可自由改名（不建立空目錄）／已落盤不搬移但要提示」已寫入 AGENTS.md 與計畫 §12；待雙平台實機
- [ ] [2026-09-17] DM 資料集目錄改名「方案 B」（backlog，未實作）：新增 `dataset_rename_dataset_dir`——舊目錄不存在→no-op（**不建立**）／存在且目標不存在→整目錄搬家＋回傳 renames 對帳 `img.diskPath` 前綴與 `spec.data_source.base_dir`＋`refreshThumbnailBadges()`／目標已存在→`DATASET_DIR_CONFLICT`（禁覆蓋）。需雙平台（Rust `file.rs`＋VSIX `datasetOps.ts`）＋`permissions/commands.toml`＋`docs/backend_api_manifest.md`＋測試＋實機；動工前須定「同名另存／合併」語意。詳見 `log/plan/DatasetManagerTypeLockedWorkflow.md` §12.4
- [ ] [2026-09-17] 匯出 staging 路徑驗證（backlog，既有風險、與改名無關）：①Tauri `export_dataset`（`src-tauri/src/commands/dataset.rs` L264-268）只複製 `sourceFolderPath`，live 模式該值為 null（僅 file 匯入會設）→ **live 匯出 ZIP 疑似只有 dataset.json、沒有照片**②VSIX `handleDatasetExport`（`datasetOps.ts` L241-245）用 `workspaceFolders[0]` 而非專案根組 `dataset/<名稱>`，xml 在子資料夾時可能取錯目錄。需雙平台實機驗證 ZIP 內容（images/labels/labels.txt）
- [x] [2026-09-17] #task[AI訓練積木教學簡報字體修改]：第 13 頁 SVG 雙圖（⛰️ 學習率）以使用者手調「第1~3步=12」為最小值等比放大（k=12/9.5：9.5→12、10→12.5、11→14、13→16.5、圖例▼12→15；白框加寬加高＋viewBox 372→380 防溢出）；備份 backup/py_ai_train_run_index_20260917_103614.html；日誌 log/work/2026-09-17.md；待使用者瀏覽器實機確認

- [x] [2026-09-17] #task[Logic模組載入失敗]：Logic toolbox.xml 帶 UTF-8 BOM → DOMParser 報 'Unexpected characters outside the root element: ï»¿' → filterToolboxXML 跳過整模組。修：core/logic/toolbox.xml 與 ai_inference/toolbox.xml（同樣帶 BOM）去除 BOM＋filterToolboxXML 開頭剝除 uFEFF 防護。node --check＋vite build PASS；待實機確認 Logic 分類恢復

- [x] [2026-09-17] #task[Function內if縮排]：2空格設定下函式內 if 不縮排——根因 py_function_def 將「已套用當前 INDENT 的 statementToCode 輸出」注入 definitions_，被 finish 的 Global Indent Scaler（基準 4 空白假設）二次縮放而塌陷；修 functions_generators.js 於注入前還原基準 4 空白＋空函式 fallback 改 4 空白。node --check＋vite build＋Node 管線模擬 PASS；待實機 2/4 空格雙向回歸

- [x] [2026-09-17] #task[Examples播種到AppData]：Tauri examples 與安裝目錄寫入權限解耦——setup 呼叫 ensure_examples_seeded（Resource→%AppData%\com.cocoya.app\examples，copy_dir_merge 只補缺檔＋.seeded_version 戳記；dev 跳過；失敗 fallback Resource）；get_examples_path 生產分支優先回傳 seeded 目錄；唯讀保護（複製並開啟）流程零改動；copy_dir_merge 自 file.rs 移入 utils 共用。cargo check PASS；待 release 實機（首啟播種/保護流程/升級不覆蓋修改檔）；backlog：還原範例功能

- [x] [2026-09-17] 追加：AppData seeded examples 開啟仍被要求複製到桌面——resolve_example_open_path 與 save_file 的唯讀判定加 seed_dir 豁免（AppData 副本=可寫工作副本，直接開啟/存檔；唯讀保護僅針對 Resource 內範例）。cargo check PASS；待實機

- [x] [2026-09-17] 追加：關閉重開後開範例又回到 Program Files——get_examples_path dev 分支僅以 current_dir/examples 存在判定，捷徑啟動時 current_dir＝exe 目錄（內含打包 examples）→ 誤判為 dev 跳過 seeded。修：dev 分支以 is_dev_examples_dir()（src-tauri 標記）守門＋fallback 改 resource_dir()/examples。cargo check PASS；待實機

- [x] [2026-09-17] 追加：二次啟動仍落回 Program Files——seeded 判定放寬（戳記或目錄非空皆算播種，防 merge 中途失敗戳記永不寫）＋失敗診斷落地 %AppData%\com.cocoya.app\examples_seed_error.log（Release 無 console）。cargo check PASS；待實機，若復發讀診斷檔定位

- [x] [2026-09-17] Examples 播種 AppData 實機驗證 PASS（使用者確認）：捷徑二次啟動開範例導向 AppData 副本。方案 B 全案收斂；backlog：設定面板「還原範例」功能

- [x] [2026-09-18] #task[依開發板更新腳位資訊] 腳位無法解析根因＝Blockly 產生器不可見 ID 標記污染：`utils/generators.js` 的 `scrub_` 為所有具 output 連線的積木前置 `U+0001ID:<blockId>U+0002`，`mcu_pin_shadow`（output="String"）經 `valueToCode(PIN)` 取出的字串被污染成 `U+0001ID:xU+0002`+`board.GP0（含引號）`，而 `resolveGpio` 只去引號/前綴 → 標記殘留 → gpioMap 查表與全板兜底皆 miss → `# [Cocoya] 無法解析腳位: board.GP0`（板名正確、mcu_car field 型腳位正常，故極難察覺：標記不可見＋`workspace.js` 於預覽前清除）。修：`hardware_blocks.js` 新增 `CocoyaBoard.normalizePinRef()`（`resolveGpio` 入口統一施作，hardware＋mcu_car 共用）＋`cocoyaNormalizePinRef`／`mcuCarNormalizePin` 供錯誤訊息去污並附當前板名；新測試 `ui/src/modules/hardware/pin_resolve.test.mjs`（9 測，Node+stub 直載瀏覽器模組）；文件：AGENTS.md／.clinerules.md 新增「字串語意比對前必先剝除不可見 ID 標記」鐵律＋Framework_API_Index §7。驗證：node --check×4＋9/9＋DM 141/141＋vite build PASS；備份 `backup/hardware_blocks_20260918_081911.js` 等 3 檔。待 Tauri 實機回歸（GP0/GP26/PWM）
- [ ] [2026-09-18] backlog（可選）方案 B：讓 value 積木的 ID 標記不流入產生器邏輯（治本；須先驗證 `ui/src/ui/renderer.js` 的 extractIds/lineIndexToBlockId 高亮同步不依賴 value 標記）

- [x] [2026-09-19] #task[討論Xiao ESP32S sense 接 Maker Pi RP2040 的問題] 計畫1：mcu_huskylens 模組升級 V1/V2 通用——init 積木加版本(V2/V1)+匯流排(I2C/UART)下拉；新增 set_algorithm(僅V2)與 get_arrow(循線向量)積木；generators 整支重寫為雙協定 HuskyLens 輔助類（V1: 55AA55AA 幀/I2C 0x32/0x20/0x21/0x29~0x2B；V2: 55AA 幀/I2C 0x50/KNOCK 0x00/GET_RESULT 0x01/SET_ALGORITHM 0x0A/RETURN 0x1A~0x1D，checksum=全幀和 mod256 依官方 ProtocolV2.cpp）；toolbox+i18n(zh/en parity) 同步。node --check×4＋py_compile(注入類)＋vite build PASS；備份 backup/mcu_huskylens_*_20260919_131643.*。待實機（V1/V2 I2C+UART 回歸）
- [ ] [2026-09-19] backlog 計畫2：Sense(XIAO ESP32-S3) C++ 韌體開發 + 模型推送通道——**計畫檔案：`log/plan/SenseTFLMFirmwareAndModelPush.md`**（定案：TFLM 路線非 ESP-DL（esp-dl 不吃 tflite）、通用韌體+外掛模型檔（model.tflite+labels.txt+model.json）、訓練積木 A 案（輸入尺寸+部署目標欄位）；接線 Grove1 UART 交叉＋Sense 禁取電 Grove 3V3(≤300mA)；P0 spike→P5 雙平台實機六階段）。將來開啟任務先讀該計畫檔

- [x] [2026-09-19] #task[討論Xiao ESP32S sense 接 Maker Pi RP2040 的問題] 追加：mcu_huskylens Tier 1 積木擴充（6→15 塊）——新增 count / get_id_at / get_name(V2) / any_arrow / learn(V2) / forget(V2) / save_knowledge(V2 槽 0~4) / load_knowledge(V2) / set_name(V2)；`_on_v2` 的 RETURN_BLOCKS 解析新增 name 欄；全部積木補 tooltip 並標示 V1/V2 相容性。施工中修 2 缺陷：learn 型別不一致（statement→value）、知識庫槽號範圍錯（1~255→0~4）。新增測試 `ui/src/modules/mcu_huskylens/huskylens_protocol.test.mjs`（4/4 PASS，含 Python 實跑假幀解析）；知識蒸餾 `log/mappings/HuskyLens.html`。node --check×3 ＋ vite build ＋ hardware 16/16 PASS。待實機（V1/V2 I2C+UART 回歸）
- [ ] [2026-09-19] backlog（HuskyLens Tier 2）：螢幕繪圖（draw_rect 0x26 / draw_text / clear_draw）、拍照存 SD（take_photo 0x20）、演算法參數讀寫（get_algo_param 0x02 / set_algo_param）
- [ ] [2026-09-19] backlog（HuskyLens Tier 3）：多演算法組合（set_multi_algorithm 0x0C + set_multi_algorithm_ratio 0x0D，大記憶體板限定）、私有資料欄位精選（臉五官 / 手 21 點 / 姿態 33 點）
- [ ] [2026-09-19] backlog：mcu_huskylens UART 讀取改為分片累積迴圈（目前單次讀取 any()，大可能截斷）

- [x] [2026-09-19] 追加：mcu_huskylens V1 協定修正 + get_arrow 擴充 + 文案/工具箱重整——**修正 V1 五個錯誤**（幀頭 `55 AA 55 AA`→`55 AA`+ADDR、ADDR 0x00→**0x11**、checksum 改**含幀頭全幀和**、BLOCK ID 改 int16 @8、ARROW 改 xOrigin/yOrigin/xTarget/yTarget/ID 各 int16）並修正 **V2 ARROW 偏移**（angle int16 @6、length int16 @8、保留 level；文件 offset 7 為筆誤，依官方 Result.cpp union 佈局）；get_arrow 新增 xOrigin/yOrigin/length；V1 無原生 angle/length 改由 Cocoya 換算（atan2/sqrt，防禦 try/except + `import math`）；「槽」文案定案為「儲存知識庫到第 %1 (0~4) 槽」；toolbox 分 5 組（設定/循跡/偵測與辨識/分類與命名/學習與存檔）；V1 能力文案由「V1 無此指令」誠實化為「Cocoya 尚未實作」。測試 4/4 PASS（含官方範例幀 55 AA 11 0A 2A … 58 與 checksum 拒收）；vite build PASS；hardware 16/16。知識蒸餾 `log/mappings/HuskyLens.html` 更新（新增 §3b 起點語意/pure pursuit）。待實機（V1/V2 I2C+UART）
- [ ] [2026-09-19] backlog（HuskyLens V1 指令）：V1 官方協定有 REQUEST_ALGORITHM(0x2D，**編號與 V2 不同**：人臉0/追蹤1/辨識2/循線3/顏色4/標籤5/分類6)、REQUEST_LEARN(0x36 帶 ID)、REQUEST_FORGET(0x37)、REQUEST_CUSTOMNAMES(0x2F)；需獨立編號對照表後實作
- [ ] [2026-09-19] backlog（HuskyLens 循線多級向量）：官方 Python 範例以「有序清單 + level」取用箭頭（getCurrentBranch/getBranch），本模組為 `arrows[ID]` 字典（同 ID 後者覆蓋）→ 待實機確認 Level 1/2 是否同 ID，再決定是否改清單結構（支援曲率預判）
- [ ] [2026-09-19] backlog（HuskyLens 文件）：`docs/help/mcu_huskylens_*.html` 尚未建立

- [x] [2026-09-19] 追加：H5 py_ai_* 循線推論實作（世界 B 斷點修復）——`_follow_line` 由「invoke 後直接回 direction=none」改為完整實作（讀 4 輸出 [x1,y1,x2,y2]、裁切、以 Y 較大者為近端、輸出 line/offset/angle/direction/confidence；angle 與 HuskyLens 語意對齊 0=正前方順時針為正）；**同時修正 `_detect` 缺 int8 輸出還原（/255）**；新增 4 積木 py_ai_get_line / get_line_end / get_line_offset / get_line_angle；i18n zh/en 12 key、toolbox 4 塊、docs/help 4 份、新增 `log/mappings/AI_Inference.html`（含兩個循線世界分野與 P+D 控制實務）。新增測試 `ui/src/modules/ai_inference/line_inference.test.mjs`（3/3 PASS，stub interpreter 實跑推論後處理含 int8 還原）；node --check×3 + vite build PASS
- [ ] [2026-09-19] backlog（實機驗證清單，使用者目前無實機）H1：HuskyLens **V1** 從未實機驗證 → 接 Maker Pi（I2C 0x32）驗 request/get_box/count/get_arrow 六欄位/checksum（V1 幀已於本輪修正）
- [ ] [2026-09-19] backlog（實機）H2：HuskyLens V2 **level 多級向量** 確認 Level 1/2 是否同 ID，決定 `arrows[ID]` 是否改有序清單（影響 HuskyLens.html §3c 解法 B）
- [ ] [2026-09-19] backlog（實機）H3：HuskyLens V2 角度符號與中心常數 cx0 校正（含鏡頭安裝偏移）
- [ ] [2026-09-19] backlog（實機）H4：HuskyLens V2 I2C 0x50 與 UART 全流程、learn/forget/知識庫槽
- [ ] [2026-09-19] backlog（實機）H5-實機：PC 端循線模型實測——用真實資料集訓練 → py_ai_model_predict → 驗 offset/angle 方向符號與實車一致（含馬達左右定義）
- [x] [2026-09-19] H6（V2 風格單點標註）依使用者裁示**不做**（會失去 D 項航向資訊、與 Dense(4) 回歸頭不符；理由已寫入 log/mappings/AI_Inference.html）

- [x] [2026-09-22] #task[HuskyLens 循跡模組除錯] 啟動時 `ReferenceError: Input "RESULT" doesn't exist on "py_ai_get_line_end"`——根因：還原流程「先載入積木、後切換平台」，PC 專屬模組（ai_inference）未載入時 `py_ai_get_line_*` 被建成空積木（Blockly 對未註冊型別只 warn 不拋錯），隨後 setPlatformUI 註冊產生器＋triggerCodeUpdate 產碼即爆在 valueToCode。修：persistence.js 新增 `ensurePlatformForXml(dom)` 守門並讓 `checkAutoBackup` 先切平台再 domToWorkspace；lifecycle.js `_restoreReloadSnapshot` 改 async 且還原前先切平台（原本只 console.warn）；workspace.js 新增 `_describeCodegenError` 產碼例外降噪＋i18n `MSG_CODEGEN_UNKNOWN_BLOCK`（zh/en 對等）。新增測試 `ui/src/app/platform_restore.test.mjs`（3/3，含「setPlatformUI 先於 domToWorkspace」順序契約，舊碼會 FAIL）；知識蒸餾 `log/mappings/AppPlatformRestore.html`（新）＋ `Framework_API_Index.html` §9 空積木契約。驗證：node --check×5、app 3/3、模組回歸 23/23、DM 141/141、vite build PASS。待實機
- [x] [2026-09-22] 待實機驗證（#task[HuskyLens 循跡模組除錯] 修正後）：①MicroPython 平台啟動＋還原 PC 備份 → 應自動切 PC 且積木/欄位完整；②PC 專案換主題（reload 快照）後積木與下拉值保留；③刻意在 MicroPython 平台開 PC 專案 → 應顯示 `MSG_CODEGEN_UNKNOWN_BLOCK` 友善提示（console 保留原始錯誤）。另：使用者既有專案若曾存過空積木，欄位值已遺失，需重拉該積木 【Round 2 實機：使用者回報成功（見下條）；空積木欄位值仍需重設】
- [ ] [2026-09-22] backlog（同源風險）：盤點所有「XML → 工作區」入口，一律先呼叫 `CocoyaApp.ensurePlatformForXml(dom)`；`setPlatformUI` 呼叫端需 await

- [x] [2026-09-22] #task[HuskyLens 循跡模組除錯] **Round 2（真正根因）**：Round 1 平台順序修正後仍爆 `Input "RESULT" doesn't exist` → 加埋取證/自癒（lifecycle `_installZombieTrap` newBlock 攔截＋workspace `_repairZombieBlocks` 產碼前自癒）→ repair 拋 `Message does not reference all 2 arg(s)` 鎖定真因：`ai_inference/i18n/{zh-hant,en}.js` 的 `AI_GET_LINE_END` 缺 `%1`（args0 有 RESULT＋END 兩 arg）→ `jsonInit` validateTokens 拋錯 → 該型別積木一律半成品空積木（與平台無關）。另發現 dev 快取陷阱：`module_loader.loadScript` 的 `script[src]` 去重＋HTTP cache 使修正看似無效 → 加 `?_v=<__bootedAt>` cache-busting（lifecycle 新增 `__bootedAt`）。修正：i18n 補 `%1`、cache-busting、trap+repair 防禦層；新增回歸測試 `ui/src/app/block_jsoninit.test.mjs`（全模組 jsonInit 佔位符契約，含 `%{BKY_*}` 展開，zh/en 都掃）。驗證：實機成功、app 4/4、模組 19/19、build PASS。蒸餾：本檔＋Framework_API_Index.html §9 Round 2 補充＋AppPlatformRestore.html Round 2 補正。注意：曾被建成空積木的專案，`END` 下拉值遺失（自癒只補回結構），需重設。


- [x] #task[DM物件偵測模組除錯] 測試回饋：①中欄統計補「影像張數/已標註」摘要（stats/i18n/CSS/呼叫點，149/149）②匯出 ZIP 去除 `<label>/` 重複（`exclude_top_dirs`＋修雙次打包 bug）＋VSIX staging 不污染落盤（e2e PASS、parity 176/176、compile 0）→ 待實機：ball 重匯出僅一份 images/、統計即時、解壓訓練通。

- [x] [2026-09-23] #task[DM物件偵測模組除錯] C2 訓練端雙佈局：detector_dataset.py/line_dataset.py 加落盤 fallback（images/ 不存在→掃 <label>/*.jpg＋dataset.json 標註；bbox 左上角→YOLO 中心點；labels 取 label_map），py_ai_train_run 產生器/DM/sidecar 零改。e2e 10/10（ball 直練＋zip 回歸＋line 雙佈局夾具）、py_compile 0、DM fail 0；AGENTS/FILE_STRUCTURE/examples README 已更新。待實機：不匯出直接餵 dataset/ball 訓練一次＋遠端 smart sync 上傳新 loader 實測。

- [x] [2026-09-23] #task[DM物件偵測模組除錯] 測試回饋二：①遠端 pull denied→sidecar `docker run` 前映像 inspect＋`cocoya-train-classifier` tag 補別名（早退路徑補清 `_remote_train`）②偵測報告對齊分類——`bbox_iou` 指標進 compile/終端/曲線下圖/報告綠卡/history/RESULT `finalIoU`（1-epoch smoke PASS：val_bbox_iou 0.1024、報告 IoU 卡 10.24%）。待實機：遠端重跑見「建立別名」日誌、新報告雙圖目視；line/table 回歸是否比照 IoU 版面待決。


- [x] [2026-09-23] #task[DM物件偵測模組除錯] 測試回饋三：①偵測補「各類別樣本數」逐類 log＋不平衡警告（≥3 倍）——分層報告本有、IoU 曲線回饋二已有；不套 class_weight（回歸 y 非類別，語意不合，分層抽樣承擔防護）②`.gitignore` 加 `examples/**/dataset|model/`（check-ignore 四資料夾全命中、從未被追蹤）。e2e 10/10、py_compile 0。待實機：重跑看新 log＋確認遠端報告含 IoU 曲線。


- [ ] [2026-09-23] #task[DM物件偵測模組除錯] smart sync 異常追因：兩項同步每次「遠端 0 檔→全數上傳」（比對失效或遠端目錄恆空，find 錯誤被 2>/dev/null 吃掉）——sidecar 已加診斷 log（退出碼/空清單顯形），待使用者下次遠端訓練回報新診斷行後對症修。另：ball val IoU 0.19 診斷=RMSE 12.7%/座標的幾何非線性+未收斂+輕過擬合，建議增資料/fine_tune+lr 1e-4/epochs 100。


- [x] [2026-09-24] #task[DM物件偵測模組修改] 偵測訓練曲線補 MAE 面板：`plot_detector_curves` 由固定 2 圖（Loss/IoU）改為依 history 欄位動態 `Loss→MAE→IoU`（面板數 = 1+有mae+有iou；figsize 高度 4×n；單面板 axes 正規化；舊 history 缺欄自動略過，移除原「退回 MAE」分支）。驗證：`py_compile` 0；新回歸工具 `temp_scripts/e2e_detector_curve_check.py` **ALL PASS**（full→3 圖/1482x1780、no_iou→2 圖/1482x1180、minimal→1 圖/1482x580，含曲線 label 斷言）；真跑 1-epoch smoke（Desktop/cocoya/dataset/ball 落盤 135 張）TRAIN_EXIT=0＋history 六欄＋報告內嵌三圖（1482x1780）。循跡/table/feature 盤點：**本來就有 MAE 面板，無需改**。可選後續：偵測報告補「驗證 MAE」卡（`finalMAE`，對齊 table 回歸的「最終 MAE」卡）＋循跡「越高越好」級指標（端點誤差 px／角度誤差，非 IoU）。

