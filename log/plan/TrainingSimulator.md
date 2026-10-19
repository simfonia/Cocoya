# 訓練模擬器 V1 計畫 (TrainingSimulator.md)

**立項日期**：2026-10-17
**狀態**：✅ 已結案（2026-10-19 使用者實機驗收通過）
**範圍決策（使用者已定案，2026-10-18 修訂）**：
1. 獨立於 Cocoya 之外的單頁網頁（非 App modal），學生零安裝自學
2. 不做 i18n 機制；正體中文為主，重要術語中英並呈（用語對齊積木欄位）
3. **保留原「訓練結果」並存新增**：新增 `btn-training-simulator`（圖標 `line-chart-dual.png`），原 `openLatestTrainingReport` 鏈路**不刪除**（審核意見第 1 條：真實報告事後查看不可無入口）
4. 入口採方案 A：按鈕開本地檔（隨包發佈、離線可用）＋ 角落「線上最新版」連結；**V1 僅 Tauri 端**（VSIX 開發凍結＋`.vscodeignore` 排除 `docs/`，模擬器檔天然不在 VSIX 包內；VSIX 端以 capabilities 旗標隱藏入口，host handler 延期）
5. V1 只做自由模式 + 診斷提示；挑戰關卡（V2）、看圖問答（V3）後續
6. 檔名用 camelCase/snake（與 `ui/src` 慣例一致），不強制 kebab-case

---

## 1. 背景與目標

`py_ai_train_run` 是現行訓練唯一入口（產生 Python 程式碼執行），16 個參數的真實訓練
一輪耗時數分鐘到數小時，初學者「調參 → 看曲線」的試錯成本極高。

**目標**：以純前端參數化模型（方案 A）即時生成與 `*_training_history.json` 同構的
訓練曲線，讓使用者在不需真實資料/ TensorFlow 的情況下，練習「看到什麼曲線 → 調什麼參數」。

**非目標（V1 明確排除）**：
- 挑戰關卡、問答模式（V2/V3；引擎預留 `classifyCurveFeatures` 供復用）
- backbone / fine_tune 的真實效應模擬（欄位隱去或註明 V2）
- 5 種任務類型的曲線差異（V1 一律 image_classification 語意，頁面如實註明）
- 模擬器英文化、主題切換
- 線上版實際發佈（URL 留常數位）

## 2. 新檔案：`docs/teaching/py_ai_train_run/simulator/`

與 25 頁教學簡報同樹（簡報「學參數」→ 模擬器「練判讀」），未來 Moodle 打包一起走。

| 檔案 | 職責 |
|---|---|
| `simulator.html` | 主頁。`lang="zh-TW"`、無 i18n、**傳統 `<script>`（非 ES module）**——`file://` 雙擊開啟可用是硬性要求；**禁止 `fetch`/`XHR`，所有資料內聯或經 script 標籤載入**（`file://` 下 fetch 被擋） |
| `simulatorEngine.js` | 純函式引擎（無 DOM）：`generateCurves(params)` + `classifyCurveFeatures(history)` + 診斷建議文案。檔名用 camelCase（2026-10-18 決策：與 `ui/src` 慣例一致，不用 kebab-case） |
| `simulatorRenderer.js` | canvas 繪圖，對齊報告視覺契約（圖例固定左上，刻意異於報告 `loc='best'`，教學一致性優先）；`canvas` 加 `role="img"`＋文字摘要（無障礙） |
| `simulatorEngine.test.mjs` | 與引擎同目錄。vm harness 測試（沿用 `settingsHarness.mjs` 先例）；根 `package.json` 加 `test:simulator` 並接入 `test:unit`（否則 `ui/` 的 `src/**/*.test.mjs` 掃不到 `docs/`，掉出守門網） |

### 2.1 引擎（可測性生死線：純函式、無 DOM、seeded）

- `generateCurves(params)` → `{ loss[], val_loss[], accuracy[], val_accuracy[] }`
  與 `training_report.py::save_training_history` **同構**
- seeded PRNG（mulberry32）：同參數 + 同 seed ⇒ 完全同曲線（測試與 V2 公平性基礎）
- 數學骨架：
  - 主體指數衰減：`loss(t) = L∞ + (L₀ − L∞)·e^(−t/τ)`；`τ` 由 LR × 優化器速度係數
    （Adam 1.0 / RMSprop 0.8 / SGD 0.4）決定
  - 過擬合缺口：`gap(t) = g·max(0, 1 − e^(−(t−t_opt)/w))`，`val_loss = loss + gap`；
    `t_opt` 提早的條件：DNN 層多、dropout 低、無 augmentation
  - 雙源噪音：train ∝ 1/√batch（batch 小毛刺大）、val ∝ √(1/val_split)（驗證比小 val 抖）
  - LR 過大 → 震盪加劇 → 發散/NaN；SGD + 小 LR → 幾乎不動（新手陷阱必重現）
  - Accuracy 由 Loss 單調映射導出（兩面板講同一個故事，不得無故矛盾）
- `classifyCurveFeatures(history)` → `{ diverged, oscillating, uTurnEpoch, gapFinal,
  endSlope, trainNoise, valNoise, underfit }`——**一個引擎三處用**：
  V1 診斷提示、V2 挑戰裁判、V3 問答出題

### 2.2 九症狀真值表（診斷器必須全部抓到）

| # | 症狀 | 成因 | 建議處置 |
|---|---|---|---|
| S1 | loss 震盪加劇不收斂 | LR 偏大 | 降 LR |
| S2 | loss 噴飛/NaN | LR 極大 | 大幅降 LR |
| S3 | 兩線平坦還在緩降 | LR 過小/epochs 不足 | 加 LR 或 epochs |
| S4 | train 降、val 中段回揚（U 形） | 過擬合 | 開增強/加 dropout |
| S5 | train acc 高 val acc 低 | 過擬合 | 同上 |
| S6 | val 毛刺極大難辨趨勢 | val_split 太小 | 調高驗證比 |
| S7 | train 毛刺大 val 尚可 | batch 太小 | 調大 batch |
| S8 | 正則化後 train 變差但兩線貼近 | 正則化生效（**好事**） | 教學重點：別關掉 |
| S9 | SGD 收斂極慢 | SGD + 小 LR | 換 Adam 或調高 SGD LR |

### 2.3 Renderer 視覺契約（對齊 `training_report.py::plot_training_curves`）

- 上下雙面板共享 X 軸（Epoch **從 1 起算**）、上 Loss 下 Accuracy
- 訓練藍實線 / 驗證紅實線、線寬 2；粗體置中標題 `{名稱} - Training Curves`
- 淡格線（grid alpha 0.3 視覺感）、左上圖例、白底卡片、軸自動縮放
- DPR 高清 + resize 重繪；**不硬套 `ui/src/modules/plot/`**（serial 波形語意）

### 2.4 UI 版面（單頁不換頁）

```
┌─ 訓練模擬器 ─────── [模擬模式：曲線為教學用近似] ─ [✕] ─┐
│ ┌ 參數面板 ──────┐  ┌ 曲線圖（報告同款）────────────┐ │
│ │ LR/Epochs/Batch │  │  Loss 面板                    │ │
│ │ Dropout/ValSplit│  │  Accuracy 面板                │ │
│ │ 增強/優化器/DNN  │  │                              │ │
│ │ [↺ 回到預設值]  │  │                              │ │
│ └─────────────────┘  └──────────────────────────────┘ │
│ ┌ 診斷提示（顯示/隱藏開關）──────────────────────────┐ │
│ │ ⚠ 症狀 → 成因 → 建議處置                          │ │
│ └───────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

- 參數約束**鏡射積木**（`ai_inference_blocks.js`，已實測對照 2026-10-18）：
  | 參數 | 積木定義 | 模擬器 input |
  |---|---|---|
  | LR | `FieldNumber(0.001, 0.00001, 1, 0.00001)`（預設 0.001、min 1e-5、max 1、5 位小數） | 同值；S2 發散需 LR 極大（≈1 上限附近）、S9 需 SGD＋小 LR（≈1e-5 下限附近），兩端皆須可輸入 |
  | Epochs | `FieldNumber(20, 1, 1000)`（預設 20） | 同值 |
  | Batch | `FieldNumber(32, 1, 512)`（預設 32） | 同值 |
  | Dropout | `FieldNumber(0.2, 0.0, 0.9, 0.01)`（預設 0.2） | 同值；S8 前置條件 dropout≥0.3 或 augmentation=on（否則與 S3 欠擬合不可區分，見 §2.1 審核補記） |
  | ValSplit | `FieldNumber(0.2, 0.1, 0.5, 0.01)`（預設 0.2） | 同值 |
  | 優化器 | 下拉 Adam/SGD/RMSprop（值 `adam/sgd/rmsprop`） | 同三選；速度係數 Adam 1.0 / RMSprop 0.8 / SGD 0.4 |
  | DNN 層 | `FieldTextInput("128,64")` 文字欄 | 同文字欄（逗號分隔神經元數，空字串＝預設） |
  | backbone / fine_tune | 下拉 MobileNetV2/EfficientNetB0/ResNet50＋checkbox | **V1 隱去或註明 V2**（非目標，不模擬真實效應） |
- 術語中英並呈且**英文與積木欄位/help 文件一致**：學習率 Learning Rate、
  訓練輪數 Epochs、批次大小 Batch Size、驗證集比例 Validation Split、
  資料增強 Augmentation、優化器 Optimizer；圖例沿用報告英文
  （Training/Validation Loss/Accuracy）

### 2.5 測試（守住「獨立化 ≠ 失去守門」）

- vm 載入傳統 script 版引擎（`settingsHarness.mjs` 先例），`node --test` 執行：
  1. 固定 seed 快照比對（確定性）
  2. 9 症狀真值表：每症狀一組參數 → 診斷器必抓到
  3. 正常參數 → 無誤報（診斷器不可過寬——過寬比沒有守門更糟）
- **交付前變異測試**：刻意破壞引擎/診斷器確認測試變紅，再還原（`git status` 乾淨）

## 3. Cocoya 入口新增（並存，V1 僅 Tauri；VSIX 凍結）

原「訓練結果」保留；新增「訓練模擬器」下拉項。VSIX 端不新增 handler（開發凍結），
前端以 `supportsTrainingSimulator` 旗標控制顯示（Tauri `true`／VSIX `false`），
沿用 capabilities 能力分發慣例，不直接檢查 `isTauri`。

| 檔案 | 異動 |
|---|---|
| `ui/index.html` | AI 下拉新增 `btn-training-simulator`（圖標 `line-chart-dual.png`，原結果項保留，圖標仍為 `chart-line-data-01.png`） |
| `ui/src/ui/base.js` | 新按鈕 click 送 `openTrainingSimulator`；無該 capability 時隱藏按鈕 |
| `ui/src/bridge/base.js` | `_caps` 加 `supportsTrainingSimulator: false`（預設；雙橋鍵集合一致契約） |
| `ui/src/bridge/tauri.js` | capabilities 加 `supportsTrainingSimulator: true`；`ui/src/bridge/tauri/training.js` 加 `openTrainingSimulator` handler（`tauriInvoke('open_simulator')`，失敗時 alert 手動路徑）＋ `sendHandlers.js` 經 `...training` 自動收錄 |
| `ui/src/bridge/vsix.js` | capabilities 明確 `supportsTrainingSimulator: false`（VSIX 凍結：不新增 host handler，handler 延期至解凍） |
| Rust `training.rs` | 新增極薄 `open_simulator` command：`get_simulator_path(handle)` 解析（dev：專案根 `docs/teaching/py_ai_train_run/simulator/simulator.html`；prod：`Resource/docs/teaching/...`，複用 `strip_extended_prefix`）→ `open::that`。**不復用 `open_report`**（語意不同：報告開啟 vs 教學頁開啟；且 `open_report` 的相對路徑解析依賴專案錨定，模擬器是固定資源路徑）。註冊 `lib.rs`＋`permissions/commands.toml` |
| `src-tauri/tauri.conf.json` | resources 加 `"../docs/teaching/py_ai_train_run/simulator": "docs/teaching/py_ai_train_run/simulator"`（已查證：現行映射無 `docs/teaching`，`utils.rs::get_resource_path` 硬編碼 `resources/` 前綴覆蓋不了，故需專用 `get_simulator_path`） |
| `ui/src/zh-hant.js` / `en.js` | 新增 `TLB_AI_TRAINING_SIMULATOR`（「訓練模擬器」/「Training Simulator」）；原 `TLB_AI_TRAINING_RESULT` **保留**（並存） |
| `docs/backend_api_manifest.md` | SSOT 加 `open_simulator` 一行 |
| 線上最新版連結 | URL 留常數位（V1 不發佈；按鈕顯示「即將推出」置灰，非死連結） |

## 4. ~~刪除清單~~（2026-10-18 決策：並存，不刪除）

原 §4 刪除 `openLatestTrainingReport` 鏈路的計畫**取消**。無刪除項。
（`MSG_NO_TRAINING_RESULT` 等鍵保留；`command_registration.rs` 無需變動。）

## 5. 實作順序

1. 引擎 + 診斷器 + vm 測試（含變異測試；S8 前置條件、S4/S5 閾值正交先定案）
2. renderer（對齊報告視覺，圖例左上／DPR／resize）
3. `simulator.html` UI 整合（含診斷開關預設顯示、線上版置灰常數位）
4. Tauri 入口新增（`open_simulator`＋`get_simulator_path`＋resources 映射＋capabilities 旗標＋i18n 鍵＋manifest）
5. 全套驗證 + 文件（`#log`：工作日誌、`FILE_STRUCTURE.md`、`log/todo.md`）

## 6. 驗證與守門

1. `node --check` 全部新 JS；vm harness `node --test` 全綠（含變異測試自證）
2. `npx vite build`（ui/）；`npm run test:fast` + `npm run test:ui`（含 capabilities 雙橋鍵一致守門）
3. `cargo check` + `npm run test:rust`（`command_registration.rs` 驗新增 `open_simulator` 後一致）
4. `npm run lint:ui`（`docs/*.js` 不在掃描範圍，引擎檔需手寫風格自律）；`npm run eol:fix` 收尾（含 `docs/teaching`）
5. 實機：Tauri dev 按鈕開模擬器（VSIX 端按鈕隱藏）；`file://` 雙擊可用；調參即時重畫；9 症狀各驗一次診斷提示

## 7. 誠實的能力邊界（頁面須如實標示）

- 模擬 ≠ 真實訓練：backbone/fine_tune/class weight/LR 排程不模擬
- V1 全任務類型共用 image_classification 曲線語意
- 標語「模擬模式：曲線為教學用近似」常駐

## 8. 關鍵風險

| 風險 | 因應 |
|---|---|
| `file://` 下 ES Modules 被 CORS 擋／`fetch` 被擋 | 傳統 `<script>`，不用 module；**禁 `fetch`/`XHR`** |
| Tauri resources 無 `docs/teaching` 映射 | 新增映射＋專用 `get_simulator_path`（§3 已定案，非 `utils.rs` 現例） |
| 獨立目錄脫離 `npm test` 守門網 | 根 `package.json` 加 `test:simulator` 並接入 `test:unit`（§2 表格已定） |
| 參數約束與積木漂移 | §2.4 對照表已落地（2026-10-18 實測）；掃描型比對測試列為可選（V1 手動表先行） |
| S4/S5、S8 診斷器不可區分 | S8 設參數前置條件（dropout≥0.3 或 augmentation=on）；S4 判 `uTurnEpoch`、S5 判 `gapFinal`，閾值正交；閾值常數與生成器同檔 |
| 簡報建置腳本漏打包模擬器 | 查 `build/`（`pack_single.py`／`incremental.py`）是否需納入 `simulator/`；Moodle 包一起走 |

