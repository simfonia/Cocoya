# Cocoya 專案任務清單 (Todo List)
**專案名稱**：Cocoya (Code, Compute, Yield AI)
**核心目標**：以 Blockly 為介面，幫助 Python 初學者進入 AI 世界的 VSCode extension 與獨立桌面應用程式。

## [核心開發原則]
- **SSOT (單一事實來源)**：所有積木、產生器與前端邏輯統一存放於 `ui/src`，由 VSIX 與 Tauri 共享。
- **通訊抽象化**：前端一律透過 `CocoyaBridge` 與後端通訊，禁止在 UI 層直接使用環境專屬 API。
- **任務前快取現況**：先讀 `log/COCOYA_STATE.md`（現況快覽）再讀本檔對應章節；技術深層知識見 `log/KNOWLEDGE_BASE.md`；每日細節見 `log/work/`。

---
## [進行中 / 待辦]

### Dataset Manager 重構（主體已完成；殘餘待辦已收斂至稽核計畫）
> **精簡說明（2026-10-01，#task[cocoya 架構強化]）**：本檔原兩節 DM 內容（類型鎖定改造 M1~M4、三層重構收尾）
> 與稽核計畫大量重疊，已收斂為下列指針。屬工作記錄的完成條目以 `log/work/2026-09-*.md` 為 SSOT。
> **未刪除任何已完成歷史任務**（AGENTS.md 鐵律）；完整原版備份 `backup/todo_pre_batch0_20261001_090452.bak`。
- **計畫 SSOT**：`log/plan/ComprehensiveAudit_2026-09-27.md` §6（四類型專項）／§15.3（實機 backlog）／§15.4（孤立技術債）；
  另見 `log/plan/DatasetManagerTypeLockedWorkflow.md`、`DatasetManagerFeatureMinimalM4.md`、`DatasetManagerDarkThemeFinish.md`。
- **已完成**：三層重構 Stage 0~6（core/io/ui/application 四層＋`--dsm-*` token 化＋i18n parity）、
  M1 類型鎖定、M2 R4~R9、M3 T-1~L-4（table/line 模板與分流）、M4 Phase 1~5（feature 最小可用）。
- **併入稽核計畫的長遠債**：`--dsm-*` dark/token 收斂 → §2 P1-3；`spec.js` 直用 `t()` → §6 P2-13；
  `ui_components.js` 職責重疊 → §5 P2-6；M4-FEATURE 除錯線索①~⑥ → §2 P1-1/P1-2 與 §6 P2-10。
- **仍待使用者實機**（完整表見計畫 §15.3）：R9 雙平台＋三主題目視、table int8 量化本機驗證、
  line/feature 整鏈 GUI 實機、DM 第二輪 UI、M4b 存讀混合、Stage 6 Gate 簽核、Stage 7 總驗證。

### [2026-10-02] DM P3 標註尺規 bug（已完成）
- [x] **滑鼠不在影像上尺規仍顯示** ✅ 2026-10-02：真因是 `ui_canvas.js` 的 `mousemove` 掛在 `window`
 （拉框拖出畫布仍要追蹤）＋ 座標被 `clamp` 釘在邊界 → `canvas.mouseleave` 清掉 pointer 後，
 下一次 window `mousemove` 又把尺規設回邊界值（等於永遠清不掉）。改以**未 clamp 的 raw 座標**判定
 在影像內與否，出界一律收 `null`；拉框預覽框仍用 clamp 座標（行為不變）。
 新增 2 回歸測試（`ui_canvas.test.mjs` 28 → 30，全量 284 綠），**變異測試確認會紅**。
 詳見 `log/work/2026-10-02.md` §6。
- [x] 順帶修：`ui_canvas.test.mjs` 單行**孤 CR 行尾**（歷史遺留）→ 正規化 CRLF，
 git `ls-files --eol` 由 `i/-text w/-text` 回歸 `i/lf w/crlf`（獨立 chore commit，避免稀釋 bug fix diff）。

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

### Dataset Manager 三層重構收尾（殘餘項已併入上方 DM 節）
- [ ] 手動測試 backlog（log/plan/DatasetManagerManualTestBacklog.md：A2-1~A2-4、C1、U3-*、UI4-*）
- [ ] Stage 6 Gate 簽核（§9.3 六項）＋ D6-2/B0-1 公開 API 實機對照（console Object.keys(window.CocoyaDataset).sort()）
- [ ] Stage 7 總驗證（compile/lint/cargo check+test/tauri build ＋ E2E 矩陣 §10）
- 剩餘長遠債已併入計畫、不再重複追蹤：`--dsm-*` dark/token → 計畫 §2 P1-3；`spec.js` 直用 `t()` → §6 P2-13；`ui_components.js` 職責重疊 → §5 P2-6
- 脫離 DM 範圍的孤立技術債（Tauri dev sidecar 路徑優先序、深色 prompt hover 白底、`.serial-dropdown-label` null）已收於計畫 §15.4，於此不重複追蹤。

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

### [2026-09-27] #task[cocoya 全面檢查] 全專案稽核計畫（Stage 0 ✅／Batch 0 ✅／Batch 1 ✅）
> 計畫全文：`log/plan/ComprehensiveAudit_2026-09-27.md`（原 13 章節 ＋ **§14 Batch 0 執行結果** ＋ **§15 DM 殘餘收斂** ＋ **§16 Batch 1**）
> 範圍：全專案；DM 限 image／object_detection／line_following／table 四類型；特別檢查 i18n 與 3 主題。
> **執行順序決策：先做 Stage 0（TDD 守門），再動任何重構批次。** 理由：Batch 1~6 全是拆檔重構，無測試門檻等於沒有安全網。
> **進度**：Stage 0（T1／T-fast／P0-1／P0-2／P0-3／T2／T3 夾具）、Batch 0（P0-3 複核／P3-1／P3-2）、
> **Batch 1（P2-6-b／P1-1／P1-2／P2-6）**（2026-10-01）**已全數完成**。
> 全量測試 **194 → 240 例**（`npm test` 全綠）。**下一個可執行批次：Batch 2**。
> ⚠️ **T-scan**（掃描其餘測試檔的計時器／未 await handle）仍待辦，見下方 Stage 0 節。
> ⚠️ **Batch 1 未做實機驗證**（純程式碼改寫＋守門），建議於 Batch 2 前補一次四類型雙平台＋三主題目視。
> 基準（實測 2026-09-27）：`cd ui; node --test "src/**/*.test.mjs"` → tests 194 / pass 194 / fail 0（測試本體不差，問題是沒機制去跑）

#### Stage 0（TDD 守門，最高優先；完成前不得動 Batch 1~6）
- [x] **T1**（最低成本最高回報）`package.json` 新增 `"test:ui": "cd ui && node --test \"src/**/*.test.mjs\""`，`test` 改為 `test:unit && test:ui`；確認 194 測試進入門檻（**勿用目錄模式**，會誤把 index.js 當入口）
  - ✅ 2026-09-30 實作：改用 `npm --prefix ui run test:unit`（消除 `cd ui &&` 的 cmd/pwsh 差異）；根 `test` = `test:unit && test:ui`；實測 `npm test` exit 0、194/194
- [x] **T-fast（新增，2026-09-30）** 分層守門：`test:fast`／`test:dm`／`test:core`／`test:rust` ＋ `scripts/test-related.cjs` 自動挑測試；修掉 `statusMessage.test.mjs` 計時器洩漏（Node 測試 5722ms → 1091ms）
- [ ] **T-scan（新增，2026-09-30）** 掃描其餘測試檔是否仍有「未清除計時器／未 await handle」導致 event loop 空轉；另注意 28 檔約 150ms 為 Node 啟動開銷非測試邏輯
- [x] **P0-1** 英文版 SPIKE 感測器積木無顏色 ✅ 2026-09-30：`en.js` 補 `COLOUR_SPIKE_SENSOR_COLOR/_DISTANCE/_FORCE/_IMU`（與 zh-hant 同值）。**同時發現對稱缺陷**：`zh-hant.js` 缺無後綴的 `COLOUR_SPIKE_SENSOR`，但 `spike_blocks.js:20` 與 toolbox.xml 三個 category 都在用 → **中文版 SPIKE 主分類也是無色的**，一併補上。**注意：`COLOUR_SPIKE_SENSOR` 不可刪**（審查報告原建議刪除是錯的）
- [x] **P0-2** `ui/src/zh-hant.js` 缺 Stable Mode 三鍵 ✅ 2026-09-30：補 `TLB_SETTINGS_SERIAL_UPLOAD`／`TLB_SETTINGS_SETUP_STABLE`／`MSG_SETUP_STABLE_CONFIRM`（保留英文版的換行段落語意）。**待決策**：`index.html` 沒有 `btn-setup-stable-mcu` 元素，`base.js:484` 的綁定目前是 no-op（`if (setupStableBtn)`）——按鈕是否要上架？
- [x] **P0-3** Blockly 內建鍵確認 ✅ 2026-09-30：zh-hant 獨有 6 個 `BKY_*_VARIABLE*` 屬 Blockly 本體提供的內建文案，不補進 en.js，改在契約測試以 `BLOCKLY_BUILTIN` 白名單豁免
- [x] **新缺陷（審查未涵蓋）**：5 個 i18n 缺漏 — `PY_COLON`／`PY_EQUAL`（**兩語系皆缺**，導致積木欄位顯示 undefined）、`AI_DRAW_ANGLE_ARC_TOOLTIP`（en 缺）、`CAR_HAND_BOTH`（en 缺）、`HW_PIN_SHADOW_TOOLTIP`（兩語系皆缺，程式碼內的 fallback 是中文 → 英文介面顯示中文）。全部補齊
- [x] **T2** 契約測試全模組化 ✅ 2026-09-30：由 `filter(id => id.startsWith('core/'))` 改為涵蓋 `core_manifest.json` 全部 22 模組；並新增 3 個 i18n 守門（blocks/generators 引用鍵雙語系皆有定義、根 parity、模組 parity）。**8/8 全綠**，全專案 194 → 197 例
  - 修正兩處規則本身的缺陷（非放寬斷言，是對齊設計事實）：① `<shadow type="...">` 影子積木納入 toolbox 公開集合（先前只抓 `<block>`，導致 py_ai_point／py_ai_color／mcu_pin_shadow 全被誤判）② blocks/generators 只用 `Msg['KEY']` 語法抓鍵（原本的正則會抓任何物件字串鍵，誤判 mcu_car 的 `note_map = {"CS":1,...}` 與 huskylens 的 `'V2'`）
  - 白名單（附原因，未來新增仍會被擋）：`py_ai_draw_rect_alpha`／`py_ai_get_bbox_center`（已定義未上架，**待決策**）、`py_ai_train_init`（死碼 generator，待確認專案 XML 相容性後清理）
- [ ] **T3** 共用測試夾具：新增 `ui/test/`（`fakeDom.js` makeEl/makeFakeDocument、`depsBuilder.js` makeDeps 預設注入**真** `t()`／`escapeHtml`、`fixtures.js` DatasetSpec 樣本）；消除 `annotation`(211 行)／`classification`(194)／`statusMessage`(84)／`panels`(102)／`labelManager`(65)／`samplerPanel`(102) 六檔重複 fake（**純搬移，驗收＝194→194 全綠且斷言未改**）
- [x] ~~T2 前置盤點~~ ✅ 2026-10-03 結案：**已被 T2 實際執行取代**，無需獨立盤點。
      T2 於 2026-09-30 直接完成（`core_contract.test.mjs` 8/8 全綠，涵蓋 22 模組），
      盤點階段即等同逐項對帳；事後複驗 8 測全通過，無殘留缺口可盤。
- [x] ~~T3 前置盤點~~ ✅ 2026-10-03 結案：**已被 T3 實際執行取代**。
      T3 於 2026-10-03 完成（`ui/test/` 四夾具 `fakeDom`／`depsBuilder`／`fixtures`／`depsStubs`，
      6 檔重複 fake 已收攬）。最小抽象介面在實作中逐漸收斂，無需事前盤點。

#### Batch 0（無風險）
- [x] ~~**待決策（2026-09-30 由 T2 浮現）**~~ ✅ 已於 2026-09-30 處理：`py_ai_draw_rect_alpha`（cv_draw，補齊 START/END/COLOR/ALPHA 四個 shadow 預設值）與 `py_ai_get_bbox_center`（ai_inference，放進「結果解析積木」群組）**已上架 toolbox**；`py_ai_train_init` 死碼 generator **已刪除**（全專案確認無 block／toolbox／範例 XML 引用，功能已被 `py_ai_train_run` 取代）。契約測試的 `UNPUBLISHED_BLOCKS`／`ORPHAN_GENERATORS` 兩個白名單現已清空
- [x] ~~**待決策（2026-09-30 調查結果：建議不上架）**~~ ✅ 已於 2026-09-30 依使用者決策走 **A（誠實化）**：Stable Mode 是 **CircuitPython 時代的遺留**（本專案已不再支援 CircuitPython，僅 MicroPython／Pybricks／官方 SPIKE），且後端三個 `setup_stable_mode()` 實作都只印一行訊息，整條鏈是 no-op。**已整條移除 8 個檔案／9 處**：
  - `ui/src/ui/base.js` — 移除 `btn-setup-stable-mcu` 綁定
  - `ui/src/bridge/tauri.js` — 移除 `setupStableMode` 事件處理
  - `src/cocoyaManager.ts` — 移除 `setupStableMode` 訊息分派
  - `src/handlers/firmwareOps.ts` — 移除 `handleSetupStableMode()`
  - `src-tauri/src/commands/mcu.rs` + `lib.rs` — 移除 `setup_stable_mode` command 與註冊
  - `resources/deploy_mcu.py` — 移除 `--setup-stable` 參數與分派
  - `resources/deploy/{base,micropython,pybricks}.py` — 移除 `setup_stable_mode()` 實作
  - `ui/src/{en,zh-hant}.js` — 移除 `TLB_SETTINGS_SETUP_STABLE`／`TLB_SETTINGS_SERIAL_UPLOAD`／`MSG_SETUP_STABLE_CONFIRM` 三鍵
  - `docs/backend_api_manifest.md`（SSOT）— 移除兩處 command 條目
  - 保留 `serial_upload_only`（deploy_mcu 的參數，Rust 端有真實作用：加 `--no-monitor`）
- [x] ~~**待決策（2026-09-30）`ui/` 的 eslint 守門**~~ ✅ 已於 2026-09-30 解決：新建 `ui/.eslintrc.json` ＋ `npm run lint:ui`（掃 191 檔含 34 個 `.mjs`），49 項問題清零並接入 `test:unit`。三條刻意關閉規則（`no-control-regex`／`no-regex-spaces`／`no-empty`）的原因已寫入 AGENTS.md
- [x] **P0-3** 確認 zh-hant 獨有 6 個 `BKY_*_VARIABLE*` 鍵 ✅ 2026-09-30（Stage 0 T2）：屬 Blockly 內建，以 `BLOCKLY_BUILTIN` 白名單豁免。**2026-10-01 Batch 0 再確認一次**，處理已完整覆蓋，無需變更（計畫 §14.1）
- [x] **P3-1** 自動化守門 ✅ 2026-10-01（Batch 0，計畫 §14.2）：i18n parity **已被 T2 取代**（原「新增 `i18n_parity.test.mjs`」取消，避免同一規則兩處維護）；`unused_export_scan.cjs` **不存在故取消**（§9.4 更正）；**新增 `ui/src/modules/theme_manager/theme_contract.test.mjs`**（4 測）守住 P2-16「三主題 cssVars 鍵集合一致」，並新增 `test:theme`（根＋`ui/`）與 `test-related.cjs` 的 `THEME_CONTRACT_TEST` 接線
- [x] **P3-2／T7 前段** 補高風險檔測試 ✅ 2026-10-01（Batch 0，計畫 §14.3，+30 例）：`ui/src/bridge/tauri_anchor.test.mjs`（13 測，`_normalizeAnchor` serde 雙保險／`capabilities` 欄位集合與即時反映／`_refreshAnchor` 三分支）＋`ui/src/app/persistence_snapshot.test.mjs`（13 測，reload 快照一次性語意／debounce 以 `mock.timers` 驗證／`setDirty` 原子化同步）。兩支皆經**變異測試**確認會紅（非假綠）。全量 197 → **227** 例

#### Batch 1（低風險純重構）
- [x] **P1-1** DM 類型判斷收斂 ✅ 2026-10-01（計畫 §16.2）：`typePolicy.js` 補 `ALL_TYPES`／`projectTypes()`／`isKnownType()`／`isFeatureType()`；
  `spec.js` 改 import（移除自持的 `PROJECT_TYPES`／`IMAGE_TYPES`）；`ui_layout.js` 4 處、`ui_components.js` 2 處、`core/stats.js` 2 處、
  `ui/annotation.js` 2 處、`ui/labelManager.js` 6 處全數改走 typePolicy；刪除 `ui_layout.js` 重複的 `TYPE_TO_MODES_MAP`。
  **新守門**：`typePolicy.test.mjs` 掃描全 DM 目錄，硬編碼 `projectType === '...'` 或 `TYPE_TO_MODES_MAP` 即紅（+5 測）
- [x] **P1-2** 單類型分支改走 typePolicy ✅ 2026-10-01（計畫 §16.2）：`countHeader` 用 `needsUnclassifiedCheck()`（語意等價於「僅物件偵測」），
  `feature` 分流用 `isFeatureType()`，分類專屬行為用 `isClassificationType()`
- [x] **P2-6-b** `capabilities` 欄位集合不一致 ✅ 2026-10-01（計畫 §16.1）：Tauri getter 補 `isRemoteConnected: false`；
  刪 `supportsStableMode` 三處宣告 ＋ `src-tauri/permissions/commands.toml` 的 `setup_stable_mode` 條目（額外發現）；
  新增跨橋欄位集合對帳測試（+3 測）
- [x] **P2-6** `ui_components.js` 職責重疊 ✅ 2026-10-01（計畫 §16.3）：**計畫前提已查證不成立 —— 查無可刪函式**。
  5 個方法全有呼叫端；點名的 `ui/panels.js`（欄位／表格）與 `ui/thumbnails.js`（捲動記憶，2.1KB）職責清晰互不重疊。
  實際完成三項真問題：① **6 處未轉義屬性插值**（`blobUrl`×2、`c.id`×2、空狀態字串×2）；
  ② **AGENTS.md 紅線無守門**（新增 `#dataset-structure-content` 掃描型守門，該紅線是 P2 三度事故病根）；
  ③ `ui_components.test.mjs` 原為**空殼**（0 測），補 5 測（計數欄表頭真值表／標籤轉義／屬性插值掃描／守門自檢／紅線守門）

#### Batch 2（中風險視覺，需三主題目視）
- [ ] P1-3 `dataset_manager.css` token 化：144 個 hex → 判定設計常數／主題值；優先 `#4CAF50`(7)、`#2d2d2d`/`#1e1e1e`、`#ff8fb3`(5)；新增 token 須三主題同步（維持各 46 鍵集合一致的不變式）
- [ ] P1-4 `style.css` 242 hex／51 var：先量化分類（工具列／積木區／DM／dialog），挑非 Blockly 內部區塊分 2~3 批 token 化
- [ ] P2-7 `getLabelColor` 改為主題 token 取色（`--dsm-series-1..8`），取代 HSL 公式生成（`h=(hash*137.508)%360` 等）
- [ ] P2-16 確認 `cocoya_dark` 缺 `msgColours` 為刻意或疏漏（僅 candy 有）；若刻意則於 `theme_manager.js` 註解寫明，否則補上
- [ ] P2-15 中文 fallback 風險：`ui_layout.js`(292)／`base.js`(188)／`tauri.js`(164) 等 `t('KEY','中文')` 改無 fallback 或英文 fallback，讓缺鍵在開發期被 parity 抓到

#### Batch 3（中風險架構，多視窗／emit_to 高危）
- [x] P2-1 `ui/src/bridge/tauri.js` 拆檔 ✅ 2026-10-03（**拆檔全階段完成**）
  - **成果**：`tauri.js` 1865 → **882 行**；`send()` 內 1025 行／58 case 的 switch **完全移除**（殘留 0 case）；
    61 個 command 全數遷入 `tauri/sendHandlers.js` 註冊表。實際切成 **11 個子模組**（非計畫原寫的 4 個）。
  - **切法**：案 B（command → 函式對照表，`handler.call(this, command, data)`）。選 B 的理由：switch 消失後
    「新增 command 只需加一行」，且子模組可獨立測試；案 A（mixin）方法不在 class 語法樹上、守門難寫。
  - **分組依實際耦合而非計畫名稱**：`backup`(4) `manifest`(7) `window`(8) `firmware`(3) `serial`(4)
    `codeRun`(2) `pythonEnv`(5) `fileOps`(10) `training`(4) `camera`(6) `transfer`(3) `progress`(3) `annotation`(2)。
    其中 `dataset`（原計畫為單一檔 407 行）依使用者指示**再細切為 4 檔**：
    `camera`（全走 `_handleDatasetCommand`）／`transfer`（唯一帶 mutable 實例狀態 `_datasetUploadChain`）／
    `progress`（含 `getProjectAnchor`，三者共用 `_normalizeAnchor`）／
    `annotation`（**唯一直接 `tauriInvoke` 不走 sidecar**，不合併進 camera 以免混雜兩種派送路徑）。
  - **守門**：`scripts/verify-tauri-split.cjs` 5 項（command 集合／**1b 重複定義**／invoke 集／fallthrough 組／`this.*` 引用數）
    ＋ `tauri_send_dispatch.test.mjs` 19 測（行為）。**基準 ref 釘選 `161d610`**，不可預設 HEAD（拆檔一 commit 基準就跟著移動）。
  - **⚠️ 待實機**（測試無法證明）：DM 拍照、標註改名、匯入/匯出、上傳、多視窗 DM 開關流程。
    每搬一模組皆未做雙視窗實機（AGENTS.md 要求），故**拆檔雖機械式比對全過，仍需人工實機確認**。
- [ ] P2-2 `ui_layout.js`（80.5KB）階段一刪除約 20 個純委派薄包裝（`enterClassificationReviewMode` L668 等，呼叫端直接取 controller）；階段二協調邏輯搬 `ui/orchestrator/*`；**不得破壞** `#dataset-structure-content` 嚴禁覆寫 innerHTML 契約，`renderStructurePanel()`／`renderStatsPanels()`／`refreshThumbnailBadges()` 介面不變

#### Batch 4（DM 四類型深化）
- [x] **G1 feature 積木入口 — 階段 1 完成** ✅ 2026-10-03（使用者決策：分兩階段）：
  **階段 1（本次，已完成）**：
  ① 先實測後端（`temp_scripts/e2e_g1_feature_train_check.py`：1 epoch PASS，產出 curve/history/report）
     → 確認 G1 **純為 UI 入口缺口**，非模板缺口（`feature_train.py` CLI 與其他模板 14 參數完全一致）。
  ② `ai_inference_blocks.js` 抽出 **SSOT 常數 `TASK_TYPE_OPTIONS`**，`py_ai_train_run` 與 `py_ai_model_init`
     **原本各自維護一份重複的下拉**（易只改一處）→ 兩處改為引用同一常數，並加 feature。
  ③ `ai_inference_generators.js` `train_model` 加 `feature → feature_train.py` 分派。
  ④ **修掉假回傳**：`_table_predict` 原本回傳硬編碼 `{"prediction": 0.0}`（使用者會誤以為模型壞掉）
     → 改為明確 `{"error": "table/feature inference not implemented yet"}`；`predict` 分派改為 `in ("table","feature")`。
  ⑤ i18n `AI_TASK_FEATURE`（zh-hant「特徵」／en「feature」，parity 守門通過）。
  ⑥ **新守門** `ui/src/modules/ai_inference/task_type_contract.test.mjs`（6 測，掃描型）：
     驗證 task type 在「UI 下拉／train 分派／predict 分派」**三處一致**＋不得內聯下拉＋不得假回傳 0.0＋i18n parity。
     **變異測試 3 種皆報紅**：①刪 feature 訓練分派 ②還原假回傳 0.0 ③下拉改回硬編碼。
  **階段 2（未做，待立計畫）**：實作真實 `_table_predict`／`_feature_predict`、新增表格型解析積木（G3）、
  新增 feature 的「從相機擷取 landmark」積木（現有 12 個 `py_ai_*` 無此能力）。
  驗收：全專案 284 → **290/290 綠**；lint:ui 0 error；vite build PASS；
  產生之 `_ModelInference` 類與 `train_model` 函式 `py_compile` 皆 exit 0。

- [x] **G2 serial 映射 — 決策保留預留位** ✅ 2026-10-03（使用者決策 B）：
  查證：`isDevType('serial') === true`（`typePolicy.js` `DEV_TYPES=['serial']`）且 `exportUseCases` L36 會擋下
  dev 類型匯出 → **該分支目前不可達，是死碼不會炸**。使用者選擇保留（先留接口的合理設計），
  僅於 `docs/dataset_types_matrix.md` §3 G2 明確標註「預留、模板未實作」，避免日後誤判為已完成。

- [x] **task type 下拉重複合併＋命名不一致顯式化** ✅ 2026-10-03：
  ① 下拉兩份重複 → 合併為 `TASK_TYPE_OPTIONS` 單一 SSOT（見上）。
  ② **命名不一致（`line_following`→`line_follower`、`image`→`classifier`）刻意不重命名**：
  名稱已貫穿 DM `project.type`／使用者既有 `.xml`／`dataset.json`／Python 模板目錄／匯出 ZIP 佈局，
  重命名＝資料遷移＋相容層，風險遠大於收益。改為「顯式化」——於 `docs/dataset_types_matrix.md` §0
  記錄對照與不重命名理由、`TASK_TYPE_OPTIONS` 處加註解、sidecar 兩處映射加同步警示。

- [x] P2-10 產出 `docs/dataset_types_matrix.md` 為四類型能力 SSOT ✅ 2026-10-02（模式/標註/匯出/訓練/推論/已知殘餘）：
  六節結構（命名對照／總覽矩陣／逐類型細節／已知殘餘／sidecar 雙處映射／雙佈局／對應紀錄），全部內容實查原始碼並附行號來源。
  **附帶盤出 6 項真實落差（G1~G6）**，其中兩項為本次新發現：
  ① **G1 `feature` 有訓練模板但無積木入口**——`py_ai_train_run` 的 `TASK_TYPE` 下拉僅 4 項（classifier/detector/line_follower/table），
  不含 feature，故 DM 能建 feature 專案卻無法從積木訓練（`feature_train.py` 存在且 py_compile 通過 → 是 UI 入口缺口，非模板缺口）。
  ② **G2 `serial` 訓練模板目錄不存在**（`Test-Path` 實查 False），sidecar `script_rel` 卻有 serial 映射 → 走到該路徑必報「訓練模板不存在」。
  另 G6：`docs/help/` 18 頁僅 3 頁有英文版，`py_ai_get_*` 推論積木全無英文說明。
  另釐清最易踩坑的**命名不一致**：`line_following`（DM）→ `line_follower`（訓練）、`image`（DM）→ `classifier`（訓練），映射在 sidecar 兩處（L1066 `task_scripts` / L798 `script_rel`），改動須同步。
- [x] P2-11 **line_following 切分策略** ✅ 2026-10-02（查證結案，**結論：無類別欄位 → 回歸型，維持隨機切「符合鐵律」，無需改分層**）：
  證據鏈三層實查：① UI 層 `typePolicy.needsUnclassifiedCheck()` 僅對 object_detection 為真 → line 無類別選擇器；② 資料層 e2e 實測 `class_id` 集合 = `{0}`、annotation 欄位僅 `['class_id','line']`（無線型/方向/單雙線欄位）；③ 訓練層隨機切（seed 可再現）＋報告註明回歸型 → 滿足鐵律後半段。
  查證過程**修掉一個真實缺陷**：切分報告標題行贅字與括號不閉合（「隨機切分…隨機切分)」）→ 改為 `隨機切分 (random split，線段回歸任務無類別欄位):`（備份 `backup/line_dataset_pre_p211_20261003_000101.py`）。
  證據工具 `temp_scripts/e2e_p211_line_split_check.py`（自足 tmpfile 夾具、11 斷言 ALL PASS、**變異測試確認會紅**：改成分層抽樣 → 5 項報紅）。AGENTS.md 鐵律條文與稽核計畫 §6 P2-11 均已回寫結論。
- [ ] P2-12 **table 是否新增 live 採集**（決策項）：A 維持 file-only／B 新增（可重用 `ui/featurePanel.js` 相機骨架）
- [ ] P2-13 `spec.js` 直用 `t()` 42 處：`validate()` 先改回傳 `{code, params}`，文案上移 ui/application；分兩批
- [ ] P2-17 盤點 `docs/help/` 中英文 help 缺漏（多數僅 `zh-hant`）

#### Batch 5（後端／資源）
- [x] P1-5 **安全**：`dataset_sidecar.py` 匯入時自動 `pip install paramiko` ✅ 2026-10-03
  （採計畫首選「純降級回報錯誤碼」，未做使用者同意開關）：刪 module level `import paramiko` + `pip install`；
  新增 `PARAMIKO_MISSING="SSH_PARAMIKO_MISSING"` 與 `_require_paramiko()`；4 個使用點
  （checkRemoteEnvironment／uploadDataset／trainRemote／stopTraining）統一回 errorCode；
  i18n `MSG_PARAMIKO_MISSING`（zh/en）；Tauri `tauri.js` 兩處 dispatch ＋ VSIX `trainingOps/envOps` 透傳 errorCode；
  `ui/base.js` trainingError 依碼轉 i18n。
  **附帶修**：`stopTraining` 原 paramiko 匯入在 try 內且無 except ImportError（缺裝會被吞成
  `name 'paramiko' is not defined`），且早退不清 `_remote_train` 導致狀態卡住 → 兩者一併修正。
  舊碼其實**已有降級分支但不可達**（module level 先 pip 過），與 G2 serial 同類病根。
  **新守門** `ui/src/modules/dataset_manager/sidecar_dependency_contract.test.mjs`（7 測，掃描型）；
  守門 3 初版掃全文中文誤命中 docstring → 收斂為只掃 `"error":` 欄位值（判準落有效值而非代理指標）。
  **變異測試 4 種皆紅**：還原 pip install／移除 errorCode／移除橋接透傳／還原前端顯示 raw error。
  驗收：292 → **299/299 綠**、lint 0 error、py_compile/tsc/vite build 全 PASS、615 檔 CRLF。
  備份 `backup/*_pre_p15_20261003_124632.*`。**待實機**：兩平台各做一次缺 paramiko 的遠端訓練，
  確認終端機顯示安裝指引（詳見 `log/work/2026-10-03.md` §1）。
- [x] P1-6 逐條人工複核 Rust 15 處 `Command::new`（app 3／dataset 2／mcu 5／python 5）✅ 2026-10-03
  **Rust 端全數 argv 陣列、無 shell 拼接，計畫初步判定成立**；但挖出 3 個真實缺陷：
  - **F1** `mcu.rs` esptool 燒錄硬編碼 `Command::new("python")` → 使用者於硬體頁指向 venv/conda 時
    燒錄必失敗且錯誤訊息無法診斷。修：簽名加 `python_path: Option<String>` ＋ `reset_firmware_python()`
    （空白回退 `python`）；同步 `tauri.js` invoke 與 `docs/backend_api_manifest.md` SSOT。
  - **F2（最嚴重，且不在 Rust）** `src/handlers/firmwareOps.ts` 以 `terminal.sendText` 送進**互動式
    PowerShell**，5 個插入值全未跳脫（`--port ${serialPort}` 連引號都沒有；檔名含 `"`/`$(...)`
    → 指令截斷與**真注入**）；`seg.addr` 來自 `project_config.json` 完全未驗證。
    修：`psQuote()`（PowerShell 單引號跳脫）＋ 讀 config 時驗證 addr 格式（0x 十六進位或 UF2）。
  - **F3** `python.rs::start_training` **未註冊於 `invoke_handler![]`** → Tauri 無法呼叫（死碼，
    訓練實際走 `py_ai_train_run` → `run_python`／`trainRemote`）。刪除屬 P3-3 範疇**本次不動**，
    但仍修其 `Command::new("python")`，免得日後重新註冊帶著同一缺陷回來。
  **審查表（15 處逐條判定）見 `log/work/2026-10-03.md` §2.2**。
  **新守門** `ui/src/modules/dataset_manager/process_spawn_contract.test.mjs`（10 測，掃描型，
  遞迴整個 `src-tauri/src/**`）；守門 5 **由 Rust 簽名反推前端必須送齊的參數**而非寫死比對。
  過程中修掉守門自身兩個缺陷：**守門 6 初版假綠**（只掃 `sendText(\`...\`)` 直接呼叫，漏了
  `cmd += ...` 累積後再 `sendText(cmd)` 的間接組法 —— 變異測試發現）→ 改為同時掃字串組裝點；
  **守門 3 假紅**（命中自己註解裡舉例的字串）→ 先剝行註解再掃。另立**守門 3b**
  （簽名收 `python_path` 者函式體必須實際引用），因變異測試顯示守門 3 抓不到 `let py = "python"` 型迴歸。
  驗收：299 → **309/309 綠**、cargo check PASS、tsc/lint/build 全 PASS、618 檔 CRLF。
  **待實機**：VSIX Serial 燒錄一次（psQuote 改寫整個指令字串，須確認 esptool 仍正確解析
  含空格的 Program Files 路徑）＋ 檔名含空格的 .bin ＋ venv 情境。
- [x] P1-7 核對 sidecar 3 處 Popen 的 `encoding/errors` ✅ 2026-10-03 **實查後已全部符合，隨 P1-5 一併結案**
  （L967 TFLite 轉換、L1099 trainLocal 皆已有 `encoding="utf-8", errors="replace"`；
  唯一缺 encoding 的是 P1-5 刪除的 pip `check_call`，本無文字輸出需求）。AGENTS.md 四件套鐵律在 sidecar 端已滿足。
- [x] P2-3 `dataset_sidecar.py` 拆分 ✅ 2026-10-03（**1206 行 → 主檔 499 行**，拆出 5 個模組）
  **計畫前提修正**：原文要求抽「內嵌 Python 字串腳本」，但 `_local_convert_tflite.py`（2026-09-04）
  與 `dataset_io.py` 早已是獨立檔、全文無三引號腳本 → 真正待解的是 `run()` 的 **1050 行 if/elif 指令鏈**。
  拆出：`local_training.py`(135，trainLocal＋TASK_SCRIPTS SSOT)／`remote_ssh.py`(754，四遠端指令＋
  REMOTE_SCRIPTS SSOT＋_require_paramiko)／`remote_sync.py`(141，smart sync)／`remote_docker.py`(357，
  Docker 訓練＋產物下載)／`remote_tflite.py`(108，本地 Keras→TFLite)。搬 1085 行。
  **搬移方式**：Python 腳本**機械式抽取**（逐行切割＋取代 `self.send_*`/`self._remote_train` → 注入參數），
  非人工重打，降低 600 行搬移的轉錄風險。
  **兩個語意陷阱**（皆實測證實非推測）：① `continue` 失去宿主迴圈 —— paramiko 缺裝分支函式化後
  等價於 `return`（逐處確認僅 2 處）；② **循環 import** —— 頂層雙向 import 只在特定順序下僥倖可用，
  單獨 `import remote_sync` 立刻拋 partially initialized module → 改函式內延遲 import ＋ 註解原因。
  連帶修掉：`remote_docker` 內聯 24 行 `script_rel` 鏈 → 改用 `resolve_remote_script`（SSOT 單一）。
  **新守門** `ui/src/modules/dataset_manager/sidecar_module_split.test.mjs`（8 測）；守門 1 初版 18 秒
  → 改單一子行程批次（import 前清 `sys.modules` 殘留模擬乾淨載入）→ 5.5 秒。
  **變異測試揪出守門 3 是假綠**：原只驗「分派數 ≥14」，把 `stopTraining` 改名後總數不變 → 全綠；
  改 handler 名同樣漏。已改為**與預期集合完全一致** ＋ **分派呼叫的 handler 必須真的存在於某模組**。
  教訓：「數量下限」守門在重構中必然失效，只能靠集合對帳。
  **連帶修兩個被拆分打破的既有守門**（證明其先前有效）：`task_type_contract.test.mjs` ⑧
  改讀 `local_training.TASK_SCRIPTS`／`remote_ssh.REMOTE_SCRIPTS`；`sidecar_dependency_contract`
  ①②③ 掃描範圍擴為全部 6 個 sidecar 模組。
  驗收：309 → **317/317 綠**、端到端煙霧測試（stdout 全為合法 JSON，契約未破）、5 種匯入順序皆 exit 0、
  tsc/lint/py_compile/eol 全通過。備份 `backup/dataset_sidecar_pre_p23_20261003_141427.py`。
  **待實機**：遠端訓練全鏈（資料 sync→模板 sync→Docker→下載→本地 TFLite）＋ 中斷訓練 ＋ 匯出回歸。
- [x] P2-5 Rust 拆檔 ✅ 2026-10-03（原標註「先不動，待 tauri-codegen 合併」；使用者指示執行後完成）
  **計畫描述與實況有落差**：實際切分依程式結構而非原列的 3 檔。`mcu.rs`(1018) → `mcu/{board,deploy,monitor,firmware,raw_dump,stream}.rs`；
  `file.rs`(925) → `file/{manifest,anchor,examples,openfile,savefile,backup,dataset}.rs`（file.rs 實際含大量 DM 邏輯，非原列的 ops/anchor 兩檔）。
  **Tauri 邊界真陷阱**：`#[tauri::command]` 產生的 `__cmd__<fn>` 巨集**無法經 pub use 跨模組轉出**
  （Rust 巨集與 pub use 語義衝突 → E0433）。故 lib.rs 的 `generate_handler!` 必須改寫**完整子模組路徑**
  （如 `commands::mcu::board::get_serial_ports`）—— 這是拆分後唯一必要的 lib.rs 改動，已寫入 mod.rs 註解與 FILE_STRUCTURE。
  **搬移陷阱（皆實測，非推測）**：
  ① 段落邊界會把 `#[tauri::command]` / `#[derive(serde::Serialize)]` 留在前一段尾端，清潔時一併刪掉
  —— **編譯仍可能通過但 command 未註冊**（`save_file`/`auto_backup` 即如此，靠逐字元比對才發現）；
  ② 函式內的局部 `use tauri_plugin_dialog::DialogExt;` 被我提升到檔頭再移除 → `pick_folder`/`pick_data_file` 編譯失敗。
  **完整性驗證（非僅靠編譯）**：寫比對腳本以 git HEAD 為基準，確認 **28 個 pub fn 函式體逐字元完全相同**、
  **26 個 #[tauri::command] 零遺失零新增**、pub struct 10 個全數保留。
  **順帶修掉一個真實 bug**：`training.rs::ReportInfo` 缺 `#[serde(rename_all = "camelCase")]` →
  序列化為 `project_name`，而 `tauri.js` 讀 `r.projectName`（報告 QuickPick 標籤）→ 恆為 undefined，
  使用者看到空白標籤。**正是 AGENTS.md「Rust 序列化命名規範」記載的坑**（2026-07-29 ScanedImage.blob_url 同型）。
  **新守門** `sidecar_module_split.test.mjs` 增 5 項 P2-5 守門（拆分結構、lib.rs 完整路徑、command 註冊完整性、
  回傳型別 camelCase、子模組導出）；變異測試 2 種皆紅（還原短路徑、拿掉 camelCase）。
  **連帶修 3 個既有守門**（路徑隨拆分改變）：`process_spawn_contract` 守門 4/5 改讀 `mcu/firmware.rs`、
  守門 8 的註冊比對改取路徑末段。
  驗收：317 → **322/322 綠**、cargo check 僅剩 2 個拆分前既有 warning、cargo test 3/3、tsc/lint/eol 全通過。
  備份 `backup/{mcu,file}_pre_p25_20261003_144839.rs`。**待實機**：序列埠列舉/監看、韌體上傳與燒錄、
  開檔存檔（含另存新檔與範例唯讀保護）、DM 標籤改名與進度存讀。
- [ ] **T4** Python／Rust 測試納入：`temp_scripts/e2e_*.py` 轉 pytest（移除硬編碼路徑 `BALL = r'C:/Users/simfonia/Desktop/cocoya/dataset/ball'`，改 `tmp_path`／env）＋補 `sys.exit(1)`；Rust 補 `file.rs`／`python.rs` 測試（現全專案僅 3 個 `#[test]`）；`cargo test` 與 `pytest` 接入 `npm test`
- [ ] T4 前置盤點：8 支 e2e 腳本的相依套件（numpy／tensorflow／PIL）與執行時間，評估轉 pytest 順序

#### Batch 6（清理／收尾）
- [x] P2-9 repo 殘留 ✅ 2026-10-03（使用者授權全刪）
  **實查結論**（計畫原文的假設需修正）：`.gitignore` **早已涵蓋** `*.vsix`／`nul`／`test/`（含 `!ui/test/` 例外），
  故「補 .gitignore」無須動作。已刪：`cocoya-0.7.0/0.7.7/0.8.0.vsix`（193MB，**皆未進版控**）、
  `nul`（0 bytes）、`DATASET_MANAGER_PLAN.md`（**已進版控**，檔頭自標 SUPERSEDED；
  刪前備份 `backup/DATASET_MANAGER_PLAN_20261003_164350.md`，並 `git rm`）。
  `test/project*.xml`（`test/` 整個目錄已被 gitignore）經跨端檢索 `temp_scripts`／`scripts`／`src`／
  `src-tauri`／`ui/src` **零引用** → 保留不動（已被 gitignore 排除，無需搬移）。
- [x] P3-4 `FILE_STRUCTURE.md` 重排 + `log/COCOYA_STATE.md` §6 合併 ✅ 2026-10-03
  **計畫描述與實況有落差**：計畫寫「已有**行號**錯位（L18-19 處脫離樹狀縮排）」，
  實查檔內**根本沒有行號**（該檔從未引入行號制），真正的問題是**樹狀縮排錯位 8 處**。
  已修（`temp_scripts/fs_check.cjs` 為本次寫的一次性掃描器，gitignored）：
  ① `py_ai_pose_calc_angle_*` 兩行脫離 `docs/help/` 子樹；② `openTrainingReport.md` 重複列出兩次；
  ③ `log/mappings/` 下連續 5 個 `└──`（應只有最後一個）；④ **最嚴重**：`firmware/`、`deploy/`、
  `deploy_mcu.py`、`extension_icon.png`、sidecar 四檔被寫在 **`src-tauri/` 底下**（實查 `Test-Path`
  確認全在 `resources/`，且 `resources/` 段另有記載 → 重複矛盾，已移回並補 `src-tauri/` 實際
  缺少的 `permissions/`、`build.rs`、`resources/`）；⑤ 檔尾 `└── ui/src/.../cocoya_dark.js`
  以完整路徑行脫離樹狀（與 `themes/` 段重複，已刪）；⑥ `temp_scripts/` 子項縮排殘留。
  另補 `log/mappings/` 三個漏登項、`temp_scripts/` 摘要化。
  **新守門** `ui/src/modules/core/file_structure_contract.test.mjs`（5 測，掃描型）。
  變異測試 3 種皆報紅：① 把 `docs/help/` 最後一行改 `└──`（還原原始 bug 形狀）；
  ② 檔尾加 `└── ui/src/modules/core/core.js`；③ 註解塞入「見 L18-19」。還原後 5/5 綠。
- [x] P3-3 死碼掃描 ✅ 2026-10-03（**結論：3 個待查匯出中 2 個為死碼，1 個是活的**）
  **跨端檢索**（`ui/src`＋`ui/index.html`＋`docs`＋`examples`＋`resources`＋VSIX `src`）後：
  - `removeAnnotation`：**活的** —— `ui/annotation.js:381/397` 產生 inline
    `onclick="window.CocoyaDataset.removeAnnotation(${i})"`，**經字串內嵌呼叫**，一般檢索抓不到。
    → 保留（AGENTS.md 跨端檢索鐵則的實例：只看 `ui/src` 的直接呼叫會誤判）。
  - `refreshDynamicPanels` / `refreshPreview`：**死的** —— window 命名空間上零消費者；
    內部呼叫一律走 `ui_layout.js` 模組層級。已從 `index.js` 的 `Object.assign` 移除，
    並連帶把 `ui_layout.js` 的兩處 `export` 降為內部 `function`（該檔唯一外部消費者就是 `index.js`）。
  - 職能重疊比對：`sampler.js`（Bridge/相機狀態機）vs `ui/samplerPanel.js`（DOM 面板編排）
    **不重疊**；`ui_canvas.js`（canvas 繪製與滑鼠事件）vs `ui/annotation.js`（標註模式編排）
    **不重疊**。與 Batch 0 對 `ui_components.js` 的結論一致 —— **記錄「查無重疊」並留下證據，
    比硬湊一個刪除動作更有價值**（AGENTS.md 明載）。
  - 驗收：322/322 綠（`node --check` 兩檔 + 全量）。
- [x] Stage 0 殘項 T3（共用測試夾具）✅ 2026-10-03
  首輪（2026-09-30）只收了 5 檔的 fake DOM。殘留盤點後再收 5 檔：
  `statusMessage`／`panels`（自帶 fake element）、`featurePanel`／`labelManager`／`exportUseCases`
  （自造假 `t`/`escapeHtml`）、`modal`（自帶 `optionList`＋帶標記的 `t`）。
  新增 `ui/test/depsStubs.js`（fallbackT／taggedT／rawEscapeHtml／angleEscapeHtml／
  optionListModal／optionListPanels）；`fakeDom.js` 補 `classList.toggle`（statusMessage.js
  會呼叫，缺了直接 TypeError）與 `_appended` 累積（panels 斷言讀此欄位）。
  **刻意不統一改用真實 `t()`／`escapeHtml()`**：真 `t()` 會查 `Blockly.Msg`，若某測試載入 Blockly
  全域（`core_contract.test.mjs` 就會）會讓斷言依賴全域載入順序 —— 正是 T3 要消除的隱性相依。
  故定位為「消除重複的**定義**、保留每檔的**選擇**」。
  **踩坑**：兩種 `optionList` 輸出格式其實**不同**（modal 版有 `value="X"`、panels 版沒有），
  先合併成一個函式才發現斷言不過 → 拆回兩個具名函式，差異變得明確可查。
  驗收：**斷言零修改**，327/327 綠（322 + 新增 5）。
- [x] **T5** 覆蓋率基準 ✅ 2026-10-03（**只產報告，未設門檻，符合 T5 階段一設計**）
  新增 `scripts/coverage.cjs` ＋ `npm run coverage` / `coverage:check`；devDep `c8@^12`。
  **量測範圍刻意保守**（SSOT 寫在檔內 SCOPE）：只量 `ui/src/{modules,app,bridge,utils}/**/*.js`，
  排除測試檔與 vendored `src/blockly/**`。
  理由：`ui/src` 混有三種性質不同的檔案（可測純邏輯／只在瀏覽器跑的膠水／第三方 vendored），
  全量統計會被 vendored 與膠水稀釋到毫無行動价值。**這不是全專案覆蓋率。**
  **基準值**：行 **55.66%**（4052/7279）、分支 78.95%、函式 59.8%。
  **最需補測**：`bridge/tauri.js` **8.0%**（1864 行，最大缺口）『 `importUseCases.js` 16.4%
  ＞ `sampler.js` 33.4% ＞ `ui_components.js` 39.7% ＞ `bridge/base.js` 54.3%。
  → **T7 的「tauri.js 子模組補測試」與這份清單完全對得上**（tauri.js 是唯一 <20% 的超大檔）。
  `baseline.json` 內 `enforce: false` ＋ `coverage/` 已 gitignore → 目前不擺任何流程。
  **踩坑**：`npm install --save-dev c8` 會重排 `package.json` 三行既存縬排
  （`pristine:examples`／`vscode:prepublish`／`test:theme` 原本就是 4 空格、與鄰行 8 空格不一致）。
  已還原為原樣，diff 只留 c8 一行。**教論：npm 會順手格式化整檔，diff 出現無關行時要逐一還原。**
  **階段二**：連續兩週後依實際值把 `enforce` 改 true 並填 `minLines`。
- [ ] **T6** CI 與 pre-commit：GitHub Actions workflow（`node --test`／`tsc --noEmit`／`lint`／`cargo check`／`cargo test`／`py_compile`）＋ husky pre-commit 跑快速子集（**待決策**：CI 平台是否採 GitHub Actions）
- [ ] **T7** 高風險檔補契約測試（拆檔後）：`bridge/tauri.js` 拆檔後各子模組、sidecar 訊息協定（stdout 單一 JSON）。**Batch 0 已補前段**（anchor ＋ capabilities ＋ 快照／備份）
  - **前置已達成（2026-10-03）**：P2-1 拆檔完成，`tauri/` 下已有 11 個子模組可獨立測試。
    覆蓋率基準（T5）顯示 `tauri.js` 原為 8.0%（全專案唯一低於 20% 的超大檔），拆檔後應重跑 `npm run coverage` 取新基準。
  - 仍需逐子模組補：優先 `transfer.js`（`_datasetUploadChain` 併發上傳鏈）與 `progress.js`（錨定雙保險）。
- [ ] **T8** 測試分類標註：區分**契約測試**（守設計：manifest／i18n／色碼／主題 token）與**行為測試**（守重構：controller／use-case），禁止只有後者
  （**本批已補兩個契約測試**：`file_structure_contract`（文件契約）與既有 `sidecar_module_split`）

#### 待決策（2026-10-01 Batch 0 浮現；詳見計畫 §14.5）
- [ ] **P2-16 `cocoya_dark` 缺 `msgColours` 是刻意或疏漏**：Batch 0 已依 AGENTS.md「新增積木模組檢查清單」第 2/3 點判定為**符合設計**（根 `zh-hant.js`/`en.js` 的 `COLOUR_*` 才是預設色 SSOT，主題 `msgColours` 為選配覆寫），並把此判斷**釘進 `theme_contract.test.mjs` 第 4 測**。⚠️ 若使用者認為應是疏漏，需推翻該測試改為要求 dark 有覆寫
- [x] **`isRemoteConnected` 在 Tauri `capabilities` 未回傳** ✅ 2026-10-01 使用者決策：**併入 P2-6-b 處理**（Tauri getter 補 `isRemoteConnected: false`）。
  ⚠️ **Batch 0 原判斷「無讀取點」是錯的** —— `src/cocoyaManager.ts:397` 有生產者（`vscode.env.remoteName !== undefined`），VSIX 路徑是活的。當時只掃 `ui/src` 沒掃 VSIX Host `src`，漏了生產端
- [x] **`supportsStableMode` 死欄位** ✅ 2026-10-01 使用者決策：**併入 P2-6-b 處理**（刪除 `base.js`／`tauri.js`／`vsix.js` 三處宣告 ＋ 更新欄位集合守門）
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
- [x] [2026-09-17 → 2026-10-02 查證結案] 匯出 staging 路徑驗證（原 backlog：**查無此 bug，兩項疑點皆已於 2026-09-22 修正**）：
  ① 「live 匯出 ZIP 只有 dataset.json、沒有照片」**不成立**。Tauri `export_dataset`（`dataset.rs` L269-282）已改為「canonical 優先＋source 合併」：先由 `current_paths[label].parent()/dataset/<名>` 全量 copy（canonical ＝ live 落盤真相），`sourceFolderPath` 僅在 canonical 之外再 merge。live 模式 `sourceFolderPath` 為空**不再導致影像遺失**。
  ② 「VSIX 用 `workspaceFolders[0]` 取錯目錄」**不成立**。`datasetOps.ts` L243-248 已改為專案根 SSOT（`currentFilePath` 的 dirname 優先，僅在未開檔時才 fallback `workspaceFolders[0]`）；且匯出不再直接對真實 `datasetDir` 打包，先複製到 `os.tmpdir()/cocoya_export/<名>_<ts>` staging 再交 sidecar，完成/取消/失敗皆清理（避免 sidecar 於 staging 內建 `images/labels/` 污染 DM 日常目錄）。
  **證據**：新增自足 e2e `temp_scripts/e2e_export_live_layout_check.py`（走真實 sidecar `exportDataset`，不依賴本機遺留路徑；原 `e2e_export_check.py` 已因依賴 `Desktop\cocoya\zip\` 而失效），以「live 落盤真相」佈局 `<label>/*.jpg + dataset.json` 驗三型別：`image` 4 張／`object_detection` 4 張＋images/labels.txt/export_manifest.json／`line_following` 2 張 → **ALL PASS**。
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


### [2026-09-25] Python 語法積木群稽核後續
- [x] 完成稽核報告：`log/plan/PythonBlocksAudit_2026-09-25.md`。
- [x] `py_io_serial_flush` 補 MicroPython 分支：以 `sys.stdin` + `uselect.poll()` 排空可讀字元並清除 Cocoya 行緩衝；PC 維持 `ser.reset_input_buffer()`。
- [x] Candy 主題補齊 SPIKE 顏色 key：`SPIKE`、`SPIKE_MOTOR`、`SPIKE_MUSIC`、`SPIKE_LED`、`SPIKE_SENSOR_*`、`SPIKE_BUTTON`。
- [x] 系統規格補註：Python 分類名稱與原語法文字可保留英文作為教學專用術語；`ui/src/core_manifest.json` 是唯一編輯來源，Tauri 建置時透過 `bundle.resources` 複製。
- [ ] 建立核心積木契約驗證層：對帳 block 定義、generator、toolbox、mutation、雙語 i18n、主題顏色 key 與平台限制；納入 Node 測試及建置驗證。
- [x] 為 `py_text_zfill` 補 toolbox 入口與回歸測試；功能定義為文字左側補零至指定寬度，例如 `"7".zfill(3)` → `"007"`。
- [x] 為 raw Python statement／expression 補雙語說明與 tooltip，明確告知使用者自行負責 PC／MicroPython 相容性；保留雙平台顯示。

- [x] [2026-09-25] `py_math_single` 已依 `math.*` 操作注入 `import math`；移除不可達的 `math.atan2` 分支，獨立 `py_math_atan2` 維持正確 import 與產碼。
- [x] [2026-09-25] 完成核心 generator 回歸測試 `ui/src/modules/core/core_generators.test.mjs`：`math.*` import、atan2、serial flush 雙平台產碼、tuple 零／單／多元素；測試 4/4 PASS。
- [x] [2026-09-25] 修正 `py_type_tuple` 單元素輸出尾逗號：`(value,)`，避免錯誤產生 `(value)`。
- [x] [2026-09-25] 新增核心語法積木：`py_try_finally`、`py_logic_pass`、`py_variables_del`；確認 PC／MicroPython 共通語意並補雙語 tooltip。
- [x] [2026-09-25] 擴充 dictionary 操作：`get`、`items`、`del key`、`update`、`clear`；補建立、讀取、修改、刪除、列舉與清空的教學閉環。
- [x] [2026-09-25] 新增 set 操作：集合 literal、`add`、`discard`、`clear`、`union`、`intersection`、`difference`；空集合固定產生 `set()`。
- [x] [2026-09-25] 新增 `ui/src/modules/core/core_generators.test.mjs` 回歸測試，核心 generator 7/7 PASS；block_jsoninit 既有測試 PASS。
- [x] [2026-09-25] 修正 Variables 自訂 Blockly category callback 遺漏 `py_variables_del`：`custom="VARIABLE"` 會覆蓋 XML 內 block，已在 `ui/src/app/workspace.js::registerVariablesCallback()` 補入；`npm run build --prefix ui` PASS。
- [x] [2026-09-25] 建立核心積木契約驗證層：新增 `ui/src/modules/core/core_contract.test.mjs`，對帳 block/generator/toolbox、Variables dynamic callback、mutation、雙語 i18n、核心色碼、三主題 msgColours 與平台限制；契約 4/4、核心 generator 7/7、jsonInit 1/1、UI build、Extension compile 全通過。

### [2026-09-25] #task[MCU serial高頻寫入] MCU 高頻 Serial 輸出穩定性優化
- [x] 完成 Phase 0 壓力測試 harness：`temp_scripts/test_deploy_base_raw_dump.py`（Python 3/3 PASS）與 `ui/src/ui/terminal_batch.test.mjs`（Node 4/4 PASS）。
- [x] 完成 Phase 1 raw dump 開發旗標化：`resources/deploy/base.py` 移除每次 read 同步 open/write/close，改用 `_RawDumper` 有界背景線程（`COCOYA_SERIAL_RAW_DUMP` 預設關閉；隊列滿背壓丟棄計數；停止時優雅 flush）。同步至 `src-tauri/target/debug/resources/deploy/base.py`。
- [x] 完成 Phase 2 Rust 輸出聚合與背壓：`src-tauri/src/commands/mcu.rs` 抽出 `forward_stream_with_backpressure`（30ms 時間窗／4KB 批次累積／128 chunk 有界佇列／dropped bytes 警告注入／UTF-8 殘缺尾段修復／`emit_to` 精準單播）；`deploy_mcu` 與 `spawn_serial_monitor` 共同套用。
- [x] 完成 Phase 3 前端批次渲染：`ui/src/ui/terminal.js` 加入 `_terminalQueue` 有界隊列、`requestAnimationFrame` 批次 flush、1000 行限制、單節點字元長度防護（`MAX_SPAN_TEXT_LEN`）、`appendTerminalBatch` 與 `flushTerminal`，解決大量 DOM reflow 阻塞。
- [x] 完成 Phase 4 monitor/上傳交接：`SerialMonitorSession` 增加 `stopped: Arc<AtomicBool>`；`stop_serial_monitor` 採用 `kill_tree` + 等待 child exit + 100ms 驅動冷卻以徹底釋放 COM 埠；`set_window_focus` 加入部署與執行中防呆；視窗關閉清理對齊。
- [x] 完成 Phase 5 VSIX 相容性驗證：共用 `base.py` 性能提升，VSIX 原生 Terminal 不受影響，`npm run compile` 通過。
- [ ] 待實機驗證（待硬體）：Tauri ESP32-S3 / RP2040 30 秒高頻輸出 UI 響應性，以及停止後連續 10 次上傳成功率。


### [2026-09-25] #task[MCU 序列埠 Raw Dump 診斷切換] UI／Tauri／VSIX／Python 全鏈路
- [x] 工具列韌體設定新增 Raw Dump 開關，localStorage 持久化、鍵盤操作、中英文 i18n 與深色主題完成。
- [x] MCU 上傳／序列監看 payload 帶入 `rawDumpEnabled`；Tauri 與 VSIX 雙橋接同步完成。
- [x] Tauri 由視窗錨定 `current_paths` 推導 `<ProjectRoot>/raw_dump.log`，`SerialMonitorWant` 保存設定且 focus 重取前同步最新偏好；補 `toggle_serial_monitor` permission。
- [x] VSIX 新增跨 PowerShell／CMD／Bash 環境前綴產生器，上傳與 monitor 均寫入使用者 XML 專案根；未錨定時提前提示。
- [x] Python RawDumper 改為 ProjectRoot／工作目錄 fallback、啟動時截斷、寫入錯誤顯示；Python 4/4、UI 2/2、Rust 路徑 2/2、tsc／cargo／Vite 全通過。
- [ ] 待硬體／雙平台實機：Tauri seeded 範例與多視窗 focus 重取、VSIX 三種 shell 上傳／監看，並確認各專案根的 `raw_dump.log` 內容。

### [2026-09-25] #task[ESLint 工具鏈] Extension lint 設定恢復
- [x] 新增 `.eslintrc.json`，採用 ESLint 8 + `@typescript-eslint` recommended 規則。
- [x] 修正既有 unused import/argument、case declaration、prefer-const、non-null assertion 與 buffer null guard。
- [x] `npm run lint` 達到 0 errors／0 warnings；`npm run compile`、193/193 Node tests、`git diff --check` 通過。
- [ ] `npm test` 正式測試仍待補 `out/test/runTest.js` 對應的 VS Code 測試 harness；不屬於本次 lint 修復範圍。

### [2026-09-25] #task[測試入口分層] npm test 快速檢查與 integration 入口
- [x] `npm test` 改為 `npm run test:unit`（compile＋lint），移除重複 `pretest`。
- [x] 新增 `npm run test:integration` 與 `scripts/run-integration.cjs`，未建立 `out/test/runTest.js` 時顯示明確提示。
- [x] `npm test`、`npm run test:unit`、script syntax check、`git diff --check` 通過。
- [ ] 未來若需要 VS Code integration test，再新增 `src/test/runTest.ts` 與 test suite；不手動提交 `out/` 產物。

### [2026-09-25] #task[types 資料結構積木] 補齊 tooltip
- [x] 為 `py_type_list`、`py_type_dict`、`py_type_tuple`、`py_type_set` 加入中英文 tooltip。
- [x] 新增 `core_contract.test.mjs` 契約測試，四個資料結構積木的 tooltip 與 i18n key 必須存在。
- [x] core contract 5/5、types block syntax、Vite build、`git diff --check` 通過。

### [2026-09-30] #lint ui/ ESLint 清理與常設閘門
- [x] 清掉 `ui/src` 既有 49 項 lint 問題（154 檔），現況 **0 error**。
- [x] 建立 `ui/.eslintrc.json`：`eslint:recommended` 全基底 + 7 個 Cocoya globals + `ignorePatterns: ["*.min.js"]`。
- [x] `package.json` 新增 `lint:ui`，並接入 `test:unit`（`npm test` 全閘）。
- [x] 三條刻意關閉的規則（`no-control-regex`／`no-regex-spaces`／`no-empty`）已於 AGENTS.md 附設計原因。
- [x] 驗收：`npm test` 197/197 全綠。
- [ ] P2-6：`ui_components.js`（20.8KB）職責已被 `ui/panels.js`、`ui/thumbnails.js` 取代，本次僅移除 `index.js` 未用 import，**檔案本體仍待逐條比對呼叫端後刪除**。
- [x] T3 共用測試夾具：新增 `ui/test/{fakeDom,depsBuilder,fixtures}.js`，轉換 5 個 DM 測試檔；斷言零修改、197/197 全綠。
- [ ] T4：Python／Rust 測試納入（`temp_scripts/e2e_*.py` 轉 pytest、Rust 補 `file.rs`／`python.rs` 測試）
- [ ] T5：覆蓋率基準（c8，先產報告不設門檻）
- [ ] T6：CI 與 pre-commit（GitHub Actions + husky）

### [2026-10-01] #task[尺規/標註畫布/還原範例檔/LF 根治] 使用者回報批次
- [x] 十字尺規顏色即時更新：根因只掛 `onchange`（關閉取色面板才觸發），補 `oninput`。
- [x] bbox 框線依 P2 類別色上色：新增 `UICanvas.resolveBoxColor()`，注入 `UIComponents.getLabelColor`；選取中維持醒目青色（與類別色脫鉤）。
- [x] P3 標註頁移除「匯出資料集」按鈕（`annotation.js` ＋ `classification.js`）；匯出僅存在 P2。同步移除已無消費者的 `handleExportDataset` 注入。
- [x] 補齊尺規 i18n 鍵，並改正前綴（`ANNOTATION_*` → `DSM_ANNOTATION_*`，符合模組 `DSM_` 慣例）。
- [x] 修復 `dataset_theme_contract` 兩個失效自檢 + `typePolicy` 註解略過（根因：CRLF 的 `\r` 使替換無效，自檢恆不紅）。
- [x] 還原範例檔前端全鏈路（Tauri）：`index.html` 選單第 2 項（Python 環境設定之下）、`ui/base.js` 綁定、三橋 capability ＋ 方法、中英 i18n；VSIX 以 `supportsRestoreExamples:false` 隱藏。
- [x] 補 `capabilities` **值**守門（既有契約只比 key，誤設 VSIX 為 true 時 16 測全綠 → 假安全感）。
- [x] 新增 `.gitattributes`（`* text=auto eol=crlf` ＋ 二進位／vendored／產物例外）根治 LF/CRLF 混雜。
- [x] 驗收：272/272 測試綠、eslint 0 error、9 檔行尾全 CRLF；變異測試（尺規 `oninput`、`resolveBoxColor`、CSS 暗色守門、capabilities 值）皆報紅。
- [ ] **還原範例檔實機驗收**（需 Tauri release build）：選單位置、還原能救回被改壞的範例、VSIX 確實不顯示。`cargo check` 不保證 Release 權限註冊正確。
- [ ] `temp/` 殘留 3 個更早暫存檔待清：`_print_variant.html`、`print_variant.html`、`scan_t3.py`。
- [ ] `.gitattributes` 已於本次 commit 納入版控；後續若新增 `.sh` 腳本需另加 `eol=lf` 例外。

- [ ] T6：CI 與 pre-commit（GitHub Actions + husky）

### [2026-10-01] #task[T-scan] 測試計時器洩漏掃描（Stage 0 殘項）
- [x] 新增 `temp_scripts/t_scan.cjs`：40 個測試檔靜態掃描（計時器／handle／無 await 三級線索）。刻意只報「線索」不報「錯誤」——實測 4 筆中 2 筆為誤報，判定須人工確認。
- [x] 修正 `annotation.test.mjs` 真等待 `sleep(350)` → mock timers，並補邊界斷言（299ms 不觸發／300ms 觸發）。單檔 544 → 190ms。
- [x] 修正 `statusMessage.test.mjs` 真等待 ×5（30/60/70/80/70）→ mock timers，補 4 個邊界斷言。單檔 511 → 173ms，並移除已無使用者的 `sleep()` 死碼。
- [x] 變異測試兩項皆報紅：debounce 300→100 觸發「299ms 不應觸發」；移除 `clearTimeout` 觸發「舊計時器提前隱藏了新訊息」。
- [x] 誤報確認無害：`platform_restore.test.mjs` 的 `realSetTimeout`（try/finally 成對還原）、`bridge.test.mjs` 的 async 多餘。
- [x] 刻意保留 `bridge.test.mjs` 的 `TICK`（5ms ×3，跨微任務用途而非計時器，僅多 56ms）。
- [x] 驗收：272/272 綠（3 次取樣 1435/1080/1134ms）、eslint 0 error。
- [x] 使用者拍板 Batch 2 範圍：P1-3 CSS token 化、P2-7 標籤色主題化、P2-16 dark 補 msgColours。
- [ ] **Batch 2 執行**（待指示）：P1-3 + P2-7 + P2-16。P2-16 配色採「做法 1：沿用預設色相與飽和、僅降亮度」，並須推翻 `theme_contract.test.mjs` 第 4 測（該測試是 Batch 0 我替使用者判定「刻意」所寫，此次經使用者明確推翻）。candy 配色為淺底設計，不可直接沿用深底。
### [2026-10-01] #task[Batch 2 / P2-16] dark 主題補 msgColours（使用者已目視確認）
- [x] **推翻** Batch 0 由我代判的 `theme_contract.test.mjs` 第 4 測（原寫「light/dark 不宣告 msgColours 為合法」），改為「dark 與 candy 必須宣告、light 沿用預設色」。使用者目視回報深色刺眼 → 選 B。
- [x] `cocoya_dark.js` 新增 `msgColours` 38 鍵：OKLCH 換算，色相不變、彩度 ×0.88、亮度收斂到深底適配區間（>0.68 降、<0.66 提）。
- [x] 使用者目視後手動再調暗 8 鍵（STRUCTURE/CODING/AI_BASIC/AI_DRAW/AI_HAND/AI_FACE/AI_POSE/AI_INFERENCE），已更新主題檔註解記錄，標明「勿用初始公式覆蓋」。
- [x] 補 `cocoya_candy.js` 的 `SPIKE_SENSOR`（新守門抓出的既存缺口：candy 只有 SPIKE_SENSOR_COLOR，導致 SPIKE 主積木吃不到覆寫色）。
- [x] 守門兩次假綠：① 只驗「不得多出預設色外的鍵」→ 刪掉整個 SPIKE_MUSIC 覆寫仍全綠；② 補上「必須覆蓋全部預設色鍵」後才抓到（並連帶抓出 candy 缺口）。
- [x] 變異測試皆報紅：拼字錯誤（AI_INFERANCE）、缺整個覆寫（SPIKE_MUSIC）。
- [x] 驗收：theme_contract 4/4、全專案 272/272、ESLint 0 error、使用者目視 OK。
- [ ] **P1-3 暫緩**：稽核報告「144 個 hex」含 token 定義值，實際待處理 87 處（dark 區塊 44）。關鍵發現：`--dsm-*` 有**三套並存**來源（CSS :root ＋ CSS body.cocoya-dark-mode 區塊 ＋ 三主題檔 cssVars，各 34~35 鍵）。在確定收斂方向前做替換只是把混亂換位置。待主題系統重構方向確定後再處理。
- [ ] 主題系統重構（待決策）：三套並存問題如何收斂？建議先產出「只讀盤點報告」（誰是實際生效的那份、哪些衝突、可行的收斂方向），再動手。
### [2026-10-01] #task[Batch 2 / P1-3] 主題系統盤點與 token 收斂（使用者目視確認正常）
- [x] 只讀盤點（未動樣式）：確認 `theme_manager.js:179` 以 `document.body.style.setProperty` 把主題檔 cssVars 寫在 **body 行內樣式**，層級高於 `:root` 與 `body.cocoya-dark-mode` → 後兩者是死碼。主題檔 47 鍵＝唯一真正生效者。
- [x] 衝突僅 2 鍵（其餘 25 鍵等值）：`--dsm-error-bg`（CSS #3d1b1b / 主題檔 #2d1515）、`--dsm-warning-bg`（CSS #4a2333 / 主題檔 #2d1520）。這兩者回到主題檔值即為一直以來實際生效的值。
- [x] 執行收斂：刪除 `:root`(35 鍵) 與 `body.cocoya-dark-mode`(28 鍵) 兩死碼區塊共 59 行（1803→1737）。保留 `--dsm-font-scale`（51 處引用、三主題皆無、來自全域 `--fs-p2`）。
- [x] 稽核報告「144 個 hex」數字修正：該數字含 token 定義值，排除定義行與註解後實際待處理 **87 處**（dark 區塊 44 處）。
- [x] 移除「守門 1 自檢」（使用者決定，連續 6 次修復失敗後）。根因：`rules()` 以 `}` 切分，群組邊界由前一個 `}` 決定，任何替換都會讓配對錯位 → 無法構造真實回歸形狀。已於檔內留下移除理由與補回指引。
- [x] 附帶修掉真實缺陷：`rules()` 未排除 CSS 註解 → 檔頭註解含 `body.cocoya-dark-mode` 字樣與 `{` 會被當成選擇器項（假陰性來源）。已改為先移除註解再切分。
- [x] 驗收：dataset_theme_contract 6/6、全專案 271/271、ESLint 0 error、vite build PASS、使用者目視正常。
- [ ] **P1-3 未涵蓋範圍**：本次只刪 token 定義，**未處理正文硬編碼** —— 仍有 268 個 `body.cocoya-dark-mode` 規則塊（含 88 處硬編碼 hex）存在且生效。若日後要處理，那些規則直接寫屬性、與 token 無關，影響面需另行評估。
### [2026-10-02] #task[cocoya dark主題 token] P1-3 主題硬編碼：A 類（零視覺影響）收斂

#### 1. 先回答「這件事有沒有必要做」——重新量化後結論變了

上一輪（`d958cf4`）已刪掉三套並存的 token **定義**，但日誌 §15.3 明寫未涵蓋範圍：
`dataset_manager.css` 仍有 dark 覆寫規則直接寫字面值。

我實測後得到關鍵數字（先前計畫書寫的「144 hex」把 token 定義值也算進去了，不準）：

| 區段 | 規則數 | `var()` | 硬編碼 hex |
|---|---|---|---|
| light 基礎規則 | 154 | 138 | **43 處** |
| dark 覆寫規則 | 53 | 43 | **44 處** |

**真正的成本不是「難看」，是「不可達」**：dark 覆寫寫的是字面值，
而 `theme_manager.js:179` 是把 cssVars 寫在 `body` 行內樣式 —— 字面值不會被 cssVars 覆蓋。
故 `theme_manager.js:8` 宣稱的「自訂主題只需 `registerTheme({id, cssVars, blockly})` 即插即用」
在 Dataset Manager 這一塊**不成立**：新主題作者有 **87 個顏色摸不到**。

#### 2. 分類與本輪範圍（使用者決定）

| 類 | 數 | 意義 | 本輪 |
|---|---|---|---|
| **A** | 23 | dark 值與 light **同一個 `var()`** → 純冗餘，刪掉視覺零影響 | ✅ **本輪執行** |
| A? | 18 | dark 用 var 但 light 缺該屬性 → 需逐條判定 | ⏸ 不動 |
| B | 17 | dark 值 = 某 token 的 dark 值，light 端寫死別的值 | ⏸ 不動 |
| C | 31 | 無對應 token（`#00ccff` 選取高亮、`rgba(0,0,0,0.7)` 遮罩等） | ⏸ 不動 |

**B/C 類不做的理由（誠實記錄）**：C 類 token 化需新增 12~15 個變數 × 3 主題 = 40+ 個新值要維護，
收益只有「未來的第 4、第 5 個主題」才吃得到。若實際不會再做新主題，這部分是淨虧損。
故使用者選擇只做 A 類，B/C 留待真正要新增主題時再處理。

#### 3. 執行結果

- **58 行純刪除、0 行修改**（diff 全為 `-`，本身即安全訊號）：6 條規則整條刪、13 條規則各刪部分屬性行
- 檔案 1737 → 1679 行；CRLF 行尾保留；大括號 215/215 平衡

#### 4. 踩坑：變異測試**兩次失敗**，抓到的是「假安全感」

本次最重要產出不是那 58 行，而是下列三個真實 bug —— 全部靠「刻意破壞確認測試會紅」才浮現：

| # | 破壞方式 | 預期 | 實際 |
|---|---|---|---|
| ① | 刪 dark 規則時刪除範圍從 `{` 行起算 | 自檢報紅 | ❌ **報「自檢通過」並寫入壞 CSS** |
| ② | 守門 5 的 `parseRules` 把 `selStart` 設在 `{` 之後 | 抓到冗餘 | ❌ **靜默回傳空 = 假綠** |
| ③ | 守門 5 的 light map 只留**第一條**同名規則 | 抓到冗餘 | ❌ **漏放（自檢報紅才發現）** |

**根因①**：選擇器跨多行時，只刪 `{` 行起算會留下裸選擇器行。
但更關鍵的體認是 —— **裸選擇器行在語法上是合法的**：它會被「下一條規則的選擇器」接續起來，
只是讓該元素在 dark 下多吃到一條不該有的規則（靜默視覺回歸）。
所以「大括號平衡」「sel 是否以逗號結尾」等**語法層自檢都抓不到**，
判準只能落在語意上：「dark 有無重複宣告 light 已有的 var」。

**根因②③**：寫守門時複製了有 bug 的解析器。①②一起說明——
選擇器在 `{` **之前**；且規則是在 `}` 分支 push，`sel` 必須 `slice(selStart, openIdx)`
而非 `slice(selStart, i)`（`i` 此刻是閉合大括號，會把整個規則體吞進「選擇器」）。

#### 5. 新增守門 5（掃描型，已變異測試驗證有效）

`dataset_theme_contract.test.mjs` 新增 2 例（277/277 全綠）：
- **守門 5**：dark 區塊不得重複宣告 light 已有的同一個 `var()`
- **守門 5 自檢**：寫回一條冗餘 dark 規則 → 必須報紅（已實測 ✅ 紅）

自檢刻意**採用真實回歸形狀**（就是本輪刪掉的 6 條規則那種），不是憑空構造的變異。

#### 6. 驗收

```
dataset_theme_contract   8/8 綠（守門 5 +2）
全專案測試               275 → 277 綠
ESLint                   0 error
vite build               PASS (306ms)
變異測試                 寫回冗餘規則 → 守門 5 報紅 ✅
備份                     backup/dataset_manager_20261002_143159.css.bak
```

#### 4b. ⚠ 修正 4. 的「87 個」說法（2026-10-02 補，使用者提問後查證）

「淺色主題作者摸不到 87 個顏色」**對 candy 不成立**，勿沿用此數字。精確版本：

| 主題類型 | 受約束的硬編碼 | 原因 |
|---|---|---|
| **深色**（cocoya_dark） | 43（light 段）+ 44（dark 段）= **87** | 同時吃兩段 |
| **淺色**（cocoya_light / **cocoya_candy**） | **僅 43**（light 段） | dark 段選擇器是 `body.cocoya-dark-mode`，candy 不會命中 |

candy 之所以看起來正常，是 light 段那些值本身偏中性淺色，**淺色值疊淺色主題不刺眼**
—— 屬「意外正確」而非「架構正確」。實際仍有明顯走樣處，例如：
`.dataset-primary-btn:hover` = `#e91e63`（紅粉，candy 應為 `#FFE3F0`）、
`.dataset-annotation-item.selected` = `#00CCFF`（青，candy 是粉紫系統）。

#### 4c. ✅ 已實測確認並修復（2026-10-02）

**使用者實測結果：推論正確 —— VSIX ＋ VS Code 深色 ＋ candy 確實錯亂。**

每條 dark 覆寫的選擇器群組皆含 `body.vscode-dark` / `body.vscode-high-contrast`，
而這兩個 class **不由 Cocoya 控制** —— 是 VS Code webview 依使用者 VS Code 色彩主題注入的
（`theme_manager.js:141-142` 明確把它們當「外來訊號」讀取；
`theme_manager.js:173` 只切換 `cocoya-*`，從不主動增減 `vscode-*`）。

> **VSIX 模式 ＋ VS Code 深色 ＋ 選 candy**
> → body 同時帶 `vscode-dark` 與 `cocoya-light-mode`
> → 44 處 dark 字面值照樣生效，蓋掉 candy 的淺色 token

**為何深色主題從未暴露此 bug**：VS Code 深色 ＋ Cocoya dark 時兩套都生效**且都是深色**，
結果正確 —— 衝突被掩蓋。bug 一直躲在「看起來正常」的組合裡。

**修法**：在 vscode 選擇器加 `:not(.cocoya-light-mode)`，語意為
「VS Code 是深色，**且**使用者沒有明確選淺色主題」。

```css
body.vscode-dark:not(.cocoya-light-mode) X,   /* 新 */
body.vscode-dark X,                           /* 舊 */
```

| 檔案 | 選擇器處數 |
|---|---|
| `ui/src/style.css` | 42 |
| `ui/src/modules/dataset_manager/dataset_manager.css` | 122 |
| **合計** | **164** |

**為何不採「JS 移除 vscode class」**：
① `theme_manager.js:141-142` 的 `_detectSystemDark()` 正是讀這個 class 判定 auto 模式，
   移除會讓 auto 在 VSIX 失效；
② 不碰 VS Code 注入的 class → 不影響 VS Code 自身對它的使用。

**FOUC Guard 特別驗證**（`style.css` L1896-1909，作用於 body 本身）：
加條件**不影響防閃白目的** —— FOUC 階段 JS 尚未執行，body 上還沒有 `cocoya-light-mode`
→ `:not()` 成立 → 8 個變數照常定義；JS 執行後由主題檔 cssVars 經 `setProperty`
寫入行內樣式接手（行內樣式特異度高於該規則）。

**新增守門 6**（`theme_contract.test.mjs`，2 例，全專案掃描型）：掃遍 `ui/src/**/*.css`，
任何 `body.vscode-(dark|high-contrast)` 選擇器未帶 `:not(.cocoya-light-mode)` 即報紅。
變異測試：實際從 `style.css` 拿掉一個 `:not()` → 守門精確抓出 `style.css:101` ✅

**本次第三次「守門判準過寬／誤判」踩坑**（與前兩次同型，已寫進註解）：
初版判準是「行首去空白為 `body.`」→ 但我自己在 FOUC Guard 說明文字裡寫了
「`body.vscode-dark` 由 VS Code 注入且長駐…」這一行，被誤判成漏改，守門一開始就紅。
改為先剝除 CSS 註解再逐行比對（保留換行以維持行號）。

**⚠ 提交後立刻發現並修正的錯誤（2026-10-02，使用者回報 VS Code 語法錯誤）**

在 CSS 註解裡寫了 glob `ui/src/**/*.css` —— 其中的「星號＋斜線」兩字元序列被
CSS 解析器當成**註解結束符** → 檔頭註解提前中斷 → 後文被當選擇器解析 →
VS Code 報「L44 必須是 {」「L52 預期為 at-rule 或選取器」，整份樣式表從該處起解析異常。

- 同一個錯誤在 `.mjs` 的 JSDoc 註解裡**重演一次**：我為了記錄這件事而寫的說明文字，
  本身就含該序列 → 讓 `dataset_theme_contract.test.mjs` 當場語法錯誤
  （`node --check` 報 `Invalid regular expression`）。
- **CSS 與 JS 的註解是同一個陷阱**，且寫說明時特別容易再犯
  （要描述那個 glob 就得寫出那個 glob）。凡需舉例一律改用「星號＋斜線序列」
  這類描述性文字，不寫字面。

新增**守門 7**（`dataset_theme_contract.test.mjs`，2 例）：以「剝除所有註解後是否殘留
結束符」判斷註解是否提前閉合 —— 合法樣式表在剝除註解後不可能再出現該序列。
變異測試：於註解內注入 glob → 守門報紅 ✅

📌 **位置更正（2026-10-02 下半場）**：守門 7 **已移交**至 `theme_contract.test.mjs`
（全專案掃描版，3 例：註解提前閉合／大括號平衡／自檢）。原因：單檔版只掃
`dataset_manager.css`，漏掉 `style.css` 等其他樣式表；`dataset_theme_contract.test.mjs`
僅保留「大括號平衡」並在檔內留下移交理由與位置指針。

順帶修掉一個**既存的測試缺陷**：「大括號平衡」原本**不排除註解**就計數，
註解裡若出現大括號（例如引用編輯器錯誤訊息「必須是 {」）就會誤報。
本次因此誤報 216 / 215，一度讓我懷疑整份樣式表壞掉 —— 實際去註解後是 215 / 215。
已改為先剝除註解再計數。

#### 下次啟動方向 (Next Steps)
- **待實測（修後驗收）**：① VSIX ＋ VS Code 深色 ＋ candy（本 bug 正解）
  ② auto ＋ VS Code 深色（`:not` 應成立、維持深色）③ Tauri ＋ candy（無 vscode class，應無變化）
  ④ VS Code 執行中切換色彩主題（`theme_manager.js:225` MutationObserver 會重跑 `apply()`）
- B/C 類（light 段 43 + dark 段 44 處硬編碼）**下次處理**（使用者決定），屆時需先決定 candy 的新配色
  → **2026-10-02 下半場已處理 dark 段**（B 5／C 12 保留未動），light 段 43 處仍待處理；
  candy 新配色已代填三處（`--dsm-success-text`／focus-ring 強度／ok 邊框）待目視定案，見後段條目。
- 可考慮比照 P1-3 的方法，盤點 `style.css` 其餘硬編碼（P1-4，242 hex）
### [2026-10-02] #task[cocoya dark主題 token] P1-3 B/C 類 token 化 ＋ 守門升級（本次提交）

> 接續上方同日 A 類收斂（`f63d5f0`）。詳細敘述與技術深挖見 `log/work/2026-10-02.md` §2.3～§5。

- [x] **核心手法：把「dark 覆寫」換成「雙主題 token」**。實測發現 `--dsm-brand-soft`(0.15) 與 `--dsm-brand-strong`(0.3) 在三主題的值**完全相同** → 那 30 組 dark 覆寫從來不是「主題差異」，而是「深色底需要更明顯的 focus ring」。改為單一規則 ＋ 主題感知 token `--dsm-focus-ring`（light 0.15／dark 0.3／candy 0.3），dark 覆寫整組刪除。
- [x] 新增 **13 個 token × 3 主題**（cssVars 47 → 60 鍵）：`--dsm-error-border/-text`、`--dsm-warning-border/-text`、`--dsm-surface-raised/-sunken`、`--dsm-scrim`、`--dsm-border-subtle`、`--dsm-focus-ring`、`--dsm-shadow-brand`、`--dsm-autosave-indicator`、`--dsm-select-border/-bg`。light／dark 兩欄值 = 原本各自實際生效的字面值（逐一比對，視覺等價）。
- [x] 直接重用既有 token（不新增）：`#4a2a35` → `--dsm-btn-hover-bg`、`#4CAF50` → `--dsm-success-accent`／`--dsm-autosave-indicator`、`rgba(0,0,0,0.1)`/`rgba(255,255,255,0.2)` → `--dsm-border-subtle`。
- [x] 量化：`dataset_manager.css` 1710 → **1607 行**（淨減 103）；刪 129 行（選擇器 60 ＝ `:not()` 30 ＋ `body.cocoya-dark-mode` 30；屬性 46；括號 23）、新增 26 行（23 筆 token 取代 ＋ 3 行結構）。
- [x] **附帶清掉既存垃圾**：dark 覆寫群的 `body.cocoya-dark-mode …` 選擇器清單整組重複兩次。經 `git show 304d403` 比對確認**非 `f63d5f0` 造成**，是更早就有。
- [x] 守門 4 **判準升級**（`dataset_theme_contract`）：由「有沒有 dark 覆寫」這個**代理指標**，改為「dark 主題的**有效值**不得沿用淺色值」（解析 `var()` → 讀主題 cssVars 真值 → 逐顏色屬性比對）。舊判準在 token 化後會兩個方向都錯：把「全走雙主題 token、不需覆寫」的正確寫法誤判缺失，又放行「有覆寫但覆寫成同值」。
- [x] 守門 7 **由單檔移交全專案**（`theme_contract.test.mjs`，3 例：註解提前閉合／大括號平衡／自檢）；`dataset_theme_contract` 檔內留下移交理由與位置指針。
- [x] 自檢寫法修正：守門 4 舊自檢**照抄偵測邏輯**＝只驗複製品（真函式壞掉仍全綠）；改為直接呼叫被測函式 `stateDarkOffenders`，並用「效果等價」的追加變異（不採刪除既有規則——選擇器跨多行＋CRLF 曾吃過刪不乾淨的虧）。
- [x] 驗收：全專案 275 → **282** 綠（1.2s）、ESLint 0 error、vite build PASS、6 檔全 CRLF 無 BOM；變異測試（守門 4／5／6／7）皆確認會紅後還原。
- [ ] ⚠ **candy 三處刻意視覺調整待目視定案**（本次唯一無法用「視覺等價」證明者）：`--dsm-success-text` `#8A4A6A`→`#2F6B3C`（舊值與 `--dsm-dev-badge-text` 相同，疑為複製殘留）；`--dsm-focus-ring`／`--dsm-shadow-brand` 實際生效 `0.15`→`0.3`；ok 邊框 `#4CAF50`→`#FE2F89`（品牌色）。
- [ ] **dark 段剩餘 17 處**（B 類 5／C 類 12，原 B 17／C 31）：`.dataset-validation.ok` 深綠三件套、`.dataset-annotation-info` `#a0a0a0`、`.dataset-sampler-settings` `#999` 等，需再新增約 5~8 token。
- [ ] **light 段 43 處**硬編碼未動（與 A/B/C 同一「新主題摸不到」問題）。
- [ ] 📌 **位置更正**：上方同日條目寫「新增守門 7（`dataset_theme_contract.test.mjs`）」，**現已移交**至 `theme_contract.test.mjs`（全專案掃描版）；單檔版僅保留「大括號平衡」。


### [2026-10-01] #task[Batch 2 完成] P2-7 標籤色主題化 ＋ hover 高亮（使用者目視確認成功）
- [x] P2-7 起點用數據論證：實測 12 個常見標籤的 WCAG 對比度，舊實作（單一 HSL L=40~55%）**11 個低於 3.0**（7 淺底不足、4 深底不足）。單一明度不可能同時滿足兩種底色。
- [x] **關鍵設計**：框線與徽章分開處理。徽章畫在 UI 上 → 明度依主題（light 42／dark 62／candy 44）；框線畫在**照片上** → 明度**固定 52**（照片明暗與主題無關）。此問題由使用者提出「影像偏暗但淺色主題會有影響嗎」才浮現，若未提出會做出錯誤方案。
- [x] 框線雙色描邊（使用者選方案 A）：白色外框（粗，兼顧暗照片）＋ 標籤色內框（細，保留類別辨識），兩層互補不需判斷照片明暗。
- [x] 附帶修隱藏問題：晶片底板為深色，偏暗標籤色的色條看不見 → 改用 `lightenHsl()` 亮化 22%。
- [x] hover 高亮三態：hover（加粗 3px、維持標籤色）／selected（青色 4px）。**兩者狀態刻意分開**，共用會讓滑鼠碰到列表就洗掉選取。切圖時一併 reset；索引未變時不重繪。
- [x] hover 強化三迭代（使用者兩次回報「不明顯」）：加粗 → 光暈+6px&chip 底板 0.92 → **2Hz 慢速呼吸虛線＋流動**（使用者指定慢速）。常數 `HOVER_BLINK_HZ`／`HOVER_DASH`／`HOVER_HALO_MIN_EXTRA/MAX_EXTRA`。
- [x] Canvas 陷阱修正：`setLineDash()` 會重置 `lineDashOffset`，必須**先設 offset 再設 dash**，順序顛倒會讓流動效果完全看不到（由守門測試抓出）。
- [x] rAF 生命週期：hover 開始啟動、離開停止、**切圖停止**、**離開標註模式停止**（後兩者防洩漏與對已卸載畫布重繪）。以時間而非影格數推進，確保不同更新率下頻率一致。
- [x] 驗收：271 → **275 例**（+4）、eslint 0 error、4 檔行尾全 CRLF；使用者目視確認成功。
- [ ] **測試覆蓋限制**（使用者提問後盤點，如實記錄）：本次測試涵蓋「結構正確」，但**未涵蓋 rAF 是否真的在跑、時鐘是否隨時間前進、2Hz 實際節奏、動畫與拖曳是否衝突、效能掉幀** —— 這些只能靠實機目視。若日後要補，方向為 `t.mock.timers` 模擬時間推進 + rAF 生命週期測試。
- [ ] **事故教訓**：修改 `setLineDash` 順序時，編輯器對 `ui_canvas.js`（CRLF）反覆失敗，我改用 Python 行號替換，該腳本把兩行黏成一行（`ctx._dashTag` 與 `setLineDash` 整行消失）。這是**本次第二次因 Python 腳本改檔出事**（第一次清空三檔）。後續對 CRLF 檔案的行號替換優先用 Node（預設保留原行尾、不吃相鄰行）。

### [2026-10-01] Batch 2 整體狀態
- [x] P1-3 主題 token 收斂（`d958cf4`）— 使用者目視正常
- [x] P2-16 dark msgColours（`0b59329`）— 使用者目視確認並手動再調 8 鍵
- [x] P2-7 標籤色主題化 ＋ hover 高亮（本次）— 使用者目視成功
- [x] **P1-3 A 類已於 2026-10-02 收斂**：刪除 dark 區塊中「與 light 重複宣告同一個 var()」的 23 處屬性（58 行純刪除、視覺零影響），並新增守門 5 掃描型測試防止復發。
- [x] **VS Code 深色越權 bug 已實測確認並修復（2026-10-02）**：`body.vscode-dark`／`body.vscode-high-contrast`
  由 VS Code webview 注入且長駐，與 `theme_manager.js:173` 的 `cocoya-*`（互斥）並聯寫在同一批選擇器中，
  導致「VSIX ＋ VS Code 深色 ＋ 選 candy／light」時深色字面值蓋掉淺色主題（**使用者實測確認**）。
  修法：164 個 vscode 選擇器加 `:not(.cocoya-light-mode)`（`style.css` 42 ＋ `dataset_manager.css` 122）；
  不採 JS 移除 class，因 `_detectSystemDark()` 依賴它判定 auto 模式。新增守門 6（全專案掃描型）。
- [ ] **P1-3 B/C 類刻意不處理**（使用者決定）：light 段仍有 43 處、dark 段仍有 44 處硬編碼字面值。
  → **2026-10-02 下半場已部分推翻**：dark 段收斂至 **B 5／C 12**（新增 13 個雙主題 token、CSS 淨減 103 行、dark 覆寫整組刪除 30 組），
  見同日後段條目「P1-3 B/C 類 token 化 ＋ 守門升級」與 `log/work/2026-10-02.md` §2.3；**light 段 43 處仍未動**。
  ⚠ **勿用「87 個」概括**（2026-10-02 修正）：dark 段掛在 `body.cocoya-dark-mode`，淺色主題不命中，
  故**深色**主題受約束 43+44=87 處、**淺色**主題（light／candy）僅受約束 light 段 43 處。
  candy 看似正常是「淺色值疊淺色底不刺眼」的意外正確，仍走樣處如 `.dataset-primary-btn:hover` = `#e91e63`。
  B 類 17 處、C 類 31 處需 token 化，但 C 類要新增 12~15 變數 × 3 主題 = 40+ 新值，**收益只有真的要做第 4 個主題才吃得到**。
  → 待「確實要新增主題」時再啟動，屆時需先決定 candy 的新配色。
- [ ] **待實測（新發現）**：dark 區塊選擇器含 `body.vscode-dark`／`body.vscode-high-contrast`，
  該 class 由 VS Code webview 注入、非 Cocoya 控制。需實測「VSIX ＋ VS Code 深色 ＋ 選 candy」
  是否會讓 44 處 dark 字面值蓋掉 candy 的淺色 token（尚未確認，非已驗證缺陷）。
- [ ] P1-4 `style.css` 242 hex：可比照 P1-3 的分類法（設計常數／主題值／純冗餘）處理