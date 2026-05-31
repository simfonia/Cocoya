# 資料集管理器 (Dataset Manager) 開發與交接計畫

## 1. 專案背景與目標
為了支援「雲端訓練、本地部署」的 Edge AI 開發流程，Cocoya 需要一個通用的資料處理模組。該模組負責採集、匯入、標註並定義 AI 訓練所需的資料集（影像、特徵點或序列訊號）。

## 2. 核心架構設計 (Modular Design)
模組應存放在 `ui/src/modules/dataset_manager/` 下，採用功能切割以維持代碼可維護性：

- `index.js`: 模組入口、生命週期管理、全域 API 暴露。
- `spec.js`: 資料集規範 (Spec JSON) 的定義、驗證與 Schema 自動偵測。
- `ui_layout.js`: 面板佈局 (Webview UI)、元件渲染與互動邏輯。
- `importer.js`: 外部檔案 (CSV/JSON/Images) 匯入與解析。
- `sampler.js`: 即時數據採集邏輯 (Webcam, MediaPipe, Serial 串流)。

## 3. 資料集規範定義 (Dataset Spec JSON)
這是與後端訓練器 (NGX Spark) 通訊的標準格式：
```json
{
  "version": "1.0",
  "project": {
    "name": "picar_hand_control",
    "type": "feature", // image, feature, serial, table
    "description": "手勢控制小車"
  },
  "data_source": {
    "mode": "hybrid", // live, file, hybrid
    "files": [],
    "base_dir": "dataset/picar_hand_control/"
  },
  "schema": {
    "columns": [
      {"name": "thumb_x", "type": "float", "role": "feature"},
      {"name": "label", "type": "string", "role": "label"}
    ],
    "features": ["thumb_x"],
    "label": "label",
    "label_map": { "open": 0, "closed": 1 }
  }
}
```

## 4. 開發階段 (Development Phases)

### Phase 1: 核心規範 (Spec) 實作 (已邏輯驗證)
- [ ] 實作 `DatasetSpec` 類別，封裝 Metadata。
- [ ] 實作 `detectSchema(sample)`：自動從 CSV 內容推斷欄位名稱與類型。
- [ ] 實作 `validate()`：確保專案必要欄位完整。

### Phase 2: UI 佈局與元件實作
- [ ] 實作懸浮視窗 (Modal) 或側邊抽屜式面板。
- [ ] 設計「數據源選擇」、「標籤管理」、「預覽視圖」三個主要區域。

### Phase 3: 匯入與定義 (Importer)
- [ ] 支援拖放 CSV/JSON 檔案。
- [ ] 實作「欄位對照表 (Field Mapper)」UI，讓使用者手動調整 Feature/Label 分配。
- [ ] 影像模式下支援「目錄匯入」並自動按資料夾名稱標記。

### Phase 4: 即時採集 (Sampler)
- [ ] **影像/特徵模式**：整合 MediaPipe，即時繪製骨架並擷取座標。
- [ ] **序列模式**：整合 Serial API，繪製即時折線圖。
- [ ] 實作「按住錄製」機制與採集數量統計。

### Phase 5: 雲端/本地整合
- [ ] 與 `CocoyaBridge` 結合，實作檔案存檔功能。
- [ ] 實作一鍵打包上傳至遠端訓練環境的邏輯。

## 5. 關鍵技術筆記 (Handover Notes)
- **Webview 載入機制**：強烈建議在 `index.html` 中以靜態 `<script>` 標籤註冊模組，避免動態載入產生的 403 Forbidden 權限問題。
- **全域掛載**：應在 `index.js` 最頂端使用 `window.CocoyaDataset = window.CocoyaDataset || {};` 確保命名空間穩定。
- **UI 框架**：建議維持與 Cocoya 一致的 Vanilla JS + CSS 變數風格，以確保主題自動切換功能正常。
