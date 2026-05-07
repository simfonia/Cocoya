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
        this.setupThemeSync();
        this.setupBlocklyPrompts();
        this.setupWindowListeners();
        this.setupPlatformSelector();
        this.setupIndentSelector();
        window.CocoyaBridge.send('getManifest');

        // Tauri 專屬：啟動後主動檢查是否有遺留的孤兒備份
        if (window.CocoyaBridge.isTauri) {
            window.CocoyaBridge.send('checkStartupBackup');
        }

        setTimeout(() => {
            window.CocoyaBridge.send('checkUpdate');
        }, 1000);
    },

    /**
     * 動態建構符合當前平台的 Toolbox XML
     */
    buildToolboxXml: async function(manifest, mediaUri, platform, lang) {
        const toolboxes = await CocoyaLoader.loadModules(manifest, mediaUri, platform, lang);
        const coreXml = [];
        const aiXml = [];
        const otherXml = [];

        toolboxes.forEach(mod => {
            const filteredXml = CocoyaUtils.filterToolboxXML(mod.xml, platform);
            if (mod.id.startsWith('core/')) coreXml.push(filteredXml);
            else if (mod.id.startsWith('cv_') || mod.id.startsWith('ai_')) aiXml.push(filteredXml);
            else otherXml.push(filteredXml);
        });

        let finalXml = `<xml>${coreXml.join('')}<sep></sep>`;
        if (aiXml.length > 0) {
            finalXml += `<category name="%{BKY_CAT_AI}" colour="%{BKY_COLOUR_AI}">${aiXml.join('')}</category>`;
        }
        finalXml += `${otherXml.join('')}</xml>`;
        return finalXml;
    },

    /**
     * 設定全域視窗與通訊監聽
     */
    setupWindowListeners: function() {
        window.CocoyaBridge.onMessage(async (message) => {
            switch (message.command) {
                case 'manifestData': await this.initializeCocoya(message.data, message.mediaUri, message.lang); break;
                case 'loadWorkspace': await this.loadWorkspace(message.xml, message.filename, message.platform, message.is_read_only); break;
                case 'resetWorkspace': this.resetWorkspace(); break;
                case 'saveCompleted': this.onSaveCompleted(message.filename); break;
                case 'runCompleted': if (window.CocoyaUI) window.CocoyaUI.flashButton('btn-run', '#c8e6c9'); break;
                case 'updateStatus': if (window.CocoyaUI) window.CocoyaUI.setUpdateStatus(message.data); break;
                case 'serialPortsData': if (window.CocoyaUI) window.CocoyaUI.updateSerialPorts(message.ports); break;
                case 'environmentStatus': if (window.CocoyaUI) window.CocoyaUI.updateEnvironmentStatus(message.results); break;
                case 'switchPlatform': await this.switchPlatform(message.platform); break;
                case 'recoveryData': await this.checkAutoBackup(message.xml); break;
                case 'promptResponse': this.handlePromptResponse(message); break;
                case 'toolboxData': this.handleToolboxData(message); break;
            }
        });

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
