/**
 * Cocoya Webview 主程式邏輯
 * 負責初始化 Blockly 工作區、處理通訊與協調 UI 更新
 */
(function() {
    // --- 說明文件系統攔截器 ---
    const originalOpen = window.open;
    window.open = function(url, name, specs) {
        if (url && !url.startsWith('http') && !url.startsWith('vscode-webview')) {
            const langSuffix = (window.CocoyaApp && window.CocoyaApp.currentLang) ? `_${window.CocoyaApp.currentLang}` : '_zh-hant';
            const helpId = `${url}${langSuffix}`;
            window.CocoyaBridge.send('openHelp', { helpId: helpId });
            return null;
        }
        return originalOpen.apply(this, arguments);
    };

    const CocoyaApp = {
        workspace: null,
        minimap: null,
        isDirty: false,
        updateTimer: null,
        promptRequests: new Map(),
        currentPlatform: 'PC',
        manifest: null,
        lastCleanCode: '',
        currentLang: 'zh-hant',

        init: function() {
            if (!window.CocoyaXMLRequests) window.CocoyaXMLRequests = new Map();
            CocoyaApp.setupBlocklyPrompts();
            CocoyaApp.setupWindowListeners();
            CocoyaApp.setupPlatformSelector();
            CocoyaApp.setupIndentSelector();
            window.CocoyaBridge.send('getManifest');
        },

        setupIndentSelector: function() {
            const selector = document.getElementById('indent-selector');
            if (!selector) return;
            selector.onchange = () => {
                if (Blockly.Python) {
                    const indentSize = parseInt(selector.value, 10);
                    // 核心: 修改屬性
                    Blockly.Python.INDENT = ' '.repeat(indentSize);
                    // 強制清除產生器內部的快取 (部分版本 Blockly 需要)
                    if (Blockly.Python.init) Blockly.Python.init(this.workspace);
                    this.triggerCodeUpdate();
                }
            };
            if (Blockly.Python) Blockly.Python.INDENT = '    ';
        },

        setupPlatformSelector: function() {
            const selector = document.getElementById('platform-selector');
            if (!selector) return;
            selector.onchange = async () => {
                const newPlatform = selector.value;
                if (newPlatform === this.currentPlatform) return;
                const confirmMsg = (Blockly.Msg['MSG_SWITCH_CONFIRM'] || 'Switch to %1 mode?').replace('%1', newPlatform);
                window.CocoyaBridge.send('confirmSwitch', { 
                    message: confirmMsg, 
                    newPlatform: newPlatform, 
                    xml: Blockly.Xml.domToPrettyText(Blockly.Xml.workspaceToDom(this.workspace)) 
                });
                selector.value = this.currentPlatform;
            };
        },

        switchPlatform: async function(platform) {
            await this.setPlatformUI(platform);
            this.resetWorkspace();
        },

        setPlatformUI: async function(platform) {
            this.currentPlatform = platform;
            const selector = document.getElementById('platform-selector');
            if (selector) selector.value = platform;
            if (Blockly.Python) Blockly.Python.PLATFORM = platform;
            
            if (this.manifest) {
                const finalXml = await this.buildToolboxXml(this.manifest, window.CocoyaMediaUri, platform, this.currentLang);
                this.workspace.updateToolbox(finalXml);
                
                setTimeout(() => {
                    CocoyaUtils.BlockSearcher.buildIndex(this.workspace);
                    CocoyaUtils.BlockSearcher.inject(this.workspace);
                }, 500);
            }
            window.CocoyaUI.updateRunTooltip(platform);
        },

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

        setupWindowListeners: function() {
            window.CocoyaBridge.onMessage(async (message) => {
                switch (message.command) {
                    case 'manifestData': await this.initializeCocoya(message.data, message.mediaUri, message.lang); break;
                    case 'loadWorkspace': await this.loadWorkspace(message.xml, message.filename, message.platform); break;
                    case 'resetWorkspace': this.resetWorkspace(); break;
                    case 'saveCompleted': this.onSaveCompleted(message.filename); break;
                    case 'runCompleted': window.CocoyaUI.flashButton('btn-run', '#c8e6c9'); break;
                    case 'updateStatus': window.CocoyaUI.setUpdateStatus(message.data); break;
                    case 'serialPortsData': window.CocoyaUI.updateSerialPorts(message.ports); break;
                    case 'environmentStatus': window.CocoyaUI.updateEnvironmentStatus(message.results); break;
                    case 'switchPlatform': await this.switchPlatform(message.platform); break;
                    case 'promptResponse': this.handlePromptResponse(message); break;
                    case 'toolboxData': this.handleToolboxData(message); break;
                }
            });

            window.addEventListener('resize', () => {
                if (this.workspace) Blockly.svgResize(this.workspace);
            });
        },

        initializeCocoya: async function(manifest, mediaUri, lang) {
            this.manifest = manifest;
            this.currentLang = lang || 'zh-hant';
            window.CocoyaMediaUri = mediaUri;
            window.CocoyaUI.mediaUri = mediaUri;

            try {
                await CocoyaLoader.loadScript(`${mediaUri}/${this.currentLang}.js`);
                this.registerPlugins();
                this.setupBlocklyPrompts();

                const finalToolboxXML = await this.buildToolboxXml(manifest, mediaUri, this.currentPlatform, this.currentLang);

                const scrollDragger = window.ScrollBlockDragger || (window.ScrollOptions ? window.ScrollOptions.BlockDragger : undefined);
                const scrollMetrics = window.ScrollMetricsManager || (window.ScrollOptions ? window.ScrollOptions.MetricsManager : undefined);

                this.workspace = Blockly.inject('blocklyDiv', {
                    toolbox: finalToolboxXML,
                    grid: { spacing: 20, length: 3, colour: '#ccc', snap: true },
                    trashcan: true, sounds: false, scrollbars: true,
                    move: { scrollbars: true, drag: true, wheel: true },
                    zoom: { controls: true, wheel: false, startScale: 1.0, maxScale: 3, minScale: 0.3, scaleSpeed: 1.2 },
                    plugins: { 'blockDragger': scrollDragger, 'metricsManager': scrollMetrics }
                });

                this.initMinimap();

                setTimeout(() => {
                    CocoyaUtils.BlockSearcher.buildIndex(this.workspace);
                    CocoyaUtils.BlockSearcher.inject(this.workspace);
                }, 1000);

                if (Blockly.Python) Blockly.Python.PLATFORM = this.currentPlatform;
                window.CocoyaUI.applyI18n();
                window.CocoyaUI.initToolbar((msg) => window.CocoyaBridge.send(msg.command, msg));
                window.CocoyaBridge.send('setLocale', { messages: Blockly.Msg });
                this.registerVariablesCallback();
                CocoyaUtils.setupGeneratorOverrides();
                this.setupWorkspaceListeners();
                if (this.workspace.getTopBlocks(false).length === 0) this.createDefaultBlocks();
                this.triggerCodeUpdate();
            } catch (error) { console.error('Initialization Failed:', error); }
        },

        registerPlugins: function() {
            if (typeof Blockly === 'undefined') return;
            try {
                if (window.FieldMultilineInput) {
                    try { Blockly.fieldRegistry.unregister('field_multilinetext'); } catch(e){}
                    Blockly.fieldRegistry.register('field_multilinetext', window.FieldMultilineInput);
                }
                if (window.FieldColour) {
                    try { Blockly.fieldRegistry.unregister('field_colour'); } catch(e){}
                    Blockly.fieldRegistry.register('field_colour', window.FieldColour);
                }
            } catch (e) { console.warn('Plugin registration warning:', e); }
        },

        initMinimap: function() {
            try {
                const MinimapClass = (window.workspaceMinimap && window.workspaceMinimap.PositionedMinimap) || 
                                   (window.PositionedMinimap) || 
                                   (Blockly.workspaceMinimap && Blockly.workspaceMinimap.PositionedMinimap);
                if (!MinimapClass) return;

                const originalUpdate = MinimapClass.prototype.update;
                MinimapClass.prototype.update = function() {
                    try {
                        if (!this.primaryWorkspace) return;
                        const pm = this.primaryWorkspace.getMetricsManager().getContentMetrics(true);
                        if (!pm || !pm.width || isNaN(pm.width)) return;
                        if (this.minimapWorkspace) {
                            const mm = this.minimapWorkspace.getMetricsManager().getContentMetrics(true);
                            if (!mm || !mm.width || isNaN(mm.width)) return;
                        }
                        originalUpdate.apply(this, arguments);
                    } catch (e) { }
                };

                this.minimap = new MinimapClass(this.workspace);
                this.minimap.init();

                const originalMirror = this.minimap.mirror.bind(this.minimap);
                this.minimap.mirror = (event) => {
                    if (this.minimap._isPaused) return;
                    try {
                        // 修正：刪除事件時 getBlockById 本來就會是 null，不應攔截
                        if (event.type !== Blockly.Events.BLOCK_DELETE && event.blockId && !this.workspace.getBlockById(event.blockId)) return;
                        originalMirror(event);
                    } catch (e) { }
                };

                // --- Minimap 切換按鈕實作 ---
                const mWrapper = document.querySelector('.blockly-minimap');
                if (mWrapper) {
                    const toggleBtn = document.createElement('div');
                    toggleBtn.id = 'minimap-toggle';
                    toggleBtn.innerHTML = '&#10005;'; // 預設 X
                    document.getElementById('blocklyArea').appendChild(toggleBtn);
                    
                    const mediaUri = window.CocoyaMediaUri || '/src';
                    const updateBtnUI = (collapsed) => {
                        if (collapsed) {
                            const iconUri = `${mediaUri}/icons/public_24dp_FE2F89.png`;
                            toggleBtn.style.background = 'white';
                            toggleBtn.innerHTML = `<img src="${iconUri}" style="width: 18px; height: 18px; vertical-align: middle;">`;
                        } else {
                            const iconUri = `${mediaUri}/icons/cancel_24dp_FE2F89.png`;
                            toggleBtn.style.background = 'white';
                            toggleBtn.innerHTML = `<img src="${iconUri}" style="width: 18px; height: 18px; vertical-align: middle;">`;
                        }
                    };

                    updateBtnUI(false); // 初始狀態

                    toggleBtn.onclick = () => {
                        const isCollapsed = mWrapper.classList.toggle('collapsed');
                        updateBtnUI(isCollapsed);
                        this.minimap._isPaused = isCollapsed;
                        if (!isCollapsed) this.refreshMinimap();
                    };
                }
            } catch (e) { }
        },

        refreshMinimap: function() {
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
        },

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

        registerVariablesCallback: function() {
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
        },

        setupWorkspaceListeners: function() {
            this.workspace.addChangeListener((event) => {
                const isBlockChange = [Blockly.Events.BLOCK_MOVE, Blockly.Events.BLOCK_CREATE, Blockly.Events.BLOCK_CHANGE, Blockly.Events.BLOCK_DELETE, Blockly.Events.VAR_CREATE, Blockly.Events.VAR_RENAME, Blockly.Events.VAR_DELETE].includes(event.type);
                if (isBlockChange && !event.isUiEvent) { this.setDirty(true); this.triggerBlockStateUpdate(); }
                if (event.type === Blockly.Events.SELECTED) window.CocoyaUI.syncSelection(event.newElementId);
                if (!event.isUiEvent || isBlockChange) this.triggerCodeUpdate();
            });
        },

        triggerBlockStateUpdate: function() {
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
                } finally { 
                    Blockly.Events.enable(); 
                    // 修正：由於是在 Events.disable 下修改狀態，必須手動通知 Minimap 刷新
                    if (this.minimap && !this.minimap._isPaused) this.refreshMinimap();
                }
            }, 150);
        },

        triggerCodeUpdate: function() {
            if (this.updateTimer) clearTimeout(this.updateTimer);
            this.updateTimer = setTimeout(() => {
                try {
                    let code = Blockly.Python.workspaceToCode(this.workspace);
                    code = code.replace(/^[a-zA-Z_][a-zA-Z0-9_]* = None(  # ID:.*)?\n/mg, '');
                    code = code.replace(/\u0001ID:.*?\u0002/g, '');
                    window.CocoyaApp.lastCleanCode = code.trim();
                    window.CocoyaUI.renderPythonPreview(code.trim());
                } catch (e) { }
            }, 300);
        },

        setDirty: function(dirty) { 
            this.isDirty = dirty; 
            window.CocoyaUI.setDirty(dirty); 
            window.CocoyaBridge.send('setDirty', { isDirty: dirty }); 
        },

        handlePromptResponse: function(message) { 
            const cb = this.promptRequests.get(message.requestId); 
            if (cb) { 
                cb(message.result); 
                this.promptRequests.delete(message.requestId); 
            } 
        },

        handleToolboxData: function(message) { 
            const resolve = window.CocoyaXMLRequests.get(message.requestId); 
            if (resolve) { 
                resolve(message.data); 
                window.CocoyaXMLRequests.delete(message.requestId); 
            } 
        },

        loadWorkspace: async function(xml, filename, platform) {
            if (this.minimap) this.minimap._isPaused = true;
            if (platform && platform !== this.currentPlatform) await this.setPlatformUI(platform);
            Blockly.Events.disable();
            try { 
                this.workspace.clear(); 
                Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(xml), this.workspace); 
            } finally { 
                Blockly.Events.enable(); 
            }
            window.CocoyaUI.updateFileStatus(filename); 
            this.setDirty(false); 
            this.triggerCodeUpdate();
            setTimeout(() => { if (this.minimap) { this.minimap._isPaused = false; this.refreshMinimap(); } }, 300);
        },

        resetWorkspace: function() { 
            this.workspace.clear(); 
            this.createDefaultBlocks(); 
            window.CocoyaUI.updateFileStatus(''); 
            this.setDirty(false); 
            this.triggerCodeUpdate(); 
        },

        onSaveCompleted: function(filename) { 
            if (filename) window.CocoyaUI.updateFileStatus(filename); 
            this.isDirty = false; 
            window.CocoyaUI.setDirty(false);
            window.CocoyaUI.flashButton('btn-save', '#e3f2fd'); 
        },

        createDefaultBlocks: function() {
            if (this.minimap) this.minimap._isPaused = true;
            try {
                let offsetX = 100; 
                const toolboxDiv = document.querySelector('.blocklyToolboxDiv');
                if (toolboxDiv && toolboxDiv.offsetWidth > 0) offsetX = toolboxDiv.offsetWidth + 20;
                if (isNaN(offsetX) || offsetX < 20 || offsetX > 350) offsetX = 100;

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
            } catch (e) { console.error('Failed to create default blocks:', e); }
        }
    };

    window.CocoyaApp = CocoyaApp;
    CocoyaApp.init();
})();
