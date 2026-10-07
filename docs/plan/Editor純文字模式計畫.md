# 純文字模式 + 內建編輯器 — 設計與執行計畫

**建立日期**：2026-10-05
**狀態**：**決策已定（2026-10-06），待實作**
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