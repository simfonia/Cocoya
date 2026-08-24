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

### 前端狀態訊息慣例 (showStatusMessage)
Dataset Manager 的狀態/錯誤/結果訊息一律透過集中式函式 `showStatusMessage(message, options)` 顯示於 modal 頂部中央的 `#dataset-manager-message` 面板（**所有模式下皆可見**，含標註模式），取代直接寫入各處 `status.textContent` 或 `#dataset-import-status`。

- **定義位置**：`ui/src/modules/dataset_manager/ui_layout.js`（模組級 function 宣告；因 hoisting 可於檔案任何位置之函式內呼叫）。
- **行為**：
  - 顯示於 `#dataset-manager-message`（header 下方中央，flex 置中顯示）。
  - **預設 8 秒後自動清除**；可用 `{ duration }` 覆寫（`0` = 不自動清除）。
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
3. **VSIX 無需區分模式**：`context.extensionPath` 在開發和生產行為一致
4. **路徑保護**：內建範例目錄（examples）應設為唯讀保護，防止使用者意外覆蓋。VSIX 在 `fileOps.ts` 檢查路徑前綴，Tauri 在 `file.rs` 的 `save_file` 中檢查 `path.starts_with(&examples_dir)`

### 環境診斷套件清單 (Python Module Check SSOT)
Python 套件檢查清單統一由 `config/python_modules.json` 定義，VSIX 與 Tauri 兩端皆從此讀取：
- **Rust 端**：`src-tauri/src/commands/python.rs` 的 `check_environment` 函數，從嵌入的 `PYTHON_MODULES_JSON` 常數解析
- **TypeScript 端**：`src/handlers/envOps.ts` 的 `handleCheckEnvironment`，透過 `fs.readFileSync` 讀取 JSON
- **前端渲染**：`ui/src/ui/hardware.js` 的 `updateEnvironmentStatus` 直接使用後端傳來的 `modules` 陣列
- **修改規範**：只需修改 `config/python_modules.json`，三個檔案自動同步（但 Rust 端需手動更新內嵌常數後重新編譯）

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
