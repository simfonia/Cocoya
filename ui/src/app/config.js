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
            const isDark = isVSCodeDark || 
                           (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

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
     * 設定平台切換選擇器
     */
    setupPlatformSelector: function() {
        const selector = document.getElementById('platform-selector');
        if (!selector) return;
        selector.onchange = async () => {
            const newPlatform = selector.value;
            if (newPlatform === this.currentPlatform) return;
            
            const confirmMsg = (Blockly.Msg['MSG_SWITCH_CONFIRM'] || '確定要切換至 %1 模式嗎？這將會重置工作區。').replace('%1', newPlatform);
            window.CocoyaBridge.send('confirmSwitch', { 
                message: confirmMsg, 
                newPlatform: newPlatform, 
                xml: Blockly.Xml.domToPrettyText(Blockly.Xml.workspaceToDom(this.workspace)) 
            });
            
            selector.value = this.currentPlatform;
        };
    },

    /**
     * 執行平台切換
     */
    switchPlatform: async function(platform) {
        await this.setPlatformUI(platform);
        this.resetWorkspace();
    },

    /**
     * 更新平台 UI
     */
    setPlatformUI: async function(platform) {
        this.currentPlatform = platform;
        localStorage.setItem('cocoya_platform', platform);
        const selector = document.getElementById('platform-selector');
        if (selector) selector.value = platform;
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
