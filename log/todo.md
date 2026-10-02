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
- [ ] T2 前置盤點：統計全部模組在五項對帳上的現存缺口，估算紅燈規模
- [ ] T3 前置盤點：列出六檔 fake DOM 差異點，確認最小抽象介面（getElementById／querySelector／classList／style／listeners／innerHTML／insertAdjacentHTML）

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
- [ ] P2-1 `ui/src/bridge/tauri.js`（93KB／70 處 invoke）拆 `bridge/tauri/{events,dataset,serial,files}.js`，`tauri.js` 退薄 façade＋`capabilities`；對外 API 不變，每搬一模組跑雙視窗實機
- [ ] P2-2 `ui_layout.js`（80.5KB）階段一刪除約 20 個純委派薄包裝（`enterClassificationReviewMode` L668 等，呼叫端直接取 controller）；階段二協調邏輯搬 `ui/orchestrator/*`；**不得破壞** `#dataset-structure-content` 嚴禁覆寫 innerHTML 契約，`renderStructurePanel()`／`renderStatsPanels()`／`refreshThumbnailBadges()` 介面不變

#### Batch 4（DM 四類型深化）
- [ ] P2-10 產出 `docs/dataset_types_matrix.md` 為四類型能力 SSOT（模式/標註/匯出/訓練/推論/已知殘餘）
- [ ] P2-11 **line_following 切分策略**：檢查 `line/*.txt`／`dataset.json` 是否有可作類別的欄位；有→依該欄位分層（重用 detector 分層函式）；無→維持隨機切但報告註明「回歸型」並回寫本條結論
- [ ] P2-12 **table 是否新增 live 採集**（決策項）：A 維持 file-only／B 新增（可重用 `ui/featurePanel.js` 相機骨架）
- [ ] P2-13 `spec.js` 直用 `t()` 42 處：`validate()` 先改回傳 `{code, params}`，文案上移 ui/application；分兩批
- [ ] P2-17 盤點 `docs/help/` 中英文 help 缺漏（多數僅 `zh-hant`）

#### Batch 5（後端／資源）
- [ ] P1-5 **安全**：`dataset_sidecar.py:37-40` 匯入時自動 `pip install paramiko` → 改為缺套件回報明確錯誤碼（比照 `FEATURE_MEDIAPIPE_MISSING`），前端 i18n 顯示指引；或加使用者同意開關＋指向 venv
- [ ] P1-6 逐條人工複核 Rust 15 處 `Command::new`（app 3／dataset 2／mcu 5／python 5）：確認無 shell 拼接、使用者輸入皆以 argv 陣列傳入，產出審查表
- [ ] P1-7 核對 `dataset_sidecar.py` 3 處 Popen（L40／L967／L1099）的 `encoding/errors`，補齊 AGENTS.md 四件套鐵律
- [ ] P2-3 `dataset_sidecar.py`（1138 行／19 def）拆分：內嵌 Python 字串腳本抽 `resources/dataset_manager/scripts/*.py`；`CameraService`／遠端訓練／TFLite 轉換各自成模組；維持 stdout 單一 JSON 回應契約
- [ ] P2-5 Rust 拆檔（**先不動**，待 tauri-codegen 議題合併處理）：`mcu.rs`→`mcu/{serial,board,monitor}.rs`；`file.rs`→`file/{ops,anchor}.rs`
- [ ] **T4** Python／Rust 測試納入：`temp_scripts/e2e_*.py` 轉 pytest（移除硬編碼路徑 `BALL = r'C:/Users/simfonia/Desktop/cocoya/dataset/ball'`，改 `tmp_path`／env）＋補 `sys.exit(1)`；Rust 補 `file.rs`／`python.rs` 測試（現全專案僅 3 個 `#[test]`）；`cargo test` 與 `pytest` 接入 `npm test`
- [ ] T4 前置盤點：8 支 e2e 腳本的相依套件（numpy／tensorflow／PIL）與執行時間，評估轉 pytest 順序

#### Batch 6（清理／收尾）
- [ ] P2-9 repo 殘留：3 個 `cocoya-*.vsix`、`nul`、`DATASET_MANAGER_PLAN.md`（**需使用者確認**才刪／移）；`.gitignore` 涵蓋 `*.vsix` 與 `nul`；確認 `test/project2~6.xml` 是否仍被 `temp_scripts/e2e_*` 引用
- [ ] P3-4 `FILE_STRUCTURE.md` 已有行號錯位（L18-19 處脫離樹狀縮排）→ 分段重排並去除行號；`log/COCOYA_STATE.md` §6 技術債合併指向本計畫
- [ ] P3-3 死碼掃描：`index.js` 匯出的 `removeAnnotation`／`refreshDynamicPanels`／`refreshPreview` 等是否仍被 `window.CocoyaDataset` 外部呼叫；`sampler.js`／`ui_canvas.js` 與新 `ui/samplerPanel.js`／`ui/annotation.js` 是否職能重疊
- [ ] **T5** 覆蓋率基準：加 c8，先只產報告不設門檻 → 連續兩週後依實際值收緊
- [ ] **T6** CI 與 pre-commit：GitHub Actions workflow（`node --test`／`tsc --noEmit`／`lint`／`cargo check`／`cargo test`／`py_compile`）＋ husky pre-commit 跑快速子集（**待決策**：CI 平台是否採 GitHub Actions）
- [ ] **T7** 高風險檔補契約測試（拆檔後）：`bridge/tauri.js` 拆檔後各子模組、sidecar 訊息協定（stdout 單一 JSON）。**Batch 0 已補前段**（anchor ＋ capabilities ＋ 快照／備份），拆檔後仍需逐子模組補
- [ ] **T8** 測試分類標註：區分**契約測試**（守設計：manifest／i18n／色碼／主題 token）與**行為測試**（守重構：controller／use-case），禁止只有後者

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