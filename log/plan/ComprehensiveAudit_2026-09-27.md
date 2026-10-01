# Cocoya 全面檢查計畫 (Comprehensive Audit Plan)

> ⚠️ **2026-09-30 更正（實作時發現）**：本檔 §1 的 P0-1／P0-2 與 §9 的 T2 已完成，實作過程中發現以下偏差：
> 1. **P0-1 的「刪除 `COLOUR_SPIKE_SENSOR`」建議是錯的** —— 該鍵被 `spike_blocks.js:20` 與 toolbox.xml 的三個 category 使用，刪掉會讓整個 SPIKE 主分類無色。
> 2. **P0-1 有對稱缺陷**：不只英文版缺 4 個 `COLOUR_SPIKE_SENSOR_*`，**中文版也缺無後綴的 `COLOUR_SPIKE_SENSOR`** → 中文版 SPIKE 主分類同樣無色。
> 3. **P0-2 的按鈕根本不存在**：`index.html` 沒有 `btn-setup-stable-mcu`，`base.js:484` 的綁定是 no-op。補了 i18n 鍵但功能未上架（待決策）。
> 4. **審查未涵蓋的 5 個 i18n 缺漏**：`PY_COLON`／`PY_EQUAL`（兩語系皆缺，積木欄位顯示 undefined）、`AI_DRAW_ANGLE_ARC_TOOLTIP`（en 缺）、`CAR_HAND_BOTH`（en 缺）、`HW_PIN_SHADOW_TOOLTIP`（兩語系皆缺）。
> 5. **§9.1 的量測數據需修正**：測試檔 32 → **34** 個、4,626 → **3,324** 行、e2e 腳本 8 → **4** 支。
> 6. **§9.4 T3 所述的 `temp_scripts/unused_export_scan.cjs` 並不存在**，實際存在的是 `temp_scripts/parity_check.mjs`（DM i18n parity）。
> 7. **§9 遺漏了最關鍵的發現**：全量測試 5.7 秒中有 5.1 秒是空轉（`statusMessage.test.js` 未清除計時器吊住 event loop），修正後降至 1.1 秒。
> 詳見 `log/work/2026-09-30.md`。

> 產出：2026-09-27（#task[cocoya 全面檢查]）
> 性質：**只寫計畫，本檔產出過程未修改任何程式碼**。後續實作需另開任務並遵守 AGENTS.md 備份與驗證規範。
> 檢查範圍：全專案（`ui/src`、`src`(VSIX)、`src-tauri`、`resources`、`docs`、`examples`）；Dataset Manager 限 **分類(image) / 偵測(object_detection) / 循跡(line_following) / table** 四類型。
> 特別關注：**i18n（zh-hant / en）與 3 個主題（cocoya_light / cocoya_dark / cocoya_candy）**。
> 程式碼規模現況（實測）：`ui/src`+`src`+`src-tauri/src`+`resources` 共 242 個 js/mjs/ts/rs/py、39,728 行。

---

## 0. 摘要（Severity 分級）

| 等級 | 議題數 | 代表項 |
|---|---|---|
| **Stage 0 TDD 守門（最高優先）** | 8 | 194 個測試 0 個被 `npm test` 執行；契約測試只覆蓋 `core/`；fake DOM 重複 6 處 |
| **P0 功能缺陷** | 2 | 英文版 SPIKE 感測器積木顏色鍵缺漏；中文版 Stable Mode 文案缺鍵 |
| **P1 SSOT 違反 / 型別邏輯漂移** | 4 | DM 影像系類型判斷三處硬編碼未走 `typePolicy`；`--dsm-*` 深色值雙份 SSOT |
| **P1 安全** | 2 | sidecar 頂部自動 `pip install paramiko`；Rust 15 處 `Command::new` 未列入白名單審查 |
| **P2 上帝檔 / 可維護性** | 5 | `tauri.js` 93KB、`ui_layout.js` 80KB、`dataset_sidecar.py` 1138 行 |
| **P2 死碼 / 冗餘** | 4 | `ui_layout.js` 純委派薄包裝 ~20 處；`ui_components.js` 與 `ui/panels.js` 職責重疊 |
| **P2 硬編碼** | 3 | `dataset_manager.css` 144 個 hex vs 176 個 `var()`；主動 `getLabelColor` HSL 生成色 |
| **P3 工程流程** | 3 | `node --test` 未接 npm script；repo 根 3 個 `.vsix` 與 `nul` 等殘留 |

---

## 1. P0：功能缺陷（建議優先修，風險低、影響明確）

### P0-1 SPIKE 感測器積木在**英文版**無顏色（已驗證）
- 證據：
  - `ui/src/modules/spike/spike_blocks.js` 使用 `Blockly.Msg["COLOUR_SPIKE_SENSOR_COLOR"|"_DISTANCE"|"_FORCE"|"_IMU"]`（4 鍵）。
  - `ui/src/zh-hant.js:49-52` 有這 4 鍵；`ui/src/en.js:43` **只有** `COLOUR_SPIKE_SENSOR`（無後綴，`spike_blocks.js` 未使用）。
  - 結果：切英文時 4 個感測器分類 `colour` 為 `undefined` → Blockly 拋錯或積木無色。
- 計畫：
  1. `en.js` 補上 4 鍵（色碼屬設計值非文案，兩語系同值）。
  2. 刪除 `en.js` 無人使用的 `COLOUR_SPIKE_SENSOR`（或確認是否有分類使用）。
  3. **新增常駐守門**：i18n parity 檢查納入 `node --test`（見 P3-1），`COLOUR_*` 額外要求「兩語系鍵集合完全相同且都有對應 block 使用」。
- 驗收：`cd ui; node --test` 全綠；英文介面 SPIKE 感測器分類有色。

### P0-2 `ui/src/zh-hant.js` 缺 Stable Mode 相關鍵（已驗證）
- 證據：`en.js` 有 `TLB_SETTINGS_SERIAL_UPLOAD`(L97)、`TLB_SETTINGS_SETUP_STABLE`(L101)、`MSG_SETUP_STABLE_CONFIRM`(L228)；`zh-hant.js` **全無**；`ui/src/ui/base.js:492` 有使用。
- 影響：中文介面該處 fallback 到英文或空字串。
- 計畫：zh-hant 補 3 鍵（翻譯 `MSG_SETUP_STABLE_CONFIRM` 時保留換行語意）。
- 待確認（實作前需查）：`base.js:492` 實際取用哪一鍵，避免補了沒接上。

### P0-3（次要）zh-hant 獨有 6 鍵
- `BKY_DELETE_VARIABLE`、`BKY_DELETE_VARIABLE_CONFIRMATION`、`BKY_NEW_VARIABLE`、`BKY_RENAME_VARIABLE`、`BKY_RENAME_VARIABLE_TITLE`、`BKY_VARIABLE_ALREADY_EXISTS`。
- 這 6 鍵為 Blockly 內建鍵，可能由 Blockly 本體提供 → **先確認是否真缺**；若 Blockly 已提供則不動，改在 parity 腳本設白名單（避免假陽性噪音）。

---

## 2. P1：SSOT 違反與型別邏輯漂移

### P1-1 DM 影像系類型判斷硬編碼三處以上，未走 `core/typePolicy.js`（已驗證）
- `ui/src/modules/dataset_manager/ui_layout.js:226 / 880 / 956`：
  `const isImage = projectType === 'image' || projectType === 'object_detection' || projectType === 'line_following';`
- `ui/src/modules/dataset_manager/ui_components.js`（約 L41）：同樣的三類型串接。
- 違反 AGENTS.md「typePolicy 為類型判斷 SSOT」與 R3 收斂目標（`core/typePolicy.js` 已有 `isImageType()`）。
- 計畫：全數改為 `isImageType(projectType)`；`spec.js` 內 `IMAGE_TYPES` / `PROJECT_TYPES` 集合需**保留單一來源**（建議 `typePolicy` 匯出、`spec.js` import）。
- 驗收：`grep "'object_detection'" ui/src/modules/dataset_manager` 僅剩 `typePolicy.js`（與 `spec.js` 匯入處）；既有 24 個 `.test.mjs` 全綠。

### P1-2 `ui_components.js` 內另有單類型分支
- 約 L41 附近 `countHeader = projectType === 'object_detection'` → 改用 `needsAnnotationCheck()` / `isClassificationType()`，並補 `typePolicy.test.mjs` 斷言。

### P1-3 `--dsm-*` 深色值雙份 SSOT（延續 COCOYA_STATE §6 已知債）
- `dataset_manager.css` 實測：**144 個 hex**、176 個 `var()`；高頻硬編碼 `#4CAF50`(7)、`#eee`(7)、`#333333`(6)、`#2d2d2d`(6)、`#ff8fb3`(5)、`#1e1e1e`(5)、`#3a2b32`(3)、`#4a2a35`(3)。
- 該批值明顯是 `cocoya_dark` 的 deep 值，與 `cocoya_dark.js` 的 cssVars 各持一份 → 主題切換殘留風險（`vscode-dark` CSS 覆寫 vs 主題 cssVars 雙來源）。
- 計畫：
  1. 產出 hex→token 對照表，逐條判定「設計常數（可留）」或「主題值（改 var()）」。
  2. 優先處理高頻值（`#4CAF50` 成功色、`#2d2d2d`/`#1e1e1e` 面板底、`#ff8fb3` 品牌 soft）。
  3. 若需新增 token，三個主題檔（light/dark/candy）**必須同步補齊**（目前三檔 cssVars 各 46 鍵、集合一致，維持此不變式）。
- 風險：DM 視覺回歸高 → 需三主題目視驗收（可與既有三主題目視 backlog 合併執行）。

### P1-4 `style.css` 硬編碼密度偏高
- 實測：**242 個 hex**、僅 51 個 `var()`。全站（非僅 DM）主題化程度偏低。
- 計畫：先量化分類（工具列／積木區／DM／dialog），挑「非 DM 且非 Blockly 內部」區塊做 token 化；分 2~3 批，不追求一次到位。

---

## 3. P1：安全

### P1-5 `dataset_sidecar.py` 匯入時自動安裝套件（已驗證，L37-40）
```python
subprocess.check_call([sys.executable, "-m", "pip", "install", "paramiko"], **_POPEN)
```
- 風險：由 IDE/桌面 app 在未告知使用者下修改全域 Python 環境；離線環境失敗；可能觸及權限提升。
- 計畫：
  1. 改為「缺 paramiko 時回報明確錯誤碼」（比照既有 `FEATURE_MEDIAPIPE_MISSING` 降級路徑），由前端 i18n 顯示安裝指引。
  2. 若堅持自動安裝，需加上「僅在使用者明確同意時」的開關（沿用設定對話框既有偏好儲存），並把 pip 目標指向 venv。
- 對齊 AGENTS.md「錯誤碼後端定義、文案前端 i18n」鐵律。

### P1-6 Rust `Command::new` 15 處未見集中白名單
- 分佈：`app.rs` 3、`dataset.rs` 2、`mcu.rs` 5、`python.rs` 5。
- 計畫（審查，非立即改動）：
  1. 逐條確認是否使用 shell 字串拼接（本輪掃描未見 `cmd /C`、`sh -c`，初步判定安全，但需人工逐條複核）。
  2. 抽查 `mcu.rs` 對 `pythonPath` / `serialPort` 等**使用者輸入**是否以 argv 陣列傳入（若是則 OK）。
  3. 產出審查表附於本計畫（實作階段填寫）。

### P1-7 Python 產碼注入與子進程編碼鐵律複查
- AGENTS.md 要求四者全帶（產生器 Popen `encoding`、Host env `PYTHONIOENCODING/PYTHONUTF8`、sidecar 內部 Popen `encoding`、腳本 `reconfigure`）。
- 現況：`dataset_sidecar.py` 內 Popen 3 處（L40 / L967 / L1099），需確認 `encoding/errors` 齊備（**待驗證**）。
- 計畫：實作階段以 grep 清單逐條核對，缺補齊。

---

## 4. P2：上帝檔與模組切分

### P2-1 `ui/src/bridge/tauri.js` 93KB
- 內含 invoke 呼叫 70 處，混合能力查詢／事件訂閱／檔案與專案錨定／serial／訓練／dataset 上傳鏈／上傳分片。
- 計畫切分（維持 `BridgeTauri extends BaseBridge` 對外 API 不變，僅內部拆檔）：
  - `bridge/tauri/events.js`（`_setupTauriListeners` 與事件 handler 表）
  - `bridge/tauri/dataset.js`（dataset 上傳鏈 + 分片 + correlation）
  - `bridge/tauri/serial.js`
  - `bridge/tauri/files.js`（專案錨定、開檔、儲存、recovering）
  - 保留 `tauri.js` 為薄 façade + `capabilities` getter。
- 風險：多視窗 `emit_to` 對應的 listener 綁定極易在搬移時走位 → 每搬一個模組跑一次雙視窗實機。

### P2-2 `ui/src/modules/dataset_manager/ui_layout.js` 80.5KB
- 目前 50+ 函式，其中 **約 20 個已是純委派薄包裝**（例：`enterClassificationReviewMode` L668、`loadAnnotationImage` L701、`updateAnnotationProgress` L729、`renderClassificationControls` L761、`renderAnnotationControls` L782、`renderAnnotationListUI` L789）。
- 計畫：
  1. 階段一：刪除純委派包裝，呼叫端直接取 controller 方法（先確認外部引用點，見 P3-3）。
  2. 階段二：剩餘協調邏輯（匯入/匯出/落盤/名稱對帳/統計/生命週期）搬進 `ui/orchestrator/*.js`，`ui_layout.js` 退為組裝層。
  3. **約束**：不得破壞 AGENTS.md「`#dataset-structure-content` 嚴禁覆寫 innerHTML」契約；`renderStructurePanel()` / `renderStatsPanels()` / `refreshThumbnailBadges()` 對外介面保持不變。

### P2-3 `resources/dataset_manager/dataset_sidecar.py` 73KB / 1,138 行 / 僅 19 個 `def`
- 行數遠大於函式數 → 大量**字串內嵌的 Python 程式碼**（L939、L1060 附近有 `import subprocess, sys, threading...` 內嵌段）與遠端訓練/Docker 指令。
- 計畫：
  1. 內嵌腳本字串抽為 `resources/dataset_manager/scripts/*.py` 實體檔（可單獨測試/格式化）。
  2. `CameraService`（`_monitor_camera`）、遠端訓練（`do_upload`/`do_remote_train`/`do_diagnose`）、TFLite 轉換（`_pick`）各自成模組，主檔只留 `run()` 迴圈與訊息協定。
  3. 抽出後必須維持「stdout 單一 JSON 回應」契約不變。

### P2-4 `dataset_manager.css` 41.6KB
- 與 P1-3 合併處理：先 token 化，再考慮依「entry / workspace / annotation / sampler / modal」分檔（`@import` 或 `index.html` 依序引入）。

### P2-5 Rust 檔案偏大
- `mcu.rs` 38.2KB、`file.rs` 35.6KB、`python.rs` 24.1KB、`dataset.rs` 21.4KB。
- 計畫：`mcu.rs` 依職能拆 `mcu/serial.rs`、`mcu/board.rs`（板子偵測）、`mcu/monitor.rs`（session／焦點交接）；`file.rs` 拆 `file/ops.rs`（存/開/backup/recovering）與 `file/anchor.rs`。**先不動**，待 tauri-codegen（typed invoke）議題一併處理較划算。

---

## 5. P2：死碼與冗餘

### P2-6 `ui_components.js` 與 `ui/panels.js` / `ui/thumbnails.js` 職責重疊 ＋ capabilities 死欄位
- `ui_components.js`（20.8KB）仍持有 `renderAnnotationListUI` 類的空狀態與縮圖相關實作（L19、L78 的 `dataset-empty-state` innerHTML 拼字串），而新架構已由 `ui/panels.js`（Presenter）與 `ui/thumbnails.js`（grid scroll）承接。
- 計畫：逐條比對呼叫端，移除 `ui_components.js` 中已無引用的呈現函式；保留純樣式/工具類（`getLabelColor` 等）。
- **注意**：L19/L78 為字串拼接 innerHTML（非樣板化），需一併改走 `core/html.js` 的 escape 慣例（與 R4 成果一致）。

#### P2-6-b `capabilities` 死欄位／缺漏欄位（2026-10-01 併入，Batch 0 浮現）
> 兩者都是 `bridge.capabilities` 的**欄位集合不一致**問題，同屬 SSOT 違反，一併清理。

**(1) `supportsStableMode` — 死欄位，應刪**
- 背景：Stable Mode 死鏈已於 2026-09-30 **整條移除**（8 檔／9 處，見 `todo.md` Batch 0 記錄），但三處仍宣告此欄位：`base.js:21`（`false`）、`tauri.js:29`（`false`）、`vsix.js:19`（`true`）。
- 實測：**全專案無任何讀取點**（僅 `ui/src/bridge/tauri_anchor.test.mjs` 的欄位集合守門列出）。
- 處置：刪除三處宣告 ＋ 從 `tauri_anchor.test.mjs` 的欄位集合清單移除。
- ⚠️ 注意 `vsix.js` 目前是 `true`：這是 Stable Mode 移除前的殘值，**若誤以為 VSIX 還有 Stable Mode 功能，會誤刪仍有用途的程式碼** —— 實作前須再確認一次全專案無讀取點。

**(2) `isRemoteConnected` — 缺漏欄位，應補 Tauri getter**
- 背景：`base.js:25` 有宣告，但 `tauri.js` 的 `capabilities` getter **未回傳** → Tauri 環境下該欄位恆為 `undefined`。
- **修正先前判斷（2026-10-01 Batch 0 的錯誤）**：Batch 0 §14.5 曾記「全專案無讀取點、現況無影響」。重新檢索後確認**這是錯的** —— `src/cocoyaManager.ts:397` **有實際生產者**：
  ```typescript
  const capabilities = {
      isRemoteAware: true,
      isRemoteConnected: vscode.env.remoteName !== undefined,   // ← VSIX 遠端偵測的真實來源
      remoteName: vscode.env.remoteName,
      ...
  };
  ```
  該物件經 `manifestData` 訊息 → `controller.js:29` 的 `bridge.updateCapabilities(m.capabilities)` 合併進 `_caps`，故 **VSIX 路徑是活的**（遠端 SSH/WSL 開發時 `isRemoteConnected` 為 `true`）。
- 處置：在 `tauri.js` 的 getter 補 `isRemoteConnected: false`（Tauri 目前沒有 VS Code remote 概念，故固定 `false` 而非省略），並補進 `tauri_anchor.test.mjs` 的欄位集合清單。
- **為何不在 getter 中乾脆不列**：兩橋的 `capabilities` 契約應有**同一組鍵**，否則前端「Tauri vs VSIX 走不同分支」會在欄位缺失時靜默失效。`isRemoteAware` 已是此設計的實例（兩邊都列，值不同）。
- 附帶：`remoteName` 亦只在 VSIX manifest 出現、Tauri 未回傳；本次**不處理**（前端無讀取點），待有使用需求再說。

### P2-7 `getLabelColor` 以 HSL 程式生成標籤色（主動硬編碼）
- `ui_components.js`：`h = (hash*137.508)%360; s=65+(hash%20); l=40+(hash%15)` → 同一標籤在三主題下**永遠同色**，與主題 token 系統脫鉤；且無對比保證。
- 計畫：改為從主題 token 取色（例：依 label index 取 `--dsm-series-1..8`），三主題各自定義序列；維持「同標籤同色」語意。
- 風險：縮圖徽章／標籤管理器視覺變動，需三主題目視。

### P2-8 `ui_layout.js` 內 `sanitizeName` / `setNameWarning` 與 `core/projectNaming.js` 職能鄰近
- 待確認：是否有可合併的命名規則邏輯（實作階段評估，勿貿然合併）。

### P2-9 repo 根目錄殘留物
- `cocoya-0.7.0.vsix` / `0.7.7` / `0.8.0`（3 個二進位進 repo）、`nul`（Windows 殘留檔）、`DATASET_MANAGER_PLAN.md`（疑似早期計畫副本，內容應已被 `log/plan/DatasetManager*.md` 取代）。
- 計畫：確認 `.gitignore` 涵蓋 `*.vsix` 與 `nul`；評估舊計畫檔搬遷 `log/plan/` 或刪除（**需使用者確認**，`log/` 內容嚴禁擅自刪除）。
- `test/` 下 `project2.xml`~`project6.xml`、`.project2.xml.bak` 為測試殘留 → 確認是否仍被 `temp_scripts/e2e_*` 引用，無引用則移出測試資產。

---

## 6. P2：Dataset Manager 四類型專項（image / object_detection / line_following / table）

### P2-10 類型能力矩陣盤點（需產出補完文件）

| 類型 | 入口 | 模式 | 匯出分流 | 訓練模板 | 已知殘餘 |
|---|---|---|---|---|---|
| image（分類） | stable | live+file | classifier | `classifier/classifier_train.py` + `common/classifier_dataset.py`（分層） | R9 雙平台實機、三主題目視 |
| object_detection（偵測） | stable | live+file | detector（images/labels） | `detector/detector_train.py` + `common/detector_dataset.py`（依 class_id 分層） | 同上 |
| line_following（循跡） | stable | live+file | line（images/lines/*.txt） | `line_follower/line_follower_train.py` + `common/line_dataset.py` | **切分策略待確認（見 P2-11）** |
| table | stable | **file only** | `data.csv`（UTF-8） | `table/table_train.py` + `common/table_dataset.py`（label 分層／回歸隨機） | T-5 int8 量化本機驗證未完成 |

- 計畫：產出 `docs/dataset_types_matrix.md` 為四類型能力 SSOT（模式/標註/匯出/訓練/推論/已知殘餘），並盤點 `docs/help/` 四類型 help 頁現況。

### P2-11 `line_following` 切分策略需對齊 AGENTS.md 分層鐵律（**待驗證**）
- AGENTS.md 規定：帶類別標籤者必須分層；`line_following` 若資料含「線型/類別欄位」應比照 detector 依標註類別分層。
- 現況（依 todo 記載）：`common/line_dataset.py` 為**隨機切**＋報告註明。
- 計畫：
  1. 檢查 `line/*.txt` 或 `dataset.json` 是否存在可作為類別的欄位（線型、方向、單/雙線）。
  2. **有**類別欄位 → 改為依該欄位分層（重用 `detector_dataset` 分層函式，勿重寫）。
  3. **無**類別欄位（純端點回歸）→ 維持隨機切，但訓練報告需明確註明「回歸型，隨機切分」，並在本計畫記錄結論。
- 驗收：e2e（參考 `temp_scripts/e2e_c2_check.py`、`e2e_detector_curve_check.py`）新增 line 分層案例。

### P2-12 `table` 類型僅 file 模式，live 採集未支援
- 現況：`TYPE_CATALOG` 中 `table.modes = ['file']`；`ui_layout.js:910` 有 `projectType === 'feature'` 特化分支，table 無對應。
- 決策項（需使用者拍板）：
  - 選項 A：維持 file-only（教學上 table 以 CSV 匯入為主，成本最低）。
  - 選項 B：新增 live 採集（相機擷取 → 表格列），與 `feature` live panel 高度相似，可重用 `ui/featurePanel.js` 的相機列舉/綁定骨架。
- 計畫：預設採 A 並在文件標註；B 列入 backlog 需獨立計畫。

### P2-13 `spec.js` 直用 `t()` 的 transitional 債（延續 COCOYA_STATE §6）
- 實測 `spec.js` 中 `t(` 出現 42 次。
- 計畫：`spec.js` 的 `validate()` 改為回傳**錯誤碼 + 佔位符**（如 `{ code: 'DSM_VALIDATE_NO_SAMPLES', params: {...} }`），文案翻譯上移到 ui/application 層。分兩批：先遷 `validate()`，再遷其餘。
- 依 AGENTS.md：`spec.js` 直用 `t()` 為過渡邊界，**不得新增**同類耦合。

---

## 7. P2：i18n 與 3 主題專項

### P2-14 全語系鍵 parity 現況（實測）
| 語系檔 | zh 鍵數 | en 鍵數 | 差異 |
|---|---|---|---|
| `ui/src/zh-hant.js` vs `en.js` | 230 | 224 | zh 獨有 10、en 獨有 4（P0-1/P0-2/P0-3） |
| `modules/dataset_manager/i18n` | 176 | 176 | 0 ✅ |
| `modules/ai_face` | 15 | 15 | 0 ✅ |
| `modules/ai_hand` | 24 | 24 | 0 ✅ |
| 其餘模組（ai_inference / ai_pose / cv_basic / cv_draw / hardware / mcu_camera / mcu_car / mcu_huskylens / spike） | 掃描中途因 PowerShell 錯誤中斷，**待重跑** | | |

- 計畫：完成全表後納入 P3-1 自動守門。

### P2-15 硬編碼中文 fallback 風險
- 中文出現量前幾名：`zh-hant.js`(818，語系檔本身，正常)、`ui_layout.js`(292)、`base.js`(188)、`tauri.js`(164)、`hardware.js`(153)、`persistence.js`(108)。
- 註：多為 `t('KEY','中文 fallback')` 的 fallback 字串（設計如此，非違規），但造成「英文版漏 key 時悄悄顯示中文」的風險。
- 計畫：改用 `t('KEY')` 無 fallback 或 fallback 用英文，讓缺鍵在開發期即被 parity 腳本抓到（與 P2-14 連動）。

### P2-16 三主題 token 完整性
- 實測：`cocoya_light` / `cocoya_dark` / `cocoya_candy` 各 **46 個 cssVars 鍵，三者集合完全一致** ✅（此不變式應維持並加測試守住）。
- 缺口：
  1. `msgColours` 僅 `cocoya_candy.js` 定義（dark 未見 `msgColours`），`cocoya_light` 定義 0 個 → 深/淺主題下積木顏色來源不一致。
  2. 依 AGENTS.md 新增積木檢查清單第 2/3 點：`zh-hant.js`/`en.js` 的 `COLOUR_*` 為預設色 SSOT，主題 `msgColours` 為選配覆寫 → 現況符合設計，但**需確認 dark 缺 `msgColours` 是否為刻意**。
- 計畫：確認後，若刻意則於 `theme_manager.js` 註解寫明；否則補 `cocoya_dark.msgColours`。

### P2-17 `docs/help/` 雙語 help 缺漏（待盤點）
- 依 AGENTS.md 新增積木模組檢查清單第 4 點，help 需 `zh-hant` + `en` 雙檔；現況多數僅有 `zh-hant`（如 `py_ai_get_bbox_zh-hant.html`）。

---

## 8. P3：工程流程與產出品質

### P3-1 自動化守門（強烈建議優先）
1. **i18n parity 測試**（新增 `ui/src/i18n_parity.test.mjs`）：走訪所有 `zh-hant.js`/`en.js`（含各模組 `i18n/`），斷言鍵集合相同；允許白名單。
2. **未使用 export 掃描**：`temp_scripts/unused_export_scan.cjs` 已存在但未接入 → 納入 `npm test`。
3. **主題 token 一致性測試**：斷言三主題 cssVars 鍵集合相同（守住 P2-16 不變式）。
4. 串接 `package.json` scripts：
   - `"test:ui": "cd ui && node --test \"src/**/*.test.mjs\""`（注意：**勿用目錄模式**，會誤把 `index.js` 當入口，見 AGENTS.md）。
   - `"test": "npm run test:unit && npm run test:ui"`。

### P3-2 缺測試覆蓋的高風險模組
- `ui/src/bridge/tauri.js`（93KB，0 測試）→ 至少覆蓋 `capabilities` getter 與 anchor normalize。
- `src-tauri/src/commands/dataset.rs` 僅 1 個 cargo test。
- `resources/dataset_manager/dataset_sidecar.py` 僅靠 `temp_scripts/e2e_*` 臨時腳本（未納入 CI）。

### P3-3 死碼掃描待確認清單
- `ui_layout.js` 委派包裝的外部引用點（`index.js` 匯出 `removeAnnotation` / `refreshDynamicPanels` / `refreshPreview` 等）需逐一確認是否仍被 `window.CocoyaDataset` 外部呼叫。
- `dataset_manager/sampler.js`、`ui_canvas.js` 與新 `ui/samplerPanel.js`、`ui/annotation.js` 是否有職能重疊。

### P3-4 文件一致性
- `FILE_STRUCTURE.md` 極長且已有行號錯位（讀到 L18-19 處 `py_ai_pose_calc_angle_*` 明顯脫離樹狀縮排）。計畫：分段重排並去除行號。
- `log/COCOYA_STATE.md` §6 技術債清單應納入本計畫結論（P1-3、P2-13 已重複記載，可合併指向本檔）。

---

## 9. TDD 基礎設施改進（最高優先，應先於所有重構批次）

> **決策：先完善 TDD，再動任何重構。**
> 理由：Batch 1~6 全是重構／拆檔（`tauri.js` 93KB、`ui_layout.js` 80.5KB、`sidecar.py` 1138 行、`mcu.rs` 38KB）。這些檔案目前完全沒有自動測試門檻，若無守門先做拆檔，回歸只能靠人肉目視，風險遠高於現在。
> 現況基準（實測 2026-09-27）：`cd ui; node --test "src/**/*.test.mjs"` → **tests 194 / pass 194 / fail 0**。測試本體品質不差，**問題在於「沒有任何機制會去跑它們」**。

### 9.1 現況診斷（已驗證）

| 項目 | 現況 | 問題 |
|---|---|---|
| `npm test` | `= test:unit` = `compile && lint` | **194 個 Node 測試 0 個被執行** |
| `npm run test:integration` | 指向 `out/test/runTest.js` | 該檔從未建立 → 永遠 exit 1（空殼） |
| CI | 無 `.github/workflows` | 無自動驗證 |
| Git hook | 無 husky | 測試綠燈與否無強制點 |
| 覆蓋率 | 無 c8 / vitest-coverage | 不知覆蓋率，只知檔案數 |
| Rust | 全專案僅 3 個 `#[test]`（`mcu.rs` 2、`dataset.rs` 1） | `file.rs` 35.6KB、`python.rs` 24.1KB 為 0 測試 |
| Python | `temp_scripts/e2e_*.py` 為手動腳本 | 非測試框架；含**硬編碼路徑**（`e2e_c2_check.py`：`BALL = r'C:/Users/simfonia/Desktop/cocoya/dataset/ball'`）→ 換機即爆，不可重現 |

### 9.2 測試設計兩極分化

**A. 良好（真正的「設計守門測試」）**
- `modules/core/core_contract.test.mjs`（139 行）：對帳 block／generator／toolbox／Variables 動態分類／mutation／雙語 i18n／色碼／三主題 msgColours —— 架構級守門，設計正確。
- `core/typePolicy.test.mjs`、`hardware/pin_resolve.test.mjs`、`core/core_generators.test.mjs`：純函式契約，乾淨。

**B. 弱（事後補的 characterization test，非 TDD 驅動）**
- DM 24 個測試多為「注入 fake deps → 斷言事件陣列」，例 `ui/panels.test.mjs`：
  ```js
  t: (key, fallback) => fallback || key,                 // 假的 i18n
  escapeHtml: (v) => String(v).replace(/</g, '&lt;'),   // 假的 escape
  ```
  這類測試**抓不到真實 bug**：真的 `t()` 缺鍵、真的 escape 漏字元、真的 DOM id 對不上，全都不會紅。
- **關鍵因果**：P0-1（SPIKE 英文版色碼缺鍵）、P0-2（zh-hant 缺 3 鍵）正是這類漏洞 —— 因為 `core_contract` 只過濾 `core/` 前綴模組，spike／hardware／mcu_* 完全未被契約測試覆蓋。**補 T2 即可自動攔截這類問題**。

### 9.3 假 DOM／夾具重複，無共用測試基礎設施

| 測試檔 | 行數 | 自行實作 |
|---|---|---|
| `dataset_manager/ui/annotation.test.mjs` | 211 | `makeEl`(30行) + `makeFakeDoc` + `makeDeps` |
| `dataset_manager/ui/classification.test.mjs` | 194 | `makeFakeDocument` |
| `dataset_manager/ui/statusMessage.test.mjs` | 84 | `makeFakeDocument` |
| `dataset_manager/ui/panels.test.mjs` | 102 | `el()` + `makeDeps` |
| `dataset_manager/ui/labelManager.test.mjs` | 65 | （自備 makeDeps） |
| `dataset_manager/ui/samplerPanel.test.mjs` | 102 | （自備 makeDeps） |

- 已確認 `ui/src` 下**不存在**任何 `*helper*` / `*fixture*` / `*fake*` 共用模組。
- 後果：每新增一個測試都重寫一遍 fake DOM；修正 fake 行為需同步 6 處，易漂移。

### 9.4 改進項（依效益排序）

| 編號 | 改進 | 內容 | 效益 |
|---|---|---|---|
| **T1** | 測試接進門檻 | `package.json` 新增 `"test:ui": "cd ui && node --test \"src/**/*.test.mjs\""`，並將 `test` 改為 `test:unit && test:ui` | 194 測試成為提交門檻（**最高回報／最低成本**） |
| **T2** | 契約測試全模組化 | `core_contract.test.mjs` 從 `filter(id => id.startsWith('core/'))` 改為**涵蓋 `core_manifest.json` 全部模組**；同樣對帳 blocks↔generators↔toolbox↔雙語 i18n↔`COLOUR_*` | 自動攔截 P0-1／P0-2 與未來所有 i18n／色碼缺漏 |
| **T3** | 共用測試夾具 | 新增 `ui/test/`：`fakeDom.js`（makeEl/makeFakeDocument）、`depsBuilder.js`（makeDeps 預設注入真 `t()`／`escapeHtml`）、`fixtures.js`（DatasetSpec 樣本） | 消除 6 檔重複；讓假 `t()`/`escapeHtml` 不再各自造假 |
| **T4** | Python／Rust 測試納入 | `temp_scripts/e2e_*.py` 轉 `pytest`（移除硬編碼路徑，改 `tmp_path`／env）、補 `sys.exit(1)`；Rust 補 `file.rs`／`python.rs` 測試；`cargo test` 與 `pytest` 接入 `npm test` | 三層（前端／Rust／Python）測試統一 |
| **T5** | 覆蓋率基準 | 加 c8，先只產報告不設門檻 → 連續兩週後再依實際值收緊 | 補測試有依據，避免盲目補 |
| **T6** | CI 與 pre-commit | GitHub Actions workflow（`node --test` / `tsc --noEmit` / `lint` / `cargo check` / `cargo test` / `py_compile`）＋ husky pre-commit 跑快速子集 | 提交前自動驗證，取代人力記憶 |
| **T7** | 高風險檔補契約測試 | `bridge/tauri.js`（93KB，0 測試）至少覆蓋 `capabilities` getter 與 anchor normalize；`app/persistence.js` 備份／recovering；`sidecar.py` 訊息協定（stdout 單一 JSON） | 關鍵路徑有回歸網 |
| **T8** | 測試分類標註 | 區分**契約測試**（守設計：manifest／i18n／色碼／主題 token）與**行為測試**（守重構：controller／use-case），禁止只有後者 | 消除「測試很多但抓不到 bug」的假安全感 |

### 9.5 TDD 執行順序與決策點

| 步驟 | 內容 | 決策點 |
|---|---|---|
| **S1** | T1 ＋ T2（先有門檻，再擴契約範圍） | T2 會讓**既有模組立刻現紅**（因 i18n／色碼缺漏）→ 需決定：先補齊缺鍵再啟用，或以白名單暫時豁免。建議**先補 P0-1／P0-2 再啟用 T2**（自然落在 Batch 0 順序） |
| **S2** | T3 抽共用夾具（純搬移，測試結果應完全不變，作為重構安全性基準） | 若搬移後測試結果有任何變化，代表原本測試有隱性相依，須停下釐清 |
| **S3** | T4 Python／Rust 測試納入 | Python 轉 pytest 需確認不影響 sidecar 打包（`tauri.conf.json` resources） |
| **S4** | T5 覆蓋率基準 → T6 CI/pre-commit | CI 上線時機可配合使用者發布節奏 |
| **S5** | T7 高風險檔補測試 → T8 測試分類標註 | T7 的 `tauri.js` 需先完成 P2-1 拆檔才易測（順序上 T7-part 應在 Batch 3 之後） |

### 9.6 重要提醒（避免走偏）

- **S1→S2 之前不要動 Batch 1~6 的任何重構**。沒有 T1 門檻就改 `ui_layout.js`／`tauri.js`，等於沒有安全網。
- T3 抽夾具是**純搬移**，驗收標準是「194 → 194 全綠且斷言未修改」，不是「順便改測試讓它過」。
- T2 現紅是**預期且正確**的結果（揭露既有缺陷），處理方式是補 i18n／色碼，不是放寬斷言。
- 現有 32 個 `.test.mjs` 共 4,626 行，涵蓋 DM／hardware／core／app／ui — **本專案的 TDD 開發習慣（先寫測試再抽模組）其實是好的**，待改善的是最後一哩的自動化守門與契約覆蓋範圍。

---

## 10. 建議執行順序（分批，每批可獨立驗證）

> **前置：Stage 0（TDD 守門）必須先於 Batch 1~6 全部完成**（見 §9）。

| 階段 | 內容 | 風險 | 依賴 |
|---|---|---|---|
| **Stage 0（TDD 守門）** | **T1** 測試接進 `npm test` → **P0-1/P0-2** 補 i18n 色碼 → **T2** 契約測試全模組化 → **T3** 共用夾具抽離 | 極低 | 無 |
| **Batch 0（無風險）** | P0-3 Blockly 內建鍵確認；P3-1 parity／主題 token 守門腳本；P3-2 補高風險檔測試（T7 前段） | 極低 | Stage 0 |
| **Batch 1（低風險純重構）** | P1-1、P1-2 類型判斷收斂；P2-6 移除 `ui_components.js` 冗餘 | 低 | Batch 0 |
| **Batch 2（中風險視覺）** | P1-3 CSS token 化；P2-7 標籤色主題化；P2-16 dark msgColours | 中（需三主題目視） | Batch 1 |
| **Batch 3（中風險架構）** | P2-1 `tauri.js` 拆分；P2-2 `ui_layout.js` 收斂 | 中高（多視窗/emit_to） | Batch 1 |
| **Batch 4（DM 四類型深化）** | P2-10 矩陣文件；P2-11 line 分層；P2-13 spec 文案上移；P2-12 決策 | 中 | Batch 1 |
| **Batch 5（後端/資源）** | P1-5 pip 自動安裝；P1-6 Command 審查；P2-3 sidecar 拆分；P2-5 Rust 拆分；**T4** Python/Rust 測試納入 | 中高 | Batch 3 |
| **Batch 6（清理/收尾）** | P2-9 repo 殘留；P3-4 FILE_STRUCTURE 重排；**T5** 覆蓋率基準；**T6** CI/pre-commit；**T7** `tauri.js`／sidecar 測試（拆檔後）；**T8** 測試分類標註 | 低（刪除項需使用者確認） | 全部 |

---

## 11. 每批次通用驗收關卡（Definition of Done）

0. **（Stage 0 後起強制）`npm test` 全綠**＝ compile + lint + 194+ 個 Node 測試。
1. `cd ui; node --test "src/modules/dataset_manager/*.test.mjs" "src/modules/dataset_manager/**/*.test.mjs"` 全綠。
2. `npx vite build`（ui/）PASS。
3. `npx tsc --noEmit -p tsconfig.json` 無錯。
4. `cargo check`（src-tauri）無新增 error。
5. `node --check` 針對所有變更 .js。
6. **VSIX ＋ Tauri 雙平台實機**（混合架構，單平台驗證不足）。
7. **三主題目視**（cocoya_light / cocoya_dark / cocoya_candy）。
8. **中英文雙語切換目視**。
9. 整檔覆寫前已備份至 `backup/`（檔名帶 `yyyyMMdd_HHmmss`）。
10. 變更同步寫入 `log/work/yyyy-mm-dd.md`、`log/todo.md`、`FILE_STRUCTURE.md`。

---

## 12. 待使用者決策事項

1. **P2-12**：`table` 類型是否新增 live 採集（A 維持 file-only / B 新增）。
2. **P2-9**：3 個 `.vsix`、`nul`、`DATASET_MANAGER_PLAN.md` 是否可從 repo 移除。
3. **P1-5**：sidecar 是否允許在使用者同意下自動 `pip install`。
4. **P2-16**：`cocoya_dark` 缺 `msgColours` 是刻意還是疏漏。
5. **T2 啟用時機**：契約測試全模組化會讓 spike／hardware／mcu_* 等模組立刻現紅 → 採「先補齊所有缺鍵再一次啟用（嚴格）」或「先啟用並以白名單豁免（寬鬆）」。
6. **T4 Python 測試**：是否導入 `pytest` 為 devDependency／requirements（會影響環境安裝流程）。
7. **T6 CI**：GitHub Actions 是否為可接受之 CI 平台（專案 repo 在 GitHub：`simfonia/Cocoya`）。
8. 本計畫各階段的執行授權與優先級調整。

---

## 13. 尚待補完的掃描（本輪未完成，列為下一輪工作）

- 全模組 i18n parity 完整表（P2-14 掃描因環境錯誤中斷，僅完成 3 組）。
- `docs/help/` 中英文 help 缺漏清單（P2-17）。
- `src-tauri` 15 處 `Command::new` 逐條人工複核（P1-6）。
- `dataset_sidecar.py` 3 處 Popen 的 `encoding/errors` 核對（P1-7）。
- `temp_scripts/e2e_*.py` 與 `test/*.xml` 的引用關係（P2-9）。
- `ui/src/app/persistence.js`（29.7KB，5 處 TODO 標記）與 `ui/src/ui/base.js`（44.9KB）的細部審查。
- **T2 前置盤點**：盤點 `core_manifest.json` 全部模組在 blocks↔generators↔toolbox↔雙語 i18n↔`COLOUR_*` 五項對帳上的現存缺口數量，估算 T2 啟用後的紅燈規模。
- **T3 前置盤點**：列出 6 個重複 fake DOM 測試檔的差異點，確認可抽象出的最小介面（`getElementById`／`querySelector`／`classList`／`style`／listeners／`innerHTML`／`insertAdjacentHTML`）。
- **T4 前置盤點**：`temp_scripts/e2e_*.py` 8 支腳本的相依套件（numpy／tensorflow／PIL）與執行時間，評估轉 pytest 的可行順序。

---

*本檔為計畫，尚未實作任何變更。實作時請逐批更新本檔狀態欄位並在 `log/work/` 留下執行日誌。*

---

## 14. Batch 0 執行結果（2026-10-01）

> 本節為**追加**記錄，不修改 §1~§13 原文（保留計畫原貌以對照實作偏差）。
> 執行細節見 `log/work/2026-10-01.md`。

### 14.1 P0-3 Blockly 內建鍵確認 — ✅ 已確認（Stage 0 T2 已落實）

- 結論與 §1 P0-3 的「先確認是否真缺」一致：zh-hant 獨有 6 個 `BKY_*_VARIABLE*` **屬 Blockly 本體提供的內建文案**，不補進 `en.js`。
- 落地位置：`ui/src/modules/core/core_contract.test.mjs` 的 `BLOCKLY_BUILTIN` 白名單（附原因註解）。
- **本節無新增程式碼**；僅確認 T2 的處理已完整覆蓋 P0-3。

### 14.2 P3-1 自動化守門 — ✅ 部分原已被 T2 涵蓋，補上缺口

| P3-1 條目 | 狀態 | 說明 |
|---|---|---|
| 1. i18n parity 測試 | ✅ **已被 T2 取代** | T2 已把「根 parity ＋ 模組 parity ＋ blocks/generators 引用鍵」三項 i18n 守門納入 `core_contract.test.mjs`（全 22 模組）。**§7 P3-1 第 1 點的「新增 `ui/src/i18n_parity.test.mjs`」已無必要**，獨立檔案會造成同一規則兩處维护。 |
| 2. 未使用 export 掃描 | ❌ **取消（依賴對象不存在）** | §9.4 更正已註明 `temp_scripts/unused_export_scan.cjs` 不存在；實際存在的是 `parity_check.mjs`（只掃 DM i18n，已被 T2 全模組 parity 完整取代）。**不新建此腳本**。 |
| 3. 主題 token 一致性測試 | ✅ **本次新增** | `ui/src/modules/theme_manager/theme_contract.test.mjs`（4 測），把 P2-16 的「三主題各 46 鍵、集合一致」從一次性量測升級為守門。 |
| 4. package.json scripts 串接 | ✅ **已由 Stage 0 T1／T-fast 完成** | 另本次新增 `test:theme`（根與 `ui/` 兩層）。 |

**新增守門：`theme_contract.test.mjs` 鎖住四條**

1. 三主題 `cssVars` 鍵集合完全相同（缺漏／多餘都紅）。
2. 鍵無重複（重複宣告會靜默覆寫前者）。
3. 鍵名格式 `--[A-Za-z0-9_-]+`。
4. `msgColours` 為**選配**覆寫：light／dark 不宣告時解析器回 `null` 而非報錯（見 §14.5 決策）。

**防假綠驗證**（重要：新守門必須證明會紅）
- 從 `cocoya_dark.js` 移除 `--dsm-brand` → 測試 1 紅，回報 `missing.cocoya_dark: ['--dsm-brand']`。
- 兩處 mutation 後皆已 `git checkout` 還原，`git status` 乾淨。

**接線**：`scripts/test-related.cjs` 新增 `THEME_CONTRACT_TEST`，動到任一 `themes/*.js` 時自動納入（實測 `--dry` 正確挑中 2 個契約測試）。

### 14.3 P3-2 高風險檔補測試 — ✅ 本次新增 30 例

#### (a) `bridge/tauri.js`（93KB／原 0 測試）→ `ui/src/bridge/tauri_anchor.test.mjs`（13 測）

審查計畫只要求「至少覆蓋 `capabilities` getter 與 anchor normalize」，實作時把範圍拉到**兩條真實踩坑路徑**：

- **`_normalizeAnchor`（6 測）**：這是 AGENTS.md serde 坑的**前端保險絲**。若後端漏加 `#[serde(rename_all = "camelCase")]`，只靠 camelCase 讀取會得到「物件存在但 `projectRoot` 為 undefined」→ Tauri live 影像 `savePath` 無法生成、拍照不落盤（2026-08-10 實踩）。測試鎖住：camelCase／snake_case 雙讀、**camelCase 優先**（不被後端殘留舊鍵蓋掉）、falsy 收斂、`isAnchored` 一律 boolean、空字串 `projectRoot` 收斂為 `null`。
- **`capabilities` getter（4 測）**：欄位集合**逐鍵比對**（新增／移除能力欄位會紅，刻意不放寬）、`_anchor` 更新後即時反映（含換專案後舊路徑不殘留）、`isAnchored=true` 但缺 `projectRoot` 時回 `null` 而非洩漏 `undefined`、**每次取值回傳新物件**（呼叫端誤改不污染 bridge 內部）。
- **`_refreshAnchor`（3 測）**：snake_case 回應也能刷新、後端拋錯時 `_anchor` 設 `null`（**過期快照比未錨定更危險**）、回傳 `null` 亦收斂。

**防假綠驗證**：把 `(a.projectRoot ?? a.project_root)` 改為 `a.projectRoot` → 3 測紅（正是 serde 坑的具體症狀）。已還原。

> **設計決策**：不呼叫 `init()`。`init()` 會 `await import('@tauri-apps/api/*')`，Node 環境無此模組；只驗純邏輯 getter 與 anchor 路徑。`isRemoteConnected` 欄位在 `base.js` 有宣告但 Tauri getter 未回傳（實測確認）——**未擅自補**，列入 §14.5 待決策。

#### (b) `app/persistence.js` → `ui/src/app/persistence_snapshot.test.mjs`（13 測）

審查計畫寫「備份／recovering 路徑」，實作時對應到三條**「資料會不見」**的路徑：

- **reload 快照一次性語意（6 測）**：`snapshotWorkspaceForReload` 忠實記錄 `isDirty`（否則還原後髒狀態錯誤）、`consumeReloadSnapshot` **取出即刪除**（不刪則使用者按「捨棄」後，下次 reload 會被殘留快照復活）、壞 JSON／缺 xml／空白 xml 一律安全回 `null` **且清掉殘留**、序列化拋錯時清殘留、無 workspace 不寫入空快照。
- **自動備份 debounce（3 測）**：**刻意用 `t.mock.timers` 而非真等 2 秒** —— 真等待會讓本檔耗時被 debounce 測試綁死（實測初版 6.4s，違反 AGENTS.md 計時器洩漏紅線的精神）；mock 化後全檔 **112ms**，且能在同一 tick 內驗「1999ms 不送、2000ms 送一份」這個 debounce 本質。
- **`setDirty` 原子化同步（4 測）**：必須回傳 **真 Promise**（AGENTS.md 多視窗完整性規範要求 await 完成才 `close_window`，回傳 undefined 會競態）、值未變不重複通知、**轉 false 一律通知**（否則多視窗殘留 stale dirty）、初始化期間不標髒。
  - 註：測試替身 `CocoyaBridge.send` 必須回傳 Promise，否則這條契約無法成立 —— 這正是「假 deps 抓不到真 bug」的具體例證，與 §9.2 的診斷互相印證。

**互補關係**：與既有 `platform_restore.test.mjs` 不重疊 —— 後者守「切平台先於 `domToWorkspace`」的**順序**，本檔守**狀態與一次性語意**。

### 14.4 驗收結果

| 關卡 | 結果 |
|---|---|
| `npm test`（compile + lint + lint:ui + 全量 Node） | ✅ **227/227**（原 197 → **+30**），1.58s |
| `npx vite build`（ui/） | ✅ PASS（57 modules, 292ms） |
| `npx tsc --noEmit -p tsconfig.json` | ✅ exit 0 |
| `node --check`（變更 JS） | ✅ 由 `lint:ui` 覆蓋（0 error） |
| 變更檔 `git status` | ✅ 僅 3 個新增測試檔 + 3 個設定/文件檔，**無意外殘留** |

新增 npm scripts：`test:theme`（根 + `ui/`）。

### 14.5 本次產生的待決策事項（併入 §12）

1. **P2-16 `cocoya_dark` 缺 `msgColours` 是刻意或疏漏**（§12 第 4 項原已列，現已有守門釘住現狀）。
   - 本次處理：依 AGENTS.md「新增積木模組檢查清單」第 2/3 點，**根 `zh-hant.js`/`en.js` 的 `COLOUR_*` 是預設色 SSOT、主題 `msgColours` 只是選配覆寫** → 現況（僅 candy 有覆寫）**符合設計**。
   - `theme_contract.test.mjs` 第 4 測把這點**釘成契約**（不宣告合法，解析器須回 `null`）。若使用者日後拍板「dark 也要有覆寫」，改動是**新增覆寫物件**，不會與守門衝突。
   - ⚠️ **此舉等於我替 §12 第 4 項做了「刻意」的判斷並寫進守門**。若使用者認為應是疏漏，需明確推翻本條，屆時把該測試改為要求 dark 有 msgColours 即可。
2. ~~**`isRemoteConnected` 在 Tauri `capabilities` 未回傳**~~ → **已併入 §5 P2-6-b，2026-10-01 使用者決策。**
   - ⚠️ **本節原文的判斷有誤，已更正**：原記「全專案無讀取點、現況無影響」是錯的。
     `src/cocoyaManager.ts:397` **有生產者**（`isRemoteConnected: vscode.env.remoteName !== undefined`），
     經 `manifestData` → `controller.js:29` 的 `updateCapabilities()` 合併進 `_caps`，**VSIX 路徑是活的**。
   - Batch 0 當時只檢索了 `ui/src/**` 與 Bridge 檔案，未檢索 `src/`（VSIX Host），漏了生產端。
     **教訓**：判定「某欄位無讀取點」時，必須涵蓋 **前端 `ui/src` ＋ VSIX Host `src` ＋ Rust `src-tauri`** 三端，只掃一端會得出假陰性結論。
   - 處置（見 §5 P2-6-b）：Tauri getter 補 `isRemoteConnected: false`。
3. **`supportsStableMode` 已是死欄位**（Stable Mode 死鏈已於 2026-09-30 整條移除，但 `base.js:21` / `tauri.js:29` / `vsix.js:19` 三處仍宣告）。
   - ✅ **2026-10-01 使用者決策：併入 §5 P2-6-b**（與 `isRemoteConnected` 同屬 capabilities 欄位集合不一致問題）。

---

## 15. DM 重構殘餘待辦收斂（2026-10-01）

> **目的**：`log/todo.md` 的「Dataset Manager 類型鎖定改造」與「Dataset Manager 三層重構 - 收尾」兩節，
> 與本計畫 §6／§2／§5 的條目**大量重疊**（同一件事寫在兩處，日後必然 drift）。
> 本節把它們**合併到單一來源**：本計畫為準，`todo.md` 改為指针。
> **原則：功能未變、決策已定者留本計畫；實機／待決策者列 §15.3 清單。**

### 15.1 已可判定為「完成」或「併入本計畫」的項目

| todo.md 原條目 | 處置 | 理由 |
|---|---|---|
| M2 R9 雙平台實機 ＋ 三主題目視 | → **§15.3 使用者 backlog** | 純實機驗證，非本計畫任何條目能涵蓋 |
| M3 T-5／L-5 殘（table int8 量化本機驗證） | → **§15.3** | 同上 |
| M4 Phase 1~5（特徵最小可用） | ✅ **已完成**（todo.md 記錄 PASS） | 屬工作記錄，非待辦 |
| M4-FEATURE 除錯任務 ①~⑥ | → **併入 §2 P1-1／P1-2** | 線索①（live 警示）已於 2026-09-14 修（`isFeatureLive` 豁免）；②③④⑤⑥ 均是 §6 P2-10 的四類型矩陣盤點範圍 |
| 三層重構 Stage 6 Gate 簽核 ＋ D6-2 公開 API 對照 | → **§15.3** | 需 `window.CocoyaDataset` 實機 console 對照 |
| Stage 7 總驗證（tauri build ＋ E2E 矩陣） | → **§15.3** | 依賴實機環境 |
| 長遠債：`--dsm-*` dark/token 收斂 | → **§2 P1-3 ＋ §7 P1-3** | 同一件事，本計畫已有更完整描述（144 hex 量化＋優先序） |
| 長遠債：`spec.js` 直用 `t()` | → **§6 P2-13** | 已重複記載於 COCOYA_STATE §6，**本計畫為唯一去處** |
| 長遠債：Tauri dev sidecar 路徑優先序 | → **§14 附錄（下方 15.4）** | 與本計畫其他條目無關，保留在本計畫末尾以免再散落 |
| 長遠債：Tauri 深色 prompt hover 白底 | → **§15.4** | 同上 |
| 低優先：Tauri webview `.serial-dropdown-label` null | → **§15.4** | 同上（已被鐵壁版繞過，僅記錄） |
| P3-3 死碼掃描（`ui_components.js` 重疊） | → **§5 P2-6** | 本計畫已有逐條比對計畫 |

### 15.2 明確標記為「已完成，僅記錄」者（不需再動）

- DM 三層重構 Stage 0~6（2026-08-24 ~ 09-01）、M1（類型鎖定）、M2 R4~R9、M3 T-1~L-4、M4 Phase 1~5 —— 詳細摘要見 `todo.md` Archive A／Archive C 與 `log/work/2026-09-*.md`，**不在本計畫重複列**。

---

## 16. Batch 1 執行結果：P2-6-b／P1-1／P1-2（2026-10-01）

> 使用者於 Batch 0 收尾時裁示：`isRemoteConnected` 併入 P2-6，隨即執行 Batch 1。
> 本節記錄三項完成項與一項**新發現的守門盲點**。

### 16.1 P2-6-b `capabilities` 欄位集合不一致 — ✅ 完成

**變更**

| 檔案 | 變更 |
|---|---|
| `ui/src/bridge/tauri.js` | getter 補 `isRemoteConnected: false`；刪 `supportsStableMode` |
| `ui/src/bridge/base.js` | 刪 `supportsStableMode` |
| `ui/src/bridge/vsix.js` | 刪 `supportsStableMode` |
| `src-tauri/permissions/commands.toml` | **刪 `setup_stable_mode` 條目（額外發現）** |

**額外發現**：`commands.toml` 的 `commands.allow` 仍列著 `setup_stable_mode`，但該 command 已於 2026-09-30 移除。
依 AGENTS.md「Tauri 2.0 權限二階段定義」，這是**定義端與實作端不同步**——多數情況下只是冗餘，
但若日後有人依此以為 command 仍存在而撰寫前端呼叫，會得到執行期錯誤。

**新增守門（+3 測）**：`tauri_anchor.test.mjs` 新增三條 capabilities 契約 ——

1. **跨橋欄位集合對帳**：Tauri 與 VSIX 必須回傳**同一組鍵**（值可不同），且兩者都必須涵蓋 `base.js` 宣告的全部鍵。
2. **`supportsStableMode` 不得再回傳**：鎖住「不會被無聲加回」。
3. **`isRemoteConnected` 在 Tauri 固定 `false`**：不可省略（省略會讓前端讀到 `undefined` 而非 `false`）。

> **設計要點**：第 1 條的「跨橋對帳」**不足以單獨**守住欄位增刪 —— 若三個檔案同時漏掉一個鍵，
> 對帳仍會通過。真正的錨點是**欄位集合字面值斷言**（`Object.keys(caps).sort()` 比對明文清單）。
> 變異測試已驗證：從 `base.js` 刪 `isRemoteConnected` → 由字面值斷言抓到（對帳測試放行）。

### 16.2 P1-1／P1-2 類型判斷收斂到 typePolicy — ✅ 完成

**`typePolicy.js` 新增**：`ALL_TYPES`、`projectTypes()`、`isKnownType()`、`isFeatureType()`。

**收斂明細（共 16 處硬編碼判斷）**

| 檔案 | 處數 | 改為 |
|---|---|---|
| `spec.js` | 5 | `projectTypes()`／`isKnownType()`／`isImageType()`／`isFeatureType()`（**刪除自持的 `PROJECT_TYPES`／`IMAGE_TYPES`**） |
| `ui_layout.js` | 5 | `isImageType()`×4、`isFeatureType()`×1；**刪除重複的 `TYPE_TO_MODES_MAP`** |
| `ui/labelManager.js` | 6 | `isClassificationType()`×4、`needsUnclassifiedCheck()`×2 |
| `core/stats.js` | 2 | `isClassificationType()` |
| `ui_components.js` | 2 | `isImageType()`、`needsUnclassifiedCheck()` |
| `ui/annotation.js` | 2 | `needsUnclassifiedCheck()` |

**P1-2 的 `countHeader` 等價性（本次唯一有實質風險的改寫）**

原式：`object_detection → BOX_COUNT`；`line_following → LINE_COUNT`；**其餘 → SAMPLE_COUNT**。

改寫時我一度寫成 `isClassificationType(t) ? SAMPLE_COUNT : (line ? LINE_COUNT : BOX_COUNT)`，
這會讓 **`table`／`feature` 誤顯示「標註框數」** —— 屬功能退化。已改用
`needsUnclassifiedCheck(t)`（語意**恰為** `t === 'object_detection'`）取代第一分支，確保完全等價。

> **教訓**：把 `A === 'x' ? P1 : (B === 'y' ? P2 : P3)` 改寫成既有 predicate 時，
> **必須逐一列舉原表的真值**再對照新 predicate，不能憑「感覺等價」。三段式條件特別容易改錯預設分支。

**新守門（+5 測）**：`typePolicy.test.mjs` 補五條，其中兩條是**全目錄掃描型不變式**：

- `projectTypes()` 與 `imageTypes ∪ devTypes ∪ {table}` 吻合；`isKnownType` 對未知／空字串／undefined 皆 false。
- `isFeatureType()` 僅 feature。
- 回傳陣列一律是**複本**（呼叫端 `push` 不得污染 SSOT）。
- **掃描型**：遍歷 `dataset_manager/` 全部 `.js`（略過 `typePolicy.js` 與 `*.test.mjs`、略過註解行），
  出現 `projectType === 'object_detection'|'image'|'feature'` 即紅。
- **掃描型**：`TYPE_TO_MODES_MAP` 只允許存在於 `typePolicy.js`。

> **這個守門立刻抓到兩處我漏掉的**：`core/stats.js:8/55` 兩處 `projectType === 'image'`，
> 與 `ui/modal.js` 註解中過期的 `TYPE_TO_MODES_MAP` 引用。
> 若只照計畫原文列的 4 個檔案改，這兩處會漏掉 —— **掃描型守門的價值正在於此**。

**變異測試**：把 `stats.js` 的 `isClassificationType(projectType)` 改回硬編碼 → 掃描型守門紅並精確報出 `core\stats.js:10`。

### 16.3 P2-6（`ui_components.js` 職責重疊）— ⏳ 未執行

本批次**未動** `ui_components.js` 的函式本體（僅改其類型判斷）。
刪除已無引用的呈現函式需要逐一比對呼叫端，且涉及 AGENTS.md 明確警告的
「`#dataset-structure-content` 嚴禁覆寫 innerHTML」契約，風險高於 P1-1／P1-2，**留作獨立一次執行**。

### 16.4 驗收結果

| 關卡 | 結果 |
|---|---|
| `npm test` | ✅ **235/235**（227 → +8），1.12s |
| DM 子集 | ✅ 154/154 |
| `npx vite build` | ✅ PASS（57 modules, 189ms） |
| `cargo check` | ✅ Finished（1 個既有 warning） |
| `git status` | ✅ 14 檔皆為預期變更，無 mutation 殘留 |

**變更檔案 14 個**（`+199 / -47`），備份 `backup/{ui_layout,ui_components,annotation,labelManager}_pre_batch1_*.bak`。

> ⚠️ **本次未做實機驗證**：變更雖觸及執行期程式碼（`stats.js`／`ui_layout.js`／`spec.js` 等），
> 但**全部是等價改寫**（同一判斷換成 predicate 呼叫），且 DM 154 例全綠。
> 依 AGENTS.md 驗收關卡第 6 項，仍建議在 **Batch 1 全部收尾後**做一次四類型（image／object_detection／
> line_following／table／feature）雙平台實機＋三主題目視，確認統計面板的「標註框數／標註線段／樣本數」
> 表頭在各類型下正確 —— 這正是本次風險最集中的那一行。

- 依 AGENTS.md：**已完成歷史任務嚴禁刪除**，故 `todo.md` 的歸檔節保留（已精簡為指針）。

### 15.3 使用者 backlog（需實機／硬體，非本計畫可執行）

| 項目 | 來源 |
|---|---|
| R9 雙平台實機：VSIX+Tauri 每類卡→徽章→匯出/存讀 ＋ 三主題目視 | todo M2 |
| table int8 量化本機驗證（初跑命令逾時，改背景 job） | todo M3 T-5 |
| line_following 雙平台 GUI 實機（UI 匯出→訓練整鏈） | todo M3 L-5 |
| feature live 採集整鏈雙平台實機（含 z 開關、欄位/統計同步） | todo M4 |
| DM 第二輪 UI（統計同步、label id、三處標籤管理器一致性、排序與顏色） | todo 實機彙整 |
| M4b `dataset.json` 存讀混合資料（Live+File）套回回驗證 | todo 實機彙整 |
| Startup Home 開新專案流程雙平台（dirty 提示、另存錨定、取消零副作用） | todo 實機彙整 |
| Tauri 多視窗：雙視窗 run/serial 不污染、失焦釋放/聚焦重取 | todo 實機彙整 |
| Stage 6 Gate 簽核（§9.3 六項）＋ D6-2 公開 API 實機對照 | todo DM 收尾 |
| Stage 7 總驗證（compile/lint/cargo check+test/tauri build ＋ E2E 矩陣） | todo DM 收尾 |

### 15.4 與本計畫無關但需保留的孤立技術債（脫離 DM 範圍，暫不併章節）

- **Tauri dev 模式 sidecar 路徑優先序**：`get_sidecar_dir` 在 Resource 目錄優先於專案根原始檔 → 開發時改 `resources/` 未必即時生效。修正應改為 dev 優先專案根（比照 `AGENTS.md` 資源路徑處理規範「開發模式優先使用原始檔」）。
- **Tauri 深色 prompt hover 白底**：`--dsm-btn-hover-bg` 深色值未定義 → fallback 白。
- **Tauri webview `.serial-dropdown-label` query 為 null**：環境因素（已由「鐵壁版」繞過，僅記錄）。

### 15.5 todo.md 精簡結果

- DM 兩節（`[2026-09-10] Dataset Manager 類型鎖定改造`、`Dataset Manager 三層重構 - 收尾`）**改為指針**，細節指向本計畫 §6／§15.3 與 `log/plan/DatasetManager*.md`。
- 屬**工作記錄**的完成條目保留在 `log/work/2026-09-*.md`（SSOT），`todo.md` 只留摘要與指針。
- **未刪除任何已完成歷史任務**（AGENTS.md 鐵律），僅合併重複敘述。
- 整檔覆寫前已備份 `backup/todo_pre_batch0_20261001_090452.bak`。





