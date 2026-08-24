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
     * 設定自動主題同步（委派至 Theme Manager 模組；保留方法簽名相容既有呼叫點）
     */
    setupThemeSync: function() {
        if (window.CocoyaTheme) {
            window.CocoyaTheme.startWatching();
            window.CocoyaTheme.apply(true);
            this.applyAutoTheme = function(force) {
                window.CocoyaTheme.apply(!!force);
            };
        }
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
