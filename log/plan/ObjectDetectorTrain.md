# 物件偵測訓練腳本 (detector_train.py) 實作計畫

## 任務目標
設計並實作 `detector_train.py`，支援單一目標物件偵測訓練，產出 int8 量化 TFLite 模型，可用於 PC 推論與 ESP32-S3 MCU 部署。最終應用為單軸追蹤雲台範例。

## 架構決策

### 模型架構
- **MobileNetV2 backbone + 回歸頭**（單一目標偵測）
- 輸入：224x224x3
- 輸出：4 個值 (x, y, w, h) — 歸一化 bbox 座標
- 損失函數：MSE (Mean Squared Error)
- 量化：int8 TFLite（與 classifier 相同的 export 流程）

### 資料格式
- **YOLO 格式**：`images/` + `labels/` 目錄結構
- 每個 label 檔案：`class_id cx cy w h`（歸一化座標）
- 單一目標：每張圖只有 1 個 bbox

### 資料目錄結構
```
dataset/detector_dataset/
├── images/
│    ├── img_001.jpg
│    ├── img_002.jpg
│    └── ...
├── labels/
│    ├── img_001.txt   (class_id cx cy w h)
│    ├── img_002.txt
│    └── ...
├── dataset.json       (Spec JSON，含 label_map)
└── labels.txt         (類別名稱，每行一個)
```

## Common 模組重命名計畫

### 現有檔案改名
| 原檔名 | 新檔名 | 功能 |
|--------|--------|------|
| `common/dataset.py` | `common/classifier_dataset.py` | 分類資料集載入 |
| `common/model.py` | `common/classifier_model.py` | 分類模型建立 |
| `common/training.py` | `common/training_loop.py` | 訓練迴圈（共用） |
| `common/export.py` | `common/model_export.py` | 模型匯出（共用） |
| `common/report.py` | `common/training_report.py` | 訓練報告（共用） |

### 新增檔案
| 檔名 | 功能 |
|------|------|
| `common/detector_dataset.py` | YOLO 格式資料載入、bbox 解析 |
| `common/detector_model.py` | MobileNetV2 + 回歸頭模型建立 |
| `detector/detector_train.py` | 物件偵測訓練主腳本 |

### 需要同步修改的 import
- `classifier/classifier_train.py`：更新 import 路徑

## 實作階段

### Phase 1：Common 模組重命名
- [ ] 備份現有 common/ 模組到 backup/
- [ ] 重命名 5 個檔案
- [ ] 更新 `classifier_train.py` 的 import
- [ ] 驗證 classifier 訓練仍可正常運作

### Phase 2：新增 detector common 模組
- [ ] 建立 `common/detector_dataset.py`
  - `load_detector_dataset(dataset_dir, img_size, batch_size, validation_split)`
  - 讀取 YOLO 格式 labels/*.txt
  - 回傳 (train_ds, val_ds, labels, class_counts)
- [ ] 建立 `common/detector_model.py`
  - `build_detector_model(backbone_name, input_shape, fine_tune)`
  - MobileNetV2 backbone + Dense(4, activation='sigmoid') 回歸頭
  - sigmoid 活化函數確保輸出在 0~1 範圍

### Phase 3：實作 detector_train.py
- [ ] 建立主腳本，結構仿 classifier_train.py
- [ ] 參數：與 classifier 相同 + 訓練參數
- [ ] 載入 YOLO 資料集
- [ ] 建立回歸模型
- [ ] 訓練（MSE loss, Adam optimizer）
- [ ] 產出 int8 TFLite + labels.txt + 訓練報告
- [ ] 輸出 RESULT JSON（與 classifier 格式一致）

### Phase 4：Dataset Manager 標註 UI 改進
- [ ] `ui_canvas.js`：加入「先選類別再畫框」流程
  - 新增 `state.currentClassId` 狀態
  - bbox 推入時使用 `currentClassId` 而非寫死 0
- [ ] `ui_layout.js`：標註面板加入類別選擇器
  - 在標註模式上方加入下拉選單
  - 選項來自 spec.schema.label_map

### Phase 5：Dataset Manager 匯出 YOLO 格式
- [ ] `dataset_sidecar.py`：匯出時將 annotations 寫入 labels/ 目錄
  - 新增 `write_yolo_labels(spec, output_dir)` 函數
  - 將 spec.data_source.samples[].annotations 轉換為 YOLO txt
- [ ] `datasetOps.ts`（VSIX）：handleDatasetExport 中加入 labels 寫入
- [ ] `dataset.rs`（Tauri）：export_dataset 中加入 labels 寫入

### Phase 6：推論端補齊
- [ ] `ai_inference_generators.js`：實作 `_detect()` 方法
  - 解析 TFLite 輸出 (4 個值: x, y, w, h)
  - 轉換為 `{label, confidence, bbox: (x1, y1, x2, y2)}`
  - confidence 可用 bbox 的置信度或固定為 1.0
- [ ] 新增 `py_ai_get_bbox_center` 積木
  - `ai_inference_blocks.js`：積木定義
  - `ai_inference_generators.js`：產生器
  - `i18n/zh-hant.js` + `i18n/en.js`：i18n 字串

### Phase 7：範例建立（後續任務）
- [ ] `examples/AI_03_detector_pan_tilt/`：單軸追蹤雲台範例

## 技術細節

### 回歸模型設計
```python
def build_detector_model(backbone_name='mobilenetv2', input_shape=(224, 224, 3), fine_tune=False):
    base_model = get_backbone(backbone_name, input_shape)
    base_model.trainable = fine_tune
    
    model = tf.keras.Sequential([
        base_model,
        tf.keras.layers.GlobalAveragePooling2D(),
        tf.keras.layers.Dropout(0.2),
        tf.keras.layers.Dense(128, activation='relu'),
        tf.keras.layers.Dense(4, activation='sigmoid')  # x, y, w, h (0~1)
    ])
    return model
```

### YOLO 格式轉換
- Dataset Manager 內部格式：`{class_id, bbox: [x, y, w, h]}`（比例座標）
- YOLO 格式：`class_id cx cy w h`（歸一化座標）
- 兩者格式相同，直接寫入即可

### 推論端 bbox 解析
```python
def _detect(self, frame):
    d2 = self._preprocess(frame)
    if d2 is None:
        return {"type": "detector", "objects": []}
    self.it.set_tensor(self.i[0]["index"], d2)
    self.it.invoke()
    out = self.it.get_tensor(self.o[0]["index"])[0]
    # out = [x, y, w, h] (0~1)
    x, y, w, h = float(out[0]), float(out[1]), float(out[2]), float(out[3])
    # 轉換為 (x1, y1, x2, y2)
    x1, y1 = x - w/2, y - h/2
    x2, y2 = x + w/2, y + h/2
    label = self.ls[0] if self.ls else "object"
    return {"type": "detector", "objects": [{"label": label, "confidence": 1.0, "bbox": (x1, y1, x2, y2)}]}
```

## 風險與注意事項

1. **重命名風險**：`classifier_train.py` 的 import 路徑必須同步更新，否則分類訓練會中斷
2. **座標系統一致性**：Dataset Manager 的 bbox 是 [x, y, w, h]（左上角 + 寬高），YOLO 是 [cx, cy, w, h]（中心點 + 寬高），需要確認轉換
3. **TFLite 量化相容性**：回歸模型的 int8 量化需要確認輸出精度是否足夠
4. **雙平台同步**：VSIX 與 Tauri 的匯出邏輯需要分別修改，確保行為一致