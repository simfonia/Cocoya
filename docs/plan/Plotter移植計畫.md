# Plotter（序列繪圖）移植計畫 — CodeBridge → Cocoya

**建立日期**：2026-10-05
**來源**：`C:\Workspace\CodeBridge\ui\src\lib\plot\`
**目標專案**：Cocoya（`ui/src/modules/plot/`）

---

## 1. 為什麼值得移植

CodeBridge 的 plotter 設計品質高且**移植成本極低**：

| 事實 | 依據 |
|---|---|
| **零新增相依** | 刻意不引入 Chart.js（省 200KB），自繪 Canvas。與 Cocoya「零新增 dependency」規範一致 |
| **零後端** | 4 個檔案全在 `ui/src/lib/plot/`，**Rust 端完全無 plot 相關程式** |
| **純函式可測** | `plot-parse.js` 明寫「純函式，不含 DOM 或 Tauri 相依，可直接單元測試」 |
| **規模適中** | 4 檔合計 55 KB |

### 值得借鑑的三個設計決策（移植時務必保留）

1. **垃圾行安靜忽略**
   > 「序列監看器同時承載 `Serial.println("LED 已開啟")`。使用者不會為了畫圖而先把程式改成只印數字 —— 文字與數值混在同一條流上是必然。因此 parser 的首要責任是『看不懂的就跳過』，而不是拋例外或畫出一條 y=NaN 的線把整張圖毀掉。」

   Cocoya 的序列埠監看完全相同情境，此設計**必須保留**。

2. **刻意避免 `devicePixelRatio` 命名**
   > 「同名函式在此 IIFE 內會因函式宣告提升而遮蔽同一個名稱的全域值，`typeof devicePixelRatio` 永遠拿到函式本身（不是 number），於是比例恆為 1 —— 高 DPI 螢幕上線條會糊掉，而症狀極難從畫面回推成因。」

3. **rAF 合併重繪**
   > 「序列埠最高可達數百 Hz。每次資料事件都重畫會讓主執行緒被 canvas 填補操作塞滿，導致 Blockly 工作區操作變得卡頓。」

   Cocoya 有 Blockly 工作區，卡頓影響更直接。

---

## 2. 來源盤點

```
C:\Workspace\CodeBridge\ui\src\lib\plot\
├── plot-parse.js     6.9 KB   文字行 → 資料點（純函式）
├── plot-store.js    14.3 KB   環形緩衝、切片、視窗
├── plot-render.js   10.6 KB   Canvas 自繪（格線/座標軸/折線/DPR）
└── plot-panel.js    23.1 KB   UI 面板（開合/拖曳/控制的/圖例/視窗選擇）

ui/src/style.css     24 處 plot 相關 CSS
```

### 對外 API（`plot-panel.js` 的 `return {}`）
```
init / open / close / toggle / clear / togglePause / toggleSeries
setWindow / handleDataLine / handleMonitorChange
syncLayout / syncControls / getState / onChange
_reset（僅測試用）
```

---

## 3. 唯一的核心差異：資料源

| | CodeBridge | Cocoya |
|---|---|---|
| 資料源 | `window.CodeBridgeSerialMonitor`（序列埠監看器） | `window.CocoyaUI.appendTerminal()` |
| 接入方式 | 監聽 serial monitor 狀態與資料 | 在 `appendTerminal` 加 hook |

### Cocoya 的接入點（實查確認）

**單一收斂點** `ui/src/ui/terminal.js:308` `UI.appendTerminal(text, type, inline)`，目前有 20+ 呼叫端：

| 呼叫端 | 檔案 | 是否應餵 plot |
|---|---|---|
| 序列埠資料 | `bridge/tauri/serial.js` | ✅ 是 |
| Python stdout | `bridge/tauri.js:179/181` | ❌ 否（是程式輸出非感測值） |
| 訓練日誌 | `bridge/tauri/training.js:87` | ❌ 否 |
| 遠端訓練 | `ui/base.js:296-714` | ❌ 否 |
| sidecar 狀態 | 多處 | ❌ 否 |

**設計決策**：只餵 **`type === 'out'` 且來自序列埠** 的行。
最穩健的做法是**在序列埠的呼叫端加 hook**，而非在 `appendTerminal` 全域攔截 ——
避免訓練日誌中的數字被誤判為感測資料。

---

## 4. 執行步驟

### 階段 A：純搬移（零風險，無接線）
1. 建立 `ui/src/modules/plot/`
2. 複製 4 檔，命名空間 `CodeBridgePlot*` → `CocoyaPlot*`
3. **保留原始檔頭註解**（含上述三個設計決策的 rationale）
4. `plot-parse.js` 保持純函式、不引入任何 Cocoya 相依

**驗收**：`node --check` ×4、無 ESLint error

### 階段 B：資料接線
5. 在 `ui/src/bridge/tauri/serial.js` 的序列埠資料路徑加 `CocoyaPlotPanel.handleDataLine(line)`
6. 確認序列埠資料的事件來源（Tauri 端 `python-log` / serial 事件）

**驗收**：序列埠印 `23.5` 時繪圖面板出現折線

### 階段 C：UI 整合
7. 移植 `style.css` 的 24 處 plot CSS 到 `ui/src/style.css`，**用 Cocoya CSS token**（三主題）
   - ⚠️ CodeBridge 用固定色（如 `SERIES_COLORS` 的 `#35c7d4`）→ 需 token 化才能支援Cocoya 三主題
8. `index.html` 加入 plot 面板容器
9. 工具列加「繪圖」按鈕 → `CocoyaPlotPanel.toggle()`
10. i18n：CodeBridge 的 plot 文案 key 移植到 `ui/src/zh-hant.js` 與 `en.js`（**兩邊鍵集合必須相同**）

**驗收**：三主題下配色皆正確、i18n parity 綠

### 階段 D：測試與守門
11. `plot-parse.test.mjs` — 純函式測試（格式解析、垃圾行忽略、混合行、邊界值）
12. `plot-store.test.mjs` — 環形緩衝、切片、視窗
13. 若 plot 進入 `core_manifest.json`，確認 `core_contract.test.mjs` 綠

**驗收**：新測試全綠、`npm run test:ui` 不退步

---

## 5. 風險與注意事項

| 風險 | 說明 | 對策 |
|---|---|---|
| **配色未 token 化** | CodeBridge 用固定 hex，Cocoya 有三主題 | 階段 C 必須轉 CSS token，**不可直接複製** |
| **效能** | 序列埠數百 Hz， Cocoya 有 Blockly 同時運作 | 保留 rAF 合併；若仍卡頓，加節流 |
| **誤食訓練日誌** | 訓練 log 有數字行 | 只在序列埠路徑加 hook，**不要全域攔截** |
| **i18n parity** | Cocoya 有嚴格 parity 守門 | 移植文案必須雙語系同步 |
| **命名衝突** | `devicePixelRatio` 提升陷阱 | **保留原始註解與函式名** |

---

## 6. 工作量估計

| 階段 | 內容 | 估計 |
|---|---|---|
| A | 純搬移 + 命名空間化 | 小 |
| B | 資料接線 | 小 |
| C | UI 整合 + 主題化 + i18n | **中**（最大） |
| D | 測試 | 中 |

**整體：中等偏低。** 相較於引入 CodeMirror（~800KB）做文字編輯器，這是純粹的增益且零相依。

---

## 7. 相關決策記錄

- **VSIX：先不支援**（**2026-10-06 使用者更正決策**，覆蓋下方原「建議選項 A」的推論）：

  > **決策**：Plotter **只在 Tauri 端支援**，VSIX 先不支援。
  > **理由**：VSIX 的序列埠資料走 VS Code 原生終端（`deploy_mcu.py <port> --monitor-only`，
  > 由 `serialOps.ts` 以終端機啟動），**webview 完全拿不到資料行**，沒有資料源就無從繪圖。
  > 需求方已確認此範圍。

  - **UI 處置**：依 `bridge.capabilities` 隱藏 plot 按鈕
    —— 與 `caps.hasTerminal` 同一套機制（`ui/src/ui/base.js` 已用它隱藏 `#terminalArea`）。
  - **與 Editor 計畫一致**：Editor 亦「VSIX 先不支援」。**兩者共用同一條 caps 判斷**，
    避免「plot 按鈕藏了但 editor 按鈕還在」的不一致。
  - **日後若要支援**（記錄為備選，非本次範圍）：
    - 選項 B：VSIX 端由 `serialOps.ts` 透過 `postMessage` 轉發序列埠行給 webview（需新增機制）
    - 選項 C：獨立 VS Code 插件自行開啟序列埠 —— ⚠️ **不可行**：
      Windows 序列埠是**獨佔**的，Cocoya 的 monitor 已持有該 COM 埠，
      第二個程序開啟會直接 `PermissionError 13`
      （此衝突本專案已修過一次，見「Terminal Singleton 模式」）。
      **這條路要成立，必須放棄既有 monitor 或改用資料轉發。**