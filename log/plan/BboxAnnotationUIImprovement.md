# BBox 標註 UI 改善計畫

## 背景

Dataset Manager 的縮圖點一下進入 bbox 標註 UI，目前有兩項缺點：
1. 顯示在右方預覽面板版面太小（固定高度 380px，寬度僨 `minmax(300px, 0.9fr)`）
2. 每標註一張圖就需點「返回列表」再點下一張縮圖，效率低

## 目標

重構標註模式為一個**全寬 3 欄布局**，支援**左側縮圖欄快速導航**、**右側控制欄**、**鍵盤快捷鍵**、**自動儲存**與**進度提示**，提升標註效率。

---

## 架構決策

### 布局結構

進入標註模式時，重新排版 `dataset-manager-body` 為單欄全寬，內含 3 欄子布局：

```
┌─────────────────────────────────────────────────────────────┐
│  [← 返回列表]  進度: 3/20  [匯出] [清除]                      │  ← 頂部工具列
├────────┬──────────────────────────────┬─────────────────────┤
│ 縮圖欄 │         圖片畫布               │  右側控制欄           │
│ 80px   │         (flex: 1)            │  220px              │
│        │                              │                     │
│ 圖1 ✓  │                              │  [類別 ▼] [+][-]    │
│ 圖2    │                              │  ────────────────   │
│ 圖3 ★  │                              │  #1 [bbox] 刪       │
│ ...    │                              │  #2 [bbox] 刪       │
│        │                              │                     │
└────────┴──────────────────────────────┴─────────────────────┘
```

- **左欄 (80px)**：縮圖單列垂直捲動，當前圖片高亮邊框，已標註顯示右上角綠勾
- **中央**：圖片畫布，`flex: 1` 撐滿剩餘空間，`object-fit: contain`，高度動態適配
- **右欄 (220px)**：上半部類別選擇器 (下拉 + 增/修/刪按鈕)，下半部標註列表 (點擊高亮 bbox)

### 布局切換機制

- **進入**：為 `.dataset-manager-body` 添加 `.dataset-annotation-mode` CSS class，隱藏 source/schema 面板，preview panel 成為單欄全寬
- **退出**：移除 class，恢復原始 3 欄布局
- **狀態追蹤**：`state.annotationMode.isActive` 布林值 + `state.annotationCurrentIndex` 當前圖片索引

### 關鍵設計原則

1. **CSS class-based 布局切換**：避免直接操作 `grid-template-columns` inline style，維護性佳
2. **單一 debounce timer**：`state._annotationSaveTimer` 用於防抖自動儲存
3. **事件生命週期管理**：鍵盤事件綁定在 canvas element (需 `tabindex=0`)，退出時統一清理
4. **向後兼容**：`exitAnnotationMode()` 在非標註模式下也需安全呼叫 (clear 按鈕、type 切換等)

---

## 檔案異動清單

| 檔案 | 異動摘要 |
|------|----------|
| `ui_layout.js` | 重構 `enterAnnotationMode()` / `exitAnnotationMode()`，新增 `navigateToImage()`、`saveCurrentAnnotations()`、`checkUnannotatedOnExit()`、鍵盤快捷鍵綁定 |
| `ui_canvas.js` | 新增 `selectedAnnotationIndex` 狀態 + `highlightBox()` 方法，支援標註列表點擊高亮 |
| `ui_components.js` | 新增 `renderAnnotationThumbnails()` 方法 (單列垂直縮圖欄) |
| `dataset_manager.css` | 新增 `.dataset-annotation-mode` 布局、縮圖勾號、高亮邊框、進度計數器樣式 |
| `i18n/zh-hant.js` | 新增 DSM_ 字串 (進度、快捷鍵提示、未標註警告、類別管理等) |
| `i18n/en.js` | 對應英文字串 |

---

## 詳細實作步驟

### Phase 1：State 擴充與布局基礎 (`ui_layout.js`)

#### 1.1 擴充 state 物件
```js
const state = {
    // ... 現有 fields ...
    annotationMode: {
        isActive: false,
        currentIndex: -1,
        saveTimer: null,        // debounce timer for auto-save
        originalBodyClass: null // for restoring layout
    }
};
```

#### 1.2 重構 `enterAnnotationMode(image, index)`
- 設定 `state.annotationMode.isActive = true`
- 設定 `state.annotationMode.currentIndex = index`
- 保存 grid scroll (現有 `saveGridScroll()`)
- 為 `.dataset-manager-body` 添加 `.dataset-annotation-mode` class
- 隱藏 `.dataset-source-panel` 和 `.dataset-schema-panel`
- 重新渲染 preview panel 內容為 3 欄布局：
  - 左欄：縮圖欄 (`#annotation-thumbnails`)
  - 中央：圖片容器 (`#annotation-container`)
  - 右欄：控制欄 (`#annotation-controls`)
- 渲染頂部工具列 (返回按鈕 + 進度計數器 + 匯出/清除按鈕)
- 呼叫 `renderAnnotationThumbnails()` + `loadAnnotationImage(index)`

#### 1.3 新增 `loadAnnotationImage(index)`
- 自動儲存前一張圖的標註 (`saveCurrentAnnotations()`)
- 取得 `state.images[index]`
- 清除舊的 UICanvas，初始化新畫布
- 更新右側控制欄 (類別選擇器 + 標註列表)
- 更新進度計數器
- 聚焦畫布以接收鍵盤事件

#### 1.4 重構 `exitAnnotationMode()`
- 自動儲存當前圖標註
- 清理鍵盤事件監聽器
- 移除 `.dataset-annotation-mode` class
- 顯示 source/schema 面板
- 移除 back 按鈕
- 重置 `state.annotationMode.isActive = false`
- 呼叫 `refreshDynamicPanels()` 恢復縮圖網格

### Phase 2：左側縮圖欄 (`ui_components.js`)

#### 2.1 新增 `renderAnnotationThumbnails(container, images, currentIndex, options)`
- 渲染單列垂直縮圖 (每張 60x60px)
- 點擊縮圖 → `options.onThumbnailClick(index)`
- 已標註圖片顯示右上角綠勾 (CSS `::after` 或 overlay icon)
- 當前圖片顯示藍色邊框高亮 (`border-color: #00CCFF; border-width: 2px`)
- 垂直捲動，滾動位置保留

#### 2.2 縮圖勾號樣式
```css
.dataset-annotation-thumb {
    width: 60px; height: 60px;
    object-fit: cover;
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    position: relative;
}
.dataset-annotation-thumb.current {
    border-color: #00CCFF;
    border-width: 2px;
}
.dataset-annotation-thumb.annotated::after {
    content: '✓';
    position: absolute;
    top: 2px; right: 2px;
    font-size: 10px;
    color: #4CAF50;
}
```

### Phase 3：右側控制欄 (類別選擇器 + 標註列表)

#### 3.1 類別選擇器 (Top)
- 下拉選單顯示 `label_map` 的所有類別
- ➕ 按鈕：新增類別 (彈出輸入框 → 加入 label_map → 刷新)
- ✏️ 按鈕：重新命名當前選中類別
- 🗑️ 按鈕：刪除類別 (該類別標註標記為未分類 class_id = -1)
- 變更時更新 `UICanvas.state.currentClassId`

#### 3.2 標註列表 (Bottom)
- 列出當前圖片的所有標註 `#N [x,y,w,h]`
- 每項有刪除按鈕
- 點擊標註項 → 畫布高亮對應 bbox
- 空狀態顯示「尚未有標註」

### Phase 4：畫布高亮 (`ui_canvas.js`)

#### 4.1 擴充 state
```js
state: {
    // ... 現有 fields ...
    selectedAnnotationIndex: -1,  // -1 = 無選中
}
```

#### 4.2 修改 `drawBox()`
- 檢查 `selectedAnnotationIndex` 是否對應當前 bbox
- 選中時：`lineWidth = 4` + `strokeStyle = '#00CCFF'`
- 未選中時：`lineWidth = 2` + 原色

#### 4.3 新增 `setSelectedAnnotation(index)`
- 設定 `selectedAnnotationIndex`
- 呼叫 `render()` 重新繪製

#### 4.4 點擊畫布清除選中
- 在 `mousedown` handler 中，若點擊空白處 (非拉框開始)，清除 `selectedAnnotationIndex`

### Phase 5：自動儲存與防抖

#### 5.1 `saveCurrentAnnotations()`
- 將 `UICanvas.state.annotations` 寫回 `state.images[state.annotationMode.currentIndex].annotations`
- 清除現有 debounce timer

#### 5.2 Debounce 在 `onUpdate` 回調
```js
onUpdate: (anns) => {
    image.annotations = anns;
    renderAnnotationListUI(anns);
    // Debounce refreshPreview
    clearTimeout(state.annotationMode.saveTimer);
    state.annotationMode.saveTimer = setTimeout(() => {
        refreshPreview();
    }, 300);
}
```

#### 5.3 切換圖片前自動儲存
- `navigateToImage(newIndex)` → 先呼叫 `saveCurrentAnnotations()` → 再載入新圖

### Phase 6：鍵盤快捷鍵

#### 6.1 焦點管理
- 畫布進入標註模式時自動聚焦 (`tabindex=0` + `canvas.focus()`)
- 當使用者點擊右側控制欄的按鈕/輸入框時，畫布失去焦點，快捷鍵暫時失效
- 當使用者點擊畫布空白處時，重新聚焦畫布
- `Tab` 鍵可以在畫布 ↔ 控制欄間切換

#### 6.2 快捷鍵綁定 (在 canvas element 上)
| 按鍵 | 動作 | 說明 |
|------|------|------|
| ↑ | 上一張 | 自動儲存當前，切換到上一張圖片 |
| ↓ | 下一張 | 自動儲存當前，切換到下一張圖片 |
| Delete | 刪除標註 | 刪除當前高亮的標註 (若無高亮則刪除最後一個) |
| Esc | 退出標註模式 | 若有未儲存變更，提示 |
| Tab | 切換焦點 | 在畫布 ↔ 右側控制欄間切換 |

#### 6.3 事件清理
- 在 `exitAnnotationMode()` 中移除所有鍵盤事件監聽器
- 使用 `UICanvas.state.handlers` 存放鍵盤 handler 參照以便清理

### Phase 7：進度計數器與未標註檢查

#### 7.1 進度計數器
- 頂部工具列中央顯示 `進度: X/Y 張` (已標註/總數)
- 已標註 = `state.images.filter(img => img.annotations && img.annotations.length > 0).length`
- 總數 = `state.images.length`

#### 7.2 未標註檢查
- 在 `exitAnnotationMode()` 和 `handleExportDataset()` 前檢查
- 若有未標註圖片 → 彈出確認對話框 (「繼續標註」 / 「忽略並退出」)
- 使用 `confirm()` 或自定義對話框

### Phase 8：i18n 字串

新增以下 DSM_ 鍵值 (zh-hant.js + en.js)：

| 鍵值 | 中文 | English |
|------|------|---------|
| `DSM_ANNOTATION_PROGRESS` | 進度: %1/%2 張 | Progress: %1/%2 |
| `DSM_ANNOTATION_NAV_PREV` | 上一張 | Previous |
| `DSM_ANNOTATION_NAV_NEXT` | 下一張 | Next |
| `DSM_ANNOTATION_CLASS_ADD` | 新增 | Add |
| `DSM_ANNOTATION_CLASS_EDIT` | 編輯 | Edit |
| `DSM_ANNOTATION_CLASS_DELETE` | 刪除 | Delete |
| `DSM_ANNOTATION_NEW_CLASS_PLACEHOLDER` | 輸入新類別名稱 | Enter new class name |
| `DSM_ANNOTATION_NEW_CLASS_CONFIRM` | 確認 | Confirm |
| `DSM_ANNOTATION_NEW_CLASS_CANCEL` | 取消 | Cancel |
| `DSM_ANNOTATION_DELETE_CLASS_CONFIRM` | 確定刪除類別「%1」？ | Delete class '%1'? |
| `DSM_ANNOTATION_UNSAVED_WARNING` | 尚有未儲存的標註，確定要離開？ | Unsaved annotations, leave anyway? |
| `DSM_ANNOTATION_UNANNOTATED_WARNING` | 尚有 %1 張圖片未標註，確定要離開？ | %1 images unannotated, leave anyway? |
| `DSM_ANNOTATION_SHORTCUTS_HINT` | ↑/↓ 切換圖片 · Delete 刪除標註 · Esc 退出 | ↑/↓ navigate · Delete remove · Esc exit |

---

## 風險與注意事項

1. **布局切換的 CSS 衝突**：`.dataset-annotation-mode` class 必須正確覆寫 grid-template-columns，避免與響應式斷點衝突
2. **事件記憶體洩漏**：鍵盤事件綁定在 canvas element，必須在 `exitAnnotationMode()` 中清理
3. **向後兼容性**：`exitAnnotationMode()` 被 `clearBtn.onclick`、`typeSelect.onchange` 等多處呼叫，必須在非標註模式下安全返回
4. **Canvas 重新初始化**：切換圖片時 `UICanvas.init()` 會移除舊 canvas 並建立新 ones，需確保鍵盤事件重新綁定
5. **VSIX/Tauri 雙平台**：此改動僅涉及前端 Webview，無後端變更，雙平台自動同步
6. **防抖計時器清理**：頁面關閉或 modal 關閉時，必須清除 `saveTimer` 避免 callback 在 DOM 銷毀後執行
7. **縮圖滾動位置**：進入標註模式前保存，退出後恢復 (已有 `saveGridScroll()` / `restoreGridScroll()` 機制)

---

## 驗證方法

1. 匯入影像資料集 (>10張)，進入標註模式
2. 確認標註區佔滿整個 modal 寬度，圖片容器足夠大
3. 使用 ↑/↓ 方向鍵在圖片間切換，確認自動儲存
4. 點擊左側縮圖切換，確認當前圖片高亮邊框
5. 畫 bbox 後，確認右側標註列表即時更新
6. 點擊標註列表項目，確認畫布對應 bbox 高亮 (邊框變粗+改色)
7. 使用 Delete 鍵刪除標註
8. 確認進度計數器正確顯示 (X/Y)
9. 確認已標註縮圖顯示綠勾
10. 退出標註模式，確認縮圖網格捲動位置恢復
11. 嘗試匯出含未標註圖片的資料集，確認警告提示
12. 在深色主題下確認所有新 UI 元素正確顯示

---

## 除錯紀錄 (2026-08-07)

### 問題清單
Tauri 版進入標註模式後：
1. 副標題顯示「Dataset Spec」不符 → 改為動態顯示「物件偵測標註」(i18n)
2. 左欄縮圖無法捲動
3. 一進入標註模式每張縮圖都出現綠勾，切換時消失/顯現；標註後切換縮圖會存檔，綠勾永遠存在
4. 右欄控制欄空白
5. console `[Intervention] Images loaded lazily...` 警告

### 根因分析

#### 問題 1 (副標題)
`createModal()` 中副標題寫死 `<span>${t('SUBTITLE', 'Dataset Spec')}</span>`，進入標註模式也不會更新。

#### 問題 2 (縮圖無法捲動)
`.dataset-manager-body.dataset-annotation-mode` 缺少 `flex: 1; min-height: 0`。`.dataset-manager-dialog` 是 `flex; flex-direction: column`，body 需 `flex: 1` 才撐滿剩餘高度；否則 `.dataset-annotation-layout { height: 100% }` 高度鏈斷裂，縮圖欄 `overflow-y: auto` 永遠不會觸發捲動。

#### 問題 3 + 4 (綠勾異常 / 右欄空白)
同源問題：
- `saveCurrentAnnotations()` 直接 `state.images[idx].annotations = UICanvas.state.annotations || []`，把**同一個陣列參考**寫入多張圖片 → 某張 push 了 bbox，所有引用它的縮圖都顯示綠勾。
- `UICanvas.init()` 放在 `img.onload` 內，當 `img.src` 的 blobUrl 相同時瀏覽器不重載 → `onload` 不觸發 → 右欄控制列表、進度、縮圖高亮、鍵盤綁定全部沒執行。

#### 問題 5 (lazy load 警告)
VSCode Webview 對 `<img loading="lazy">` 的介入，回退為佔位符並延遲載入事件。

### 修正內容

| 檔案 | 修正 |
|------|------|
| `ui_layout.js` | 1) 副標題加上 `#dataset-manager-subtitle` id；進入標註模式時設為 `t('ANNOTATION_MODE_TITLE', '物件偵測標註')`，退出時恢復 `t('SUBTITLE', 'Dataset Spec')` |
| `ui_layout.js` | 2) `saveCurrentAnnotations()` 改為 `(UICanvas.state.annotations || []).slice()` 拷貝陣列，避免多圖共用參考 |
| `ui_layout.js` | 3) `loadAnnotationImage()` 將 `UICanvas.init()` 移出 `img.onload`，改為同步初始化；onload 只由圖片本身觸發重繪 |
| `dataset_manager.css` | `.dataset-manager-body.dataset-annotation-mode` 加入 `flex: 1; min-height: 0` 修復高度鏈 |
| `ui_components.js` | 標註縮圖欄與縮圖牆的 `<img>` 移除 `loading="lazy"`，消除 Webview lazy load 介入 |
| `i18n/zh-hant.js` | 新增 `"DSM_ANNOTATION_MODE_TITLE": "物件偵測標註"` |
| `i18n/en.js` | 新增 `"DSM_ANNOTATION_MODE_TITLE": "Object Detection Annotation"` |

### 語法驗證
- [x] `node --check` 通過（ui_layout.js / ui_components.js / i18n zh-hant.js / en.js）

### 待實際驗證 (Tauri 版)
- [x] 進入標註模式副標題顯示「物件偵測標註」
- [x] 左欄縮圖可捲動
- [x] 未標註圖片不顯示綠勾，標註後該張才顯示綠勾
- [x] 右欄控制欄顯示類別選擇器與標註列表
- [x] console 不再出現 lazy load Intervention 警告

> **驗證結果 (2026-08-07)**：Tauri 及 VSIX 雙平台皆驗證通過。

---

## 除錯補強 (2026-08-07 第二輪)

### 新增根因：後端 images 無 annotations 欄位
`src-tauri/src/commands/file.rs` 的 `ScanedImage` 結構（L306-313）**沒有 `annotations` 欄位**，`pick_folder` 回傳的 images 每張都缺 `annotations`。前端 `state.images = images` 直接指派後，`loadAnnotationImage` 的 `image.annotations || []` 對 undefined 每次建立新陣列但**沒寫回**，導致：
- 標註後無處保存 → 綠勾與右欄列表情況異常
- 縮圖勾號 `.annotated` 判斷失效

**修正**：`handleDirectoryImport` 改為 `state.images = images.map(img => ({ ...img, annotations: img.annotations || [] }))`，確保每張圖有獨立 annotations 陣列。

### 新增根因：dialog 無明確高度 → 縮圖欄無法捲動
`.dataset-manager-dialog` 只有 `max-height`（無 `height`），即使 body 設了 `flex: 1`，因父層無明確高度，`.dataset-annotation-layout { height: 100% }` 仍無法解析 → `.dataset-annotation-thumbnails { overflow-y: auto }` 不會捲動。

**修正**：
- CSS：新增 `.dataset-manager-overlay.dataset-annotation-fullscreen`（`align-items: stretch; padding: 0`）+ 其內 dialog `height: 100%; max-height: 100%; border-radius: 0`
- JS：`enterAnnotationMode` 對 overlay 加 `dataset-annotation-fullscreen` class，`exitAnnotationMode`（含安全返回分支）移除

### 檔案異動補充
| 檔案 | 修正 |
|------|------|
| `ui_layout.js` | `handleDirectoryImport` 初始化每張圖 annotations 為獨立陣列 |
| `ui_layout.js` | enterAnnotationMode 加 `dataset-annotation-fullscreen` overlay class，exitAnnotationMode 移除（含安全返回分支） |
| `dataset_manager.css` | 新增 `.dataset-annotation-fullscreen` 樣式，讓 dialog 撐滿 overlay（取代不穩定的 `:has()`） |

### 語法驗證
- [x] `node --check` 通過（ui_layout.js / ui_components.js）

---

## 除錯補強 (2026-08-07 第三輪 - 縮圖捲動關鍵 root cause)

### 症狀
1. 一進入標註模式，縮圖不是從第一張開始出現
2. 沒有垂直捲軸，滑鼠滾輪無效

### 根因
`.dataset-manager-body.dataset-annotation-mode` 使用 `display: grid`，其子項 `.dataset-preview-panel` 的 `height: 100%` 在 grid 容器（無明確高度）中**無法解析**，導致高度鏈斷裂：
- `.dataset-annotation-layout` 高度 = 內容高度（縮圖很多時被撐高）
- 縮圖欄 `.overflow-y: auto` 因父層無受限高度而不觸發捲動
- 內容超出 dialog 被 `overflow: hidden` 裁切 → 縮圖「不是從第一張開始」

### 修正（`dataset_manager.css`）
將標註模式的高度鏈改為**純 flex 鏈**，每層 `flex: 1; min-height: 0`：
```
overlay(dataset-annotation-fullscreen, align-items:stretch)
  → dialog(height:100%)
    → body(dataset-annotation-mode, display:flex; flex-direction:column; flex:1; min-height:0)
      → preview-panel(flex:1; min-height:0)
        → preview-content(flex:1; min-height:0; overflow:hidden)
          → annotation-layout(flex:1; min-height:0; grid-template-rows:minmax(0,1fr))
            → 左縮圖欄/右控制欄 overflow-y:auto; min-height:0 ✅
```

### 檔案異動
| 檔案 | 修正 |
|------|------|
| `dataset_manager.css` | `.dataset-manager-body.dataset-annotation-mode` 由 `display:grid` 改 `display:flex; flex-direction:column` |
| `dataset_manager.css` | `.dataset-preview-panel` 由 `height:100%` 改 `flex:1; min-height:0` |
| `dataset_manager.css` | `#dataset-preview-content` 加 `min-height:0` |
| `dataset_manager.css` | `.dataset-annotation-layout` 移除 `height:100%`，保留 `flex:1; min-height:0` |
| `dataset_manager.css` | `.dataset-annotation-thumbnails` 加 `min-height:0` |

### 語法驗證
- [x] `node --check` 通過（ui_layout.js / ui_components.js）
