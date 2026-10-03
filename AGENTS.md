# Cocoya 專案指南 (Codex/Copilot AGENTS.md)

## 專案概述
Cocoya 是一個針對 Python AI 視覺的教學工具。它透過 Blockly 產生 PC 端的 Python (AI) 與 MCU 端的 MicroPython (Hardware) 代碼。

## 技術規範
- **核心架構**：混合架構 (Hybrid)，支援 VSIX 與 Tauri 雙模共用前端 SSOT。
- **目標語言**：
    - PC: Python 3 (MediaPipe, OpenCV)。
    - MCU: MicroPython (XIAO S3 Sense, Maker Pi RP2040)。
- **通訊方式**：Serial (USB)。

### Tauri 2.0 安全與指令規範
- **指令權限二階段定義 (Permission Workflow)**：
    1. **定義 (Define)**：在 `src-tauri/permissions/` 下建立 `.toml` 或 `.json` 檔案（例如 `commands.toml`），定義 `identifier` 並將指令加入 `commands.allow` 陣列。
    2. **分配 (Assign)**：在 `src-tauri/capabilities/default.json` 的 `permissions` 陣列中引用該 `identifier`（例如 `"allow-all-commands"`）。
- **權限重要性**：若未完成上述二階段定義，指令在生產環境 (Release Build) 會被攔截，導致功能失效。
- **能力分發**：偏好透過 `bridge.capabilities` (前端) 查詢環境特性，而非直接檢查 `isTauri` 旗標。

### Rust 序列化命名規範 (serde camelCase)
- **坑例**：Rust `#[derive(serde::Serialize)]` 結構在 Tauri command 回傳時，欄位名**預設為 snake_case**（Rust 慣例），前端 JS 以 camelCase 讀取（如 `data.projectRoot`）會得到 `undefined`——**物件存在但欄位全 undefined**，log 極難察覺。
- **鐵律**：所有跨邊界（Rust → JS）的 `#[derive(serde::Serialize)]` 結構，**必須加 `#[serde(rename_all = "camelCase")]`**，使序列化欄位名為 `projectRoot` / `isAnchored` 等 camelCase。
- **前端雙保險**：可提供 normalize 函式相容兩種命名（如 `a.isAnchored ?? a.is_anchored`），並在解析處統一套用，避免未來欄位名變動造成回歸。
- **已踩坑紀錄**：
  - 2026-07-29 `ScanedImage.blob_url`（Rust 預設 snake → 前端 `img.blobUrl` undefined，縮圖失效）。
  - 2026-08-10 `ProjectAnchor.is_anchored`（`get_project_anchor` 未加 serde → 前端 `projectRoot` undefined，導致 Tauri live 影像 savePath 無法生成、拍照不落盤）。
- **驗證注意**：`cargo check` 僅保證 Rust 編譯，**不保證欄位命名符合前端期望**；新增 Rust → JS 回傳型別時，須以「前端實際讀到的欄位名」實機驗證一次。

### 多視窗完整性規範 (Multi-Window Integrity Protocol)
- **精準通訊（emit_to 鐵則）**：在 Tauri 後端發送「視窗專屬」事件時，**一律**使用 `window.emit_to(&label, "event-name", payload)`；**嚴禁**使用全域廣播的 `emit`（含 `window_clone.emit(...)`），否則事件會送達每個視窗的 listener，導致多視窗終端機/對話框互相污染。
  - `emit_to` 語法（與現有 `lib.rs` 的 `closeRequested` 相同）：
    ```rust
    // 指令開頭抓取本視窗 label（String），thread 內沿用
    let own_label = window.label().to_string();
    // 假設輸出執行緒持有 window_clone / window_clone_err：
    let _ = window_clone    .emit_to(&own_label, "python-log",   payload);
    let _ = window_clone_err.emit_to(&own_label, "python-error", payload);
    ```
  - **前端對應**：前端以 `getCurrentWebviewWindow().listen("事件名", cb)` 訂閱即可（`ui/src/bridge/tauri.js` 已一致採用 `appWindow.listen(...)`）。
  - **已轉換清單（SSOT）**：`run_python`（`python-log`/`python-error`）、`start_training`（`training-*`）、`deploy_mcu`、`open_serial_monitor`、`erase_filesystem`、`reset_firmware`（`python-log`/`python-error`）皆已由 `.emit()` 改為 `.emit_to(&own_label, ...)`。
- **視窗焦點切換／串列埠交接 (方案 B)**：多視窗下，串列埠監控採「失焦自動釋放、重新聚焦自動重取」。
  - 前端 `ui/src/bridge/tauri.js` 以 `document.addEventListener('blur'/'focus', ...)` 偵測視窗層級失焦/聚焦，呼叫 `this.tauriInvoke('set_window_focus', { focused: bool })`。
  - 後端 `mcu.rs::set_window_focus`：`focused=true` 時若該視窗有 `serial_wants`（曾開過監看-Label → 埠）且無啟用 session → 自動 `spawn_serial_monitor` 重取；`focused=false` 時 `stop_serial_monitor` 釋放（保留 wants 供下次聚焦重開）。
  - **狀態**：`AppState.serial_monitors`（視窗 label → 啟用中 session，含 child）、`AppState.serial_wants`（label → 想重開的埠/python_path/lang）。`stop_python` 亦一併釋放該視窗的 monitor，避免與執行/部署資源重疊。
- **原子化狀態同步**：前端在執行「儲存並關閉」流程時，必須 `await window.CocoyaBridge.send('setDirty', { isDirty: false })` 確保後端狀態更新後，才呼叫 `close_window`。
- **備份宣示權**：處理未命名備份時，必須遵循「偵測後立即重新命名為 `.recovering`」的宣示模式，確保同一個備份檔不會被多個視窗同時抓取。
- **強制鎖定**：後端 `save_file` 指令必須檢查路徑擁有者。若非目前視窗鎖定的路徑，必須回傳錯誤並由前端 Alert 提示使用者「另存新檔」。
### 行尾規範（LF/CRLF）三層防護（2026-10-03 根治）

> ### ⚠️ 先釐清：對「程式執行」幾乎沒有影響
>
> **實測（2026-10-03）**：Python/JS/Rust 的解析器會自動正規化行尾。
> 同一段程式碼存成 LF 或 CRLF，**執行結果一模一樣**，連多行字串常量裡都不會有 `\r`：
> ```
> CRLF 檔執行 -> ('42', 0)     LF 檔執行 -> ('42', 0)
> CRLF 多行字串 -> 'line1\nline2'    LF 多行字串 -> 'line1\nline2'
> ```
>
> **真正必須的是「全專案一致」，不是「一定要 CRLF」。**
> CRLF 只是本專案（Windows 專案：VSIX + Tauri）選定的一致性基準。
>
> **真正的危害在「用工具改檔」，不在「執行程式」** —— 逐行處理的批次腳本會壞：
> ```
> naive split(b'\n') 讀 CRLF 檔 -> [b'x\r', b'y\r', b'z\r', b'']   # 每行尾巴殘留 \r
> naive split(b'\n') 讀 LF   檔 -> [b'x',   b'y',   b'z',   b'']
> git：內容一字未改、只換行尾 -> status 仍顯示 'M a.txt'（假變更，污染 diff）
> ```
> 這些 `\r` 會導致：① 寫回時產生**混合行尾**（同一檔案 CRLF/LF 並存，最危險）
> ② 正則/內容比對失配 ③ 統計 off-by-one、hash 不符。
>
> **危害排序：混合行尾 > 純 LF 或純 CRLF 不一致 > 統一使用哪一種。**
> 混合行尾會讓同一檔案內不同行的行為不一致，才是我們要優先杜絕的。

**為何需要三層**：`.gitattributes` 的 `* text=auto eol=crlf` 只在「經過 git 的路徑」生效
（checkout / add / diff）。編輯器、Python 腳本、PowerShell **直接寫檔不經過 git**，
工作區就會變成 LF；而 git 把「工作區 LF + 轉換後 LF」視為無差異 →
**問題不會自己浮現，會靜態累積**（實測 2026-10-03：646 檔中 126 檔工作區是 LF，
其中 25 檔是混合行尾）。

| 層 | 機制 | 作用 |
| :--- | :--- | :--- |
| 1 預防 | `.editorconfig`（`end_of_line = crlf`） | 編輯器存檔當下就寫對，不需經過 git |
| 2 保險 | `.gitattributes`（`eol=crlf`） | git 取出時轉換 |
| 3 驗證 | `npm run eol:check`（`scripts/eol.cjs`） | 驗證；`npm run eol:fix` 修復 |

- **已接入 `npm run test:unit`**（末段），故 `npm test` 會擋。
- `scripts/eol.cjs` 的 `--list` 會把「混合行尾」與「純 LF」**分開列出**——
  前者危害大得多，應優先處理。
- `scripts/eol.cjs` 有**自我驗證機制**（`verifyAgainstGit`）：以 `git ls-files --eol`
  交叉比對，抓出「git 認定是 LF 但本工具沒掃到」的檔案 —— 沒有這道就會自以為全綠。
  實作當天即靠它抓出漏網的 `ui/.eslintrc.json`、`src-tauri/Cargo.toml`、
  `esp32s3_flash`（無副檔名的 shell 腳本）。
- **刻意排除**：`highlight.min.js` / `python.min.js`（vendored，`.gitattributes` 已標 `-text`）、
  `target/` / `out/` / `dist/` / `src-tauri/gen/`（產物）、`backup/`（歷史備份不得改寫）。
- **AI／腳本寫檔鐵律**：改檔案後一律 `npm run eol:fix` 收尾。
  Python 用 `io.open(p,'wb').write(data.replace(b'\r\n',b'\n').replace(b'\n',b'\r\n'))`，
  **不要用 `write_text()`**（預設寫 `\n`，會造成全檔 diff）。

### Task Type 命名統一鐵律（2026-10-03）
DM 專案類型（`typePolicy.ALL_TYPES`）、訓練任務類型（`TASK_TYPE` 下拉）、訓練模板目錄
**三者使用同一組名稱**：

| DM 專案類型 | 訓練 task type | 模板目錄 / 腳本 |
| :--- | :--- | :--- |
| `image_classification` | `image_classification` | `image_classification/image_classification_train.py` |
| `object_detection` | `object_detection` | `object_detection/object_detection_train.py` |
| `line_following` | `line_following` | `line_following/line_following_train.py` |
| `table` / `feature` | 同名 | 同名 |

- ✅ **三層名稱完全統一**（2026-10-03）。歷史名稱對照（改動時可能查到舊資料）：
  `image`（DM 舊）→ `image_classifier`（訓練舊）→ **`image_classification`**（現行）；
  `detector`（訓練舊）→ `object_detection`；`line_follower`（訓練舊）→ `line_following`。
- **新增 task type 必須同時滿足三處**：① `ai_inference_blocks.js` 的 `TASK_TYPE_OPTIONS`
  ② `ai_inference_generators.js` 的 `train_model` 分派 ③ `predict` 分派；
  若需 sidecar 訓練，還要同步 `dataset_sidecar.py` 的**兩處**映射（`task_scripts` L1066 / `script_rel` L798）。
  ⚠️ 另注意 **`ui/src/ui/dialogs.js` 的訓練對話框是第四處獨立定義**（與 `TASK_TYPE_OPTIONS` 無關），
  改 task type 時極易漏改——守門 `task_type_contract.test.mjs` ⑦⑧ 已涵蓋。
- **守門**：`ui/src/modules/ai_inference/task_type_contract.test.mjs`（8 測，掃描型，驗三處一致＋模板目錄存在＋sidecar 兩處映射＋舊目錄不得殘留）。
- **不做相容層**（2026-10-03 決策，Cocoya 尚未公開使用）：既有 `.xml`／`dataset.json` 中的舊 task type
  值會失效並回退預設值。**新增 task type 時不可假設舊資料相容。**
- **刻意不參與改名**（非 task type，改了會造成實際損害）：Docker 映像 `cocoya-train-classifier`
  （遠端已建映像失效）、範例資料夾 `AI_01_classifier`（教學路徑）、
  Python 模組 `common/classifier_dataset.py`／`classifier_model.py`、使用者自訂 `DATASET_DIR`。
- SSOT：`docs/dataset_types_matrix.md` §0（含命名對照規則與維護鐵律）。

### 訓練集切分鐵律：分層抽樣 (Stratified Split)
所有**帶類別標籤**的訓練模板，切分訓練/驗證集時**必須使用分層抽樣**（各類別依 `validation_split` 比例各自切分），**禁止**全域隨機切分（`shuffle + take` 或 `image_dataset_from_directory(validation_split=...)` 這類不分類別的切法）。

- **原因**：教學資料集普遍類別不平衡（例：none 32 / paper 124 張），全域隨機切會讓小類別驗證集樣本過少甚至為 0，驗證準確率失真且每次切分結果漂移。
- **已實作**：`common/classifier_dataset.py`（依資料夾類別）、`common/detector_dataset.py`（依 YOLO class_id）——兩者含教學保護（類別 ≥2 張時驗證/訓練各至少 1 張；切後為空明確報錯）與分層報告輸出（`分層抽樣 (stratified split): <類別>: train N / val M`）。
- **已查證結論（2026-10-02，P2-11 結案）**：
  - `line_following` **無類別欄位**（`class_id` 恆 0，UI 無類別選擇器、`typePolicy.needsUnclassifiedCheck()` 僅對 object_detection 為真）→ 屬**回歸型**，依鐵律**允許隨機切＋報告註明**，現行實作符合規範。切分報告標題須為 `隨機切分 (random split，線段回歸任務無類別欄位):`。
  - 若日後啟用多線型：改為依 `class_id` 分層（比照 `detector_dataset`），schema 零改動。
  - `table` / `feature` / `serial`（表格型資料集，schema 有 label 欄位）→ **依 label 欄位值分層**；回歸型（label 為連續數值）才允許隨機切，但需在報告註明。
  - 新模板實作時請重用既有分層切分函式，勿重新實作全域隨機切。
  - 證據工具：`temp_scripts/e2e_p211_line_split_check.py`（tempfile 夾具、自足）。

### 訓練資料集雙佈局鐵律（C2，2026-09-23）
影像系訓練模板（classifier/detector/line）的 `DATASET_DIR` **永遠填資料集根 `dataset/<名稱>`**，loader 內部自理佈局：
- **落盤佈局**（DM 日常，拍完即練）：`<label>/*.jpg` ＋ `dataset.json`（標註真相）——classifier 本來就是掃子資料夾；detector/line 的 loader 已加 fallback（`images/` 不存在時走此路），**不需匯出/扁平化**。
- **匯出佈局**（分享/第三方 YOLO 工具）：`images/` ＋ `labels/`（或 `lines/`）＋ `labels.txt`——`images/` 存在時優先走此路。
- 標註 SSOT 永遠是 `dataset.json`；`labels/*.txt`／`lines/*.txt` 是匯出期衍生品。切勿在落盤區手工造 `images/`（會觸發佈局 A 而其 labels 不完整）。
- 實作：`common/detector_dataset.py::_collect_dm_pairs`、`common/line_dataset.py::_collect_dm_lines`；e2e `temp_scripts/e2e_c2_check.py`。



### 前端狀態訊息慣例 (showStatusMessage)
Dataset Manager 的狀態/錯誤/結果訊息一律透過集中式函式 `showStatusMessage(message, options)` 顯示於 modal 頂部中央的 `#dataset-manager-message` 面板（**所有模式下皆可見**，含標註模式），取代直接寫入各處 `status.textContent` 或 `#dataset-import-status`。

- **定義位置**：`ui/src/modules/dataset_manager/ui/statusMessage.js`（`createStatusMessageUI()` 回傳 `{ showStatusMessage, dispose }`；`ui_layout.js` 於模組頂部初始化並以 `showStatusMessage` 常數暴露，供模組內各函式與 use-case 注入使用）。
- **行為**：
  - 顯示於 `#dataset-manager-message`（header 下方**常駐列**：寬度同 modal 內容、文字靠左；顯示/隱藏以 `visibility` 切換、保留排版空間，版面零位移）。
  - **預設 5 秒後自動隱藏**；可用 `{ duration }` 覆寫（`0` = 不自動清除）。
  - 顯示前會重置全域 `statusMessageTimer`，避免多筆訊息交錯時被舊計時器提前隱藏（例：上傳進度的連續更新以最後一筆起算 8 秒）。
  - 傳入空字串/`undefined` 立即隱藏。
- **用法**：
  ```js
  // 一般提示（8 秒後自動清除）
  showStatusMessage(t('SUCCESS_IMPORT_DATA', '✅ 成功匯入 %1 筆資料').replace('%1', rows.length));

  // 自訂顯示時間（毫秒）
  showStatusMessage('正在處理...', { duration: 8000 });

  // 立即隱藏
  showStatusMessage('');
  ```
- **鐵律**：
  - **禁止**直接寫 `document.getElementById('dataset-import-status').textContent = ...`，或針對標註模式另設專用狀態列；統一改走 `showStatusMessage(...)`，確保跨模式可見性與自動清除一致。
  - 進行中/成功/錯誤皆統一在此呈現；勿手動 `textContent = ''` 清理（由面板自動清除）。

### 產生器開發規範 (Generator Standards)
- **基準縮排 (Base 4-Space Indent)**: 
    - **強制要求**: 所有在產生器 (.js) 中以字串形式定義的靜態 Python 程式碼（例如注入 `generator.definitions_` 的輔助函式），**必須統一使用 4 個空白** 作為縮排基準。
    - **原理**: `ui/src/utils.js` 中的全域攔截器會自動偵測行首的 4 空白倍數，並根據使用者選定的 `INDENT` (如 2 或 8) 進行等比例縮放。若不遵守 4 空白基準，將導致全域區程式碼對齊失效。
- **路徑處理**: 
    - 專案內檔案與資料集路徑一律使用正斜線 `/` 作為統一分隔符號，在傳入後端平台前由通訊橋樑進行環境適配，避免 Windows 與 Unix-like 系統路徑斜線衝突。

- **字串語意比對前必先剝除不可見 ID 標記（2026-09-18 踩坑）**：
  - `ui/src/utils/generators.js` 的 `Blockly.Python.scrub_` 會為**所有具 output 連線的積木**前置不可見標記 `\u0001ID:<blockId>\u0002`（原始碼寫成 escape，實際是 U+0001/U+0002 控制字元）。
  - 因此 `generator.valueToCode()` 取出的字串**在產生期間是被污染的**；最終輸出會被 `workspace.js` 的 `replace(/\u0001ID:.*?\u0002/g, '')` 清掉 → 生成碼與畫面都看不出來（極難察覺的坑）。
  - 凡產生器要對 `valueToCode` 結果做**語意比對**（字典查表、腳位映射、字串相等、`JSON.parse`）之前，必須先除標記。
  - SSOT 實作：`ui/src/modules/hardware/hardware_blocks.js` 的 `CocoyaBoard.normalizePinRef()`（`resolveGpio` 入口統一施作，hardware 與 mcu_car 共用）；產生器顯示用 `cocoyaNormalizePinRef` / `mcuCarNormalizePin`（含防禦性 fallback）。
  - 回歸測試：`ui/src/modules/hardware/pin_resolve.test.mjs`（`cd ui; node --test "src/modules/hardware/*.test.mjs"`）。
### Python 子進程編碼鐵律 (UTF-8 I/O, 2026-09-02 蒸餾)
Cocoya 混合架構（VSIX + Tauri）兩端都會以 Python 子進程執行訓練/轉換/部署腳本。Windows 下子進程輸出若為 UTF-8、而父端以 locale(cp950) 解讀，會造成 `UnicodeDecodeError` 或終端機亂碼。**所有子進程 I/O 一律強制 UTF-8，雙平台根本解決，不依賴環境變數/locale。**

- **產生器產出的 Python 碼（`ai_inference_generators.js` 等 `train_model()`）**：`subprocess.Popen(..., text=True, encoding="utf-8", errors="replace")`——**必帶** `encoding="utf-8"`（父端解碼固定 UTF-8）。
- **Tauri/VISX Host 啟動 Python**：
  - Rust `run_python` / `start_training` / sidecar：`Command.env("PYTHONIOENCODING","utf-8").env("PYTHONUTF8","1")`。
  - VSIX `envOps.ts handleRunCode` spawn：`env: { ...process.env, PYTHONIOENCODING:'utf-8', PYTHONUTF8:'1', ... }`。
- **Python sidecar（`dataset_sidecar.py`）內部子進程**：所有 `Popen`/`check_call` 帶 `encoding="utf-8", errors="replace"`（trainLocal Popen、TFLite 轉換 Popen、pip 安裝）——先前 trainLocal Popen 漏帶曾致 cp950 亂碼。
- **被執行的模板/腳本本身**：`classifier_train.py`/`detector_train.py` 開頭 `sys.stdout/stderr.reconfigure(encoding='utf-8', errors='replace')`；檔案寫入 `open(..., encoding='utf-8')`。
- **檢查項目**：新增任何啟動 Python 子進程或產生器注入子進程碼時，務必 4 者全帶：(1) 產生器 Popen `encoding`、(2) Host env `PYTHONIOENCODING/PYTHONUTF8`、(3) sidecar 內部 Popen `encoding`、(4) 腳本 `reconfigure`/`open encoding`。漏帶會重現 cp950 亂碼。

### 轉義字元與換行處理規範
當處理 Blockly 產生器 (.js) 與產出的 Python/MicroPython 代碼時，必須严格遵守以下規範：
1. **產生器 JS 中的字串與換行**：
   - **實體換行禁止**：在單引號 `'` 或雙引號 `"` 定義的字串中，絕對禁止出現實體換行。若需換行，必須寫成 `\\n` (透過工具寫入時) 或 `\n` (執行時)。
   - **模板字串**：在 JS 中使用反引號 `` ` `` (Template Literals) 時，可以使用實體換行，這在注入長篇 Python/C 類別時最為安全。
2. **代碼產出規範**：
   - **代碼換行**：產生器 `return` 的字串中，若要讓生成的程式檔換行，請在字串結尾加上 `\n`。
   - **正規表達式**：在 JavaScript 中使用反斜線的字串或 Regex 時，注意層級轉義，確保在最終生成的代碼中反斜線維持正確的字面量。

## 開發慣例
- **積木與產生器**：參考 `piBlockly` 風格，模組化設計。
- **代碼風格**：
    - Extension: TypeScript (Strict)。
    - Webview: ES6 JavaScript。
- **終端機**：使用 PowerShell 作為預設終端機。
- **系統規格書**：`docs/system_spec.html`。
    - **強制規範**：在進行任何積木或產生器開發前，**必須先詳細閱讀系統規格書**，以確保 ID 注入機制、轉義字元 (\\n) 與 AI 座標規範被嚴格執行。
- **日誌與備份保護原則**：
    - **日誌追加保護 (Append-Only)**：異動需記錄於 `log/work/yyyy-mm-dd.html` 與 `log/todo.md`。處理 `log/` 下的檔案時，**嚴禁**使用覆寫，必須先讀取全文，將新內容串接在舊內容之後再寫入，不得刪除歷史紀錄。
    - **覆寫前置備份**：如果因結構重整必須使用 `write_file` 覆寫任何檔案，**必須先備份**原檔到 `backup/` 資料夾，檔名加入時間戳記 (yyyyMMdd_HHmmss)。

### 資源路徑處理規範 (Resource Path Resolution)

Cocoya 是混合架構（VSIX + Tauri），資源路徑的解析方式因平台和執行模式而異。以下是各情境的處理方式：

#### VSIX Extension 模式
- **開發/生產一致**：使用 `context.extensionPath` 作為基準路徑
  ```typescript
  const examplesDir = path.join(this.manager.context.extensionPath, 'examples');
  ```
- **資源位置**：相對於 VSIX 套件根目錄，與 repo 結構一致
- **實作參考**：`src/handlers/fileOps.ts` 的 `performSave()` 和 `handleOpenFile()`

#### Tauri 模式
- **開發模式 (cargo tauri dev)**：優先使用專案根目錄的原始檔案
  ```rust
  // 開發模式：直接從專案根目錄解析
  let mut dev_path = std::env::current_dir().unwrap();
  if dev_path.ends_with("src-tauri") { dev_path.pop(); }
  dev_path.push("examples");
  ```
- **生產模式 (Release Build)**：從 `BaseDirectory::Resource` 解析打包後的資源
  ```rust
  // 生產模式：從 Resource 目錄解析
  handle.path().resolve("examples", tauri::path::BaseDirectory::Resource)
  ```
- **資源打包設定**：在 `src-tauri/tauri.conf.json` 的 `bundle.resources` 中定義映射
  ```json
  "resources": {
    "../resources/deploy_mcu.py": "resources/deploy_mcu.py",
    "../ui/src/core_manifest.json": "resources/core_manifest.json",
    "../resources/firmware": "resources/firmware",
    "../ui/src/modules": "resources/modules",
    "../docs/help": "docs/help",
    "../examples": "examples"
  }
  ```
- **實作參考**：`src-tauri/src/utils.rs` 中的 `get_resource_path()`、`get_examples_path()`、`get_deployer_path()`、`get_firmware_dir()`

#### 關鍵原則
1. **開發模式優先使用原始檔案**：Tauri 開發時應直接指向 repo 內的原始路徑，而非 `target/debug/` 下的副本，這樣修改才能即時生效
2. **生產模式使用 Resource**：Release build 時所有資源透過 `bundle.resources` 打包，執行期透過 `BaseDirectory::Resource` 解析
   - **examples 播種 (Seeding, 2026-09-17)**：examples 需可寫場景（升級補檔、未來還原範例）不依賴安裝目錄可寫性。`setup` 呼叫 `utils::ensure_examples_seeded()`：首次啟動/升級時以 `copy_dir_merge`（**只補缺檔、不覆寫**）把 Resource examples 播種到 `app_data_dir()/examples`（`%AppData%\com.cocoya.app\examples`）＋寫入 `.seeded_version` 版本戳記。`get_examples_path()` 生產分支優先回傳已播種目錄（以戳記判定），fallback 回 Resource。Dev 模式（`is_dev_examples_dir()`）跳過，仍用 repo 原始檔。**唯讀保護流程不變**：examples 內開啟仍走「複製並開啟」（`resolve_example_open_path`）
3. **VSIX 無需區分模式**：`context.extensionPath` 在開發和生產行為一致
4. **路徑保護**：內建範例目錄（examples）應設為唯讀保護，防止使用者意外覆蓋。VSIX 在 `fileOps.ts` 檢查路徑前綴，Tauri 在 `file.rs` 的 `save_file` 中檢查 `path.starts_with(&examples_dir)`

### 環境診斷套件清單 (Python Module Check SSOT)
Python 套件檢查清單統一由 `config/python_modules.json` 定義，VSIX 與 Tauri 兩端皆從此讀取：
- **Rust 端**：`src-tauri/src/commands/python.rs` 的 `check_environment` 函數，從嵌入的 `PYTHON_MODULES_JSON` 常數解析
- **TypeScript 端**：`src/handlers/envOps.ts` 的 `handleCheckEnvironment`，透過 `fs.readFileSync` 讀取 JSON
- **前端渲染**：`ui/src/ui/hardware.js` 的 `updateEnvironmentStatus` 直接使用後端傳來的 `modules` 陣列
- **修改規範**：只需修改 `config/python_modules.json`，三個檔案自動同步（但 Rust 端需手動更新內嵌常數後重新編譯）

### Dataset Manager 訊息責任定義 (Message Responsibility, 2026-09-01 Stage 6)
四層各自的訊息/錯誤責任邊界（SSOT；重構計畫 §8.1 落成）：
- **UI（webview, `ui/src/modules/dataset_manager/`）**：
  - 通訊一律經 `io/bridge.js`（唯一 Bridge Port），禁止 direct `window.CocoyaBridge`。
  - 負責：使用者可見文案（i18n `t()`）、確認/警告對話框、狀態訊息呈現（`ui/statusMessage.js`）。
  - 錯誤呈現規則：後端回傳 `errorCode`（或 `CODE: message` 前綴）→ 前端由 i18n key 或 fallback 翻譯為人類可讀文案；**禁止在 core/application 層 hard-code 中文**（`spec.js` 直用 `t()` 為 transitional boundary，不得新增同類耦合）。
- **VSIX Host（`src/handlers/datasetOps.ts`）**：message dispatch → sidecar/橋接；canonical path 權威判定與檔案操作；回傳結構化資料/errorCode，**不做 i18n、不回傳 UI 文案**。
- **Tauri（Rust commands）**：command 回傳一律 serde camelCase；視窗專屬事件用 `emit_to`；路徑 confinement（examples 唯讀、canonical dataset 閘）由後端權威執行。
- **Sidecar（`resources/dataset_manager/dataset_sidecar.py`）**：影像掃描、相機、匯出打包；stdout JSON 單一回應；永不直接與 UI 對話（經 Host/Rust 轉發）。
- **鐵律**：錯誤「碼」在後端定義（如 `PROGRESS_NOT_FOUND`、`PROJECT_NAME_INVALID`），人類可讀文案由前端 i18n（`DSM_*`）負責；後端禁止輸出展示用文案。

### Dataset Manager 結構面板與縮圖同步契約 (Structure Panel & Thumbnail Sync, 2026-09-17)
兩條新契約（bug 修復蒸餾；違反會直接重現「拍照後標籤管理 UI 消失」與「改名後 hover tip／spec 檔名不同步」）：
- **`#dataset-structure-content` 是複合容器 → 嚴禁覆寫其 innerHTML**：P2（2026-09-16）起，影像系與所有 live 類型的結構面板內容為 `#view-label-class-manager`（統一標籤管理器）＋ `#view-label-stats`（統計），由 `ui_layout.js` 的 `renderStructurePanel()` 建立。
  - 統計更新 → **只寫 `#view-label-stats`**（`renderStatsPanels()` 優先路徑；內含守門：管理器在、統計容器不在 → 自動 `renderStructurePanel()` 重建，不覆寫父容器）。
  - 需要重建整面板 → 呼叫 `renderStructurePanel()`（或各模組注入的 `refreshStructurePanel`）。
  - **禁止** `UIComponents.renderLabelStats(structureContainer, ...)` 指向 `#dataset-structure-content`——會把管理器整塊蓋掉（事故紀錄：P2 的 sampler/feature、2026-09-17 的 `addSampleFromSampler`/`handleDeleteImage`）。
- **改動 `img.path / img.label / img.diskPath` 後必須重繪縮圖**：`refreshPreview()` 只做 spec sync／驗證／JSON 預覽／autosave，**不碰縮圖 DOM**；縮圖徽章與 hover tooltip（`title` 吃 `img.path`）必須呼叫 `refreshThumbnailBadges()`（`ui_layout.js`；標註模式重繪 `#annotation-thumbnails`、列表模式重繪 `#dataset-image-preview` 並保留捲動位置）。
  - 標籤改名的磁碟對帳一律走 `application/labelRenameReconcile.js::reconcileRenamedPaths()`：兩端路徑經 `core/pathPolicy.normalizePath` 比對（後端 `renames` 已正規化為正斜線，`img.diskPath`＝capture `savePath` 可能為反斜線 → 不正規化必 miss，導致 spec `image_path` 只更新目錄段、檔名停留舊值）；檔名唯一時以 basename 兜底。
  - 測試 SSOT：`node --test "src/modules/dataset_manager/*.test.mjs" "src/modules/dataset_manager/**/*.test.mjs"`（2026-09-17 為 141/141）；`node --test <目錄>` 目錄模式會誤把 `index.js` 當入口，勿使用。
- **「資料集名稱」＝落盤命名空間（`dataset/<名稱>/`），不是可自由改的顯示名**（2026-09-17 政策）：
  - 名稱同時餵給 5 條路徑契約：autosave（`progressUseCases.js`）、live 拍照 savePath（`datasetOps.ts`/`tauri.js`）、標籤改名磁碟同步（`datasetRenameLabel`）、匯入閘門 canonical、匯出 staging（VSIX 用 `spec.project.name`；Tauri 只複製 `sourceFolderPath`）。
  - **未落盤可自由改名**：`dataset/<名稱>/` 由後端在第一次落盤時 `create_dir_all` 建立，無落盤時改名零副作用（不得為了改名預先建立空目錄）。
  - **已落盤改名不會搬移既有檔案**（B 案未實作）→ 前端以 `core/projectNaming.detectDatasetNameDrift()` 偵測（證據僅取既有 state：`img.diskPath` 反推、`sourceFolderPath`）並標紅＋`NAME_DRIFT_TIP` 提示；取不到證據一律視為無漂移（保守，不誤報）。
  - B 案（`dataset_rename_dataset_dir`：舊目錄不存在→no-op 不建立；存在→整目錄搬家＋對帳 `img.diskPath`/`base_dir`）列 backlog，見 `log/todo.md` 與 `log/plan/DatasetManagerTypeLockedWorkflow.md` §12。

## 重要路徑
- **模組路徑**：`ui/src/modules/` (雙模共用內建模組 SSOT)。
- **模組快取路徑**：`globalStorage/modules/` 為 VS Code Extension 執行期快取位置，不是 repo 內固定目錄。
- **Python 套件檢查清單**：`config/python_modules.json` (SSOT 單一事實來源)

---
## Tauri 跨語言 Invoke 簽名同步規範 (Rust <-> JavaScript / VSIX)
目的：防止類似 `reset_firmware` 的 Bug — Rust #[tauri::command] 增改參數，前端 Invoke 端未同步 -> 執行期 `invalid args '<name>' for command '<cmd>'`。
### 鐵則
1. **增改任意 Tauri command 的參數時，必須同步更新**：
   - Tauri 前端 ui/src/bridge/tauri.js：this.tauriInvoke('<command>', { camelCase對應 })。
   - VSIX 前端 ui/src/bridge/vsix.js -> cocoyaManager.ts -> src/handlers/<module>Ops.ts Handler。
   - **命名對應**：Tauri 自動 camelCase<->snake_case (serialPort<->serial_port, shouldClear<->should_clear, pythonPath<->python_path, serialUploadOnly<->serial_upload_only)。
2. **Rust 參數類型**：跨邊界可選/字串參數應對應前端 Optional/String；必要串列埠等應改為 Option<String> 並在 Rust 內部驗證 (ref: reset_firmware / erase_filesystem)。
3. **驗證**：改簽名後必執行 `cargo check` + `npx tsc --noEmit -p tsconfig.json` + `node --check ui/src/bridge/*.js` 三者聯通才合格。
4. **SSOT**：docs/backend_api_manifest.md 為命令簽名單一事實來源 (含 Parameters)；改簽名時立即更新。
### 長期解決方案
- 引入 tauri-codegen 自動從 #[tauri::command] 簽名生成 typed invoke() — 缺參數將在 tsc 編譯期失敗 (見 log/todo.md 待辦)。

---
## 新增積木模組檢查清單 (Add New Block Module Checklist)
新增一個積木模組（含分類）時，依序確認以下項目：
### 1. 模組本體（必改）
- `ui/src/modules/<新模組>/<名稱>_blocks.js`：積木定義，顏色用 `"colour": Blockly.Msg["COLOUR_XXX"]`
- `ui/src/modules/<新模組>/<名稱>_generators.js`：Python 產生器（註冊於 `Blockly.Python.forBlock[]`）
- `ui/src/modules/<新模組>/toolbox.xml`：分類寫法 `<category name="%{BKY_CAT_XXX}" colour="%{BKY_COLOUR_XXX}">`
- `ui/src/modules/<新模組>/i18n/zh-hant.js`、`en.js`：積木文案
- 模組註冊：core_manifest.json / module_loader 對應清單
### 2. 顏色 SSOT（必改）
- `ui/src/zh-hant.js` 與 `ui/src/en.js`：定義 `"COLOUR_XXX": "#色碼"`（兩邊同值）——這是所有主題的預設色 fallback
- i18n 文案鍵：`BKY_CAT_XXX`（分類顯示名）
### 3. 主題選配（可不改）
- 各主題 `ui/src/modules/theme_manager/themes/*.js` 的 `msgColours`：**有定義才覆寫**該分類在該主題下的顏色；不加 = 沿用第 2 點的預設色，不會壞
- 若新分類要參與深色行為（icon 反轉等）：無需處理，由主題 `isDark` class 自動涵蓋
### 4. 文件（必改）
- `docs/help/<積木id>_{zh-hant,en}.html`：右鍵 Help 文件
- `FILE_STRUCTURE.md`：模組目錄描述
### 5. 驗證
- `node --check` 所有新 JS；`npx vite build`（ui/）；實機檢查 toolbox 分類、flyout 積木色與產生的 Python 代碼
### 注意
- 主題切換採「存偏好 + reloadWebview」：VSIX 由 host 重建 HTML（cocoyaManager.ts reloadWebview case）、Tauri 為 location.reload()；新模組無需處理此機制

### 測試執行分層守門 (Test Gating, 2026-09-30／2026-10-01／2026-10-02 更新)
本專案 Node 測試共 **40 檔 282 例**（Batch 0 +30；Batch 1 P1-1/P1-2 typePolicy 單一來源守門 5＋P2-6-b 跨橋 capabilities 對帳 3＋P2-6 ui_components 呈現路徑守門 5；使用者回報修正 ui_canvas 標註畫布 +13；2026-10-02 P1-3 CSS token 化：`dataset_theme_contract` 守門 4 判準升級＋守門 5、`theme_contract` 守門 7 全專案化 +3），全量約 **1.0 秒**。**不同階段只跑該跑的層級**，避免浪費時間與 AI 對話 token。

| 層級 | 指令 | 適用時機 | 內容 |
|---|---|---|---|
| **L0** | `npm run test:fast` | 每次改完碼 | 依 `git diff` 自動挑必要測試（同名 → 同目錄 → 模組 glob），只輸出摘要 |
| **L0 指定** | `npm run test:fast -- <檔案…>` | 明確知道改到哪 | 手動指定變更檔 |
| **L1** | `npm run test:dm` / `test:core` / `test:theme` | 一個功能切片完成 | 單一模組 |
| **L2** | `npm run test:ui` | 階段／Batch 收尾、提交前 | 全量 282 例 |
| **L1.5** | `npm run lint:ui` | 改了 `ui/src/**` 的 JS | ESLint（`ui/.eslintrc.json`） |
| **L2 全閘** | `npm test` | 發布前 | compile + lint(ts) + lint:ui + 全量 |
| **其他** | `npm run test:rust` / `cargo check` | Rust 異動 | 不併入 `npm test` |

- **`lint:ui` 規則現況**（2026-09-30 建置）：`ui/.eslintrc.json` 以 `eslint:recommended` 為基底、掃描 **191 檔**（154 個 `.js` ＋ **34 個 `.mjs` 測試檔** ＋ 3 個共用夾具），**現況 0 error**。
  - 必須宣告的 globals：`Blockly`／`CocoyaLoader`／`CocoyaUtils`／`CocoyaMediaUri`／`CocoyaBoard`／`acquireVsCodeApi`／`hljs`（缺了會噴 2401 個 `no-undef`）。
  - `overrides`：`src/**/*.test.mjs` 與 `test/**` 加 `env: node`（測試在 Node 跑，會用到 `process`／`setImmediate`；漏了會噴 `no-undef`）。
  - `ignorePatterns: ["*.min.js"]` 排除第三方 vendored 資產（`highlight.min.js`／`python.min.js`）。
  - **掃描範圍必須含 `.mjs`**：指令為 `eslint ui/src ui/test --ext .js,.mjs`。僅掃 `.js` 會漏掉全部 34 個測試檔，導致「IDE 有報、`npm test` 卻全綠」的守門缺口。
  - **三條刻意關閉，各有設計事實，不得為了「綠燈」打開**：
    - `no-control-regex` — `\u0001`／`\u0002` 不可見 ID 標記（見上方「字串語意比對前必先剝除不可見 ID 標記」段落），全專案 5 處刻意使用。
    - `no-regex-spaces` — `  # ID:`（2 空格）與 `/^(    )+/`（4 空格）是 ID 注入與 Python 基準縮排的**契約本身**，6 處刻意使用。
    - `no-empty` — 27 處刻意 no-op 區塊（no-op 監聽、預設回呼），與根 `.eslintrc.json` 決策一致。
  - `no-unused-vars` 用 `argsIgnorePattern: "^_"`：**對外 API 簽名不得刪參數**（如 `window.open(url, _name, _specs)` 必須維持瀏覽器 API 契約），此類加底線而非移除。
- **Blockly generator 簽名慣例**：statement 型由 `statementToCode` 以 `generator(block)` 呼叫、value 型由 `valueToCode` 以 `(block, name, order)` 呼叫。**不引用 `generator` 的函式不宣告該參數**（專案已有 `function(block)` 先例）；此處不受 `argsIgnorePattern` 保護，寫 `(block, generator)` 卻不用會被 lint 擋下。

- **測試 SSOT 執行方式**：`ui/` 目錄下 `node --test "src/**/*.test.mjs"`（**勿用目錄模式**，會誤把 `index.js` 當入口，見上文 DM 測試段落）。
- **自動挑測試的規則**（`scripts/test-related.cjs`）：`*_blocks.js`／`*_generators.js`／`toolbox.xml`／任何 `i18n/*.js`／`src/zh-hant.js`／`src/en.js`／`core_manifest.json`／`theme_manager/themes/*.js` 一律納入 `core_contract.test.mjs` 契約對帳；`theme_manager/themes/*.js` 另納入 `theme_manager/theme_contract.test.mjs`（三主題 cssVars 鍵集合一致，2026-10-01 Batch 0 新增）。
- **AI 協作紀律**：迭代中一律用 `npm run test:fast`，且不得把子行程完整測試輸出灌入對話（`test-related.cjs` 已於輸出落地前過濾為摘要 + 失敗明細）。
- **計時器洩漏紅線**：測試中呼叫會啟動 `setTimeout` 的 API 時，必須傳明確 `duration` 或於測試結束前 `dispose()`。未清除的 timer 會吊住 Node event loop，單檔實測多等 5 秒（`ui/statusMessage.test.mjs` 曾因此讓全量測試 5.7s → 0.6s 失守）。
- **禁止真等待驗 debounce（2026-10-01 踩坑）**：要驗「N 毫秒後才觸發」**必須用 `t.mock.timers.enable({ apis: ['setTimeout'] })` ＋ `t.mock.timers.tick(N)`**，不可 `await new Promise(r => setTimeout(r, N+100))`。`node --test` 會**並發**執行同一檔內的測試，真等待會疊在同一時間軸上：3 個 2.1 秒的 debounce 測試曾讓單檔耗時 6.4 秒。改 mock 後 112ms，且能在同一 tick 內驗「1999ms 不送／2000ms 送一份」這個真等待根本驗不到的邊界。
- **新守門一律做變異測試（2026-10-01 確立）**：新增契約測試後，必須**刻意破壞來源碼確認測試會紅**，再還原（`git status` 確認乾淨）。只驗「綠燈」無法區分有效守門與假安全感 —— 稽核計畫 §9.2 正是本專案「測試很多但抓不到 bug」的病根。
- **測試替身必須反映真實介面契約（2026-10-01 踩坑）**：替身方法的**回傳型別**也是契約。例：`persistence.setDirty` 直接回傳 `CocoyaBridge.send()` 的結果，替身若回傳 `undefined` 則 `await setDirty` 不構成任何保證。寫替身前先讀被測函式的回傳路徑。
- **清單式守門 vs 掃描型守門（2026-10-01 確立）**：清單式（列幾個檔案、檢查幾個字串）永遠只等於「當初想到的範圍」；掃描型（遍歷目錄、對整條不變式斷言）才會持續生效。P1-1 依計畫原文改了 4 個檔案，實際有 7 個檔案 16 處 —— 漏掉的 `core/stats.js` 是被新增的掃描型守門抓出來的。
- **跨端檢索鐵則（2026-10-01）**：判定「某符號無使用點」必須同時檢索**前端 `ui/src` ＋ VSIX Host `src` ＋ Rust `src-tauri`**。混合架構中同一份邏輯分散三處，只掃一端會得出假陰性（`isRemoteConnected` 的誤判即為此例）。
- **等價改寫必須逐一列舉真值表（2026-10-01）**：把 `A === 'x' ? P1 : (B === 'y' ? P2 : P3)` 改寫為 predicate 時，先列出原表每一列再比對。三段式的**預設分支**最易改錯，且新 predicate 通常仍能通過大部分測試（多數測試只覆蓋兩三種類型）。
- **掃描型守門不可過度寬泛（2026-10-01）**：**過寬比沒有守門更糟** —— 只會逼人無聲放寬斷言。`ui_components` 的屬性插值掃描第一版把 `index`（計數器）、`c.id`、七八個 class/style 三元全判紅，收斂為只抓「裸識別字插值進 `attr="${}"`」才可用。白名單項**必須附原因**（如 `index` 是 `map` 產生的 0,1,2…，不可能承載 `"`）。
- **稽核計畫是待查證的假設，不是結論（2026-10-01）**：P2-6 寫「`ui_components.js` 與 `panels.js`／`thumbnails.js` 職責重疊」，逐一比對後**查無可刪函式**（5 方法全有呼叫端，兩個對象職責清晰互不重疊）。**記錄「查無重疊」並留下證據，比硬湊一個刪除動作更有價值** —— 為湊敘事而刪活程式碼，是稽核最容易造成的實際危害。
- **既有檔案可能是空殼（2026-10-01）**：`ui_components.test.mjs` 檔案存在卻**無任何測試**，先前因「檔案存在」而誤以為已有覆蓋。新增守門前先確認測試檔真的非空。
- **行為測試碰不到內部函式時會變成假安全感（2026-10-01 踩坑）**：`syncLabelMap()` 是 `ui_layout.js` 的**內部函式（非 export）**。我寫的「改名後顯示新名稱」測試只是**手動改 labelMap 再自己呼叫 render()** —— 等於把答案餵給自己。mutation（刪掉真正的 `UICanvas.render()`）後**全部測試仍全綠**。改用**掃描型守門**（讀原始碼斷言函式本體含 `render()`）後同一 mutation 立刻報紅。**判準只有一個：真實迴歸時會不會變紅 —— 靠 mutation 確認，不是靠綠燈。**
- **改畫布狀態要注意 render 的既有 early-return（2026-10-01）**：`ui_canvas.js` 的 bbox 分支有 `if (!this.state.isDrawing) return;`。新增「游標位置」等狀態若沿用這個 early-return，會導致新功能**只在拉框時出現**（非拉框時不重繪）。
- **CSS 註解內的「星號＋斜線」序列會提前閉合註解（2026-10-02 踩坑）**：`dataset_manager.css` 檔頭註解寫了 glob（`src` 後接星號＋斜線再接副檔名），其中的星號＋斜線被 CSS 解析器當成**註解結束符** → 註解提前中斷、後文被當選擇器解析（VS Code 報「必須是左大括號」）。**同一序列在 `.mjs` 的 JSDoc 裡會造成 JS 語法錯誤**（寫說明時最易再犯）→ 檔內舉例一律改用描述性文字，**不寫字面**。**為何全綠**：`npm test` 不含 `vite build`、也不掃 `.css`，CSS 語法壞掉只有 vite/lightningcss 抓得到 → 已補守門 7（掃 `ui/src/**/*.css`：註解提前閉合 ＋ 大括號平衡，先剝註解再計數）。**CSS 刪除範圍以「選擇器首行 ~ 收尾 `}`」為單位，改完必跑 `npx vite build`。**
- **契約守門禁用「代理指標」（2026-10-02）**：判準必須落在真不變式（**有效值**）上。守門 4 原判「有沒有 dark 覆寫」，token 化後兩個方向都錯：把「全走雙主題 token、不需覆寫」的正確寫法誤判缺失（假紅），又放行「有覆寫但覆寫成同值」（假綠）。改為解析 `var()` → 讀主題 cssVars 真值 → 逐顏色屬性比對。
- **選擇器跨多行時，刪除規則不可只從 `{` 行起算（2026-10-02）**：會留下裸選擇器行，而**裸選擇器行語法合法**（被下一條規則的選擇器接續）→ 語法層自檢（大括號平衡、行尾逗號）**全數抓不到**，只在該元素暗色下多吃一條規則（靜默視覺回歸）。判準只能落在語意上；自檢**不可照抄偵測邏輯**（只驗到複製品），須直接呼叫被測函式。
- **「dark 覆寫」優先改寫為「雙主題 token」（2026-10-02 P1-3）**：若覆寫只是「深色底需要更明顯／更亮的值」（如 focus ring `0.15`→`0.3`），那它是**主題感知值**而非主題差異 → 收斂為單一 token（三主題各給值）並整組刪除 dark 覆寫。只有涉及**結構**（如 `:not(.cocoya-light-mode)` 的 VS Code 越權修正）才留在 CSS。SSOT 是 `theme_manager.js` 的 cssVars（寫在 body 行內樣式 → CSS 字面值無法被新主題覆蓋，此即 P1-3 的病根）。


### i18n 契約守門 (2026-09-30 T2)
`ui/src/modules/core/core_contract.test.mjs` 已涵蓋 `core_manifest.json` **全部 22 模組**，並含 3 項 i18n 守門：
1. blocks／generators 中 `Blockly.Msg['KEY']` 引用的鍵，雙語系皆有定義
2. 根 `zh-hant.js` 與 `en.js` 鍵集合完全相同
3. 各模組 `i18n/` 兩語系鍵集合相同

- **新增積木／文案時必須讓這三項維持綠燈**；紅燈代表真的缺字，**處理方式是補鍵，不得放寬斷言**。
- 白名單僅限**已查證的設計事實**且必須附原因（見檔內 `UNPUBLISHED_BLOCKS`／`ORPHAN_GENERATORS`／`BLOCKLY_BUILTIN`）。
- **掃描 blocks／generators 的 i18n 鍵時，只認 `Msg['KEY']` 語法**：物件字串鍵（如 `mcu_car` 的 `note_map = {"CS":1,...}`）與產生 Python 的字串常數（如 `'V2'`）都不是 i18n 引用，會造成假陽性。
- toolbox 公開集合**包含 `<shadow type="...">`**（影子積木刻意不置於頂層，但確實被 toolbox 引用）。

