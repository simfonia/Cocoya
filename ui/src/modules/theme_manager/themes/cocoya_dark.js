/**
 * Cocoya 深色主題（完全自足）
 * - componentStyles：Blockly 工作區/toolbox/flyout 配色
 * - cssVars：UI 調色盤（inline 覆寫樣式表 fallback）
 * - css：本主題專屬規則（深色行為補丁：icon 反轉、grid 隱藏、toolbox 增亮、hljs 語法色等），
 *   由 ThemeManager 注入 <style id=cocoya-theme-css>；style.css 不再包含任何深色規則
 */
(function() {
    'use strict';
    if (!window.CocoyaTheme) return;
    window.CocoyaTheme.registerTheme({
        id: 'cocoya_dark',
        labelKey: 'BKY_THEME_DARK',
        labelFallback: 'Dark',
        isDark: true,
        hideGrid: true,
        blockly: {
            name: 'cocoya_dark',
            componentStyles: {
                'workspaceBackgroundColour': '#1e1e1e',
                'toolboxBackgroundColour': '#2d2d2d',
                'toolboxTextColour': '#e0e0e0',
                'flyoutBackgroundColour': '#252526',
                'flyoutTextColour': '#ccc',
                'scrollbarColour': '#797979',
                'insertionMarkerColour': '#fff',
                'insertionMarkerOpacity': 0.3,
                'scrollbarOpacity': 0.4,
                'cursorColour': '#d0d0d0'
            }
        },
        cssVars: {
            '--cocoya-overlay': '#1e1e1e',
            '--cocoya-surface': '#2d2d2d',
            '--cocoya-fg': '#d4d4d4',
            '--cocoya-border': '#444444',
            '--cocoya-hover': '#3a3a3a',
            '--bg-color': '#1e1e1e',
            '--toolbar-bg': '#2d2d2d',
            '--toolbar-border': '#404040',
            '--code-bg': '#1e1e1e',
            '--code-header-bg': '#252526',
            '--code-border': '#404040',
            '--text-primary': '#e0e0e0',
            '--text-secondary': '#aaaaaa'
        },
        css: `
/* --- VS Code / System Theme Integration --- */

/* 深色模式全局變數 */
body.cocoya-dark-mode,
body.cocoya-dark-mode {
    --bg-color: #1e1e1e;
    --toolbar-bg: #2d2d2d;
    --toolbar-border: #404040;
    --code-bg: #1e1e1e;
    --code-header-bg: #252526;
    --code-border: #404040;
    --text-primary: #e0e0e0;
    --text-secondary: #aaaaaa;
    --highlight-bg: #3a3d41;
}

/* 1. 強制修正 Blockly 內部組件顏色 (最高優先權) */
body.cocoya-dark-mode .blocklyMainBackground {
    fill: #1e1e1e !important;
}
/* Flyout 實色 + 邊框，避免半透明與編輯區融為一體 */
body.cocoya-dark-mode .blocklyFlyoutBackground {
    fill: #252526 !important;
    fill-opacity: 1 !important;
    stroke: #4a4a4a !important;
    stroke-width: 1px !important;
}

/* 隱藏格點 (透過 CSS) */
body.cocoya-dark-mode .blocklyGrid,
body.cocoya-dark-mode .blocklyGrid {
    display: none;
}

/* 修正 Toolbox 背景與文字 */
body.cocoya-dark-mode .blocklyToolboxDiv,
body.cocoya-dark-mode .blocklyToolboxDiv {
    background-color: #252526 !important;
    color: #cccccc !important;
}

/* 修正分類展開三角形與圖示 (終極補丁) — 僅反轉圖示，文字交由 .blocklyTreeLabel 規則（反轉淺色文字會變黑） */
body.cocoya-dark-mode .blocklyToolboxDiv [class*="blocklyTreeIcon"],
body.cocoya-dark-mode .blocklyToolboxDiv [class*="TreeIcon"],
body.cocoya-dark-mode .blocklyTreeRow i,
body.cocoya-dark-mode .blocklyTreeRow div {
    filter: invert(1) brightness(10) !important; /* 強力增亮 */
    color: #ffffff !important; /* 如果是字體圖示 */
    fill: #ffffff !important;  /* 如果是 SVG */
    opacity: 1 !important;
}

/* 針對可能的嵌入式 SVG path */
body.cocoya-dark-mode .blocklyToolboxDiv svg path,
body.cocoya-dark-mode .blocklyToolboxDiv svg path {
    fill: #ffffff !important;
}

/* 確保文字清晰度 */
body.cocoya-dark-mode .blocklyTreeLabel,
body.cocoya-dark-mode .blocklyTreeLabel {
    color: #ffffff !important;
    font-weight: 500 !important;
}

/* 修正 Flyout (積木抽屜) 中的標籤文字與分隔線 */
body.cocoya-dark-mode .blocklyFlyoutLabelText,
body.cocoya-dark-mode .blocklyFlyoutLabelText {
    fill: #cccccc !important; /* SVG 文字使用 fill */
}

/* 修正積木群組的分隔線 */
body.cocoya-dark-mode .blocklyTreeSeparator,
body.cocoya-dark-mode .blocklyTreeSeparator {
    border-bottom: 1px solid #444 !important;
}

/* --- 停用 (孤兒) 積木視覺 --- */
.blocklyDisabled > .blocklyPath {
    fill-opacity: 0.3 !important;
    stroke-opacity: 0.5 !important;
}

.blocklyDisabled > .blocklyText,
.blocklyDisabled > .blocklyIconGroup {
    fill-opacity: 0.5 !important;
    opacity: 0.5 !important;
}

/* 深色模式下的停用視覺增強 */
body.cocoya-dark-mode .blocklyDisabled > .blocklyPath,
body.cocoya-dark-mode .blocklyDisabled > .blocklyPath {
    fill: #444444 !important;
    fill-opacity: 0.4 !important;
    stroke: #666666 !important;
}

/* 確保 Minimap 中的停用視覺同步 */
.blocklyMinimap .blocklyDisabled > .blocklyPath {
    fill: #555555 !important;
    fill-opacity: 0.5 !important;
}

/* 2. 修正 UI 元件 */
body.cocoya-dark-mode #toolbar,
body.cocoya-dark-mode #toolbar {
    background-color: var(--toolbar-bg);
    border-bottom: 1px solid var(--toolbar-border);
}

body.cocoya-dark-mode .toolbar-separator,
body.cocoya-dark-mode .toolbar-separator {
    background-color: var(--toolbar-border);
}

body.cocoya-dark-mode .platform-select,
body.cocoya-dark-mode .platform-badge,
body.cocoya-dark-mode .platform-badge {
    background-color: #3c3c3c;
    border-color: #555;
    color: #e0e0e0;
}

body.cocoya-dark-mode .dropdown-content,
body.cocoya-dark-mode .submenu-content,
body.cocoya-dark-mode .submenu-content {
    background-color: #2d2d2d;
    border-color: #404040;
    box-shadow: 0px 8px 16px 0px rgba(0, 0, 0, 0.5);
}

body.cocoya-dark-mode .dropdown-separator,
body.cocoya-dark-mode .dropdown-separator {
    background-color: #444;
}

body.cocoya-dark-mode .dropdown-item,
body.cocoya-dark-mode .dropdown-item {
    color: #cccccc;
}

body.cocoya-dark-mode .dropdown-item:hover,
body.cocoya-dark-mode .dropdown-item:hover {
    background-color: #3e3e3e;
    color: #FE2F89;
}
/* 自動反轉圖示顏色 (排除 Python Logo 與停止按鈕) */
body.cocoya-dark-mode .normal-icon:not([src*="python"]):not([src*="stop_24dp_EA3323"]),
body.cocoya-dark-mode .normal-icon:not([src*="python"]):not([src*="stop_24dp_EA3323"]) {
    filter: invert(1) brightness(0.65);
}
  /* toolbar 按鈕與首頁版本檢查的黑色圖示：深色下反白（排除 Python Logo、停止、執行按鈕與版本檢查的彩色狀態圖示） */
  body.cocoya-dark-mode .toolbar-btn img:not([src*="python"]):not([src*="stop_24dp_EA3323"]):not([src*="run_blocks"]):not([src*="published_with_changes"]):not([src*="cloud_download"]),
  body.cocoya-dark-mode #startup-home .startup-update-btn img:not([src*="75FB4C"]):not([src*="FE2F89"]),
  body.cocoya-dark-mode #startup-home .startup-update-btn img:not([src*="75FB4C"]):not([src*="FE2F89"]) {
      filter: invert(1) brightness(0.65);
  }

#btn-run:hover {
    background-color: #e8f5e9 !important; /* 淺綠色背景 */
}

#btn-stop:hover {
    background-color: #fdecea !important; /* 淺紅色背景 */
}

body.cocoya-dark-mode #btn-run:hover,
body.cocoya-dark-mode #btn-run:hover {
    background-color: #1b3a1f !important; /* 深綠色背景 */
}

body.cocoya-dark-mode #btn-stop:hover,
body.cocoya-dark-mode #btn-stop:hover {
    background-color: #442a2a !important; /* 深紅色背景 */
}

/* 3. 修正程式碼預覽區 */

body.cocoya-dark-mode .dropdown-item img:not([src*="python"]):not([src*="module-puzzle"]):not([src*="cloud-24"]),
body.cocoya-dark-mode .dropdown-item img:not([src*="python"]):not([src*="module-puzzle"]):not([src*="cloud-24"]) {
    filter: invert(1) brightness(0.65);
}

/* 3. 修正程式碼預覽區 */
body.cocoya-dark-mode #codeArea,
body.cocoya-dark-mode #codeArea {
    background-color: var(--code-bg);
    color: var(--text-primary);
    border-left: 1px solid var(--code-border);
}

body.cocoya-dark-mode #codeHeader,
body.cocoya-dark-mode #codeHeader {
    background-color: var(--code-header-bg);
    color: var(--text-secondary);
    border-bottom: 1px solid var(--code-border);
}

body.cocoya-dark-mode #codeContent,
body.cocoya-dark-mode #codeContent {
    background-color: var(--code-bg) !important;
    color: #d4d4d4; /* VS Code 預設文字色 */
}

body.cocoya-dark-mode .code-line:before,
body.cocoya-dark-mode .code-line:before {
    color: #858585;
    border-right: 1px solid #333333;
    background-color: #1e1e1e;
}

/* 深色模式下的 Minimap */
body.cocoya-dark-mode .blockly-minimap,
body.cocoya-dark-mode .blockly-minimap .blocklySvg,
body.cocoya-dark-mode .blockly-minimap .blocklySvg {
    background-color: #1e1e1e !important;
}

/* 4. Highlight.js 深色模式覆寫 (避免載入兩個 CSS) */
body.cocoya-dark-mode .hljs-keyword,
body.cocoya-dark-mode .hljs-selector-tag { color: #569cd6; }
body.cocoya-dark-mode .hljs-selector-tag  { color: #569cd6; }
body.cocoya-dark-mode .hljs-string { color: #ce9178; }
body.cocoya-dark-mode .hljs-string  { color: #ce9178; }
body.cocoya-dark-mode .hljs-number { color: #b5cea8; }
body.cocoya-dark-mode .hljs-number  { color: #b5cea8; }
body.cocoya-dark-mode .hljs-comment { color: #6a9955; }
body.cocoya-dark-mode .hljs-comment  { color: #6a9955; }
body.cocoya-dark-mode .hljs-title { color: #dcdcaa; }
body.cocoya-dark-mode .hljs-title  { color: #dcdcaa; }
body.cocoya-dark-mode .hljs-params { color: #9cdcfe; }
body.cocoya-dark-mode .hljs-params  { color: #9cdcfe; }
body.cocoya-dark-mode .hljs-built_in { color: #4ec9b0; }
body.cocoya-dark-mode .hljs-built_in  { color: #4ec9b0; }

/* Serial 下拉清單：維持與淺色主題相同外觀（含彈出選單） */
body.cocoya-dark-mode .serial-select {
    color-scheme: light;
}

/* indent 下拉清下拉清單：維持與淺色主題相同外觀（含彈出選單） */
body.cocoya-dark-mode .indent-select {
    color-scheme: light;
}

/* 原生表單控制項（下拉彈出、捲軸）跟隨深色渲染。
   ★ 不自訂 option 顏色：Chromium 原生彈出清單的 option 樣式支援殘缺，
   強上色會產生 hover 反轉等錯亂；交給 color-scheme 統一以系統深色渲染。 */
body.cocoya-dark-mode {
    color-scheme: dark;
}

/* 「開新專案」清單對齊「設定」dropdown 樣式 */
body.cocoya-dark-mode #toolbar-new-menu {
    background-color: #2d2d2d !important;
    border-color: #404040 !important;
    box-shadow: 0px 8px 16px 0px rgba(0, 0, 0, 0.5) !important;
}
body.cocoya-dark-mode #toolbar-new-menu .startup-new-option {
    background-color: #2d2d2d !important;
    color: #cccccc !important;
}
body.cocoya-dark-mode #toolbar-new-menu .startup-new-option:hover {
    background-color: #3e3e3e !important;
    color: #FE2F89 !important;
}

/* toolbar 按鈕 hover：深色底（對齊 toolbox/dropdown 的低調 hover） */
body.cocoya-dark-mode .toolbar-btn:not(#btn-run):not(#btn-stop):hover {
    background-color: #3e3e3e !important;
}

/* toolbox 分類文字：涵蓋新舊版 Blockly 類名，並禁用任何殘留濾鏡 */
body.cocoya-dark-mode .blocklyTreeLabel,
body.cocoya-dark-mode .blocklyTreeRow .blocklyTreeLabel,
body.cocoya-dark-mode .blocklyToolboxCategoryLabel {
    color: #bcbcbc !important;
    filter: none !important;
}
`,     }); })();

