> **STATUS: SUPERSEDED（2026-09-01, Stage 6）** — 本計畫的項目（Importer 清理、scroll、標籤清理、i18n、主題 token）已於 `log/plan/DatasetManagerRefactor.md` 重構中收斂並實作；現行架構/契約以該計畫及其施工指引、`log/mappings/DatasetManager.html` 為準。

# Dataset Manager 優化計畫

## 背景
本計畫針對 Cocoya Dataset Manager 進行程式碼清理與使用者體驗優化，涵蓋 7 個項目，依序處理。

---

## 項目 1：Importer 閒置問題（清理/整合）

### 現狀
- `ui/src/modules/dataset_manager/importer.js` 中的 `importImageDirectory()` 方法未在任何地方被呼叫
- VSIX 模式使用 `handleDirectoryImport()` 透過 Bridge 的 `pickFolder` 處理
- Tauri 模式使用 `handleDirectoryImport()` 透過 Rust `pick_folder` 指令處理（2026-07-29 B1 已完成）

### 處理方式
- 將 `importer.js` 的 `importImageDirectory()` 功能整合進 `ui_layout.js`（保留原始碼邏輯但移除可刪除的冗餘）
- 或是直接移除 importer.js 並從 `index.js` 的 import 清單中移除
- 更新 `core_manifest.json` 中的模組載入清單（如有必要）

### 驗證方法
1. 開啟 Dataset Manager，選擇「影像資料集」類型
2. 點擊「選擇影像資料夾」匯入資料
3. 確認縮圖牆正確顯示，標籤統計正確
4. 檢查瀏覽器 Console 無 import error

---

## 項目 2：攝影機預覽更新優化

### 現狀
- 攝影機啟動後，右側預覽面板僅顯示「原生預覽已開啟」的標示
- 使用者無法看到即時串流，僅能看到最後一次拍攝的快照 (`dataset-sampler-last-preview`)
- Tauri 模式使用 sidecar 時，影像透過 base64 傳輸，無法實現即時串流

### 處理方式
- 保留現有的 sidecar 擷取模式（即時串流需要 WebRTC/WebSocket 不在此範圍）
- 將「原生預覽已開啟」的提示改為更友善的說明：
  - 顯示目前選擇的攝影機名稱
  - 顯示「點擊拍攝快照以獲得最新影像」等指引
  - 縮小 hint overlay 以減少視覺干擾

### 驗證方法
1. 選擇「影像資料集」→ 來源模式切為「live」
2. 點擊「啟動預覽」
3. 確認提示文字顯示正確、友善
4. 拍攝快照後確認預覽圖正確更新

---

## 項目 3：標註模式返回後 scroll 穩定

### 現狀
- `enterAnnotationMode` 使用 `state._savedGridScrollTop` 保存縮圖網格的滾動位置
- `exitAnnotationMode` 在 `refreshDynamicPanels()` 中還原
- 但還原時標籤統計面板同時重新渲染，可能導致視覺跳動
- 還原邏輯散布在 `handleDeleteImage`, `refreshDynamicPanels`, `addSampleFromSampler` 等多處

### 處理方式
- 統一卷動保存/還原邏輯到 `refreshDynamicPanels()` 中
- 目前已有 `state._savedGridScrollTop` 機制，但存在以下問題：
  - `enterAnnotationMode` 會存 scrollTop，但 `exitAnnotationMode` 呼叫 `refreshDynamicPanels` 才能還原
  - 應該確保流程中不會遺失 scrollTop
- 改善：在 `refreshDynamicPanels` 中增加當 `_savedGridScrollTop` 存在時的明確標記
- 簡化 `handleDeleteImage` 中的獨立 scroll 處理（讓 `refreshDynamicPanels` 統一管理）

### 驗證方法
1. 匯入大量影像（>50張），滾動到中間位置
2. 點擊任一影像進入標註模式
3. 點擊「← 返回列表」
4. 確認返回後縮圖牆捲動位置與進入前一致

---

## 項目 4：標籤新增 UI 流程改善

### 現狀
- 採集面板中「新增標籤」流程使用 label group ↔ new label group 切換
- 新增標籤時雖有更新 spec.label_map，但存在以下問題：
  - 取消新增（按 ✘ 或 Escape）後，下拉選單狀態可能不一致
  - 新增成功後 dropdown 選到新標籤，但若清單為空才自動進入新增模式
  - 某些邊界情況 `onLabelChange` 回調觸發兩次

### 處理方式
- 在 `renderSamplerView` 綁定事件時，確保 `setAddMode(false)` 後下拉選單選到正確值
- 統整 `onLabelChange` 回調，避免重複觸發 spec.label_map 更新
- 改善取消行為：取消後自動選取現有標籤的第一個（如果有）

### 驗證方法
1. 採集面板啟動後，確認「無標籤時自動進入新增模式」
2. 新增標籤 "test_label" → 確認成功新增到 dropdown
3. 新增標籤後，確認直接拍攝快照的標籤為 "test_label"
4. 點擊「+」後按 Escape → 確認恢復正常 dropdown 顯示
5. 切換標籤 → 確認標籤統計更新

---

## 項目 5：CSS 深色主題完整度

### 現狀
- 部分 `.vscode-dark` 樣式缺少對應的 `.vscode-high-contrast` 變體
- 部分 hover 狀態在深色模式下未定義（如 `.dataset-icon-btn:hover`, `.dataset-image-item:hover`）
- 採集面板的 `.dataset-sampler-controls` 在深色模式下的邊框顏色

### 處理方式
- 全面檢視 dataset_manager.css，補齊缺少的 dark/high-contrast 變體
- 使用媒體查詢或 class 來統一深色主題變數

### 驗證方法
1. 在 VSIX 模式中切換到深色主題（`workbench.colorTheme`）
2. 開啟 Dataset Manager，確認所有面板、按鈕、輸入框在深色模式下正確顯示
3. 在 Tauri 模式中檢查（無主題切換，但應有基本 fallback）

---

## 項目 6：廢棄 DOM 元素清理

### 現狀
- `#dataset-dir-input`（`input[webkitdirectory]`）在 DOM 中存在但無綁定 `onchange`
- `handleDirectoryImport()` 現在完全透過 Bridge 的 `pickFolder` 實作
- 此 input 已無實際用途，應清除

### 處理方式
- 從 `createModal()` 的 HTML 模板中移除 `#dataset-dir-input`
- 同時檢查 `clearBtn.onclick` 中對 `di` input 的清理邏輯是否需要同步更新

### 驗證方法
1. 開啟 Dataset Manager
2. 使用「選擇影像資料夾」功能
3. 確認功能正常（不應受 DOM 清理影響）
4. 檢查無 console error

---

## 項目 7：SyncSpecFromUI 的 label_map 保留邏輯

### 現狀
- `buildLabelMap()` 中當 label 欄位被移除但 label_map 有資料時，會保留舊的 label_map
- 這可能導致 label_map 中殘留已不存在的標籤

### 處理方式
- 改進 `buildLabelMap()` 邏輯：當 label 欄位改變時，清除無關的 label_map 條目
- 但保留與目前 label 欄位的資料關聯性
- 增加 label_map 條目的清理時機（避免累積髒資料）

### 驗證方法
1. 匯入有標籤的影像資料
2. 確認 label_map 正確產生
3. 切換專案類型或清除資料
4. 確認 label_map 正確重置，無髒資料殘留

---

## 執行順序

1. 項目 6：廢棄 DOM 元素清理（最簡單、無風險）
2. 項目 1：Importer 閒置問題（清理整合）
3. 項目 5：CSS 深色主題完整度（視覺改善）
4. 項目 4：標籤新增 UI 流程改善（使用者體驗）
5. 項目 2：攝影機預覽更新優化（使用者體驗）
6. 項目 3：標註模式返回 scroll 穩定（使用者體驗）
7. 項目 7：SyncSpecFromUI 的 label_map 保留邏輯（資料正確性）