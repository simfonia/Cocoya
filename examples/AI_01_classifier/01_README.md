# 影像分類控制 πCar 音效 - 完整 PBL 範例

## 專案概述
此範例示範完整的 AI 影像分類工作流程，從資料收集到實際應用：

1. **資料集收集**：使用 Dataset Manager UI 收集 3 類影像
2. **模型訓練**：使用積木進行本地或 DGX 訓練
3. **PC 端推論**：即時分類並透過 Serial 傳送結果
4. **MCU 端控制**：根據分類結果控制 πCar 音效

## 硬體需求
- πCar 套件（XIAO S3 Sense）
- USB 攝影機
- 蜂鳴器（連接 GPIO 21）
- LED（連接 GPIO 25，可選）

## 快速開始

### 1. 資料集收集（使用 Dataset Manager UI）

#### 步驟 1：開啟 Dataset Manager
1. 點擊 Cocoya 工具列上的「Dataset Manager」按鈕（相機圖示）
2. 等待攝影機初始化完成

#### 步驟 2：建立分類類別
1. 在「類別管理」面板中，點擊「新增類別」按鈕
2. 輸入類別名稱：`class_0`（例如：拳頭）
3. 重複操作，新增 `class_1`（掌心）和 `class_2`（剪刀）

#### 步驟 3：捕捉影像
1. 選擇第一個類別（class_0）
2. 將手勢放在攝影機前（確保手勢清晰可見）
3. 點擊「捕捉」按鈕，或啟用「自動捕捉」模式
4. 系統會自動捕捉並顯示縮圖
5. 重複步驟 1-4 直到每個類別有 100 張影像

#### 步驟 4：匯出資料集
1. 點擊「匯出」按鈕
2. 選擇儲存位置：`dataset/` 目錄
3. 確認匯出後，關閉 Dataset Manager

### 資料集結構
成功匯出後，您的專案目錄將包含：
```
dataset/
├── class_0/      # 100 張影像
│   ├── 0001.jpg
│   ├── 0002.jpg
│   └── ...
├── class_1/      # 100 張影像
└── class_2/      # 100 張影像
```

### 注意事項
- 確保每個類別的影像數量平衡（建議 100 張/類）
- 避免背景過於複雜，以免影響模型準確度
- 可以使用「刪除」按鈕移除不良樣本
- 支援從現有目錄匯入影像（點擊「匯入」按鈕）

### 2. 模型訓練（使用積木）

開啟 `02_模型訓練.xml` 並執行：

1. 使用 `py_ai_train_init` 設定訓練參數：
   - epochs: 50
   - batch_size: 32
   - learning_rate: 0.001

2. 使用 `py_ai_train_run` 執行訓練：
   - dataset: 'dataset'
   - task_type: 'classification'
   - backend: 'auto'（自動選擇本地或遠端）

3. 模型將自動儲存至：
   - `model/classifier_model.tflite`
   - `model/labels.txt`

### 3. PC 端推論（使用積木）

開啟 `03_PC端推論控制.xml` 並執行：

1. 使用 `py_ai_model_init` 載入模型：
   - 路徑："model/classifier_model"

2. 使用 OpenCV 積木開啟攝影機

3. 使用 `py_ai_model_predict` 進行即時推論

4. 使用 Serial 積木發送類別索引：
   - 波特率：115200
   - 發送格式：純數字（0, 1, 2）

5. 信心度 >75% 時自動發送

### 4. MCU 端控制（使用積木）

開啟 `04_MCU端音效控制.xml` 並燒錄至 πCar：

1. 使用 Serial 積木接收類別索引

2. 使用條件積木判斷類別：
   - 0 → 262 Hz（Do）
   - 1 → 294 Hz（Re）
   - 2 → 330 Hz（Mi）

3. 使用音效積木控制蜂鳴器

4. 使用 LED 積木提供視覺回饋

## 積木解說

### 1. 資料集收集
- 透過 Dataset Manager UI 操作（無需積木）

### 2. 訓練積木
- `py_ai_train_init`：設定超參數
- `py_ai_train_run`：執行訓練（支援雲端）
- 訓練完成後自動儲存模型

### 3. PC 端推論積木
- `py_ai_model_init`：載入模型與標籤
- `py_ai_model_predict`：回傳 (類別, 信心度)
- `serial_write`：發送類別索引
- `opencv_show`：即時顯示結果

### 4. MCU 端控制積木
- `serial_read`：接收類別索引
- `if/else`：判斷類別
- `buzzer_frequency`：設定音高
- `led_on/off`：視覺回饋

## 進階挑戰
1. 新增更多分類類別（修改 labels.txt）
2. 調整音高對應表（修改頻率映射）
3. 加入節奏模式（連續手勢觸發音階）
4. 整合 πCar 移動（前進/後退/轉彎）
5. 使用 DGX 遠端訓練（修改 backend='remote'）

## 故障排除
- **Serial 連線失敗**：檢查 COM 埠號和波特率（115200）
- **模型載入失敗**：確認 model/ 目錄存在且有正確檔案
- **推論結果不準**：增加資料集樣本數或調整訓練參數
- **音效無聲**：檢查蜂鳴器接線（GPIO 21）

## 範例資料集
本專案已包含預訓練模型和範例資料集：
- `model/classifier_model.tflite`（3 類分類）
- `model/labels.txt`（class_0, class_1, class_2）
- `dataset/`（範例影像）

可直接使用進行測試，或替換為自訂資料集。