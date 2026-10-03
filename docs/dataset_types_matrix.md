# Dataset Manager 四類型能力矩陣 (SSOT)

> **本文件為 Dataset Manager 各資料集類型能力的單一事實來源（SSOT）。**
>
> - 稽核來源：`log/plan/ComprehensiveAudit_2026-09-27.md` §6 P2-10。
> - 產出日期：2026-10-02。所有內容均為**實查原始碼**所得，非記憶推論；每列均附事實來源。
> - 維護規則：類型能力變動時**先改本文件**，再改程式碼；本文件過時視為契約破口。

## 0. 命名對照（最易踩坑處）

DM 介面層的「專案類型」與訓練端的「任務類型」**命名不一致**，跨層查證時務必注意：

| 面向 | 命名 | 定義處 |
| :--- | :--- | :--- |
| DM 專案類型（UI 顯示） | `image` / `object_detection` / `line_following` / `table` / `feature` / `serial` | `ui/src/modules/dataset_manager/core/typePolicy.js::ALL_TYPES` |
| 訓練任務類型（積木下拉） | `classifier` / `detector` / `line_follower` / `table` | `ai_inference_blocks.js` L16-21（`TASK_TYPE` 下拉） |
| 訓練模板目錄 | `classifier` / `detector` / `line_follower` / `table` / `feature` | `resources/train_templates/` |

- **`line_following`（DM）→ `line_follower`（訓練）**：名稱不同但語意同一件事，映射存在於
  sidecar `dataset_sidecar.py` L1066-1072（`task_scripts`）與 L798-809（`script_rel`）。
- **`image`（DM）→ `classifier`（訓練）**：DM 端叫「影像分類」，訓練端叫 `classifier`。
- ⚠️ **DM 端的 `serial` 在訓練積木下拉中沒有對應選項**（見 §3 G2，預留未實作）。

> **決策（2026-10-03）：刻意不重命名，改為「顯式化」**
>
> 上述命名不一致**不打算修正**。理由：名稱已貫穿 DM 的 `project.type`、使用者既有 `.xml`
> 專案檔、`dataset.json`、Python 訓練模板目錄與匯出 ZIP 佈局。重命名＝資料遷移＋相容層，
> 風險遠大於收益。
>
> 正確做法是讓「不一致」變成**有文件、有單一來源**而非靠記憶：
> ① 本節為命名對照的 SSOT；② 積木側的 task type 清單收斂為單一常數
> `TASK_TYPE_OPTIONS`（`ai_inference_blocks.js`），並在該處註解對照；
> ③ sidecar 兩處映射各自獨立，改動必須同步（見 §4 警示）。

## 1. 總覽矩陣

| 能力 | image（影像分類） | object_detection | line_following | table |
| :--- | :--- | :--- | :--- | :--- |
| **DM 卡片狀態** | stable | stable | stable | stable |
| **採集模式** | live + file | live + file | live + file | **file only** |
| **標註方式** | 分類（選標籤） | bbox 框 + 類別下拉 | 拉線段（2 端點） | 欄位定義（schema.columns） |
| **標註單位** | 每圖 1 類別 | 每圖 N 框（可分類別） | **每圖 1 條線** | 每列 1 筆樣本 |
| **落盤佈局** | `<label>/*.jpg` + `dataset.json` | 同左 | 同左 | `dataset.json`（samples） |
| **匯出 ZIP 內容** | `<label>/*.jpg`（原樣） | `images/` + `labels/` + `labels.txt` + `export_manifest.json` + `dataset.json` | `images/` + `lines/` + `dataset.json` | `data.csv` + `dataset.json` |
| **訓練模板** | `classifier/classifier_train.py` | `detector/detector_train.py` | `line_follower/line_follower_train.py` | `table/table_train.py` |
| **loader** | `common/classifier_dataset.py` | `common/detector_dataset.py` | `common/line_dataset.py` | `common/table_dataset.py` |
| **切分策略** | **分層**（依資料夾類別） | **分層**（依 YOLO `class_id`） | **隨機**（回歸型，見下方註） | 分層／隨機（依 label 為類別或連續值） |
| **訓練報告指標** | Accuracy / Loss | Loss / **IoU** / MAE | Loss / **MAE** | Loss / **MAE** |
| **推論積木** | `py_ai_get_label`、`py_ai_get_confidence` | `py_ai_get_bbox`、`py_ai_get_bbox_center`、`py_ai_get_direction` | `py_ai_get_line`、`py_ai_get_line_end`、`py_ai_get_line_offset`、`py_ai_get_line_angle` | **無**（推論空殼，見 §3 G3） |
| **雙佈局直練** | ✅ | ✅ | ✅ | ✅（CSV） |

> **註（line_following 切分）**：`line_following` **無類別欄位**（`class_id` 恆 0，UI 無類別選擇器，
> `typePolicy.needsUnclassifiedCheck()` 僅對 `object_detection` 為真）→ 屬**回歸型**，
> 依 AGENTS.md 分層鐵律**允許隨機切＋報告註明**。已於 2026-10-02 三層查證結案。
> 證據：`temp_scripts/e2e_p211_line_split_check.py`。日後啟用多線型則改依 `class_id` 分層。

> **附：`feature`（第五類，2026-10-03 G1 階段 1 後）**
> 模式 `live + file`｜標註＝MediaPipe Hand/Pose landmark（`featureSchema.js` 契約）｜匯出＝`data.csv`｜
> 模板 `feature/feature_train.py`（table_train 影分身）｜loader 複用 `table_dataset.py`｜
> **訓練 ✅ 可跑**（積木下拉已含 feature）｜**推論 ❌ 階段 2 待做**（回報 `not implemented yet`）。

## 2. 逐類型細節

### 2.1 `image`（影像分類）
- **模式**：live（相機拍攝）＋ file（資料夾／CSV 匯入）。
- **標註**：非標註式，直接為每張影像指派標籤（`img.label`）。
- **統計**：`updateStatsFromImages()` 依 `img.label` 計數（`log/mappings/DatasetManager.html`）。
- **匯出**：無 staging 特殊處理，ZIP 保留 `<label>/*.jpg` 原生結構（分類本來就是子資料夾結構）。
- **訓練**：`classifier_train.py`；loader 分層切分並輸出
  `分層抽樣 (stratified split): <類別>: train N / val M`。

### 2.2 `object_detection`（物件偵測）
- **標註**：bbox（左上角 `[x,y,w,h]`）＋ `class_id` 類別下拉；匯出期轉 YOLO 中心點格式 `cx,cy,w,h`。
- **未分類處理**：`class_id === -1` 視為未分類（`annotationMutations.countUnclassifiedBoxes`），
  匯出前會 confirm 警告，**匯出時過濾**（`detector_dataset` 略過 `class_id<0`）。
- **匯出**：`dataset_sidecar.py` L266-337 扁平化建 `images/`、依標註寫 YOLO `labels/*.txt`、
  寫 `labels.txt`（類別名，依 `class_id` 排序）與 `export_manifest.json`（扁平化對照表）。
- **ZIP 去重**：L388-395 排除頂層 `<label>/` 原始副本（`exclude_top_dirs`），只留訓練佈局。
- **指標**：`bbox_iou`（越高越好）＋ MAE。

### 2.3 `line_following`（循線）
- **標註**：拉一條線段存為 `annotations = [{ class_id: 0, line: [x1,y1,x2,y2] }]`，**每圖僅一條**。
- **語意**：輸出是**線段兩端點**，非 bbox（`line_follower_train.py` 用 `Dense(4, sigmoid)` 回歸）。
  故不適用 IoU；報告採 Loss + MAE。
- **匯出**：L340-384 建 `images/` 與 `lines/*.txt`（一行 `x1 y1 x2 y2` 歸一化比例）。
  未標註線段者跳過，逾半數未標註時 stderr 警告。
- **推論**：`ai_inference_generators.js` L286-287 分派 `_follow_line()`；
  結果物件含 `line`（端點 tuple）、`offset`（橫向偏移）、`angle`、`direction`、`confidence`。
  `confidence` 固定 `1.0`（回歸無可校正信心值，刻意誠實處理，見 `log/work/2026-09-19.md`）。
- **兩個循線世界（避免混淆）**：世界 A＝HuskyLens 內建循線（不訓練）；
  世界 B＝Cocoya 自訓循線模型（本類型產出）。

### 2.4 `table`（表格型）
- **模式**：**file only**（`TYPE_TO_MODES_MAP.table = ['file']`）；無 live 採集。
- **資料**：`schema.columns` 定義欄位；`data_source.samples` 存樣本（前 2000 筆，

## 3. 已知殘餘（Known Gaps）

以下為盤點中**實際查證存在的落差**，非推測：

| # | 缺口 | 影響 | 事實來源 |
| :--- | :--- | :--- | :--- |
| G1 | **✅ 已修（階段 1，2026-10-03）**　**階段 2 待做** | **已修**：`py_ai_train_run` 與 `py_ai_model_init` 的 `TASK_TYPE` 下拉已含 `feature`（經 SSOT 常數 `TASK_TYPE_OPTIONS`），`train_model` 分派已加 `feature → feature_train.py`；後端訓練鏈路經 e2e 實測可跑（1 epoch 產出 curve/history/report）。<br>**仍待（階段 2）**：表格型（table/feature）推論為空殼，推論會回報明確 `error: not implemented yet`（原回傳假值 `prediction 0.0`，已修正）；`feature` 推論另需「從相機擷取 landmark」的積木 | `ai_inference_blocks.js` `TASK_TYPE_OPTIONS`；`ai_inference_generators.js` train/predict 分派；證據 `temp_scripts/e2e_g1_feature_train_check.py`；守門 `task_type_contract.test.mjs` |
| G2 | **`serial` 訓練模板不存在**（預留死碼，**刻意保留**） | sidecar `script_rel` 有 `serial → serial/serial_train.py` 映射，但 `train_templates/serial/` 目錄不存在。因 `isDevType('serial') === true` 且 `exportUseCases` 會擋下 dev 類型匯出，**該分支目前不可達**，不會在正常使用中炸。<br>**決策（2026-10-03）：保留預留位**（先留接口的合理設計），僅在此處明確標註，避免日後誤判為已實作 | `dataset_sidecar.py` L798-809；`resources/train_templates/` 無 `serial`（`Test-Path` 實查）；`typePolicy.js` `DEV_TYPES=['serial']` |
| G3 | **`table` 無推論解析積木** | 表格模型可訓練可部署，但無積木可解析結果 | `toolbox.xml` 解析類積木僅覆蓋 classifier/detector/line_follower |
| G4 | **`feature` 卡片標為 dev 但 typePolicy 為 stable** | 入口卡片顯示「開發中」徽章，匯出/訓練仍可繼續（刻意：實測問題多，先標回開發中） | `entryCards.js` L14 vs `typePolicy.js::STABLE_TYPES` |
| G5 | **`table` 不支援 live 採集** | 需先決定是否新增（決策項，見稽核計畫 P2-12） | `typePolicy.js::TYPE_TO_MODES_MAP` |
| G6 | **`docs/help/` 缺英文版** | 18 個 help 頁中僅 3 個有 `_en.html`；`py_ai_get_*` 推論積木全無英文說明 | `docs/help/` 實際檔案清單 |

## 4. 訓練端對應表（sidecar 雙處映射）

> ### task type 三處一致性守門（2026-10-03）
>
> 新增 task type 必須**同時**滿足三處，否則會半殘：
> ① `ai_inference_blocks.js` 的 `TASK_TYPE_OPTIONS`（UI 可選）
> ② `ai_inference_generators.js` 的 `train_model` 分派（可訓練）
> ③ `ai_inference_generators.js` 的 `predict` 分派（可推論）
>
> **守門**：`ui/src/modules/ai_inference/task_type_contract.test.mjs`（掃描型，漏任一處即報紅）。
> **背景**：G1 的 `feature` 正是只補後端而漏 UI 入口，屬此型缺陷。
> **2026-10-03 同時收斂**：`py_ai_train_run` 與 `py_ai_model_init` 原先各自維護一份**重複**的下拉清單
> （易只改一處），已合併為單一 SSOT 常數 `TASK_TYPE_OPTIONS`。

`resources/dataset_manager/dataset_sidecar.py` 有**兩處**獨立的模板映射，修改時**兩處都要改**：

| 位置 | 用途 | 對應 |
| :--- | :--- | :--- |
| L1066-1072 `task_scripts` | `trainLocal`（本機訓練） | classifier / detector / line_follower / table / feature |
| L798-809 `script_rel` | `trainRemote`（遠端 Docker 訓練） | 上述 5 項 ＋ serial（**映射存在但模板檔不存在**，見 G2） |

## 5. 資料集雙佈局（所有影像系共用）

依 AGENTS.md「訓練資料集雙佈局鐵律」，影像系 `DATASET_DIR` **永遠填資料集根**，
loader 內部自理佈局：

- **落盤佈局**（DM 日常，拍完即練）：`<label>/*.jpg` ＋ `dataset.json`（**標註真相**）。
- **匯出佈局**（分享／第三方 YOLO 工具）：`images/` ＋ `labels/`（或 `lines/`）＋ `labels.txt`。

loader 分派順序：`images/` 存在 → 匯出佈局；否則 → 落盤佈局（`_collect_dm_lines` / `_collect_dm_pairs`）。
**切勿在落盤區手工造 `images/`**，會觸發匯出佈局而其 labels 不完整。

## 6. 對應計畫與紀錄

| 項目 | 位置 |
| :--- | :--- |
| 稽核計畫（本文件來源） | `log/plan/ComprehensiveAudit_2026-09-27.md` §6 P2-10 |
| 分層鐵律與 P2-11 結論 | `AGENTS.md`「訓練集切分鐵律：分層抽樣」 |
| 類型鎖定工作流 | `log/plan/DatasetManagerTypeLockedWorkflow.md` |
| 開發指南 | `log/mappings/DatasetManager_DevGuide.html` |
| 四類型切分證據 | `temp_scripts/e2e_p211_line_split_check.py` |
| 匯出佈局證據 | `temp_scripts/e2e_export_live_layout_check.py` |

  超過以 `stats.samples_truncated` 標記）。
- **匯出**：L339-350 寫 `data.csv`（欄序＝`schema.columns` 順序，UTF-8）＋ `dataset.json`。
- **切分**：依 label 欄位值分層；若 label 為**連續數值（回歸）**則允許隨機切＋報告註明。
- **推論**：**無專屬解析積木**（見 §3）。

| **匯出 ZIP 內容** | `<label>/*.jpg`（原樣） | `images/` + `labels/` + `labels.txt` + `export_manifest.json` + `dataset.json` | `images/` + `lines/` + `dataset.json` | `data.csv` + `dataset.json` |
| **訓練模板** | `classifier/classifier_train.py` | `detector/detector_train.py` | `line_follower/line_follower_train.py` | `table/table_train.py` |
| **loader** | `common/classifier_dataset.py` | `common/detector_dataset.py` | `common/line_dataset.py` | `common/table_dataset.py` |
| **切分策略** | **分層**（依資料夾類別） | **分層**（依 YOLO `class_id`） | **隨機**（回歸型，見下方註） | 分層／隨機（依 label 為類別或連續值） |
| **訓練報告指標** | Accuracy / Loss | Loss / **IoU** / MAE | Loss / **MAE** | Loss / **MAE** |
| **推論積木** | `py_ai_get_label`、`py_ai_get_confidence` | `py_ai_get_bbox`、`py_ai_get_bbox_center`、`py_ai_get_direction` | `py_ai_get_line`、`py_ai_get_line_end`、`py_ai_get_line_offset`、`py_ai_get_line_angle` | 無專屬解析積木 |
| **雙佈局直練** | ✅ | ✅ | ✅ | ✅（CSV） |

> **註（line_following 切分）**：`line_following` **無類別欄位**（`class_id` 恆 0，UI 無類別選擇器，
> `typePolicy.needsUnclassifiedCheck()` 僅對 `object_detection` 為真）→ 屬**回歸型**，
> 依 AGENTS.md 分層鐵律**允許隨機切＋報告註明**。已於 2026-10-02 三層查證結案。
> 證據：`temp_scripts/e2e_p211_line_split_check.py`。日後啟用多線型則改依 `class_id` 分層。
