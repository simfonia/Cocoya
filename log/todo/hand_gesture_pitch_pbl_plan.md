# 手勢分類控制 πCar 音高 PBL 開發計畫

> 建立日期：2026-06-25
> 依據 Phase 5 MVP 驗證結果與使用者討論制定

---

## 📋 開發順序（四階段）

### Phase 1: 訓練後端選擇 UI（進行中）
**目標**：讓使用者可選擇本地 PC 或 DGX 遠端訓練

#### 1.1 對話框 UI 設計
- 位置：工具列按鈕「🚀 訓練模型」
- 規格：
  ```
  ┌─────────────────────────────────┐
  │ 訓練模型                         │
  ├─────────────────────────────────┤
  │ 專案名稱: [手勢分類_20240624]     │
  │ 任務類型: [圖像分類 (classifier)] │
  │                                 │
  │ 訓練後端:                       │
  │   ○ 本地 PC (CPU/GPU)           │
  │   ○ DGX 遠端 (需設定 SSH)       │
  │                                 │
  │ [取消]  [開始訓練]               │
  └─────────────────────────────────┘
  ```

#### 1.2 專案設定檔持久化
- 在 `project_config.json` 加入 `training_backend` 欄位
- 記住使用者偏好，避免重複選擇

#### 1.3 Sidecar 指令擴充
- 新增 `trainLocal` 指令（本地訓練）
- 保留 `startTraining` 指令（DGX 訓練）
- 統一入口：`startTraining(backend, ...)`

---

### Phase 2: 本地訓練功能
**目標**：在本地 PC 執行訓練（不依賴 DGX）

#### 2.1 訓練腳本
- 參考 `mvp_hand_gesture/02_train_local.py`
- 支援命令列參數：`--epochs`, `--batch_size`, `--lr`
- 輸出：`gesture_model.keras` + `gesture_model.tflite` + `labels.txt`

#### 2.2 Sidecar 實作
- `train_local(project_name, task_type, hyperparams)`
- 執行本地 Python 腳本
- 回傳訓練結果與模型路徑

#### 2.3 UI 進度顯示
- 訓練過程中的 Epoch 進度條
- 即時 loss/accuracy 曲線（可選）

---

### Phase 3: 積木模組開發
**目標**：建立 `ai_inference/classifier/` 積木

#### 3.1 模組結構
```
ui/src/modules/ai_inference/classifier/
├── classifier_blocks.js      # 積木定義
├── classifier_generators.js  # Python 產生器
├── toolbox.xml               # Toolbox 配置
└── i18n/
    ├── zh-hant.js            # 正體中文語系
    └── en.js                 # 英文語系
```

#### 3.2 核心積木（3 個）
1. **初始化積木** `py_ai_classifier_init`
   - 載入 TFLite 模型 + labels
   - 參數：模型路徑、labels 路徑、信心度閾值
   - 限制：必須放在「全域定義區」

2. **推論積木** `py_ai_classifier_predict`
   - 對影像執行推論
   - 輸入：FRAME (影像), MODEL (模型變數)
   - 輸出：class_id, confidence

3. **取得結果積木** `py_ai_classifier_get_label`
   - 從推論結果取得類別名稱
   - 輸入：RESULTS (推論結果變數)
   - 輸出：String (類別名稱)

#### 3.3 Toolbox 分類
```
AI 推論 (ai_inference)
├── 圖像分類 (classifier)
│   ├── [初始化] 載入模型
│   ├── [推論] 執行分類
│   └── [結果] 取得標籤
```

---

### Phase 4: DGX 訓練整合
**目標**：恢復並優化 DGX 遠端訓練流程

#### 4.1 恢復現有流程
- 上傳資料集到 DGX（SFTP）
- Docker 容器訓練（NGC PyTorch 容器）
- 下載模型到本地

#### 4.2 與 UI 整合
- 對話框選擇 DGX 後，彈出 SSH 設定對話框
- 訓練完成後自動下載模型

---

## 🔧 技術規範（必須遵守）

### 產生器開發
1. **4 空白基準縮排**：所有靜態 Python 程式碼使用 4 spaces
2. **動態縮排**：使用 `generator.INDENT` 而非硬編碼
3. **雙後端支援**：tflite_runtime + tensorflow.lite
4. **型別偵測**：自動處理 float32/uint8
5. **labels 載入**：從 labels.txt 讀取，不寫死
6. **f-string 規範**：複雜組合使用 `f"""..."""`

### 模組架構
1. **SSOT 原則**：所有程式碼在 `ui/src/modules/`
2. **i18n 分散式**：模組語系檔獨立
3. **Toolbox XML**：使用 `<sep>` 分隔功能群組
4. **命名規範**：`[pure_id]_blocks.js` + `[pure_id]_generators.js`

### 多視窗完整性
1. **非同步對話框**：使用 Bridge 機制
2. **原子化狀態同步**：訓練狀態與後端同步
3. **路徑處理**：使用正斜線 `/`，由 Bridge 適配

---

## 📊 開發時程估計

| Phase | 內容 | 估計工時 | 依賴 |
|-------|------|---------|------|
| 1 | 訓練後端 UI | 2-3 小時 | 無 |
| 2 | 本地訓練功能 | 3-4 小時 | Phase 1 |
| 3 | 積木模組 | 4-6 小時 | Phase 2 |
| 4 | DGX 訓練整合 | 2-3 小時 | Phase 1, 3 |

**總計**：11-16 小時

---

## 🎯 下一步行動

1. **立即開始**：Phase 1 - 訓練後端選擇 UI
2. **參考檔案**：
   - `ui/src/modules/ai_hand/` - 模組結構範例
   - `ui/src/ui/dialogs.js` - 對話框實作
   - `docs/mvp_development_guide.md` - 開發規範
   - `docs/system_spec.html` - 系統規格

---

## 📝 備註

- 本地訓練功能可讓沒有 DGX 的使用者也能體驗完整流程
- 積木設計需考慮未來擴充 detector/line_follower/table
- 訓練後端選擇機制應保持彈性，未來可加入雲端 API 等選項