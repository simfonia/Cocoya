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
            // ★ 主題積木色：語系預設色載入後、模組積木註冊前，以偏好主題的 msgColours 覆寫 COLOUR_*
            if (window.CocoyaTheme) window.CocoyaTheme.applyMsgColours();
            this.registerPlugins();
            this.setupBlocklyPrompts();

            const finalToolboxXML = await this.buildToolboxXml(manifest, mediaUri, this.currentPlatform, this.currentLang);

            if (this.workspace) {
                try { this.workspace.dispose(); } catch(e) {}
            }

            // 啟用工作區註解功能 (Blockly v12+ 需要兩道手續)
            // 第一道：在 injectOptions 中啟用 workspaceComments
            const injectOptions = {
                toolbox: finalToolboxXML,
                media: mediaUri + '/media/',
                grid: { spacing: 20, length: 3, colour: '#ccc', snap: true },
                trashcan: true, sounds: false, scrollbars: true,
                contextMenu: true,
                workspaceComments: true,
                move: { scrollbars: true, drag: true, wheel: true },
                zoom: { controls: true, wheel: false, startScale: 1.0, maxScale: 3, minScale: 0.3, scaleSpeed: 1.2 }
            };

            if (this.useScrollPlugin) {
                const scrollDragger = window.ScrollBlockDragger || (window.ScrollOptions ? window.ScrollOptions.BlockDragger : undefined);
                const scrollMetrics = window.ScrollMetricsManager || (window.ScrollOptions ? window.ScrollOptions.MetricsManager : undefined);
                injectOptions.plugins = { 'blockDragger': scrollDragger, 'metricsManager': scrollMetrics };
            }

            // 第二道：手動註冊 context menu 的註解選項 (Blockly v12+ 重構機制)
            if (typeof Blockly.ContextMenuItems !== 'undefined' &&
                typeof Blockly.ContextMenuItems.registerCommentOptions === 'function') {
                Blockly.ContextMenuItems.registerCommentOptions();
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
            this.updatePlatformLabel();
            
            if (window.CocoyaUI) window.CocoyaUI.applyI18n();
            if (window.CocoyaUI) window.CocoyaUI.initToolbar((msg) => window.CocoyaBridge.send(msg.command, msg));
            // 語系檔此時已載入，重填縮排選單文案（initialize 時期 Msg 尚未就緒）
            if (typeof this.setupIndentSelector === 'function') this.setupIndentSelector();
            
            window.CocoyaBridge.send('setLocale', { messages: Blockly.Msg });

            if (window.CocoyaDataset && typeof window.CocoyaDataset.refreshI18n === 'function') {
                await window.CocoyaDataset.refreshI18n();
            }
            
            this.registerVariablesCallback();
            if (window.CocoyaUtils && CocoyaUtils.setupGeneratorOverrides) CocoyaUtils.setupGeneratorOverrides();

            // Ctrl+R / F5 攔截（2026-08-26）：webview 真重載會造成「前端未命名、後端仍錨定」的
            // 狀態不一致（Dataset Manager 進入閘因此誤放行）。改為 dirty 確認後回首頁。
            if (!this._reloadInterceptBound) {
                this._reloadInterceptBound = true;
                window.addEventListener('keydown', (e) => {
                    const isReload = ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')) || e.key === 'F5';
                    if (!isReload) return;
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleReloadRequest();
                }, true);
            }

            const restoredSnapshot = this._restoreReloadSnapshot();
            if (!restoredSnapshot && this.workspace.getTopBlocks(false).length === 0) {
                this.createDefaultBlocks();
            }
            
            setTimeout(() => {
                this.setupWorkspaceListeners();
                this.isInitializing = false;
                // 主題切換 reload 時快照還原 dirty（2026-09-01）：還原內容即維持髒，可繼續存回原檔；
                // 否則視為全新乾淨工作區（原本行為）。
                if (restoredSnapshot) {
                    this.isDirty = true;
                    if (window.CocoyaUI) window.CocoyaUI.setDirty(true);
                    this.setDirty(true);
                } else {
                    this.isDirty = false;
                    this.setDirty(false);
                }
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
    },

    /**
     * 於 initializeCocoya 建立 workspace 後還原主題切換的 reload 快照（2026-09-01）。
     * consume 一次：載入快照 xml、回復唯讀與檔名；回傳是否成功還原（true 表示非全新工作區）。
     * 快照由 persistence.snapshotWorkspaceForReload 產生（sessionStorage）。
     */
    _restoreReloadSnapshot: function() {
        if (!window.CocoyaApp || typeof window.CocoyaApp.consumeReloadSnapshot !== 'function' || !this.workspace) return false;
        const snap = window.CocoyaApp.consumeReloadSnapshot();
        if (!snap) return false;

        try {
            Blockly.Events.disable();
            try {
                this.workspace.clear();
                const dom = Blockly.utils.xml.textToDom(snap.xml);
                Blockly.Xml.domToWorkspace(dom, this.workspace);
            } finally {
                Blockly.Events.enable();
            }
            this.isReadOnly = !!snap.isReadOnly;
            if (snap.platform && this.currentPlatform && snap.platform !== this.currentPlatform) {
                console.warn('[App] reload snapshot platform mismatch, keep current:',
                    this.currentPlatform, 'snapshot=', snap.platform);
            }
            if (window.CocoyaUI) window.CocoyaUI.updateFileStatus(snap.filename || '');
            // 快照還原在 Blockly.Events.disable() 下進行（clear+domToWorkspace），minimap 靠事件 mirror 同步、
            // 期間不發事件 → minimap 空白。還原完成後強制重建 minimap 內容。
            if (window.CocoyaApp && typeof window.CocoyaApp.refreshMinimap === 'function') {
                window.CocoyaApp.refreshMinimap();
            }
            return true;
        } catch (e) {
            console.error('[App] reload snapshot restore failed:', e);
            return false;
        }
    }
});
