# 循線模型升級與推論色彩修復施工計畫 (Spatial Feature Head)

建立：2026-11-12  狀態：**已完工 ✅**（通過單元測試與端到端煙霧測試）

---

## 1. 背景與實測診斷

### 1.1 現況與效能基準
- 循線資料集（`AI_06_line_tracker`）樣本數擴充至 1000 張。
- 實測訓練耗時：正常筆電環境下，1000 張圖 40 epochs 訓練耗時約 **10 分鐘**（符合課堂教學可接受範圍）。

### 1.2 診斷發現之核心缺陷
1. **架構缺陷（均值塌陷 Mean Collapse）**：
   - 既有 `common/line_model.py` 沿用分類架構，使用 `GlobalAveragePooling2D` (GAP) 將 MobileNetV2 的 $7\times 7\times 1280$ 特徵圖壓成純量向量，抹殺全部空間網格位置資訊。
   - 在 MSE 損失下，模型退化為輸出全域均值（$\hat{y} \to \mathbb{E}[y]$，真值均值 $[0.484, 1.0, 0.507, 0.278]$）。
   - 導致推論時箭頭永遠死板卡在中央，喪失轉向指引能力。
2. **色彩空間不一致（Color Space Inconsistency）**：
   - 訓練端 `tf.io.decode_image` 產生 RGB 格式（值域 $[0, 1]$）。
   - 推論端 `ai_inference_generators.js` 的 `_preprocess` 接收 OpenCV `VideoCapture` 的 BGR frame，未做 `cvtColor(BGR2RGB)`。
   - 灰階/黑白線條雖影響有限，但對於彩色軌道、背景反光、不同光源時會造成特徵提取嚴重失真。

---

## 2. 施工方案與不變契約

### 2.1 外部契約不變（Zero Breaking Changes）
- **輸入契約**：維持 $224\times 224\times 3$，正規化 $[0, 1]$。
- **輸出契約**：維持 4 個值 $[x_1, y_1, x_2, y_2]$，範圍 $[0, 1]$，依舊為歸一化比例座標（起點在車頭底部、終點在前方）。
- **推論積木與 XML 零改動**：`02_PC_inference.xml`、Blockly 解析積木、MCU Serial 通訊協定均不需任何變更。

### 2.2 核心改動內容
1. **推論前處理修正 (`ui/src/modules/ai_inference/ai_inference_generators.js`)**：
   - 在 `_preprocess(self, frame)` 中加入：
     ```python
     rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
     ```
   - 確保所有模型推論與訓練端輸入色彩空間完全對齊（RGB）。
2. **模型架構升級 (`resources/train_templates/common/line_model.py`)**：
   - 移除 `GlobalAveragePooling2D()`。
   - 採用 **Spatial Feature Head**：
     - 保留特徵圖空間網格：以 $1\times 1$ Conv2D (64 filters, ReLU) 降維。
     - 銜接 `Flatten()`，保留空間網格對應的 Dense 權重。
     - 後接 `Dense(128, ReLU)` + `Dropout(0.2)` + `Dense(4, sigmoid)`。

---

## 3. 施工步驟與驗收

- [x] Step 1：完成計畫與架構設計。
- [x] Step 2：修改 `ui/src/modules/ai_inference/ai_inference_generators.js`，修復推論端 BGR 轉 RGB。
- [x] Step 3：修改 `resources/train_templates/common/line_model.py`，實現 Spatial Feature Head。
- [x] Step 4：進行 Python 前向傳播與 TFLite 匯出契約驗證（形狀、輸出範圍、權重載入）。
- [x] Step 5：執行 `npm run eol:fix` 與程式碼完整性檢查。
