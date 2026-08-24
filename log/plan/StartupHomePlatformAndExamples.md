# Startup Home：平台選擇 + 範例 + 快速設定計畫

## 背景

目前平台切換 (PC ↔ MicroPython) 位於 toolbar 的 `<select id="platform-selector">`。切換時會觸發 `confirmSwitch` 流程，無論選「儲存」或「不儲存」，VSIX 後端 (`cocoyaManager.ts` `handleConfirmSwitch`) 都會執行 `this.currentFilePath = undefined`，導致專案失去錨定 (未命名，無專案根)，Startup Home 重新顯示。Tauri 則不同步清除狀態，造成雙平台不一致。

問題根源：平台類型是專案創建時的**不可變屬性** (XML 已含 `platform="..."`)，不應是可隨時切換的 toolbar toggle。切換平台本質上是「另開不同平台的專案」。

## 目標

1. 將平台選擇移至 Startup Home — 僅於「開新專案」時選擇
2. 將「開啟範例」加入 Startup Home (同時保留 toolbar 範例按鈕供中途參考)
3. 將快速設定 (Python 路徑 / 套件檢查等)加入 Startup Home (同時保留 toolbar 設定下拉)
4. 在 Startup Home 上方加入主視覺圖片 (`ui/src/icons/cocoya.png`)
5. 修正所有存檔流程中的 platform 屬性注入 (從 `<select>` 變更為 `CocoyaApp.currentPlatform`)

## 詳細實作計畫

### A1. Startup Home HTML 擴充 (`ui/index.html`)

**加入主視覺圖片** (水平置中)：
```html
<img src="src/icons/cocoya.png" id="startup-home-logo"
     style="display: block; margin: 0 auto 24px auto; width: 120px; height: auto;">
```

**加入平台選擇下拉** (僅適用「開新專案」)：
```html
<select id="startup-platform" class="platform-select"
        style="margin: 0 auto 24px auto; display: block;">
    <option value="PC">💻 Python (PC)</option>
    <option value="MicroPython">📟 MicroPython (MCU)</option>
</select>
```

**加入「開啟範例」按鈕**：
```html
<button type="button" id="startup-examples"
        style="...">開啟範例</button>
```

**加入快速設定區** (收合面板)：
```html
<div id="startup-settings-panel" style="margin-top: 24px;">
    <details>
        <summary>⚙ 快速設定</summary>
        <div style="display: flex; gap: 12px; margin-top: 12px;">
            <button id="startup-set-python-path" style="flex: 1;">設定 Python 路徑</button>
            <button id="startup-diagnose" style="flex: 1;">檢查 Python 套件</button>
        </div>
    </details>
</div>
```

**整體布局**（cocoya h2 標題與說明段落已刪除；平台選擇改為「開新專案」hover 選單）：
```
┌─────────────────────────────────────┐
│  [ Cocoya Logo ]                    │
│                                     │
│  [開新專案▾]  [開啟專案] [範例]     │
│   ├─ 💻 Python (PC)                 │  ← hover 顯示
│   └─ 📟 MicroPython (MCU)          │
│                                     │
│  ──────────────────────             │
│  ⚙ 快速設定 (收合)                  │
│  [設定 Python 路徑] [檢查套件]      │
└─────────────────────────────────────┘
```

> **設計變更**：平台選擇不再於下方獨立 `<select>`，改為「開新專案」按鈕的 hover 選單（`.startup-new-dropdown` → `.startup-new-menu`），展開兩個平台選項 (`.startup-new-option`，含 `data-platform` 屬性)，點選即依該平台 `startNewProjectFromHome(platform)` 開新專案。`showStartupHomeIfNeeded()` 以 `TLB_MODE_PC`/`TLB_MODE_MCU` 填充選項文字並跳過 title/hint。

### A2. Startup Home 邏輯擴充 (`ui/src/app/persistence.js`)

#### `startNewProjectFromHome(selectedPlatform)` — 加入 platform 屬性 + 重建初始積木
- 由 hover 選單點選的 `data-platform` 傳入 (`PC`/`MicroPython`)；未傳時 fallback `currentPlatform`
- 若不同於 `currentPlatform`：
  - 呼叫 `setPlatformUI(selectedPlatform)` 同步更新 (內部含 `updatePlatformLabel()`)
  - **重建初始積木**：呼叫 `resetWorkspace()`（內部依 `newPlatform` 執行 `createDefaultBlocks()`，建立 `py_main` 或 `mcu_main+loop`）
  - ⚠️ **缺口修正**：若不重建，Startup Home 進入時工作區已依「初始平台」(config.js 預設 `'MicroPython'`) 建立積木，選 PC 開新專案會導致 XML 標 `platform="PC"` 卻殘留 MCU 積木的**跨平台積木錯置**
- 序列化 XML 時加入 `dom.setAttribute('platform', this.currentPlatform)`
- 發送 `saveFileAs({ xml })`

#### `_bindStartupHome()` — 綁定新按鈕
- `.startup-new-option`（hover 選單選項）→ `startNewProjectFromHome(dataPlatform)`
- `#startup-examples` → `CocoyaBridge.send('openExamples', { includeXml: true })`
  - ⚠️ **缺口修正**：對齊 toolbar `bind('btn-examples','openExamples',{includeXml:true})`，避免 VSIX `handleOpenExamples` 對 `message.xml` 的依賴踩空
- `#startup-set-python-path` → `CocoyaBridge.send('setPythonPath')`
- `#startup-diagnose` → 開啟診斷視窗 (`CocoyaUI.showDiagnoseModal()`) + `CocoyaBridge.send('checkEnvironment')`
  - ⚠️ **修正**：原僅 `send('checkEnvironment')` 不開啟診斷 modal，使用者點「檢查 Python 套件」看不到反應；對齊 base.js 的 `btn-diagnose` 綁定（先 `showDiagnoseModal()` 再 `checkEnvironment`）

#### `showStartupHomeIfNeeded()` — 初始化平台選單
- 以 `TLB_MODE_PC`/`TLB_MODE_MCU` 填充 `.startup-new-option` 文字
- (h2 標題 `#startup-home-title` 與說明 `#startup-home-hint` 已刪除，相關 i18n 與 query 一併清除)

### A3. toolbar platform selector 移除 + 唯讀標籤 (`ui/index.html` + `ui/src/app/config.js`)

#### `ui/index.html` — 替換 `<select>` 為唯讀標籤
```html
<!-- 原有: <select id="platform-selector" class="platform-select"> ... </select> -->
<!-- 改為: -->
<span id="current-platform" class="platform-badge">
    %{BKY_TLB_MODE_PC}
</span>
```
> ⚠️ **注意**：`zh-hant.js`/`en.js` 中平台鍵為**無前綴**的 `TLB_MODE_PC`(`Blockly.Msg['TLB_MODE_PC']`)、`TLB_MODE_MCU`；`%{BKY_...}` 佔位符僅供 `applyI18n` 掃描用，實際讀取走 `Blockly.Msg`。

#### `config.js` — 移除 `setupPlatformSelector()` 與 `switchPlatform()`，改為 `updatePlatformLabel()`
- **移除** `setupPlatformSelector()` 與 `switchPlatform()`（不再需要 onchange 監聽；`confirmSwitch` 整鏈 dead code）
- **新增** `updatePlatformLabel()`，`setPlatformUI()` 中取代 `selector.value = platform`:
  ```javascript
  updatePlatformLabel: function() {
      const label = document.getElementById('current-platform');
      if (!label) return;
      label.textContent = (Blockly.Msg['TLB_MODE_PC'] || '💻 Python (PC)');
      if (this.currentPlatform === 'MicroPython') {
          label.textContent = (Blockly.Msg['TLB_MODE_MCU'] || '📟 MicroPython (MCU)');
      }
  },

  setPlatformUI: async function(platform) {
      this.currentPlatform = platform;
      localStorage.setItem('cocoya_platform', platform);
      this.updatePlatformLabel();   // 取代 selector.value = platform
      if (Blockly.Python) Blockly.Python.PLATFORM = platform;
      ...
  }
  ```

### A4. base.js — platform 來源更新 (`ui/src/ui/base.js`)

將所有 `document.getElementById('platform-selector')?.value` 替換為 `window.CocoyaApp.currentPlatform`：

- **L258** (bind() 中的 XML 序列化)
- **L286** (runCode 的 platform 傳遞)
- ⚠️ **缺口修正**：fallback 用 `??` 語意較正確（`config.js` 預設 `'MicroPython'`）：
  ```javascript
  const platform = window.CocoyaApp?.currentPlatform;
  dom.setAttribute('platform', platform);
  ```
  若需 fallback 可 `?? 'PC'`，但 `currentPlatform` 恆有值，實務可不加。

### A4b. lifecycle.js — platform 來源更新 (`ui/src/app/lifecycle.js`) [追加]
- **L151-152**：`initializeCocoya()` 中 `selector.value = this.currentPlatform` → 改為 `this.updatePlatformLabel()`
- **L22**：`init()` 移除 `this.setupPlatformSelector()` 呼叫（該函式已刪除）

### A5. tauri.js — platform 來源更新 (`ui/src/bridge/tauri.js`)

- **L1113** (save dialog XML 序列化)：`document.getElementById('platform-selector')?.value` → `window.CocoyaApp?.currentPlatform`
- **L284-290**：移除 `confirmSwitch` case（dead code，見 A6b）

### A6. VSIX backend — `handleConfirmSwitch` 廢除 (`src/cocoyaManager.ts`)

- **移除此 case**（L202-204）與 `handleConfirmSwitch()`（L289-310）——整鏈 dead code，**完全清除**而非保留警告 log，避免殘留雙平台不一致的誤導註解
- `handleSaveFileAs` 無需改動 — 前端 XML 已含 `platform` attribute

### A6b. Frontend dead code 清理 [追加]
| 位置 | 改動 |
|------|------|
| `controller.js` L42 | 移除 `switchPlatform` handler |
| `tauri.js` L284-290 | 移除 `confirmSwitch` case |
| `config.js` L104-128 | 移除 `setupPlatformSelector()` / `switchPlatform()` |

### A7. i18n 補充 (`ui/src/zh-hant.js` + `ui/src/en.js`)

| 鍵名 | zh-hant | en |
|------|---------|-----|
| `BKY_STARTUP_EXAMPLES` | 開啟範例 | Open Examples |
| `BKY_STARTUP_SETTINGS` | 快速設定 | Quick Settings |
| `BKY_STARTUP_PYTHON_PATH` | 設定 Python 路徑 | Set Python Path |
| `BKY_STARTUP_DIAGNOSE` | 檢查 Python 套件 | Check Python Modules |
| `BKY_STARTUP_HINT_WITH_PLATFORM` | 請選擇「開新專案」或「開啟專案」...開新專案時請先選擇平台。 | Choose New/Open Project... Select platform when creating new. |

## 存檔流程稽核 (platform attribute)

| 程式碼位置 | 目前狀態 | 所需改動 |
|------|------|------|
| `persistence.js:startNewProjectFromHome()` (L220) | ❌ 未注入 platform | ✅ 加入 `dom.setAttribute('platform', this.currentPlatform)` + 跨平台時重建初始積木 |
| `persistence.js:triggerAutoBackup()` (L41) | ✅ 已正確 | 無需改動 |
| `base.js:bind()` (L258) | ⚠️ 依賴 `#platform-selector` | ✅ 改為 `CocoyaApp.currentPlatform` |
| `base.js:runCode` (L286) | ⚠️ 依賴 `#platform-selector` | ✅ 改為 `CocoyaApp.currentPlatform` |
| `lifecycle.js:initializeCocoya` (L151-152) | ⚠️ 依賴 `#platform-selector` | ✅ 改為 `updatePlatformLabel()` |
| `tauri.js` L1113 | ⚠️ 依賴 `#platform-selector` | ✅ 改為 `CocoyaApp.currentPlatform` |
| `fileOps.ts:handleOpenFile()` | ✅ 從 XML 偵測 | 無需改動 |
| `fileOps.ts:handleOpenExamples()` | ✅ 從 XML 偵測 | 無需改動 |
| `file.rs:open_file()` / `open_examples()` | ✅ 從 XML 偵測 | 無需改動 |
| `persistence.js:loadWorkspace()` | ✅ 使用從後端回傳的 platform | 無需改動 |

## 實作順序 (修訂版)

1. **A1** Startup Home HTML 擴充 (logo + platform select + examples + settings)
2. **A8** i18n 補充
3. **A3** config.js: 移除 `setupPlatformSelector`/`switchPlatform`，新增 `updatePlatformLabel()`；lifecycle.js 移除呼叫/改用 `updatePlatformLabel()` (A4b)
4. **A2** persistence.js 邏輯 (startNewProjectFromHome + _bindStartupHome + showStartupHomeIfNeeded)
5. **A3** index.html toolbar: `<select>` → `<span>` 唯讀標籤
6. **A4** base.js: platform 來源更新 (2 處)
7. **A5** tauri.js: platform 來源更新 (1 處) + 移除 `confirmSwitch` case (A6b)
8. **A6/A6b** cocoyaManager.ts 移除 `confirmSwitch` case + `handleConfirmSwitch()`；controller.js 移除 `switchPlatform` handler
9. **A9** style.css: 新增 `.platform-badge`
10. **驗證**: `node --check`, `npx tsc --noEmit`, 實機測試 (VSIX + Tauri)

## 驗證清單

- [ ] 全新啟動 → Startup Home 顯示 logo + 平台選擇 + 範例 + 設定
- [ ] 選擇平台 (PC/MCU) → 點「開新專案」 → 錨定成功 → 對應初始積木 (py_main 或 mcu_main+loop)，**無跨平台積木錯置**
- [ ] 點「開啟專案」 → 載入 XML，平台自動偵測
- [ ] 點「開啟範例」 → 載入範例，平台自動偵測
- [ ] toolbar「開新專案」→ Startup Home → 選擇新平台 → 新專案錨定
- [ ] 存檔時 XML 含 `platform="PC"` 或 `platform="MicroPython"`
- [ ] VSIX + Tauri 雙平台一致
- [ ] `node --check` / `tsc --noEmit` / `cargo check` 通過
