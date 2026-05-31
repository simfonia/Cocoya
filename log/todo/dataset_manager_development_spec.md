# Dataset Manager 開發流程與規格

**建立日期**：2026-05-27  
**最後更新**：2026-05-28 (固化約定優於配置：自動化路徑管理)  
**任務來源**：`DATASET_MANAGER_PLAN.md` Gemini 交接計畫  
**適用專案**：Cocoya (`C:/Workspace/cocoya/`)  
**目標模組**：`ui/src/modules/dataset_manager/`

## 1. 開發目標

Dataset Manager 是 Cocoya 雲端 AI 訓練流程的資料入口。它負責建立、匯入、採集、標註、預覽並輸出 AI 訓練所需的資料集規格，讓後續的 NGX Spark / 遠端訓練流程能使用統一格式讀取資料。

本模組支援的資料類型：

- `image`：影像分類或物件資料集。
- `feature`：MediaPipe 手勢、姿態、臉部等特徵點資料。
- `serial`：MCU 感測器序列資料，例如 IMU、距離、壓力等。
- `table`：CSV / JSON 表格資料。

本模組不直接負責模型訓練；它的輸出是可被訓練器理解的 Dataset Spec 與資料檔。

## 2. 載入策略

### 2.1 採用靜態 ESM 載入

Dataset Manager 應使用靜態 `<script type="module">` 載入，而不是透過現有 `core_manifest.json` 或 `module_loader.js` 動態載入。

建議在 `ui/index.html` 中加入：

```html
<script type="module" src="src/bridge.js"></script>
<script type="module" src="src/modules/dataset_manager/index.js"></script>
<script type="module" src="src/main.js"></script>
```

載入順序要求：

1. `bridge.js` 必須先載入，提供 `window.CocoyaBridge`。
2. `dataset_manager/index.js` 在 App 啟動前註冊 `window.CocoyaDataset`。
3. `main.js` 最後啟動 Cocoya App。

### 2.2 不放入 core_manifest.json

`core_manifest.json` 是 Blockly 積木模組清單，會由 `module_loader.js` 載入積木定義、產生器與 toolbox XML。Dataset Manager 是應用層 UI 工具，不是 Blockly toolbox 分類，因此不應放入 `core_manifest.json`。

若未來 Dataset Manager 也需要提供積木，應另外建立：

- `dataset_manager_blocks.js`
- `dataset_manager_generators.js`
- `toolbox.xml`

並在那時才評估加入 `core_manifest.json`。

## 3. 模組檔案規格 (核心引擎 + 動態視圖組件)

目標目錄：

```text
ui/src/modules/dataset_manager/
├── index.js          # [入口] 模組初始化、全域 API、視圖路由器 (View Router)
├── spec.js           # [模型] DatasetSpec 類別，資料契約與 Schema 驗證 (SSOT)
├── importer.js       # [邏輯] 檔案與目錄匯入 (CSV, JSON, Image Directory)
├── sampler.js        # [邏輯] 即時採集 (Webcam 串流、錄製控制、MediaPipe 接入)
├── ui_layout.js      # [視圖] 框架佈局 (Modal 主架構、面板切換監聽)
├── ui_components.js  # [組件] 動態渲染組件 (影像縮圖牆、資料表格、分類列表)
├── ui_canvas.js      # [互動] 標註專用畫布 (物件偵測拉框、座標轉換邏輯)
└── dataset_manager.css # [樣式] 統一主題與組件樣式
```

## 4. Dataset Spec JSON 規格

### 4.1 基本格式

```json
{
  "version": "1.0",
  "project": {
    "name": "picar_hand_control",
    "type": "feature",
    "description": "手勢控制小車"
  },
  "data_source": {
    "mode": "hybrid",
    "files": [],
    "samples": [],
    "base_dir": "dataset/picar_hand_control/"
  },
  "schema": {
    "columns": [
      { "name": "image_path", "type": "string", "role": "feature" },
      { "name": "label", "type": "string", "role": "label" }
    ],
    "features": ["image_path"],
    "label": "label",
    "label_map": {
      "daisy": 0,
      "tulips": 1
    }
  },
  "stats": {
    "sample_count": 0,
    "label_counts": {}
  }
}
```

## 5. 開發階段

### Phase 1：核心 Spec 實作 (DONE)

目標：完成 Dataset Spec 的資料契約與純邏輯測試。
- [x] 實作 `DatasetSpec` 核心類別與全域 API。
- [x] 完成 Schema 自動偵測基礎邏輯。
- [x] 成功掛載 `window.CocoyaDataset` 並通過靜態 ESM 載入測試。

### Phase 2：基本 UI 面板 (DONE)

目標：建立可開關的 Dataset Manager Modal 與雙向同步機制。
- [x] 實作 Modal UI 框架與 CSS 樣式。
- [x] 實作 UI 狀態與 `DatasetSpec` 實體之即時同步。
- [x] 支援欄位手動新增與移除。

### Phase 3：CSV / JSON 匯入 (DONE)

目標：支援匯入表格型資料，自動偵測型別並提供資料預覽。
- [x] 實作 `DatasetSpec.parseCSV`，支援基礎數值型別轉換。
- [x] 實作 Importer UI，支援檔案選擇與匯入進度提示。
- [x] **[重要進化]** 實作資料前 5 筆預覽表格，方便即時核對欄位角色 (Field Mapping)。
- [x] 實作智慧型型別推斷 (Int/Float/String 合併邏輯)。

### Phase 4：影像匯入與物件偵測標註 (DONE)

目標：支援目錄結構匯入與 Canvas 拉框標註。
- [x] **影像目錄匯入**：使用 `webkitdirectory` 解析資料夾結構，自動提取父目錄名作為標籤，並生成 Label Map。
- [x] **動態視圖切換**：實作 `ui_components.js`。當專案類型為影像時，自動將預覽區切換為「影像縮圖牆」。
- [x] **標註系統 (Object Detection)**：實作 `ui_canvas.js`。
    - 提供透明 Canvas 畫布覆蓋於影像預覽上。
    - 支援滑鼠拖拽建立 Bounding Box (x, y, w, h)。
    - 標註結果即時寫入 Spec 的 `annotations` 欄位。

### Phase 5：即時採集 Sampler (Webcam)

目標：整合攝影機串流與手勢/影像採集。
- [ ] **串流管理**：實作 `sampler.js` 呼叫 `getUserMedia` 進行即時預覽。
- [ ] **採集模式**：提供「快照 (Snapshot)」與「連拍 (Burst)」模式。
- [ ] **自動標註**：採集時根據目前選取的類別自動填入標籤。
- [ ] **樣本統計**：即時顯示各標籤樣本數分布，協助維持資料平衡。

### Phase 6：CocoyaBridge 與雲端整合

目標：透過 `CocoyaBridge` 儲存 Dataset Spec 與資料檔。
- [ ] 設計儲存目錄結構。
- [ ] 與 `save_file` 或新增 bridge command 整合。
- [ ] 匯出 `dataset.json`。
- [ ] 打包 dataset 目錄。
- [ ] 與 Cloud AI 遠端 session 路徑整合。

## 6. UI / UX 規格 (動態面板模式)

### 6.1 動態佈局原則
不採用傳統的分開頁籤，而是改採根據 `project.type` 自動切換組件內容的「動態面板」佈局：
- **左側面板 (Project & Source)**：固定顯示專案名稱、類型與描述。移除資料目錄手動輸入，改為根據名稱自動生成。影像模式下顯示「匯入目錄」按鈕，表格模式下顯示「匯入檔案」。
- **中間面板 (Data Structure)**：表格模式顯示「欄位列表 (Columns)」，影像模式顯示「標籤目錄/樣本數統計」。
- **右側面板 (Preview & Interactive)**：
    - 表格模式：顯示資料表格預覽。
    - 影像模式：顯示影像縮圖牆 (Grid View)。
    - 標註模式：點擊影像後進入 Canvas 物件標註視圖。

### 6.2 操作原則
- **規範化命名**：系統名稱與目錄僅限英數下劃線，確保跨端相容性。
- **預覽優先**：匯入後立即在右側顯示資料內容，而非隱藏在選單中。

## 7. 技術限制與注意事項

### 7.1 Webview / CSP
- Dataset Manager 使用靜態 ESM 載入。
- ESM import 必須使用相對路徑。

### 7.2 雙模相容
- 所有 host 通訊必須走 `window.CocoyaBridge`。

### 7.3 資料安全
- 匯入大型資料時避免一次把所有影像轉成 base64 存入記憶體（目前採 Blob URL 預覽）。

## 10. 交付標準

Phase 1~4 完成時，已交付：
- `ui/src/modules/dataset_manager/` 全套源碼 (含 importer, components, canvas)。
- 具備智慧解析功能的 CSV 匯入器與影像目錄匯入器。
- 支援物件偵測的互動標註畫布。
- 規範化名稱限制與筆電螢幕適配優化。
