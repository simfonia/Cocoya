# 計畫：主題樣式表模組化 (Theme Manager Module)

*日期：2026-08-24　任務：#task[主題樣式表]*

## 目標
將首頁主題切換功能獨立為可擴充模組，為未來「自訂主題」預留接口。

## 設計決策
1. **一個主題 = 一個檔案**，每個主題是完整獨立的單一風格，不做 light/dark 成對結構
   - `themes/cocoya_light.js`、`themes/cocoya_dark.js`
   - 未來高對比/護眼等主題直接加檔即可
2. **auto 是模式不是主題**：`setMode('auto')` 由 theme_manager 動態解析成具體主題（依系統深淺挑 isDark 相符者）
3. **Registry 驅動 UI**：首頁下拉選單由 `CocoyaTheme.getThemes()` 動態生成，不掃資料夾（webview 無目錄列舉能力）；新主題只需加檔 + index.html 一行 script
4. **CSS 變數換膚**：主題定義攜帶 `cssVars`，套用時寫入 body inline style；樣式表改吃變數，消除逐元素深色覆寫
5. **localStorage 遷移**：舊值 `light/dark` 讀取時映射為 `cocoya_light/cocoya_dark`，key `cocoya_theme_mode` 不變

## 新檔案
| 檔案 | 內容 |
|---|---|
| `ui/src/modules/theme_manager/theme_manager.js` | 核心：registerTheme/getThemes/setMode/getMode/apply/startWatching、MutationObserver + matchMedia 監聽 |
| `ui/src/modules/theme_manager/themes/cocoya_light.js` | 淺色主題（Blockly Classic + 淺色 CSS 變數） |
| `ui/src/modules/theme_manager/themes/cocoya_dark.js` | 深色主題（原 config.js 硬編碼配色抽出 + 深色 CSS 變數） |

## 修改
- `ui/index.html`：載入三個新 script；首頁主題 select 移除寫死 option 改 JS 動態生成；首頁 inline 樣式改用 CSS 變數
- `ui/src/app/config.js`：`setupThemeSync` 改薄委派至 `CocoyaTheme`（保留方法簽名相容 api_manifest.md）
- `ui/src/app/persistence.js`：首頁 select 填充改由 registry 展開；onchange 改呼叫 `CocoyaTheme.setMode()`
- `ui/src/style.css`：新增 `--cocoya-*` 變數（預設淺色 + `body.cocoya-dark-mode` 覆寫），Startup Home 深色區塊重構

## Theme Definition 格式
```js
CocoyaTheme.registerTheme({
    id: 'cocoya_dark',
    labelKey: 'BKY_THEME_DARK',
    labelFallback: 'Dark',
    isDark: true,
    hideGrid: true,
    blockly: { name: 'cocoya_dark', componentStyles: {} },
    cssVars: { '--cocoya-surface': '#2d2d2d' }
});
```

## 驗證
- [ ] `node --check`（theme_manager + 2 themes + config/persistence）
- [ ] `npx vite build` 成功
- [ ] 實機：首頁切主題即時套用、auto 跟隨系統、重啟記住偏好
