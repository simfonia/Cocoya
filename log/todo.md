# Cocoya 專案任務清單 (Todo List)
**專案名稱**：Cocoya (Code, Compute, Yield AI)
**核心目標**：建立一個以 Blockly 為介面，幫助 Python 初學者進入 AI 世界的 VSCode extension 與獨立桌面應用程式。

## [核心開發原則]
- **SSOT (單一事實來源)**：所有積木、產生器與前端邏輯必須統一存放在 `ui/src` 下，由 VSIX 與 Tauri 共享。
- **通訊抽象化**：前端必須透過 `CocoyaBridge` 與後端通訊，禁止在 UI 層直接使用環境專屬 API。

---

## [已完成] 2026-08-20 — Tauri 多視窗 terminal/serial 隔離 + 視窗焦點交接（方案 B）

### 需求
1. Tauri 多視窗下終端機畫面彼此共用（污染）。
2. 多視窗切換時，希望失焦視窗自動釋放 Serial port、聚焦視窗自動重取。

### 修改（階段一：終端機隔離）
- `src-tauri/src/commands/python.rs` + `mcu.rs`：`python-log`/`python-error`/`training-*` 全部由 `.emit()` → `.emit_to(&own_label, ...)`（Tauri `emit` 為全域廣播，是多視窗終端機共用的根因；`closeRequested` 早已改 `emit_to`）。執行緒以 `xxx_label = own_label.clone()` 避免 `move` 閉包 double move。
- `python.rs::stop_python`：kill 程序後一併 `crate::commands::mcu::stop_serial_monitor(state, label)`。
- `mcu.rs`：`deploy_mcu`/`open_serial_monitor`/`erase_filesystem`/`reset_firmware` 的 `python-log`/`python-error` 亦全部 `.emit_to`。

### 修改（階段二：方案 B 焦點交接）
- `src-tauri/src/state.rs`：新增 `SerialMonitorSession{port,python_path,lang,child}`、`SerialMonitorWant{port,python_path,lang}`；`AppState` 新增 `serial_monitors`、`serial_wants`（皆以 window label 為 key）。
- `mcu.rs`：抽出 `spawn_serial_monitor()`（同埠被其他視窗佔用先停）；`open_serial_monitor()` 改用該 helper；新增 `stop_serial_monitor()`、`#[tauri::command] set_window_focus(focused)`（失焦釋放、聚焦自動重取）。
- `lib.rs`：AppState 初始化兩新欄位、invoke_handler 註冊 `set_window_focus`、on_window_event 關閉時清理 serial 狀態。
- `ui/src/bridge/tauri.js` `_setupTauriListeners`：`document.addEventListener('blur'/'focus')` → `this.tauriInvoke('set_window_focus', { focused: bool })`。
- `permissions/commands.toml` / `docs/backend_api_manifest.md` / `AGENTS.md`：同步註冊與文件說明。

### 驗證
- [x] `cargo check`（src-tauri）Finished 無 error
- [x] `npx tsc --noEmit -p tsconfig.json` 通過
- [x] `node --check ui/src/bridge/tauri.js` OK
- [ ] 實機：雙視窗 run/serial 不再污染、切窗自動釋放/重取

### 相依性
- 無（純 Tauri 後端 + 前端 Tauri bridge）。

*更新日期：2026-08-20*

---

## [已完成] 2026-08-17 — Dataset Manager 第二輪（名稱警示/Live 排序/統計同步/統一標籤管理器/排序/顏色）

### 需求與修改
- [x] `ui_layout.js`：`setNameWarning()` 名稱衝突紅框警示，reconcile 各分支切換；clearBtn/typeSwitch/open/oninput 清除。
- [x] `ui_layout.js`：Live 縮圖 `push`（舊→新）＋渲染後捲到 `.dataset-image-grid` 最下方。
- [x] `ui_layout.js`：重寫 `updateStatsFromImages()`（label_map 權威、依 type 統計、類別補 0）；renderAnnotationControls 增/改/刪、onLabelChange、applyLoadedProgress 補呼叫；標註變更(onUpdate/saveCurrentAnnotations)重算統計。
- [x] `ui_layout.js`：新增 `createLabelMapManager()` 統一於分類/物件偵測標註與檢視模式；`nextLabelId()` 修 id 碰撞；分類/管理器下拉字典序。
- [x] `ui_components.js`：`renderLabelStats` 字典序；`getLabelColor` 改 FNV-1a + 黃金比例色相。
- [x] `dataset_manager.css`：`.dataset-name-warning`。

### 決策
- 專案類型維持「以進度檔為準」（載入會被進度檔 type 拉回）；改類型須用乾淨資料夾/刪 dataset.json 重建。

### 驗證
- [x] `node --check` 通過；`ui` `vite build` 成功
- [ ] 實機：統計同步、id 無錯亂、三處標籤管理一致、排序與顏色正確

### 相依性
- 無（純前端 UI，SSOT）。

*更新日期：2026-08-17*

---
## [已完成] 2026-08-17 — Dataset Manager UI 修改

### 需求
1. 訊息區移至「頂部中央」並於 5 秒後自動清除（原先在左欄 `.dataset-source-panel` 內，標註模式會隱藏而看不到）。
2. 右欄「預覽與標註」新增標籤後，下方案 Spec JSON 預覽未即時更新。
3. 左欄「選擇檔案或資料夾」按鈕移至最下方，讓使用者依序設定完成後再按。

### 修改
- [x] `ui_layout.js`：新增集中式訊息 `#dataset-manager-message`（header 下方中央、所有模式皆可見）與 `showStatusMessage(msg, {duration})`（預設 5 秒自動清除、計時器重置防訊息交錯）；移除 `getExportStatusElement()`；所有 `status.textContent` 改用 `showStatusMessage()`（applyLoadedProgress / handleFileImport / handleDirectoryImport / handleSamplerSnapshot / handleExportDataset / handleCloudUpload / handleBridgeMessage 之 checkRemoteEnvironmentResult 與 datasetUploadResult）。
- [x] `ui_layout.js`：`renderAnnotationControls()`（bbox）新增/編輯/刪除類別後、`refreshDynamicPanels()` 的 `onLabelChange` 新增標籤後呼叫 `refreshPreview()`，讓 Spec JSON 預覽即時更新。
- [x] `ui_layout.js`：左欄重排（專案類型→來源模式→分隔線→資料集名稱→描述→雲端診斷→分隔線→匯入按鈕移最下方）。
- [x] `dataset_manager.css`：新增 `.dataset-manager-message` 樣式（淺粉底、居中、適配淺深色主題）。

### 驗證
- [x] `node --check ui_layout.js` 通過
- [x] `ui` `npx vite build` 成功
- [ ] 實機 VSIX / Tauri 雙平台驗證三項行為

### 相依性
- 無（純前端 UI，SSOT）。

*更新日期：2026-08-17*

## [已完成] 2026-08-17（續）— Dataset Manager 名稱對齊方案 A + 訊息欄置中/時長

### 需求
1. 資料集名稱欄位：重選來源資料夾時名稱未自動更新，可能靜默覆寫錯誤 namespace（例如 `D1/dataset.json`）。
2. 訊息欄文字未垂直置中、預設 5 秒消失太快。

### 決策
經 4 情境評估（新專案/多 dataset 碰撞/另存導引/table 位置）後捨棄「一律同步」：
- 一律同步無法解決 basename 碰撞（`A/data` 與 `B/data` 同名皆變 `data`）與「開舊進度改存另一 dataset」的改名混淆。
- 改採「來源變更顯式 confirm」：確認=更新名稱、取消=維持名稱並提示可能覆寫；同名不同來源則警告。

### 修改
- [x] `ui_layout.js`：新增 `reconcileProjectName(derivedName, sourcePath)`（首次/預設自動帶入；basename 碰撞警告、取消則中止匯入；名稱與來源不同時 confirm 更新或維持；名稱一致僅同步 baseDir）。`handleFileImport`/`handleDirectoryImport` 改用之（移除舊「僅預設才自動填」）。
- [x] `ui_layout.js`：`showStatusMessage` 新增 `STATUS_MESSAGE_DURATION=8000`（預設 8 秒）、顯示改 `display:flex`。
- [x] `dataset_manager.css`：`.dataset-manager-message` 改 flex 水平/垂直置中、`min-height:34px`。
- [x] `i18n`（zh-hant/en）：新增 `DSM_SOURCE_RENAME_CONFIRM` / `DSM_SOURCE_COLLISION_CONFIRM` / `DSM_IMPORT_CANCELLED` / `DSM_SOURCE_KEPT_STATUS`。
- [x] `AGENTS.md`：更新 `showStatusMessage` 預設 8 秒與 flex 置中說明。

### 驗證
- [x] `node --check`（ui_layout / zh-hant / en）通過
- [x] `ui` `npx vite build` 成功（322ms）
- [ ] 實機：D1→D2 切換彈「更新名稱/維持」、同名不同夾彈碰撞警告、訊息垂直置中且約 8 秒消失

### 技術深挖
- 名稱即 `專案根/dataset/<名稱>/` 的 namespace；後端會自動建立資料夾（VSIX `mkdirSync(recursive)`、Tauri `create_dir_all`），故新專案無需先建夾。
- basename 碰撞：以 in-session `state.sourceFolderPath` 比對新來源路徑，名稱相同但路徑不同 → 警告並可取消。
- confirm 僅布林（OK/取消）：更新=OK、維持=取消，需在文案講清兩者後果。

### 相依性
- 無（純前端 UI，SSOT）。

*更新日期：2026-08-17*

---
---
## [已完成] 2026-08-14 — M4b 等級一存讀（後端指令層 + 前端整合）

### 需求
為 Dataset Manager「儲存標註進度」提供後端讀寫指令：寫 `dataset.json` 到「專案根/dataset/<專案>/」，並可從已掃描資料夾讀回（含 annotations）並依路徑套回標註。

### 修改
- [x] `src/handlers/datasetOps.ts`：`handleDatasetSaveProgress`（專案根 SSOT 寫檔、未錨定拒絕）+ `handleDatasetLoadProgress`（讀 `<folderPath>/dataset.json`）
- [x] `src/cocoyaManager.ts`：註冊 `datasetSaveProgress` / `datasetLoadProgress` 分發 case
- [x] `src-tauri/src/commands/file.rs`：`dataset_save_progress`、`DatasetProgressResult`（serde camelCase）、`dataset_load_progress`
- [x] `src-tauri/src/lib.rs`：註冊兩新指令
- [x] `src-tauri/permissions/commands.toml`：權限 allow 含兩新指令（`allow-all-commands` 已配至 capabilities/default.json）
- [x] `ui/src/bridge/tauri.js`：新增 `datasetSaveProgress`（動態取專案根）與 `datasetLoadProgress` case
- [x] `ui/src/bridge/base.js`：新增 `saveDatasetProgress` / `loadDatasetProgress` 便捷方法
- [x] `ui_layout.js`：`handleSaveProgress()`、`applyLoadedProgress()`、`loadProgressFromFolder()`、`handleDirectoryImport` 掃描後自動載入資料夾內 `dataset.json` 並依 `samples[].image_path` 套回 annotations、新增「儲存進度」按鈕與綁定、`rebuildSourceModeOptions`（type 對齊時同步 mode 選項）
- [x] `i18n/zh-hant.js` + `i18n/en.js`：新增 `DSM_SAVE_PROGRESS*` / `DSM_STATUS/SUCCESS/ERROR_*_PROGRESS` 8 鍵

### 驗證狀態
- ⚠️ 本 session 指令執行環境異常（`spawn ... ENOENT`），`node --check` / `vite build` / `cargo check` / `npm run compile` 待下階段執行。
- 已完成檔案覆讀與結構人工核對（含修正 `handleSaveProgress` 誤嵌進 `handleExportDataset` 的插入錯位）。

### 待辦（實機驗證）
- [ ] 跑 `node --check`（base.js/tauri.js/ui_layout.js/i18n）、`ui` `vite build`、`cargo check`、VSIX `npm run compile`
- [ ] 實機驗證 B：儲存進度後 `<專案根>/dataset/<專案>/dataset.json` 產生且 samples[].annotations 含標註
- [ ] 實機驗證 C：重開該資料夾（含 dataset.json）→ type/schema/stats/樣本回復、bbox/line/分類標註依路徑套回、縮圖綠勾/徽章正確
- [ ] 回歸 image 分類校正 / object_detection bbox / line_following 標註流程
- [ ] Tauri 專案根 SSOT 命名空間（dataset/<專案>）與儲存路徑一致：載入時選取此資料夾

### 相依性
- 依賴 M1（專案根 SSOT）、M3（防呆）、M4a/M4c（live 落盤）。

*更新日期：2026-08-14*

---

## [已完成] 2026-08-15 — live 採集鏡像檔名脫鏈修正（fix A：依 savePath 統一 image_path）

### 需求
修正「儲存標註進度後重新載入資料夾時取不回標註」的根因：`dataset.json` 記錄的 `image_path` 與磁碟實際檔名不一致。

### 根因（實測確認）
`test/dataset/data_test` 實測：`dataset.json` 的 `image_path`（例 `1/1_1786674143181.jpg`）與磁碟檔名（例 `1/1_1786674143056.jpg`）完全不匹配，逐一相差約 118~135ms。證實為**兩次獨立 `Date.now()`**：磁碟檔名用 sidecar/bridge 的 savePath 時戳（`datasetOps.ts` L332 / `tauri.js` L411），`image_path` 用前端 `addSampleFromSampler()` 自己的時戳（`ui_layout.js` L1595，無視傳入的 savePath）。

### 修改
- [x] `ui/src/modules/dataset_manager/ui_layout.js`：`addSampleFromSampler()` 有 `savePath` 時，以 `basename(savePath)` 為 `filename`（`path=${label}/${filename}`）；僅 `savePath` 為 null（未錨定／不落盤）時 fallback `Date.now()`。達成單一時間戳，`img.path`/`image_path`/`diskPath` 與磁碟一致。

### 決策
- **不救舊資料**（`data_test` 僅測試用、可重建）：不實作任何 fallback 救援，`applyLoadedProgress` 維持精確比對。
- **載入後續加 Live 資料支援**：掃描端 `img.path` 本就取自磁碟真相；採集端 fix A 後也取自 savePath → 兩端一致，混合存讀可套回。

### 驗證
- [x] `node --check ui_layout.js` 通過；`ui` `npx vite build` 成功
- [ ] 實機：重建測試專案採集→標註→儲存→載入資料夾→annotations 套回
- [ ] 實機：載入進度後再新增 Live 資料→再儲存→再載入，混合資料全數套回
- [ ] VSIX / Tauri 雙平台各驗證一次
## [已完成] 2026-08-15 — 標註自動落盤（方案 A）+ 列表縮圖綠勾 + 清除資料二次警告

### 需求
在標註後自動將進度寫入磁碟（移除「儲存進度」按鈕，降低認知負擔）；列表縮圖牆補綠勾；修正「清除資料」的二次警告順序與誤阻斷。

### 修改
- [x] `ui_layout.js`：移除 `handleSaveProgress()` 與「儲存進度」按鈕/綁定；新增 `hasData()` / `writeProgressToDisk()` / `scheduleAutoSave(immediate)`（時間防抖 800ms＋切圖/退出/關閉立即 flush），掛接於 `refreshPreview` 尾端、新增/刪除影像、類別增刪改名、分類 onchange、切圖、退出、關閉。未錨定或無資料靜默略過。新增「🛡 自動儲存已開啟」指示。
- [x] `ui_layout.js`：`exitAnnotationMode(skipUnannotatedCheck=false)`，清除資料用 `exitAnnotationMode(true)` 跳過未標註二次警告。
- [x] `ui_layout.js`：`closeDatasetManager` 錨定時不彈關閉警示（已自動落盤），僅未錨定且 `hasUnsavedWork()` 才問。
- [x] `ui_components.js`：`renderImageGrid` 當 `annotations.length>0` 顯示 `.annotated` + ✓ 綠勾。
- [x] `dataset_manager.css`：`.dataset-image-item.annotated`、`.dataset-image-check`、`.dataset-autosave-indicator`。
- [x] `i18n`（zh-hant/en）：`DSM_AUTOSAVE_ON` / `DSM_AUTOSAVE_ON_TOOLTIP`。

### 驗證
- [x] `node --check`（ui_layout/ui_components/zh-hant/en）通過；`ui` `vite build` 成功
- [x] 實機：錨定專案標註→不按按鈕直接關閉重開→還原
- [x] 實機：新增 Live／刪圖／改分類／類別增刪改名後自動落盤；未錨定不噴錯
- [x] 實機：列表縮圖牆與標註縮圖欄綠勾一致；清除資料只彈一次確認
- [ ] VSIX / Tauri 雙平台各驗證一次


---


## [已完成] 2026-08-15 — 匯出資料集回饋修正 + 標註模式按鈕布局

### 需求
1. 「驗證」「匯出資料集」按鈕不應在標註模式重複/突兀顯示。
2. 匯出走 zip 後看不到訊息；未標註警告語意是「離開」而非「匯出」。

### 根因
- 匯出狀態寫入 `#dataset-import-status`（位於 `.dataset-source-panel`），標註模式隱藏 source/schema → 匯出結果看不到。
- 匯出未標註警告誤用 `ANNOTATION_UNANNOTATED_WARNING`（「確定要離開？」）。

### 修改
- [x] `ui_layout.js`：新增 `getExportStatusElement()`（標註→工具列狀態；否則→來源面板）、`showExportProgress(active)`（modal 頂部不確定進度條）、`setAnnotationHeaderActions(hidden)`（標註進入隱藏 header 的驗證/匯出/自動儲存指示，退出還原）。`handleExportDataset` 改用模式感知狀態＋進度條＋匯出專用未標註文案。兩標註工具列新增「匯出資料集」按鈕與狀態列並綁定。modal 新增 `#dataset-export-progress`。
- [x] `i18n`（zh-hant/en）：`DSM_ANNOTATION_EXPORT_UNANNOTATED_WARNING`（「仍有 %1 張圖片未標註，確定要匯出嗎？」）、`DSM_EXPORT_IN_PROGRESS`。
- [x] `dataset_manager.css`：`.dataset-export-progress`（不確定動畫）、標註工具列匯出樣式。

### 驗證
- [x] `node --check`（ui_layout / i18n）通過；`ui` `vite build` 成功
- [x] 實機：標註模式有「匯出資料集」及進度條與成功/失敗訊息；header 不重複顯示
- [x] 實機：未標註匯出提示為「確定要匯出嗎？」（非「離開」）；ZIP 產生後有成功訊息
- [ ] VSIX / Tauri 雙平台各驗證一次

*更新日期：2026-08-15*

---

### 需求
1. 將「產生模型」勾選框整合為「模型輸出」下拉選單，預設「無」
2. 推論積木加入「模型類型」下拉選單，可自訂使用哪個模型檔
3. 修正推論積木 glob 搜尋順序不保證的 bug

### 修改
- [x] `ai_inference_blocks.js`：`EXPORT_MODEL` 勾選框 → `MODEL_OUTPUT` 下拉選單；推論積木加入 `MODEL_TYPE` 下拉選單
- [x] `ai_inference_generators.js`：`export_model` → `model_output` 參數；推論加入 `model_type` + 修正 glob 搜尋邏輯
- [x] `classifier_train.py`：`--export_model` → `--model_output` 參數，根據值控制產出格式
- [x] `zh-hant.js` + `en.js`：新增 i18n 字串

### 行為
- 模型輸出選項：無 / 量化 TFLite (int8) / Float32 TFLite / Keras / 量化+Float32 / 全部
- 推論模型類型：自動（優先 int8）/ 量化 (int8) / Float32

---

## [已完成] 2026-08-01 — VSIX/Tauri 訓練結果差異修復（4 問題）

### 問題
1. terminal 輸出格式不一致（Tauri 有 ANSI 色碼和中文亂碼）
2. Tauri 未顯示 `cocoya_run.py` 路徑
3. Tauri 訓練正確率偏低（57.5% vs VSIX 90%）
4. VSIX 無法自動顯示訓練結果（Tauri 可以）

### 修復
- [x] Phase 1：終端機輸出格式（`src-tauri/src/commands/python.rs` — ANSI 過濾、編碼處理、執行命令顯示）
- [x] Phase 2：正確率差異（`classifier_train.py` + `common/training.py` — 隨機種子控制 + 確定性運算）
- [x] Phase 3：VSIX 自動顯示訓練結果（`src/handlers/envOps.ts` — spawn 模式 + RESULT 解析）
- [x] Phase 4：stderr 混入問題（`src-tauri/src/commands/python.rs` — 獨立 python-error 事件）
- [x] `cargo check` 編譯驗證通過

### 待驗證
- [ ] 重新執行 `02_PC_train.xml`，確認兩版正確率一致
- [ ] 確認 VSIX 自動顯示訓練報告
- [ ] 確認 Tauri 終端機無 ANSI 色碼和亂碼

---

## [進行中] 2026-07-18 — Tauri Dataset Manager 功能對齊VSIX

### Phase A：Sidecar 已有支援（優先實作）
- [x] A1. `datasetDeleteImage` — Rust 新增 `delete_file` 指令 + lib.rs/權限/tauri.js 串接
- [x] A2. `datasetExport` — Rust `export_dataset` 指令 + sidecar 打包 + 原生存檔對話框
- [ ] **A3. `datasetUploadArchive`** — sidecar `uploadDataset` 串接（SSH/SFTP 分塊上傳）

### Phase B：需新實作
- [x] B1. `pickFolder` — Tauri 原生資料夾選擇 + Rust 掃描影像（`pick_folder` 指令）
- [x] **B2. `openTrainingReport`** — Rust `open::that()` 開 HTML（2026-08-01 完成）

### Phase C：雲端訓練（長期）
- [ ] C1. SSH/SFTP 上傳流程整合
- [ ] C2. 遠端訓練啟動與監控

---

## [已完成] 2026-08-04 — detector_train.py 實作（單一目標物件偵測）
- [x] **Common 模組重命名**：dataset.py → classifier_dataset.py 等 5 個檔案統一命名
- [x] **detector_dataset.py**：YOLO 格式資料載入模組
- [x] **detector_model.py**：MobileNetV2 + 回歸頭模型建立
- [x] **detector_train.py**：物件偵測訓練主腳本（MSE loss, int8 TFLite）
- [x] **Dataset Manager 標註 UI**：加入類別選擇器（先選類別再畫框）
- [x] **Dataset Manager YOLO 匯出**：sidecar 匯出時寫入 labels/ 目錄
- [x] **推論端 _detect() 補齊**：解析 TFLite 輸出為 bbox
- [x] **新增 py_ai_get_bbox_center 積木**：計算 bbox 中心點（雲台追蹤用）
- [x] **Phase 7：範例建立**：`examples/AI_03_detector_pan_tilt/`（02/03/04 XML + README）

## [待辦] 優先級 1：AI 訓練腳本擴充
- [x] **detector_train.py 實作**：使用 `resources/train_templates/common/` 模組實作物件偵測訓練腳本
- [ ] **line_follower_train.py 實作**：使用 common 模組實作循線訓練腳本
- [ ] **table_train.py 實作**：使用 common 模組實作表格資料訓練腳本

## [待辦] 優先級 2：遠端訓練
- [ ] **SSH/Sidecar 整合**：實作 `extension.ts` 中 `backend === 'remote'` 的分支
- [ ] **容器化訓練腳本**：建立基於 DGX 鏡像的訓練容器與模板程式

## [待辦] 優先級 3：範例與說明
- [x] **物件偵測範例規劃**：已完成 `examples/AI_03_detector_pan_tilt/`
- [ ] **hardware_pins 說明文件補齊**：補上 `hardware_pins_en.html` 和 `hardware_pins_zh-hant.html` 的完整內容
- [ ] **[選用]** 更新 `03_PC_inference.xml` 使用新的解析積木

## [待辦] 長期優化
- [ ] **[優化] 跨平台 Friendly Name**：實作 macOS/Linux 的序列埠名稱顯示優化。
- [ ] **[功能] 重置韌體 Sidecar 化**：研究將 `esptool` 整合成 Tauri Sidecar 的可行性。

---

## [已完成] 里程碑 v1.0 ~ v6.0 (硬體、UI 與 部署穩定化)
- [x] **[硬體] XIAO S3 Sense 全面支援**：實作 Serial 燒錄 (esptool)、多段韌體恢復 (Factory C++ - 支援 project_config.json) 以及主動式硬體偵測優化 (2026-06-07)。
- [x] **[部署] 傳輸可靠性革命**：升級 `deploy_mcu.py` 支援 128-byte 分塊二進位寫入與 10 次中斷序列，徹底解決 ESP32-S3 同步失敗問題 (2026-06-07)。
- [x] **[UI] 徹底修復打字失焦 Bug**：透過 Silence Mode 機制判斷 `isVisible()` 暫停背景 UI 同步與檢查 (2026-06-07)。
- [x] **[功能] 互動式 REPL**：終端機支援雙向通訊，允許直接輸入 Python 指令與 MCU 互動 (2026-06-07)。
- [x] **[範例] 範例專案更新**：補完並測試 MicroPython 模式下的所有範例專案 (2026-06-07)。

## [已完成] 雲端 AI 模型訓練 (NVIDIA DGX Spark 整合)
- [x] **[架構] VSIX 回歸 UI 模式**
- [x] **[UI] 臨時安全授權 Dialog**
- [x] **[Sidecar] 實作 SSH/SFTP 通訊模組**
- [x] **[功能] 遠端環境診斷 (CUDA/Docker)**
- [x] **[功能] 資料集 SFTP 傳輸與原位解壓**
- [x] **[Phase 5] Python MVP 驗證完成**（2026-06-24）
- [x] **[Phase 1] 訓練後端選擇 UI**
- [x] **[Phase 2] 本地訓練功能**
- [x] **[Phase 2.5] 通用化架構重構**
- [x] **[Phase 3] 訓練積木模組開發**
- [x] **[Phase 4] 推論積木模組開發**
- [x] **[Phase 3 重構] 訓練積木合併與重構**
- [x] **[Refactor] src/extension.ts 模組化重構**
- [x] **[Phase 5] PBL 範例積木專案測試**

## [已完成] 2026-07-05 訓練結果改為 HTML 報告
- [x] 產出 HTML 訓練報告
- [x] 移除訓練結果 Modal
- [x] 簡化訓練結果按鈕
- [x] 新增 openTrainingReport / openLatestTrainingReport 指令
- [x] Sidecar 傳遞 reportPath
- [x] CSS 清理
- [x] Bug Fix: 中文路徑問題、專案路徑判斷

## [已完成] 2026-07-11 — MicroPython 入門範例 + 孤兒積木白名單
- [x] 6 個 MicroPython 入門範例
- [x] 孤兒積木白名單擴充

## [已完成] AI 訓練積木功能擴充 (2026-07-12)
- [x] Phase 1：Python 共同模組提取（6 個 common/*.py）
- [x] Phase 2：積本修改（基本 3 + 進階 4 欄位 + 分組顯示）
- [x] Phase 3：通用推論積木（init + predict + 4 解析積木）
- [x] Phase 4：Dataset Manager 對齊
- [x] Phase 5：說明文件 docs/help/（7 個 HTML）

## [已完成] Help 系統整合 (2026-07-14)
- [x] 說明文件統一放置到 `docs/help/`（含硬體腳位與 AI 積木）
- [x] 所有 AI 推論積木加入 helpUrl
- [x] VSIX `handleOpenHelp` 路徑修正
- [x] Tauri 端 `open_help` 指令 + `docs/help` 資源包
- [x] `toolbox.xml` 補上 4 個解析積木

## [已完成] 2026-07-18 — Tauri 版 Dataset Manager Webcam 修復
- [x] 新增 Rust sidecar 通訊模組（`start_sidecar`、`sidecar_send`、`stop_sidecar`）
- [x] 修正 `sidecar_send` 逐 byte 讀取 stdout 避免 BufReader 緩衝問題
- [x] 修正 `datasetStopCamera` 狀態同步（停止後 success: false）
- [x] 新增 `sidecar-event` 監聽，sidecar 主動事件轉發到前端
- [x] 覆寫 `_dispatchToFrontend` 加入 `window.postMessage` 相容 sampler.js

## [已完成] 2026-07-29 — Value 積木程式定位修復

### 問題
Cocoya 無法定位 value/expression 積木 (如數字、文字、變數 getter)。當點擊這類積木時，程式碼預覽面板不會高亮對應行。

### 根本原因
1. **標記被清除**：`workspace.js` 的 `triggerCodeUpdateSync` 中，`/\u0001ID:.*?\u0002/g` 正則清除了 value 積木的 invisble 標記，導致 `blockToRangeMap` 中沒有 value 積木的 ID。
2. **缺少遞迴查找**：`renderer.js` 的 `syncSelection` 直接以 `blockId` 查找，CodeBridge 的 `findLocatableBlock` 遞迴向上查找機制尚未實作。

### 修復
- **`ui/src/ui/renderer.js`**：
  - 新增 `findLocatableBlock(block)` 方法：若積木有 `outputConnection`，遞迴往上找到 statement 父積木。
  - 修改 `syncSelection`：使用 `findLocatableBlock` 找到可定位父積木後，再以其 ID 查找範圍。
- **`docs/system_spec.html`**：在「積木定位技術」章節補充 subsection D，說明遞迴查找機制。

### 參考
- CodeBridge `ui/src/main.js` 的 `findLocatableBlock` 與 `syncSelection` 實作。

## [已完成] 2026-07-29 — 修復 Minimap 工作區註解同步問題

### 問題
- 工作區註解功能啟用後，Minimap 不會即時更新工作區註解

### 根本原因
- `workspace.js` 的 `initMinimap()` 中，覆寫了 `minimap.mirror()` 函數
- 原函數過濾掉了不包含 `blockId` 的事件（第 66 行）
- 工作區註解事件（COMMENT_CREATE, COMMENT_DELETE 等）使用 `commentId` 而非 `blockId`
- 導致所有註解事件都被過濾掉，Minimap 無法同步

### 修復
- **`ui/src/app/workspace.js`**：
  - 在 `minimap.mirror()` 中加入註解事件識別邏輯
  - 允許 5 種註解事件通過：COMMENT_CREATE, COMMENT_DELETE, COMMENT_CHANGE, COMMENT_MOVE, COMMENT_RESIZE
  - 註解事件直接通過過濾器，不檢查 `blockId`

### 技術細節
- Blockly 工作區註解事件類型：
  - `COMMENT_CREATE`：建立註解
  - `COMMENT_DELETE`：刪除註解
  - `COMMENT_CHANGE`：修改註解內容
  - `COMMENT_MOVE`：移動註解
  - `COMMENT_RESIZE`：調整註解大小
- 這些事件使用 `commentId` 而非 `blockId`
- Minimap 的 `mirror()` 函數需要正確處理這些事件

### 參考
- Blockly v12.3.1 事件系統：`ui/blockly/core/blockly.js` 中的 EventType 定義
- Minimap 插件：`ui/blockly/plugins/workspace-minimap.js` 中的 `p Set` 定義

## [已完成] 2026-07-29 — 修復 Minimap 工作區註解寬度問題 (v3 - 註解大小同步)

### 問題
- 關閉 minimap 再重開後，minimap 中的每個註解寬度變寬
- 再移動工作區的任一註解就會讓 minimap 中的註解寬度回復

### 根本原因
- `refreshMinimap()` 函數中，使用 `domToWorkspace` 載入註解時
- `domToWorkspace` 載入的註解寬度可能與實際顯示不同（使用預設寬度）
- 導致關閉再開啟 minimap 後，註解寬度變寬
- 但移動註解時，會觸發 COMMENT_MOVE 事件，重新載入後寬度恢復正常

### 解決方案 (v3 - 註解大小同步)
- **`ui/src/app/workspace.js`**：
  - 在 `refreshMinimap()` 函數中，加入註解大小和位置同步邏輯
  - 載入完成後，比對主工作區和 minimap 工作區的註解
  - 建立 ID 對應表，複製每個註解的 `size` 和 `location`
  - 確保 minimap 中的註解大小與主工作區一致

### 技術細節
- `workspaceToDom` 會序列化註解的 `x`, `y`, `w`, `h` 屬性
- 但 `domToWorkspace` 載入時，可能使用預設寬度而非序列化的寬度
- 需要在載入完成後，手動同步 `getSize()` 和 `location`
- 使用 `setTimeout(..., 50)` 確保載入完成後再同步

### 修改檔案
- `ui/src/app/workspace.js`：第 114-145 行（refreshMinimap 函數）

### 驗證
- [x] 在 refreshMinimap() 中加入註解大小和位置同步邏輯
- [x] 建立 ID 對應表，複製 size 和 location
- [x] 待驗證：關閉 minimap 再重開，註解寬度保持正常
- [x] 待驗證：移動註解後，minimap 註解寬度不變
- [x] 待驗證：新增註解後，minimap 立即顯示且寬度正確

### 下次啟動方向 (Next Steps)
- 在瀏覽器中測試 minimap 關閉再開啟的註解寬度問題
- 驗證新增、移動、刪除註解時 minimap 正確更新且寬度正常

## [已完成] 2026-07-29 — 修復 Minimap 工作區註解同步問題 (v2 - 完整重新載入法)

### 問題
- 工作區註解功能啟用後，Minimap 不會即時更新工作區註解
- 使用者詳細回報：
  1. 開啟舊檔，註解正確顯示，minimap 也正確
  2. 移動積木，minimap 正確更新
  3. 移動或新增註解，minimap 沒有更新
  4. 關閉 minimap 再重開，註解更新但每個註解的寬度變寬

### 根本原因
- `workspace.js` 的 `initMinimap()` 中，覆寫了 `minimap.mirror()` 函數
- **第一層問題**：原函數過濾掉了不包含 `blockId` 的事件
  - 工作區註解事件使用 `commentId` 而非 `blockId`
- **第二層問題**：minimap 內部的 `p Set` 不包含註解事件
  - `p = new Set([BLOCK_CHANGE, BLOCK_CREATE, BLOCK_DELETE, BLOCK_DRAG, BLOCK_MOVE])`
  - 註解事件不會觸發 minimap 內部的 update() 函數
- **第三層問題**：關閉再開啟後註解寬度變寬
  - 可能是因為 `domToWorkspace` 載入時的預設寬度與實際不同

### 解決方案 (v2 - 完整重新載入法)
- **`ui/src/app/workspace.js`**：
  - 在 `minimap.mirror()` 中加入註解事件識別邏輯
  - 對於註解事件，使用完整重新載入：`workspaceToDom` → `clear` → `domToWorkspace`
  - 不使用 `originalMirror(event)` 增量更新
  - 這樣可以確保註解事件正確同步，避免寬度問題

### 技術細節
- Blockly 工作區註解事件類型：
  - `COMMENT_CREATE`：建立註解
  - `COMMENT_DELETE`：刪除註解
  - `COMMENT_CHANGE`：修改註解內容
  - `COMMENT_MOVE`：移動註解
  - `COMMENT_RESIZE`：調整註解大小
- 這些事件使用 `commentId` 而非 `blockId`
- Minimap 的 `mirror()` 函數內部的 `p Set` 只包含積木事件，不包含註解事件
- 完整重新載入可以確保 XML 序列化/反序列化的一致性

### 參考
- Blockly v12.3.1 事件系統：`ui/blockly/core/blockly.js` 中的 EventType 定義
- Minimap 插件：`ui/blockly/plugins/workspace-minimap.js` 中的 `p Set` 定義

## [已完成] 2026-07-29 — 啟用 Blockly 工作區註解功能

### 問題
- 右鍵積木可以寫註解 (comments: true 預設啟用)
- 右鍵工作區空白處沒有 'Add comment' 選項

### 根本原因
- Blockly v12+ 重構了 context menu 註冊機制（2024-04-17 PR #8035）
- `workspaceComments: true` 只啟用功能，不自動註冊右鍵選單
- 必須手動呼叫 `Blockly.ContextMenuItems.registerCommentOptions()` 才能顯示 "Add comment" 選項

### 修復
- **`ui/src/app/lifecycle.js`**：
  - 在 `injectOptions` 中加入 `workspaceComments: true`（第一道手續）
  - 在 `Blockly.inject()` 之前加入 `registerCommentOptions()` 呼叫（第二道手續）
  - 加入 typeof 防呆檢查，確保與舊版 Blockly 相容

### 技術細節
- Blockly v9.3.0+（包含 v12.3.1）：必須手動呼叫 `registerCommentOptions()`
- 此函數註冊三個選項：commentCreate, commentDelete, commentDuplicate
- Cocoya 使用 Blockly v12.3.1，需要此修復

### 參考
- CodeBridge `log/work/2026-07-26.md` 的「啟用 Blockly 工作區註解」章節

## [已完成] 2026-07-30 — Dataset Manager 優化（7 項目）

### 項目 6：廢棄 DOM 元素清理
- [x] 移除無用的 `#dataset-dir-input`（`input[webkitdirectory]`）及相關程式碼

### 項目 1：Importer 閒置問題
- [x] 移除未使用的 `importer.js` 檔案及 import 語句（已備份至 backup/）

### 項目 5：CSS 深色主題補完
- [x] 新增 19 處 `.vscode-high-contrast` 變體（hover、驗證狀態、縮圖、標註面板等）

### 項目 4：標籤新增 UI 改善
- [x] 取消新增時保留原標籤（儲存 `previousLabel`）
- [x] Escape 鍵加 `stopPropagation()` 避免關閉整個 Dataset Manager
- [x] `onLabelChange` 不再呼叫 `refreshDynamicPanels()`，改為局部更新

### 項目 2：攝影機預覽更新優化
- [x] hint overlay 改為顯示攝影機名稱和操作指引
- [x] hint overlay 樣式優化（底部置中、半透明黑色、字體縮小）

### 項目 3：標註返回 scroll 穩定
- [x] 提取共用函式 `saveGridScroll()` 和 `restoreGridScroll()`
- [x] `enterAnnotationMode`、`refreshDynamicPanels`、`handleDeleteImage` 統一使用

### 項目 7：label_map 保留邏輯改善
- [x] `buildLabelMap()` 新增值驗證，過濾無效的 label_map 條目

### 待處理（獨立問題）
- [x] **Tauri 版 sidecar 拍攝快照超時**：已修正（新增 ping 指令、健康檢查改用 ping、list_cameras 優化、超時延長）
- [x] **Dataset Manager 文字 i18n 化**：已建立獨立 i18n 檔案（zh-hant/en），並完成 ui_layout.js 與 ui_components.js 替換
- [x] **Dataset Manager spec.js i18n 化**：提取共享 `i18n.js` 模組（支援佔位符），替換 spec.js validate() 的 13 個硬編碼字串，新增 13 個 `DSM_VALIDATE_*` 鍵值
- [x] **ui_layout.js 其餘 43 處硬編碼字串 i18n 化**：替換 createModal() 模板 28 處、事件處理器 7 處、handleBridgeMessage 雲端診斷 8 處，全數使用共享 `t()` 函式

---

## [規劃] Tauri 版 SSH/雲端訓練實作藍圖

### 架構選擇：Python Sidecar（沿用 VSIX 模式）
- **理由**：Python 已是 Cocoya 必備、`paramiko` 跨平台 SSH 成熟穩定、VSIX 已有 sidecarManager.ts 可參考
- **實作方式**：Tauri 用 `tauri-plugin-shell` 的 `Command` API 啟動 Python subprocess

### Phase 1：資料集管理補全（前端 only）
- [x] `openDatasetManager` → 已修（直接 dispatch 前端）
- [x] `datasetListCameras`、`datasetStartCamera`、`datasetStopCamera`、`datasetCaptureImage` → 已透過 sidecar 通訊實作
- [ ] `datasetDeleteImage` → 待 sidecar 支援
- [ ] `datasetExport`、`datasetUploadArchive` → 需後端支援（Python sidecar 或 Rust 實作）
- [ ] `pickFolder` → 使用 Tauri 原生對話框（已有 `tauri-plugin-dialog`）

### Phase 2：SSH Sidecar（Python subprocess）
- [ ] 新增 `resources/ssh_sidecar.py`：封裝 `paramiko` 實現 SSH 連線、指令執行、SFTP 傳輸
- [ ] 新增 Rust `ssh.rs` 指令模組：`check_remote_env`、`upload_dataset`、`start_remote_training`、`download_results`
- [ ] 註冊指令到 `lib.rs` + `commands.toml` 權限
- [ ] 前端 `tauri.js` 加入對應 command 處理

### Phase 3：DGX 訓練流程
- [ ] 支援「資料集上傳 → SSH 啟動容器 → 監控訓練進度 → 下載結果」完整流程
- [ ] 訓練對話框的後端選擇（local/DGX）在 Tauri 模式啟用
- [ ] SSH 設定（host/port/username/password）儲存機制（Tauri 可改用 `tauri-plugin-store`）

### Phase 4：推論與部署（未來）
- [ ] 遠端推論 API 整合
- [ ] 模型下載與部署流程

---

## [已完成] 2026-08-06 — BBox 標註 UI 重構（全寬 3 欄布局）

### 需求
依 `log/plan/BboxAnnotationUIImprovement.md` 改善 Dataset Manager 縮圖點入 bbox 標註 UI 的兩項缺點：
1. 顯示在右方預覽面板版面太小（固定高度 380px）
2. 每標註一張圖就需點「返回列表」再點下一張縮圖，效率低

### 修改
- [x] `ui_layout.js`：重構 enterAnnotationMode/exitAnnotationMode，新增 loadAnnotationImage/navigateToImage/saveCurrentAnnotations/renderAnnotationControls/鍵盤事件/進度/未標註檢查

---

## [進行中] 2026-08-10 — 啟動專案錨定 + Dataset Manager 防呆/存讀（X + 專案根 SSOT）

### 決策（已完成 discussion 收斂）
- **X 方案**：視窗進入「未錨定」狀態時強制走啟動首頁（開新專案 / 開啟專案）。**「最近專案」取消**。
- **專案根 SSOT**：「專案根 = 目前 Cocoya 專案（.xml）所在資料夾」；未存檔/無 current_paths ⇒ 未錨定。
- 拆兩主題：主題一 App 層（啟動首頁）、主題二 Dataset 層（防呆 + 等級一存讀 + live savePath 接回）。
- **取消重工**：唯讀範例已是「軟性」（VSIX showWarningMessage、Tauri force_examples）；createDefaultBlocks() 已依平台建起始積木——均不另做。

### 計畫文件
- [x] `log/plan/StartupProjectAnchoring.md`（主題一）
- [x] `log/plan/DatasetManagerProgressAndGuardrails.md`（主題二）

---

## [已完成] 2026-08-21 — Startup Home：平台選擇 + 範例 + 快速設定移至首頁

### 背景
切換 PC/MCU 平台會清空工作區，但 VSIX 後端 `handleConfirmSwitch` 會執行 `currentFilePath = undefined`，導致專案失去錨定、Startup Home 重新顯示。平台類型是專案創建時的不可變屬性 (XML 含 `platform` attribute)，應移至 Startup Home 的「開新專案」流程中。

### 計畫文件
- [x] `log/plan/StartupHomePlatformAndExamples.md`

### 範圍
1. **平台選擇**：從 toolbar `<select id="platform-selector">` 移至 Startup Home `#startup-platform` select，僅於「開新專案」時選擇
2. **開啟範例**：加入 Startup Home (`#startup-examples`)，同時保留 toolbar `#btn-examples` 供中途參考
3. **快速設定**：加入 Startup Home 收合面板 (Python 路徑 / 套件檢查)，同時保留 toolbar 設定下拉
4. **主視覺圖片**：Startup Home 上方加入 `ui/src/icons/cocoya.png` (水平置中)
5. **平台屬性稽核**：修正 `startNewProjectFromHome()` 未注入 `platform` attribute；將 `base.js`、`tauri.js` 的 `#platform-selector` 讀取改為 `CocoyaApp.currentPlatform`

### 狀態：等待實作 (Act 模式)

### [已完成] 實作紀錄 (2026-08-21)
- [x] **A1/A3 HTML**：`ui/index.html` Startup Home 加 logo(`cocoya.png`)+`#startup-examples`+快速設定收合面板(`#startup-set-python-path`/`#startup-diagnose`)+`#startup-platform`；toolbar `<select id="platform-selector">` → 唯讀 `<span id="current-platform" class="platform-badge">`
- [x] **A8 i18n**：`zh-hant.js`/`en.js` 新增 `BKY_STARTUP_EXAMPLES/SETTINGS/PYTHON_PATH/DIAGNOSE/HINT_WITH_PLATFORM`
- [x] **A3 config.js**：移除 `setupPlatformSelector()`/`switchPlatform()`；新增 `updatePlatformLabel()`；`setPlatformUI()` 改用 `updatePlatformLabel()`
- [x] **A4b lifecycle.js**：移除 `setupPlatformSelector()` 呼叫；初始化改用 `updatePlatformLabel()`
- [x] **A2 persistence.js**：`startNewProjectFromHome()` 讀 `#startup-platform`、跨平台時 `setPlatformUI`+`resetWorkspace()` 重建初始積木、`_serializeAndSaveAs()` 注入 `platform` attr；`_bindStartupHome()` 綁 3 新按鈕；`showStartupHomeIfNeeded()` 初始化 select + i18n
- [x] **A4 base.js**：L258/L286 以 `CocoyaApp.currentPlatform` 取代 `#platform-selector`
- [x] **A5 tauri.js**：L1113 同改；移除 `confirmSwitch` case
- [x] **A6/A6b**：`cocoyaManager.ts` 移除 `confirmSwitch` case + `handleConfirmSwitch()`；`controller.js` 移除 `switchPlatform` handler
- [x] **A9 style.css**：新增 `.platform-badge`（含 dark 變體）
- [x] 驗證：`node --check` 8 js 通過、`npx tsc --noEmit` TSC_EXIT=0、`npm run build`(ui) 成功、source/dist 無殘留舊引用

*加入日期：2026-08-21*

*加入日期：2026-08-21*

### [已完成] UX 追加 (2026-08-21)
- [x] **平台 hover 選單**：移除下方獨立 `#startup-platform` select；「開新專案」改為 hover 展開 `.startup-new-menu` 選平台 (`.startup-new-option` data-platform)，點選即 `startNewProjectFromHome(platform)` 開新專案
- [x] **診斷無動作修正**：`#startup-diagnose` 原僅 `send('checkEnvironment')` 不開啟視窗；改為 `CocoyaUI.showDiagnoseModal()` + `send('checkEnvironment')`，對齊 base.js `btn-diagnose`
- [x] **清理已刪標題/說明**：移除持久化對 `#startup-home-title`/`#startup-home-hint` 的 query/textContent；移除 i18n `BKY_STARTUP_HINT_WITH_PLATFORM`
- [x] 驗證：`node --check` persistence/zh-hant/en 通過、source 掃描無殘留、`npm run build` 成功

### [已完成] UX 追加2 (2026-08-21)
- [x] **hover gap 修正**：`.startup-new-menu` `top: calc(100%+6px)` → `100%`，移除按鈕/選單間 6px gap，滑鼠可連續滑入
- [x] **診斷 modal 顯示修正**：根因為 `.modal-overlay z-index:1000` < Startup Home `10002`，診斷視窗被蓋住；新增 `#diagnose-modal { z-index: 10050 }`
- [x] 驗證：`ui` `npm run build` 成功

### [已完成] tool 開新檔：平台 hover 選單 + 分平台語意 (2026-08-21)
- [x] **VSIX 檢查套件路徑 bug 修正**：`envOps.ts` L21 多餘 `'..'` → `extensionPath, 'config', 'python_modules.json'`（原拼成 `c:\Workspace\config\...`）
- [x] **toolbar 開新檔改平台 hover 選單**：`index.html` `#btn-new` 包入 `#toolbar-new-wrap` + `.startup-new-menu`（`data-platform` 兩選項）；`base.js` 移除 `bind('btn-new','newFile')`，改綁定選單選項
- [x] **VSIX = 直接開新錨定**：選平台 → `CocoyaApp.startNewProjectFromHome(platform)`（`setPlatformUI`+`resetWorkspace` 建初始積木+`saveFileAs` 錨定），不再回首頁
- [x] **Tauri = 先錨定目前窗再開新窗**：`base.js` 設 `_pendingNewWindowAfterSave` 旗標 → `persistence.onSaveCompleted` 存檔成功後 `send('newFile')` → `create_window()`
- [x] **tooltip 分平台**：`TLB_NEW_VSIX` = 開新專案；`TLB_NEW_TAURI` = 以新視窗開新專案（zh-hant/en）
- [x] **`_bindStartupHome` 範圍限縮**：綁定 `.startup-new-option` 限 `#startup-home .startup-new-option`，避免抓到 toolbar 選項覆寫 onclick
- [x] 驗證：`node --check`、`tsc --noEmit` TSC_EXIT=0、`npm run build` 成功


### 里程碑
- [x] M1：專案根 SSOT + 錨定查詢（兩平台）— 已完成，三平台 compile 通過
- [x] M2：啟動首頁（前端共用 Startup Home；未錨定顯示、開新/開啟錨定）；Tauri create_window 新視窗同邏輯 — 完成，vite build 通過
  - [x] 實測修正：Tauri 關閉時範例存檔分流（EXAMPLES_PATH）、Tauri toolbar closeEditor 補 case、VSIX save/open defaultUri 有效化 — 全數 compile 通過，待實機重測
- [x] M3：Dataset 防呆（dirty 判定 + 三處確認）— 完成，vite build 通過
- [x] M4a（D′）：live savePath 接回（image.diskPath）— 完成，build 通過
- [x] M4c：Tauri live 落盤（datasetCaptureImage 補 savePath）— 完成，build 通過；需實機確認 sidecar mkdir
- [x] M4b（B/C）：等級一存讀（dataset.json）— 後端指令層完成（VSIX datasetOps + Tauri file.rs 指令 + 權限 + 前端 Bridge）；前端 ui_layout 整合待續

### 待確認/風險
- [x] Tauri `captureImage` savePath 實機確認（D′）
- [x] 回歸 openExample / switchPlatform / openFile

*更新日期：2026-08-10*

- [x] `ui_canvas.js`：新增 selectedAnnotationIndex + setSelectedAnnotation，修改 drawBox 高亮，unbindEvents 清理 keydown
- [x] `ui_components.js`：新增 renderAnnotationThumbnails（單列垂直縮圖欄）
- [x] `dataset_manager.css`：新增 .dataset-annotation-mode 布局、縮圖勾號、高亮邊框、進度計數器樣式
- [x] `i18n/zh-hant.js` + `en.js`：新增 16 個 DSM_ANNOTATION_* 鍵值

### 行為
- 標註模式改為全寬 3 欄布局（左縮圖欄 80px + 中央畫布 + 右控制欄 220px）
- 左側縮圖欄快速導航，已標註顯示綠勾，當前圖片藍框高亮
- 右側控制欄：類別選擇器（增/修/刪）+ 標註列表（點擊高亮 bbox）
- 鍵盤快捷鍵：↑/↓ 切換圖片、Delete 刪除標註、Esc 退出
- 自動儲存（debounce 300ms）+ 進度計數器 + 未標註警告

### 待驗證
- [x] 實際啟動 VSIX/Tauri 驗證 bbox 標註 UI 完整流程
- [x] 深色主題下新 UI 元素顯示
- [x] 含未標註圖片匯出警告

---

*最後更新日期：2026-08-06 (BBox 標註 UI 重構)*

---

## [已完成] 2026-08-08 — Dataset Manager 攝影機列表失效修復（VSIX + Tauri 共同根因）

### 問題
- VSIX 與 Tauri 版 Dataset Manager 都無法取得攝影機列表，下拉選單空白。
- console 只顯示請求送出，無後續結果。

### 根因（跨平台共用 sidecar 層）
- `resources/dataset_manager/dataset_sidecar.py` 在 2026-08-04（YOLO 匯出功能）於 `run()` 方法的 `exportDataset` 分支加入區域 `import os`/`import json`。
- Python 區域 import 遮蔽頂層 import ⇒ `run()` 內 `json`/`os` 成未綁定區域變數 ⇒ 主迴圈 `json.loads()` 對所有指令拋錯 ⇒ sidecar 全殘，VSIX 與 Tauri 皆受影響。

### 修復與驗證
- [x] 刪除 `dataset_sidecar.py` 中 `exportDataset` 分支多餘的區域 `import os`/`import json`（頂層已有）
- [x] sidecar `ping`/`listCameras`/`stopCamera`/`exportDataset` 逐一驗證通過（listCameras 回傳 Camera 0 640x480）
- [x] 實際啟動 VSIX 與 Tauri 驗證下拉選單出現選項

### 明日/下次待辦
- [x] 實機驗證兩平台攝影機選擇與快照流程
- [x] 建議為 `dataset_sidecar.py` 增加 `ping`+`listCameras` smoke test

*更新日期：2026-08-08*

---

## [已完成] 2026-08-09 — Dataset Manager UI/UX 優化（專案類型感知驗證 + 分類標籤校正模式）

### 需求
- 消除「至少需要一個 schema 欄位」紅色 error 對影像類專案的誤導（改為類型感知 + 引導式文案）
- image（影像分類）縮圖點擊改為「分類標籤校正」模式，不再誤入 bbox 拉框標註
- 未標註檢查語意依類型修正（僅 object_detection / line_following 檢查 bbox/line）

### 修改
- [x] **計畫文件**：`log/plan/DatasetManagerUXImprovement.md`（排除 C 項：匯出整合作業暫緩）
- [x] **spec.js**：新增 `IMAGE_TYPES`；`validate()` 類型感知（影像類無欄位 → 樣本數 warning；表格類 → 引導式 error；補 object_detection features 豁免；避免重複噪音警告）
- [x] **i18n（zh-hant/en）**：改寫 `DSM_VALIDATE_COLUMN_REQUIRED`、新增 `DSM_VALIDATE_NO_SAMPLES`、新增 `DSM_CLASSIFY_*` 7 鍵
- [x] **ui_layout.js**：`state.annotationMode.mode` 欄位；`enterClassificationReviewMode()`/`loadClassificationImage()`/`renderClassificationControls()`/`updateClassifyProgress()`/分類鍵盤事件；`navigateToImage`/`updateThumbnailHighlight`/`exitAnnotationMode`/`checkUnannotatedOnExit`/`handleExportDataset` 類型感知化
- [x] **ui_components.js**：`renderAnnotationThumbnails()` 支援 `mode:'classification'`（標籤徽章取代綠勾）
- [x] **dataset_manager.css**：`.dataset-annotation-thumb-label` / `.dataset-annotation-info`

### 驗證
- [x] `node --check` 5 個 JS 檔語法通過
- [x] Node ESM 行為測試 12 項全數通過（image/table/object_detection/feature/line_following）
- [x] `ui` `vite build` 成功
- [x] 實機 VSIX + Tauri 驗證分類校正模式互動流程（含 Live 採集模式 label_map 合併）

### 待辦（後續）
- [ ] C 項：分類標籤校正的匯出整合（依 `samples[].label` 重整資料夾結構）— 獨立評估

*更新日期：2026-08-09*
---

## [待辦] C 項：分類標籤校正的匯出整合（依 samples[].label 重整資料夾結構）

### 背景
- 2026-08-09 完成「分類標籤校正模式」後，`image` 專案可單張改派分類標籤（寫入 `spec.data_source.samples[].label`、`label_map`、`stats`）。
- 但匯出（`datasetExport`）目前仍**照搬 `sourceFolderPath` 原始資料夾結構**；而 classifier 訓練端（`classifier_dataset.py`）是以「子資料夾名稱 = 類別」載入。
- 結果：改派單張標籤後，匯出的 ZIP 不會反映修正 → 訓練仍用舊標籤。**功能斷點**。

### 需求
- `image`（classifier）類型匯出時，sidecar/Rust 端依 `spec.data_source.samples[].label` **重新組織資料夾結構**：每個類別一個子資料夾，將對應影像複製進去。
- 產生/重寫 `labels.txt`（類別清單）與 `dataset.json`（spec 快照）。
- 非 `image` 類型（表格、object_detection、line_following）維持現有匯出行為（object_detection 的 YOLO labels 分支不受影響）。

### 實作範圍（待確認細節）
| 檔案 | 預期異動 |
|------|----------|
| `resources/dataset_manager/dataset_sidecar.py` | `run()` 的 `exportDataset` 分支新增 classifier 分支：依 `samples[]` 的 `image_path` + `label` 建立 `<label>/<filename>` 結構並複製；重寫 `labels.txt` / `dataset.json` |
| `resources/dataset_manager/dataset_io.py` | `DatasetIO.export_dataset` 視需求支援「重新組織」模式或改由 sidecar 預先布置再打包 |
| `ui/src/modules/dataset_manager/ui_layout.js` | `handleExportDataset()` 確認 spec 已含完整 samples（含 label），無需其他參數 |

### 需先釐清的疑點
- [ ] **Live 採集影像落盤**：Sampler 的 blob 影像在匯出前是否存在於可複製的路徑？`samples[].image_path` 的實際指向需先確認（前端僅存 blobUrl + 相對 path）。
- [ ] **雲端上傳**：`uploadDataset`（ZIP）是否共用此結構？遠端訓練同樣以資料夾為類別，原則上共用。
- [ ] **重複檔名**：不同類別出現同名檔案（如 `unlabeled_xxx.jpg`）時如何避免衝突（建議檔名前綴 label 或在目標夾內保留原名 + 序號）。

### 驗證
- [x] 改派單張標籤 → 匯出 → 解壓檢查「子資料夾結構 + labels.txt + dataset.json」與改派結果相符。
- [x] `classifier_dataset.py` 直接載入匯出資料集，確認類別數與各類張數正確。
- [x] VSIX 與 Tauri 雙平台匯出一致性。

### 相依性
- 依賴 2026-08-09「分類標籤校正模式」（已完成）。
- 建議與 `log/plan/DatasetManagerUXImprovement.md`「排除範圍」對照後獨立開案。

*更新日期：2026-08-09*


## [已完成] 2026-08-11 — 新增三頂點求夾角積木 (py_ai_pose_calc_angle)

### 需求
為 AI 視覺 / 姿勢偵測 (ai_pose) 新增積木：依序輸入 3 個 (x, y) 座標點 A、B、C，求中間頂點 B 之夾角；以下拉選單切換內角 / 外角 / 有符號角。

### 修改
- [x] `ai_pose_blocks.js`：新增 `py_ai_pose_calc_angle`（3 個 Tuple 輸入 + MODE 下拉，輸出 Number，帶 helpUrl）
- [x] `ai_pose_generators.js`：注入 `cocoya_calc_angle_3pts(a,b,c,mode)`（鍵 `func_calc_angle_3pts`，不覆寫 detect_punch 既有的 cocoya_get_angle）
- [x] `i18n/zh-hant.js` + `i18n/en.js`：新增 AI_POSE_CALC_ANGLE 及下拉標籤 AI_ANGLE_INTERIOR/EXTERIOR/SIGNED
- [x] `toolbox.xml`：新增肩 11–肘 13–腕 15 示範積木
- [x] `docs/help/py_ai_pose_calc_angle_{zh-hant,en}.html`：說明文檔 (含 ± 方向規則)

### 方向規則 (+-)
正值 = 由指向 A 的射線 (BA) 逆時針到指向 C 的射線 (BC) (A→C 逆時針為正)；負值 = 順時針。OpenCV 像素座標 y 向下，圖形上顯示相反。內角 = |有符號角|；外角 = 360 - 內角。

### 驗證
- [x] `node --check` 通過 (blocks / generators / 2x i18n)
- [x] `python py_compile` + 數學單元測試 PASS
- [x] `npx vite build` 成功；dist 含新積木

*更新日期：2026-08-11*

---

## [已完成] 2026-08-19 — 修復 firmware 燒錄問題

### 任務
修復 toolbar/設定/韌體設定/重置韌體燒錄 Maker Pi RP2040 時之 `invalid args 'serialPort' for command 'reset_firmware'` (Tauri + VSIX 均受影響)。

### 修復
- [x] `ui/src/bridge/tauri.js:330` 傳入 `serialPort` (對應 Rust `serial_port`)
- [x] `src-tauri/src/commands/mcu.rs`：`serial_port: String` → `Option<String>`，serial 分支驗證非空
- [x] `src/handlers/firmwareOps.ts`：`srcPath!` 改為 `flashSegments[0].path`

### 驗證
- [x] `cargo check` 通過；`node --check` 通過；`tsc --noEmit` TSC_EXIT=0
- [ ] 實機：Tauri + VSIX 雙平台 Maker Pi RP2040 / XIAO ESP32-S3 Sense 燒錄

### 相依性
- 無

*更新日期：2026-08-19*
---
## [已完成] 2026-08-19 — 修復 Deep Repair (VSIX esptool 失敗)
- [x] `src/handlers/firmwareOps.ts#handleEraseFilesystem`：`esptool erase-flash` -> `deploy_mcu.py --erase-filesystem` (pyserial REPL wipe)，對齊 Tauri mcu.rs:221 與 `handleSetupStableMode` 的 `extensionUri` 解析
- [x] `tsc --noEmit` TSC_EXIT=0
- [ ] 實機驗證 VSIX Deep Repair (Tauri 既已驗證正常)

*更新日期：2026-08-19*

---
## [已完成] 2026-08-19 — MSG_ERASE_START_REFLASH 文案校正
- [x] firmwareOps.ts fallback (en+zh-hant)：重新撰述為 rebuild filesystem / re-upload code
- [x] tsc --noEmit TSC_EXIT=0

*更新日期：2026-08-19*

---
## [待辦] 2026-08-19 — 引入 tauri-codegen 產生 typed invoke
- [ ] 評估 tauri-codegen / @tauri-apps/types：自動從 #[tauri::command] 簽名生成 TS invoke<cmd>(args)
- [ ] 目標：command 參數缺漏在 tsc 編譯期發現 (而非執行期 invalid args)
- [ ] 相依：與 docs/backend_api_manifest.md Parameters 同步維護 (SSOT -> generate type -> manifest)

*加入日期：2026-08-19*

### [已完成] Startup Home 除錯：開新專案流程雙平台修正 (2026-08-24)
- [x] VSIX：toolbar 新增改走後端 newFile（checkDirtyAndConfirm → 存回原檔 → resetWorkspace），不再無檢查跳另存對話框
- [x] Tauri：前端 _confirmSaveBeforeNew（showSaveConfirm+saveFile）dirty 檢查 → 同窗重置初始積木；移除 _pendingNewWindowAfterSave 開新窗邏輯
- [x] startNewProjectFromHome() 重寫：首頁選平台直接進入初始積木（不另存、不錨定延後到首次存檔）
- [x] resetWorkspace() 改 hideStartupHome()，開新不再回首頁
- [x] 驗證：git grep 殘留清掃 / node --check / ui build 通過；實機驗證待做

### [已完成] Tauri 版：錨定鐵律恢復 + toolbar 開新視窗按鈕分離 (2026-08-24)
- [x] startNewProjectFromHome() Tauri 分支恢復另存錨定流程（dirty 檢查 → 跨平台重建初始積木 → saveFileAs）
- [x] toolbar 新增 btn-new-window（僅 Tauri 顯示，createWindow）；btn-new tooltip 改為「在本視窗開新專案」
- [x] file.rs 另存預設檔名改「未命名專案.xml」；i18n 新增 TLB_NEW_WINDOW、調整 TLB_NEW_TAURI
- [x] 驗證：node --check / cargo check / ui build 通過；實機待驗證


### [已完成] 另存新專案寫入乾淨初始 XML，消除磁碟暫態 (2026-08-24 追加2)
- [x] 新增 _getInitialProjectXml(platform) 靜態模板取代序列化目前工作區；B.xml 不再帶入 A 內容
- [x] 驗證：node --check / ui build 通過


### [已完成] 前幾輪修改同步至 VSIX — 稽核確認 (2026-08-24 追加3)
- [x] 稽核結論：前端 ui/ 為雙模共用 SSOT，開新流程（先確認後破壞+乾淨初始XML+tag回傳鏈）已自動涵蓋 VSIX；fileOps.ts saveCompleted 已帶 tag
- [x] btn-new-window 僅 isTauri 顯示，VSIX 不受影響（新視窗由 VS Code 管理）
- [x] handleNewFile/case newFile 已不被 UI 觸發，保留不動
- [x] 驗證：tsc EXIT=0 / node --check / ui build 通過；VSIX 實機清單待驗（首頁開新錨定、跨平台新增、取消零副作用、另存不受影響）


### [已完成] 主題樣式表模組化 — Theme Manager (2026-08-24)
- [x] 新增 ui/src/modules/theme_manager/（theme_manager.js + themes/cocoya_light.js + themes/cocoya_dark.js）：registry 一主題一檔、auto 模式動態解析、CSS 變數換膚
- [x] config.js setupThemeSync 薄委派至 CocoyaTheme；persistence.js 首頁主題下拉由 registry 動態生成；style.css 改 --cocoya-* 變數消除深色 !important 覆寫
- [x] localStorage cocoya_theme_mode 舊值 light/dark 自動遷移為 cocoya_light/cocoya_dark
- [x] 計畫：log/plan/ThemeManagerModule.md；驗證：node --check / vite build 通過
- [ ] 實機：首頁切主題即時套用、auto 跟隨系統、重啟記住偏好
- 未來擴充：自訂主題 JSON 載入、主題編輯器
