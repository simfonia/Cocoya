# Dataset Manager 重構計畫（Dataset Manager Refactor Plan）

> 建立日期：2026-08-24　|　狀態：規劃完成，待執行
> 角色視角：系統分析師　|　範圍：`ui/src/modules/dataset_manager/`

---

## 一、現況診斷

### 檔案結構與肥大度
| 檔案 | 大小 | 診斷 |
|---|---|---|
| `ui_layout.js` | **108 KB / ~2470 行、60+ 函式** | 🔴 嚴重肥大：狀態管理、表單同步、匯入/匯出、標註模式、分類審閱模式、採集整合、雲端上傳、modal 事件綁定全部混在一起 |
| `ui_components.js` | 20 KB | 🟡 中等，可接受 |
| `spec.js` | 15 KB | 🟢 健康（DatasetSpec 類別 + 驗證） |
| `ui_canvas.js` | 13 KB | 🟢 健康（畫布繪製） |
| `sampler.js` | 8.5 KB | 🟢 健康（採集 sidecar 整合） |
| `dataset_manager.css` | 31 KB | 🟡 單檔偏大，主題變體散落 |
| `index.js` / `i18n.js` / `i18n/{en,zh-hant}.js` | 小 | 🟢 健康 |

### 核心病灶
1. **`ui_layout.js` 是上帝模組**：單一 `state` 全域物件 + 60+ 函式互相呼叫，職責至少橫跨 7 種。
2. **隱性耦合**：函式間靠模組級 `state` 與 DOM id 直接溝通（如 `getFormValue()`、`document.getElementById('dataset-manager-message')`），無明確介面。
3. **既有計畫未竟事項**：`log/plan/DatasetManagerOptimization.md` 的項目 3（scroll）、4（標籤 UI）、7（label_map 清理）仍屬行為債，重構時一併收斂到新架構。
4. **文件已部分存在**：`log/mappings/DatasetManager.html` 有 API 對照表，需隨重構更新。

---

## 二、目標架構（去耦後的分層）

```
ui/src/modules/dataset_manager/
├── index.js                  # 入口：組裝各子系統、window.CocoyaDataset API（簽名完全不變）
├── i18n.js + i18n/           # 不動（健康）
├── core/                     # 【純邏輯層，零 DOM 依賴 → 可單元測試】
│   ├── state.js              # DatasetStore：唯一狀態容器 + pub/sub（取代散落的模組級 state）
│   ├── spec.js               # 由現 spec.js 移入（內容不動）
│   ├── labelMap.js           # buildLabelMap / nextLabelId / syncLabelMap / 髒資料清理（Optimization 項目7）
│   ├── projectNaming.js      # reconcileProjectName / sanitizeName / setNameWarning 邏輯
│   └── stats.js              # updateStatsFromImages / 統計推導
├── io/                       # 【橋接層：所有 Bridge/Tauri/VSIX 通訊集中於此】
│   ├── bridge.js             # 統一包裝 window.CocoyaBridge send/on（雙版本 SSOT）
│   ├── importer.js           # handleFileImport / handleDirectoryImport / CSV 解析
│   ├── exporter.js           # handleExportDataset / ZIP 打包 / 分塊上傳
│   └── autosave.js           # writeProgressToDisk / scheduleAutoSave
├── ui/                       # 【呈現層】
│   ├── modal.js              # createModal / bindModalEvents（拆自 ui_layout 1934-2360 行）
│   ├── form.js               # 表單欄位渲染、syncSpecFromUI、renderColumnRow、refreshPreview
│   ├── panels.js             # refreshDynamicPanels / renderSamplerView / createLabelMapManager
│   ├── annotation.js         # enter/exit AnnotationMode、bbox 控制項、鍵盤事件
│   ├── classification.js     # ClassificationReviewMode 相關（800-1280 行區段）
│   ├── thumbnails.js         # 縮圖牆、scroll save/restore（Optimization 項目3 收斂點）
│   └── statusMessage.js      # showStatusMessage 移出 ui_layout（AGENTS.md 定義位置同步更新）
├── canvas/ui_canvas.js       # 不動
├── sampler.js                # 不動
└── styles/
    ├── base.css              # 變數定義 --dsm-*
    ├── modal.css
    ├── annotation.css
    └── themes.css            # vscode-dark / vscode-high-contrast / Tauri fallback 只覆寫變數
```

### 依賴方向鐵律
`ui/* → io/* → core/*`；`core` 禁止 import DOM/Bridge。事件以 `core/state.js` 的 pub/sub 解耦，UI 層只訂閱不互呼。

---

## 三、i18n / 雙版本 / 主題配套

1. **i18n**：新拆檔案沿用 `i18n.js` 的 `t(key, fallback, ...args)`；新增文案同時補 `zh-hant.js` 與 `en.js`；邏輯層禁止 hard-code 中文（fallback 僅允許在 UI 層）。
2. **VSIX/Tauri 雙版本**：`io/bridge.js` 是唯一觸碰 `CocoyaBridge` 的地方；importer/exporter 只對 bridge.js 講話。驗證時兩端都要跑（VSIX F5 + `cargo tauri dev`）。
3. **主題**：CSS 改用 custom properties，`body.vscode-dark` / `.vscode-high-contrast` 只覆寫變數值，消除大量重複選取器；Tauri fallback class 定義於 `themes.css`。可參考 theme_manager 模組的 CSS 變數換膚做法。

---

## 四、分階段實作步驟與檢查點

### Phase 0：基線保護（半天） ☐
- [ ] 備份整個 `dataset_manager/` 至 `backup/dataset_manager_yyyyMMdd_HHmmss/`
- [ ] 本計畫檔納入追蹤核取清單
- ✅ 檢查點：`npx vite build` 通過、兩端開啟 Dataset Manager 功能正常並記錄

### Phase 1：核心層抽出（1 天） ☐
- [ ] 建 `core/state.js`（pub/sub store），`ui_layout.js` 的 `state` 先以 store 包裝保留原 API 降低風險
- [ ] 抽 `core/labelMap.js`、`core/projectNaming.js`、`core/stats.js`
- ✅ 檢查點：`node --check` 全數通過；手動測：CSV 匯入 label_map 正確、專案命名衝突流程、統計面板

### Phase 2：IO 層抽出（1 天） ☐
- [ ] 建 `io/bridge.js`，遷移 `handleFileImport` / `handleDirectoryImport` / `handleExportDataset` / 雲端分塊上傳 / autosave
- [ ] 清理 Optimization 項目 1/6 殘留（廢棄 DOM 如 `#dataset-dir-input`）
- ✅ 檢查點：VSIX 匯入資料夾、Tauri pick_folder、匯出 ZIP、雲端分塊上傳四條路徑實機通過

### Phase 3：UI 層拆解（2~3 天，風險最高） ☐
拆解順序（每拆一塊即 build + 煙霧測試 + 小步提交）：
- [ ] `statusMessage.js` → [ ] `modal.js` → [ ] `form.js` → [ ] `thumbnails.js` → [ ] `classification.js` → [ ] `annotation.js` → [ ] `panels.js`
- 同步收斂：Optimization 項目 3（scroll 統一進 thumbnails.js）、4（標籤 UI 流程進 panels.js）、7（label_map 清理進 core/labelMap.js）
- ✅ 檢查點：每檔 ≤ 500 行為硬指標；標註全流程（進入→畫 bbox→存檔→返回 scroll 不跳）、分類審閱鍵盤操作正常

### Phase 4：樣式重構（半天~1 天） ☐
- [ ] CSS 變數化 + 拆檔（styles/ 四檔）
- ✅ 檢查點：淺色/深色/high-contrast 三主題 × 兩版本截圖比對

### Phase 5：文件與知識蒸餾（1 天） ☐
- [ ] 更新 `docs/system_spec.html` Dataset Manager 章節指向新架構
- [ ] 重寫 `log/mappings/DatasetManager.html`：core/io/ui 三層完整函式/API 文件
- [ ] 新增 `log/mappings/DatasetManager_DevGuide.html` 開發手冊（新增專案類型、加 i18n key、擴充來源模式的步驟）
- [ ] 更新 `FILE_STRUCTURE.md`、`AGENTS.md`（showStatusMessage 定義位置改為 `ui/statusMessage.js`）
- [ ] `log/todo.md` 追加完成紀錄、當日 `log/work/*.md` 工作日誌

### Phase 6：清理與總驗證（半天） ☐
- [ ] 刪除舊 `ui_layout.js`（先備份）、掃 dead code（未被 import 的 export）
- ✅ 總驗證：`node --check` × 全部 JS、`npx vite build`、VSIX + Tauri 全流程 E2E 手動腳本（本重構原則上不動 Rust）

---

## 五、其他重要建議

1. **可測性**：core 層純化後加最小 smoke test（Node 直跑 `spec.js`/`labelMap.js` 斷言），不引入大型框架。
2. **AGENTS.md 破壞性變更**：`showStatusMessage` 定義位置遷移必須同步更新 AGENTS.md，否則違反團隊鐵則。
3. **向後相容**：`window.CocoyaDataset` 公開 API 簽名完全不動，避免影響外部積木/訓練模組呼叫方。
4. **風險控制**：Phase 3 期間嚴禁夾帶新功能；發現 bug 記入 todo.md 另案處理。
5. **長期擴充**：未來加入「序列訊號」「音訊」資料集類型時，只需在 importer 加解析分支 + panels 註冊新視圖（可在 core/state.js 做 projectType → view 註冊表模式），架構已預留擴充點。

---

## 執行紀錄 (Append-Only)
- 2026-08-24：計畫建立，尚未開工。

---

## 系統分析師審核修訂（2026-08-25）

### 審核結論

原計畫的 `core / io / ui` 分層方向正確，但目前只能視為拆分草案，尚未具備可直接開工的系統規格與驗收門檻。主要原因是重構、既有契約修復與新增能力混在同一個 scope，且 VSIX/Tauri parity、Release 打包、安全、非同步事件與測試估計不足。

### 風險與必修正事項

| 優先級 | 問題 | 修正要求 |
|---|---|---|
| P0 | Tauri Release 資源未閉環 | 確認 `resources/dataset_manager` 是否列入 `src-tauri/tauri.conf.json`，並確認 `dataset.rs` Release 模式透過 `BaseDirectory::Resource` 解析；驗收必須包含 `cargo tauri build`、安裝版 sidecar smoke test。 |
| P0 | Tauri `datasetUploadArchive` 仍是空殼 | 二選一：本次補齊 Rust command、permission、resource、錯誤與進度契約；或明確延後為獨立 blocker，不能在 Phase 2 宣稱雙平台雲端上傳通過。 |
| P0 | 儲存與載入路徑可能不對稱 | 先定義 canonical path：`<projectRoot>/dataset/<projectName>/dataset.json`，並明確區分專案根、來源資料夾與 metadata 目錄；加入 save/load round-trip fixture。 |
| P0 | 檔案操作安全不足 | Tauri 與 VSIX 均須驗證專案根、dataset namespace、project name、`..`、symlink、允許副檔名與不存在檔案行為；不可完全信任前端傳入的 delete/save/load 路徑。 |
| P0 | Dataset sidecar 事件可能跨視窗污染 | `dataset.rs` 的 sidecar log/event 必須使用 `emit_to(window_label, ...)`；事件 payload、requestId 與視窗生命週期納入 parity matrix 及雙視窗測試。 |
| P1 | `io/bridge.js` 唯一入口尚未成立 | 盤點並遷移 `ui_layout.js`、`sampler.js` 等所有 direct `window.CocoyaBridge`、listener、command、timeout、取消與 request correlation。 |
| P1 | core 層仍依賴 i18n | `spec.js` 目前 import `t()`；建議 core 回傳穩定的 error/warning code 與參數，由 UI presenter 翻譯。若暫時保留，須標為 transitional boundary，禁止新增同類耦合。 |
| P1 | i18n 計畫低估初始化時序 | 不可只寫「i18n 不動」。須測試 locale 初始化 race、reload 後重新渲染、中英文 key parity，以及 UI、Host、Rust、sidecar 的訊息責任邊界。 |
| P1 | 主題計畫缺少 token inventory | 盤點所有 Dataset Manager 色彩與狀態樣式，定義 `--dsm-*` tokens、Theme Manager 注入契約與 Tauri fallback；驗證 light、dark、high-contrast、candy 的 focus、disabled、error、annotation 狀態。 |
| P1 | 每檔 500 行不是充分品質指標 | 將行數改為警示值，另以單一責任、公開 API 數量、import 方向、state ownership、複雜度與 lifecycle 作為通過條件。 |
| P1 | 文件 SSOT 已漂移 | 同步 `docs/system_spec.html`、`docs/backend_api_manifest.md`、`log/mappings/DatasetManager.html`、`FILE_STRUCTURE.md`、`DATASET_MANAGER_PLAN.md` 與既有 progress/optimization 文件，並標示 superseded/implemented。 |
| P1 | 測試覆蓋低於重構風險 | 增加 core contract、bridge adapter、DOM interaction、sidecar protocol、VSIX/Tauri parity、Rust、Release resource/permission、E2E 與多視窗測試。 |
| P2 | `sampler.js` 與 `ui_canvas.js` 不應無條件標記不動 | 至少審查並明確擁有 camera/canvas listener、timer、Object URL、callback、mount/unmount/dispose 的生命週期；必要時拆出 protocol adapter 或 controller。 |

### 修訂後目標架構

原本的三層保留，但新增 application/use-case 邊界，避免 UI 直接協調流程：

```text
domain core
    DatasetSpec / labelMap / stats / pathPolicy / errorCodes / state transitions
                    ^
application use-cases
    import / progress / autosave / annotation / classification / export / upload / camera
                    ^
ports and adapters
    bridge contract / VSIX adapter / Tauri adapter / sidecar protocol
                    ^
UI presenters/controllers
    modal / form / panels / thumbnails / annotation / classification / status
```

依賴規則修訂如下：

1. `domain core` 不得 import DOM、Bridge、`window`、平台 API 或 i18n。
2. application 層只依賴 ports，不直接依賴 VSIX/Tauri concrete adapter。
3. adapter 統一 command、event、payload、error、timeout、取消、requestId 與 `dispose()` 契約。
4. UI 透過受控 action 或 controller 修改 state，不直接共享及任意改寫可變 state。
5. importer/exporter 必須分離純解析或規格轉換與檔案/Bridge I/O。
6. `sampler.js`、`ui_canvas.js` 必須明確定義 listener、timer、Object URL 與 canvas 的清理責任。

### 修訂後執行階段

#### Phase A：契約與基線（新增，P0 前置）

- [ ] 凍結 `window.CocoyaDataset` 公開 API、Dataset JSON/schema、資料集模式狀態與相容策略。
- [ ] 定義 canonical save/load path、legacy path 讀取策略、project identity 與 path policy。
- [ ] 建立 VSIX/Tauri command、event、payload、error、permission、resource parity matrix。
- [ ] 決定 Tauri cloud upload 是否納入本次 scope；未納入時標記為獨立 blocker。
- [ ] 建立 baseline fixture、build、VSIX smoke、Tauri dev smoke 與已知風險清單。

#### Phase B：純 core 與契約測試

- [ ] 抽出 `state`、`spec`、`labelMap`、`projectNaming`、`stats`、`pathPolicy`。
- [ ] core 回傳 error/warning codes，UI 層負責 i18n；不得新增 hard-coded UI 文案。
- [ ] 先完成 DatasetSpec、CSV schema、label map、stats、name/path policy 與 save/load round-trip 測試。
- [ ] 此階段不改 UI 行為，確保 domain contract 可獨立驗證。

#### Phase C：Ports、adapters 與 sidecar protocol

- [ ] 建立 bridge port，分別完成 VSIX adapter、Tauri adapter 與 sidecar adapter。
- [ ] 遷移所有 direct Bridge 呼叫，包含 sampler、autosave、import、export、delete、remote diagnostics 與 upload。
- [ ] 定義 timeout、取消、重試、重複/亂序回應、requestId、事件 unsubscribe 與視窗 dispose。
- [ ] 完成 Tauri permission、Release resource path 與 `emit_to` 多視窗隔離驗證。

#### Phase D：Application orchestration

- [ ] 以 use-case/controller 取代 `ui_layout.js` 直接互呼。
- [ ] 逐一遷移 import、progress、autosave、annotation、classification、camera、export 與 cloud upload。
- [ ] 每次只遷移一個流程，完成 focused test 後才進入下一流程。

#### Phase E：UI presenters 與生命週期

- [ ] 拆解 modal、form、status、thumbnails、panels、annotation、classification。
- [ ] 定義各模組 `mount()`、`unmount()`、`dispose()` 或等效生命週期。
- [ ] 驗證鍵盤操作、scroll 還原、重繪、camera listener、canvas listener、timer 與 Object URL 不洩漏。
- [ ] 每檔 500 行僅作警示，不作唯一驗收條件。

#### Phase F：樣式與 i18n

- [ ] 建立完整 `--dsm-*` token inventory，保留 VSIX 靜態 stylesheet 載入相容性。
- [ ] 完成 `zh-hant`/`en` key parity、locale refresh/reload 與初始化 race 驗證。
- [ ] 驗證 light、dark、high-contrast、candy、Tauri fallback，以及 modal、表格、縮圖、標註、訊息與錯誤狀態。

#### Phase G：文件、清理與 Release gate

- [ ] 同步 system spec、backend API manifest、Dataset Manager API mapping、開發手冊、FILE_STRUCTURE 與歷史計畫狀態。
- [ ] 搜尋並清理 direct Bridge、全域 emit、舊 DOM id、未使用 export、重複 handler 與 legacy `ui_layout.js` 入口。
- [ ] 完成 `cargo tauri build`、VSIX package、安裝版 sidecar/resource/permission smoke 後，才刪除舊入口。

### 文件責任矩陣

| 文件 | 唯一責任 |
|---|---|
| `docs/system_spec.html` | 使用者流程、資料模型、模式狀態、雙平台原則與安全不變量。 |
| `docs/backend_api_manifest.md` | Tauri command 的參數、回傳、permission、resource；以及 Dataset Manager command/event parity。 |
| `log/mappings/DatasetManager.html` | 公開 API、domain/application/UI module API、資料流與生命週期。 |
| `log/mappings/DatasetManager_DevGuide.html` | 新增資料集類型、來源模式、標註模式、i18n key、theme token、adapter 與測試 fixture SOP。 |
| `FILE_STRUCTURE.md` | 只描述現行檔案樹與責任；歷史架構移至變更紀錄。 |
| `DATASET_MANAGER_PLAN.md` | 基礎資料格式與使用情境；若與新 contract 衝突須加 superseded 說明。 |
| `log/plan/DatasetManagerOptimization.md`、`DatasetManagerProgressAndGuardrails.md` | 保留歷史決策，標記已實作、superseded 或移轉至本計畫的項目。 |

### 驗收門檻

1. **Core**：Node 測試覆蓋 validate/toJSON、CSV/schema、labelMap、stats、path/name policy 與 round-trip。
2. **Adapter**：fake Bridge 測試 command 名稱、camelCase payload、event payload、requestId、timeout、cancel、duplicate/out-of-order response 與 dispose。
3. **Platform**：`npm run compile`、`npm run lint`、`npm run build --prefix ui`、`cargo check`、`cargo test`；環境允許時必須執行 `cargo tauri build`、VSIX package 與安裝版驗證。
4. **E2E**：image classification、object detection bbox、line following line、CSV/table、camera capture/savePath、autosave/load、export、cloud upload、clear/type switch/close confirmation。
5. **Cross-platform**：同一 fixture 在 VSIX/Tauri 的 command/event 結果一致；驗證 zh-Hant/en reload、四種主題與多視窗事件隔離。
6. **Static gates**：不得殘留未授權 direct `window.CocoyaBridge`、Dataset sidecar 全域 emit、舊 DOM id、未使用 export 或違反 import 方向的依賴。

### Scope Boundary

- **本次必須納入**：contract matrix、path/security、sidecar event isolation、Release resource/permission、i18n lifecycle、theme tokens、core/application/adapter tests 與文件 SSOT 同步。
- **需明確決策後才納入**：Tauri cloud upload 的完整 Rust/permission 實作；若延後，不得列入本次 parity 成功條件。
- **不應順帶納入**：未明確需求的新資料集功能、即時 camera streaming、訓練器格式大改與無關 Rust 模組重構。
- **保留相容性**：`window.CocoyaDataset` 公開 API 與既有 Dataset JSON 讀取能力優先維持；破壞性變更需另立版本與 migration plan。

### 審核後待決策事項

1. Tauri cloud upload 本次完成 parity，或延後為獨立 epic。
2. canonical save/load path 是否統一以 project root + dataset namespace 為準，並對 legacy folder path 提供相容讀取。
3. core 是否全面改為 error/warning code，由 UI 負責翻譯。
4. 是否批准新增 DOM/E2E 測試工具；若不新增，須指定現有 Node/Rust 工具的替代驗證方案。
