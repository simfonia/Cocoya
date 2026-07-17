# AI 訓練積木功能擴充開發計畫
**日期**：2026-07-12
**對應討論**：py_ai_train_run 積木功能擴充、共同模組提取、通用推論架構

---

## 一、背景與目標

### 1.1 現狀問題
- `py_ai_train_run` 積木只有 6 個基本參數，缺乏 Dropout、驗證集比例、資料擴增等重要訓練參數
- `classifier_train.py` 中 IMG_SIZE=224 硬編碼，且無共同模組可被其他任務類型複用
- `py_ai_model_init` 寫死分類器推論邏輯，無法支援物件偵測、循跡、表格等任務
- Dataset Manager 已支援 `image/object_detection/line_following/table` 等專案類型，但訓練積木尚未對齊

### 1.2 設計原則
- **通用性**：一個訓練積木適用所有任務類型，產生器依 TASK_TYPE 過濾參數
- **分層設計**：基本參數（初學者可見）+ 進階參數（分組顯示在同一積木）
- **模組化**：提取共同 Python 模組，消除重複程式碼
- **向後相容**：積木欄位變更後，舊專案開啟時會顯示預設值

---

## 二、架構設計

### 2.1 積木架構（3 個通用積木 + N 個解析積木）

```
┌─────────────────────────────────────────┐
│  py_ai_train_run (通用訓練積木)          │
│  [基本區] 10 個欄位（所有任務通用）       │
│  [進階區] 6 個欄位（產生器依類型過濾）    │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  py_ai_model_init (通用模型載入積木)     │
│  載入 TFLite + 依 task_type 選擇推論引擎 │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  py_ai_model_predict (通用推論積木)      │
│  輸入 frame/data → 輸出通用結果物件      │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  解析積木（從通用結果中提取）             │
│  py_ai_get_label(result)      → 字串    │
│  py_ai_get_confidence(result) → 浮點數  │
│  py_ai_get_bbox(result)       → (x1,y1,x2,y2) │
│  py_ai_get_direction(result)  → 字串    │
└─────────────────────────────────────────┘
```

### 2.2 任務類型對照表

| Dataset Manager 類型 | 訓練積木 TASK_TYPE | 說明 |
|---------------------|-------------------|------|
| `image` | `classifier` | 圖像分類 |
| `object_detection` | `detector` | 物件偵測 |
| `line_following` | `line_follower` | 循線偵測 |
| `table` | `table` | 表格資料分類/迴歸 |

### 2.3 Python 共同模組架構

```
resources/train_templates/
├── common/
│   ├── __init__.py
│   ├── dataset.py          # 資料集載入、驗證、分割、資料擴增
│   ├── model.py            # 模型建立、backbone 管理
│   ├── training.py         # 訓練迴圈、class weight 計算
│   ├── export.py           # TFLite 轉換、模型儲存
│   └── report.py           # 訓練曲線繪製、HTML 報告產生
├── classifier/
│   └── classifier_train.py # 使用 common/* 模組
├── detector/
│   └── detector_train.py   # 未來實作
├── line_follower/
│   └── line_follower_train.py # 未來實作
└── table/
    └── table_train.py      # 未來實作
```

---

## 三、實作步驟

### Phase 1：Python 共同模組提取（優先執行）

#### Step 1.1：建立 common/ 目錄與 dataset.py
- 從 `classifier_train.py` 提取：
  - `load_image_dataset()`：載入圖片資料集、驗證分類、計算各類張數
  - `create_data_augmentation()`：建立資料擴增 pipeline（可啟用/停用）
  - `prepare_dataset()`：正規化 + prefetch 優化
- 新增 `load_table_dataset()` 預留接口（回傳 NotImplementedError）

#### Step 1.2：建立 common/model.py
- 從 `classifier_train.py` 提取：
  - `build_image_model()`：建立 MobileNetV2 + 自訂分類頭
  - `create_fc_layers()`：根據 DNN_LAYERS 參數建立全連接層
- 參數化：backbone 名稱、input_shape、dropout_rate、dnn_layers

#### Step 1.3：建立 common/training.py
- 從 `classifier_train.py` 提取：
  - `compute_class_weights()`：計算類別權重
  - `train_model()`：執行訓練迴圈
- 參數化：optimizer 選擇（Adam/SGD/RMSprop）

#### Step 1.4：建立 common/export.py
- 從 `classifier_train.py` 提取：
  - `export_tflite()`：TFLite 轉換（量化/非量化）
  - `save_labels()`：儲存 labels.txt

#### Step 1.5：建立 common/report.py
- 從 `classifier_train.py` 提取：
  - `plot_training_curves()`：繪製 Loss/Accuracy 曲線
  - `generate_html_report()`：產生 HTML 訓練報告

#### Step 1.6：重構 classifier_train.py
- 改為匯入 common/* 模組
- 新增命令列參數：`--validation_split`, `--dropout`, `--augmentation`, `--backbone`, `--optimizer`, `--dnn_layers`, `--fine_tune`
- IMG_SIZE 維持 224 硬編碼（與 MobileNetV2 imagenet 權重綁定）
- 保持向後相容：所有新參數都有預設值

### Phase 2：積木修改

#### Step 2.1：修改 py_ai_train_run 積木定義
- 基本區新增 3 個欄位：
  - `VALIDATION_SPLIT`：FieldNumber(0.2, 0.1, 0.5, 0.1)
  - `DROPOUT`：FieldNumber(0.2, 0.0, 0.9, 0.1)
  - `AUGMENTATION`：FieldCheckbox(TRUE)
- 進階區（分組顯示）新增 4 個欄位：
  - `BACKBONE`：FieldDropdown([MobileNetV2, EfficientNet, ResNet])
  - `OPTIMIZER`：FieldDropdown([Adam, SGD, RMSprop])
  - `DNN_LAYERS`：FieldInput("128,64") — 逗號分隔的神經元數
  - `FINE_TUNE`：FieldCheckbox(FALSE)
- 加入視覺分隔線（用 appendDummyInput + 灰色文字）

#### Step 2.2：修改 py_ai_train_run 產生器
- 將新參數傳入 subprocess 命令
- 根據 TASK_TYPE 過濾不相關的參數（如 table 類型不傳 backbone/augmentation）

#### Step 2.3：更新 i18n
- 中英文新增所有欄位的標籤與 tooltip

### Phase 3：通用推論積木

#### Step 3.1：修改 py_ai_model_init
- 新增 `TASK_TYPE` 下拉欄位（classifier/detector/line_follower/table）
- 產生器注入通用 `_ModelInference` 類別，內部根據 task_type 選擇推論邏輯

#### Step 3.2：修改 py_ai_model_predict
- 保持不變，但回傳的結果格式改為通用 dict
- 分類：`{"type": "classifier", "label": "...", "confidence": 0.95}`
- 偵測：`{"type": "detector", "objects": [{"label": "...", "confidence": 0.9, "bbox": [x1,y1,x2,y2]}]}`
- 循跡：`{"type": "line_follower", "direction": "left", "confidence": 0.8}`
- 表格：`{"type": "table", "prediction": 0.85, "confidence": 0.9}`

#### Step 3.3：新增解析積木
- `py_ai_get_label`：從結果中提取標籤字串
- `py_ai_get_confidence`：從結果中提取信心度
- `py_ai_get_bbox`：從結果中提取邊界框（偵測專用）
- `py_ai_get_direction`：從結果中提取方向（循跡專用）

### Phase 4：Dataset Manager 對齊

#### Step 4.1：確認專案類型映射
- 在 `dataset_manager/spec.js` 中確認 `PROJECT_TYPES` 與訓練積木的 `TASK_TYPE` 對應
- 確保 Dataset Manager 匯出的資料集路徑格式與訓練腳本相容

### Phase 5：說明文件

#### Step 5.1：建立 docs/help/ 目錄
- `docs/help/py_ai_train_run.html`：訓練積木使用說明
- `docs/help/py_ai_model_init.html`：模型初始化積木使用說明
- `docs/help/py_ai_model_predict.html`：推論積木使用說明
- `docs/help/py_ai_get_label.html`：標籤提取積木使用說明
- `docs/help/py_ai_get_confidence.html`：信心度提取積木使用說明
- `docs/help/py_ai_get_bbox.html`：邊界框提取積木使用說明
- `docs/help/py_ai_get_direction.html`：方向提取積木使用說明

---

## 四、檔案異動清單

| 檔案 | 操作 | 說明 |
|------|------|------|
| `resources/train_templates/common/__init__.py` | 新增 | 共同模組包 |
| `resources/train_templates/common/dataset.py` | 新增 | 資料集處理 |
| `resources/train_templates/common/model.py` | 新增 | 模型建立 |
| `resources/train_templates/common/training.py` | 新增 | 訓練迴圈 |
| `resources/train_templates/common/export.py` | 新增 | TFLite 匯出 |
| `resources/train_templates/common/report.py` | 新增 | 訓練報告 |
| `resources/train_templates/classifier/classifier_train.py` | 修改 | 使用 common 模組 + 新參數 |
| `ui/src/modules/ai_inference/ai_inference_blocks.js` | 修改 | 新增 7 個欄位 + 分組 |
| `ui/src/modules/ai_inference/ai_inference_generators.js` | 修改 | 傳遞新參數 + 通用推論 |
| `ui/src/modules/ai_inference/i18n/en.js` | 修改 | 新增 i18n |
| `ui/src/modules/ai_inference/i18n/zh-hant.js` | 修改 | 新增 i18n |
| `docs/help/py_ai_train_run.html` | 新增 | 使用說明 |
| `docs/help/py_ai_model_init.html` | 新增 | 使用說明 |
| `docs/help/py_ai_model_predict.html` | 新增 | 使用說明 |
| `docs/help/py_ai_get_label.html` | 新增 | 使用說明 |
| `docs/help/py_ai_get_confidence.html` | 新增 | 使用說明 |
| `docs/help/py_ai_get_bbox.html` | 新增 | 使用說明 |
| `docs/help/py_ai_get_direction.html` | 新增 | 使用說明 |

---

## 五、風險與注意事項

1. **IMG_SIZE 硬編碼**：224 是 MobileNetV2 imagenet 權重的標準輸入，改變會導致無法載入預訓練權重。若未來需要支援其他尺寸，需提供「不使用預訓練權重」的選項。
2. **table 類型訓練**：表格資料的 dataset loader 與模型架構（MLP）與圖片完全不同，共同模組中預留接口但實作留待後續。
3. **產生器路徑**：`script_path` 的計算方式依賴 `sys.argv[0]`，在 VS Code 與 Tauri 模式下行為可能不同，需注意測試。
4. **積木向後相容**：新增欄位後，舊的 .xml 專案檔開啟時新欄位會顯示預設值，不會報錯。