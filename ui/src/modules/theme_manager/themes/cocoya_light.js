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
            '--text-secondary': '#888888',
            /* Dataset Manager tokens（Stage 5 切片 5：light 預設，確保切回 light 覆寫回 DM 預設值）*/
            '--dsm-brand': '#FE2F89',
            '--dsm-brand-soft': 'rgba(254, 47, 137, 0.15)',
            '--dsm-brand-strong': 'rgba(254, 47, 137, 0.3)',
            '--dsm-text': '#333333',
            '--dsm-text-secondary': '#555555',
            '--dsm-text-muted': '#999999',
            '--dsm-border-light': '#dddddd',
            '--dsm-border-strong': '#cccccc',
            '--dsm-surface': '#ffffff',
            '--dsm-surface-alt': '#f6f6f6',
            '--dsm-input-bg': '#ffffff',
            '--dsm-btn-bg': '#f7f7f7',
            '--dsm-btn-hover-bg': '#fff7fb',
            '--dsm-code-bg': '#fafafa',
            '--dsm-message-bg': '#fdf2f7',
            '--dsm-message-border': '#f2c6da',
            '--dsm-message-text': '#c2185b',
            '--dsm-disabled-bg': '#f0f0f0',
            '--dsm-disabled-text': '#aaaaaa',
            '--dsm-disabled-border': '#e0e0e0',
            '--dsm-error-bg': '#fff5f5',
            '--dsm-warning-bg': '#fff0f5',
            '--dsm-list-item-bg': '#eeeeee',
            '--dsm-success-bg': '#eefaf1',
            '--dsm-success-border': '#cdeeda',
            '--dsm-success-text': '#2e7d32',
            '--dsm-success-accent': '#4CAF50',
            '--dsm-card-bg': '#ffffff',
            '--dsm-card-border': '#dddddd',
            '--dsm-card-hover-border': '#FE2F89',
            '--dsm-dev-badge-bg': '#fff0f5',
            '--dsm-dev-badge-text': '#c2185b',
            '--dsm-type-badge-bg': '#fdf2f7'
        }
    });
})();
