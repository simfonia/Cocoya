> **STATUS: SUPERSEDED（2026-09-01, Stage 6）** — 本計畫的進度存讀、canonical 路徑、防呆確認框已於重構中實作（見 `log/plan/DatasetManagerRefactor.md` Stage 1/2 與 `docs/backend_api_manifest.md` dataset 指令）；現行契約以後者為準。

# Dataset Manager 進度儲存與防呆計畫（Guardrails + 等級一存讀 + live savePath 接回）

## 背景與動機

延續 `StartupProjectAnchoring.md`（主題一）的「專案根 SSOT」，本主題（主題二）解決 Dataset Manager 的三個使用缺陷：

1. **過度彈性、無防呆**：`typeSelect.onchange` 切換專案類型會**無條件清空** images/tableRows/spec（`ui_layout.js` L1711 實證，無確認）；「清除資料」按鈕亦無確認；關閉 modal 無 dirty 提示——課堂上一個誤按就可能整批資料消失。
2. **無中途儲存**：Dataset Manager 的 spec + 標註（annotations）只在記憶體，關閉即失；全 codebase 無 `saveSpec/loadSpec/datasetSave/datasetLoad`。
3. **live 影像「資訊斷層」**：sidecar `captureImage` 其實已把照片存到磁碟（VSIX `datasetOps.ts` L326 預設 `dataset/<project>/<label>/`），但前端 `sampler.js takeSnapshot` 收到 `savePath` 卻只取 `base64`、把真路徑丟棄（`addSampleFromSampler(blob)` 只用 blob）。

---

## 範圍

- **A. 防呆**：typeSelect 切換前、clearBtn、關閉 modal——共用 dirty 檢查 + 確認/提示。
- **B/C. 等級一存讀**：「儲存進度」寫 `dataset.json`（含 annotations）到「專案根/dataset/<專案>/」；開啟資料夾自動讀取並依路徑套回標註。
- **D′. live savePath 接回**：採集時把 `savePath` 帶回 `image.diskPath`，使 live 照片與資料夾匯入「殊途同歸」。

## 排除範圍

- **C 項（匯出重排資料夾）**：獨立待辦（`log/todo.md`），本主題不做。
- **D（流程步驟條）**：暫緩。
- live 影像的「採集即寫檔」不需新增——sidecar 已寫檔，本主題只做「接回路徑」。

---

## 架構決策

### A. 防呆（共用 dirty 判定）
- 定義 `hasUnsavedWork()`：`state.images.length > 0 || state.tableRows.length > 0 || spec 非全新預設`。
- 於三處統一置入確認：
  - `typeSelect.onchange`：若有未存工作 → `confirm(切換類型將清除目前資料…)`，取消則回滾 typeSelect 至原值。
  - `clearBtn.onclick`：`confirm(確定清除所有資料並重置？)`。
  - 關閉 modal：若有未存工作 → 提示「儲存進度 / 不儲存 / 取消」。
- 沿用 `window.CocoyaBridge.confirm/prompt`（既有、雙平台）。

### B/C. 等級一存讀（依賴 1A 專案根）
- **儲存**：新增「儲存進度」→ 把 `state.spec.toJSON()`（內含 `data_source.samples[].annotations`）寫成 JSON → 專案根 `dataset/<projectName>/dataset.json`。透過既有 Bridge fs 管道（VSIX `fs`、Tauri `tauri-plugin-fs`）。
- **載入**：`handleDirectoryImport()`（選擇資料夾）完成掃描後，檢查該資料夾是否含 `dataset.json`：
  - 若有 → 以它為「真」：恢復 `project.type`（type 下拉自動對齊）、`schema`（label_map/features/label）、`stats`、`samples`；
  - **依 `samples[].image_path` 將 `annotations` 對應回重新掃描出的 `images[]`**（關鍵：避免標註白標）；
  - 顯示「已從上次進度恢復」提示。
- 若 `dataset.json.project.type` 與 UI 目前類型不同 → 以檔案為準（更新下拉）。

### D′. live savePath 接回
- `sampler.js takeSnapshot`：把 `datasetCaptureResult.savePath` 傳給 `onSampleCaptured`／`addSampleFromSampler`。
- `image` 新增 `diskPath` 欄位（真磁碟相對路徑）；`samples[].image_path` 改用真路徑（可被掃描與存檔還原）。
- ⚠️ **Tauri 端需實機確認** `captureImage` 的 savePath 預設行為是否與 VSIX 一致（VSIX 由 `datasetOps.ts` 補預設）；若有差異，在 Tauri 端補一段預設 savePath。

---

## 檔案異動清單（預估行數為粗估）

| 檔案 | 異動 | 粗估 |
|---|---|---|
| `ui/src/modules/dataset_manager/ui_layout.js` | `hasUnsavedWork()`、三處防呆、`handleSaveProgress()`、`loadProgressFromFolder()`、`handleDirectoryImport` 載入整合 | A: ~100–150 / BC: ~150–250 |
| `ui/src/modules/dataset_manager/ui_components.js` | （視需要）存讀按鈕/提示渲染 | ~30–60 |
| `ui/src/modules/dataset_manager/sampler.js` | `takeSnapshot` 傳 savePath；`image.diskPath` | ~20–40 |
| `ui/src/modules/dataset_manager/i18n/*` | 防呆/存讀/警示文案（zh-hant/en） | ~30 鍵 |
| `src-tauri/src/commands/file.rs` 或 dataset.rs | 實機確認 savePath；必要時補預設 | 待確認 |

---

## 里程碑（承接主題一 M1/M2）

| 里程碑 | 內容 | 依賴 |
|---|---|---|
| **M3** | 主題二 A：防呆（dirty 判定 + 三處確認） | 1A（M1） |
| **M4** | 主題二 B/C：等級一存讀 + D′ savePath 接回 | M1、M3 |

---

## 驗證清單

1. **A 防呆**：有未存資料時切換類型／清除資料／關閉視窗 → 各自彈確認；未存工作為空時不彈。
2. **B 儲存**：儲存進度後，`<專案根>/dataset/<專案>/dataset.json` 產生，且 `samples[].annotations` 已含標註。
3. **C 載入**：重新開啟資料夾（含 dataset.json）→ type/schema/stats/樣本回復、**bbox/line 標註依路徑套回**、縮圖綠勾/分類徽章正確。
4. **D′ live**：採集後 `image.diskPath` 有真路徑；儲存進度後 live 照片可被下次載入掃描（VSIX 實測；Tauri 實機確認 savePath）。
5. 回歸：image 分類校正、object_detection bbox、line_following 標註流程不因防呆被誤擋（僅在「有未存工作」時出生警告）。
6. 深色主題提示樣式可讀。

## 風險與注意事項

- **遺留範例**：匯出 ZIP 內含 `labels/`、`dataset.json`（訓練產物），載入邏輯需區分「進度用 dataset.json」與「訓練產物」，避免複用錯位。
- **路徑對應失敗**：`samples[].image_path` 相對路徑與重新掃描路徑不一致時，annotations 無法套回 → 需定義匹配鍵（建議相對路徑；失敗時僅略過該圖並警示，不阻斷整體載入）。
- **防呆 vs 教學彈性**：僅在「有未存工作」時攔截，避免空畫布點擊也被打擾。
- 實作時需遵守轉義與換行規範（產生器字串四層）。

*更新日期：2026-08-10*