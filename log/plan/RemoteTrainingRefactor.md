# Remote Training Refactor — 遠端訓練重構計畫

**建立日期**：2026-08-28
**前提**：Dataset Manager Refactor - Stage 1 已完成並 commit（`250f296`，工作樹 clean）。
**性質**：Architecture 決策藍圖 + 切片化施工順序（SSOT，跨 agent 交接依據）。

---

## 背景與動機

使用者期望提煉「遠端訓練」為單一、精簡、以 `py_ai_train_run` 積木 `backend=remote` 為主入口的流程。現況問題：

1. 雲端燈號/全域開關 `cloudAiEnabled`（toolbar、vs URLicocoyaManager、Tauri AppState、bridge）本是共用開關，卻被 DM 與積木產生器兩者依附 → 複雜且常失效。
2. `backend=remote` 產生器**未真正實作**：`train_model()` 只在本機 `subprocess` 跑本機 `train.py`，`backend` 參數實際未使用 → 選 remote 其實跑在本機。
3. DM 內有「雲端 ZIP 上傳」按鈕，但「匯出 ZIP」已涵蓋進階使用者打包需求 → 雲端上傳是多餘雙入口。
4. SSH/SFTP 緣路：VSIX sidecar `dataset_sidecar.py` 有 `checkRemoteEnvironment`/`uploadDataset` 完整實作（6月底已可行），Tauri 端部分為 stub/未完成。

## 1. 已收斂之決策（產品鐵律，不可自行更改）

| # | 決策 | 說明 |
|---|---|---|
| D1 | **移除雲端燈號/全域開關** | 移除 toolbar `#btn-cloud-ai-toggle`/`#cloud-ai-status`/隱藏 `#cloud-ai-toggle`、`cocoya_remote_mode_enabled`、`set_cloud_ai_mode`（VSIX `envOps.handleSetCloudAiMode`、Tauri `set_cloud_ai_mode`/`get_cloud_ai_mode` + `AppState.cloud_ai_enabled` + `commands.toml` 權限+`lib.rs` 註冊 + `tauri.js` case + `CFont base.js sync/update`）。 |
| D2 | 移除 DM 雲端 **上傳**按鈕 | 移除 DM `#dataset-cloud-upload-btn`、`#dataset-cloud-zip-input` 前端流程與 `uploadDataset`/`datasetUploadArchive` 前端觸發。**保留**「匯出 ZIP」（`datasetExport`），因它讓進階使用者打包自己跑 code。僅移除上傳，不移除匯出。 |
| D3 | 遠端唯一入口 | `py_ai_train_run` 積木 `backend = remote`，於**執行當下**（host 層）觸發。無獨立開啟按鈕。 |
| D4 | host 處理、非產出 Python | SSH 上傳/遠端訓練/下載模型由 **host**（VSIX sidecar / Tauri `startTraining` remote 分支）執行，**不是**產出的 Python 程內嵌 paramiko。降低產出對 paramiko 依賴。 |
| D5 | 新增 `SYNC_MODE` Dropdown | `smart` / `always` / `skip`。搜尋 = 比對本地/遠端資料集一致→跳過上傳；`always` = 每次全量上傳（維持現況）；`skip`= 信任遠端現有、不上傳直接遠端跑。 |
| D6 | 只同步積木指定資料集 | sync/smart 只比較與上傳積木 `DATASET_DIR` 指到的那一個資料集 directory。 |
| D7 | SSH 帳密 session 記憶、不落盤 | 帳密存在 webview session 變數（`window.CocoyaUI` 或 UI state），重載即失，不寫 localStorage。 |
| D8 | SSH 精靈 + 診斷合一 | 執行 remote 當下：session 無帳密→輸入；接著確認連線成功/失敗 + 遠端環境診斷（GPU/Docker/gpu-passthrough）JSON 合一顯示。 |
| D9 | 遠端路徑對齊 mvp | 資料集：`~/cocoya_ai/sessions/{MACHINE_ID}/dataset/{data}`；模型：`~/cocoya_ai/sessions/{MACHINE_ID}/models/{data}`。 |
| D10 | **TFLite 只在本地轉** | 遠端只產 `.keras` + `labels.txt`，**不**在遠端做 TFLite/量化轉換（踩坑：TensorFlow Lite 與 DGX/容器 CPU 不相容）。本地再依 `MODEL_OUTPUT` 轉 TFLite。 |
| D11 | 移除 `backend='auto'` | 只保留 `local` / `remote`；不再有「依燈號」的陰影 auto。 |

## 1 分階段施工順序（SSOTS）

| 切片 | 內容 | 驗收（自動化） | 範圍說明 |
|---|---|---|---|
| S1 | ✅ DONE(2026-08-28) | 移除 DM 雲端 ZIP 上傳按鈕 + `handleDatasetUploadArchive` 前處理與 bridge 觸發（保留 `datasetExport`） | node --check、vite build PASS |
| S2 | ✅ DONE(2026-08-28) | 移除 toolbar 開關 + 全域 cloud-ai 狀態（`index.html`、`style.css`、`base.js`、`controller.js`、bridge base/tauri、VSIX `envOps.ts`+`cocoyaManager.ts`、Tauri `app.rs`+`state.rs`+`lib.rs`+`commands.toml`、孤兒 i18n `MSG_CLOUD_AI_REQUIRES_REMOTE`） | node --check、vite build、tsc --noEmit+compile、cargo check 全 PASS；全域 grep 殘留 = 0 |
| S3 | ✅ DONE(2026-08-28) | 積木：移除 `AI_BACKEND_AUTO`（剩 local/remote）、新增 `SYNC_MODE` Dropdown(smart/always/skip)、i18n 雙語（`AI_TRAIN_FIELD_SYNC_MODE`/`AI_SYNC_*`）、產生器移除 `cloudAiEnabled` 全域讀取、`train_model()` 簽名與呼叫加入 `sync_mode`（local 路徑參數暫不使用，S4 接手 remote 分支） | node --check ×4、vite build、cargo check PASS |
| S4 | ✅ DONE(2026-08-28) | 執行攔截：`base.js` runCode 偵測 `backend='remote'`（非 MicroPython）→ `ensureSshConfig`（session 沿用，dialogs.js 既有精靈）→ 送出 `startRemoteTraining {code, syncMode, datasetDir, sshConfig}`；host remote 執行鏈改於 S6 接線 | node --check、vite build PASS |
| S5 | ✅ DONE(2026-08-28，併入 S4/S6) | SSH 精靈沿用既有 `dialogs.js showSshConfigDialog/ensureSshConfig`（session 記憶、不落盤）；診斷合一暫以 sidecar `checkRemoteEnvironment` 既有流程為主，訓練鏈內建診斷式日誌 | 手動演練待 SSH 實測 |
| S6 | ✅ DONE(2026-08-28) | host remote 執行鏈：sidecar 新增 `trainRemote`（smart/always/skip 差異同步 → Docker 遠端訓練 → 下載 .keras+labels，TFLite 留本地）；VSIX `trainingOps.handleStartRemoteTraining` + `cocoyaManager` dispatch；Tauri `tauri.js` `startRemoteTraining` case 重用 `_handleDatasetCommand('trainRemote')`（前端解析參數+專案錨定路徑） | py_compile PASS、node --check ×2、tsc --noEmit、compile、vite build PASS |
| S7 | 文件 + parity + manifest + i18n + help 同步，C1 Gate 手動案例 | 驗收清單 | parity matrix、backend_api_manifest、FILE_STRUCTURE、i18n、docs/help、`log/work` |

## 3 驗證命令標準
- `node --check <檔案>`（所有改到的 js）
- `npx tsc --noEmit -p tsconfig.json`（VSIX TS）
- `npm.cmd run build --prefix ui`（前端 build）
- `cargo check --manifest-path src-tauri/Cargo.toml`（Rust，若改 T）
- sidecar 實測：`python <sidecar.py>` 直接指令練（參考 `log/work/2026-08-08.md`）

## 4 里程碑 / Gate
- **G1**（S1+S2）：「雲端開關與 DM 上傳」完全移除，無殘留參；自動化全綠。
- **G2**（S3+S4）：「積木 remote + sync 欄位」產生正確 host remote 產出，本地 TFLite 轉換兩段。
- **G3**（S5+S6）：「SSH 精 + 診斷合一」「smart 同步」「遠端訓練/下載」實測可行（需 SSH 主機，目前 BLOCKED）（主機不可連線，延後）。
- **G4**（S7）文件/parity/manifest/i18n 全同步 + C1 Gate 手動案例。

## 已知 BLOCKED／風險
- SSH/SFTP 遠端驗證：**BLOCKED**（遠端主機目前無法連線）→ G3 手動案例無法執行，標記待主機可連線後驗。
- Tauri `startTraining` remote 現為空缺與 stub，S6 需補齊（沿用 `checkRemoteEnvironment`/`uploadDataset` sidecar 模式）。
- 「遠端訓練產 `.keras`」的訓練腳本是否需遠端容器（Docker）路徑：mvp 是 `05_train_on_dgx.py` 用 Docker；S6 決定是否 host 直接 SSH 跑 `train.py`（較簡）或容器（符合 mvp/GPU）。**待 S6 細化時決定**，預設用 host SSH 執行 `resources/train_templates/{task}/train.py`（看作業需求）。

## 交接注意
- 改動既有遠端鏈（`dataset_sidecar.py`）前，**先備份**至 `backup/`。
- `log/work/2026-08-28.md`（本日）全程逐切片記錄 Handoff。
- 進度以 todo（`log/todo.md`）追蹤。
## 階段二：遠端訓練對齊本地輸出 + 模板自動同步（D 系列）2026-08-28 追加

**動機**：遠端目前實為執行 mvp 版本 train_classifier.py（`--input_size/--lr`、產 `gesture_model.keras`），與本地 `classifier_train.py`（依 `model_output` 產 `{project}.keras/tflite` + 報告）不一致。使用者要求「遠端訓練配積木 model_output 欄位動作、輸出與本地一致」。

### 已收斂決策（追加）
| # | 決策 |
|---|---|
| D12 | **模板自動同步**：每次遠端訓練前，sidecar 用「smart 增量（清單+大小+mtime）」只上傳變更的 `train_templates/`，無變更零上傳 |
| D13 | **bind mount templates，不改映像**：`docker run -v $(realpath .../templates):/templates`；容器內 `python /templates/{task}/{task}_train.py`；每 run 全新 `--rm`，綁定說不需重建/手動重啟，每次都以最新模板起跑 |
| D14 | **task_type 目錄結構**：`train_templates/{task_type}/{task_type}_train.py`（classifier 已有；detector/line_follower/table/feature/serial 預留座） |
| D15 | **遠端只產 keras+labels+history+curve**；TFLite 與報告一律**本地**轉換/渲染（延續 D10/D9） |
| D16 | 前端全參數傳遞：`model_output`/backbone/optimizer/dnn_layers/validation_split/dropout/augmentation/fine_tune/task_type 由前端解析傳給 sidecar hyperparams |

### D 系列切片
| 切片 | 內容 | 驗收 |
|---|---|---|
| D1 | ✅ DONE(2026-08-28) | sidecar 模板 smart 同步（只傳變更 → bind `/workspace`） | py_compile PASS |
| D2 | ✅ DONE(2026-08-28) | sidecar trainRemote：完整 hyperparams + `--model_output`（none=只產報告/keras=產 keras）+ 下載全部產物 + 回傳產物路徑 | py_compile PASS |
| D3 | ✅ DONE(2026-08-28) | 前端 tauri.js/VSIX trainingOps.ts 全參數解析傳送；新增 `_local_convert_tflite.py` 本地轉 TFLite（掃本地 dataset 建 representative，依 model_output 轉 int8/f32/all，對齊 classifier_train 命名） | node --check/tsc/build/py_compile 全 PASS |
| D4 | ✅ DONE(2026-08-28) | sidecar 回傳 report/keras/curve/history 絕對路徑；前端 `openTrainingReport`/`openFolder` 開啟正確位置（既有 chain 已驗） | 鏈路確認 |
| D5 | 文件同步（parity matrix / manifest / FILE_STRUCTURE / help）+ 交接 | |