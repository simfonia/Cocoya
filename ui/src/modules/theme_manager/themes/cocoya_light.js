/**
 * Cocoya 淺色主題（基於 Blockly Classic）
 * 一個主題 = 一個檔案；cssVars 與樣式表預設值一致，供完整換膚覆寫
 */
(function() {
    'use strict';
    if (!window.CocoyaTheme) return;
    window.CocoyaTheme.registerTheme({
        id: 'cocoya_light',
        labelKey: 'BKY_THEME_LIGHT',
        labelFallback: 'Light',
        isDark: false,
        hideGrid: false,
        blockly: { base: 'classic' },
        cssVars: {
            '--cocoya-overlay': 'rgba(255,255,255,0.97)',
            '--cocoya-surface': '#ffffff',
            '--cocoya-fg': '#555555',
            '--cocoya-border': '#dddddd',
            '--cocoya-hover': '#f0f0f0',
            '--bg-color': '#ffffff',
            '--toolbar-bg': '#ffffff',
            '--toolbar-border': '#dddddd',
            '--code-bg': '#ffffff',
            '--code-header-bg': '#f3f3f3',
            '--code-border': '#dddddd',
            '--text-primary': '#333333',
            '--text-secondary': '#888888'
        }
    });
})();
