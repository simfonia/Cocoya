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
     * 設定縮排選擇器（自繪 dropdown）
     */
    setupIndentSelector: function() {
        const root = document.getElementById('indent-selector');
        if (!root) return;
        const trigger = root.querySelector('.indent-dropdown-trigger');
        const labelEl = root.querySelector('.indent-dropdown-label');
        const menu = root.querySelector('.indent-dropdown-menu');
        const items = root.querySelectorAll('.indent-dropdown-item');
        if (!trigger || !menu) return;

        // i18n 文案填充：每次呼叫都重填（語系檔於 initializeCocoya 才載入，需二次填充）
        const label2 = (Blockly.Msg['TLB_INDENT_2'] || '2 空格');
        const label4 = (Blockly.Msg['TLB_INDENT_4'] || '4 空格');
        const labelMap = { 2: label2, 4: label4 };
        items.forEach((it) => {
            it.textContent = labelMap[it.getAttribute('data-value')] || it.textContent;
        });

        // 事件綁定僅一次（本函式會被 initialize 與 initializeCocoya 各呼叫一次）
        if (!this._indentBound) {
            this._indentBound = true;

            const applyValue = (value) => {
                if (!Blockly.Python) return;
                const indentSize = parseInt(value, 10);
                if (!indentSize) return;
                Blockly.Python.INDENT = ' '.repeat(indentSize);
                labelEl.textContent = labelMap[indentSize] || value;
                items.forEach((it) => {
                    it.classList.toggle('active', it.getAttribute('data-value') === String(indentSize));
                });
                close();
                if (Blockly.Python.init) Blockly.Python.init(this.workspace);
                this.triggerCodeUpdate();
            };

            const close = () => {
                root.classList.remove('open');
                trigger.setAttribute('aria-expanded', 'false');
            };
            const toggle = () => {
                const isOpen = root.classList.toggle('open');
                trigger.setAttribute('aria-expanded', String(isOpen));
            };

            trigger.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
            items.forEach((it) => {
                it.addEventListener('click', (e) => {
                    e.stopPropagation();
                    applyValue(it.getAttribute('data-value'));
                });
            });
            document.addEventListener('click', () => close());
        }

        // 同步目前縮排欄位到 UI（初始/平台切換/語系載入後）
        const currentIndent = (Blockly.Python && Blockly.Python.INDENT) ? Blockly.Python.INDENT.length : 4;
        const currentValue = String(currentIndent === 2 ? 2 : 4);
        items.forEach((it) => it.classList.toggle('active', it.getAttribute('data-value') === currentValue));
        labelEl.textContent = labelMap[currentIndent === 2 ? 2 : 4];
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
