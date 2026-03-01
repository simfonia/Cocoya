/**
 * Cocoya Webview 主程式邏輯
 * 負責初始化 Blockly 工作區、處理通訊與協調 UI 更新
 */
(function() {
    // --- 全局屬性安全攔截器 (徹底解決 NaN 報錯) ---
    const originalSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
        if (typeof value === 'string' && (value.includes('NaN') || value.includes('Infinity'))) {
            // console.warn(`Blocked invalid attribute: ${name}="${value}"`);
            return;
        }
        if (typeof value === 'number' && isNaN(value)) return;
        return originalSetAttribute.apply(this, arguments);
    };

    let vscode;
    try {
        vscode = acquireVsCodeApi();
        window.vsCodeApi = vscode;
    } catch (e) {
        vscode = window.vsCodeApi;
    }

    const CocoyaApp = {
        workspace: null,
        minimap: null,
        isDirty: false,
        updateTimer: null,
        promptRequests: new Map(),
        currentPlatform: 'PC',
        manifest: null,
        lastCleanCode: '',

        init: function() {
            if (!window.CocoyaXMLRequests) window.CocoyaXMLRequests = new Map();
            this.registerPlugins();
            this.setupBlocklyPrompts();
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
                vscode.postMessage({ command: 'confirmSwitch', message: confirmMsg, newPlatform: newPlatform, xml: Blockly.Xml.domToPrettyText(Blockly.Xml.workspaceToDom(this.workspace)) });
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
                const toolboxes = await CocoyaLoader.loadModules(this.manifest, window.CocoyaMediaUri, platform, this.currentLang);
                const coreXml = [];
                const aiXml = [];
                const otherXml = [];

                toolboxes.forEach(mod => {
                    const filteredXml = this.filterToolboxXML(mod.xml);
                    if (mod.id.startsWith('core/')) coreXml.push(filteredXml);
                    else if (mod.id.startsWith('cv_') || mod.id.startsWith('ai_')) aiXml.push(filteredXml);
                    else otherXml.push(filteredXml);
                });

                let finalXml = `<xml>${coreXml.join('')}<sep></sep>`;
                if (aiXml.length > 0) {
                    finalXml += `<category name="%{BKY_CAT_AI}" colour="%{BKY_COLOUR_AI}">${aiXml.join('')}</category>`;
                }
                finalXml += `${otherXml.join('')}</xml>`;

                this.workspace.updateToolbox(finalXml);
                // 平台切換後重新建立搜尋索引
                setTimeout(() => {
                    CocoyaUtils.BlockSearcher.buildIndex(this.workspace);
                    this.injectSearchBox();
                }, 500);
            }
            window.CocoyaUI.updateRunTooltip(platform);
        },

        setupWindowListeners: function() {
            window.addEventListener('message', async (event) => {
                const message = event.data;
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
        },

        filterToolboxXML: function(xmlString) {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "text/xml");
            xmlDoc.querySelectorAll('block').forEach(block => {
                const p = block.getAttribute('platform');
                if (p && p !== this.currentPlatform) block.parentNode.removeChild(block);
            });
            return new XMLSerializer().serializeToString(xmlDoc);
        },

        initializeCocoya: async function(manifest, mediaUri, lang) {
            this.manifest = manifest;
            this.currentLang = lang || 'en';
            window.CocoyaMediaUri = mediaUri;
            window.CocoyaUI.mediaUri = mediaUri;

            try {
                await CocoyaLoader.loadScript(`${mediaUri}/${this.currentLang}.js`);
                this.registerPlugins();
                this.setupBlocklyPrompts();

                const toolboxes = await CocoyaLoader.loadModules(manifest, mediaUri, this.currentPlatform, this.currentLang);
                
                const coreXml = [];
                const aiXml = [];
                const otherXml = [];

                toolboxes.forEach(mod => {
                    const filteredXml = this.filterToolboxXML(mod.xml);
                    if (mod.id.startsWith('core/')) coreXml.push(filteredXml);
                    else if (mod.id.startsWith('cv_') || mod.id.startsWith('ai_')) aiXml.push(filteredXml);
                    else otherXml.push(filteredXml);
                });

                let finalToolboxXML = `<xml>${coreXml.join('')}<sep></sep>`;
                if (aiXml.length > 0) {
                    finalToolboxXML += `<category name="%{BKY_CAT_AI}" colour="%{BKY_COLOUR_AI}">${aiXml.join('')}</category>`;
                }
                finalToolboxXML += `${otherXml.join('')}</xml>`;

                let scrollDragger = window.ScrollBlockDragger || (window.ScrollOptions ? window.ScrollOptions.BlockDragger : undefined);
                let scrollMetrics = window.ScrollMetricsManager || (window.ScrollOptions ? window.ScrollOptions.MetricsManager : undefined);

                this.workspace = Blockly.inject('blocklyDiv', {
                    toolbox: finalToolboxXML,
                    grid: { spacing: 20, length: 3, colour: '#ccc', snap: true },
                    trashcan: true, sounds: false, scrollbars: true,
                    move: { scrollbars: true, drag: true, wheel: true },
                    zoom: { controls: true, wheel: false, startScale: 1.0, maxScale: 3, minScale: 0.3, scaleSpeed: 1.2 },
                    plugins: { 'blockDragger': scrollDragger, 'metricsManager': scrollMetrics }
                });

                // --- Minimap 初始化 (全方位防護) ---
                try {
                    const MinimapClass = (window.workspaceMinimap && window.workspaceMinimap.PositionedMinimap) || (window.PositionedMinimap) || (Blockly.workspaceMinimap && Blockly.workspaceMinimap.PositionedMinimap);
                    if (MinimapClass) {
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
                                if (event.type === Blockly.Events.BLOCK_CREATE && !this.workspace.getBlockById(event.blockId)) return;
                                originalMirror(event);
                            } catch (e) { }
                        };
                        const mWrapper = document.querySelector('.blockly-minimap');
                        if (mWrapper) {
                            const toggleBtn = document.createElement('div');
                            toggleBtn.id = 'minimap-toggle';
                            toggleBtn.innerHTML = '&#10005;';
                            document.getElementById('blocklyArea').appendChild(toggleBtn);
                            toggleBtn.onclick = () => {
                                const isCollapsed = mWrapper.classList.toggle('collapsed');
                                toggleBtn.innerHTML = isCollapsed ? '&#128506;' : '&#10005;';
                                this.minimap._isPaused = isCollapsed;
                                if (!isCollapsed) this.refreshMinimap();
                            };
                        }
                    }
                } catch (e) { }

                // --- 搜尋功能 ---
                setTimeout(() => {
                    CocoyaUtils.BlockSearcher.buildIndex(this.workspace);
                    this.injectSearchBox();
                }, 1000);

                if (Blockly.Python) Blockly.Python.PLATFORM = this.currentPlatform;
                window.CocoyaUI.applyI18n();
                window.CocoyaUI.initToolbar((msg) => vscode.postMessage(msg));
                vscode.postMessage({ command: 'setLocale', messages: Blockly.Msg });
                this.registerVariablesCallback();
                this.setupGeneratorOverrides();
                this.setupWorkspaceListeners();
                if (this.workspace.getTopBlocks(false).length === 0) this.createDefaultBlocks();
                this.triggerCodeUpdate();
            } catch (error) { console.error('Initialization Failed:', error); }
        },

        injectSearchBox: function() {
            const tryInject = () => {
                // 嘗試多種可能的 Toolbox 容器選擇器
                const toolboxDiv = document.querySelector('.blocklyToolboxDiv') || 
                                 document.querySelector('.blocklyTreeRoot') ||
                                 document.querySelector('[role="tree"]');
                
                if (!toolboxDiv) return false;
                if (document.getElementById('block-search-container')) return true;

                console.log('Found toolbox container, injecting search box...');
                
                const container = document.createElement('div');
                container.id = 'block-search-container';
                container.innerHTML = `<input type="text" id="block-search" placeholder="${Blockly.Msg['BKY_CAT_SEARCH'] || '搜尋積木...'}" autocomplete="off">`;
                
                // 確保搜尋框被插入到 Toolbox 最頂部
                if (toolboxDiv.firstChild) {
                    toolboxDiv.insertBefore(container, toolboxDiv.firstChild);
                } else {
                    toolboxDiv.appendChild(container);
                }

                const searchInput = document.getElementById('block-search');
                searchInput.addEventListener('input', (e) => {
                    const query = e.target.value.toLowerCase().trim();
                    if (!query) { this.workspace.getFlyout().hide(); return; }
                    const results = CocoyaUtils.BlockSearcher.search(query);
                    if (results.length > 0) this.workspace.getFlyout().show(results.slice(0, 30));
                    else this.workspace.getFlyout().hide();
                });
                return true;
            };

            // 執行多重時機點嘗試
            if (!tryInject()) {
                const observer = new MutationObserver((mutations, obs) => {
                    if (tryInject()) obs.disconnect();
                });
                observer.observe(document.body, { childList: true, subtree: true });
                
                let retry = 0;
                const timer = setInterval(() => {
                    if (tryInject() || retry++ > 20) clearInterval(timer);
                }, 500);
            }
        },

        registerPlugins: function() {
            if (typeof Blockly === 'undefined') return;
            if (window.FieldMultilineInput) Blockly.fieldRegistry.register('field_multilinetext', window.FieldMultilineInput);
            if (window.FieldColour) Blockly.fieldRegistry.register('field_colour', window.FieldColour);
        },

        setupBlocklyPrompts: function() {
            const self = this;
            Blockly.dialog.setPrompt((msg, def, cb) => {
                const id = Date.now() + Math.random();
                if (cb) self.promptRequests.set(id, cb);
                vscode.postMessage({ command: 'prompt', message: msg, defaultValue: def || '', requestId: id });
            });
            Blockly.dialog.setConfirm((msg, cb) => {
                const id = Date.now() + Math.random();
                if (cb) self.promptRequests.set(id, cb);
                vscode.postMessage({ command: 'confirm', message: msg, requestId: id });
            });
            Blockly.dialog.setAlert((msg, cb) => { vscode.postMessage({ command: 'alert', message: msg }); if (cb) cb(); });
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

        refreshMinimap: function() {
            if (this.minimap && this.minimap.minimapWorkspace) {
                try {
                    const dom = Blockly.Xml.workspaceToDom(this.workspace);
                    this.minimap.minimapWorkspace.clear();
                    Blockly.Xml.domToWorkspace(dom, this.minimap.minimapWorkspace);
                    setTimeout(() => { if (this.minimap && this.minimap.minimapWorkspace) { this.minimap.minimapWorkspace.zoomToFit(); Blockly.svgResize(this.minimap.minimapWorkspace); } }, 50);
                } catch (e) { }
            }
        },

        createDefaultBlocks: function() {
            if (this.minimap) this.minimap._isPaused = true;
            try {
                const defBlock = this.workspace.newBlock('py_definition_zone');
                defBlock.initSvg(); defBlock.render(); defBlock.moveBy(20, 20);
                if (this.currentPlatform === 'CircuitPython') {
                    const mcuMain = this.workspace.newBlock('mcu_main');
                    mcuMain.initSvg(); mcuMain.render(); mcuMain.moveBy(20, 200);
                    const loopBlock = this.workspace.newBlock('py_loop_while');
                    loopBlock.initSvg(); loopBlock.render();
                    const trueBlock = this.workspace.newBlock('py_logic_boolean');
                    trueBlock.setFieldValue('True', 'BOOL');
                    trueBlock.initSvg(); trueBlock.render();
                    loopBlock.getInput('CONDITION').connection.connect(trueBlock.outputConnection);
                    mcuMain.getInput('DO').connection.connect(loopBlock.previousConnection);
                } else {
                    const mainBlock = this.workspace.newBlock('py_main');
                    mainBlock.initSvg(); mainBlock.render(); mainBlock.moveBy(20, 140);
                }
                setTimeout(() => { if (this.minimap) { this.minimap._isPaused = false; this.refreshMinimap(); } this.workspace.clearUndo(); }, 400); 
            } catch (e) { }
        },

        setupGeneratorOverrides: function() {
            Blockly.Python.scrub_ = function(block, code, opt_thisOnly) {
                const nextBlock = (block.nextConnection && !opt_thisOnly) ? block.nextConnection.targetBlock() : null;
                if (!block.isEnabled()) return nextBlock ? Blockly.Python.blockToCode(nextBlock) : '';
                const s = window.CocoyaUtils.TAG_START;
                const e = window.CocoyaUtils.TAG_END;
                if (block.outputConnection) return `${s}ID:${block.id}${e}${code}`;
                const nextCode = nextBlock ? Blockly.Python.blockToCode(nextBlock) : '';
                let lines = code.split('\n');
                if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
                if (lines.length > 0) { lines[0] += `  # S_ID:${block.id}`; lines[lines.length - 1] += `  # E_ID:${block.id}`; }
                return lines.join('\n') + '\n' + nextCode;
            };
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
                } finally { Blockly.Events.enable(); }
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

        setDirty: function(dirty) { this.isDirty = dirty; window.CocoyaUI.setDirty(dirty); vscode.postMessage({ command: 'setDirty', isDirty: dirty }); },
        handleToolboxData: function(message) { const resolve = window.CocoyaXMLRequests.get(message.requestId); if (resolve) { resolve(message.data); window.CocoyaXMLRequests.delete(message.requestId); } },
        handlePromptResponse: function(message) { const cb = this.promptRequests.get(message.requestId); if (cb) { cb(message.result); this.promptRequests.delete(message.requestId); this.refreshToolboxSelection(); } },
        refreshToolboxSelection: function() { if (this.workspace && this.workspace.getToolbox()) { const toolbox = this.workspace.getToolbox(); const selected = toolbox.getSelectedItem(); if (selected && selected.getContents() === 'VARIABLE') toolbox.setSelectedItem(selected); } },

        loadWorkspace: async function(xml, filename, platform) {
            if (this.minimap) this.minimap._isPaused = true;
            if (platform && platform !== this.currentPlatform) await this.setPlatformUI(platform);
            Blockly.Events.disable();
            try { this.workspace.clear(); Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(xml), this.workspace); } finally { Blockly.Events.enable(); }
            window.CocoyaUI.updateFileStatus(filename); this.setDirty(false); this.triggerCodeUpdate();
            setTimeout(() => { if (this.minimap) { this.minimap._isPaused = false; this.refreshMinimap(); } }, 300);
        },

        resetWorkspace: function() { this.workspace.clear(); this.createDefaultBlocks(); window.CocoyaUI.updateFileStatus(''); this.setDirty(false); this.triggerCodeUpdate(); },
        onSaveCompleted: function(filename) { if (filename) window.CocoyaUI.updateFileStatus(filename); this.setDirty(false); window.CocoyaUI.flashButton('btn-save', '#e3f2fd'); }
    };

    window.CocoyaApp = CocoyaApp;
    CocoyaApp.init();
})();
