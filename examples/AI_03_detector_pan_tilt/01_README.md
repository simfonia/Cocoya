# 物件偵測追蹤雲台 - 完整 PBL 範例

## 專案概述
此範例示範完整的物件偵測工作流程，目標是讓小型雲台自動追蹤指定目標：

1. **資料集收集與標註**：使用 Dataset Manager UI 收集影像並標註 bbox
2. **模型訓練**：使用積木進行物件偵測模型訓練
3. **PC 端推論**：即時偵測目標位置並透過 Serial 傳送角度
4. **MCU 端雲台控制**：根據角度控制伺服馬達轉向

## 硬體需求
- πCar 套件（XIAO S3 Sense）
- USB 攝影機
- 伺服馬達（連接 GP14，雲台用）
- 蜂鳴器（連接 GPIO 21，可選）

## 快速開始

### 1. 資料集收集與標註（使用 Dataset Manager UI）

#### 步驟 1：開啟 Dataset Manager
1. 點擊 Cocoya 工具列上的「Dataset Manager」按鈕（相機圖示）
2. 等待攝影機初始化完成

#### 步驟 2：建立專案
1. 專案類型選擇「object_detection」
2. 資料集名稱輸入：`detector_dataset`
3. 來源模式：live（即時採集）或 file（匯入現有影像）

#### 步驟 3：新增類別
1. 在「標籤管理」面板點擊「新增類別」
2. 輸入類別名稱：`ball`（球）
3. 可再新增：`cup`（杯子）等

#### 步驟 4：捕捉影像
1. 選擇要捕捉的類別
2. 將目標放在攝影機前
3. 點擊「捕捉」收集 100+ 張影像
4. 建議：每個類別至少有 50-100 張、不同角度和距離的影像

#### 步驟 5：標註目標（bbox）
1. 點擊影像縮圖進入標註模式
2. 在「類別」下拉選單選擇目標類別
3. 用滑鼠在目標物體上拉一個矩形框
4. 每張影像至少標註 1 個 bbox

#### 步驟 6：匯出資料集
1. 點擊「匯出」按鈕
2. 選擇儲存位置
3. 匯出後確認目錄結構包含 `images/` 和 `labels/`

### 資料集結構
```
dataset/detector_dataset/
├── images/          # 所有影像檔
├── labels/          # YOLO 格式標註（class_id cx cy w h）
├── dataset.json     # Dataset Spec
└── labels.txt       # 類別名稱
```

### 2. 模型訓練（使用積木）

開啟 `02_模型訓練.xml` 並執行：

1. 使用 `py_ai_train_run` 設定訓練參數：
   - dataset: `dataset/detector_dataset`
   - task_type: `detector`
   - epochs: 10（可增加）
   - model_output: `int8`（量化給 MCU 用）

2. 模型將自動儲存至：
   - `model/detector_dataset.tflite`
   - `model/detector_dataset_labels.txt`

### 3. PC 端推論（使用積木）

開啟 `03_PC端推論控制.xml` 並執行：

1. 使用 `py_ai_model_init` 載入模型：
   - 路徑："model/detector_dataset"
   - 類型：detector

2. 使用 OpenCV 積木開啟攝影機

3. 使用 `py_ai_model_predict` 進行即時推論

4. 使用 `py_ai_get_bbox_center` 取得目標中心點

5. 計算目標中心與畫面中心的偏移量，轉換為角度

6. 使用 Serial 積木發送角度給 MCU

### 4. MCU 端雲台控制（使用積木）

開啟 `04_MCU雲台追蹤.xml` 並燒錄至 πCar：

1. 使用 Serial 積木接收角度指令

2. 使用伺服馬達積木控制雲台轉向：
   - GP14：雲台水平伺服馬達
   - 角度範圍：0°~180°

## 積木解說

### 1. 資料集收集與標註
- 透過 Dataset Manager UI 操作（無需積木）
- 物件偵測需先選類別再畫框

### 2. 訓練積木
- `py_ai_train_run`：執行訓練（task_type=detector）
- 訓練完成後自動儲存 int8 TFLite 模型

### 3. PC 端推論積木
- `py_ai_model_init`：載入模型與標籤
- `py_ai_model_predict`：回傳偵測結果
- `py_ai_get_bbox`：取得邊界框 (x1, y1, x2, y2)
- `py_ai_get_bbox_center`：取得中心點 (cx, cy)
- `serial_write`：發送角度給 MCU

### 4. MCU 端雲台控制積木
- `serial_read`：接收角度指令
- `mcu_car_servo`：控制伺服馬達轉向

## 雲台追蹤的核心邏輯
1. 模型偵測目標位置，輸出 bbox 中心點 (cx, cy)
2. 計算中心點與畫面中心的水平偏移量
3. 偏移量轉換為伺服馬達角度（0°~180°）
4. 透過 Serial 發送角度，MCU 控制馬達轉向
5. 重複此循環達成追蹤

## 進階挑戰
1. 加入垂直追蹤（第二顆伺服馬達 GP15）
2. 多類別偵測（新增更多目標）
3. 模糊控制：根據偏移量大小調整轉速
4. 加入距離判斷：根據 bbox 大小控制雲台縮放

## 故障排除
- **Serial 連線失敗**：檢查 COM 埠號和波特率（115200）
- **模型載入失敗**：確認 model/ 目錄存在且有正確檔案
- **標註框不顯示**：確認已選擇類別再畫框
- **伺服馬達不動**：確認 GP14 接線與伺服馬達供電
- **偵測不準**：增加標註數量，確保每類別 100+ 張
</｜｜DSML｜｜>
</write_to_file>