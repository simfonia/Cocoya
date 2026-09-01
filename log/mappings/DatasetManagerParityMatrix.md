# Dataset Manager VSIX/Tauri Parity Matrix

> 建立日期：2026-08-26
> 對應施工：`log/plan/DatasetManagerRefactorImplementationGuide.md` Stage 0
> 狀態定義：`MATCHED` = 已確認語意一致；`PARTIAL` = 兩端都有實作但契約或行為尚未一致；`BLOCKED` = 一端缺少實作或無法驗證；`N/A` = 明確不適用。
>
> 本文件是施工期間的契約盤點表，不取代 `docs/backend_api_manifest.md` 的 Tauri command 參數文件。任何契約變更必須同步更新本表、backend manifest、Dataset Manager mapping 與工作日誌。

## 1. 平台與實作入口

| 平台 | 前端入口 | 後端入口 | 回應通道 |
|---|---|---|---|
| VSIX | `ui/src/bridge/vsix.js`、`ui/src/modules/dataset_manager/*` | `src/cocoyaManager.ts`、`src/handlers/datasetOps.ts` | `webview.postMessage` -> `BaseBridge._dispatchToFrontend` |
| Tauri Dev/Release | `ui/src/bridge/tauri.js`、`ui/src/modules/dataset_manager/*` | `src-tauri/src/commands/file.rs`、`dataset.rs`、`src-tauri/src/lib.rs` | Tauri invoke/event -> `BridgeTauri._dispatchToFrontend` |

## 2. Dataset Manager command parity

| 功能 | 前端 command | VSIX 實作 | Tauri 實作 | 目前狀態 | 必要驗證 |
|---|---|---|---|---|---|
| 開啟管理器 | `openDatasetManager` | `cocoyaManager.ts` dispatch | `tauri.js` dispatch | MATCHED | VSIX/Tauri modal 開啟一次 |
| 選取資料夾 | `pickFolder` | `handlePickFolder`，掃描影像並回 `folderSelected` | `pick_folder`，Rust 掃描並回 `folderSelected` | PARTIAL | 欄位、排序、路徑、取消與 label map 一致 |
| 列出 camera | `datasetListCameras` | `handleDatasetListCameras` -> sidecar `listCameras` | `tauri.js` `_handleDatasetCommand` -> sidecar | PARTIAL | response、空清單、timeout、sidecar 未啟動 |
| 啟動 camera | `datasetStartCamera` | `handleDatasetStartCamera` | Tauri sidecar `startCamera` | PARTIAL | deviceId、狀態事件、重複啟動 |
| 停止 camera | `datasetStopCamera` | `handleDatasetStopCamera` | Tauri sidecar `stopCamera` | PARTIAL | 已停止、關閉 modal、事件清理 |
| 擷取影像 | `datasetCaptureImage` | `handleDatasetCaptureImage` | Tauri `_handleDatasetCommand('captureImage')` | PARTIAL | requestId、base64、savePath、路徑與 timeout |
| 刪除影像 | `datasetDeleteImage` | `handleDatasetDeleteImage` | `delete_file` | BLOCKED | 路徑 confinement、不存在檔案、雙平台錯誤語意 |
| 匯出資料集 | `datasetExport` | `handleDatasetExport` -> sidecar `exportDataset` | `export_dataset` -> sidecar | PARTIAL | ZIP 內容、dataset.json、取消、Release resource |
| 雲端 ZIP 上傳 | `datasetUploadArchive` | `handleDatasetUploadArchive`，分塊後 SFTP | `dataset_upload_chunk` 分塊落地後以 `sidecar_send(uploadDataset)` SFTP | PARTIAL | 需通過分塊、亂序/缺塊、取消、錯誤、SSH 與 Release 驗證 |
| 儲存進度 | `datasetSaveProgress` | `handleDatasetSaveProgress`，canonical `<root>/dataset/<name>/dataset.json`，名稱驗證 + `errorCode` | `dataset_save_progress`，canonical path、名稱驗證 + `CODE:` 前綴錯誤 | PARTIAL | 兩端 round-trip 手動驗證後升 MATCHED |
| 載入進度 | `datasetLoadProgress` | direct 優先 → 恰一候選 fallback → NOT_FOUND/AMBIGUOUS + `candidates` | 同左（Rust 實作同一契約） | PARTIAL | save/load round-trip、legacy path、AMBIGUOUS 案例、JSON invalid 手動驗證 |
| 遠端環境檢查 | sidecar `checkRemoteEnvironment` | `datasetOps` sidecar 流程 | Tauri 前端目前沒有等價 upload/remote adapter | BLOCKED | 若列入 Dataset Manager parity，需補 Tauri；否則標為本次 scope 外 |

## 3. Event 與 payload contract

| 事件 | 發送來源 | 必要欄位 | VSIX | Tauri | 目前狀態 |
|---|---|---|---|---|---|
| `folderSelected` | pick folder | `requestId`, `path`, `images`, `labelCounts`, `labelMap`；錯誤時 `error` | `postMessage` | `_dispatchToFrontend` | PARTIAL |
| `datasetCameraListResult` | list cameras | `success`, `cameras` | `postMessage` | `_dispatchToFrontend` | PARTIAL |
| `datasetCameraStatus` | start/stop/status | `success` | `postMessage` | sidecar event轉換後 dispatch | PARTIAL |
| `datasetCaptureResult` | capture | `requestId`, `success`, `base64`, `width`, `height`, `label`, `savePath`, `error?` | sidecar response 原樣轉發 | Tauri 組裝後轉發 | PARTIAL |
| `datasetDeleteImageResult` | delete | `success`, `error?` | `postMessage` | `_dispatchToFrontend` | PARTIAL |
| `datasetExportResult` | export | `success`, `path?`, `error?` | `postMessage` | `_dispatchToFrontend` | PARTIAL |
| `datasetUploadResult` | upload | `success`, `error?` | `postMessage` | `sidecar_send(uploadDataset)` 結果轉發 | PARTIAL |
| `datasetSaveProgressResult` | save | `success`, `path?`, `error?` | `postMessage` | `_dispatchToFrontend` | PARTIAL |
| `datasetLoadProgressResult` | load | `success`, `hasProgress`, `spec?`, `path?`, `error?` | `postMessage` | `_dispatchToFrontend` | PARTIAL |
| `sidecar-log` | Tauri sidecar stderr | string payload | N/A | 已改用 `emit_to(window_label, ...)` | MATCHED（需雙窗實測） |
| `sidecar-event` | Tauri sidecar stdout event | string JSON payload | N/A | 已改用 `emit_to(window_label, ...)` | MATCHED（需雙窗實測） |

## 4. Contract rules

### 4.1 Request correlation

- 所有可並行的 request 必須有唯一 `requestId`。
- response 必須回傳相同 requestId；不能以「最新一次請求」或全域 singleton 推定。
- timeout、取消、視窗關閉時必須移除 listener、timer 與 pending request。
- 重複或遲到 response 不得再次修改 UI state。

### 4.2 Path semantics

Canonical save path（**已決策，2026-08-26**）：

```text
<專案根>/dataset/<資料集名稱>/dataset.json
```

用詞鐵律：**「專案」一律指 xml 積木專案**；`dataset/` 下的子資料夾名稱 = **資料集名稱**（Dataset Manager 表單 projectName 欄位的值）。程式碼內部識別字 `projectName`/`project_name` 承載的是「資料集名稱」語意，不得在文件中稱之為「專案名」。

**匯入閘門（2026-08-26 產品決策）**：資料集必須位於 `<專案根>/dataset/<專案名>`。使用者選擇其他資料夾匯入時，提示複製一份到 canonical 目錄（不覆寫已存在檔案）；拒絕則中止匯入。實作：`dataset_import_from_folder` command（兩端）+ 前端 `handleDirectoryImport` 閘門；錨定與 canonical 計算由後端裁決。

**進入閘門（2026-08-26）**：開啟 Dataset Manager 前先經 `getProjectAnchor` bridge 方法查詢後端權威錨定（VSIX currentFilePath / Tauri `get_project_anchor`），未錨定一律擋下；capabilities 快照不作為依據。

**載入精簡（2026-08-26，取代稍早的 fallback 決策）**：canonical-only 匯入閘使 `datasetLoadProgress` 的 folderPath 必為 canonical 目錄，兩端已精簡為 direct 讀取；無檔案回 `PROGRESS_NOT_FOUND`。先前之 `dataset/*` fallback 掃描、`PROGRESS_AMBIGUOUS`/`candidates` 與 core `decideProgressLoadPath` 均已移除（死碼清理）。

已以純函式固化在 `core/pathPolicy.js`，並有 `core/pathPolicy.test.mjs` Node contract 測試覆蓋。

三項路徑契約決策（2026-08-26 產品確認）：

1. **`datasetLoadProgress` 輸入語意**：單一 `folderPath`，並容 dataset directory 與 project root。決策純函式 `decideProgressLoadPath(folderPath, facts)`：
   - `<folderPath>/dataset.json` 存在 → 直接使用（最高優先，現行行為）。
   - 指向 project root 且 `dataset/` 下**恰一個**含 `dataset.json` 的子目錄 → fallback 該份。
   - 候選 0 個 → `PROGRESS_NOT_FOUND`；≥2 個 → `PROGRESS_AMBIGUOUS`（附候選清單，不得自動猜測；UI 可用表單 project name 比對候選）。
2. **Legacy path 策略**：唯讀相容——讀取時 legacy `<folder>/dataset.json` 與 canonical 雙讀（canonical 存在時優先）；寫入一律 canonical，不回寫 legacy。兩處皆有且內容不同時以 canonical 較新 mtime 為準並提示使用者，不靜默合併。
3. **統一 error code 集**：core 以 `{ ok, code }` 回傳；bridge 兩端 result payload 增加 `errorCode` 欄位（保留 `error` 字串向後相容）。代碼集：`PROJECT_ROOT_REQUIRED`、`PROJECT_NAME_INVALID`、`PROJECT_NAME_REQUIRED`、`IMAGE_PATH_ABSOLUTE`、`IMAGE_PATH_TRAVERSAL`、`PATH_OUTSIDE_ROOT`、`PROGRESS_NOT_FOUND`、`PROGRESS_AMBIGUOUS`、`JSON_INVALID`、`IO_ERROR`。前端驗證僅快速失敗，symlink/越界最終裁決在後端做第二道防線。

**尚未接入流程**：save/load 後端（VSIX handler、Tauri Rust/bridge）仍依舊路徑推導；接入需另開切片並同步 backend manifest。delete 已於前端接入 `validateDeletableImagePath` 預檢。

在 Stage 1 完成前，以下事項不得視為已定案：

- `datasetLoadProgress` 的輸入是 project root、dataset directory，或允許兩者。
- 外部來源資料夾與 canonical dataset directory 的關係。
- legacy folder path 的相容讀取方式。
- VSIX/Tauri 對非法、越界、symlink 與不存在路徑的錯誤語意。

### 4.3 Serialization rules

- Rust 回傳給前端的 struct 必須使用 `#[serde(rename_all = "camelCase")]`。
- VSIX/Tauri 對外欄位名稱統一使用 camelCase，例如 `labelCounts`、`labelMap`、`hasProgress`、`savePath`。
- 需要相容舊資料時，在 adapter 層 normalize，不把 snake_case 判斷散落到 UI。

### 4.4 Error rules

每個 command 至少要區分：

- 使用者取消：可靜默處理或回傳可識別的 `Canceled`。
- 使用者輸入錯誤：回傳穩定 error code 與可翻譯參數。
- 平台/資源錯誤：記錄原始錯誤，對 UI 回傳不含秘密的可讀錯誤。
- timeout：明確標示 timeout，不與一般 sidecar error 混用。

## 5. Current blockers

| ID | Blocker | 影響 | 解除條件 |
|---|---|---|---|
| P0-01 | Tauri `datasetUploadArchive` 已完成第一切片但尚未實機驗證 | 尚不能宣稱 cloud upload parity | 通過分塊、取消、錯誤、SSH/SFTP 與 Release 驗證，並確認暫存檔清理策略 |
| P0-02 | save/load canonical path 尚未統一 | 可能儲存成功但重新匯入找不到 progress | 完成 path policy、兩端 round-trip fixture 與 legacy 策略 |
| P0-03 | Dataset 檔案操作缺少完整 confinement | 可能刪除或寫入不應允許的路徑 | 兩端完成 backend validation 與負向測試 |
| P0-04 | Tauri Release sidecar/resource 尚未安裝版驗證 | 開發版正常但 Release 失效 | 完成 resource bundle、`BaseDirectory::Resource` 與安裝版 smoke |

## 6. Verification log

| 日期 | 變更 | 驗證 |
|---|---|---|
| 2026-08-26 | Tauri `sidecar-log`、`sidecar-event` 改為依視窗 label 使用 `emit_to` | `cargo check --manifest-path src-tauri/Cargo.toml` PASS；有既有 unused import/mut/dead code warnings |
| 2026-08-26 | Extension/UI baseline | `npm run compile` PASS；`npm run build --prefix ui` PASS；Vite classic script warning 已記錄 |
| 2026-08-26 | Tauri cloud upload parity 第一切片：分塊落地、序列化 sidecar upload、permission、Release resource | `cargo check`、`cargo test`、`node --check`、`npm.cmd run build --prefix ui` PASS；`npm.cmd run lint` 因缺 ESLint configuration BLOCKED；待 SSH/Tauri Release 實機 |
| 2026-08-26 | 無 SSH 環境測試模式 | 本機分塊、非法輸入與不可連線 host 錯誤處理可先測；SFTP success、遠端解壓與遠端診斷維持 BLOCKED |
| 2026-08-26 | Tauri export 30 秒 timeout 修正 | `export_dataset` 自行啟動 sidecar 分支補 stdout response reader；`cargo check`、`cargo test` PASS；待本機 classifier_dataset export 手動回歸 |
| 2026-08-26 | 使用者本機 Tauri Dev export 回歸 | `image/file` 載入 `examples/test/dataset/classifier_dataset` 後成功產生 `classifier_dataset.zip`，ZIP 含 `dataset.json`，且不再出現 `Sidecar response timeout (30s)`；本機 export PASS，VSIX/Release 待測 |
| 2026-08-26 | Stage 1 path contract 切片：`core/pathPolicy.js` 新增 `buildCanonicalDatasetDirectoryPath` / `buildCanonicalDatasetFilePath` / `resolveSourceImagePath` / `validateDeletableImagePath` 純函式（未接入流程）；新增 `core/pathPolicy.test.mjs` | `node --check` PASS；`node --test pathPolicy.test.mjs` 11 pass / 0 fail；`npm.cmd run build --prefix ui` PASS；save/load/delete 行為未改動，canonical path 接入仍待產品決策（見 blocker P0-02） |
| 2026-08-26 | 三項路徑契約產品決策確認；切片 1：`decideProgressLoadPath` 純函式（direct 優先、恰一候選才 fallback、歧義拒絕）+ 5 個新測試；切片 2：`ui_layout.js handleDeleteImage` 接入 `validateDeletableImagePath` 前端預檢 | `node --check` PASS ×2；`node --test` 16 pass / 0 fail；`npm.cmd run build --prefix ui` PASS；delete 正常路徑行為不變，僅新增越界攔截；後端 save/load 接入待下一切片並需同步 backend manifest |
| 2026-08-26 | 後端 canonical 接入切片：VSIX `datasetOps.ts` save 名稱驗證+errorCode、load 決策邏輯（direct/fallback/NOT_FOUND/AMBIGUOUS+candidates）；Tauri `file.rs` 同一契約 Rust 實作（DatasetProgressResult 增加 errorCode/candidates，serde camelCase）；`tauri.js` bridge 傳遞 errorCode/candidates 並解析 `CODE:` 錯誤前綴；backend_api_manifest.md 同步 | `npx tsc --noEmit` PASS、`npm.cmd run compile` PASS、`cargo check` PASS（既有 unused warnings 不變）、`cargo test` PASS（1 passed）、`node --check tauri.js` PASS、`npm.cmd run build --prefix ui` PASS；雙平台手動 round-trip 待測，故維持 PARTIAL |
| 2026-08-26 | 使用者實測累積確認：① 自動落盤錨定誤擋修復（root cause：capabilities 快照過期）PASS；② canonical-only 匯入閘（外部資料夾複製確認 → canonical 載入 + dataset.json 落盤同處）PASS；③ 縮圖 convertFileSrc 修復 PASS；④ Ctrl+R/F5 攔截（dirty 確認回首頁）PASS | 以上皆為使用者 Tauri Dev 實機操作確認；VSIX 對應案例與細節子案例（重複匯入不覆寫、拒絕複製中止等）列 C1 Gate 待完成清單 |
| 2026-08-29 | Stage 2 切片 1-5（io/bridge.js port 層）：新增 `io/bridge.js`（request correlation：requestId 精準配對或 per-command FIFO、timeout、cancel、subscribe/subscribeMultiple/unsubscribe、once、dispose；唯一允許觸碰 `window.CocoyaBridge` 的位置）+ `io/bridge.test.mjs`（fake transport，8 測試）；`ui_layout.js` 的 load/save progress、export、delete、checkRemoteEnvironment、diagnostic dispatcher、confirm/prompt/alert/pickFolder/prepareDatasetImport/getProjectAnchor 全部改經 datasetBridge；`sampler.js` 的 init 訂閱（可 dispose）、listCameras/startCamera/takeSnapshot 改 request（requestId 精準配對）、stopCamera 改 send；dataset_manager 內 direct `window.CocoyaBridge` 殘留 = 0 | `node --check` ×3 PASS；`node --test io/bridge.test.mjs` 8 pass / 0 fail；`npm.cmd run build --prefix ui` PASS；行為語意不變（payload 與 result command 名稱未改，僅加 timeout/correlation）。注意：`datasetUploadResult` 診斷分支保留空分支（上傳按鈕已於 RemoteTrainingRefactor D2 移除）；A2-5/6/7 因雲端上傳已移除標 N/A；A2-1~A2-4 手動雙平台驗證待測（READY_FOR_TEST） |
| 2026-08-29 | 使用者決策：手動測試統一延後集中執行（`log/plan/DatasetManagerManualTestBacklog.md`），Stage Gate 簽核一併延後；自動化驗證仍逐切片執行。同日 Stage 3 切片 1：新增 `application/progressUseCases.js`（writeProgressToDisk/scheduleAutoSave/cancelAutoSave/loadProgressFromFolder 自 ui_layout.js 原地搬移，注入 state/syncSpecFromUI/getFormValue/hasData/applyLoadedProgress）；ui_layout 保留同名委派 wrapper（呼叫點零改動）；移除模組級 `autoSaveTimer`；`closeDatasetManager` 補 `cancelAutoSave()` + `Sampler.dispose()`（U3-2 dispose 安全） | `node --check` PASS ×2；`node --test`（bridge 8/8、pathPolicy 11/11）PASS；`npm.cmd run build --prefix ui` PASS；行為語意不變，U3-1/U3-2 實機待測（已登錄 backlog） |
| 2026-08-29 | Stage 3 切片 2：新增 `application/importUseCases.js`——`parseDataFileRows(fileName, text)` 純轉換（CSV/JSON → rows，EMPTY_OR_INVALID 穩定錯誤碼，可單元測試）+ `importDataFile`/`importDirectory` 匯入編排（自 ui_layout.js 原地搬移；canonical 匯入閘、confirm 複製、名稱對齊語意不變）；ui_layout 保留同名委派 wrapper（handleFileImport/handleDirectoryImport）；新增 `importUseCases.test.mjs`（7 測試） | `node --check` PASS ×2；`node --test` import 7/7、bridge 8/8 PASS；`npm.cmd run build --prefix ui` PASS；U3-3 實機待測（backlog） |
| 2026-08-29 | Stage 3 切片 3：新增 `application/exportUseCases.js`——`exportDataset` 編排自 ui_layout.js 原地搬移（未標註/未分類 confirm、syncSpecFromUI + validate、datasetExport request correlation timeout 120s）；ui_layout 保留同名委派 wrapper（handleExportDataset，三處 onclick 呼叫點零改動）；注入 state/getFormValue/syncSpecFromUI/showStatusMessage/showExportProgress/t | `node --check` PASS ×2；`npm.cmd run build --prefix ui` PASS；U3-1 匯出側實機待測（backlog）。Stage 3 剩餘：annotation/classification mutation 搬移（指引 §6.2 步驟 3） |
| 2026-08-29 | Stage 3 切片 4：新增 `application/annotationMutations.js` 純函式（countAnnotated/countUnannotated/countUnclassifiedBoxes/countBoxesWithClassId/countImagesWithLabel/removeAnnotationsByClassId/reassignLabelsToUnlabeled/resolveDeleteIndex/setAnnotationClassId/removeAnnotationAt）+ 測試 7 條；ui_layout 接線 5 處（進度計數、deleteSelectedAnnotation、類別刪除同步、class_id 更正）；exportUseCases 計數改用同模組（語意單一來源） | `node --check` PASS ×2；`node --test` 全套 33 pass / 0 fail；`npm.cmd run build --prefix ui` PASS。指引 §6.2 步驟 1-5 全數收斂（cloud upload N/A）；模式編排（enter/exit、鍵盤）屬 Stage 4 UI Presenter 範疇 |
| 2026-08-30 | Stage 4 切片 1（UI Presenter/status message）：新增 `ui/statusMessage.js`——`createStatusMessageUI(documentRef?)` 回傳 `{ showStatusMessage, dispose }`；顯示於 `#dataset-manager-message`、預設 8 秒自動清除、`{ duration }` 覆寫、顯示前重置計時器、空訊息立即隱藏、`dispose()`（供 modal 關閉取消進行中計時器）；行為契約與原 ui_layout 完全一致（僅呈現層、無 Bridge/商業依賴）。`ui_layout.js` 移除全域 `statusMessageTimer`/`STATUS_MESSAGE_DURATION`/`showStatusMessage` function，改模組頂部 `const showStatusMessage = createStatusMessageUI().showStatusMessage`（use-case 注入不變），`closeDatasetManager` 補 `statusMessagePresenter.dispose()`。新增 `ui/statusMessage.test.mjs`（7 測試，fake document 注入）。AGENTS.md 定義位置與 FILE_STRUCTURE.md 同步 | `node --check` PASS ×3（statusMessage.js / test / ui_layout.js）；`node --test`（5 個 *.test.mjs）40 pass / 0 fail（含新增 7）；`npm.cmd run build --prefix ui` PASS；ui_layout 內 `statusMessageTimer`/`STATUS_MESSAGE_DURATION` 殘留 = 0、`#dataset-manager-message` 僅剩 createModal 範本容器（非繞行寫入）。UI4-4 實機待測（登錄 backlog） |
| 2026-08-30 | Stage 4 切片 2（Modal mount/unmount，§7.2 步驟 2）：新增 `ui/modal.js`——`buildModalTemplate({t, optionList, projectTypes, sourceModes})` 純函式，modal 模板自 createModal 原樣移出（DOM 契約零變更、可測）；`ui_layout.js` createModal 改用之，移除內聯約 110 行模板。**修正訂閱洩漏**：`bindModalEvents` 的 `offBridgeMessage`（原被丟棄→refreshI18n 重建累積重複 listener）改掛 `modal._offBridgeMessage`，`refreshI18n` 移除前 `_offBridgeMessage?.()` 解除。新增 `ui/modal.test.mjs`（5 測試：18 關鍵元素 id 恰一次、t() 翻譯、下拉注入、無殘留 `${`、純函式一致） | `node --check` PASS ×3（ui_layout/modal/modal.test）；`node --test`（6 個 *.test.mjs）45 pass / 0 fail（含新增 5)；`npm.cmd run build --prefix ui` PASS；`dataset-manager-dialog` 於 ui_layout 殘留 = 0。UI4-1 實機待測（登錄 backlog） |
| 2026-08-30 | Stage 4 切片 3（Form presenter，§7.2 步驟 3 前半）：新增 `ui/form.js`——`createFormPresenter({getModalRoot})` 回傳 `{getFormValue, getColumnsFromUI, dispose}`；`getFormValue`/`getColumnsFromUI` 自 ui_layout 原地移出（唯讀、語意不變、modal root 可注入）；ui_layout 改 `const formPresenter = createFormPresenter({getModalRoot: getModal})` + 同名委派 wrapper（全模組呼叫點零改動，syncSpecFromUI 與 use-case 注入不變）。`syncSpecFromUI`（spec 建構，涉 state/DatasetSpec）依「form 讀寫與 spec sync 分離」原則留在 ui_layout 協調層，僅改讀取路徑經 form presenter。新增 `ui/form.test.mjs`（7 測試：讀值/缺欄/null modal 安全/欄列解析+過濾空名/預設 type/role/去空白/dispose no-op/無注入預設安全） | `node --check` PASS ×3（form/test/ui_layout）；`node --test`（7 個 *.test.mjs）52 pass / 0 fail（含新增 7）；`npm.cmd run build --prefix ui` PASS（~176ms）。註：`node --test <目錄>` 目錄模式會誤把 index.js（瀏覽器端、依賴 window）當測試入口，屬既有現象，驗證以逐檔執行為準 |
| 2026-08-30 | Stage 4 切片 4（Thumbnails scroll 集中管理，§7.2 步驟 4）：新增 `ui/thumbnails.js`——`createGridScrollManager({state, getContainer, hasImages})` 回傳 `{saveGridScroll, restoreGridScroll, dispose}`；scroll save/restore 自 ui_layout 原地移出，`state._savedGridScrollTop` 契約不變（restore 於 container 存在時清空、container 缺失時早退不清空，皆與原實作逐行對齊）；ui_layout 改 `gridScrollManager` 委派 wrapper（enterAnnotationMode/enterClassificationReviewMode/handleDeleteImage/refreshDynamicPanels 四處呼叫點零改動）。新增 `ui/thumbnails.test.mjs`（8 測試：save 記錄/無 grid 記 0/restore 還原+清空/無 saved 沿用現值/無影像不寫/雙 0 不寫/容器缺失早退保 state/save→restore round-trip） | `node --check` PASS ×3（thumbnails/test/ui_layout）；`node --test`（8 個 *.test.mjs）60 pass / 0 fail（含新增 8）；`npm.cmd run build --prefix ui` PASS（~366ms）。UI4-3 實機待測（backlog） |
| 2026-08-30 | Stage 4 切片 5（Classification state machine，§7.2 步驟 5）：新增 `ui/classification.js`——`createClassificationController({state,t,escapeHtml,getModal,UIComponents,saveGridScroll,exitAnnotationMode,navigateToImage,setAnnotationHeaderActions,handleExportDataset,updateStatsFromImages,updateThumbnailHighlight,refreshPreview,createLabelMapManager,getDocument?})` 回傳 `{enterClassificationReviewMode,loadClassificationImage,renderClassificationControls,updateClassifyProgress,bindClassificationKeyboardEvents,unbindClassificationKeyboardEvents,dispose}`；五函式自 ui_layout 原地搬移（模板/語意不變），`classificationKeyHandler` 模組級 let 改 controller 閉包私有；ui_layout 保留同名委派 wrapper（enterAnnotationMode 分流、navigateToImage、updateThumbnailHighlight、checkUnannotatedOnExit、exitAnnotationMode、label manager reRender 等呼叫點零改動）；`closeDatasetManager` 補 `classificationController.dispose()`（解除鍵盤 listener）。新增 `ui/classification.test.mjs`（7 測試：進入模式狀態機+class/面板、缺元素早退不污染、load 圖更新、鍵盤 ↑/↓/Esc 導航+重複 bind 不累積+dispose、controls 渲染+onchange 改 label、無 label_map 提示、進度+缺失 no-op） | `node --check` PASS ×3（classification/test/ui_layout）；`node --test`（9 個 *.test.mjs 逐檔）67 pass / 0 fail（含新增 7）；`npm.cmd run build --prefix ui` PASS（~231ms）；ui_layout 內 `classificationKeyHandler`/分類模板殘留 = 0。UI4-2 實機待測（backlog）。Stage 4 剩餘：annotation → panels |
| 2026-08-30 | Stage 4 切片 6（Annotation 編排，§7.2 步驟 6）：新增 `ui/annotation.js`——`createAnnotationController({state,t,escapeHtml,getModal,UICanvas,UIComponents,getFormValue,saveGridScroll,exitAnnotationMode,navigateToImage,setAnnotationHeaderActions,handleExportDataset,updateStatsFromImages,updateThumbnailHighlight,refreshPreview,createLabelMapManager,getDocument?})` 回傳 `{enterAnnotationMode,saveCurrentAnnotations,loadAnnotationImage,renderAnnotationControls,renderAnnotationListUI,updateAnnotationProgress,bindCanvasKeyboardEvents,deleteSelectedAnnotation,dispose}`；八函式自 ui_layout 原地搬移（bbox/line 模板、UICanvas.init 300ms debounce 落盤、class 下拉同步、鍵盤 ↑/↓/Delete/Esc、標註列表 class 更正）；mutation 純函式直接 import `application/annotationMutations.js`（countAnnotated/resolveDeleteIndex/removeAnnotationAt/setAnnotationClassId，語意單一來源）；`projectType==='image'` 分流與 `exitAnnotationMode`/`navigateToImage`/`updateThumbnailHighlight` 雙模式共用邏輯留 ui_layout 協調層。新增 `ui/annotation.test.mjs`（7 測試：進入編排順序/早退不污染/line mode init+debounce/鍵盤導航+Delete+重複 bind 不累積/controls 類別管理/list 渲染/save+dispose 清 timer） | `node --check` PASS ×3（annotation/test/ui_layout）；`node --test`（10 個 *.test.mjs 逐檔）74 pass / 0 fail（含新增 7）；`npm.cmd run build --prefix ui` PASS（~186ms）。UI4-2 bbox 側自動化 PASS（backlog 已更新）；實機待測。Stage 4 剩餘：panels（§7.2 步驟 7） |
| 2026-08-30 | Stage 4 切片 7（Panels presenter，§7.2 步驟 7）：新增 `ui/panels.js`——`createPanelsPresenter({state,t,escapeHtml,optionList,getModal,refreshPreview,DatasetSpec,DatasetSpecConstants,getDocument?})` 回傳 `{renderColumnRow,renderValidation,renderPreviewTable,addColumn,renderAllColumns,dispose}`；五函式自 ui_layout 原地搬移（模板/語意不變）；`refreshDynamicPanels` 為重度耦合協調編排（Sampler/label manager/註記入口/落盤），比照 syncSpecFromUI 前例留 ui_layout 協調層，僅呈現路徑經 presenter。ui_layout 改同名委派 wrapper（呼叫點零改動）。新增 `ui/panels.test.mjs`（6 測試：欄位列模板+escape/驗證 ok-error/表格前 10 筆+早退/addColumn+refresh/全量重繪/dispose no-op） | `node --check` PASS ×3（panels/test/ui_layout）；`node --test`（11 個 *.test.mjs 逐檔）80 pass / 0 fail（含新增 6）；`npm.cmd run build --prefix ui` PASS（~244ms）。Stage 4 剩餘：Gate 收斂（手動案例 backlog 集中測） |
| 2026-08-30 | Stage 5 切片 1（CSS 盤點，§8.2 步驟 1）：新增 `log/plan/DatasetManagerStyleTokens.md`——dataset_manager.css（1180 行）色彩盤點：207 處/99 唯一值/var()=0/dark+HC 覆寫 128 行；八組語意分組（品牌粉/中性灰/暗表面/成功綠/錯誤紅/警示橘/資訊藍/遮罩）；focus(142-165)/error(251-265)/warning(547-560) 狀態 selector、disabled 無 selector；`--dsm-*` token 對照表提案；風險：VSIX 靜態載入相容（純 CSS var 可行）、theme_manager cssVars 掛 body 層級 → light 預設須掛 :root/body 而非 dialog | 純盤點零變更（無程式碼異動、無需 node --test/build）；數據以 Select-String 統計佐證 |
| 2026-08-30 | Stage 5 切片 2（token 定義 + 品牌 var() 化，§8.2 步驟 2 前半）：dataset_manager.css 檔頭 `:root` 定義 `--dsm-brand/soft/strong` + `--dsm-disabled-bg|text|border`（決策：alpha 收斂 2 種、補 disabled、尺寸暫緩）；品牌 19 處 `#FE2F89`→`var(--dsm-brand)`、alpha 7 處收斂 soft/strong；新增 dialog 內 disabled 慣性規則；檔頭記錄 token 掛載鐵律（:root 非 dialog）。事故：批量 regex 誤替換 :root 定義致循環參照，已修正 | `var(--dsm-brand)` 19 引用/soft 2/strong 5；殘留 rgba(254 僅定義 2 處；node --test 80/80；vite build PASS。三主題目視對照待實機 |
| 2026-08-30 | Stage 5 切片 3（灰階 token 化，§8.2 步驟 2 後半）：`:root` 補定義 --dsm-text/-secondary/-muted + --dsm-border-light/-strong（精確等值）；light 基準 21 處 var() 化（color #333/#555/#999 系 12 處、border #ddd/#ccc 系 9 處）；dark 區塊 128 行不動留切片 4。事故：substring Replace 誤傷 border-color: #555（7 處 dark 區塊），以 dark 區間掃描器偵測後逐行還原 | 定義/引用對帳 6/2/3/6/4（def 各 1）；dark 污染 0；node --test 80/80；vite build PASS（~168ms）。light 目視對照待實機（等值映射理論零變更） |
| 2026-08-30 | Stage 5 切片 4（dark/HC token 覆寫）：新增 `body.vscode-dark, body.vscode-high-contrast` 的 `--dsm-text/secondary/muted` + `--dsm-border-light/strong` 覆寫（值與既有 dark 原值等值）；dark 區塊 24 處 var() 化（color #e0e0e0/#aaaaaa/#aaa/#888、border #404040 系/#555 系）；語意特殊色與 surface 背景原值保留。承切片 3 教訓以完整屬性字串替換 | token 引用 text 11/secondary 5/muted 5/border-light 14/border-strong 10（def 各 2）；dark 殘留原值 0；node --test 80/80；vite build PASS（~169ms）。dark/HC 目視對照待實機 |
| 2026-08-30 | Stage 5 切片 5（主題 cssVars 補 --dsm-*，DM 換膚生效）：candy/dark/light 三主題 cssVars 各補 11 個 --dsm-*（candy 用既有色 #FE2F89/#8A4A6A/#FFD0E8；dark 用 text #e0e0e0/border #404040；light 用預設值）。**關鍵**：theme_manager apply() 只 setProperty 不清除 → light 也必須補 --dsm-* 否則切回 light 殘留 candy/dark 值。body inline cssVars 優先於 body.vscode-dark class 覆寫 | node --check ×3 PASS；每主題 --dsm-* 11 key；node --test 80/80；vite build PASS。三主題 DM 目視對照為重點（含 candy→light 無殘留） |
| 2026-08-30 | Stage 5 切片 5b（修正，DM 容器背景 token 化）：新增 `--dsm-surface`/`--dsm-surface-alt`（:root light `#ffffff`/`#f6f6f6`、vscode-dark `#252526`/`#2d2d2d`）；dialog/panel → surface、header/footer → surface-alt、dark 覆寫同改；三主題 cssVars 各補 2 key（candy `#FFF8F0`/`#FFEFF7`）→ 每主題 13 key。表單欄位背景保留白（不屬容器、dark 有獨立覆寫） | --dsm-surface def=2/use=3、surface-alt def=2/use=3；三主題 13 key；node --check ×3；node --test 80/80；vite build PASS（~161ms）。candy 下 DM 背景應變淡粉待使用者確認 |
| 2026-08-30 | Stage 5 切片 5c（深色收尾＋遠端面板移除）：①新增 `--dsm-list-item-bg`（標註列表，light #eee/dark #444/candy #FFE3F0）②tauri.js 全域 `.cocoya-prompt-*` 改 `var(--dsm-*, fallback)`（影響所有模組 prompt）＋新增 `--dsm-success-*` 四 token（`.dataset-export-progress` 接入）③移除 DM 遠端環境面板前端（modal.js 模板/ui_layout 綁定與訂閱/_offBridgeMessage/i18n DSM_CLOUD_* 16 key ×2 語系）；後端 checkRemoteEnvironment/trainRemote 保留 | node --check ×5；node --test 80/80；vite build PASS（183ms）；CLOUD 殘留=0；三主題 `--dsm-*` 23 key 一致。dark/candy prompt 與列表變色、遠端面板消失、remote 訓練回歸：待手動驗證 |
| 2026-09-01 | Stage 5 切片 6（i18n key parity，§8.2 步驟 4）：①修正 5 處 key 呼叫錯誤——`ui_layout.js` `STATUS_CAPTURETTING` 拼字錯誤（→`STATUS_CAPTURETING`）與 2 處 `t('DSM_NEED_ANCHOR')` 雙重前綴（→`t('NEED_ANCHOR')`）、`importUseCases.js` 4 處 `t('DSM_IMPORT_*')` 雙重前綴（→`t('IMPORT_*')`）——此前英文語系對這些訊息永遠 fallback 中文；②兩語系各刪 21 個未使用 key（UPLOAD_ZIP、ANNOTATION_INFO/FILE/NAV_PREV/NAV_NEXT/NEW_CLASS_CONFIRM/CANCEL/UNCLASSIFIED/UNKNOWN/UNSAVED_WARNING、ERROR_READ_FAILED、ERROR_UPLOAD_RESULT_IGNORED、CLASSIFY_ADD_LABEL/NEW_LABEL_PLACEHOLDER、SAVE_PROGRESS 系列 6 key——「儲存進度」按鈕已於 autosave 改革移除）；`CLOSE_UNSAVED_CONFIRM` 依 ui_layout.js 註解決策保留。盤點工具：`temp_scripts/i18n_parity_scan.cjs` | zh/en key 集合 118/118 完全一致、missing=0；node --check ×4 PASS；node --test 80/80；vite build PASS（532ms）。T5-1/T5-2 語系實機目視待測 |
| 2026-09-01 | Stage 5 收尾（§8.2 步驟 5，locale refresh race）：`index.js` loadI18n 改 in-flight promise 記錄（localeScriptPromises Map）——舊實作 script 載入中即 resolve，refreshI18n 會在語系鍵值就緒前重建 UI；行為契約不變。T5-1 語系 parity 實機 **PASS**（使用者確認） | node --check PASS；vite build PASS（296ms）。T5-2/T5-3 實機待測 |
| 2026-09-01 | Stage 6 切片 1（D6-3 靜態清理 + D6-1/D6-2 文件核對）：ui_layout.js 刪 5 個零呼叫未 export 死 wrapper；direct Bridge/全域 emit/legacy DOM id/未使用 export 掃描全數 0 或合法；DatasetManager.html 公開 API 表補齊（無 breaking change）、遠端節標記前端移除後端保留、Importer 更正 importUseCases；FILE_STRUCTURE 同步 | node --check PASS；node --test 80/80；vite build PASS。掃描證據與保留原因詳 log/work/2026-09-01.md |

## 7. Agent update protocol

每個 agent 完成一個 command 或 event 後，必須：

1. 更新本表的 `目前狀態` 與 Verification log。
2. 同步 `docs/backend_api_manifest.md` 或相關 API 文件。
3. 在 `log/work/yyyy-mm-dd.md` 追加測試證據與 handoff。
4. 不得只修改一端後宣稱 parity。
5. 若無法實機驗證，標為 `BLOCKED`，不可標為 `MATCHED`。
