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
| 儲存進度 | `datasetSaveProgress` | `handleDatasetSaveProgress`，由 project root 推導路徑 | `dataset_save_progress`，由 folder root 推導路徑 | PARTIAL | canonical path、project name validation、原子寫入、錯誤一致 |
| 載入進度 | `datasetLoadProgress` | `handleDatasetLoadProgress`，讀 folder/dataset.json | `dataset_load_progress`，讀 folder/dataset.json | PARTIAL | save/load round-trip、legacy path、JSON invalid、無檔案 |
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

目前暫定 canonical save path 為：

```text
<projectRoot>/dataset/<projectName>/dataset.json
```

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

## 7. Agent update protocol

每個 agent 完成一個 command 或 event 後，必須：

1. 更新本表的 `目前狀態` 與 Verification log。
2. 同步 `docs/backend_api_manifest.md` 或相關 API 文件。
3. 在 `log/work/yyyy-mm-dd.md` 追加測試證據與 handoff。
4. 不得只修改一端後宣稱 parity。
5. 若無法實機驗證，標為 `BLOCKED`，不可標為 `MATCHED`。
