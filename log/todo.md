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
- [ ] M4：特徵最小可用（M-F1）；M5：文件＋清理——計畫 `log/plan/DatasetManagerFeatureMinimalM4.md`（Phase 0~5＋風險評估，2026-09-12 定稿）
  - [ ] 決策待拍板（施工前）：①採集範圍（納入 live 特徵採集 UI Phase 4 與否）②點維度（含 z=162 或僅 xy=108）③訓練檔（新建 feature/feature_train.py 或映射 table/table_train.py）
  - [ ] Phase 1：sidecar 特徵提取（media_pipe_service.py 重寫）＋collectFeature＋缺裝降級
  - [ ] Phase 2：匯出分流（feature→data.csv）＋解封 exportUseCases/typePolicy/entryCards
  - [ ] Phase 3：訓練管線 feature_train.py＋trainLocal/trainRemote 幽靈映射收斂
  - [ ] Phase 4（選配）：DM 前端 live 採集 panel
  - [ ] Phase 5：i18n/主題/測試/文件/清理


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
