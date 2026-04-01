/**
 * Cocoya Engine Class
 * 負責單一工作區的生命週期、積木邏輯與產生器適配
 */
class CocoyaEngine {
    constructor(options = {}) {
        this.containerId = options.containerId || 'blocklyDiv';
        this.workspace = null;
        this.minimap = null;
        this.isDirty = false;
        this.updateTimer = null;
        this.currentPlatform = options.platform || 'PC';
        this.currentLang = options.lang || 'zh-hant';
        this.manifest = options.manifest || null;
        this.mediaUri = options.mediaUri || '';
        this.lastCleanCode = '';
        this.promptRequests = new Map();

        // 事件掛鉤
        this.onCodeUpdate = options.onCodeUpdate || null;
        this.onDirtyChange = options.onDirtyChange || null;
    }

    /**
     * 初始化引擎
     */
    async init(manifest, mediaUri, lang) {
        this.manifest = manifest;
        this.mediaUri = mediaUri;
        this.currentLang = lang || 'zh-hant';

        try {
            // 1. 載入核心語系
            const langUrl = `${mediaUri}/${this.currentLang}.js`;
            await CocoyaLoader.loadScript(langUrl);
            
            // 檢查語系是否載入成功
            if (!Blockly.Msg["TLB_NEW"]) {
                console.warn(`[CocoyaEngine] Language file might not have loaded correctly.`);
            }

            this.registerPlugins();
            this.setupBlocklyPrompts();

            // 2. 建立 Toolbox
            const finalToolboxXML = await this.buildToolboxXml(this.manifest, this.mediaUri, this.currentPlatform, this.currentLang);

            // 3. 注入 Blockly
            const scrollDragger = window.ScrollBlockDragger || (window.ScrollOptions ? window.ScrollOptions.BlockDragger : undefined);
            const scrollMetrics = window.ScrollMetricsManager || (window.ScrollOptions ? window.ScrollOptions.MetricsManager : undefined);

            this.workspace = Blockly.inject(this.containerId, {
                toolbox: finalToolboxXML,
                grid: { spacing: 20, length: 3, colour: '#ccc', snap: true },
                trashcan: true, sounds: false, scrollbars: true,
                move: { scrollbars: true, drag: true, wheel: true },
                zoom: { controls: true, wheel: false, startScale: 1.0, maxScale: 3, minScale: 0.3, scaleSpeed: 1.2 },
                plugins: { 'blockDragger': scrollDragger, 'metricsManager': scrollMetrics }
            });

            // 4. 設定插件與輔助工具
            this.setupScrollOptions();
            this.initMinimap();
            this.setupSearch();

            // 5. 設定產生器
            if (Blockly.Python) Blockly.Python.PLATFORM = this.currentPlatform;
            CocoyaUtils.setupGeneratorOverrides();

            // 6. 監聽變動
            this.setupWorkspaceListeners();

            // 7. 建立初始積木 (若為空)
            if (this.workspace.getTopBlocks(false).length === 0) {
                this.createDefaultBlocks();
            }

            this.triggerCodeUpdate();
            
            // 8. 立即套用語系至 UI
            if (window.CocoyaUI) window.CocoyaUI.applyI18n();
            
            return true;
        } catch (error) {
            console.error('[CocoyaEngine] Initialization Failed:', error);
            return false;
        }
    }

    setupScrollOptions() {
        const ScrollOptionsPlugin = window.ScrollOptions || (window.ScrollOptionsPlugin && window.ScrollOptionsPlugin.ScrollOptions);
        if (ScrollOptionsPlugin) {
            try {
                const scrollOptions = new ScrollOptionsPlugin(this.workspace);
                scrollOptions.init({
                    enableWheelScroll: true,
                    enableEdgeScroll: true,
                    edgeScrollOptions: {
                        slowBlockSpeed: 0.15,
                        fastBlockSpeed: 0.5,
                        slowMouseSpeed: 0.25,
                        fastMouseSpeed: 1.0,
                        fastBlockStartDistance: 80,
                        fastMouseStartDistance: 60
                    }
                });
            } catch (e) { }
        }
    }

    initMinimap() {
        try {
            const MinimapClass = (window.workspaceMinimap && window.workspaceMinimap.PositionedMinimap) || 
                               (window.PositionedMinimap) || 
                               (Blockly.workspaceMinimap && Blockly.workspaceMinimap.PositionedMinimap);
            if (!MinimapClass) return;

            this.minimap = new MinimapClass(this.workspace);
            this.minimap.init();

            // 修正 Minimap 的鏡像邏輯 (防護)
            const originalMirror = this.minimap.mirror.bind(this.minimap);
            this.minimap.mirror = (event) => {
                if (this.minimap._isPaused) return;
                try {
                    if (event.type === Blockly.Events.BLOCK_CREATE && !this.workspace.getBlockById(event.blockId)) return;
                    originalMirror(event);
                } catch (e) { }
            };

            // 建立切換按鈕 (如果是在 CocoyaApp 模式下才需要)
            if (this.containerId === 'blocklyDiv') {
                this.setupMinimapToggle();
            }
        } catch (e) { }
    }

    setupMinimapToggle() {
        const mWrapper = document.querySelector('.blockly-minimap');
        if (mWrapper) {
            let toggleBtn = document.getElementById('minimap-toggle');
            if (!toggleBtn) {
                toggleBtn = document.createElement('div');
                toggleBtn.id = 'minimap-toggle';
                document.getElementById('blocklyArea').appendChild(toggleBtn);
            }
            
            const updateBtnUI = (isCollapsed) => {
                if (isCollapsed) {
                    const iconUri = `${this.mediaUri}/icons/public_24dp_FE2F89.png`;
                    toggleBtn.style.background = 'white';
                    toggleBtn.innerHTML = `<img src="${iconUri}" style="width: 18px; height: 18px; vertical-align: middle;">`;
                } else {
                    toggleBtn.style.background = '#FE2F89';
                    toggleBtn.innerHTML = '&#10005;';
                }
            };

            updateBtnUI(mWrapper.classList.contains('collapsed'));

            toggleBtn.onclick = () => {
                const isCollapsed = mWrapper.classList.toggle('collapsed');
                updateBtnUI(isCollapsed);
                this.minimap._isPaused = isCollapsed;
                if (!isCollapsed) this.refreshMinimap();
            };
        }
    }

    setupSearch() {
        setTimeout(() => {
            CocoyaUtils.BlockSearcher.buildIndex(this.workspace);
            CocoyaUtils.BlockSearcher.inject(this.workspace);
        }, 1000);
    }

    setupWorkspaceListeners() {
        this.workspace.addChangeListener((event) => {
            const isBlockChange = [
                Blockly.Events.BLOCK_MOVE, 
                Blockly.Events.BLOCK_CREATE, 
                Blockly.Events.BLOCK_CHANGE, 
                Blockly.Events.BLOCK_DELETE, 
                Blockly.Events.VAR_CREATE, 
                Blockly.Events.VAR_RENAME, 
                Blockly.Events.VAR_DELETE
            ].includes(event.type);

            if (isBlockChange && !event.isUiEvent) {
                this.setDirty(true);
                this.triggerBlockStateUpdate();
            }

            if (event.type === Blockly.Events.SELECTED) {
                if (window.CocoyaUI) window.CocoyaUI.syncSelection(event.newElementId);
            }

            if (!event.isUiEvent || isBlockChange) {
                this.triggerCodeUpdate();
            }
        });

        // 註冊變數類別
        this.workspace.registerToolboxCategoryCallback('VARIABLE', (ws) => {
            const xmlList = [];
            xmlList.push(Blockly.utils.xml.textToDom('<button text="%{BKY_NEW_VARIABLE}" callbackKey="CREATE_VARIABLE"></button>'));
            xmlList.push(Blockly.utils.xml.textToDom('<block type="py_variables_global"></block>'));
            xmlList.push(Blockly.utils.xml.textToDom('<block type="py_variables_set"><value name="VALUE"><shadow type="py_math_number"><field name="NUM">0</field></shadow></value></block>'));
            xmlList.push(Blockly.utils.xml.textToDom('<block type="py_variables_get"></block>'));
            return xmlList;
        });

        this.workspace.registerButtonCallback('CREATE_VARIABLE', (btn) => {
            const ws = btn.getTargetWorkspace();
            window.prompt(Blockly.Msg['BKY_NEW_VARIABLE_HINT'] || 'Names:', '', (input) => {
                if (input) input.split(/[，,]/).forEach(name => ws.createVariable(name.trim()));
            });
        });
    }

    triggerBlockStateUpdate() {
        if (this.stateUpdateTimer) clearTimeout(this.stateUpdateTimer);
        this.stateUpdateTimer = setTimeout(() => {
            Blockly.Events.disable();
            try {
                const topBlocks = this.workspace.getTopBlocks(false);
                const allowedTypes = ['py_main', 'mcu_main', 'py_definition_zone', 'py_function_def'];
                topBlocks.forEach(root => {
                    const isAllowed = allowedTypes.includes(root.type) || root.type.startsWith('procedures_def');
                    root.getDescendants(false).forEach(block => {
                        if (typeof block.setDisabledReason === 'function') block.setDisabledReason(!isAllowed, 'orphan');
                        else block.setEnabled(isAllowed);
                    });
                });
            } finally { Blockly.Events.enable(); }
        }, 150);
    }

    triggerCodeUpdate() {
        if (this.updateTimer) clearTimeout(this.updateTimer);
        this.updateTimer = setTimeout(() => {
            try {
                let code = Blockly.Python.workspaceToCode(this.workspace);
                // 清理工作 (維持原本邏輯)
                code = code.replace(/^[a-zA-Z_][a-zA-Z0-9_]* = None(  # ID:.*)?\n/mg, '');
                code = code.replace(/\u0001ID:.*?\u0002/g, '');
                this.lastCleanCode = code.trim();
                
                if (this.onCodeUpdate) {
                    this.onCodeUpdate(this.lastCleanCode, code);
                } else if (window.CocoyaUI) {
                    window.CocoyaUI.renderPythonPreview(code.trim());
                }
            } catch (e) { }
        }, 300);
    }

    setDirty(dirty) {
        if (this.isDirty === dirty) return;
        this.isDirty = dirty;
        if (this.onDirtyChange) {
            this.onDirtyChange(dirty);
        } else if (window.CocoyaUI) {
            window.CocoyaUI.setDirty(dirty);
        }
    }

    async setPlatform(platform) {
        this.currentPlatform = platform;
        if (Blockly.Python) Blockly.Python.PLATFORM = platform;
        
        if (this.manifest) {
            const finalXml = await this.buildToolboxXml(this.manifest, this.mediaUri, platform, this.currentLang);
            this.workspace.updateToolbox(finalXml);
            this.setupSearch();
        }
        if (window.CocoyaUI) window.CocoyaUI.updateRunTooltip(platform);
    }

    async buildToolboxXml(manifest, mediaUri, platform, lang) {
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
    }

    createDefaultBlocks() {
        if (this.minimap) this.minimap._isPaused = true;
        try {
            let offsetX = 100; 
            const toolboxDiv = document.querySelector('.blocklyToolboxDiv');
            if (toolboxDiv && toolboxDiv.offsetWidth > 0) {
                offsetX = toolboxDiv.offsetWidth + 20;
            }

            if (isNaN(offsetX) || offsetX < 20) offsetX = 100;
            if (offsetX > 350) offsetX = 100;

            this.workspace.clear();
            const defBlock = this.workspace.newBlock('py_definition_zone');
            defBlock.initSvg(); defBlock.render(); 
            defBlock.moveTo(new Blockly.utils.Coordinate(offsetX, 20));
            
            if (this.currentPlatform === 'CircuitPython') {
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
            }, 400); 
        } catch (e) { }
    }

    refreshMinimap() {
        if (this.minimap && this.minimap.minimapWorkspace) {
            try {
                const dom = Blockly.Xml.workspaceToDom(this.workspace);
                this.minimap.minimapWorkspace.clear();
                Blockly.Xml.domToWorkspace(dom, this.minimap.minimapWorkspace);
                setTimeout(() => { 
                    if (this.minimap && this.minimap.minimapWorkspace) { 
                        this.minimap.minimapWorkspace.zoomToFit(); 
                        Blockly.svgResize(this.minimap.minimapWorkspace); 
                    } 
                }, 50);
            } catch (e) { }
        }
    }

    setupBlocklyPrompts() {
        const self = this;
        Blockly.dialog.setPrompt((msg, def, cb) => {
            const id = Date.now() + Math.random();
            if (cb) self.promptRequests.set(id, cb);
            window.vsCodeApi.postMessage({ command: 'prompt', message: msg, defaultValue: def || '', requestId: id });
        });
        Blockly.dialog.setConfirm((msg, cb) => {
            const id = Date.now() + Math.random();
            if (cb) self.promptRequests.set(id, cb);
            window.vsCodeApi.postMessage({ command: 'confirm', message: msg, requestId: id });
        });
        Blockly.dialog.setAlert((msg, cb) => { 
            window.vsCodeApi.postMessage({ command: 'alert', message: msg }); 
            if (cb) cb(); 
        });
    }

    handlePromptResponse(message) {
        const cb = this.promptRequests.get(message.requestId);
        if (cb) {
            cb(message.result);
            this.promptRequests.delete(message.requestId);
            // 變數建立後可能需要刷新 Toolbox 選擇 (Blockly 內部邏輯)
        }
    }

    registerPlugins() {
        if (typeof Blockly === 'undefined') return;
        if (window.FieldMultilineInput) Blockly.fieldRegistry.register('field_multilinetext', window.FieldMultilineInput);
        if (window.FieldColour) Blockly.fieldRegistry.register('field_colour', window.FieldColour);
    }
}

/**
 * --- Cocoya Webview 主程式 (相容層) ---
 */
(function() {
    // 說明文件攔截器
    const originalOpen = window.open;
    window.open = function(url, name, specs) {
        if (url && !url.startsWith('http') && !url.startsWith('vscode-webview')) {
            const langSuffix = (window.CocoyaApp && window.CocoyaApp.engine.currentLang) ? `_${window.CocoyaApp.engine.currentLang}` : '_zh-hant';
            window.vsCodeApi.postMessage({ command: 'openHelp', helpId: `${url}${langSuffix}` });
            return null;
        }
        return originalOpen.apply(this, arguments);
    };

    let vscode;
    try { vscode = acquireVsCodeApi(); window.vsCodeApi = vscode; } catch (e) { vscode = window.vsCodeApi; }

    const CocoyaApp = {
        engine: null,
        
        init: function() {
            if (!window.CocoyaXMLRequests) window.CocoyaXMLRequests = new Map();
            this.setupWindowListeners();
            this.setupPlatformSelector();
            this.setupIndentSelector();
            vscode.postMessage({ command: 'getManifest' });
        },

        setupIndentSelector: function() {
            const selector = document.getElementById('indent-selector');
            if (!selector) return;
            selector.onchange = () => {
                if (Blockly.Python) {
                    Blockly.Python.INDENT = ' '.repeat(parseInt(selector.value, 10));
                    if (this.engine) this.engine.triggerCodeUpdate();
                }
            };
        },

        setupPlatformSelector: function() {
            const selector = document.getElementById('platform-selector');
            if (!selector) return;
            selector.onchange = async () => {
                const newPlatform = selector.value;
                if (this.engine && newPlatform === this.engine.currentPlatform) return;
                const confirmMsg = (Blockly.Msg['MSG_SWITCH_CONFIRM'] || 'Switch to %1 mode?').replace('%1', newPlatform);
                const xml = this.engine ? Blockly.Xml.domToPrettyText(Blockly.Xml.workspaceToDom(this.engine.workspace)) : '';
                vscode.postMessage({ command: 'confirmSwitch', message: confirmMsg, newPlatform: newPlatform, xml: xml });
                selector.value = this.engine ? this.engine.currentPlatform : 'PC';
            };
        },

        setupWindowListeners: function() {
            window.addEventListener('message', async (event) => {
                const message = event.data;
                switch (message.command) {
                    case 'manifestData': 
                        window.CocoyaMediaUri = message.mediaUri; // 恢復關鍵全域變數
                        this.engine = new CocoyaEngine({ 
                            containerId: 'blocklyDiv',
                            mediaUri: message.mediaUri,
                            lang: message.lang,
                            manifest: message.data
                        });
                        
                        await this.engine.init(message.data, message.mediaUri, message.lang);
                        
                        // 使用 Getter 代理，確保永遠抓到引擎最新的代碼
                        Object.defineProperty(window.CocoyaApp, 'lastCleanCode', {
                            get: () => this.engine ? this.engine.lastCleanCode : ''
                        });

                        window.CocoyaUI.mediaUri = message.mediaUri;
                        window.CocoyaUI.applyI18n();
                        window.CocoyaUI.initToolbar((msg) => vscode.postMessage(msg));
                        vscode.postMessage({ command: 'setLocale', messages: Blockly.Msg });
                        break;
                    case 'loadWorkspace': 
                        if (this.engine) {
                            if (message.platform && message.platform !== this.engine.currentPlatform) await this.engine.setPlatform(message.platform);
                            Blockly.Events.disable();
                            try {
                                this.engine.workspace.clear();
                                Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(message.xml), this.engine.workspace);
                            } finally { Blockly.Events.enable(); }
                            window.CocoyaUI.updateFileStatus(message.filename);
                            this.engine.setDirty(false);
                            this.engine.triggerCodeUpdate();
                        }
                        break;
                    case 'resetWorkspace': if (this.engine) { this.engine.workspace.clear(); this.engine.createDefaultBlocks(); window.CocoyaUI.updateFileStatus(''); this.engine.setDirty(false); this.engine.triggerCodeUpdate(); } break;
                    case 'saveCompleted': window.CocoyaUI.updateFileStatus(message.filename); if (this.engine) this.engine.setDirty(false); window.CocoyaUI.flashButton('btn-save', '#e3f2fd'); break;
                    case 'runCompleted': window.CocoyaUI.flashButton('btn-run', '#c8e6c9'); break;
                    case 'updateStatus': window.CocoyaUI.setUpdateStatus(message.data); break;
                    case 'serialPortsData': window.CocoyaUI.updateSerialPorts(message.ports); break;
                    case 'environmentStatus': window.CocoyaUI.updateEnvironmentStatus(message.results); break;
                    case 'switchPlatform': if (this.engine) await this.engine.setPlatform(message.platform); break;
                    case 'promptResponse': if (this.engine) this.engine.handlePromptResponse(message); break;
                    case 'toolboxData': 
                        const resolve = window.CocoyaXMLRequests.get(message.requestId);
                        if (resolve) {
                            resolve(message.data);
                            window.CocoyaXMLRequests.delete(message.requestId);
                        }
                        break;
                }
            });
        }
    };

    window.CocoyaApp = CocoyaApp;
    CocoyaApp.init();
})();
