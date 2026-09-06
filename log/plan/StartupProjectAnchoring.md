# Startup Project Anchoring 計畫（啟動專案首頁 + 專案根 SSOT + 多視窗錨定）

## 背景與動機

Cocoya 目前若「未先存檔專案（無 currentFilePath / 未開工作區）」，末端的 `baseDir` 會落到 temp（VSIX `datasetOps.ts` L122-124 的 fallback 是 `extensionPath/temp_scripts`）。這造成兩類問題：

1. **資料找不到、易被清**：未錨定專案時，Dataset Manager 的 live 採集、儲存進度、匯出都會埋進 temp，學生下週/下課難以找回。
2. **教學沒有「專案錨點」**：學生一打開就進編輯器，沒有「這是哪個專案、存在哪」的心智錨點。

目標：**視窗進入「未錨定」狀態時，先經由啟動首頁確立專案根，才進入編輯器**（X 方案、強制）；並建立「專案根 = 目前 `.xml` 所在資料夾」的 SSOT，供 Dataset Manager 儲存進度等下游使用。

## 既有現況（先釐清，避免重工）

- **唯讀範例保護已是「軟性」**（非硬擋）：
  - VSIX `fileOps.ts` L30-44：偵測 examples 前綴 → `showWarningMessage`（覆蓋範例 / 另存新檔）→ 選覆蓋即 `writeFileSync` 放行。
  - Tauri `file.rs` L141-154：examples 內且 `!allow_examples` 才回 `Err("EXAMPLES_PATH")`；提供 `force_examples: Option<bool>` 旗標供「硬存」放行。
  - ⇒ **本次不新增軟化**；僅確保兩平台一致，且 `file_locks`（多視窗同檔互斥）維持不軟化。
- **PC/MCU 起始積木已存在**：
  - `ui/src/app/config.js` L125-127：`switchPlatform → setPlatformUI → resetWorkspace()`。
  - 空畫布自動呼叫 `createDefaultBlocks()`（依平台建立起始積木）。
  - ⇒ **本次不新增起始積木模板**（1B-1 取消）。

## 排除範圍

- **「最近專案」recents 功能取消**（使用者拍板）。啟動首頁僅「開新專案」「開啟專案」兩項。
- D（流程步驟條）暫緩；C 項（匯出重排資料夾）維持獨立待辦。

---

## 範圍：本次真正要新增的 4 件事

1. **專案根 SSOT（1A）**
2. **啟動首頁（1B，強制）** — 選「開新專案 / 開啟專案」
3. **前端錨定狀態查詢（bridge.capabilities）**
4. **Tauri 多視窗錨定閘：`create_window` 未錨定也進首頁**

## 架構決策

### 1A 專案根 SSOT
- **定義**：「專案根」= 目前 Cocoya 專案檔（`.xml`）所在資料夾；`.xml` 不存在或該視窗無 `current_paths` → **未錨定（unanchored）**。
- VSIX：`currentFilePath` 的 `path.dirname()`（取代 workspaceFolders[0] 與 currentFilePath 二選一的模糊；`datasetOps.ts` 的 baseDir 收斂到此 helper）。
- Tauri：`state.current_paths.get(window.label())` → `parent()`；無值即未錨定。
- 前端一律透過 `bridge.capabilities` 取得「是否錨定 + 專案根」，不直接判斷 `isTauri` 旗標（符合能力分發規範）。

### 1B 啟動首頁（強制）
- 兩平台一致：視窗進入「未錨定」時，編輯器不載入、只顯示 Startup Home：
  1. **開新專案**：先「另存新檔」取得 `.xml` 路徑（產生空白.xml 並錨定）→ 進入空畫布（依平台 `createDefaultBlocks()`）。
  2. **開啟專案**：VSIX `openFile`（含既有備份/恢復）；Tauri `open_file` → `current_paths[label]`。
- 無「最近專案」區。

### 多視窗整合
- `create_window`（Tauri）產生的新視窗，若無錨定路徑 → 一律載入 Startup Home，不可直接空白進入。
- 沿續多視窗完整性協議（MWIP）：`window.emit_to` 精準通訊、`setDirty→close_window` 原子流程、`file_locks` 路徑擁有者檢查、`untitled_backup_{window_label}` 隔離——全部不變；首頁只是「矽前閘」。
- 權衡已在風險段明講：原「可同時開多個未命名視窗」行為將改變（每個新視窗要先錨定）。

---

## 檔案異動清單（預估）

| 檔案 | 異動 |
|------|------|
| `src/cocoyaManager.ts` | 新增/收斂「專案根」helper（`getProjectRoot()`）；啟動時判斷錨定 |
| `src/handlers/fileOps.ts` | `performSave` 成功後作為錨定事件；供前端查詢錨定狀態 |
| `src/handlers/datasetOps.ts` | baseDir 收斂到「專案根」helper |
| `ui/src/app/config.js`（或 UI 層） | 未錨定 → 渲染 Startup Home；「開新/開啟」動作分派 |
| `ui/src/bridge/*` | capabilities 增加 `isAnchored` / `projectRoot` |
| `src-tauri/src/commands/app.rs`（或新增） | `get_project_anchor` 指令回傳錨定狀態 |
| `src-tauri/src/commands/file.rs` | 確認 `force_examples` 前端硬存時有傳（一致性） |
| `src-tauri/src/lib.rs` | `create_window` 產生的視窗初始狀態（未錨定 → 前接口) |
| `ui/src/modules/*/i18n/*` | Startup Home 文案 |

## 里程碑

| 里程碑 | 內容 | 依賴 |
|---|---|---|
| **M1** | 1A 專案根 SSOT + 錨定狀態查詢（兩平台） | 無（基底） |
| **M2** | 1B 啟動首頁（VSIX + Tauri + `create_window` 錨定閘） | M1 |

## 驗證清單

1. 全新開啟（無任何 .xml）→ 停在 Startup Home，無法直接進編輯器。
2. 開新專案 → 另存 .xml → 錨定 → 進入空畫布並依平台 `createDefaultBlocks()`。
3. 開啟舊專案 → 載入並錨定；範例開啟仍可「另存/覆蓋」（唯讀軟化不變）。
4. Tauri：`create_window` 新視窗未錨定 → 進 Startup Home；多視窗各自錨定、`file_locks`/dirty 隔離不變。
5. Dataset Manager：錨定後採集/儲存/匯出落點=專案根；未錨定（理論上被首頁擋）狀態防呆。
6. 深色主題 Startup Home 可讀。

## 風險與注意事項

- **行為改變**：多視窗「一次開多個未命名」被限制（要先錨定）——有意為之。
- **範例唯讀**：維持軟性；`file_locks` 不可一併軟化。
- **i18n**：Startup Home 全文案需 zh-hant/en。
- **回歸**：openExample / switchPlatform / openFile 既有流程需全回歸測試，確保 startTop home 不阻斷正常開啟範例後的錨定。

*更新日期：2026-08-10*