/**
 * Cocoya App 生命週期與通訊模組
 * 負責啟動初始化、Bridge 通訊、Toolbox 動態建構與起始積木建立
 */
window.CocoyaApp = Object.assign(window.CocoyaApp || {}, {
    isInitializing: true,
    promptRequests: new Map(),
    manifest: null,

    /**
     * 啟動初始化
     */
    init: function() {
        if (!window.CocoyaXMLRequests) window.CocoyaXMLRequests = new Map();
        
        // 初始化中央控制器 (必須在 setupWindowListeners 之前)
        this.controller = new window.AppController(this, window.CocoyaUI, window.CocoyaBridge);

        this.setupThemeSync();
        this.setupBlocklyPrompts();
        this.setupWindowListeners();
        this.setupPlatformSelector();
        this.setupIndentSelector();
        window.CocoyaBridge.send('getManifest');

        // 啟動時環境檢查 (由 Bridge 層決定是否真正執行)
        window.CocoyaBridge.send('checkStartupBackup');

        setTimeout(() => {
            window.CocoyaBridge.send('checkUpdate');
        }, 1000);
    },

    /**
     * 動態建構符合當前平台的 Toolbox XML
     */
    buildToolboxXml: async function(manifest, mediaUri, platform, lang) {
        const toolboxes = await CocoyaLoader.loadModules(manifest, mediaUri, platform, lang);

        const GROUP_CONFIG = {
            core: { container: null, sepBefore: false },
            ai_vision: { container: 'BKY_CAT_AI', colour: 'BKY_COLOUR_AI', sepBefore: true },
            ai_inference: { container: null, sepBefore: false },
            hardware: { container: null, sepBefore: true }
        };
        const GROUP_ORDER = ['core', 'ai_vision', 'ai_inference', 'hardware'];

        const groups = {};
        toolboxes.forEach(mod => {
            const meta = (manifest.modules || []).find(item => item.id === mod.id);
            const group = (meta && meta.group) || 'other';
            if (!groups[group]) groups[group] = [];
            groups[group].push(CocoyaUtils.filterToolboxXML(mod.xml, platform));
        });

        let finalXml = '<xml>';

        GROUP_ORDER.forEach(groupKey => {
            if (!groups[groupKey]) return;
            const mods = groups[groupKey];
            const config = GROUP_CONFIG[groupKey] || {};
            if (mods.join('').trim().length === 0) return;

            if (config.sepBefore && finalXml !== '<xml>') {
                finalXml += '<sep></sep>';
            }

            if (config.container) {
                finalXml += '<category name="%{' + config.container + '}" colour="%{' + (config.colour || config.container.replace('BKY_CAT_', 'BKY_COLOUR_')) + '}">';
                finalXml += mods.join('');
                finalXml += '</category>';
            } else {
                finalXml += mods.join('');
            }
        });

        finalXml += '</xml>';
        return finalXml;
    },

    /**
     * 設定全域視窗與通訊監聽
     */
    setupWindowListeners: function() {
        // 大部分的指令處理已移入 AppController
        window.addEventListener('resize', () => {
            if (this.workspace) Blockly.svgResize(this.workspace);
        });
    },

    /**
     * 核心初始化：建立工作區並加載模組
     */
    initializeCocoya: async function(manifest, mediaUri, lang) {
        if (this._isAlreadyInitializing) return;
        this._isAlreadyInitializing = true;
        this.isInitializing = true;
        
        this.manifest = manifest;
        this.currentLang = lang || 'zh-hant';
        window.CocoyaMediaUri = mediaUri;
        if (window.CocoyaUI) window.CocoyaUI.mediaUri = mediaUri;

        try {
            await CocoyaLoader.loadScript(`${mediaUri}/${this.currentLang}.js`);
            this.registerPlugins();
            this.setupBlocklyPrompts();

            const finalToolboxXML = await this.buildToolboxXml(manifest, mediaUri, this.currentPlatform, this.currentLang);

            if (this.workspace) {
                try { this.workspace.dispose(); } catch(e) {}
            }

            const injectOptions = {
                toolbox: finalToolboxXML,
                media: mediaUri + '/media/',
                grid: { spacing: 20, length: 3, colour: '#ccc', snap: true },
                trashcan: true, sounds: false, scrollbars: true,
                contextMenu: true,
                move: { scrollbars: true, drag: true, wheel: true },
                zoom: { controls: true, wheel: false, startScale: 1.0, maxScale: 3, minScale: 0.3, scaleSpeed: 1.2 }
            };

            if (this.useScrollPlugin) {
                const scrollDragger = window.ScrollBlockDragger || (window.ScrollOptions ? window.ScrollOptions.BlockDragger : undefined);
                const scrollMetrics = window.ScrollMetricsManager || (window.ScrollOptions ? window.ScrollOptions.MetricsManager : undefined);
                injectOptions.plugins = { 'blockDragger': scrollDragger, 'metricsManager': scrollMetrics };
            }

            this.workspace = Blockly.inject('blocklyDiv', injectOptions);
            this.initMinimap();

            setTimeout(() => {
                if (window.CocoyaUtils && CocoyaUtils.BlockSearcher) {
                    CocoyaUtils.BlockSearcher.buildIndex(this.workspace);
                    CocoyaUtils.BlockSearcher.inject(this.workspace);
                }
            }, 1000);

            if (Blockly.Python) Blockly.Python.PLATFORM = this.currentPlatform;
            const selector = document.getElementById('platform-selector');
            if (selector) selector.value = this.currentPlatform;
            
            if (window.CocoyaUI) window.CocoyaUI.applyI18n();
            if (window.CocoyaUI) window.CocoyaUI.initToolbar((msg) => window.CocoyaBridge.send(msg.command, msg));
            
            window.CocoyaBridge.send('setLocale', { messages: Blockly.Msg });
            
            this.registerVariablesCallback();
            if (window.CocoyaUtils && CocoyaUtils.setupGeneratorOverrides) CocoyaUtils.setupGeneratorOverrides();
            
            if (this.workspace.getTopBlocks(false).length === 0) {
                this.createDefaultBlocks();
            }
            
            setTimeout(() => {
                this.setupWorkspaceListeners();
                this.isInitializing = false;
                this.isDirty = false;
                this.setDirty(false);
                if (this.applyAutoTheme) this.applyAutoTheme();
                this.triggerCodeUpdate();
            }, 800); 

            await this.checkAutoBackup();
        } catch (error) {
            console.error('[App] Initialization Failed:', error);
        } finally {
            this._isAlreadyInitializing = false;
        }
    },

    /**
     * 設定 Blockly 自定義對話框攔截
     */
    setupBlocklyPrompts: function() {
        const self = this;
        Blockly.dialog.setPrompt((msg, def, cb) => {
            const id = 'prompt_' + Date.now();
            if (cb) self.promptRequests.set(id, cb);
            window.CocoyaBridge.send('prompt', { message: msg, defaultValue: def || '', requestId: id });
        });
        Blockly.dialog.setConfirm((msg, cb) => {
            const id = 'confirm_' + Date.now();
            if (cb) self.promptRequests.set(id, cb);
            window.CocoyaBridge.send('confirm', { message: msg, requestId: id });
        });
        Blockly.dialog.setAlert((msg, cb) => { 
            window.CocoyaBridge.send('alert', { message: msg }); 
            if (cb) cb(); 
        });
    },

    /**
     * 處理後端回傳的對話框輸入結果
     */
    handlePromptResponse: function(message) { 
        const cb = this.promptRequests.get(message.requestId); 
        if (cb) { 
            cb(message.result); 
            this.promptRequests.delete(message.requestId); 
        } 
    },

    /**
     * 處理後端回傳的模組 XML 資料
     */
    handleToolboxData: function(message) { 
        if (!window.CocoyaXMLRequests) return;
        const resolve = window.CocoyaXMLRequests.get(message.requestId); 
        if (resolve) { 
            resolve(message.data); 
            window.CocoyaXMLRequests.delete(message.requestId); 
        } 
    },

    /**
     * 根據目前平台建立起始積木
     */
    createDefaultBlocks: function() {
        if (this.minimap) this.minimap._isPaused = true;
        Blockly.Events.disable();
        try {
            let offsetX = 100; 
            const toolboxDiv = document.querySelector('.blocklyToolboxDiv');
            if (toolboxDiv && toolboxDiv.offsetWidth > 0) offsetX = toolboxDiv.offsetWidth + 20;
            if (isNaN(offsetX) || offsetX < 20 || offsetX > 350) offsetX = 100;

            this.workspace.clear();
            const defBlock = this.workspace.newBlock('py_definition_zone');
            defBlock.initSvg(); defBlock.render(); 
            defBlock.moveTo(new Blockly.utils.Coordinate(offsetX, 20));
            
            if (this.currentPlatform === 'MicroPython') {
                const mcuMain = this.workspace.newBlock('mcu_main');
                mcuMain.initSvg(); mcuMain.render(); 
                mcuMain.moveTo(new Blockly.utils.Coordinate(offsetX, 200));
                
                const loopBlock = this.workspace.newBlock('py_loop_while');
                loopBlock.initSvg(); loopBlock.render();
                const trueBlock = this.workspace.newBlock('py_logic_boolean');
                trueBlock.setFieldValue('True', 'BOOL');
                trueBlock.initSvg(); trueBlock.render();
                
                loopBlock.getInput('CONDITION').connection.connect(trueBlock.outputConnection);
                mcuMain.getInput('DO').connection.connect(loopBlock.previousConnection);
            } else {
                const mainBlock = this.workspace.newBlock('py_main');
                mainBlock.initSvg(); mainBlock.render(); 
                mainBlock.moveTo(new Blockly.utils.Coordinate(offsetX, 140));
            }
            setTimeout(() => { 
                if (this.minimap) { this.minimap._isPaused = false; this.refreshMinimap(); }
                this.workspace.clearUndo(); 
                this.isDirty = false;
                if (window.CocoyaUI) window.CocoyaUI.setDirty(false);
            }, 500); 
        } catch (e) { 
            console.error('[App] Failed to create default blocks:', e); 
        } finally {
            Blockly.Events.enable();
        }
    }
});
