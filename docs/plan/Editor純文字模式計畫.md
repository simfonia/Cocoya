# 純文字模式 + 內建編輯器 — 設計與執行計畫

**建立日期**：2026-10-05
**狀態**：**A/B/C/D-1 已實作完成（2026-10-10）；D-2+（實機驗證等）待辦**
**關聯**：與「TinkerCAD 式單向轉換」需求綁定

> ## ✅ 決策紀錄（2026-10-06 使用者拍板）
>
> | # | 項目 | **決策** |
> |---|---|---|
> | 1 | **存檔格式** | **存 `.py`** —— 轉換後專案以純文字 Python 存檔 |
> | 2 | **VSIX** | **先不支援**文字編輯（VS Code 本身已有文字編輯器可直接用） |
>
> **推論範圍**：
> - **只在 Tauri 端開放文字模式**。VSIX 端**不顯示**「切換為文字模式」按鈕，
>   依 `bridge.capabilities` 判斷（與 `caps.hasTerminal` 同一套機制，
>   參見 `ui/src/ui/base.js` 已有的 VSIX 隱藏模式）。
> - VSIX 使用者要改 Python 程式碼，直接用 VS Code 開啟 `.py` 檔即可 ——
>   **這正是本決策的成本最小理由**：無需在 webview 內重造一個編輯器。
> - **Plotter 同步「VSIX 先不支援」**（2026-10-06 更正決策，覆蓋原「建議選項 A」的措辭）：
>   兩者共用同一條 `caps` 判斷，避免只藏 plot 按鈕卻露出 editor 按鈕的不一致。

---

## 1. 目標

在使用者點擊「切換為文字模式」後：
- **隱藏**積木區（`#blocklyDiv`）
- **保留**程式碼區（`#codeArea`）並升級為可編輯
- **保留**虛擬終端（Tauri 端）
- 程式碼由 Blockly 產生後**單向寫入**編輯器
- **不可逆**：轉換後不得再轉回 Blockly

---

## 2. 關鍵技術決策：自繪編輯器，零新增相依

### 為什麼不用 CodeMirror / Monaco

Cocoya 規範明定**零新增 dependency**（CodeBridge 的 plotter 亦遵循同一規範）。
引入 CodeMirror 約 800KB，且與教學工具的離線部署目標衝突。

### 採用方案：`<pre>` 疊層高亮 + `<textarea>` 輸入

```
<div class="editor-container">
  <pre class="editor-highlight" aria-hidden="true"><code>…高亮後的 HTML…</code></pre>
  <textarea class="editor-input" spellcheck="false"></textarea>
</div>
```

**原理**：上層唯讀顯示高亮，下層 `textarea` 承載真實輸入，兩層**像素對齊**（同字型、同行高、同 padding、同捲動位置）。

### 必須處理的四個難點

| 難點 | 對策 |
|---|---|
| **捲動同步** | 監聽 textarea 的 `scroll` 事件，同步 `highlight.scrollTop/Left` |
| **游標對齊** | 字型/行高/字距/letter-spacing 必須完全一致，否則游標會偏移 |
| **效能** | 高頻輸入不可全量重繪 → **rAF 合併 + 只高亮可見行** |
| **Tab 鍵** | `preventDefault` 後插入縮排（否則會跳出編輯區） |

> ⚠️ Cocoya 已有相關效能踩坑記錄：`ui_canvas.js` 的 `setLineDash` 高頻 DOM 操作曾造成卡頓。
> 編輯器同樣是高頻路徑，**不可每次 `input` 都重建整個 innerHTML**。

---

## 3. Python 語法高亮（自寫 tokenizer）

約 150 行，處理：
- 關鍵字（`def` / `if` / `for` / `import` ...）
- 字串（含三引號、跳脫字元、f-string 前綴）
- 註解（`#`）
- 數字
- 內建函式 / 常用模組名
- MicroPython 專用（`machine` / `Pin` / `UART` ...）

**必須 HTML escape**：`<` `>` `&`，否則產生的 Python 會壞掉或造成 XSS。

**必須避免**：`*/` 出現在 JS 註解或字串中（AGENTS.md 已記載此坑會提前閉合註解）。

---

## 4. 主題化

新增 CSS token（三主題，2026-10-06 階段 A 收斂為 8 個）：
```
--editor-bg / --editor-fg
--tok-keyword / --tok-string / --tok-comment / --tok-number
--tok-builtin / --tok-operator
```
> 收斂說明：原列 11 個，`--editor-gutter-bg/fg` 與 `--tok-line-number`
> 屬行號欄位，階段 A 的 pre+textarea 疊層**無行號欄**（行號由 Blockly 側既有
> 機制處理），實作未引用 → 不新增，避免無人讀取的死 token。
> 若階段 C 需要行號欄，再補此 3 token（須三主題同步）。
在 `theme_manager.js` 的 `cssVars` 補值，**不得寫死 hex**（P1-3 已確立此規範）。

---

## 5. 執行步驟

### 階段 A：編輯器元件（零風險，不接模式切換）
1. `ui/src/modules/editor/editor.css` — 疊層佈局 + 主題 token
2. `ui/src/modules/editor/highlight.js` — Python tokenizer（**純函式，可單元測試**）
3. `ui/src/modules/editor/editor.js` — 編輯器元件（捲動同步／Tab 鍵／rAF 合併）
4. `editor/highlight.test.mjs` — tokenizer 測試（各種邊界：未閉合字串、註解中的字串、跳脫字元）

**驗收**：tokenizer 純函式測試全綠；手動確認高亮與游標對齊

### 階段 B：整合到 #codeArea
5. `index.html` 的 `#codeArea` 改為編輯器容器結構
6. 保留「唯讀預覽」行為（既有使用者不受影響）

**驗收**：現有積木產生流程仍正常顯示程式碼

### 階段 C：模式切換（不可逆）

> **平台閘門（決策 2）**：步驟 7~10 **僅在 Tauri 端啟用**。VSIX 端直接不渲染該按鈕，
> 依 `bridge.capabilities` 判斷 —— 與 `ui/src/ui/base.js` 隱藏 `#terminalArea` 同一套機制。
> 守門：`editor_contract.test.mjs` 需斷言「capabilities 無 editor 時不顯示按鈕」。

7. 工具列加「切換為文字模式」按鈕（依 `bridge.capabilities` 顯示）
8. 二次確認對話框：**明示不可逆**
9. 轉換流程：
   ```
   用者點擊 → 確認對話框 → 取得 workspace.getCode()（含 ID 標記剝除）
   → 存入 state + 寫入編輯器
   → Blockly.dispose() + 隱藏 #blocklyDiv
   → 專案存檔格式切換為 .py（決策 1：存 .py）
   ```
10. **安全網**：轉換前把原始專案 XML 備份到 `temp_scripts/`（既有降級路徑）

**驗收**：轉換後可編輯、可執行、存出的是 `.py`；VSIX 看不到該按鈕

### 階段 D：邊界與守門
11. 不可逆狀態的持久化（**重開 `.py` 時仍是文字模式**，不得顯示空的 Blockly 畫布）
12. **格式偵測**：`.py` 檔若內容實為 Blockly XML → 回退積木模式並提示（不可只看副檔名）
13. `editor_contract.test.mjs` — 驗證 ID 標記確實被剝除、逃逸確實發生、模式不可逆、
    **VSIX 隱藏按鈕**、`.py` 格式偵測回退

---

## 6. 決策點（2026-10-06 已全部拍板）

| # | 決策 | **決策結果** |
|---|---|---|
| 1 | **存檔格式**：轉換後專案存 `.py` 還是仍存 `.xml`？ | ✅ **存 `.py`**（真正的「文字專案」；需一併處理既有 `.xml` 開啟邏輯與格式偵測） |
| 2 | **VSIX 是否支援**？ | ✅ **先不支援**（VS Code 本身已有文字編輯器）。依 `bridge.capabilities` 隱藏按鈕，**與 Plotter 共用同一條判斷** |
| 3 | **程式碼執行**：文字模式下的執行是否走同一條 pipeline？ | ✅ **應相同**（目前程式碼產出本來就是 Python 字串）—— 不新增執行路徑 |
| 4 | **undo/redo** | ✅ **`textarea` 原生支援，免費**（若用 contenteditable 則需自行實作 —— 這是選 textarea 的額外好處） |

> **存 `.py` 的實作要點**（階段 C 需落實）：
> 1. 轉換後存檔副檔名改為 `.py`，**不再是專案 `.xml`**
> 2. **開啟路徑分叉**：`.py` → 直接載入編輯器並維持文字模式（不可逆狀態需可持久化）；
>    `.xml` → 既有積木流程
> 3. **格式偵測不可只看副檔名**：若 `.py` 檔內容實際是 Blockly XML（使用者改錯副檔名），
>    應回退積木模式並提示，避免把 XML 當純文字顯示
> 4. **`.py` 專案的「積木區」不可用**：重開 `.py` 時不得只顯示空的 Blockly 畫布 ——
>    階段 D 的「不可逆持久化」正是為此

---

## 7. 工作量估計

| 階段 | 內容 | 估計 |
|---|---|---|
| A | 編輯器元件 + tokenizer | 中 |
| B | 整合到 codeArea | 小 |
| C | 模式切換 + 存檔 | 中 |
| D | 邊界 + 守門 | 中 |

**整體：中等。零相依是最大優勢。**

---

## 8. 風險

| 風險 | 對策 |
|---|---|
| **游標對齊偏移** | 字型 metrics 差異是常見坑，階段 A 需實際目視驗證 |
| **高頻輸入卡頓** | rAF 合併 + 只高亮可見行；不可全量重建 DOM |
| **`*/` 序列破壞註解** | 撰寫程式碼時一律用描述性文字（AGENTS.md 已記載） |
| **HTML 未跳脫** | tokenizer 必須 escape `<` `>` `&` |
| **不可逆造成資料遺失** | 轉換前必須備份，且對話框明示 |
| **`.py` 格式偵測誤判** | 不可只看副檔名；`.py` 內容若為 Blockly XML → 回退積木模式（階段 D-12） |
| **`.py` 重開變空畫布** | 不可逆狀態必須持久化；`caps` 無 editor 時也要能讀 `.py` 的內容（否則使用者只看到空白） |
| **VSIX 按鈕未隱藏** | 守門斷言 capabilities 無 editor 時不渲染按鈕（與 `vsix_terminal_hidden.test.mjs` 同模式） |

---

## 9. 與其他計畫的關係

- **Plotter 移植**（`docs/plan/Plotter移植計畫.md`）：獨立，可並行
- **VSIX 隱藏虛擬終端**：已完成（commit `cfb5198`），本計畫沿用同樣的 `caps` 判斷模式
- **VSIX 不支援範圍（2026-10-06）**：Editor 與 Plotter **共用同一條 `caps` 判斷** ——
  兩者都是「webview 端看不到/拿不到 VS Code 既有能力」的同類問題，
  不可各自判斷，否則會出現「plot 藏了但 editor 露出」的不一致。

---

## 10. 執行進度（2026-10-10 更新）

### ✅ 階段 A（編輯器元件）／B（整合 #codeArea）— 已完成（2026-10-06）

- `ui/src/modules/editor/editor.css`（8 個主題 token，三主題同步）、`highlight.js`（tokenizer，15 測）、`editor.js`（pre 疊層高亮＋textarea 輸入，零新增相依）
- `index.html` 的 `#codeArea` 編輯器容器；積木模式維持既有唯讀預覽

### ✅ 階段 C（模式切換＋存檔）— 已完成（2026-10-10）

| 步驟 | 內容 | 檔案 |
|---|---|---|
| C-1 | 平台閘門：`caps.supportsTextEditor` 才渲染按鈕（VSIX 不渲染，與 Plotter 共用同一條判斷）；切後按鈕隨 `#codeContent` 退場 | `ui/index.html`、`ui/src/ui/base.js`、`editor/editor.css` |
| C-2 | 切換 SSOT：`isTextMode / getEditor / switchToTextMode / enterTextModeWithCode`；dirty 才彈三按鈕確認 → 存檔 → 取新鮮碼 → 二次清行尾 ID 註解 → `dispose()` → `body.cocoya-text-mode` → 退場 UI（`#block-type-info` 隱藏、aria-label 填充）；雙語 i18n 鍵（`TLB_TEXT_MODE_TIP/CONFIRM/EDITOR_LABEL`） | `ui/src/modules/editor/text_mode.js`、`ui/src/ui/base.js`、`ui/src/zh-hant.js`、`ui/src/en.js` |
| C-3 | **執行分叉**：`runCode` 文字模式改讀 `editor.getValue()`（不可調 `triggerCodeUpdateSync`，`!workspace` 會回舊碼）；**存檔分叉**：送 `{code, isTextMode}`，`fileOps.js` 經 `ensurePlatformLine` 補檔頭平台行；Rust `save_file` 加 `code/is_text_mode: Option<String/bool>`（`None` 向後相容舊 XML 路）；**preview 早退**：`renderer` 文字模式不渲染 | `ui/src/ui/base.js`、`ui/src/bridge/tauri/fileOps.js`、`src-tauri/src/commands/file/savefile.rs`、`ui/src/ui/renderer.js`、`docs/backend_api_manifest.md` |

**檔頭平台行**（Q3 決策 A）：首五行內尋 `# cocoya-platform: PC|MicroPython`，執行依此行分流
`run_python` / `deploy_mcu`；`parsePlatformLine / ensurePlatformLine / guessPlatform` 為可單元測試的純函式，掛 `CocoyaTextMode` 匯出。

**驗收**（2026-10-10）：`test:ui` **465/465**、`lint:ui` 0 error、`invoke_params_contract` 6/6、`cargo check`、`npx vite build`、eol 750 檔全 CRLF。

### ✅ Q1 修復：語系/主題切換的文字快照丟碼（2026-10-10 同日根治）

**查證結論**：語系切換（`persistence._showReloadChoice`）與主題切換（`theme_manager`）共用同一條快照鏈
`_showReloadChoice → snapshotWorkspaceForReload → reload → consumeReloadSnapshot → _restoreReloadSnapshot`。
C-3 寫入端已分叉（產出 `code/isTextMode`、無 `xml`），但 `consumeReloadSnapshot` **只驗 `xml`**
→ 文字快照必回 null → **文字模式下切語系/主題必丟碼**（原註解誤判為「暫不還原、不炸」）。

**修復**（寫入、消耗、還原三端齊備）：

1. `persistence.js · consumeReloadSnapshot`：`isTextMode` 快照改驗 `code`（空字串合法——編輯器可被清空，只驗型別、不驗空白）。
2. `lifecycle.js · _restoreReloadSnapshot`：`snap.isTextMode` → 分派 `_restoreTextModeSnapshot`（不走 Blockly XML）。
3. `lifecycle.js · _restoreTextModeSnapshot`（新）：**先 `enterTextModeWithCode` 成功，才 dispose workspace/minimap**（順序契約）；還原 `currentPlatform`（存檔 `ensurePlatformLine` 與執行 `msg.platform` 都吃它）＋ `filename` ＋ `isReadOnly`；失敗回 null 不半切（呼叫端退回預設積木路徑）。
4. 下游 null 護欄：`workspace.js · setupWorkspaceListeners` 開頭 `!this.workspace` 早退；`persistence.js · checkAutoBackup` 文字模式早退（**不清備份**，下次積木模式仍可復原）＋對話框回呼內 `!this.workspace` 再驗（防「對話框掛著時才切文字模式」的競態）。
5. **守門**：`persistence_snapshot.test.mjs` +2（文字寫入／消耗）、新檔 `ui/src/app/text_snapshot.test.mjs` 3 測（分派／順序契約／防半切）。**變異測試三種皆驗證會紅**（刪 consume 文字分支、刪分派行、dispose 搬到 enter 前）。
6. 順手修正：`persistence_snapshot.test.mjs` 原第 108 測缺 `});`，導致後續 7 測被**嵌套**為其子測試（仍會執行故從未被發現）——已補閉合，層級恢復正常。

### ✅ 按鈕純 icon 化（2026-10-10）

- `#btn-text-mode` 移除文字節點，改純 icon ＋ `title` tooltip（`TLB_TEXT_MODE_TIP`），固定 24×24 對齊相鄰鈕。
- 刪除 `editor.css` 窄螢幕 `.text-mode-label` 規則（連同整個 `@media` 區塊）；i18n 鍵 `TLB_TEXT_MODE` 雙語同步移除（僅該 span 引用）。

### ⚠️ 已知限制

1. **單向不可逆**：切文字模式後 `Blockly.dispose()`、`workspace = null`；離場只能開新／開舊／回首頁（皆走既有 dirty 三選）。
2. **VSIX 不支援文字編輯**（決策 2）：按鈕不渲染；VSIX 開 `.py` 情境由 D-1 唯讀 fallback 處理。
3. **XML 備份在文字模式不還原**：`checkAutoBackup` 早退且不清除備份（保守選擇，避免砸 null 或覆蓋文字）。
4. 快照還原不呼叫 `setPlatformUI`（workspace 已 dispose，模組載入無對象），只更新 `currentPlatform` 與平台標籤——文字模式不產積木碼，足夠。
5. 文字模式下的 `recoveryData`（後端推播的啟動備份）到達時一律略過，同第 3 點。

### ✅ D-1（開檔分叉）— 已完成（2026-10-10 晚）

| 項 | 內容 | 檔案 |
|---|---|---|
| 選檔器 | `open_file` filter 加 `py`（`Cocoya Project: [xml, py]`）；`open_examples` 維持 XML | `src-tauri/src/commands/file/openfile.rs` |
| 內容分叉 | `detectContentKind(content)`：以內容偵測（`<xml`/`<?xml` 起頭 → xml，其餘 → python，含空檔），**不可只看副檔名** | `editor/text_mode.js` |
| 接線 | `controller.loadWorkspace`：python 內容 → `openPyFile`；`.py` 副檔名但內容是 XML → 積木流程＋`MSG_OPENED_AS_BLOCKS` 提示 | `app/controller.js` |
| 開檔流程 | `openPyFile`：VSIX 閘門（`caps.supportsTextEditor=false` → 提示用 VS Code 開、不動工作區）→ 缺檔頭平台行 QuickPick（PC/MicroPython，取消即中止）→ `ensurePlatformLine` 補行 → enter 成功才 dispose → 平台/檔名/唯讀/`setDirty(false)`/回首頁隱藏 | `editor/text_mode.js` |
| i18n | `TLB_TEXT_MODE_OPEN_VSIX`、`TLB_TEXT_MODE_PICK_PLATFORM`、`MSG_OPENED_AS_BLOCKS`（雙語） | `zh-hant.js`、`en.js` |
| 守門 | `editor_contract.test.mjs` 10 測＋**四變異測試驗紅**（恆 python／接線字串／閘門失效／strip 失效） | `editor/editor_contract.test.mjs` |
| 重構 | `disposeBlocklySide(app)` 抽出共用（`switchToTextMode` 與 `openPyFile` 同一退場）；`stripIdComments` 匯出供守門 | `editor/text_mode.js` |

**驗收**（2026-10-10）：`test:ui` **475/475**、`lint:ui` 0 error、`cargo check`（僅既有 dataset.rs 2 warnings）、`test:rust` 3/3、`vite build`、eol 751 檔全 CRLF。

### ✅ 版面重構（方案 B：toolbar/終端機搬出 blocklyArea，2026-10-10）

**問題**：原版面 `#container` 為左右結構，**toolbar 與 terminalArea 都關在 `#blocklyArea` 內** → 文字模式只能把左欄釘 400px（實機截圖：toolbar 擠成 4 列、下方大片空白、編輯器被限縮右側）。

**決策（2026-10-10 使用者拍板：方案 B，捨「只改文字模式 CSS」的方案 A）**：回頭改基礎版面，兩模式共用一組版面 —— toolbar 上／預覽（編輯器）在 toolbar 之下／終端機下，文字模式自然展開：

```
#container (上下 flex)
├── #toolbar            ← 搬出：全寬置頂
├── #workbench (flex:1) ← 新增 wrapper
│   ├── #blocklyArea → 只剩 #blocklyDiv（＋minimap-toggle）
│   ├── #panel-resizer
│   └── #codeArea       ← 預覽/編輯器在 toolbar 之下
├── #terminal-resizer   ← 搬出：全寬置底
└── #terminalArea       ← 搬出：全寬置底（未來 Plotter 併排此列）
```

| 項 | 內容 | 檔案 |
|---|---|---|
| DOM | 一次性腳本搬移＋重縮排（逐行標記斷言＋div 平衡必須 +1，任一不符 abort 不寫檔）；`#codeHeader` 標題加 `id="code-title"` 錨點 | `ui/index.html`（前備份 `backup/index_html_20261010_114515.html`）、`temp/scripts/restructure_layout_20261010.cjs` |
| 基礎 CSS | `#container` 加 `flex-direction: column`；新增 `#workbench`（`flex:1` / `min-height:0` / 左右 flex） | `ui/src/style.css` |
| minimap 錨點 | `.blockly-minimap` 與 `#minimap-toggle` `top: 60 → 20`（原 60 = toolbar 40＋20；blocklyArea 起點改為 toolbar 下緣，改 20 維持原視覺，toolbar 換行時也不再互疊） | `ui/src/style.css` |
| 文字模式 | 簡化為隱藏 `#blocklyArea`＋`#panel-resizer`（400px 左欄規則刪除）→ `#codeArea` 自然全寬；另藏 `#code-toggle` 與 `#btn-close-code`（編輯器是唯一面板，收合後無內容） | `ui/src/modules/editor/editor.css` |
| 標題切換 | `retireBlockOnlyUi` 把 `#code-title` 文字換成 `TLB_TEXT_MODE_EDITOR_LABEL`；防禦性移除 `codeArea.collapsed`（防極端競態黑屏） | `ui/src/modules/editor/text_mode.js` |
| VSIX | `!caps.hasTerminal` 一併隱藏 `#terminal-resizer`（搬到底部全寬後，▲ 把手會懸在視窗下緣中央，VSIX 下是死按鈕） | `ui/src/ui/base.js` |
| 守門 | `editor_contract.test.mjs` +2（共 12 測）：① index.html 順序 toolbar→workbench→blockly→panel-resizer→code→terminal ＋ `#code-title` ＋ style.css `flex-direction:column`/`#workbench` 規則 ② editor.css `display:none`（非 400px）＋收合鈕/✕ 隱藏 ＋ 標題切換接線。**變異測試 M1（workbench 錨點改名）/ M2（400px 復活）皆驗紅後還原** | `ui/src/modules/editor/editor_contract.test.mjs` |

**改前技術查證（相依點全數無障礙）**：
- 全專案**無 `#blocklyArea #xxx` 後代選擇器**（`style.css` 僅 1 條 `#blocklyArea` 基本規則、三主題檔零覆寫）。
- 終端機拖曳/收合/把手、panel 拖曳全是 `getElementById` 元件基（`terminal.js`/`renderer.js`），與父層無關；`#terminal-toggle` 自 2026-09-05 起錨在 `#terminal-resizer` 內（非 blocklyArea）。
- 下拉選單 `.toolbar-dropdown`/`.startup-new-dropdown` 皆 `position: relative` 自我錨定；起始首頁是獨立 modal overlay；測試僅 `settings.test.mjs` 掃 `index.html`（script 載入順序，未動）。
- minimap：`.blockly-minimap` 由套件 `appendChild(getInjectionDiv().parentNode)` ＝ `#blocklyArea`，與 `#minimap-toggle` 同錨點同座標 → 兩者同步平移、相對位置不變。
- `#blocklyDiv` 視窗座標不變（原 toolbar 在其上方、重構後 blocklyArea 整體下移同高度）；Blockly `svgResize` 走 window resize 事件（terminal 拖曳/收合本就有 dispatch）。

**驗收**（2026-10-10）：`test:ui` **477/477**（+2 守門）、`lint:ui` 0 error、`node --check`、`vite build`、eol 751 檔全 CRLF。

### 📝 D-2+ 待辦

- [ ] D-2：實機驗證（切換/存檔/開檔三分叉 + 語系切換快照還原）＋ **版面重構回歸**：
  積木模式（toolbar 全寬不再換行、panel 拖曳、terminal 拖曳/收合/▲ 把手、minimap 位置）、
  文字模式（編輯器全寬、codeHeader 標題切換、收合鈕/✕ 已隱藏）、
  VSIX（terminal 與 ▲ 把手隱藏、無文字模式鈕）、三主題、窄視窗 media query。
- [ ] D-3：`.py` 專案「開新專案」語意（副檔名切換後 resetWorkspace 路徑）
- [ ] VSIX `handleOpenFile` 保持 `['xml']` filter（**刻意不加 py** —— VSIX 無文字編輯能力，不提供打不開的路徑）


---

## 11. 架構轉向：「程式設計實驗室」模型（2026-10-10 使用者拍板，取代 dispose 單向模型）

### 11.1 核心語意

使用者要的**不是**「積木→文字檔的單向受管轉換」，而是一個**程式設計實驗室（Lab）**：

- **真相源永遠只有一個**：block workspace **永不 dispose**。
- 文字模式＝把唯讀預覽面板換成**可寫編輯器**＋隱藏積木區，**純記憶體草稿**。
- **進入**：以「目前乾淨預覽碼」當種子寫入編輯器。
- **退出**：取消隱藏，積木與預覽**原封不動還原**（「預覽同步」自動成立，因積木從未被動過）。
- **cocoya 不管理 `.py` 檔**：實驗室中的「存檔」＝**匯出下載 `.py`**（blob，非受管、不錨定）；「另存」在實驗室中隱藏。
- 「單向」的真正定義：**語意上程式不能自動轉回積木**；但 **UI 導航不受限** —— 從實驗室「開一個 XML 檔」回到積木模式，那不是「把 .py 轉成積木」，而是「開啟另一個本質就是積木專案的 XML 檔」。

### 11.2 分層架構（為將來 `.py` 受管化升級而設計）

```
Layer A「文字模式引擎」← 現在建好，將來 100% 原封復用（不 dispose）
  • enterTextModeWithCode / exitLab
  • editor.js + highlight.js（編輯器本體）
  • runCode 從編輯器讀碼執行（測試草稿要用）
  • hide/show（body.cocoya-text-mode）
  • ★ workspace 永不 dispose（從根消除「開新/開舊/範例卡住」整類崩潰）

Layer B「檔案 I/O 適配器」← 現在只做「匯出下載」，將來換成「受管 open/save」
  • 現在：存檔鈕 = blob 下載 .py；開啟只認 XML
  • 保留純函式零件庫（不刪、無害）：parsePlatformLine / ensurePlatformLine /
    guessPlatform / detectContentKind —— 將來受管化直接復用，不重寫。
  • 將來升級只在 Layer B 補 open/save 分叉＋平台持久化，Layer A 零改動。
```

### 11.3 留 / 退 / 改 / 新增

| 類 | 項目 |
|---|---|
| **保留** | 版面重構（方案 B）全部；`editor.js`（含 `dispose()`）；`text_mode.js` 的 `isTextMode/getEditor/ensureEditor/fillAriaLabel/retireBlockOnlyUi/stripIdComments`；runCode 從編輯器跑；`editor.css` 隱藏規則 |
| **退回（.py I/O）** | D-1 `controller.loadWorkspace` python 分叉＋`openPyFile`＋`quickPick`；C-3 `base.js`/`fileOps.js` 的 `{code,isTextMode}` 存檔分叉；Rust `save_file` 的 `code/is_text_mode` 參數＋`.py` filter；manifest 對應註記。**純函式 `parsePlatformLine/ensurePlatformLine/guessPlatform/detectContentKind` 保留為零件庫** |
| **修改** | `text_mode.js`：`switchToTextMode` 改 `enterLab`（不再 dispose）；新增 `exitLab`＋`exportPy`＋共用 `cleanPreviewCode` helper（給複製鈕與進入共用）；刪 `disposeBlocklySide`/`openPyFile`/`quickPick`。`persistence.js`：reload 快照改**同時存 `xml`（積木）+ `code`（草稿）+ `inLab`**；還原時先載積木、若 `inLab` 再進草稿層。`loadWorkspace/_applyInitialBlocks/resetWorkspace/backToHome` 開頭加「若在實驗室先 restoreBlockUi」護欄 |
| **新增（實驗室語意）** | `btn-text-mode` 變**切換**（進入/退出）；退出時若草稿有改動（`editor.getValue() !== seedCode`）→ 確認捨棄；「存檔」在實驗室＝`exportPy`；「另存」以 CSS 隱藏（`body.cocoya-text-mode #btn-save-as{display:none}`） |

### 11.4 為何優於 dispose 模型

| 維度 | dispose 模型（舊） | 實驗室模型（新） |
|---|---|---|
| workspace | 進文字即 null → 全專案到處 `!workspace` 護欄 | 永遠活著 → 護欄全可移除 |
| 開新/開舊/範例 | 需 re-inject，易崩潰 | 自動正常（workspace 活著） |
| 語系/主題 reload | 只能還原「碼」、丟積木 | 積木＋草稿**都**還原 |
| 將來 `.py` 受管化 | 需先還 reinject 債 | 只在 Layer B 加東西 |

### 11.5 守門翻修

`editor_contract.test.mjs`／`text_snapshot.test.mjs`／`persistence_snapshot.test.mjs` 現鎖的是 dispose 契約，翻修為 hide 契約：
- **不變式 A**：`text_mode.js` 不得呼叫 `workspace.dispose`（實驗室永不銷毀積木）—— 變異測試：加回 dispose 行即報紅。
- **不變式 B**：`enterLab` 以乾淨預覽碼為種子；`exitLab` 還原 UI 且不碰積木。
- **不變式 C**：reload 快照含 `xml`＋`inLab`＋`code`；還原順序「先載積木、再進草稿」。
- **不變式 D**：實驗室中「存檔」走 `exportPy`（blob 下載），不送後端 `saveFile`；「另存」隱藏。

### 11.6 驗證

`node --check` 改動檔 → `npm run test:fast` → `npm run test:ui`（公共 app/快照流程）→ `npx tsc --noEmit` → `npx vite build`；守門同步翻修並做變異測試驗紅；收尾 `eol:fix`。
