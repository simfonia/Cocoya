# 物件偵測升級計畫：one-shot → 多尺度/anchor（YOLO/SSD 等級）

建立：2026-10-12  狀態：討論中（尚未動工）

## 背景與動機
現行偵測 = MobileNetV2 + GlobalAveragePooling + Dense(4)，one-shot 全域回歸。
實測（AI_02 ping_pong）：fine_tune=False 修好 BN 後，推論 val IoU 僅 0.06~0.11。
根因（見 log/work/2026-10-12.md）：
  1. GAP 抹除空間資訊 → 小球（224 輸入下 28×37px、2.4% 面積）定位不準
  2. 無多尺度、無 anchor → 小物件精度有架構天花板
  3. 單框假設 → 無法多物件

## 瓶頸量化（已量測）
- 球在 224×224 訓練輸入平均 28×37px，面積僅 2.4%
- MobileNetV2 下採樣到 7×7，球剩約 1 格再被 GAP 平均 → 位置資訊幾乎歸零

## 工程量盤點（相對現行改動）
| 層 | 現況 | 目標 | 量級 |
| :--- | :--- | :--- | :--- |
| 模型 | GAP+Dense(4) | 多尺度 head（FPN）+ anchor/anchor-free | 大 |
| 訓練 | MSE 單框 | 組合 loss（box+obj+cls）+ anchor/GT 匹配 | 最大 |
| 資料集 | 單 bbox | 多框 + 多類別 | 中 |
| 標註 UI | 已陣列多框 | 幾乎不改 | 小 |
| 匯出 | 單輸出 int8 | 多輸出量化驗證 | 中 |
| 推論 _ModelInference._detect | 單框 | decode + NMS 多框 | 中 |
| 推論積木 | objects[0] | 迴圈遍歷 objects | 小 |
| 守門測試 | 斷言單框 | 需更新 | 小 |

## 候選方向（待決策）
### 方向 A：PC-only 推論（放棄小板 MCU 跑模型）
- PC/手機跑 YOLO/SSD 級模型，Serial 只傳框座標給 MCU 驅動伺服
- 優：模型規模不受限、工程量最小、不推翻積木架構、風險低
- 缺：失去「單機離線」，需持續連 PC
- 適合：教學展示 + 尋標機場景

### 方向 B：現成 COCO lite0（零訓練）
- 優：零訓練、80 類通用
- 缺：不能自訂目標（自訂橘球偵測不到）、需接 NMS/解碼
- 定位：教學對照組

### 方向 C：自訓多尺度模型（原計畫）
- 自己寫 mini-YOLO/anchor head（符合教學透明定位）
- 量級最大，且 MCU 可行性未驗證（RP2040 恐跑不動）

## 前置驗證（任何方向動工前）
- [ ] MCU 可行性探針：若堅持 MCU 端跑模型，先燒最小 YOLO int8 到 S3 Sense/RP2040 量 FPS/記憶體；跑不動則直接走方向 A
- [ ] 確認部署目標：S3 Sense / RP2040 / PC-only

## 連帶項：循跡（line_following）評估
- line_following_train.py:44 直接重用 build_detector_model → 架構瓶頸相同
- 但線是大特徵（橫跨畫面），無「小物件」問題，GAP 傷害輕微；單線假設本就合理
- BN 凍結修復循線一併受惠；除非要多線或極精確端點，否則不必為避瓶頸升級

## 待討論決策點
1. 採方向 A / B / C？
2. 若 C：單尺度 or 多尺度 FPN？目標板？
3. 多框訓練：是否順帶讓 object_detection 支援多類別多框（標註 UI 已支援，訓練端要改）
