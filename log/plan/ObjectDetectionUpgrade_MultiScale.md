# 物件偵測升級施工計畫：Keras Spatial Head + YOLO 雙架構

建立：2026-10-12  重寫：2026-11-05  修訂：2026-11-06  狀態：雙架構 POC 已完成，正式施工待 Gate 0 拍板

## 0. 決策摘要

### 建議方向

依使用者決策，Cocoya 的 `object_detection` **同時提供兩種新架構：Keras Spatial Head 與 YOLO；全面棄用目前 Legacy GAP + Dense(4) 單框回歸，不實作舊架構相容層**。兩種新架構共用任務類型、資料來源與推論結果契約，但訓練 head、依賴、artifact 和解碼各自獨立。Spatial Head 是 50 分鐘課堂流程的預設快速路徑；YOLO 是多物件／進階路徑，POC 的 CPU 訓練約 38.8 分鐘，尚未計資料前處理、下載及推論驗收，**不可承諾完整教學流程能在 50 分鐘內完成**。先完成獨立場景 benchmark 與授權決策，再將雙架構接入 Cocoya 訓練／推論流程。

### 本階段包含

- Dataset Manager 的 `object_detection` 標註資料供兩種架構共用；converter 保留每張圖完整 annotation、無物件影像與類別映射。
- 以固定、可追溯的場景分組切分建立 benchmark，同時評估 Spatial Head 和 YOLO；Legacy 僅作已完成的歷史研究 baseline，正式流程不再產生或載入 Legacy 模型。
- 在同一訓練入口提供 `spatial_heatmap` 與 `yolov8n` 架構選擇，產生各自的模型、metadata、訓練紀錄與報告。
- PC 推論依模型 metadata dispatch 至 Keras/TFLite Spatial Head 或 YOLO `.pt`，並回傳共同的 `objects` 結果結構。
- 新增多物件解析積木；Pan/Tilt 範例預設使用 Spatial Head 快速路徑，YOLO 路徑作為進階選項。
- 驗證 PC 即時影像與 Serial 傳框流程；MCU 只接收座標／控制值，不在 MCU 執行任一模型。

### 本階段不包含

- 自行撰寫 YOLO 的 anchor、target assignment、loss、head 或 NMS；YOLO 路徑使用經授權的 Ultralytics 實作。
- YOLO int8／TFLite Micro／ESP32-S3／RP2040 部署與效能承諾；Spatial Head 的 Float32 TFLite 可列入 PC 驗證，MCU 部署仍另案。
- 改寫 `line_following` 模型。它與現有偵測共用部分 Legacy 建模碼；應先將循線模型建立入口抽離，再移除偵測 Legacy，確保循線不受影響。
- Legacy 舊模型、舊推論 decoder、舊訓練 API 的 runtime 相容性不在範圍內。Cocoya 尚未發佈，既有範例 XML／產物可以同步遷移或重生。
- 未經獨立場景驗證就宣稱產品級準確率，或把本次同一連拍序列的結果當泛化證據。

## 1. 背景、現況與實驗證據

### 1.1 升級前現況（Legacy，正式施工時棄用）

- `resources/train_templates/common/detector_model.py`：backbone → GlobalAveragePooling → Dense(128/自訂層) → Dense(4, sigmoid)，以單框 bbox 回歸；`class_id` 不做分類預測。這是 Legacy，完成遷移後不再由 `object_detection` 訓練入口建立。
- `resources/train_templates/common/detector_dataset.py`：支援 DM 落盤與 YOLO 匯出兩種資料佈局，但兩條路徑目前都只取每張圖第一個有效 bbox；無標註影像會跳過。正式雙架構流程須取完整 annotations；class ID 供 YOLO 分類 head 使用，Spatial Head POC 則先限制單一追蹤目標。
- `ui/src/modules/dataset_manager/`：標註端已能保存每張影像的 annotation 陣列；訓練 loader 尚未完整利用多框能力。
- `ui/src/modules/ai_inference/ai_inference_generators.js`：目前 `_detect()` 解讀固定 4 個 bbox 值並回傳單一物件；正式雙架構解碼改為依 metadata 選 Spatial Heatmap 或 YOLO decoder，統一回傳 `objects` array。
- `resources/train_templates/common/model_export.py`：既有流程的 int8 量化支援不代表 Spatial Head／YOLO 的輸出可直接量化；本階段先驗證 Spatial Head Float32 TFLite，量化另列 Gate。

### 1.2 已完成 POC（2026-11-04）

資料位置：`examples/AI_02_detector_pan_tilt/dataset/ping_pong`。稽核結果：291 筆 Spec 樣本；289 張已標註影像、289 個框、單一類別 `orange`；另有 2 張無有效標註影像。有效影像皆為 640×480，每張一框。這些影像為約 0.5 秒間隔的單一連續拍攝序列。

| 項目 | Legacy baseline（棄用參考） | Keras Spatial Head POC | YOLOv8n POC |
| :--- | :--- | :--- | :--- |
| 軟體／權重 | Cocoya MobileNetV2 GAP 單框回歸 | TensorFlow 2.18.0、MobileNetV2 ImageNet frozen、stride-8/16 空間融合 | Ultralytics 8.3.228、預訓練 `yolov8n.pt` |
| 輸入 | 224×224 | 224×224 | 640×640 |
| 輸出目標 | 一個框 | 一個中心 heatmap + 該中心框尺寸 | 多物件框、類別及信心值 |
| 訓練 | 30 epochs、batch 32、fine_tune=false | 24 epochs（early stopping）、batch 16、CPU | 30 epochs、batch 8、CPU、seed 42 |
| 固定切分 | train 232 / val 57 | train 232 / val 57，同一組影像 | train 232 / val 57，同一組影像 |
| 指標 | 最終 val bbox IoU = **0.0766** | mean IoU = **0.6556**；IoU50 rate = **0.930**；IoU75 rate = **0.193** | mAP50 = **0.995**；mAP50-95 = **0.8334** |
| 推論／匯出 | 舊 TFLite 單框 decoder | Float32 TFLite 與 Keras 指標相同至顯示精度 | `.pt` PC inference；MCU 未驗證 |
| 訓練耗時／模型大小 | 約 164 秒 | 約 **168 秒（2.8 分鐘）**／Float32 TFLite 約 **5.03 MiB** | 約 2,331 秒（38.8 分鐘）／`best.pt` 約 5.95 MiB |

使用者先前報告的歷史 `finalIoU=0.08987`（顯示 8.99%）與本次固定切分 Legacy 重跑的 `0.07662` 不相同；正式 benchmark 以固定 manifest 重跑結果為準。Spatial Head 的 IoU 與 YOLO mAP 是不同統計量，不可直接按數字排名；Spatial Head 的 IoU 是同一個 GT 框的單目標定位指標。YOLO 同時使用更高輸入解析度和預訓練偵測 head，亦不能單獨歸因為只靠架構提升。

### 1.3 證據限制與待補資料

1. train/val 是從同一連拍序列隨機切分，鄰近影格可能跨集合；mAP 接近 1 及 IoU 0.8882 僅證明該切分上可擬合，不能證明跨背景、跨光線或跨攝影機泛化。
2. Cocoya `bbox_iou` 與 YOLO mAP 的統計定義不同；`cocoya_style_mean_best_iou_conf_025` 是本 POC 補算的「每張圖最佳預測框 IoU 平均」，不是 mAP，也不適用於一般多框資料的完整評估。正式 benchmark 必須使用逐圖、逐 GT 的一對一匹配共同指標。
3. 單段資料只有一個類別且每圖一框；不能由此推出多類別、多框、背景負樣本或資料不平衡下的表現。
4. YOLOv8n POC 以 640 輸入；現行 Cocoya 使用 224。需以固定獨立測試場景比較產品方案，同時做輸入解析度／推論延遲分析，避免錯誤歸因。
5. 目前只有 PC CPU 訓練結果；沒有 PC 即時推論 FPS、GPU／不同電腦表現、TFLite、MCU 資源或部署測試。

## 2. 施工原則與不變契約

1. `dataset.json` 是標註真相；任何轉換出的 YOLO `labels/*.txt`、YAML、Spatial Head target、split manifest 都是可重建的衍生產物，不回寫或搬動原始資料。
2. bbox 座標來源是 Dataset Manager 正規化左上角 `[x, y, w, h]`；YOLO 轉成正規化中心格式 `[class_id, cx, cy, w, h]`，Spatial Head 轉成 stride-8 heatmap center + normalized width/height。所有轉換都要有 round-trip／解碼測試及範例影像視覺化。
3. split 以拍攝 session／影片／來源群組為單位；同一連拍序列不得跨 train、validation、test。validation 用於選參數；test 僅在模型／閾值定稿後評估。
4. 無物件影像必須作為負樣本保留：YOLO 使用空 label 檔；Spatial Head 使用全零 heatmap，並驗證 confidence threshold 可輸出 `objects=[]`。未分類框 `class_id=-1` 不得誤當背景，須明確報錯或依已決策規則排除並回報數量。
5. PC 推論結果的通用結構維持：`{"type":"object_detection","objects":[{"label","confidence","bbox"}]}`；`bbox` 為相對原始影像的正規化 `(x1,y1,x2,y2)`，座標裁切至 `[0,1]`。未偵測結果 `objects=[]`。
6. 模型格式／架構須明確指定或由 metadata 可靠判別，不可在資料夾內有多個模型時依檔案列舉順序猜測。推論統一輸出 `objects` array，但 Spatial Head 只保證單一物件、YOLO 可回傳多物件。
7. Legacy 偵測將整體移除，不做舊模型檔／舊 XML 相容。因 Cocoya 尚未發佈，所有內建 `object_detection` 範例 XML、測試 fixture、文件及示範模型都在同一遷移切片更新；確認 repo 內沒有仍依賴 Legacy 的對外範例後再刪除舊 encoder/decoder。
8. `line_following` 目前與 Legacy detector 共用 `build_detector_model()`；移除前先將循線模型建構與其測試抽離為獨立實作，確保循線不受影響。
   > **✅ 2026-11-09 已完成前置解耦**：`common/line_model.py` 新建（`build_line_model()`，不依賴 `detector_model.py`）；`line_following_train.py` 已改用 `build_line_model()`。Phase 3 刪除 `detector_model.py` 的前置障礙已清除。同時新增 `_random_hflip_line()`（線段 x1/x2 同步鏡射）與 EarlyStopping + ReduceLROnPlateau，詳見 `log/plan/TrainingTemplateUpgrade_Plan.md`（LineFollowingUpgrade）。
9. VSIX `src/` 已凍結；不得為此新增 VSIX Host handler。共用 Blockly／Python 產生器可在 Tauri 端功能需要時做最小調整，依既有 bridge capability 慣例處理平台差異。
10. Ultralytics 套件與權重的版本、授權及再散布條件是 YOLO 路徑的正式整合 Gate；未完成法務／產品授權確認前，不把套件或權重包入 Cocoya 發行物。Spatial Head 路徑維持 TensorFlow/Keras/TFLite。

## 3. 工作階段總覽與 Gate

| 階段 | 目標 | Gate／完成條件 |
| :--- | :--- | :--- |
| G0 | 雙架構產品範圍、授權與教學時間拍板 | 確認 Spatial Head 為課堂快速預設、YOLO 為進階多物件選項；確認 Ultralytics 授權、OS/Python、模型大小與延遲 |
| G1 | 建立獨立場景資料 benchmark | 有 session 分組與固定 manifest；資料品質及 annotation 視覺檢查通過 |
| G2 | 雙架構公平 benchmark | Spatial Head 與 YOLO 在適用任務及獨立 test 有各自驗收指標、速度、大小與適用範圍 |
| G3 | 雙架構訓練流程接入 | 同一入口可選 Spatial Head／YOLO；產物／metadata／報告明確區分且不覆寫使用者資料 |
| G4 | PC 推論雙架構 dispatch | Keras/TFLite Spatial Head 與 YOLO `.pt` 均通過解碼；空結果與多框行為符合契約；Legacy 移除 |
| G5 | Blockly 雙架構 UX | UI 說明兩種用途；Spatial Head 單目標安全操作，YOLO 可迭代零／一／多個偵測 |
| G6 | 文件、範例及發布檢查 | 新範例、教學、依賴、授權、CPU 安裝與發行方式完整；測試及實機 Gate 簽核 |

各 Gate 未達成時不得直接進入下一階段；將 blocker、證據與選項記錄後，回到產品決策或補資料。後續階段的實際文件／行號於施工時再查現況，不把此計畫中的程式位置視為永遠固定。使用者已決策雙架構並棄用 Legacy；G0 剩餘產品決策是 YOLO 授權／安裝方案、50 分鐘課程中是否只保證 Spatial Head 路徑，以及最低硬體門檻。

## 4. 詳細施工步驟

### Phase 0：雙架構產品決策與授權查核（G0）

- [ ] 確認兩個架構名稱與教學定位：`spatial_heatmap`＝課堂快速單目標路徑；`yolov8n`＝進階多物件路徑。使用者已決策兩者並存、Legacy 棄用。
- [ ] 確認第一版部署範圍為 **PC inference + MCU Serial 控制**；兩個模型均在 PC 執行，MCU 不執行 `.pt` 或 TFLite 模型。
- [ ] 確認 PC 支援範圍：Windows 是否為首發唯一平台、Python 版本、CPU-only 是否必須可用、是否支援使用者自備 NVIDIA GPU。
- [ ] 固定 YOLO 套件版本、預訓練權重來源與 `.pt` 格式；記錄版本、下載 URL／來源與 SHA-256。Spatial Head 固定 Keras/TFLite metadata 格式。
- [ ] 查核 Ultralytics 版本及預訓練權重的授權與散布條款。決定採外部安裝、使用者自行取得權重，或購買／採用相容授權；未拍板前不將 YOLO 權重或套件隨安裝包發行。Spatial Head 不依賴 Ultralytics。
- [ ] 定義分架構驗收門檻：Spatial Head 的課堂訓練時間（建議目標 ≤5 分鐘）、單目標 IoU／IoU50 rate、無目標誤報率；YOLO 的 mAP50-95、IoU50 precision／recall、推論 FPS 與模型大小。獨立場景 test 才作正式門檻。
- [ ] `py_ai_train_run` 保持 `TASK_TYPE=object_detection`，新增明確 `MODEL_ARCH` 欄位（`spatial_heatmap`／`yolov8n`）；不保留 Legacy 選項。新建範例預設 Spatial Head，學生可切換 YOLO 觀察差異。

**交付物**：已簽核的雙架構定位、部署／授權決策、支援矩陣與分架構驗收門檻。  
**Gate**：若 YOLO 授權／依賴不可接受，可保留 Keras Spatial Head 正式路徑，將 YOLO 降為外部選配或停止發行；不得因此恢復 Legacy。

### Phase 1：建立獨立拍攝場景資料集與品質檢查（G1）

- [ ] 在 Dataset Manager 建立多個明確 session 的 `object_detection` 資料；至少涵蓋不同背景、球體大小／距離、位置、光線、遮擋及攝影機／場景變化。Spatial Head 快速路徑的 MVP 資料集限定一類追蹤目標、每張最多一個該目標；YOLO 路徑保留多類別、多框。
- [ ] 收集含球影像與確定沒有目標的負樣本；每張正樣本的所有可見目標都需標註，避免未標註物體被當背景。
- [ ] 確認需要的類別；同一類別名稱與 `label_map` 的 ID 保持穩定。若做多類別，需讓每個類別在 train／validation／test 都有足夠樣本。
- [ ] 以來源影像、拍攝 session、影片名稱或使用者提供的 group ID 建立 `capture_group` 對照。Dataset Manager Spec 若沒有此欄位，本階段使用不回寫原始 Spec 的 sidecar manifest。
- [ ] 建議以 session 分組做 train／validation／test，例如 70／15／15；若 session 數不足，至少保留一整組未參與訓練的場景作 test，不可把同一段連拍影格打散。
- [ ] 建立固定 `split_manifest.json`，記錄原始相對路徑、group、split、類別、bbox、資料集 Spec 雜湊、轉換版本與 seed。確認三集合 group 互斥且樣本覆蓋完整。
- [ ] 對缺失影像、重複檔名、無效 bbox、越界 bbox、無效 class ID、未標註影像及未分類框輸出明確統計；未分類框不可以靜默轉成無物件標註。
- [ ] 產生格狀標註檢視圖，人工抽查 train／validation／test、所有類別、空標籤及小／大框，檢查座標、影像方向與類別映射。

**交付物**：可版本化／重建的 group split manifest、資料品質報告、抽樣標註圖。  
**Gate**：label 錯誤、切分洩漏或缺乏獨立場景時先修資料，不以模型調參掩蓋資料問題。

### Phase 2：雙架構 benchmark 與 50 分鐘課程驗證（G2）

- [ ] 寫可重複執行的 benchmark evaluator，輸入統一的 image list、GT、class map 與模型預測，不直接比較不同框架的單一摘要數字。
- [ ] 一對一 matching：同類別預測與 GT 按 IoU 由高至低配對，每個 GT／prediction 最多匹配一次；未配對 GT 計 FN，未配對 prediction 計 FP。輸出 IoU50 precision／recall、F1、逐圖平均 IoU（miss 計 0）、每類別 AP、mAP50、mAP50-95。
- [ ] 閾值 tuning 只用 validation；在 test 上使用凍結的 confidence／NMS 閾值一次評估。報告需列閾值，並提供 precision-recall 曲線或多閾值結果，避免只挑單一有利閾值。
- [ ] Legacy 只保留已完成的歷史研究數字，不再重跑、不再作正式候選、不設向後相容驗收。
- [ ] Spatial Head 使用同一固定 manifest 重跑（POC 為參考：224 輸入、batch 16、frozen backbone、Adam 0.001、brightness/contrast、early stopping）；量測從資料載入到 TFLite export 的完整課堂時間，並另計純訓練時間。
- [ ] 訓練 YOLOv8n 預訓練權重；固定資料 manifest、seed、套件版本、輸入 640、batch、epochs、optimizer、augmentation、device 與停止條件。所有參數從 `args.yaml`／機器可讀設定輸出到報告。
- [ ] 兩個架構都用同一個 benchmark evaluator；Spatial Head 評估 single-object IoU、IoU50 rate、center error、無物件誤報率；YOLO 評估 mAP50-95、IoU50 precision／recall、誤報率。不得把 mAP 與 mean IoU 當同一指標排序。
- [ ] 做受控解析度／時間消融：Spatial Head 比較 224 與可行較小 head／輸入設定；YOLO 比較 640 與可行較低解析度或限制 epochs。清楚分辨課堂快速方案與進階訓練方案。
- [ ] 對 Spatial Head 實測從抽樣影格、標註、資料檢查、訓練、推論到 Serial demo 的完整課堂演練；若完整流程超過 50 分鐘，記錄各階段耗時並縮小資料／預先下載權重，不以模型訓練時間代替整堂時間。
- [ ] 記錄兩架構訓練時間、每張 CPU inference latency／FPS、模型大小、啟動耗時與硬體資訊；同一台 PC、相同影像與 batch=1 量測。
- [ ] 產生逐場景／逐類別指標、PR／混淆矩陣、漏檢／誤檢案例圖、預測 bbox 疊圖及 JSON/HTML 報告。
- [ ] 與 Phase 0 門檻對照，決定進入整合、補資料／調參或停止。若只在同序列驗證好而獨立 test 不好，結論應為資料泛化不足，不得宣稱模型改善已驗證。

**交付物**：雙架構比較報告、固定設定與資料 hash、兩種權重、錯誤案例集、Spatial Head 全課堂流程計時紀錄。  
**Gate**：Spatial Head 達成課堂時間及單目標驗收門檻；YOLO 達成進階多物件門檻且授權可行，才各自進入產品整合。YOLO 未過 Gate 不阻擋 Spatial Head 教學版。

### Phase 3：建立雙架構訓練與資料轉換流程（G3）

- [ ] 將 `temp/scripts/keras_spatial_detector_poc.py` 整理為正式 Spatial Head template，將 `temp/scripts/yolo_ping_pong_poc.py` 整理為 YOLO template；POC 只作參考，不直接複製成產品入口。
- [ ] `py_ai_train_run` 增加 `MODEL_ARCH`，值域只允許 `spatial_heatmap`／`yolov8n`。依架構切換顯示參數：Spatial Head 顯示 input size、epochs、batch、learning rate、早停；YOLO 顯示 weights、imgsz、epochs、batch、device、augmentation。移除 Legacy 模型選項及其專用參數。
- [ ] 訓練入口維持 `task_type=object_detection`，CLI 增加明確的 `--model_arch`；未知架構直接報錯，不得靜默回退。
- [ ] 抽出共同 Dataset Spec parser：讀每張 image 與完整 annotations array，驗證路徑、座標、class ID、空標籤及標註框數；回傳 canonical normalized record 與固定 manifest。
  > **✅ 2026-11-09 物件偵測 pipeline 前置已完成**：`detector_dataset.py` 加入 `_random_hflip_detector()`（bbox `cx` 同步鏡射，`cy/w/h` 不變）；色彩擴增與幾何擴增分離處理；`prepare_detector_dataset()` 擴增順序：先水平翻轉 → 再色彩擴增。訓練 pipeline 同時加入 EarlyStopping(patience=10) + ReduceLROnPlateau(patience=5)。
- [ ] Spatial Head 的資料 target：MVP 限定單一類別／指定追蹤目標，每張最多一個該目標；有目標產生 Gaussian heatmap + size map；無目標影像產生全零 heatmap，尺寸 loss mask 全零。多類別或多個同類目標若選 Spatial Head，訓練前明確拒絕並提示切換 YOLO，不可只取第一框或假設 `class_id=0`。
- [ ] Spatial Head 補上 objectness／confidence threshold 校準；以含球及無球的 validation set 選 threshold，無目標時必須能輸出 `objects=[]`。目前 POC 沒有驗證負樣本，不能只把 heatmap 最大值一律當成有效物件。
- [ ] YOLO converter 保留所有有效 bbox 與類別；空標籤影像寫空 `.txt`；class map 順序固定。DM `[x,y,w,h]` → YOLO `[class_id,cx,cy,w,h]`，使用來源影像實際尺寸／正規化座標，不假設固定 640×480。
- [ ] 兩種架構都用同一 manifest；不在 `dataset_dir` 內建立 staging `images/`／`labels/`，不改寫原 Spec。中間檔放指定 POC／cache 目錄並可確定性重建。
- [ ] Spatial Head 輸出 Keras `.keras` 或明確簽章的 Float32 TFLite；YOLO 輸出 `.pt`。各自寫 `model_metadata.json`，至少含 `task_type`、`model_arch`、framework/version、input size、color order、normalization、class map、output semantics、weights hash、confidence threshold 及訓練設定。
- [ ] Spatial Head 先驗證 Float32 TFLite；int8 量化只有在代表資料集、解碼一致性及目標 PC 的測試通過後才開放。YOLO POC 不提供 TFLite／MCU 匯出。
- [ ] 使用者可選 YOLO 時再檢查 Ultralytics 依賴；缺件時明確提示安裝。不得由 Sidecar 靜默 pip install；Spatial Head 只要求既定 TensorFlow 環境。
- [ ] 訓練報告依架構呈現正確指標：Spatial Head 顯示 IoU、IoU50 rate、center error、no-object FP rate；YOLO 顯示 mAP、precision／recall。不得把 mAP 塞進 accuracy 或把不同指標混名。
- [ ] 先只接 `trainLocal`；remote Docker／SSH 需另完成 PyTorch 映像、授權及安裝體積評估，不列為雙架構第一版必備。
- [ ] 程序支援 checkpoint resume、取消／中斷、progress、UTF-8 stdout、非零退出錯誤；UI 回報訓練時間與目前階段。

**交付物**：兩個正式 train template、共用 Dataset Spec parser、架構 metadata schema、依賴檢查與雙架構訓練報告。  
**Gate**：Spatial Head 單目標／負樣本與 YOLO 多框／多類別都能正確讀資料；架構參數不混用；POC 中 Legacy 產物不再由正式流程建立。

### Phase 4：PC 推論器依 metadata dispatch 雙架構（G4）

- [ ] `py_ai_model_init` 讀 `model_metadata.json` 或使用者明確選擇的 architecture，dispatch 到 `SpatialHeatmapDetector` 或 `YoloDetector`；metadata 缺失／不支援須明確錯誤，不默認 Legacy decoder。
- [ ] Spatial Head 載入 Keras 或明確簽章 Float32 TFLite；輸出 heatmap 取 argmax，讀取對應 size map，套 confidence threshold；低信心或無目標回傳 `objects=[]`。
- [ ] YOLO 載入固定版本 Ultralytics `.pt`；CPU 為保證路徑、GPU 選配。缺依賴／權重不符提供明確錯誤，不使非偵測 task import 失敗。
- [ ] YOLO 輸入 frame 維持 OpenCV BGR ndarray；座標以原始 frame 寬高正規化，不把 letterbox 尺寸錯當原圖座標。NMS 只由 YOLO backend 執行一次。
- [ ] 兩個 decoder 都回傳穩定結構 `objects=[{label,class_id,confidence,bbox}]`；confidence 0~1，bbox 為原影像正規化 `(x1,y1,x2,y2)`，裁切至 `[0,1]`。Spatial Head 最多一個 object；YOLO 可多個。
- [ ] 課堂範例只使用 Spatial Head 路徑時，不要求安裝 Ultralytics/PyTorch；選 YOLO 時才要求並檢查該依賴。不得靠目錄列舉順序猜模型。
- [ ] 移除 `_detect()` 的固定 Dense(4) 假設、Legacy loader/decoder、Legacy-only labels path 契約；image classification、line following 需有獨立 regression tests。
- [ ] 模型初始化一次後重用；記錄 per-frame latency、初始化時間及 CPU/GPU，避免每幀重載模型。

**交付物**：Spatial Head 與 YOLO 的 PC decoder、共同 output contract、兩種推論範例。  
**Gate**：Keras 與 TFLite Spatial Head 解碼一致；YOLO 與 Ultralytics 結果一致；無目標、低信心、單框、多框、多類別、非正方形 frame 及座標邊界皆通過；Legacy decoder 已從訓練與推論入口移除。

### Phase 5：Blockly 雙架構教學介面（G5）

- [ ] `py_ai_model_predict` 維持通用 `InferenceResult`；object detection `objects` 一律為 array。兩個 architecture selector 使用同一 task type。
- [ ] `py_ai_train_run` 的模型架構欄位明確提供「快速單目標（Keras Spatial Head）」與「進階多物件（YOLO）」；按選項顯示適當參數與依賴提示，不展示／不保留 Legacy 選項。
- [ ] Spatial Head 的解析積木提供 target found/confidence、bbox、中心點；無目標不得回傳假 bbox 作為有效偵測，Pan/Tilt 分支需先檢查 found/confidence。
- [ ] YOLO 多物件積木：新增 statement 型 `py_ai_for_each_detection`，輸入 result 與 DO 分支，提供當前 detection 的 label、confidence、bbox／center、class_id 解析。
- [ ] 積木迴圈必須支援巢狀；使用 Blockly nameDB／唯一區域變數避免固定 Python 變數名造成巢狀覆寫。確認空陣列時迴圈零次執行。
- [ ] 依 `AGENTS.md` 產生器靜態 Python 字串以 4 空格為基準，先剝除不可見 ID 標記再做 `valueToCode` 語意比較；輸出路徑統一正斜線並正確處理字串轉義。
- [ ] 更新 `ai_inference_blocks.js`、`ai_inference_generators.js`、i18n zh-hant/en、toolbox、help、示範 XML；遵循 task/block/i18n contract。
- [ ] 更新 `AI_02_detector_pan_tilt` 範例：教學主路徑用 Spatial Head（限定單顆球、無球時顯示未偵測）；另增 YOLO 進階範例呈現多框迴圈。Serial 只傳選定 detection 的中心／控制值。
- [ ] 因 Cocoya 尚未發佈，內建 `object_detection` XML 全面更新至新架構欄位，舊 Legacy 模型與 Legacy-only XML 可直接淘汰，不建立相容層。執行全倉搜尋清點所有範例，逐一遷移或移除。

**交付物**：雙架構選擇積木、Spatial Head 單目標解析、多物件迴圈積木、更新後的快速與進階範例。  
**Gate**：Blockly 產生 Python 可 compile；Spatial Head found／not-found 與 YOLO 零／一／多物件、多類別、巢狀迴圈行為符合契約；內建範例無 Legacy 殘留。

### Phase 6：CPU/GPU 安裝、依賴、程序管理與安全（G6 前置）

- [ ] 分開依賴安裝路徑：Spatial Head 使用 Cocoya 支援的 TensorFlow 環境，不要求安裝 PyTorch；YOLO 選配才安裝固定版本 Ultralytics／PyTorch CPU 套件。GPU 安裝需依 CUDA/PyTorch 官方配對另行指引，不混在快速課程的預設安裝路徑。
- [ ] 更新 `config/python_modules.json`、環境診斷文案、安裝按鈕／文件及 requirements lock；只列入決策後支援的套件。不要將大型權重誤作一般 Python module 檢查項目。
- [ ] 依賴缺失時提供清楚的缺件清單、版本不相容訊息及手動安裝指引；不得由 Sidecar 自動全域安裝或在訓練中下載未審核任意權重。
- [ ] 訓練／推論子程序 I/O 強制 UTF-8；設定取消、逾時、工作目錄、CPU thread 數、記憶體不足與程序清理策略。
- [ ] 固定第三方套件及權重授權文件；若無法滿足再散布條件，使用者自備權重／外部依賴或停止整合。
- [ ] 50 分鐘課程若使用 YOLO，需在課前完成套件與權重安裝／下載；課堂快速方案不得依賴網路下載大型權重或首次安裝 PyTorch。
- [ ] YOLO `.pt` 是 PC runtime 模型，不在 Tauri bundle 中默認附帶大型檔案；資源路徑與使用者模型目錄遵守既有封裝與寫入政策。

### Phase 7：測試與守門（跨 Phase 執行）

#### Python 訓練／資料測試

- [ ] DM Spec parser：單框、多框、多類、多個 annotation 次序、空標註、未分類框、class ID 空洞、越界／零面積 bbox、缺檔、非 640×480 影像。
- [ ] Spatial Head target：單目標熱圖中心、size mask 鄰域、零物件全零 heatmap、單張多框明確拒絕、confidence threshold 可拒絕空場景。
- [ ] DM Spec → YOLO labels：完整保留每張所有 bbox/class；空標籤、未分類框、class ID 映射及 YOLO YAML 均正確。
- [ ] bbox round-trip 測試：DM xywh ↔ YOLO cxcywh；最大誤差設為明確容許值，並驗證輸出座標都在有效範圍。
- [ ] Group split 測試：相同 group 不跨 split、manifest 完整覆蓋、重複執行 deterministic、Test 不被拿來選 conf／模型。
- [ ] 雙架構訓練 CLI smoke test：每種架構少量 fixture、1 epoch 或 mock trainer；驗證 architecture route、輸出檔、metadata、失敗碼及各自 resume 行為。
- [ ] 依 repo 規範把持續性 pytest 加入 `tests/e2e/` 或適當單元測試，慢速／需下載權重／需 GPU 測試標記並不併入快速預設測試。

#### JavaScript／Blockly 推論測試

- [ ] Spatial Head mock interpreter：熱圖峰值/size map 解碼、threshold 邊界、全零 heatmap 空結果、非 224 原始 frame 尺寸座標映射、Float32 TFLite 輸出對照。
- [ ] YOLO wrapper mock model：無偵測、單框、多框、多類別、低信心過濾、座標正規化、不同 frame 比例、模型載入錯誤。
- [ ] Python codegen compile 測試：生成的兩種模型 init、predict、多物件迴圈含巢狀迴圈皆能 compile；無 Legacy decoder／架構選項。
- [ ] Block contract、toolbox、雙語 i18n、help、task type contract 及變異測試。
- [ ] line_following 回歸：在拆出獨立循線建模後，訓練模型、TFLite 推論、line parser output 不因移除共用 Legacy detector 或切換 object_detection architecture 而變化。（✅ 2026-11-09 已完成 `common/line_model.py` 獨立抽離；待補：1 epoch smoke test 與 TFLite 契約守門測試腳本）

#### 實機驗收

- [ ] 在乾淨 Windows Python 環境驗證 Spatial Head 所需 TensorFlow 安裝、訓練、Float32 TFLite 與推論；再驗 YOLO 選配依賴、首次權重取得及離線使用已下載權重。
- [ ] 用完整課堂計時演練 Spatial Head 快速路徑（拍照→框標→訓練→PC 推論）；目標總長 ≤50 分鐘，記錄每步時間與安裝預處理是否發生在課前。
- [ ] 以獨立 test 場景分別跑兩個架構，檢視 Spatial Head 漏檢／空場景誤報及 YOLO 多框定位與 FPS；記錄 PC CPU／GPU 型號、解析度、confidence／NMS 設定。
- [ ] 驗證 PC Serial 只傳選定 detection 的中心／控制值，MCU servo 行為正常；視窗關閉時釋放相機與 Serial 資源。
- [ ] 不做 MCU 模型燒錄驗收；若產品後續新增 MCU inference，另立計畫並先選定晶片、runtime、TFLite Micro 算子與記憶體門檻。

## 5. 建議正式異動範圍（施工前須依現況重新盤點）

| 區域 | 預期工作 | 注意事項 |
| :--- | :--- | :--- |
| `resources/train_templates/object_detection/` | 兩種 architecture 的 train／report 入口或共同 dispatcher | Legacy 入口與 Legacy-only template 移除；不把 prototype script 原樣複製成產品碼 |
| `resources/train_templates/common/` | 共用 DM Spec parser、Spatial target builder、YOLO staging converter | 確保 line_following 有獨立模型，不再依賴即將刪除的 detector model（✅ 2026-11-09 已完成：`common/line_model.py` 建立、`line_following_train.py` 改用 `build_line_model()`，Phase 3 刪除 `detector_model.py` 的前置障礙已清除） |
| `resources/dataset_manager/` | trainLocal architecture 參數／依賴檢查／進度及取消處理 | `TASK_SCRIPTS` route 與 Blockly `MODEL_ARCH` 對齊 |
| `ui/src/modules/ai_inference/` | architecture 欄位、Spatial decoder、YOLO wrapper、多物件積木 | 同一 output contract；不做 Legacy decoder 相容，符合 VSIX 凍結界線 |
| `config/python_modules.json`／依賴鎖檔 | TensorFlow Spatial Head 與可選 Ultralytics runtime 安裝／診斷 | Spatial 快速課程不應被 PyTorch 安裝拖慢；不靜默 pip install |
| `tests/e2e/`、`ui/src/modules/ai_inference/*.test.mjs` | 雙架構資料、推論、codegen、契約與 line_following 回歸 | 新守門需 mutation 驗證；完整訓練不併入快速測試 |
| `examples/AI_02_detector_pan_tilt/`、`docs/help/` | 快速 Spatial Head 課程與 YOLO 進階多框範例 | 全部內建 XML 更新新架構欄位；不保留 Legacy 範例 |
| `FILE_STRUCTURE.md`、`docs/system_spec.html`、`docs/dataset_types_matrix.md` | 更新產品架構與模板文件（若正式架構改變） | 本計畫不提前假設所有文件必須改，依最終設計同步 |

## 6. 目前已知風險與對策

| 風險 | 影響 | 對策／停止條件 |
| :--- | :--- | :--- |
| 連拍影格跨 train/val | 過度樂觀的 benchmark | 先取得 session/group split 的獨立 test；否則不得聲稱泛化成功 |
| COCO 預訓練與更高輸入解析度共同影響 | 無法歸因架構改善來源 | 分開跑解析度對照；產品決策比較完整方案，研究結論標清比較邊界 |
| 第三方授權及權重再散布 | 可能不能隨 Cocoya 發行 | G0 前審查；未完成不得包入應用或權重 |
| PyTorch／Ultralytics 依賴體積與 CPU 延遲 | 安裝時間／記憶體／低階 PC 效能 | 乾淨環境安裝及目標 PC benchmark 未過即不整合或改小模型／替代授權 |
| 雙架構輸出格式不同 | 解碼混用、model path 誤載 | metadata 明確標 `model_arch`；Spatial Keras/TFLite 和 YOLO `.pt` 各自 decoder，拒絕不匹配格式 |
| 無標註圖被跳過或未分類框污染 | 產生錯誤負樣本／class mapping | converter 嚴格驗證並報告，空標籤和 `class_id=-1` 分流 |
| Spatial Head 永遠取 argmax 造成空景假框 | 無物件時錯誤追蹤 | 加入負樣本 heatmap、confidence calibration 與 threshold；空場景測試未通過前不做課堂追蹤 demo |
| `objects[0]` 假設 | YOLO 使用者只能操作一個框 | 新增可巢狀多物件迴圈；Spatial 路徑明示單目標限制 |
| 移除共用 Legacy detector 影響循線 | line_following 訓練退化 | 在刪除前先拆出並測試 line_following 獨立模型建立路徑（✅ 2026-11-09 已完成獨立抽離 `common/line_model.py`） |
| 未發佈但內建 XML/模型假設舊欄位 | 範例載入或訓練失敗 | 全倉盤點並一次更新所有內建 XML／測試／文件；不新增舊格式相容層 |
| PC-only 與 MCU 模型能力混淆 | 教學誤導／部署失敗 | UI/help/範例標明模型在 PC 執行、MCU 僅收 Serial 控制資料 |

## 7. 本次 POC 產物與可重現資訊

- 獨立實驗腳本：`temp/scripts/yolo_ping_pong_poc.py`。
- Keras Spatial Head 獨立實驗腳本：`temp/scripts/keras_spatial_detector_poc.py`。
- 資料轉換／切分：`examples/AI_02_detector_pan_tilt/model/ping_pong_yolo_poc/data/`、`split_manifest.json`、`ping_pong.yaml`。
- Cocoya 同切分 baseline：`model/ping_pong_yolo_poc/cocoya_baseline/`；val IoU 0.076623。
- YOLO 訓練設定／結果：`model/ping_pong_yolo_poc/yolo/train/args.yaml`、`results.csv`、`weights/best.pt`、`weights/last.pt`。
- 綜合結果：`model/ping_pong_yolo_poc/comparison.json`。
- Keras Spatial Head v2 結果：`examples/AI_02_detector_pan_tilt/model/ping_pong_keras_poc_v2/comparison.json`；同一 232/57 切分 mean IoU 0.6556、IoU50 率 0.9298、訓練 168 秒、Float32 TFLite 5,273,656 bytes。
- 課堂方案解讀：目前 168 秒只量模型 training fit，不含拍照、人工標框、安裝與推論；完整 50 分鐘仍須 Phase 2/G6 計時驗證。
- 已知本機環境：Python 3.11.6、Ultralytics 8.3.228、PyTorch 2.1.1+cpu、CPU-only；訓練使用 YOLOv8n 預訓練權重與 640 輸入。
- 以上模型只屬研究 POC，不是正式產品支援承諾；結果不能取代 Phase 1 的跨場景測試。

## 8. 待使用者拍板

1. 已決策：**Spatial Head 與 YOLO 同時存在；棄用 Legacy；不做舊模型／XML runtime 相容**。所有未發佈內建範例隨架構升級一併更新。
2. 是否接受 Spatial Head 作為 50 分鐘課程的預設路徑，YOLO 作為進階路徑（訓練本身 POC 約 38.8 分鐘，完整課程不適合即席訓練）？
3. Cocoya 發行物是否允許 YOLO 選配依賴 Ultralytics／PyTorch？接受何種授權及權重取得方式？若不接受，是否仍保留 YOLO 教師／使用者自行安裝模式，或改以不隨產品發行的研究選項？
4. 第一版支援 CPU-only Windows 嗎？可接受的訓練耗時、模型大小、啟動耗時、即時推論 FPS 與最低硬體門檻是多少？
5. 是否接受本計畫 benchmark 驗收方式，並由使用者收集具獨立場景來源的 test 資料？

**可立即繼續資料品質、空場景標註、benchmark 與雙架構 UI/模型介面原型；YOLO 發行打包需先通過授權 Gate。Spatial Head 的 Legacy 清理前置是先抽離 line_following，再移除 Legacy detector。**
