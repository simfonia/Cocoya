# Dataset Manager 類型鎖定工作流程改造計畫（Type-Locked Workflow）

> 建立：2026-09-10（#task[dataset manager流程改造規畫] 定案）
> 狀態：ACTIVE（舊 Guardrails／UX 計畫相關段落以本計畫為準）
> 更新：2026-09-11 補熱修2~5c＋導航層級改造（見 §9）；M2 啟動
> 決策：1.A 類型鎖定＋卡片入口；2.feature/serial 可點＋「開發中」徽章；3.resume 僅資料集＋標註；4.一併重構

## 1. 背景與問題

- 單一 modal 包辦 6 種 type（`image/object_detection/line_following/feature/serial/table`，見 `spec.js`）＋來源 `live/file/hybrid`（`hybrid` 實為死選項）。
- 根因：`typeSelect.onchange` 切換即清空 `images/tableRows/spec`（`ui_layout.js` 約 L1332，僅 confirm 防呆）。
- `ui_layout.js` 約 1470 行仍是上帝協調層（10+ 處 `if (projectType === ...)`）。
- 完成度：`image`／`object_detection` 可用；`line_following` 有標註 UI 無模板；`table` 有匯入無 `load_table_dataset`；`feature` 僅雛形；`serial` 三無。
- Resume 底子已有：autosave 寫 `<專案根>/dataset/<名稱>/dataset.json`，依 `image_path` 套回標註；類型鎖死後即穩定。

## 2. 目標架構

DM 開啟 → Step 0 卡片入口（新增 `ui/entryCards.js`）：4 正式卡＋2 開發中卡（可點＋徽章＋banner）→ 選定即鎖定（session immutable）→ 工作區（既有 3 欄 modal＋頂部類型徽章，換類型唯一路徑＝確認→回入口另開）。

## 3. 雙平台契約（VSIX／Tauri）

- 前端一律經 `io/bridge.js`（唯一 Bridge Port），禁 direct `window.CocoyaBridge`。
- 後端零新增 command：`datasetExport / datasetSaveProgress / datasetLoadProgress / dataset_import_from_folder` 皆透傳 `spec.type`。M2 以 `cargo check`＋雙平台實機驗證。
- 路徑 `<專案根>/dataset/<名稱>/dataset.json`（canonical），`examples/` 唯讀保護不變；`getProjectAnchor` 進入閘不變。

## 4. i18n 契約

- 新 key 一律 `DSM_*`，經 `t('KEY', fallback)`（禁雙重前綴），zh-hant＋en 同步，跑 parity scan。
- M1 新 key（22 個）：`ENTRY_TITLE / ENTRY_SUBTITLE / ENTRY_START / ENTRY_DEV_BADGE / ENTRY_BACK / TYPE_LOCKED_TIP / SWITCH_TYPE_CONFIRM / SWITCH_TYPE_HINT / ENTRY_TYPE_* （6) / ENTRY_DESC_* （6) / DEV_BANNER_FEATURE / DEV_BANNER_SERIAL`。舊 `TYPE_SWITCH_CONFIRM` 保留。
- `core/typePolicy.js` 純邏輯禁文案；`spec.js` 直用 `t()` 不新增耦合。

## 5. 主題 CSS 契約

- 新樣式一律 `--dsm-*` token（`:root`＋dark/HC 覆寫＋三主題 cssVars 同步；禁掛 dialog）。
- M1 新 token（6 個）：`--dsm-card-bg / --dsm-card-border / --dsm-card-hover-border / --dsm-dev-badge-bg / --dsm-dev-badge-text / --dsm-type-badge-bg`。

## 6. 切模組／抽共用／重構進度

| # | 項 | 狀態 |
|---|---|---|
| R1 | `application/sessionManager.js` | M1 完成（3 測試） |
| R2 | `ui/entryCards.js`＋modal 回入口按鈕 | M1 完成（2 測試） |
| R3 | `core/typePolicy.js` | M1 完成（4 測試；layout 兩處改吃它） |
| R4 | `normalizePath` 去重＋`core/html.js` | M2 完成（html.js 5 測試；ui_components 損壞轉義刪除改 import；entryCards esc 刪除改 import；layout 雙函式刪除改 import；86/86＋check＋vite PASS） |
| R5 | `ui/labelManager.js` | M2 完成（2 測試；layout 約120行上帝函式抽出＋委派；annotation/classification 依賴零改；88/88＋check＋vite PASS） |
| R6 | `ui/samplerPanel.js` | M2 完成（3 測試；live 段約60行抽出＋委派；相機語意不變；91/91＋check＋vite PASS） |
| R7 | 表格 samples 落盤（前 2000＋truncated） | M2 完成（spec.js `buildTableSamples` 純函式＋`TABLE_SAMPLES_PERSIST_LIMIT=2000`；stats.samples_truncated 契約＋round-trip preserve；syncSpecFromUI 非影像系落盤 samples（舊一律 []）；97/97＋check×3＋vite PASS） |
| R8 | 匯出按類型分流（serial 擋下） | M2 完成（exportUseCases 改吃 typePolicy isDevType/needsAnnotationCheck/needsUnclassifiedCheck；feature/serial 擋下＋新 DSM key zh/en；2 測試；i18n parity 147/147；99/99＋check×4＋vite PASS） |
| R9 | 後端對齊實機驗證 | 後端對齊完成（cargo check 3 既有 warning＋cargo test 1/0＋tsc＋npm run compile＋vite 全綠；後端零 command 改動，spec.type/stats.samples_truncated 透傳不解讀）；雙平台實機＋三主題目視列使用者 backlog |

## 7. 補完計畫（依賴排序）

- M-T1 `table`：`common/table_dataset.py`＋`table/table_train.py`＋R8 匯出分支。
- M-L1 `line_following`：YOLO-line 匯出＋`line/line_train.py`＋分層。
- M-F1 `feature`：21＋33 點→CSV→表格管線；缺裝降級。
- M-S1 `serial`：本次僅佔位，正式另立里程碑。

## 8. 里程碑與驗證

- M1（本輪完成）：45/45 測試＋tsc＋cargo check＋vite build＋parity 142/142；i18n 動態前綴為預期內提示。
- M2：重構收斂＋雙平台實機（每類卡→徽章→匯出／存讀）＋三主題目視。
- M3：表格＋循線模板跑通。M4：特徵最小可用。M5：文件＋清理。

## 9. M1 後續熱修與導航改造（2026-09-10~11，詳見 log/work/2026-09-10.md）

- 熱修1：`enterWorkspace` 誤 call 區域 `updateSourceModeOptions` → 改頂層 `rebuildSourceModeOptions(type)`。
- 熱修2/4：停止攝影機三層修——`sampler.js stopCamera(true)` 全路徑強制停止；按鈕以 DOM 真值判斷開關；`camera_service.py stop()` 只設 flag＋join(2.0)，銷毀交 `_run` 執行緒（跨執行緒 `destroyAllWindows` 會 deadlock）。
- 熱修3：`sidecarManager.ts` 多監聽器（`addEventListener` 回傳 unsubscribe；訓練/X 關窗事件不再互斥）。
- 熱修5/5b/5c：縮圖刪檔（live `diskPath`＋`validateDeletableDiskPath`）、統計即時（`renderStatsPanels`）、標註縮圖刪除鈕補回、刪圖後左欄重繪＋進度三分流。
- 導航層級改造：P1 建立新資料集／P2 資料集管理 — 類型／P3 標註 — 子模式；`BACK_TO_LIST`→`BACK_TO_MANAGE`；header X／Esc 統一 `requestCloseDM()`；P3 隱藏清除資料＋回入口鈕；新 key `PAGE_NEW_DATASET/PAGE_MANAGE/PAGE_ANNOTATE/BACK_TO_MANAGE/EXIT_DM_CONFIRM`。
- M2 施工鐵律：R4 起每步備份＋小步改＋`node --test`＋`node --check`＋`vite build`，再 `tsc`＋`cargo check`；`log/work/` 追加＋`todo.md` 更新。


## 10. M3 施工計畫（2026-09-11 定案，表格＋循線模板跑通）

> 對應 §7 的 M-T1（table）與 M-L1（line_following）。
> 前置事實（M2 已驗）：
> - 匯出分流 R8 完成：`exportUseCases` 吃 typePolicy，feature/serial 擋下，table/line_following 已放行。
> - sidecar `exportDataset`（dataset_sidecar.py L131~184）：目前僅在 `type === 'object_detection'` 時由 dataset.json annotations 寫 YOLO labels + labels.txt，其後一律 `DatasetIO.export_dataset()` 打包（ZIP 內含 dataset.json）。
> - line 標註格式（ui_canvas.js）：`annotations = [{ class_id, line: [x1,y1,x2,y2] }]`，比例座標 0~1，**每張圖僅一條**（line 模式畫第二條會整組取代）；class_id 恆 0（無多類 UI）。
> - table 現況：spec.js 有匯入（CSV/JSON→schema.columns＋samples）與 R7 samples 落盤（前 2000 筆＋`stats.samples_truncated`）；**無** `load_table_dataset`／`table_train.py`。
> - 分層鐵則（AGENTS.md）：table 依 label 欄位值分層；回歸型（label 連續數值）才允許隨機切且須在報告註明。line_following 無類別欄位 → 屬回歸型，隨機切＋註明即可。

### 10.1 M-T1 table 模板

| 步驟 | 內容 | 檔案 |
|---|---|---|
| T-1 | 新增 `common/table_dataset.py`：讀 dataset.json（schema.columns 決定欄位順序、samples 為 rows）→ numpy；`stratified_table_split(rows, labels, validation_split, seed)`——label 為類別型（string/int/boolean）依類別值分層（重用 classifier 分層邏輯，含教學保護：類別 ≥2 筆時 train/val 各至少 1 筆、切後為空報錯）；label 為 float（回歸）→ 隨機切＋報告註明「回歸型隨機切分」。輸出分層報告 `分層抽樣 (stratified split): <值>: train N / val M` | `resources/train_templates/common/table_dataset.py`（新） |
| T-2 | 新增 `table/table_train.py`：比照 detector_train.py 骨架（argparse `--dataset_dir --spec_json --epochs --batch_size --model_output`；stdout reconfigure UTF-8；open 加 encoding）。模型頭依 label 欄位 type：string/int/boolean → Dense(n, softmax) 分類；float → Dense(1, linear) 回歸。輸出 TFLite＋訓練報告（open_report 流程同 classifier） | `resources/train_templates/table/table_train.py`（新） |
| T-3 | sidecar 匯出分流：`exportDataset` 在 `type === 'table'` 時由 spec.samples＋schema.columns 寫 `data.csv`（欄序＝columns 順序、UTF-8、header），再打包；與既有 YOLO 分支互斥、不影響 image/line 路徑 | `resources/dataset_manager/dataset_sidecar.py` |
| T-4 | 訓練進入點路徑映射：sidecar／host 的 train_templates 模板路徑清單加入 `table/table_train.py`＋`common/` 共用（確認既有 classifier/detector 如何解析 relative path，照抄） | sidecar / `src/handlers/sidecarManager.ts` / Rust 視映射所在而定 |
| T-5 | 驗證：本機以 CSV 匯入建 table 專案 → 匯出（ZIP 內 data.csv＋dataset.json）→ 訓練跑通（分類＋回歸各一）→ 報告開啟。分層報告列印比對 | 實機 |

### 10.2 M-L1 line_following 模板

| 步驟 | 內容 | 檔案 |
|---|---|---|
| L-1 | sidecar 匯出分流：`type === 'line_following'` 時由 annotations（`line:[x1,y1,x2,y2]` 比例座標）寫 `lines.txt`（每張一列 `x1 y1 x2 y2`，歸一化、UTF-8），未標註影像跳過並於 stderr 統計；未標註比例過高（如 >50%）輸出警告 | `resources/dataset_manager/dataset_sidecar.py` |
| L-2 | 新增 `common/line_dataset.py`：讀 images/＋lines.txt；回歸型隨機切分（seed 固定）＋報告註明「無類別欄位（回歸），隨機切分」；教學保護：樣本 <2 報錯 | `resources/train_templates/common/line_dataset.py`（新） |
| L-3 | 新增 `line/line_train.py`：MobileNetV2 轉移學習＋回歸頭 Dense(4, sigmoid)（輸出歸一化端點，與標註同座標系）；loss=MSE；輸出 TFLite＋報告 | `resources/train_templates/line/line_train.py`（新） |
| L-4 | 訓練進入點映射加入 `line/line_train.py`（同 T-4） | 同 T-4 |
| L-5 | 驗證：line 專案 live/file 採樣＋畫線標註 → 匯出（ZIP 內 lines.txt）→ 訓練跑通 → 報告 | 實機 |

> M3 施工結論（2026-09-12）：實作與本表有三處偏差，均為對齊既有 SSOT 映射所需——
> 1. L-1 匯出改為 `lines/` 目錄（每張標註影像一個同名 .txt，一行 `x1 y1 x2 y2` 歸一化比例座標），不用單一 lines.txt：與 YOLO labels/ 慣例對稱、可逐一配對免錯位；未標註影像跳過不產檔＋>50% 警告。
> 2. 循線腳本路徑為 `line_follower/line_follower_train.py`（本地 generator 既定映射），非 `line/line_train.py`；line 模型重用 detector `Dense(4, sigmoid)` 回歸頭（語意改為端點），不再另建 line 模型檔。
> 3. T-4 擴大為訓練映射對齊：sidecar `trainLocal` 改 task→檔名映射（修硬編碼 classifier＋誤傳 `--model_type`→`--backbone`；舊參數下 argparse exit 2 全壞）；遠端 script_rel 對齊實檔（detector→`detector/detector_train.py`，修幽靈 `object_detection/`；table 已對）。
> 驗證：table 分類（分層）/回歸（隨機切註明）訓練跑通＋f32/int8 TFLite＋labels.txt；line 訓練跑通＋f32 TFLite；sidecar exportDataset 真實行程 e2e（`temp_scripts/m3_export_e2e.py`：CSV 含逗號引號包覆＋未標註跳過）全 PASS；`py_compile` 5 檔 PASS。煙霧資料產生器 `temp_scripts/m3_smoke_make_data.py`（table_clf/table_reg/line_ds，均 git-ignored）供回歸重跑。詳見 `log/work/2026-09-12.md`。

### 10.3 明確不做（M3 範圍外）
- 推論 generator／積木（`py_ai_get_line`、table 推論磚）→ M4。
- line 多類別標註 UI（class_id 恆 0）→ 未來需求再議；若日後加類別，切分改依 class_id 分層（比照 detector）。
- feature/serial → M4／另立里程碑（R8 已擋下匯出）。
- 後端零新增 command 維持不變（R9 契約）。

### 10.4 施工鐵律（沿襲 §9）
每步：先備份至 `backup/`（yyyyMMdd_HHmmss）→ 小步改 → `node --check`（新 JS 時）＋ `cargo check`（Rust 動到時）＋ Python 直接 `python -m py_compile` 新腳本 → 雙平台實機 → `log/work/2026-09-11.md` 追加＋`log/todo.md` 更新（禁刪歷史）。

