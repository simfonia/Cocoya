# Dataset Manager UI/UX 優化計畫（驗證語意 + 分類標籤校正模式）

## 背景與動機

Dataset Manager 在「專案類型切換」後的 UI 變化存在邏輯不一致與 UX 混亂，初期發現兩項核心問題：

1. **右欄警示「至少需要一個 schema 欄位」不知所云**：無論哪種專案類型，只要 `schema.columns` 為空就強制顯示紅色 error，但對影像類專案（image / object_detection / line_following）欄位是匯入時自動生成的，UI 上甚至沒有地方可以手動補欄位。
2. **image（影像分類）類型點縮圖會誤入 bbox 拉框標註**：分類訓練不需要標註框（類別由資料夾名稱決定），但目前縮圖點擊一律進入 bbox 標註模式，且類別選擇器被隱藏、畫出的框無意義，連帶「未標註」檢查與進度語意全部錯亂。

## 目標

- **驗證語意專案類型感知**：消除無意義的紅色 error，改以「引導式」訊息與 warning（橘色）呈現「尚未完成」狀態。
- **image 類型縮圖點擊分流**：進入「影像分類標籤校正」模式（整圖標籤檢視/改派），不再進入 bbox 拉框標註。
- **未標註檢查依類型修正**：只有 object_detection / line_following 才檢查 bbox/line 是否齊全；image 分類不做該檢查。

## 排除範圍（本次不做）

- **C 項：分類標籤校正的匯出整合**（sidecar/Rust 端依 `samples[].label` 重新組織資料夾結構）工程較大，**暫緩**，另行評估。

---

## 現況問題分析（含原始碼位置）

### 問題 1：右欄「至少需要一個 schema 欄位」錯誤

- 右欄（`.dataset-preview-panel`，grid 第 3 欄）頂端 `#dataset-validation` 由 `ui_layout.js` `refreshPreview()` → `spec.validate()` → `renderValidation()` 渲染。
- 觸發點：`spec.js` `validate()` L180-182

```js
if (!Array.isArray(spec.schema.columns) || spec.schema.columns.length === 0) {
    errors.push(t('VALIDATE_COLUMN_REQUIRED', 'At least one schema column is required.'));
}
```

- **影像類（image / object_detection / line_following）**：
  - `schema.columns` 僅在 `handleDirectoryImport()`（固定寫入 `image_path` + `label`）或採集樣本後自動生成。
  - 影像模式下 schema 面板切成「標籤與樣本統計」視圖，`#dataset-schema-actions` 被隱藏 → **使用者無處補欄位**，紅色 error 對使用者無解。
- **表格類（table / feature / serial）**：欄位由 CSV/JSON 匯入時自動偵測或手動新增，剛開啟就顯示紅色錯誤且無引導下一步。
- **其他衍生不一致**：
  - 缺 label 用 warning、缺欄位卻用 error，分級不一致。
  - `object_detection` 未被列入 `features.length === 0` 豁免清單（`image`、`line_following` 有）（`spec.js` L213-215）。

### 問題 2：image 分類誤入 bbox 標註

- 縮圖點擊回呼 `ui_layout.js` L1113 / L1180 / L1237：全部 `onImageClick: (img, idx) => enterAnnotationMode(img, idx)`。
- 畫布模式僅區分 line_following（`ui_layout.js` `loadAnnotationImage()` L586）：
  ```js
  const mode = projectType === 'line_following' ? 'line' : 'bbox';
  ```
- 類別選擇器只在 `projectType === 'object_detection'` 渲染（`ui_layout.js` `renderAnnotationControls()` L738）→ image 類型出現 crosshair 畫布卻無類別可選，畫出的框 `class_id=0`、訓練端不使用。
- **語意錯亂連鎖**：
  - `updateAnnotationProgress()`（L642）與縮圖綠勾以 `annotations.length > 0` 計算 → 分類的任何圖都被視為「未標註」。
  - `checkUnannotatedOnExit()`（L927）、匯出前的「尚有 N 張圖片未標註」檢查（`handleExportDataset()` L385-393）同樣誤用 bbox 語意騷擾分類使用者。
  - 正確的「分類標註」應是**整圖標籤指派/校正**（`classifier_dataset.py` 以子資料夾名稱作為類別，L37-38）。

---

## 架構決策

1. **類型感知驗證**：`spec.js` 定義 `IMAGE_TYPES` 常數集合，`validate()` 依專案類型決定錯誤/警告與文案。
2. **縮圖點擊分流**：`enterAnnotationMode()` 開頭判斷，`image` 類型轉入新函式 `enterClassificationReviewMode()`。
   - **共用** `state.annotationMode` 狀態機、`.dataset-annotation-mode` 全寬布局、`.dataset-annotation-fullscreen`、返回按鈕、縮圖欄與鍵盤 Esc。
   - **差異**：中央不初始化 UICanvas；右側改為「目前分類」下拉選單 + 新增類別；快捷鍵移除 Delete；未標註檢查略過。
3. **未標註語意**：`checkUnannotatedOnExit()` 與匯出檢查改以 `state.annotationMode.mode` / 專案類型判定，只有 object_detection / line_following 走 bbox/line 未標註檢查。

---

## 檔案異動清單

| 檔案 | 異動摘要 |
|------|----------|
| `ui/src/modules/dataset_manager/spec.js` | 新增 `IMAGE_TYPES`；`validate()` 改為類型感知：影像類無欄位時檢查樣本數（warning），表格類維持 error 但文案引導化；補上 `object_detection` 的 features 豁免；避免重複噪音警告 |
| `ui/src/modules/dataset_manager/ui_layout.js` | `enterAnnotationMode()` 分流；新增 `enterClassificationReviewMode()` / `loadClassificationImage()` / `renderClassificationControls()` / `updateClassifyProgress()`；`navigateToImage()`、`updateThumbnailHighlight()`、`exitAnnotationMode()`、`checkUnannotatedOnExit()`、`handleExportDataset()` 類型感知化；`state.annotationMode` 新增 `mode` 欄位 |
| `ui/src/modules/dataset_manager/ui_components.js` | `renderAnnotationThumbnails()` 支援 `mode: 'classification'`（顯示標籤徽章取代綠勾） |
| `ui/src/modules/dataset_manager/dataset_manager.css` | 新增分類控制欄/標籤徽章樣式 |
| `ui/src/modules/dataset_manager/i18n/zh-hant.js` | 調整 `DSM_VALIDATE_COLUMN_REQUIRED`；新增 `DSM_VALIDATE_NO_SAMPLES`、`DSM_CLASSIFY_*` 鍵值 |
| `ui/src/modules/dataset_manager/i18n/en.js` | 對應英文鍵值 |

---

## 詳細實作步驟

### Phase 1：驗證邏輯修正（`spec.js` + i18n）

#### 1.1 `spec.js` 頂層新增常數

```js
// 影像類專案：schema.columns 為匯入/採集時自動生成，不需手動定義欄位
const IMAGE_TYPES = new Set(['image', 'object_detection', 'line_following']);
```

#### 1.2 `validate()` 欄位檢查（取代 L180-182）

```js
const isImageType = IMAGE_TYPES.has(spec.project.type);
const sampleCount = spec.stats.sample_count
    || (Array.isArray(spec.data_source.samples) ? spec.data_source.samples.length : 0);

if (!Array.isArray(spec.schema.columns) || spec.schema.columns.length === 0) {
    if (isImageType) {
        // 影像類：欄位由匯入/採集自動生成；尚未有樣本時以引導式 warning 呈現
        if (sampleCount === 0) {
            warnings.push(t('VALIDATE_NO_SAMPLES', '尚未匯入任何影像。請選擇影像資料夾，或使用攝影機拍攝。'));
        }
    } else {
        // 表格類：欄位為匯出必要條件，維持 error 但文案改為引導式
        errors.push(t('VALIDATE_COLUMN_REQUIRED', '尚未定義任何欄位。請先匯入 CSV/JSON 檔案，或點擊「新增 Feature / Label」手動建立。'));
    }
}
```

#### 1.3 Label / Features 檢查對齊

```js
// Label 檢查：影像類若尚未有任何樣本，不重複發出 NO_LABEL 警告
if (!spec.schema.label && spec.project.type !== 'table' && spec.project.type !== 'line_following') {
    if (!(isImageType && sampleCount === 0)) {
        warnings.push(t('VALIDATE_NO_LABEL', '尚未指定 Label 欄位。'));
    }
}

// Features 檢查：補上 object_detection 豁免，且僅在有欄位但未指定 role=feature 時提醒，
// 避免與「無欄位」的 COLUMN_REQUIRED 重複造成噪音
if (spec.schema.features.length === 0 && !isImageType && spec.schema.columns.length > 0) {
    warnings.push(t('VALIDATE_NO_FEATURES', '尚未指定 Feature 欄位。'));
}
```

#### 1.4 i18n 鍵值

| 鍵值 | 處理 | 繁體中文 | English |
|---|---|---|---|
| `DSM_VALIDATE_COLUMN_REQUIRED` | 改寫 | 尚未定義任何欄位。請先匯入 CSV/JSON 檔案，或點擊「新增 Feature / Label」手動建立。 | No columns defined yet. Import a CSV/JSON file, or click "Add Feature / Add Label" to create one. |
| `DSM_VALIDATE_NO_SAMPLES` | 新增 | 尚未匯入任何影像。請選擇影像資料夾，或使用攝影機拍攝。 | No images imported yet. Select an image folder or capture photos with the camera. |

---

### Phase 2：影像分類標籤校正模式（`ui_layout.js` + `ui_components.js` + CSS + i18n）

#### 2.1 `state` 擴充

```js
annotationMode: {
    isActive: false,
    currentIndex: -1,
    mode: null,          // null | 'bbox' | 'line' | 'classification'
    saveTimer: null,
    originalBodyClass: null
}
```

#### 2.2 `enterAnnotationMode()` 開頭分流

```js
function enterAnnotationMode(image, index) {
    if (getFormValue('projectType') === 'image') {
        return enterClassificationReviewMode(image, index);
    }
    // ... 現有 bbox/line 邏輯不變 ...
}
```

#### 2.3 新增 `enterClassificationReviewMode(image, index)`

流程（沿用 bbox 模式的版面機制）：

1. `saveGridScroll()`；設定 `state.annotationMode = { isActive: true, currentIndex: index, mode: 'classification', ... }`。
2. 副標題改為 `t('CLASSIFY_MODE_TITLE', ...)`；`modal.classList.add('dataset-annotation-fullscreen')`；body 加 `.dataset-annotation-mode`。
3. 隱藏 `.dataset-source-panel` / `.dataset-schema-panel`；防禦性移除並重建 `#dataset-annotation-back` 返回按鈕。
4. 渲染 3 欄布局（與 bbox 相同的骨架）：
   - 左欄：`#annotation-thumbnails` → `renderAnnotationThumbnails(..., { mode: 'classification', onThumbnailClick: navigateToImage })`。
   - 中央：`#annotation-classify-container` + `<img id="annotation-classify-img">`，**不初始化 UICanvas**。
   - 右欄：`#annotation-controls` → `renderClassificationControls()`。
5. 呼叫 `loadClassificationImage(index)`。

#### 2.4 新增 `loadClassificationImage(index)`

- 更新 `state.annotationMode.currentIndex` 與 `#annotation-classify-img` 的 `src`。
- 重新 `renderClassificationControls()`（同步右側選單到目前圖片）。
- `updateClassifyProgress()`、`updateThumbnailHighlight()`、綁定鍵盤（↑/↓/Esc，無 Delete）。

#### 2.5 新增 `renderClassificationControls()`

```js
function renderClassificationControls() {
    const controls = document.getElementById('annotation-controls');
    if (!controls) return;

    const image = state.images[state.annotationMode.currentIndex];
    if (!image) return;
    const labelMap = state.spec.toJSON().schema.label_map || {};
    const labelEntries = Object.entries(labelMap);

    controls.innerHTML = `
        <div class="dataset-annotation-class-section">
            <div class="dataset-annotation-section-title">${t('CLASSIFY_CURRENT_LABEL', '目前分類')}</div>
            <div class="dataset-annotation-class-row">
                <select id="annotation-classify-select">
                    ${labelEntries.length > 0
                        ? labelEntries.map(([name, id]) =>
                            `<option value="${id}" ${name === (image.label || '') ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')
                        : '<option value="" disabled selected>' + t('NO_LABELS', '尚未偵測到標籤') + '</option>'}
                </select>
                <button type="button" class="dataset-icon-btn" id="annotation-classify-add" title="${t('CLASSIFY_ADD_LABEL', '新增類別')}">+</button>
            </div>
            <div class="dataset-annotation-info">${t('CLASSIFY_IMAGE_INFO', '檔案: %1').replace('%1', escapeHtml(image.path || image.name || ''))}</div>
        </div>
    `;

    const select = document.getElementById('annotation-classify-select');
    if (select) {
        select.onchange = () => {
            const id = parseInt(select.value, 10);
            const name = labelEntries.find(([, value]) => value === id)?.[0] || '';
            if (name && name !== image.label) {
                image.label = name;
                updateStatsFromImages();   // label_counts / label_map 一致化
                renderClassificationControls();
                updateThumbnailHighlight();
                refreshPreview();          // debounce 內含 syncSpecFromUI(true)
            }
        };
    }

    const addBtn = document.getElementById('annotation-classify-add');
    if (addBtn) {
        addBtn.onclick = async () => {
            const name = await window.CocoyaBridge.prompt(t('CLASSIFY_NEW_LABEL_PLACEHOLDER', '輸入新類別名稱'));
            if (!name || !name.trim()) return;
            const newLabel = name.trim();
            const spec = state.spec.toJSON();
            const labelMap = spec.schema.label_map || {};
            if (labelMap[newLabel] === undefined) {
                labelMap[newLabel] = Object.keys(labelMap).length;
                state.spec = new DatasetSpec(Object.assign({}, spec, { schema: Object.assign({}, spec.schema, { label_map: labelMap }) }));
            }
            image.label = newLabel;
            renderClassificationControls();
            updateStatsFromImages();
            refreshPreview();
        };
    }
}
```

> 註：`syncSpecFromUI()` 會以 `state.images` 重建 `data_source.samples`（含 `label: img.label`，ui_layout.js L117），故改標籤後經 `refreshPreview()` 即寫入 spec。

#### 2.6 `renderAnnotationThumbnails()` 支援分類模式（`ui_components.js`）

```js
// L91-99 之間調整：
const isCheckMode = options.mode === 'classification';
const badgeHtml = isCheckMode
    ? `<span class="dataset-annotation-thumb-label">${escapeHtml(img.label || '?')}</span>`
    : ((img.annotations && img.annotations.length > 0) ? '<span class="dataset-annotation-thumb-check">✓</span>' : '');
const itemClass = [isCurrent ? 'current' : '', isCheckMode ? '' : (img.annotations?.length ? 'annotated' : '')]
    .filter(Boolean).join(' ');
```

#### 2.7 `updateThumbnailHighlight()` 類型感知

- classification 模式：只切換 `current` 高亮；縮圖上的標籤徽章由 2.6 渲染（不需要 annotated class）。
- bbox/line 模式：維持現況（`annotated` 綠勾）。

#### 2.8 `navigateToImage()` 分流

```js
function navigateToImage(newIndex) {
    if (newIndex < 0 || newIndex >= state.images.length) return;
    if (newIndex === state.annotationMode.currentIndex) return;
    saveCurrentAnnotations(); // classification 下 annotations 為空陣列，安全
    if (state.annotationMode.mode === 'classification') {
        loadClassificationImage(newIndex);
    } else {
        loadAnnotationImage(newIndex);
    }
}
```

#### 2.9 `exitAnnotationMode()` 清理

- 重置時加上 `state.annotationMode.mode = null;`。
- `checkUnannotatedOnExit()` 開頭：`if (state.annotationMode.mode === 'classification') return true;`

#### 2.10 i18n 鍵值（`zh-hant.js` / `en.js`）

| 鍵值 | 繁體中文 | English |
|---|---|---|
| `DSM_CLASSIFY_MODE_TITLE` | 影像分類標籤校正 | Image Classification Labels |
| `DSM_CLASSIFY_CURRENT_LABEL` | 目前分類 | Current Label |
| `DSM_CLASSIFY_ADD_LABEL` | 新增類別 | Add Class |
| `DSM_CLASSIFY_NEW_LABEL_PLACEHOLDER` | 輸入新類別名稱 | Enter new class name |
| `DSM_CLASSIFY_IMAGE_INFO` | 檔案: %1 | File: %1 |
| `DSM_CLASSIFY_PROGRESS` | 樣本: %1 / %2 張 | Sample: %1 / %2 |
| `DSM_CLASSIFY_SHORTCUTS_HINT` | ↑/↓ 切換圖片 · Esc 退出 | ↑/↓ switch image · Esc exit |

#### 2.11 CSS（`dataset_manager.css`）

- `.dataset-annotation-thumb-label`：縮圖角落的小型標籤徽章（沿用現有綠勾的定位方式）。
- `.dataset-annotation-info`：右側檔案資訊行（12px、灰色）。

---

### Phase 3：未標註檢查語意修正（`ui_layout.js`）

#### 3.1 `checkUnannotatedOnExit()`（L926-932）

```js
async function checkUnannotatedOnExit() {
    // 分類校正模式不做 bbox/line 未標註檢查
    if (state.annotationMode.mode === 'classification') return true;
    const unannotated = state.images.filter(img => !img.annotations || img.annotations.length === 0).length;
    if (unannotated > 0) {
        return await window.CocoyaBridge.confirm(t('ANNOTATION_UNANNOTATED_WARNING', '尚有 %1 張圖片未標註，確定要離開？').replace('%1', unannotated));
    }
    return true;
}
```

#### 3.2 `handleExportDataset()`（L382-405）

```js
const projectType = getFormValue('projectType');
const isImage = projectType === 'image' || projectType === 'object_detection' || projectType === 'line_following';
const needsAnnotationCheck = projectType === 'object_detection' || projectType === 'line_following';

// 未標註圖片檢查：僅物件偵測/循線需要 bbox/line
if (needsAnnotationCheck && state.images.length > 0) {
    const unannotated = state.images.filter(img => !img.annotations || img.annotations.length === 0).length;
    if (unannotated > 0) { /* 現有 confirm 流程 */ }
}

// 未分類標註框檢查：僅物件偵測
if (projectType === 'object_detection' && state.images.length > 0) {
    const unclassified = ...; /* 現有流程 */
}
```

> `isImage` 仍保留給雲端上傳按鈕等既有判斷使用。

---

## 驗證清單（實機 VSIX + Tauri）

1. **image 類型（全新進入）**：右欄不再顯示紅色「至少需要一個 schema 欄位」；改為橘色引導「尚未匯入任何影像…」，狀態列顯示綠色「Spec 可用」。
2. **image 匯入資料夾後**：無錯誤、無警告；樣本數 > 0。
3. **table 類型（全新進入）**：紅色錯誤存在但文案改為「尚未定義任何欄位。請先匯入 CSV/JSON 檔案…」。
4. **table 匯入 CSV 後**：欄位自動偵測，錯誤消失。
5. **image 點縮圖**：進入「影像分類標籤校正」模式，**無 crosshair 畫布**；右側顯示目前分類下拉 + 新增類別；改派標籤後縮圖徽章、左欄統計、JSON preview 一致更新。
6. **image 分類模式**：↑/↓ 切圖、Esc 返回正常；退出與匯出**不會**再跳出「尚有 N 張圖片未標註」對話框。
7. **object_detection**：縮圖點擊仍進 bbox 標註（類別選擇器、拉框、列表、Delete、未標註/未分類檢查皆正常）。
8. **line_following**：仍為 line 標註，未標註檢查正常。
9. **深色主題**：新控制欄樣式可讀。

---

## 風險與注意事項

- **`syncSpecFromUI()` 寫回樣本 label**：改派標籤後需經 `refreshPreview()`（debounce 300ms）才寫入 spec，本次依賴既有機制；若發現寫回延遲，可於 `renderClassificationControls()` 的 onchange 內直接呼叫 `syncSpecFromUI(true)`。
- **`state.annotationMode.mode` 為新欄位**：所有既有開關點（clear、type 切換）未直接改動，但 `exitAnnotationMode()` 是唯一出口，務必確認 mode 重置。
- **欄位為空但樣本存在的影像 Live 模式**（未匯入資料夾直接拍照）：columns 維持空，但 validate() 因樣本 > 0 不再報錯 → 行為正確。
- **C 項暫緩**：分類標籤校正目前只影響 spec 內資料；匯出仍照搬原始資料夾結構，單張改派標籤不會反映到匯出結果（已列為後續獨立評估項）。