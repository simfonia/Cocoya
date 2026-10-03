# P2-1 `ui/src/bridge/tauri.js` 拆檔方案

> 產出：2026-10-03（#task[cocoya] Batch 6 後續）
> 對應 todo：`log/todo.md` Batch 3 / P2-1；稽核計畫 `log/plan/ComprehensiveAudit_2026-09-27.md` §5
> **狀態：待批准，尚未動工**

---

## 0. 一句話現況

`ui/src/bridge/tauri.js` = **1865 行 / 97KB / 58 個 `send()` case / 70 處 invoke**，
單一 class 承載全專案 Tauri 端的所有通訊，是 **T5 覆蓋率報告的最大缺口（8.0%）**。

---

## 1. 實測結構（不是推測）

以機械式掃描取得，非人工估計：

| 區段 | 行範圍 | 行數 | 內容 |
| :--- | :--- | :--- | :--- |
| 檔頭 + `import` + `class` + `constructor` | 1–17 | 17 | — |
| `get capabilities` | 27–43 | 17 | 環境能力清單 |
| `init()` | 48–74 | 27 | 動態 import Tauri API、取錨定狀態 |
| **`send()`** | **79–1103** | **1025** | **`switch` 內 58 個 case，共 1018 行** |
| `_setupTauriListeners()` | 1105–1243 | 139 | 事件訂閱（terminal / serial / training） |
| `_handleCloseDialog()` | 1244–1345 | 102 | 關窗前存檔確認 |
| `_handleDatasetCommand()` | 1346–1415 | 70 | sidecar 指令鏈 |
| `_handleCheckUpdate()` | 1416–1449 | 34 | 版本比對 |
| `_confirmSaveBeforeOpen()` | 1450–1467 | 18 | — |
| `_handleNativeDialogs()` | 1468–1500 | 33 | alert/confirm/prompt 分派 |
| `_showPromptDialog` / `_showConfirmDialog` / `_showAlertDialog` | 1501–1636 | 136 | **原生對話框實作（自成一群）** |
| `_ensureDialogStyles()` | 1640–1737 | 98 | **對話框 CSS（98 行字串）** |
| `_escapeHtml` / `_getCurrentXml` / `_normalizeAnchor` / `_refreshAnchor` | 1742–1784 | 43 | 工具 |
| `_handleExamplesSaveDialog()` | 1785–1818 | 34 | 範例存檔保護 |
| `_dispatchToFrontend()` | 1819–1837 | 19 | — |
| `restoreExamples` / `pickMcuModel` | 1838–1864 | 27 | 覆寫 base |

**關鍵觀察**：`send()` 一個方法佔 **55%**（1025/1865），這才是真正的痛點；
其餘方法中 `_showXxxDialog` 三個（136 行）＋ `_ensureDialogStyles`（98 行）
自成一組、共 234 行，是**純 UI 的第二個大塊**。

---

## 2. 方案選型（三案比較）

### 案 A：Mixin 拆檔（`Object.assign(BridgeTauri.prototype, ...)`）

```js
// tauri.js
import { eventsMixin } from './tauri/events.js';
export class BridgeTauri extends BaseBridge { /* 只留 constructor/capabilities/init */ }
Object.assign(BridgeTauri.prototype, manifestMixin, pythonEnvMixin, ...);
```

| 優點 | 缺點 |
| :--- | :--- |
| ✅ 改動最小，方法體**逐字元不動** | ❌ `Object.assign` 到 prototype 是隱式行為，IDE 追蹤失效 |
| ✅ `this.*` 語意完全保留 | ❌ 方法不存在於 class 語法樹上，掃描型守門難寫 |

### 案 B：命令處理器物件（**推薦**）

```js
// tauri/sendHandlers.js — 匯出「command → 函式」對照表
export const sendHandlers = { dataset: {...}, serial: {...}, ... };

// tauri.js
async send(command, data = {}) {
    await this.ready;
    if (!this.tauriInvoke) return;
    const group = HANDLER_GROUP[command];
    const handler = group && sendHandlers[group]?.[command];
    if (handler) return handler.call(this, data);
    ...
}
```

| 優點 | 缺點 |
| :--- | :--- |
| ✅ `switch` 消失，**新增 command 只需在一個檔案加一行** | ⚠️ 需確認 `return` 語意與原 switch 一致（見 §5） |
| ✅ 每個子模組可獨立測試（純函式 + `this` 注入） | ⚠️ 需處理原本 fallthrough 的 case（見 §5 註） |
| ✅ 掃描型守門容易寫（對照表就是 SSOT） | |

### 案 C：保留 switch，只把 case body 抽成模組函式

```js
case 'datasetDeleteImage':
    result = await datasetOps.deleteImage.call(this, data);
    break;
```

**不推薦**：switch 仍在，`send()` 仍有 58 個分支，但每個都已薄化 ——
看似解決實則沒解決「新增 command 要改大檔」的問題。


---

## 3. 推薦切分（案 B，依**實際內容**而非計畫的四個名稱）

> 計畫原文寫 `{events,dataset,serial,files}` 四檔。實測後建議改為 **10 個子模組**：
> 理由同 P2-5（計畫列 3 檔，實際依結構切成 13 檔）——
> `send()` 的 case 分佈與計畫預設的「檔案操作／事件」分類並不對齊。

| # | 子模組 | 行數 | case 數 | case 清單 |
| :-- | :--- | ---: | ---: | :--- |
| 1 | `tauri/manifest.js` | 53 | 7 | getManifest, getModuleToolbox, reloadWebview, openHelp, openExternal, openFolder, setLocale |
| 2 | `tauri/pythonEnv.js` | 100 | 5 | setPythonPath, getPythonPath, checkEnvironment, installModule, abortInstall |
| 3 | `tauri/codeRun.js` | 46 | 2 | runCode, stopCode |
| 4 | `tauri/serial.js` | 60 | 3 | openSerialMonitor, refreshSerialPorts, getSerialPorts |
| 5 | `tauri/firmware.js` | 55 | 3 | deployMcu, eraseFilesystem, resetFirmware |
| 6 | `tauri/fileOps.js` | 183 | 9 | saveFile, saveFileAs, openFile, openExamples, pickFolder, pickDataFile, getProjectAnchor, newFile, createWindow |
| 7 | `tauri/backup.js` | 19 | 4 | checkStartupBackup, autoBackup, clearBackup, rejectRecovery |
| 8 | `tauri/window.js` | 41 | 8 | setWindowTitle, setDirty, closeWindow, closeEditor, backToHome ＋ alert/confirm/prompt（轉呼叫 `_handleNativeDialogs`） |
| 9 | `tauri/dataset.js` | **407** | 13 | openDatasetManager, datasetListCameras, datasetStartCamera, datasetGetCameraStatus, datasetStopCamera, datasetCaptureImage, datasetCollectFeature, datasetDeleteImage, datasetExport, datasetUploadArchive, datasetSaveProgress, datasetImportFromFolder, datasetLoadProgress |
| 10 | `tauri/training.js` | 54 | 4 | checkUpdate, stopRemoteTraining, openTrainingReport, openLatestTrainingReport |
| | **合計** | **1018** | **58** | 與實測 case 總行數逐字相符 |

### 3.1 保留在 `tauri.js` 的部分

| 內容 | 行數 | 理由 |
| :--- | ---: | :--- |
| `constructor` / `get capabilities` / `init` | ~60 | 類別骨架，必須在 class 上 |
| `send()` 新版骨架 | ~25 | 派送 + fallback |
| `_setupTauriListeners()` | 139 | 事件訂閱，與 case 派送無關，**獨立職責** |
| `_handleDatasetCommand()` / `_dispatchToFrontend()` / `_normalizeAnchor()` / `_refreshAnchor()` / `_confirmSaveBeforeOpen()` | ~150 | **被多個子模組共用的基礎設施**，留主檔供子模組以 `this.` 呼叫 |
| `_handleCloseDialog` / `_handleCheckUpdate` / `_handleExamplesSaveDialog` | ~170 | 各只被 1–2 個 case 用，可隨對應子模組搬走 |
| **原生對話框群**（`_handleNativeDialogs` + 3 個 `_showXxxDialog` + `_ensureDialogStyles` + `_escapeHtml`） | ~270 | **自成一個職責群，建議獨立成 `tauri/dialogs.js`** |

**預估最終**：`tauri.js` 從 1865 → **約 300 行**；新增 11 個子模組。

---

## 4. 耦合分析（決定哪些必須留在主檔）

實測各私有成員被多少 case 使用：

| 成員 | 使用 case 數 | 處置 |
| :--- | ---: | :--- |
| `this.tauriInvoke` | 40 | 保留主檔（子模組經 `this.tauriInvoke` 取得） |
| `this._dispatchToFrontend` | 29 | 留主檔 |
| `this.alert` / `prompt` / `confirm` | 11 | 來自 `base.js`，不動 |
| `this._handleDatasetCommand` | 10 | 留主檔（dataset.js 重度依賴，但其他群也可能用） |
| `this._normalizeAnchor` | 5 | 留主檔 |
| `this._refreshAnchor` | 3 | 留主檔 |
| `this._confirmSaveBeforeOpen` | 2 | 留主檔（fileOps 用） |
| `this._handleCloseDialog` | 2 | 隨 window.js |
| `this._getCurrentXml` / `_handleExamplesSaveDialog` / `_handleCheckUpdate` / `_handleNativeDialogs` / `tauriGetCurrent` | 各 1 | 隨對應子模組搬走 |

**狀態耦合**：`this._anchor`（`capabilities` + 5 個 case）、`this._datasetUploadChain`（僅 datasetUploadArchive）、
`this._firstLogReceived` / `this._isClosing`（僅 listeners / closeDialog）→ **全部保留在主檔 constructor**。


---

## 5. 三個必須先確認的語意陷阱

### 陷阱 1：`return` 與 `break` 的差別（原 switch 混用兩者）

原碼中部分 case 用 `return`（如 `runCode` 在未選埠時 `return;`），
部分用 `break`（走到底部 `result` 回傳）。改成 handler 表後，
**`return` 會直接離開 `send()`，而 `break` 會走到 switch 尾端的統一處理**。必須逐案比對。

### 陷阱 2：fallthrough 的空殼 case（**實測 4 組**）

這幾組是「多個 case 共用同一段 body」，機械式搬移時**不能拆開**：

| 空殼 case | 實際共用 body |
| :--- | :--- |
| `refreshSerialPorts` (L234) | 與 `getSerialPorts` 共用（fallthrough，自身 0 行） |
| `saveFile` (L254) | 與 `saveFileAs` 共用（body 內以 `command === 'saveFileAs'` 分流） |
| `alert` / `confirm` (L447/448) | 與 `prompt` 共用 → 呼叫 `_handleNativeDialogs` |
| `newFile` (L1020) | 與 `createWindow` 共用 |

⚠️ **`refreshSerialPorts` 目前只有 case 標籤、下一行就是 `case 'getSerialPorts'`**
（自身 body 為空）。搬檔時若只搬 `getSerialPorts` 的內容，
會讓 `refreshSerialPorts` 變成空 case → **靜默失效，不會報錯**。
**必須保留 fallthrough 關係**（機制上：handler 表讓 `refreshSerialPorts` 指向同一函式）。

### 陷阱 3：`switch` 尾部的統一處理

需確認原 `send()` 在 switch 之後是否有 `result` 回傳、錯誤處理或額外邏輯，
若有，新版 handler 表必須維持同等行為。

---

## 6. 執行順序（分階段，每階段可獨立驗證與 revert）

| 階段 | 內容 | 驗收 |
| :-- | :--- | :--- |
| **P0** | 建立 `tauri/sendHandlers.js` 骨架 ＋ 分派機制，**先只搬 1 個群**（建議 `backup.js`，4 case 19 行、依賴只有 `tauriInvoke`，最小） | 全量綠 ＋ 完整性比對通過 |
| **P1** | 依序搬 `manifest` → `window` → `firmware` → `serial` → `codeRun` → `pythonEnv` | **每搬一檔跑一次比對** |
| **P2** | 搬 `fileOps`（183 行）與 `training`（54 行） | 同上 |
| **P3** | 搬 `dataset`（407 行，最大、風險最高）＋ DM 全鏈回歸 | 同上 |
| **P4** | 抽 `tauri/dialogs.js`（原生對話框群，270 行） | 同上 |
| **P5** | 新增守門 `bridge_split_contract.test.mjs`；更新 `tauri_anchor.test.mjs` 與 `FILE_STRUCTURE.md` | 變異測試 |

**為什麼先用 `backup.js` 當先鋒**：它只有 4 個 case、共 19 行、依賴只有 `tauriInvoke`，
若 handler 表機制本身有問題（fallthrough、return 語意、this 綁定），這是最小成本的暴露點。

---

## 7. 完整性驗證方法（比照 P2-5，不靠「編譯通過」）

P2-5 的教訓：**編譯通過 ≠ 搬對了**（`#[tauri::command]` 留在段落尾端，編譯過但 command 未註冊）。
因此本次改用機械式比對，以 `git show HEAD:ui/src/bridge/tauri.js` 為基準：

| 檢查 | 判準 |
| :--- | :--- |
| **case 集合完全一致** | 58 個 command 名一字不多一字不少（**集合比對，非數量下限** —— P2-5 教訓：數量下限在重構中必然失效） |
| **每個 case body 逐字元相同** | 剝除縮排後比對字串 |
| **`tauriInvoke` 呼叫字串集一致** | 70 處 invoke 的命令名一字不差 |
| **`this.*` 引用成員集與次數一致** | 每個成員出現次數相同 |
| **fallthrough 組完整** | §5 陷阱 2 的 4 組必須仍共用 body |
| **行數守恆** | 子模組總行數 ＋ 主檔剩餘 ≈ 原 1865（± 檔頭註解） |

**變異測試**：守門寫完後刻意破壞（刪一個 case、把某 case 改名、拆散一組 fallthrough）確認會紅，再還原。

---

## 8. 風險與緩解

| 風險 | 緩解 |
| :--- | :--- |
| `return`／`break` 語意改變 | §5 陷阱 1 逐案比對；完整性比對含 body 字串 |
| fallthrough 組被拆開 → **靜默失效** | §5 陷阱 2 清單列入比對腳本硬檢查 |
| 多視窗／`emit_to` 受影響 | `_setupTauriListeners()` **完全不動**（保留在主檔） |
| 70 處 invoke 漏搬 | invoke 字串集完全一致比對 |
| `dataset.js` 407 行風險最高 | 排在 P3，且需 DM 全鏈回歸 |
| prototype／`this` 綁定問題 | 案 B 用 `handler.call(this, data)`，與原 `this.` 完全等價 |

---

## 9. 待您決定的事

1. **案 A / B / C 選哪個**（我推薦 **B**：command → 函式對照表）
2. **是否接受 10 個子模組 ＋ `dialogs.js`**（而非計畫原文的 4 個）
3. **`dataset.js` 407 行是否再細切**（例如相機群 / 標註群 / 進度群）
4. **是否先只做 P0**（最小驗證）看結果再決定 —— 我建議這樣，最穩
