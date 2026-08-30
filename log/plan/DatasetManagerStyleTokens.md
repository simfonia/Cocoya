# Dataset Manager 樣式 Token 盤點（Stage 5 切片 1，§8.2 步驟 1）

> 日期：2026-08-30｜性質：純盤點，不改任何視覺值與行為｜對象：`ui/src/modules/dataset_manager/dataset_manager.css`（1180 行）

## 1. 現況總量

| 指標 | 值 |
|---|---|
| 色彩值出現次數 | 207 |
| 唯一色彩值 | 99（嚴重碎片化：近似灰阶 ≥20 種）|
| `var(--…)` token 使用 | **0** |
| dark/high-contrast 覆寫 selector | 128 行（`body.vscode-dark` / `body.vscode-high-contrast` 成對重複）|
| 主題機制 | theme_manager `cssVars`（`document.body.style.setProperty`）→ **Stage 5 的天然掛載點** |

## 2. 語意分組（依出現頻率）

### A. 品牌粉（brand）— 最高頻
- `#FE2F89` ×19（主按鈕/返回鈕/強調）
- tint 系列：`rgba(254,47,137, 0.12/0.15/0.25/0.28×2/0.3/0.4)` ×7、`#ff8fb3` ×3
- 淡底：`#fce4ec`、`#f2c6da`、`#fdf2f7`、`#fff0f5`、`#fff7fb`
- 深階：`#c2185b`、`#e91e63`（hover/active）
- dark 輔助：`#4a2a35` ×2、`#4a2333`、`#3a2b32`、`#6b4455`

### B. 中性灰（light surface/text）— 碎片化最嚴重
- 白階：`#fff`/`#ffffff` ×8、`#fafafa`/`#fcfcfc`/`#f9f9f9`/`#f8f8f8`/`#f7f7f7`/`#f6f6f6`/`#f0f0f0`
- 邊框階：`#eee`/`#eeeeee` ×9、`#e0e0e0`/`#e1e1e1` ×7、`#dddddd`/`#ddd` ×6、`#cccccc`/`#ccc`/`#d4d4d4`
- 文字階：`#333`/`#333333` ×12、`#404040` ×8、`#555`/`#555555` ×8、`#444`/`#444444` ×6、`#666`/`#666666`、`#777`/`#777777` ×5、`#888`、`#999` ×5、`#aaa`/`#aaaaaa` ×3、`#222`、`#111`、`#000`

### C. 暗色表面（dark overrides 專用）
`#252526`、`#2d2d2d` ×6、`#1e1e1e` ×4、`#3c3c3c`、`#252526(rgba 34,34,34,.75)`

### D. 成功綠（annotated 綠勾/統計）
`#4CAF50` ×6、`#388e3c`、`#2e7d32`、`#226b2b`、`#81c784`、`#8fd49a`、`#6fdd8a`、`#9ffb00`（sampler 指示）、淡底 `#cdeeda`/`#eefaf1`/`#f1f8f2`/`#b7dfbd`、dark 深底 `#1b3d1b`/`#26302a`/`#3d5543`

### E. 錯誤紅（validation.error/刪除）
`#F44336`、`#c62828`、`#9b2222`、`#ef9a9a`、`#efb7b7`、淡底 `#fff5f5`、dark 深底 `#3d1b1b`

### F. 警示橘 / 資訊藍（少量）
- 橘：`#ffb74d`、深字 `#8a6500`
- 藍：`#00CCFF` ×2（camera/live 指示）、淡底 `#e6f7ff`、dark 深底 `#1a3a4a`

### G. 遮罩/陰影/透明
`rgba(0,0,0, 0.1/0.28/0.45/0.5/0.6×2/0.7×2)`、`rgba(255,255,255, 0.2/0.85×2/0.9)`、`rgba(0,255,0,0.426)`（標註框底色）

## 3. 狀態 selector 盤點（focus/error/disabled/warning）

| 狀態 | 位置 | 現況 |
|---|---|---|
| focus（input/select/textarea）| 行 142-148（light）、151-165（dark/HC 成對）| 邊框色 + box-shadow，dark 重複定義 |
| error（.dataset-validation.error）| 行 251-263、dark 成對 264+ | 紅底紅字 |
| name-warning（.dataset-name-warning）| 行 547-558、dark 成對 559+ | 粉紅警示底 |
| disabled | **未發現 `:disabled` selector**（僅 HTML disabled 屬性原生樣式）| Stage 5 補 token 時一併定義 `--dsm-disabled-*` |
| 尺寸/圓角 | `border-radius` 分散（8px/6px/4px/20px 等）、間距 8/10/12px | 屬 §8.2 步驟 1「尺寸」項，建議 token 化順位低於色彩 |

## 4. 建議 token 對照（§8.2 步驟 2 用，**不改視覺值**）

| Token（提案）| 對應現值（light 預設）| 備註 |
|---|---|---|
| `--dsm-brand` | `#FE2F89` | 主品牌 |
| `--dsm-brand-strong` | `#c2185b` | hover/active |
| `--dsm-brand-soft` | `rgba(254,47,137,0.15)` | 淡底（alpha 變體收斂為 1-2 個）|
| `--dsm-brand-bg` | `#fdf2f7` | 品牌淡背景 |
| `--dsm-surface` | `#ffffff` | 面板底 |
| `--dsm-surface-alt` | `#fafafa` | 次表面（白階 7 種收斂）|
| `--dsm-border` | `#e0e0e0` | 邊框（灰階 4 種收斂）|
| `--dsm-border-strong` | `#cccccc` | |
| `--dsm-text` | `#333333` | 主文字 |
| `--dsm-text-secondary` | `#555555` | |
| `--dsm-text-muted` | `#999999` | |
| `--dsm-success` / `--dsm-success-bg` | `#4CAF50` / `#f1f8f2` | |
| `--dsm-error` / `--dsm-error-bg` | `#F44336` / `#fff5f5` | |
| `--dsm-warning` | `#ffb74d` | |
| `--dsm-info` | `#00CCFF` | |
| `--dsm-overlay` | `rgba(0,0,0,0.6)` | 遮罩（7 種 alpha 收斂）|
| `--dsm-focus-ring` | 現 focus box-shadow 色 | |
| `--dsm-canvas-fill` | `rgba(0,255,0,0.426)` | 標註 bbox 填色（UICanvas 專用）|

**Dark/HC 策略**：token 預設值定義於 `.dataset-manager-dialog`（light 基準）；`body.vscode-dark/high-contrast` 區塊改為「僅覆寫 token 值」（128 行成對 selector 可大幅收斂）；cocoya_dark/candy 主題經 theme_manager `cssVars`（body 層級）覆寫同名 token 即自動換膚。

## 5. 風險與相容性

1. **VSIX 靜態載入**：dataset_manager.css 以 `<link>` 靜態載入（非 Vite 打包）→ token 以純 CSS 自訂屬性實作即可，無建置相依；`:root` 或 dialog scope 皆可，建議 dialog scope 避免汙染全域。
2. **theme_manager 覆寫層級**：cssVars 設在 `document.body`，dialog 內元素可讀取（繼承）；但 dialog 自身定義的預設值**優先於** body 嗎？——否：自訂屬性以最近定義者為準，dialog 上定義的 `--dsm-*` 會覆蓋 body 的 → **需把 light 預設改掛 `:root` 或 body，dialog 不定義 token**，否則主題換膚失效（關鍵實作注意）。
3. **`rgba(0,255,0,0.426)`** 等怪值：屬標註畫布行為，token 化時**原值保留**，僅換參照方式。
4. **alpha 變體收斂**（brand 7 種、black 7 種）屬「語意相同才收斂」，逐案確認使用情境，不可盲併。

## 6. 下一切片（§8.2 步驟 2）

切片 2：將上表 token 以 `:root`/body 定義 light 預設值 + 逐批把高頻色彩（brand/灰階）改為 `var()` 參照，`node --test` + `vite build` + 實機目視對照（light/dark/candy 三主題截圖比對）。
