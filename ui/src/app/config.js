/**
 * Cocoya App 配置與狀態模組
 * 負責主題同步、縮排設定、平台管理與環境變數
 */
window.CocoyaApp = Object.assign(window.CocoyaApp || {}, {
    currentPlatform: (function() {
        try { 
            let p = localStorage.getItem('cocoya_platform');
            if (p === 'CircuitPython' || p === 'MCU') {
                p = 'MicroPython';
                localStorage.setItem('cocoya_platform', p);
            }
            return p || 'MicroPython';
        } catch (e) { 
            return 'MicroPython'; 
        }
    })(),
    useScrollPlugin: localStorage.getItem('cocoya_use_scroll_plugin') === 'true',
    currentLang: 'zh-hant',

    /**
     * 設定自動主題同步
     */
    setupThemeSync: function() {
        const self = this;
        let lastIsDark = null;

        const applyTheme = (force = false) => {
            if (!self.workspace) return;

            const isVSCodeDark = document.body.classList.contains('vscode-dark') ||
                                 document.body.classList.contains('vscode-high-contrast');
            let isDark = isVSCodeDark ||
                           (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

            // 手動主題偏好（首頁快速設定）：auto=跟隨系統 / light / dark
            let themeMode = 'auto';
            try { themeMode = localStorage.getItem('cocoya_theme_mode') || 'auto'; } catch (e) { }
            if (themeMode === 'light') isDark = false;
            else if (themeMode === 'dark') isDark = true;

            // 同步 body class，供 CSS（如 Startup Home）做深/淺色變體
            document.body.classList.toggle('cocoya-dark-mode', isDark);
            document.body.classList.toggle('cocoya-light-mode', !isDark);

            if (!force && isDark === lastIsDark) return;
            lastIsDark = isDark;

            if (isDark && !self.darkThemeInstance && typeof Blockly.Theme === 'function') {
                try {
                    self.darkThemeInstance = new Blockly.Theme('cocoya_dark', {}, {}, {
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
                    });
                } catch (e) { }
            }

            try {
                const theme = isDark ? (self.darkThemeInstance || 'dark') : (Blockly.Themes.Classic || 'classic');
                self.workspace.setTheme(theme);
                const grid = self.workspace.getGrid();
                if (grid && typeof grid.setVisible === 'function') grid.setVisible(!isDark);
                if (self.minimap && self.minimap.minimapWorkspace) {
                    self.minimap.minimapWorkspace.setTheme(theme);
                }
            } catch (e) { }
        };

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    applyTheme();
                    break;
                }
            }
        });
        observer.observe(document.body, { attributes: true });

        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());
        }

        this.applyAutoTheme = applyTheme;
    },

    /**
     * 設定縮排選擇器
     */
    setupIndentSelector: function() {
        const selector = document.getElementById('indent-selector');
        if (!selector) return;
        selector.onchange = () => {
            if (Blockly.Python) {
                const indentSize = parseInt(selector.value, 10);
                Blockly.Python.INDENT = ' '.repeat(indentSize);
                if (Blockly.Python.init) Blockly.Python.init(this.workspace);
                this.triggerCodeUpdate();
            }
        };
        if (Blockly.Python) Blockly.Python.INDENT = '    ';
    },

    /**
     * 更新唯讀平台標籤 (取代舊的 platform-selector)
     */
    updatePlatformLabel: function() {
        const label = document.getElementById('current-platform');
        if (!label) return;
        label.textContent = (Blockly.Msg['TLB_MODE_PC'] || '💻 Python (PC)');
        if (this.currentPlatform === 'MicroPython') {
            label.textContent = (Blockly.Msg['TLB_MODE_MCU'] || '📟 MicroPython (MCU)');
        }
    },

    /**
     * 更新平台 UI
     */
    setPlatformUI: async function(platform) {
        this.currentPlatform = platform;
        localStorage.setItem('cocoya_platform', platform);
        this.updatePlatformLabel();
        if (Blockly.Python) Blockly.Python.PLATFORM = platform;
        
        if (this.manifest) {
            const finalXml = await this.buildToolboxXml(this.manifest, window.CocoyaMediaUri, platform, this.currentLang);
            this.workspace.updateToolbox(finalXml);
            setTimeout(() => {
                if (window.CocoyaUtils && CocoyaUtils.BlockSearcher) {
                    CocoyaUtils.BlockSearcher.buildIndex(this.workspace);
                    CocoyaUtils.BlockSearcher.inject(this.workspace);
                }
            }, 500);
        }
        if (window.CocoyaUI) {
            window.CocoyaUI.updateRunTooltip(platform);
            window.CocoyaUI.updateSettingsMenu(platform);
        }
    }
});
