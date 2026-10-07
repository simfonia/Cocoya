# Cocoya 專案任務清單 (Todo List)
**專案名稱**：Cocoya (Code, Compute, Yield AI)
**核心目標**：以 Blockly 為介面，幫助 Python 初學者進入 AI 世界的 VSCode extension 與獨立桌面應用程式。

## [核心開發原則]
- **SSOT (單一事實來源)**：所有積木、產生器與前端邏輯統一存放於 `ui/src`，由 VSIX 與 Tauri 共享。
- **通訊抽象化**：前端一律透過 `CocoyaBridge` 與後端通訊，禁止在 UI 層直接使用環境專屬 API。
- **任務前快取現況**：先讀 `log/COCOYA_STATE.md`（現況快覽）再讀本檔對應章節；技術深層知識見 `log/KNOWLEDGE_BASE.md`；每日細節見 `log/work/`。

> **維護規範（2026-10-05 收斂）**
> - **已完成任務只留精簡一行**（`- [x] <一句話摘要> ✅ （細節見 log/work/<日期>.md）`），詳細敘述與踩坑一律寫入 `log/work/`；本檔不重複承載。
> - **實機測試／硬體驗證項目不再列於本檔**（含「待雙平台實機」「待實測」等）；需查時請看各任務日誌或計畫文件 §15.3。
> - **未完成的技術債保留原文**（`- [ ]`），不得刪除。
> - 本次收斂前完整原版：`backup/todo_pre_consolidate_20261005_*.bak`；整理腳本 `temp/scripts/todo_consolidate.py`。

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
- **實機驗證項已於 2026-10-05 全數移除**（依使用者指示）；需要時查 `log/plan/ComprehensiveAudit_2026-09-27.md` §15.3。

### [2026-10-02] DM P3 標註尺規 bug（已完成）
- [x] 滑鼠不在影像上尺規仍顯示 真因是 ui_canvas.js 的 mousemove 掛在 window （拉框拖出畫布仍要追蹤）＋ 座標… ✅ （細節見 log/work/2026-10-02.md）
- [x] 順帶修：ui_canvas.test.mjs 單行孤 CR 行尾（歷史遺留）→ 正規化 CRLF， git ls-files --eol… ✅ （細節見 log/work/2026-10-02.md）

### tauri-codegen 跨語言 invoke 契約（2026-10-05 **改以自建守門落地**，tauri-codegen 本身判定不適用）
> **結論：`tauri-codegen` 不適用於本專案**。實查 20 個 `#[tauri::command]` 中有 **10 個是跨行簽名**
> （rustfmt 換行，如 `start_sidecar` / `sidecar_send` / `export_dataset`），且參數含 `State<'_, T>`
> 生命週期與 `Window` / `AppHandle` 自動注入 —— tauri-codegen 依賴「單行簽名」正則解析，前提直接失效。
> **替代方案已落地**：`ui/src/bridge/invoke_params_contract.test.mjs`（6 測），以括號配對解析跨行簽名，
> 達成 tauri-codegen 的原始目標（參數缺漏在**測試期**發現，而非執行期 `invalid args`）。
- [x] 目標達成：command 參數缺漏在測試期被攔截 ✅（守門涵蓋 40 處帶參數 invoke × 20 command）
- [x] 處理 Tauri snake_case ↔ camelCase 自動轉換（`python_path` ↔ `pythonPath` 等）✅
- [x] 排除自動注入參數（window/state/handle/AppHandle/State）✅
- [x] 變異測試確認：改錯 `serialPort`→`serialPortTypo` 立刻報紅 ✅
- [ ] 後續可選：`docs/backend_api_manifest.md` Parameters 表改由本守門自動生成（省去人工同步；目前 manifest 僅記 command 清單與狀態，未含參數表，故優先級低）

### 遠端訓練與 SSH 整合（待辦, 未完項）
- [ ] **D5 文件同步收尾**（parity matrix / manifest / FILE_STRUCTURE / help）
- [x] **SSH/Sidecar 上傳流程整合** ✅（2026-10-05 實讀查證，原「待實作 backend==='remote' 分支」描述已過期）：VSIX `src/handlers/datasetOps.ts:331-396` `handleDatasetUploadArchive` 已完整實作（分片緩衝 `uploadBuffers` → 合併 ZIP → `sidecar.send('uploadDataset')` ＋ 錯誤處理）；遠端訓練分支 `trainingOps.ts:87-171` 亦已實作
- [ ] **Tauri 版 SSH/雲端訓練藍圖**（舊規劃細節見備份 todo.md_20260824「Tauri 版 SSH/雲端訓練實作藍圖」L560）：新增 ssh_sidecar.py(paramiko) + Rust ssh.rs 指令(check_remote_env/upload_dataset/start_remote_training/download_results) + DGX 流程(上傳→SSH 啟動容器→監控→下載)；訓練對話框後端選擇在 Tauri 啟用；SSH 帳密儲存(可考慮 tauri-plugin-store)
- [ ] 遠端推論 API 整合
- [x] **Tauri `datasetUploadArchive`** ✅（2026-10-05 實讀查證，原「空殼 _dispatchToFrontend」描述已過期）：`ui/src/bridge/tauri/transfer.js:60-100` 有完整實作（`dataset_upload_chunk` 分片落地 → `_datasetUploadChain` 併發鎖 → `_handleDatasetCommand('uploadDataset')`）；Rust `dataset.rs:468` 有 `dataset_upload_chunk`；sidecar `dataset_sidecar.py` ＋ `remote_ssh.py:329` 皆有 `uploadDataset`（SFTP 上傳 ZIP ＋ 遠端解壓）。**唯一殘留**：transfer.js:61 有無 else 的孤立 `{`（早期 else 分支移除後的殘骸，可順手清理）
- [ ] **容器化訓練腳本**：基於 DGX 鏡像（NGC nvcr.io/nvidia/pytorch ARM64）的訓練容器與模板

### 長期優化（待辦）
- [ ] **Plotter（序列繪圖）移植**：CodeBridge `ui/src/lib/plot/` 4 檔 55 KB → Cocoya `ui/src/modules/plot/`。零新增相依（自繪 Canvas，非 Chart.js）、零 Rust。唯一需改的是資料源（`CodeBridgeSerialMonitor` → Cocoya `UI.appendTerminal`）。**執行計畫見 `docs/plan/Plotter移植計畫.md`**（階段 A 純搬移／B 資料接線／C UI+主題+i18n／D 測試）。✅ **決策（2026-10-06）：VSIX 先不支援**（序列埠資料走 VS Code 原生終端、webview 無資料源），UI 依 `bridge.capabilities` 隱藏 plot 按鈕 —— **與 Editor 計畫共用同一條 caps 判斷**
- [ ] **純文字模式 ＋ 內建編輯器（TinkerCAD 式單向轉換）**：轉換後隱藏積木區、保留程式碼區（升級為可編輯）與虛擬終端，**不可逆**。採 `<pre>` 疊層高亮 ＋ `<textarea>` 輸入，**約 500 行、零新增相依**（不引入 CodeMirror/Monaco，遵循專案規範）。**執行計畫見 `docs/plan/Editor純文字模式計畫.md`**（階段 A 編輯器元件＋Python tokenizer／B 整合 codeArea／C 模式切換＋存檔／D 邊界守門）。✅ **決策（2026-10-06）：①存檔改 `.py` ②VSIX 先不支援**（VS Code 已有文字編輯器，直接開 `.py` 即可）
  - **進度（2026-10-06）**：階段 A ✅（三檔＋highlight 15 測＋三主題 8 token＋接線；變異測試驗守門有效）、階段 B ✅（`#codeEditor` 容器入 `#codeArea`，唯讀預覽零變動，build/lint/451 測全綠）。**待辦：C（caps 閘門＋確認對話框＋Blockly.dispose＋備份＋存 .py）、D（editor_contract 守門）**。詳見 `log/work/2026-10-06.md`
- [ ] 跨平台序列埠 Friendly Name（macOS/Linux；Windows 已有 VID/PID 映射）
- [ ] 重置韌體 esptool 整合為 Tauri Sidecar 的可行性評估

### Dataset Manager 三層重構收尾（殘餘項已併入上方 DM 節）
- [ ] 手動測試 backlog（log/plan/DatasetManagerManualTestBacklog.md：A2-1~A2-4、C1、U3-*、UI4-*）
- [ ] Stage 7 總驗證（compile/lint/cargo check+test/tauri build ＋ E2E 矩陣 §10）
- 剩餘長遠債已併入計畫、不再重複追蹤：`--dsm-*` dark/token → 計畫 §2 P1-3；`spec.js` 直用 `t()` → §6 P2-13；`ui_components.js` 職責重疊 → §5 P2-6
- 脫離 DM 範圍的孤立技術債（Tauri dev sidecar 路徑優先序、深色 prompt hover 白底、`.serial-dropdown-label` null）已收於計畫 §15.4，於此不重複追蹤。

### [2026-09-04] 模型檔本地轉換（已完成，follow-up）
- [ ] 重 build msi → 重測遠端訓練→本地 TFLite 轉換（int8 須重新產生；新參數加 _STRIP_KEYS）
- （評估債）遠端容器 TF 版本與本地對齊，根除跨版本序列化差異

### [2026-09-06] Try/Except 例外處理積木（已完成，未完項）
- [x] 收斂確認 BACKEND auto→local 遷移 ✅：`TRAINING_BACKEND`（key `cocoya_training_backend`）已納入 `ui/src/core/settings.js` SSOT（type string / default ''），舊工作檔值的 validator 攔截與遷移機制已落地 ✅

### [2026-09-27] #task[cocoya 全面檢查] 全專案稽核計畫（Stage 0 ✅／Batch 0 ✅／Batch 1 ✅）
> 計畫全文：`log/plan/ComprehensiveAudit_2026-09-27.md`（原 13 章節 ＋ **§14 Batch 0 執行結果** ＋ **§15 DM 殘餘收斂** ＋ **§16 Batch 1**）
> 範圍：全專案；DM 限 image／object_detection／line_following／table 四類型；特別檢查 i18n 與 3 主題。
> **執行順序決策：先做 Stage 0（TDD 守門），再動任何重構批次。** 理由：Batch 1~6 全是拆檔重構，無測試門檻等於沒有安全網。
> **進度**：Stage 0（T1／T-fast／P0-1／P0-2／P0-3／T2／T3 夾具）、Batch 0（P0-3 複核／P3-1／P3-2）、
> **Batch 1（P2-6-b／P1-1／P1-2／P2-6）**（2026-10-01）**已全數完成**。
> 全量測試 **194 → 240 例**（`npm test` 全綠）。**下一個可執行批次：Batch 2**。
> ⚠️ **T-scan**（掃描其餘測試檔的計時器／未 await handle）仍待辦，見下方 Stage 0 節。
> 基準（實測 2026-09-27）：`cd ui; node --test "src/**/*.test.mjs"` → tests 194 / pass 194 / fail 0（測試本體不差，問題是沒機制去跑）

#### Stage 0（TDD 守門，最高優先；完成前不得動 Batch 1~6）
- [x] T1（最低成本最高回報）package.json 新增 "test:ui": "cd ui && node --test \"src//… ✅ （細節見 log/work/2026-09-27.md）
- [x] T-fast（新增，2026-09-30） 分層守門：test:fast／test:dm／test:core／test:rust ＋ s… ✅ （細節見 log/work/2026-09-27.md）
- [x] T-scan 計時器洩漏掃描 ✅：40 檔靜態掃描完成，全量 272/272 綠（3 次取樣 1435/1080/1134ms）；掃描工具 `temp_scripts/t_scan.cjs` ✅ （細節見 log/work/2026-10-01.md）
- [x] P0-1 英文版 SPIKE 感測器積木無顏色 en.js 補 COLOUR_SPIKE_SENSOR_COLOR/_DISTANCE/… ✅ （細節見 log/work/2026-09-27.md）
- [x] P0-2 ui/src/zh-hant.js 缺 Stable Mode 三鍵 補 TLB_SETTINGS_SERIAL_UPLOAD… ✅ （細節見 log/work/2026-09-27.md）
- [x] P0-3 Blockly 內建鍵確認 zh-hant 獨有 6 個 BKY_*_VARIABLE* 屬 Blockly 本體提供的內建文… ✅ （細節見 log/work/2026-09-27.md）
- [x] 新缺陷（審查未涵蓋）：5 個 i18n 缺漏 — PY_COLON／PY_EQUAL（兩語系皆缺，導致積木欄位顯示 undefined）… ✅ （細節見 log/work/2026-09-27.md）
- [x] T2 契約測試全模組化 由 filter(id => id.startsWith('core/')) 改為涵蓋 core_manifes… ✅ （細節見 log/work/2026-09-27.md）
- [x] T3 共用測試夾具 ✅：`ui/test/{fakeDom,depsBuilder,depsStubs,fixtures}.js` 共 4 檔，實查已轉換 4 個 DM 測試檔（`annotation`／`classification`／`panels`／`statusMessage`）；驗收＝斷言零修改、197/197 全綠 ✅ （細節見 log/work/2026-09-30.md）
- [x] T2 前置盤點 結案：已被 T2 實際執行取代，無需獨立盤點 ✅ （細節見 log/work/2026-09-27.md）
- [x] T2／T3／T4 前置盤點 ✅ 結案：三者皆已被實際執行取代，無需獨立盤點 ✅ （細節見 log/work/2026-09-27.md）

#### Batch 0（無風險）
- [x] 待決策（2026-09-30 由 T2 浮現） 已於 2026-09-30 處理：py_ai_draw_rect_alpha（cv_dr… ✅ （細節見 log/work/2026-09-27.md）
- [x] 待決策（2026-09-30 調查結果：建議不上架） 已於 2026-09-30 依使用者決策走 A（誠實化）：Stable Mode… ✅ （細節見 log/work/2026-09-27.md）
- [x] 待決策（2026-09-30）ui/ 的 eslint 守門 已於 2026-09-30 解決：新建 ui/.eslintrc.json… ✅ （細節見 log/work/2026-09-27.md）
- [x] P0-3 確認 zh-hant 獨有 6 個 BKY_*_VARIABLE* 鍵 （Stage 0 T2）：屬 Blockly 內建，以… ✅ （細節見 log/work/2026-09-27.md）
- [x] P3-1 自動化守門 （Batch 0，計畫 §14.2）：i18n parity 已被 T2 取代（原「新增 i18n_parity.… ✅ （細節見 log/work/2026-09-27.md）
- [x] P3-2／T7 前段 補高風險檔測試 （Batch 0，計畫 §14.3，+30 例）：ui/src/bridge/tauri_anch… ✅ （細節見 log/work/2026-09-27.md）

#### Batch 1（低風險純重構）
- [x] P1-1 DM 類型判斷收斂 （計畫 §16.2）：typePolicy.js 補 ALL_TYPES／projectTypes()／i… ✅ （細節見 log/work/2026-09-27.md）
- [x] P1-2 單類型分支改走 typePolicy （計畫 §16.2）：countHeader 用 needsUnclassifiedCh… ✅ （細節見 log/work/2026-09-27.md）
- [x] P2-6-b capabilities 欄位集合不一致 （計畫 §16.1）：Tauri getter 補 isRemoteConnec… ✅ （細節見 log/work/2026-09-27.md）
- [x] P2-6 ui_components.js 職責重疊 （計畫 §16.3）：計畫前提已查證不成立 —— 查無可刪函式 ✅ （細節見 log/work/2026-09-27.md）

#### Batch 2（中風險視覺，需三主題目視）
- [ ] P1-3 `dataset_manager.css` token 化（**部分完成**）：A 類 23 處 ✅（2026-10-02）；dark 段 B/C 類已收斂（新增 13 個雙主題 token，CSS 淨減 103 行）✅（2026-10-02）；**仍待處理：dark 段剩 17 處（B 5／C 12）＋ light 段 43 處**，需再新增約 5~8 token × 3 主題
- [ ] P1-4 `style.css` 242 hex／51 var：先量化分類（工具列／積木區／DM／dialog），挑非 Blockly 內部區塊分 2~3 批 token 化
- [x] P2-7 `getLabelColor` 改為主題 token 取色 ✅：改走主題感知取色（`ui_canvas.js` `getLabelColor` ＋ `lightenHsl`），hover 三態與 rAF 生命週期一併完成 ✅ （細節見 log/work/2026-10-01.md）
- [x] P2-16 `cocoya_dark` 補 `msgColours` ✅：Batch 2 已補 38 鍵（OKLCH 換算），使用者目視後手動再調 8 鍵；並推翻 Batch 0 原判斷 ✅ （細節見 log/work/2026-10-01.md）
- [x] P2-15 中文 fallback 風險 ✅：4 處重複前綴（`DSM_DSM_*`）導致英文語系恆顯中文已修；另建 `t_call_contract.test.mjs` 守門（6 測，mutation 驗證 4 次全會紅） ✅ （細節見 log/work/2026-10-04.md）

#### Batch 3（中風險架構，多視窗／emit_to 高危）
- [x] P2-1 ui/src/bridge/tauri.js 拆檔 （拆檔全階段完成） - 成果：tauri.js 1865 → 882 行 ✅ （細節見 log/work/2026-09-27.md）
- [ ] **P2-2 / S1~S5 `ui_layout.js` 拆分（ui_layout 單一 SSOT｜2026-10-05 合併原 Batch 3 P2-2 與 2026-09-17 切片條目）**
  **⚠️ 狀態：暫緩施工 PAUSED（使用者拍板先不動）**。實查現況（2026-10-05）：**1891 行 / 72 個內部函式**；`ui/orchestrator/` 資料夾**不存在**。四層架構（core/io/ui/application）已建立但 `ui_layout.js` 仍是繞過該架構的旁路 —— 這是 DM 目前最大的架構債。
  **⚠️ 2026-10-05 實查後重新評估：原「階段一」效益極低，已建議不做（使用者同意）**
    - 死碼掃描結果：**無死碼**。僅定義未使用的函式 0 個、未使用頂層 const 0 個、重複函式定義 0 個、註解掉的程式碼 0 處；8 個匯出符式全部有外部使用（2~7 處）。此檔已被反覆清理過，**「移除死碼」無對象**。
    - 階段一（刪薄包裝）實際成本：18 個候選，但每個有 **2~4 處內部呼叫點**，刪除須同步改動 **40+ 處**，僅減約 100 行（5%）。**風險遠高於收益**。
    - S4（`bindModalEvents`，最大函式 190 行）依賴 **16 個本檔符號**（含 `refreshTimeout` 可變狀態、`state`/`Sampler`/`refreshPreview`/`backToEntry`），搬移需注入 16 個依賴 → **新檔比原函式更難懂**，屬依賴注入反模式。
  **✅ 2026-10-05 已完成零風險子集**：補齊檔頭 SSOT 註解（44 行，純新增、**零邏輯變更**），明載職責邊界／四層對應／新增功能紀律／已知架構債與其不做的理由／契約紅線。驗收 `node --test` 428/428 綠、ESLint 0 error、diff 僅 `44 insertions(+)`。
  **階段二（高風險，維持暫緩）**：協調邏輯搬 `ui/orchestrator/*`。
  **S1~S5 切片順序**（預估 1823 → S1~S4 約 1330 → 含 S5 約 1150；動工前置 SSOT 見 `log/plan/DatasetManagerTypeLockedWorkflow.md` §11）：S1 `application/specSync.js`（syncSpecFromUI）／S2 `application/progressApply.js`（applyLoadedProgress）／S3 `ui/navigation.js`（P1/P2/P3 導航）／S4 `ui/modalEvents.js`（bindModalEvents）／S5 `application/imageSamples.js`（handleDeleteImage→addSampleFromSampler）。
  **明確不做**：硬拆 `refreshDynamicPanels`、刪仍被呼叫的 wrapper。
  **不得破壞的契約**：`#dataset-structure-content` 嚴禁覆寫 innerHTML；`renderStructurePanel()`／`renderStatsPanels()`／`refreshThumbnailBadges()` 介面不變（見 AGENTS.md「Dataset Manager 結構面板與縮圖同步契約」）。

#### Batch 4（DM 四類型深化）
- [x] G1 feature 積木入口 — 階段 1 完成 （使用者決策：分兩階段）： 階段 1（本次，已完成）： ① 先實測後端（temp_s… ✅ （細節見 log/work/2026-09-27.md）

- [x] G2 serial 映射 — 決策保留預留位 （使用者決策 B）： 查證：isDevType('serial') === true（ty… ✅ （細節見 log/work/2026-09-27.md）

- [x] task type 下拉重複合併＋命名不一致顯式化 ① 下拉兩份重複 → 合併為 TASK_TYPE_OPTIONS 單一 SSOT（見… ✅ （細節見 log/work/2026-09-27.md）

- [x] P2-10 產出 docs/dataset_types_matrix.md 為四類型能力 SSOT （模式/標註/匯出/訓練/推論/已知… ✅ （細節見 log/work/2026-09-27.md）
- [x] P2-11 line_following 切分策略 （查證結案，結論：無類別欄位 → 回歸型，維持隨機切「符合鐵律」，無需改分層）： 證… ✅ （細節見 log/work/2026-09-27.md）
- [ ] P2-12 **table 是否新增 live 採集**（決策項）：A 維持 file-only／B 新增（可重用 `ui/featurePanel.js` 相機骨架）
- [x] P2-13 `spec.js` 直用 `t()` 42 處 ✅：spec.js 16 處改回傳 `{code, params}`，文案上移至 `application/validationMessages.js`；建 `validation_layer_contract.test.mjs`（7 測）＋ spec.test.mjs 改斷言 code ✅ （細節見 log/work/2026-10-04.md）
- [ ] P2-17 `docs/help/` 中英文缺漏（**⏸ 延後處理｜2026-10-05 使用者決策**）：盤點已完成 —— 僅 `hardware_pins`／`py_ai_pose_calc_angle`／`py_ai_train_run`／`py_try_except` 有 en；缺 en 者 10 個：`py_ai_get_bbox`／`_confidence`／`_direction`／`_label`／`_line`／`_line_angle`／`_line_end`／`_line_offset`／`py_ai_model_init`／`py_ai_model_predict`。**延後理由**：中文 help 內容仍可能因功能調整而變動，此時補英譯將產生立即過期的重複維護成本；待中文 help 內容穩定後再一次性補齊。

#### Batch 5（後端／資源）
- [x] P1-5 安全：dataset_sidecar.py 匯入時自動 pip install paramiko （採計畫首選「純降級回報錯誤… ✅ （細節見 log/work/2026-09-27.md）
- [x] P1-6 逐條人工複核 Rust 15 處 Command::new（app 3／dataset 2／mcu 5／python 5）Ru… ✅ （細節見 log/work/2026-09-27.md）
- [x] P1-7 核對 sidecar 3 處 Popen 的 encoding/errors 實查後已全部符合，隨 P1-5 一併結案 （L9… ✅ （細節見 log/work/2026-09-27.md）
- [x] P2-3 dataset_sidecar.py 拆分 （1206 行 → 主檔 499 行，拆出 5 個模組） 計畫前提修正：原文要求抽… ✅ （細節見 log/work/2026-09-27.md）
- [x] P2-5 Rust 拆檔 （原標註「先不動，待 tauri-codegen 合併」 ✅ （細節見 log/work/2026-09-27.md）
- [x] T4 Python／Rust 測試納入 ✅：e2e 11 支 pytest（`tests/e2e/`，含 conftest.py 的 sys.path 注入；`pyrightconfig.json` extraPaths 指向 `resources/train_templates`）＋ Rust 3 支 integration（`src-tauri/tests/{serde,command_registration,multi_window_emit}.rs`）；`npm test` 已含 `test:rust`，另設 `npm run test:python`（分層刻意不併入 `npm test`） ✅ （細節見 AGENTS.md「測試執行分層守門」）

#### Batch 6（清理／收尾）
- [x] P2-9 repo 殘留 （使用者授權全刪） 實查結論（計畫原文的假設需修正）：.gitignore 早已涵蓋 *.vsix／nul／t… ✅ （細節見 log/work/2026-09-27.md）
- [x] P3-4 FILE_STRUCTURE.md 重排 + log/COCOYA_STATE.md §6 合併 計畫描述與實況有落差：計畫寫… ✅ （細節見 log/work/2026-09-27.md）
- [x] P3-3 死碼掃描 （結論：3 個待查匯出中 2 個為死碼，1 個是活的） 跨端檢索（ui/src＋ui/index.html＋docs… ✅ （細節見 log/work/2026-09-27.md）
- [x] T5 覆蓋率基準 ✅（只產報告，未設門檻，符合 T5 階段一設計）：`scripts/coverage.cjs` ＋ `coverage/baseline.json` 已納入版控＋ `npm run coverage`／`coverage:check` ✅ （細節見 log/work/2026-09-27.md）
- [x] **T6** CI 與 pre-commit ✅：`.github/workflows/ci.yml` ＋ `.husky/pre-commit` 已建立 ✅ （細節見 AGENTS.md）
- [x] **T7** 高風險檔補契約測試 ✅（Batch 0 已補前段；2026-10-05 實查：`tauri_upload_chain.test.mjs` 已覆蓋 transfer.js 的 `_datasetUploadChain`、`tauri_progress_anchor.test.mjs` 覆蓋 progress.js 錨定、`tauri_send_dispatch.test.mjs` 覆蓋 dispatch；sidecar 端 `sidecar_stdout_contract`／`sidecar_module_split`／`sidecar_dependency_contract` 齊備） ✅
  - **前置已達成（2026-10-03）**：P2-1 拆檔完成，`tauri/` 下已有 11 個子模組可獨立測試。
  - ~~仍需逐子模組補：優先 `transfer.js`／`progress.js`~~ ✅ **已補**（見上一條，2026-10-05 實查確認）。
  - 殘餘：其餘 9 個子模組尚未逐一模組，屬選配強化（非風險閘門）。
- [ ] **T8** 測試分類標註：區分**契約測試**（守設計：manifest／i18n／色碼／主題 token）與**行為測試**（守重構：controller／use-case），禁止只有後者
  （**本批已補兩個契約測試**：`file_structure_contract`（文件契約）與既有 `sidecar_module_split`）

#### 待決策（2026-10-01 Batch 0 浮現；詳見計畫 §14.5）
- [ ] **P2-16 `cocoya_dark` 缺 `msgColours` 是刻意或疏漏**：Batch 0 已依 AGENTS.md「新增積木模組檢查清單」第 2/3 點判定為**符合設計**（根 `zh-hant.js`/`en.js` 的 `COLOUR_*` 才是預設色 SSOT，主題 `msgColours` 為選配覆寫），並把此判斷**釘進 `theme_contract.test.mjs` 第 4 測**。⚠️ 若使用者認為應是疏漏，需推翻該測試改為要求 dark 有覆寫
- [x] isRemoteConnected 在 Tauri capabilities 未回傳 使用者決策：併入 P2-6-b 處理（Tauri… ✅ （細節見 log/work/2026-09-27.md）
- [x] supportsStableMode 死欄位 使用者決策：併入 P2-6-b 處理（刪除 base.js／tauri.js／vsix.j… ✅ （細節見 log/work/2026-09-27.md）
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
- [x] SPIKE Prime：detect_board_id(0694:0009→spike-prime) + board_defs 條目（空… ✅ （細節見 log/work/2026-09-09.md）
- [ ] （未來里程碑）Pybricks 韌體支援：WinUSB 傳輸層（nusb/rusb + Pybricks USB 協議）+ 「偵測到 LEGO hub 但無 COM」UI 提示（引導刷官方韌體或用 code.pybricks.com）
- [x] SPIKE 支援凍結（實驗性）：現況說明 log/plan/SpikeSupportStatus.md（含決策理由、已完成清單、已知限制… ✅ （細節見 log/work/2026-09-09.md）
- [x] 上傳 RP2040 終端只顯示「OK」而非 complete_banner：根因「OK」為 Raw REPL 執行成功之韌體標記 ✅ （細節見 log/work/2026-09-09.md）
- [x] 上傳 RP2040 空行不穩定復現（根治）：Raw REPL 換行 b'\r\n' 與內文分批到達、時序漂移 → 空行位置每次不同 ✅ （細節見 log/work/2026-09-09.md）

## 2026-09-13
- [x] 校訂 py_ai_train_run 教學文件第 1~6 頁觀念（模型=架構+參數、Loss 定義、谷底=平均損失） ✅ （細節見 log/work/2026-09-27.md）
- [x] 新增第 7 頁交叉熵簡介頁，後續頁碼 +1（全 23 頁） ✅ （細節見 log/work/2026-09-27.md）
- [ ] 可選後續：第 14 頁骨幹頁可回頭呼應「模型=架構+參數」；交叉熵頁可再補 softmax 歸一化的簡短說明。

- [x] DM P2 live 三 bugs 修正（X 關窗回位＋自動掃描＋黑區改最近一次拍攝 B 方案）——日誌 log/work/2026-0… ✅ （細節見 log/work/2026-09-14.md）
- [x] Sidecar 啟動失敗友善提示：Rust start_sidecar 路徑驗證＋700ms 存活檢查 ✅ （細節見 log/work/2026-09-14.md）
- [x] Python 環境設定整合：toolbar/首頁兩入口合併為單一「Python 環境設定」視窗（diagnose-modal 擴充路徑列… ✅ （細節見 log/work/2026-09-14.md）
- [x] Python 環境設定安裝流程重構（問題：pip 進度在 modal 背後看不到＋安裝完不會更新為已安裝） ✅ （細節見 log/work/2026-09-15.md）
- [ ] [2026-09-15] （選）停滯偵測「300 秒建議中止」文案；docs/system_spec.html 與 README 若提及舊終端機安裝流程需同步更新
- [x] ：①toolbar 專案名標籤點擊 → 系統檔案總管開啟專案目錄（base.js currentProjectRoot + initTo… ✅ （細節見 log/work/2026-09-15.md）
- [x] 實機回饋三項：①Tauri 點專案名開到「文件」——根因前端送正斜線路徑、explorer 無法辨識 ✅ （細節見 log/work/2026-09-15.md）
- [x] 字級縮放拆畫面（5 變數 baseline=1 + calc 全面化）：新增 ui/src/font_scale.css（--fs-h/… ✅ （細節見 log/work/2026-09-16.md）
- [ ] [2026-09-16] 字級 UI 化（**⏸ 延後處理｜2026-10-05 使用者決策**）：設定面板 + localStorage 覆寫 :root 5 變數（架構已預留，零元件 CSS 改動）；破版收斂：把該畫面容器 height/padding/line-height 綁同一變數；T1~T5 畫面（diagnose modal/通用 modal/序列埠監看/AI modal）字級待指示。**延後理由**：先前實作過程發生不易解決的問題，已改用**硬編碼**暫時解決；待該問題有明確解法後再恢復此項。
- [x] 追加修正（同日）：dataset_manager.css 43 處 font-size 補上 calc(Npx * var(--dsm-… ✅ （細節見 log/work/2026-09-16.md）
- [x] 追加修正（同日）：dataset_manager.css 43 處 font-size 補上 calc(Npx * var(--dsm-… ✅ （細節見 log/work/2026-09-16.md）
- [x] 實機回饋 H/E：H（1.2）OK ✅ （細節見 log/work/2026-09-16.md）
- [x] P2 UI 版面優化（live 標籤管理收斂＋啟動預覽獨立行）：ui_components 刪除右欄新增標籤 UI（+鈕/輸入列/set… ✅ （細節見 log/work/2026-09-16.md）
- [x] P2 匯出鈕移至上方清除鈕左側：modal.js header 新增匯出鈕（dataset-secondary-btn＋與清除鈕相同行內… ✅ （細節見 log/work/2026-09-16.md）
- [x] ：Tauri MCU 四 spawn 補 PYTHONIOENCODING/PYTHONUTF8（deploy/monitor/eras… ✅ （細節見 log/work/2026-09-16.md）
- [x] 追加：黑窗修復——mcu.rs 全 5 個 spawn（setup-stable/deploy/monitor/erase/esptoo… ✅ （細節見 log/work/2026-09-16.md）
- [x] ：lifecycle _restoreReloadSnapshot 原本無條件 setDirty(true)——首頁未命名乾淨專案切語系… ✅ （細節見 log/work/2026-09-16.md）
- [x] 追加：_restoreReloadSnapshot 成功結尾誤回布林 true（true.isDirty=undefined→dirty… ✅ （細節見 log/work/2026-09-16.md）
- [x] ：分類/live「尚未指定 Label 欄位」誤導訊息——影像類標籤在每張樣本（schema.label 不適用），spec.js va… ✅ （細節見 log/work/2026-09-16.md）
- [x] ：①Part A 縮圖徽章即時刷新——ui_layout 新增 refreshThumbnailBadges 掛 onLabelMapC… ✅ （細節見 log/work/2026-09-16.md）
- [x] ：①拍照後中欄標籤管理 UI 消失——根因 addSampleFromSampler/handleDeleteImage 仍以 rend… ✅ （細節見 log/work/2026-09-17.md）
- [x] DM 契約補登（#task[DM P2 標籤管理UI消失] 後續）：①#dataset-structure-content 為複合容器、… ✅ （細節見 log/work/2026-09-17.md）
- [x] 物件偵測 dataset 對齊影像分類（P0-P4 完成）：P1 sidecar 匯出期 staging 加建 images/（扁平化… ✅ （細節見 log/work/2026-09-22.md）
- [ ] DM ui_layout.js 精簡切片（S1~S5）→ **已合併至 Batch 3「P2-2 / S1~S5 ui_layout.js 拆分」單一 SSOT（2026-10-05），不再於此重複追蹤**
- [x] DM 資料集名稱漂移政策「方案 A」：core/projectNaming.js 新增 detectDatasetNameDrift／d… ✅ （細節見 log/work/2026-09-17.md）
- [x] [2026-09-17 → 2026-10-02 查證結案] 匯出 staging 路徑驗證（原 backlog：查無此 bug，兩項疑… ✅ （細節見 log/work/2026-09-27.md）
- [x] ：第 13 頁 SVG 雙圖（⛰️ 學習率）以使用者手調「第1~3步=12」為最小值等比放大（k=12/9.5：9.5→12、10→12… ✅ （細節見 log/work/2026-09-17.md）

- [x] ：Logic toolbox.xml 帶 UTF-8 BOM → DOMParser 報 'Unexpected characters… ✅ （細節見 log/work/2026-09-17.md）

- [x] ：2空格設定下函式內 if 不縮排——根因 py_function_def 將「已套用當前 INDENT 的 statementToCo… ✅ （細節見 log/work/2026-09-17.md）

- [x] ：Tauri examples 與安裝目錄寫入權限解耦——setup 呼叫 ensure_examples_seeded（Resourc… ✅ （細節見 log/work/2026-09-17.md）

- [x] 追加：AppData seeded examples 開啟仍被要求複製到桌面——resolve_example_open_path 與… ✅ （細節見 log/work/2026-09-17.md）

- [x] 追加：關閉重開後開範例又回到 Program Files——get_examples_path dev 分支僅以 current_dir… ✅ （細節見 log/work/2026-09-17.md）

- [x] 追加：二次啟動仍落回 Program Files——seeded 判定放寬（戳記或目錄非空皆算播種，防 merge 中途失敗戳記永不寫）… ✅ （細節見 log/work/2026-09-17.md）

- [x] Examples 播種 AppData 實機驗證 PASS（使用者確認）：捷徑二次啟動開範例導向 AppData 副本 ✅ （細節見 log/work/2026-09-17.md）

- [x] 腳位無法解析根因＝Blockly 產生器不可見 ID 標記污染：utils/generators.js 的 scrub_ 為所有具 ou… ✅ （細節見 log/work/2026-09-18.md）
- [ ] [2026-09-18] backlog（可選）方案 B：讓 value 積木的 ID 標記不流入產生器邏輯（治本；須先驗證 `ui/src/ui/renderer.js` 的 extractIds/lineIndexToBlockId 高亮同步不依賴 value 標記）

- [x] 計畫1：mcu_huskylens 模組升級 V1/V2 通用——init 積木加版本(V2/V1)+匯流排(I2C/UART)下拉 ✅ （細節見 log/work/2026-09-19.md）

- [x] 追加：mcu_huskylens Tier 1 積木擴充（6→15 塊）——新增 count / get_id_at / get_nam… ✅ （細節見 log/work/2026-09-19.md）
- [ ] [2026-09-19] backlog（HuskyLens Tier 2）：螢幕繪圖（draw_rect 0x26 / draw_text / clear_draw）、拍照存 SD（take_photo 0x20）、演算法參數讀寫（get_algo_param 0x02 / set_algo_param）
- [ ] [2026-09-19] backlog（HuskyLens Tier 3）：多演算法組合（set_multi_algorithm 0x0C + set_multi_algorithm_ratio 0x0D，大記憶體板限定）、私有資料欄位精選（臉五官 / 手 21 點 / 姿態 33 點）
- [x] [2026-09-19] backlog：mcu_huskylens UART 讀取改為分片累積迴圈 ✅ **2026-10-05 完成**。原缺陷：`_read_some()` 單次 `any()/read()`，`_parse()` 遇 `tail >= n`（半幀）直接 `i += 1` 跳過 → 資料量大時**靜默截斷**。修正：①`_read_some` 改為「讀→累積→再讀」迴圈，終止條件以 `wait_ms` 推導而非固定輪數（固定 24 會在 >24×chunk 時提前中止，測試實測抓到 216 bytes 只累積到 192）；②`_parse` 回傳已完整消耗位元組數，尾端半幀存入 `self._rbuf` 跨呼叫接續；③新增 `_parse_drain()` 供 `request_all` 使用，`learn()` 同步改走新路徑。驗收：`tests/e2e/test_huskylens_uart.py` 5 測全綠（`node --test` 422/422、ESLint 0 error、eol 通過）；**變異測試確認**：還原舊單次讀取邏輯後 2 測報紅

- [x] 追加：mcu_huskylens V1 協定修正 + get_arrow 擴充 + 文案/工具箱重整——修正 V1 五個錯誤（幀頭 55… ✅ （細節見 log/work/2026-09-19.md）
- [ ] [2026-09-19] backlog（HuskyLens V1 指令）：V1 官方協定有 REQUEST_ALGORITHM(0x2D，**編號與 V2 不同**：人臉0/追蹤1/辨識2/循線3/顏色4/標籤5/分類6)、REQUEST_LEARN(0x36 帶 ID)、REQUEST_FORGET(0x37)、REQUEST_CUSTOMNAMES(0x2F)；需獨立編號對照表後實作
- [ ] [2026-09-19] backlog（HuskyLens 文件）：`docs/help/mcu_huskylens_*.html` 尚未建立

- [x] 追加：H5 py_ai_* 循線推論實作（世界 B 斷點修復）——_follow_line 由「invoke 後直接回 directio… ✅ （細節見 log/work/2026-09-19.md）
- [x] H6（V2 風格單點標註）依使用者裁示不做（會失去 D 項航向資訊、與 Dense(4) 回歸頭不符 ✅ （細節見 log/work/2026-09-19.md）

- [x] 啟動時 ReferenceError: Input "RESULT" doesn't exist on "py_ai_get_line_… ✅ （細節見 log/work/2026-09-22.md）
- [x] 待實機驗證（#task[HuskyLens 循跡模組除錯] 修正後）：①MicroPython 平台啟動＋還原 PC 備份 → 應自動切… ✅ （細節見 log/work/2026-09-22.md）
- [x] [2026-09-22] 「XML → 工作區」入口盤點 ✅：`ensurePlatformForXml` 呼叫點已存在（`lifecycle.js` L328/330/342、`persistence.js` L112/134）✅ （細節見 log/work/2026-09-22.md）

- [x] Round 2（真正根因）：Round 1 平台順序修正後仍爆 Input "RESULT" doesn't exist → 加埋取證/… ✅ （細節見 log/work/2026-09-22.md）

- [x] 測試回饋：①中欄統計補「影像張數/已標註」摘要（stats/i18n/CSS/呼叫點，149/149）②匯出 ZIP 去除 <label… ✅ （細節見 log/work/2026-09-27.md）

- [x] C2 訓練端雙佈局：detector_dataset.py/line_dataset.py 加落盤 fallback（images/ 不… ✅ （細節見 log/work/2026-09-23.md）

- [x] 測試回饋二：①遠端 pull denied→sidecar docker run 前映像 inspect＋cocoya-train-cl… ✅ （細節見 log/work/2026-09-23.md）

- [x] 測試回饋三：①偵測補「各類別樣本數」逐類 log＋不平衡警告（≥3 倍）——分層報告本有、IoU 曲線回饋二已有 ✅ （細節見 log/work/2026-09-23.md）

- [x] 偵測訓練曲線補 MAE 面板：plot_detector_curves 由固定 2 圖（Loss/IoU）改為依 history 欄位動… ✅ （細節見 log/work/2026-09-24.md）

### [2026-09-25] Python 語法積木群稽核後續
- [x] 完成稽核報告：log/plan/PythonBlocksAudit_2026-09-25.md ✅ （細節見 log/work/2026-09-25.md）
- [x] py_io_serial_flush 補 MicroPython 分支：以 sys.stdin + uselect.poll() 排空可… ✅ （細節見 log/work/2026-09-25.md）
- [x] Candy 主題補齊 SPIKE 顏色 key：SPIKE、SPIKE_MOTOR、SPIKE_MUSIC、SPIKE_LED、SPIK… ✅ （細節見 log/work/2026-09-25.md）
- [x] 系統規格補註：Python 分類名稱與原語法文字可保留英文作為教學專用術語 ✅ （細節見 log/work/2026-09-25.md）
- [x] 建立核心積木契約驗證層 ✅：`ui/src/modules/core/core_contract.test.mjs` 已涵蓋 block/generator/toolbox/mutation/雙語 i18n/主題顏色 key/平台限制，並已擴充至 core_manifest.json 全部 22 模組 ✅ （細節見 log/work/2026-09-25.md）
- [x] 為 py_text_zfill 補 toolbox 入口與回歸測試 ✅ （細節見 log/work/2026-09-25.md）
- [x] 為 raw Python statement／expression 補雙語說明與 tooltip，明確告知使用者自行負責 PC／Micr… ✅ （細節見 log/work/2026-09-25.md）

- [x] py_math_single 已依 math.* 操作注入 import math ✅ （細節見 log/work/2026-09-25.md）
- [x] 完成核心 generator 回歸測試 ui/src/modules/core/core_generators.test.mjs：mat… ✅ （細節見 log/work/2026-09-25.md）
- [x] 修正 py_type_tuple 單元素輸出尾逗號：(value,)，避免錯誤產生 (value) ✅ （細節見 log/work/2026-09-25.md）
- [x] 新增核心語法積木：py_try_finally、py_logic_pass、py_variables_del ✅ （細節見 log/work/2026-09-25.md）
- [x] 擴充 dictionary 操作：get、items、del key、update、clear ✅ （細節見 log/work/2026-09-25.md）
- [x] 新增 set 操作：集合 literal、add、discard、clear、union、intersection、difference ✅ （細節見 log/work/2026-09-25.md）
- [x] 新增 ui/src/modules/core/core_generators.test.mjs 回歸測試，核心 generator 7/… ✅ （細節見 log/work/2026-09-25.md）
- [x] 修正 Variables 自訂 Blockly category callback 遺漏 py_variables_del：custom… ✅ （細節見 log/work/2026-09-25.md）
- [x] 建立核心積木契約驗證層：新增 ui/src/modules/core/core_contract.test.mjs，對帳 block/g… ✅ （細節見 log/work/2026-09-25.md）

### [2026-09-25] #task[MCU serial高頻寫入] MCU 高頻 Serial 輸出穩定性優化
- [x] 完成 Phase 0 壓力測試 harness：temp_scripts/test_deploy_base_raw_dump.py（Py… ✅ （細節見 log/work/2026-09-25.md）
- [x] 完成 Phase 1 raw dump 開發旗標化：resources/deploy/base.py 移除每次 read 同步 open… ✅ （細節見 log/work/2026-09-25.md）
- [x] 完成 Phase 2 Rust 輸出聚合與背壓：src-tauri/src/commands/mcu.rs 抽出 forward_str… ✅ （細節見 log/work/2026-09-25.md）
- [x] 完成 Phase 3 前端批次渲染：ui/src/ui/terminal.js 加入 _terminalQueue 有界隊列、reque… ✅ （細節見 log/work/2026-09-25.md）
- [x] 完成 Phase 4 monitor/上傳交接：SerialMonitorSession 增加 stopped: Arc<AtomicB… ✅ （細節見 log/work/2026-09-25.md）
- [x] 完成 Phase 5 VSIX 相容性驗證：共用 base.py 性能提升，VSIX 原生 Terminal 不受影響，npm run… ✅ （細節見 log/work/2026-09-25.md）

### [2026-09-25] #task[MCU 序列埠 Raw Dump 診斷切換] UI／Tauri／VSIX／Python 全鏈路
- [x] 工具列韌體設定新增 Raw Dump 開關，localStorage 持久化、鍵盤操作、中英文 i18n 與深色主題完成 ✅ （細節見 log/work/2026-09-25.md）
- [x] MCU 上傳／序列監看 payload 帶入 rawDumpEnabled ✅ （細節見 log/work/2026-09-25.md）
- [x] Tauri 由視窗錨定 current_paths 推導 <ProjectRoot>/raw_dump.log，SerialMonito… ✅ （細節見 log/work/2026-09-25.md）
- [x] VSIX 新增跨 PowerShell／CMD／Bash 環境前綴產生器，上傳與 monitor 均寫入使用者 XML 專案根 ✅ （細節見 log/work/2026-09-25.md）
- [x] Python RawDumper 改為 ProjectRoot／工作目錄 fallback、啟動時截斷、寫入錯誤顯示 ✅ （細節見 log/work/2026-09-25.md）

### [2026-09-25] #task[ESLint 工具鏈] Extension lint 設定恢復
- [x] 新增 .eslintrc.json，採用 ESLint 8 + @typescript-eslint recommended 規則 ✅ （細節見 log/work/2026-09-25.md）
- [x] 修正既有 unused import/argument、case declaration、prefer-const、non-null a… ✅ （細節見 log/work/2026-09-25.md）
- [x] npm run lint 達到 0 errors／0 warnings ✅ （細節見 log/work/2026-09-25.md）
- [ ] `npm test` 正式測試仍待補 `out/test/runTest.js` 對應的 VS Code 測試 harness；不屬於本次 lint 修復範圍。

### [2026-09-25] #task[測試入口分層] npm test 快速檢查與 integration 入口
- [x] npm test 改為 npm run test:unit（compile＋lint），移除重複 pretest ✅ （細節見 log/work/2026-09-25.md）
- [x] 新增 npm run test:integration 與 scripts/run-integration.cjs，未建立 out/te… ✅ （細節見 log/work/2026-09-25.md）
- [x] npm test、npm run test:unit、script syntax check、git diff --check 通過 ✅ （細節見 log/work/2026-09-25.md）
- [ ] 未來若需要 VS Code integration test，再新增 `src/test/runTest.ts` 與 test suite；不手動提交 `out/` 產物。

### [2026-09-25] #task[types 資料結構積木] 補齊 tooltip
- [x] 為 py_type_list、py_type_dict、py_type_tuple、py_type_set 加入中英文 tooltip ✅ （細節見 log/work/2026-09-25.md）
- [x] 新增 core_contract.test.mjs 契約測試，四個資料結構積木的 tooltip 與 i18n key 必須存在 ✅ （細節見 log/work/2026-09-25.md）
- [x] core contract 5/5、types block syntax、Vite build、git diff --check 通過 ✅ （細節見 log/work/2026-09-25.md）

### [2026-09-30] #lint ui/ ESLint 清理與常設閘門
- [x] 清掉 ui/src 既有 49 項 lint 問題（154 檔），現況 0 error ✅ （細節見 log/work/2026-09-30.md）
- [x] 建立 ui/.eslintrc.json：eslint:recommended 全基底 + 7 個 Cocoya globals + i… ✅ （細節見 log/work/2026-09-30.md）
- [x] package.json 新增 lint:ui，並接入 test:unit（npm test 全閘） ✅ （細節見 log/work/2026-09-30.md）
- [x] 三條刻意關閉的規則（no-control-regex／no-regex-spaces／no-empty）已於 AGENTS.md 附設計… ✅ （細節見 log/work/2026-09-30.md）
- [x] 驗收：npm test 197/197 全綠 ✅ （細節見 log/work/2026-09-30.md）
- [x] P2-6 `ui_components.js` 職責比對 ✅（**查無可刪函式**：5 方法全有呼叫端，兩個對象職責清晰互不重疊 —— AGENTS.md 記為「記錄查無重疊並留下證據」，不再重複追蹤）
- T3／T4／T5／T6 已於上方 Batch 5／Batch 6 完成，不在本節重複列舉（SSOT：Batch 5 L132-133、Batch 6 L140-141）

### [2026-10-01] #task[尺規/標註畫布/還原範例檔/LF 根治] 使用者回報批次
- [x] 十字尺規顏色即時更新：根因只掛 onchange（關閉取色面板才觸發），補 oninput ✅ （細節見 log/work/2026-10-01.md）
- [x] bbox 框線依 P2 類別色上色：新增 UICanvas.resolveBoxColor()，注入 UIComponents.getL… ✅ （細節見 log/work/2026-10-01.md）
- [x] P3 標註頁移除「匯出資料集」按鈕（annotation.js ＋ classification.js） ✅ （細節見 log/work/2026-10-01.md）
- [x] 補齊尺規 i18n 鍵，並改正前綴（ANNOTATION_* → DSM_ANNOTATION_*，符合模組 DSM_ 慣例） ✅ （細節見 log/work/2026-10-01.md）
- [x] 修復 dataset_theme_contract 兩個失效自檢 + typePolicy 註解略過（根因：CRLF 的 \r 使替換無… ✅ （細節見 log/work/2026-10-01.md）
- [x] 還原範例檔前端全鏈路（Tauri）：index.html 選單第 2 項（Python 環境設定之下）、ui/base.js 綁定、三橋… ✅ （細節見 log/work/2026-10-01.md）
- [x] 補 capabilities 值守門（既有契約只比 key，誤設 VSIX 為 true 時 16 測全綠 → 假安全感） ✅ （細節見 log/work/2026-10-01.md）
- [x] 新增 .gitattributes（* text=auto eol=crlf ＋ 二進位／vendored／產物例外）根治 LF/CRL… ✅ （細節見 log/work/2026-10-01.md）
- [x] 驗收：272/272 測試綠、eslint 0 error、9 檔行尾全 CRLF ✅ （細節見 log/work/2026-10-01.md）
- [x] `temp/` 殘留清理 ✅（2026-10-05）：**1.65 GB → 0.55 MB**。刪除 `temp/venvtest/`（Python 虛擬環境 22,145 檔）與根目錄 90 個一次性腳本（`p25_*.py`／`dbg*.cjs`／`*.bak`／`*.txt`）；保留 `temp/scripts/`（174 檔，當前使用中）與 `temp/archive/`（189 檔歷史歸檔）。驗收：`node --test "src/**/*.test.mjs"` 422/422 綠、git 僅 `log/todo.md` 修改。
- [ ] `.gitattributes` 已於本次 commit 納入版控；後續若新增 `.sh` 腳本需另加 `eol=lf` 例外。

### [2026-10-01] #task[T-scan] 測試計時器洩漏掃描（Stage 0 殘項）
- [x] 新增 temp_scripts/t_scan.cjs：40 個測試檔靜態掃描（計時器／handle／無 await 三級線索） ✅ （細節見 log/work/2026-10-01.md）
- [x] 修正 annotation.test.mjs 真等待 sleep(350) → mock timers，並補邊界斷言（299ms 不觸發… ✅ （細節見 log/work/2026-10-01.md）
- [x] 修正 statusMessage.test.mjs 真等待 ×5（30/60/70/80/70）→ mock timers，補 4 個邊… ✅ （細節見 log/work/2026-10-01.md）
- [x] 變異測試兩項皆報紅：debounce 300→100 觸發「299ms 不應觸發」 ✅ （細節見 log/work/2026-10-01.md）
- [x] 誤報確認無害：platform_restore.test.mjs 的 realSetTimeout（try/finally 成對還原）、… ✅ （細節見 log/work/2026-10-01.md）
- [x] 刻意保留 bridge.test.mjs 的 TICK（5ms ×3，跨微任務用途而非計時器，僅多 56ms） ✅ （細節見 log/work/2026-10-01.md）
- [x] 驗收：272/272 綠（3 次取樣 1435/1080/1134ms）、eslint 0 error ✅ （細節見 log/work/2026-10-01.md）
- [x] 使用者拍板 Batch 2 範圍：P1-3 CSS token 化、P2-7 標籤色主題化、P2-16 dark 補 msgColour… ✅ （細節見 log/work/2026-10-01.md）
- [x] **Batch 2 執行** ✅：P2-16 + P2-7 全數完成；P1-3 A 類完成、B/C 類部分收斂（dark 段剩 17 處 ＋ light 段 43 處待處理）。`theme_contract.test.mjs` 第 4 測已依使用者決策推翻 ✅ （細節見 log/work/2026-10-01.md、2026-10-02.md）
### [2026-10-01] #task[Batch 2 / P2-16] dark 主題補 msgColours（使用者已目視確認）
- [x] 推翻 Batch 0 由我代判的 theme_contract.test.mjs 第 4 測（原寫「light/dark 不宣告 msg… ✅ （細節見 log/work/2026-10-01.md）
- [x] cocoya_dark.js 新增 msgColours 38 鍵：OKLCH 換算，色相不變、彩度 ×0.88、亮度收斂到深底適配區間… ✅ （細節見 log/work/2026-10-01.md）
- [x] 使用者目視後手動再調暗 8 鍵（STRUCTURE/CODING/AI_BASIC/AI_DRAW/AI_HAND/AI_FACE/AI… ✅ （細節見 log/work/2026-10-01.md）
- [x] 補 cocoya_candy.js 的 SPIKE_SENSOR（新守門抓出的既存缺口：candy 只有 SPIKE_SENSOR_CO… ✅ （細節見 log/work/2026-10-01.md）
- [x] 守門兩次假綠：① 只驗「不得多出預設色外的鍵」→ 刪掉整個 SPIKE_MUSIC 覆寫仍全綠 ✅ （細節見 log/work/2026-10-01.md）
- [x] 變異測試皆報紅：拼字錯誤（AI_INFERANCE）、缺整個覆寫（SPIKE_MUSIC） ✅ （細節見 log/work/2026-10-01.md）
- [x] 驗收：theme_contract 4/4、全專案 272/272、ESLint 0 error、使用者目視 OK ✅ （細節見 log/work/2026-10-01.md）
- [ ] **P1-3 暫緩**：稽核報告「144 個 hex」含 token 定義值，實際待處理 87 處（dark 區塊 44）。關鍵發現：`--dsm-*` 有**三套並存**來源（CSS :root ＋ CSS body.cocoya-dark-mode 區塊 ＋ 三主題檔 cssVars，各 34~35 鍵）。在確定收斂方向前做替換只是把混亂換位置。待主題系統重構方向確定後再處理。
- [ ] 主題系統重構（待決策）：三套並存問題如何收斂？建議先產出「只讀盤點報告」（誰是實際生效的那份、哪些衝突、可行的收斂方向），再動手。
### [2026-10-01] #task[Batch 2 / P1-3] 主題系統盤點與 token 收斂（使用者目視確認正常）
- [x] 只讀盤點（未動樣式）：確認 theme_manager.js:179 以 document.body.style.setProperty… ✅ （細節見 log/work/2026-10-01.md）
- [x] 衝突僅 2 鍵（其餘 25 鍵等值）：--dsm-error-bg（CSS #3d1b1b / 主題檔 #2d1515）、--dsm-w… ✅ （細節見 log/work/2026-10-01.md）
- [x] 執行收斂：刪除 :root(35 鍵) 與 body.cocoya-dark-mode(28 鍵) 兩死碼區塊共 59 行（1803→1… ✅ （細節見 log/work/2026-10-01.md）
- [x] 稽核報告「144 個 hex」數字修正：該數字含 token 定義值，排除定義行與註解後實際待處理 87 處（dark 區塊 44 處） ✅ （細節見 log/work/2026-10-01.md）
- [x] 移除「守門 1 自檢」（使用者決定，連續 6 次修復失敗後） ✅ （細節見 log/work/2026-10-01.md）
- [x] 附帶修掉真實缺陷：rules() 未排除 CSS 註解 → 檔頭註解含 body.cocoya-dark-mode 字樣與 { 會被當成… ✅ （細節見 log/work/2026-10-01.md）
- [x] 驗收：dataset_theme_contract 6/6、全專案 271/271、ESLint 0 error、vite build… ✅ （細節見 log/work/2026-10-01.md）
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

- [x] 核心手法：把「dark 覆寫」換成「雙主題 token」 ✅ （細節見 log/work/2026-10-02.md）
- [x] 新增 13 個 token × 3 主題（cssVars 47 → 60 鍵）：--dsm-error-border/-text、--d… ✅ （細節見 log/work/2026-10-02.md）
- [x] 直接重用既有 token（不新增）：#4a2a35 → --dsm-btn-hover-bg、#4CAF50 → --dsm-succe… ✅ （細節見 log/work/2026-10-02.md）
- [x] 量化：dataset_manager.css 1710 → 1607 行（淨減 103） ✅ （細節見 log/work/2026-10-02.md）
- [x] 附帶清掉既存垃圾：dark 覆寫群的 body.cocoya-dark-mode … 選擇器清單整組重複兩次 ✅ （細節見 log/work/2026-10-02.md）
- [x] 守門 4 判準升級（dataset_theme_contract）：由「有沒有 dark 覆寫」這個代理指標，改為「dark 主題的有效… ✅ （細節見 log/work/2026-10-02.md）
- [x] 守門 7 由單檔移交全專案（theme_contract.test.mjs，3 例：註解提前閉合／大括號平衡／自檢） ✅ （細節見 log/work/2026-10-02.md）
- [x] 自檢寫法修正：守門 4 舊自檢照抄偵測邏輯＝只驗複製品（真函式壞掉仍全綠） ✅ （細節見 log/work/2026-10-02.md）
- [x] 驗收：全專案 275 → 282 綠（1.2s）、ESLint 0 error、vite build PASS、6 檔全 CRLF 無… ✅ （細節見 log/work/2026-10-02.md）
- [ ] **dark 段剩餘 17 處**（B 類 5／C 類 12，原 B 17／C 31）：`.dataset-validation.ok` 深綠三件套、`.dataset-annotation-info` `#a0a0a0`、`.dataset-sampler-settings` `#999` 等，需再新增約 5~8 token。
- [ ] **light 段 43 處**硬編碼未動（與 A/B/C 同一「新主題摸不到」問題）。
- [ ] 📌 **位置更正**：上方同日條目寫「新增守門 7（`dataset_theme_contract.test.mjs`）」，**現已移交**至 `theme_contract.test.mjs`（全專案掃描版）；單檔版僅保留「大括號平衡」。

### [2026-10-01] #task[Batch 2 完成] P2-7 標籤色主題化 ＋ hover 高亮（使用者目視確認成功）
- [x] P2-7 起點用數據論證：實測 12 個常見標籤的 WCAG 對比度，舊實作（單一 HSL L=40~55%）11 個低於 3.0（7… ✅ （細節見 log/work/2026-10-01.md）
- [x] 關鍵設計：框線與徽章分開處理 ✅ （細節見 log/work/2026-10-01.md）
- [x] 框線雙色描邊（使用者選方案 A）：白色外框（粗，兼顧暗照片）＋ 標籤色內框（細，保留類別辨識），兩層互補不需判斷照片明暗 ✅ （細節見 log/work/2026-10-01.md）
- [x] 附帶修隱藏問題：晶片底板為深色，偏暗標籤色的色條看不見 → 改用 lightenHsl() 亮化 22% ✅ （細節見 log/work/2026-10-01.md）
- [x] hover 高亮三態：hover（加粗 3px、維持標籤色）／selected（青色 4px） ✅ （細節見 log/work/2026-10-01.md）
- [x] hover 強化三迭代（使用者兩次回報「不明顯」）：加粗 → 光暈+6px&chip 底板 0.92 → 2Hz 慢速呼吸虛線＋流動（使… ✅ （細節見 log/work/2026-10-01.md）
- [x] Canvas 陷阱修正：setLineDash() 會重置 lineDashOffset，必須先設 offset 再設 dash，順序顛… ✅ （細節見 log/work/2026-10-01.md）
- [x] rAF 生命週期：hover 開始啟動、離開停止、切圖停止、離開標註模式停止（後兩者防洩漏與對已卸載畫布重繪） ✅ （細節見 log/work/2026-10-01.md）
- [x] 驗收：271 → 275 例（+4）、eslint 0 error、4 檔行尾全 CRLF ✅ （細節見 log/work/2026-10-01.md）
- [ ] **事故教訓**：修改 `setLineDash` 順序時，編輯器對 `ui_canvas.js`（CRLF）反覆失敗，我改用 Python 行號替換，該腳本把兩行黏成一行（`ctx._dashTag` 與 `setLineDash` 整行消失）。這是**本次第二次因 Python 腳本改檔出事**（第一次清空三檔）。後續對 CRLF 檔案的行號替換優先用 Node（預設保留原行尾、不吃相鄰行）。

### [2026-10-01] Batch 2 整體狀態
- [x] P1-3 主題 token 收斂（d958cf4）— 使用者目視正常 ✅ （細節見 log/work/2026-10-01.md）
- [x] P2-16 dark msgColours（0b59329）— 使用者目視確認並手動再調 8 鍵 ✅ （細節見 log/work/2026-10-01.md）
- [x] P2-7 標籤色主題化 ＋ hover 高亮（本次）— 使用者目視成功 ✅ （細節見 log/work/2026-10-01.md）
- [x] P1-3 A 類已於 2026-10-02 收斂：刪除 dark 區塊中「與 light 重複宣告同一個 var()」的 23 處屬性（… ✅ （細節見 log/work/2026-10-01.md）
- [x] VS Code 深色越權 bug 已實測確認並修復（2026-10-02）：body.vscode-dark／body.vscode-h… ✅ （細節見 log/work/2026-10-01.md）
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

---

### [2026-10-04] P2-15 / P2-13 完成（i18n 分層與翻譯失效）

**P2-15 真實 bug：英文語系下永遠顯示中文**（`4fdd160`）

`i18n.js` 的 `t()` 會自動補前綴（`'DSM_' + key`），但 4 處呼叫端自己又寫了：

    t('DSM_ANNOTATION_CROSSHAIR', '尺規')   → 實際查 DSM_DSM_ANNOTATION_CROSSHAIR

這些鍵在 `i18n/en.js` **都有翻譯**（"Crosshair"）卻永遠讀不到，每次都掉回中文 fallback。
影響：標註畫布尺規、尺規顏色、側車啟動失敗、攝影機啟動失敗 —— **英文用戶看到中文**，
且無任何報錯。症狀與病因相隔極遠（多寫 4 個字元）。

既有 `core_contract` 只驗積木層 `Blockly.Msg['KEY']`，**不涵蓋 `t()` 呼叫端**。

- [x] 修 4 處重複前綴（ui_layout.js 2 處、ui/annotation.js 3 處） ✅ （細節見 log/work/2026-10-04.md）
- [x] 新增 t_call_contract.test.mjs（6 測，掃描型） ✅ （細節見 log/work/2026-10-04.md）
- [x] mutation 驗證 4 次全會紅 ✅ （細節見 log/work/2026-10-04.md）

**教訓（掃描型守門的失效模式）**：本守門曾三度寫成**假綠燈**——
「先剝字串、後找呼叫」會讓 `t('KEY')` 的引號被刪、連 key 一起消失，掃描恆為空，
守門「全綠」卻毫無作用。最終解法：**不剝字串**，直接在原始碼上找 `t('...`，
用 `inComment()` 從位置判斷註解。另設自檢 B2（掃描量下限 ≥150）專門攔截這種空集合失效。

**P2-13：`validate()` 改回傳結構化問題清單**（`4258ad2`）

    - errors.push(t('VALIDATE_COLUMN_MISSING_NAME', 'Column %1 is missing a name.', i+1));
    + errors.push(issue('VALIDATE_COLUMN_MISSING_NAME', i + 1));

- [x] spec.js 16 處 t() → {code, params}，移除 import t ✅ （細節見 log/work/2026-10-04.md）
- [x] 新增 application/validationMessages.js（MESSAGES 查表 + 2 個函式） ✅ （細節見 log/work/2026-10-04.md）
- [x] 更新 3 個呼叫端：ui/panels.js、application/exportUseCases.js、ui_layout.js ✅ （細節見 log/work/2026-10-04.md）
- [x] spec.test.mjs 3 個測試由斷言文案改為斷言 code（附帶改進：改寫文案不再誤報） ✅ （細節見 log/work/2026-10-04.md）
- [x] 新增 validation_layer_contract.test.mjs（7 測），mutation 驗證 3 次全會紅 ✅ （細節見 log/work/2026-10-04.md）

> **設計決定：fallback 一律用英文。** fallback 是「翻譯失效的最後防線」，
> 對非中文語系用戶而言中文 fallback 反而更糟 —— P2-15 已證實這條路會出事。
> 未知 code 顯示 `[未定義的驗證代碼：XXX]`，不靜默吞掉。

> **事故紀錄**：mutation 還原時用 `git checkout spec.js`，把**整個未提交的改造一併還原**。
> **教訓：mutation 還原一律用 `cp` 備份檔，不要用 `git checkout`** —— 對未提交的變更而言
> 它是「還原到上次 commit」，而非「還原到 mutation 前」。本次有備份才沒出事。

### [2026-10-04] py_ai_train_run 小數欄位 precision 修正（用戶提問觸發）

**根因**：`Blockly.FieldNumber` 簽名是 `(value, min, max, precision)`，**沒有 step 參數**。
`precision` 是「舍入倍數」，Blockly 從它推導小數位數 = `ceil(|log10(precision)|)`。
原三個欄位都以為第 4 參數是 step 而填 `0.1` / `0.0001`，導致**靜默捨入且無任何提示**：

| 欄位 | 原 precision | 實測症狀 |
|---|---|---|
| `LEARNING_RATE` | `0.0001`（4 位） | 打 `1e-5` / `3e-5` → **變成 0.0001（差 10 倍）** |
| `DROPOUT` | `0.1`（1 位） | 打 `0.05` → 0.1；`0.35` → 0.4 |
| `VALIDATION_SPLIT` | `0.1`（1 位） | 打 `0.15` → 0.2；`0.25` → 0.3 |

`LEARNING_RATE` 這條最嚴重 —— **Adam fine-tune 最常用的 1e-5 / 3e-5 根本打不進去**。

- [x] LEARNING_RATE → (0.001, 0.00001, 1, 0.00001)（5 位小數，1e-5~1e-3 皆可精確輸入） ✅ （細節見 log/work/2026-10-04.md）
- [x] DROPOUT → precision 0.01（0.05 / 0.35 可輸入） ✅ （細節見 log/work/2026-10-04.md）
- [x] VALIDATION_SPLIT → precision 0.01（0.15 / 0.25 可輸入） ✅ （細節見 log/work/2026-10-04.md）
- [x] 於積木定義處註明簽名與原值後果（避免日後有人再以為是 step） ✅ （細節見 log/work/2026-10-04.md）
- [x] 已補上 help 範圍表（同日完成）：新增「數值參數建議範圍」小段，列出 5 個數值欄位的「可輸入範圍 / 常見建議值 / 怎康選」，並… ✅ （細節見 log/work/2026-10-04.md）

> **用戶決策**：不加守門測試，直接改。（本欄位無其他呼叫端依賴其精確值，
> 且 Blockly 本身即為 SSOT；`ai_inference_blocks.js` 已加註說明。）
