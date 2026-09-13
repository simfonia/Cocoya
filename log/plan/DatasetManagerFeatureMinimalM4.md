# Dataset Manager M4：特徵類型最小可用（Feature Minimal Viable）計畫

> 建立：2026-09-12（#task[Dataset Manager 資料集類型及作業流程 UI/UX 重構-M4]）
> 狀態：ACTIVE（計畫定稿，施工未啟動；等決策拍板＋Act mode）
> 上游：`log/plan/DatasetManagerTypeLockedWorkflow.md` §7 M-F1、§10.3「feature/serial → M4」
> 對應 milestone：M4 特徵最小可用（M-F1）；M5 文件＋清理

## 1. 範圍定義（M-F1：「21＋33 點→CSV→表格管線；缺裝降級」）

`feature` 類型＝**以攝影機經 MediaPipe 提取關鍵點（landmark）→ 組表格樣本（schema.columns）→ 匯出 CSV → 複用 M3 表格管線（table_dataset.py / table_train.py）訓練**。

- **21 點**＝MediaPipe Hands；**33 點**＝MediaPipe Pose。每點含 `x,y,z` 歸一化座標 → 特徵維度 Hand=63、Pose=99（或僅 `x,y`＝42＋66）。
- **缺裝降級**＝MediaPipe 未安裝時不可採集，退回純 file 匯入＋明確提示。

## 2. 現況錨點盤點（關鍵發現）

| 錨點 | 現況 | 對 M4 影響 |
|---|---|---|
| `core/typePolicy.js` `isDevType` | `DEV_TYPES=['feature','serial']` | 需把 `feature` 移出、加入 `stableTypes` |
| `ui/entryCards.js` `TYPE_CATALOG` | `feature: status:'dev'`＋徽章 | 需改 `stable`、去徽章/banner（`renderDevBanner` 不再觸發） |
| `application/exportUseCases.js` | `isDevType` 隊首硬擋 | 需解封，改走表格分流 |
| `resources/dataset_manager/dataset_sidecar.py` `exportDataset`（L141 起） | table 分支寫 `data.csv` | **feature 加同款分支**（spec.samples＋columns→CSV） |
| sidecar `trainLocal`（L843-848）`task_scripts` | **無 feature** → 誤落回 `classifier_train.py`（會壞） | 需補映射 |
| sidecar `trainRemote`（L610-611）`script_rel` | `feature → feature/feature_train.py` **幽靈檔**（尚不存在） | 需建實檔或改映射 |
| `resources/dataset_manager/media_pipe_service.py` | 歷史 stub（僅手部「偵測」，無 landmark） | **需重寫**提取 Hand21＋Pose33 |
| `config/python_modules.json` | 已有 `mediapipe` 條目 | 缺裝判斷可複用環境診斷 status |
| `sampler.js`＋`camera_service.py` | live 採集早已就緒 | feature live 採集可沿用既有相機管線 |
| `ui/samplerPanel.js` | live 段已委派（R6） | feature 採集 panel 可比照抽模組 |

> **關鍵坑（同 M3 修的 `object_detection/` 幽靈）**：`trainLocal` 對 feature 會誤落到 `classifier_train.py`（必炸）；`trainRemote` 指向不存在的 `feature/feature_train.py`。M4 必須一併收斂，否則 feature 訓練一跑即壞。

## 3. 分階段施工計畫（Phase 0→5）

### Phase 0｜契約與設計決策（先定，避免返工）
1. 特徵 schema 命名契約：`hand_<i>_x/y/z`（i=0..20）、`pose_<i>_x/y/z`（i=0..32）＋`label` 欄。
2. `feature` 訓練**重用**：新建 `feature/feature_train.py`（影分身 `table/table_train.py`，MLP、label 分層/回歸）或直接映射 `feature→table/table_train.py`。
3. 缺裝降級代碼契約：sidecar 回結構化 `errorCode`，前端 i18n 呈現（後端禁出展示文案——AGENTS 鐵律）。

### Phase 1｜sidecar：特徵提取＋採集＋缺裝降級
- 重寫 `media_pipe_service.py`：`extract_landmarks(frame) → {hand:[[x,y,z]*21], pose:[[x,y,z]*33], detected}`。
- 新增指令 `collectFeature`（或擴充 `captureImage` 帶 `featureMode`）：單張→提取→回傳向量；缺 MediaPipe 回 `CODE: FEATURE_MEDIAPIPE_MISSING`。
- 環境檢查對齊：`checkEnvironment` 既有 `mediapipe` 條目即可，前端據 `available=false` 顯示降級。

### Phase 2｜匯出分流＋解封（front＋sidecar）
- `exportUseCases`：`feature` 移出 `isDevType` 擋下，改吃「表格類型」分流。
- `exportDataset`：`feature` 分支＝同 table → `data.csv`（truncated 警告沿用）。
- `typePolicy`／`entryCards`／`renderDevBanner`：feature 轉正式、去徽章。

### Phase 3｜訓練管線＋幽靈映射收斂
- 建 `resources/train_templates/feature/feature_train.py`（MLP，複用 `table_dataset.py`）＋`py_compile`。
- `trainLocal`：`task_scripts` 加 `feature`；`trainRemote`：`feature → feature/feature_train.py` 落實（消除幽靈）。

### Phase 4｜DM 前端 live 採集（選配，待拍板是否納入本次）
- 新 panel：相機燈點顯示＋「擷取特徵點」→ 依標籤累計為 row；沿用 `samplerPanel.js` 委派模式；`allowedModes('feature')` 加 `live`（缺裝回退 `file`）。

### Phase 5｜i18n／主題／測試／文件／清理
- 新 `DSM_*` key（zh/en 同步、parity）；`--dsm-*` token（若新 UI 元素）；`node --test`＋`node --check`＋`vite build`＋`cargo check`＋`python -m py_compile`；`FILE_STRUCTURE.md`／`log/todo.md`／當日 `log/work/`；本計畫 M-F1 段收斂。

## 4. 風險與降級策略

| 風險 | 影響 | 降級 |
|---|---|---|
| MediaPipe／相機缺裝 | 採集不可用 | 缺裝降級回 `file` 模式＋提示（Phase 1） |
| `trainLocal` 舊幽靈映射誤落 classifier | 訓練失敗 | 本次即收斂（Phase 3）＋smoke 迴歸 |
| 162 維特徵動態 schema 重繪效能 | 表格 UI 卡頓 | 沿用 R7 `TABLE_SAMPLES_PERSIST_LIMIT=2000`；預覽縮容 |
| 改 `media_pipe_service` 影響既有 image/od 採集 | 迴歸 | 獨立指令分支、不碰 `captureImage` 既有路徑；`cargo check`＋實機 |
| 三主題 token 未跟上 | 深色/高對比破版 | Phase 5 token 同步＋目視 |
| 訓練回歸型 feature（無類別 label） | 分層失效 | 依 `table_dataset` label type 判定（回歸隨機切＋報告註明） |

## 5. 驗證計畫
- sidecar exportDataset e2e（feature 專案→ZIP 含 data.csv）；`feature_train` 分類/回歸各一訓練＋TFLite＋報告；`py_compile`；`node --test` 全綠；`cargo check`；i18n parity；雙平台實機（VSIX+Tauri 卡→徽章移除→匯出→訓練整鏈）＋三主題目視。

## 6. 待拍板決策（施工前必須定）
1. **採集範圍**：M4 是否納入「DM 內 live 鏡頭特徵採集 UI」（Phase 4），或只做「file 匯入→CSV→訓練」主鏈（採集留 backlog）？
2. **點維度**：含 `z`（162 維）或僅 `x,y`（108 維）？
3. **訓練檔案**：新建 `feature/feature_train.py`（語意清楚、未來可共用 serial）或直接映射到 `table/table_train.py`（代碼最少）？

## 7. 施工鐵律（沿襲 DatasetManagerTypeLockedWorkflow §9）
每步：先備份至 `backup/`（yyyyMMdd_HHmmss）→ 小步改 → `node --check`（新 JS 時）＋`cargo check`（Rust 動到時）＋ Python `python -m py_compile` 新腳本 → 雙平台實機 → 當日 `log/work/` 追加＋`log/todo.md` 更新（禁刪歷史）。