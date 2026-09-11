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

