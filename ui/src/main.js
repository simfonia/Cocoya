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

        /**
         * 啟動初始化
         */
        init: function() {
            if (!window.CocoyaXMLRequests) window.CocoyaXMLRequests = new Map();
            this.setupBlocklyPrompts();
            this.setupWindowListeners();
            this.setupPlatformSelector();
            this.setupIndentSelector();
            // 向後端請求模組清單
            window.CocoyaBridge.send('getManifest');
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
                    // 強制重設產生器狀態以套用新縮排
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
                
                // 彈出確認視窗
                const confirmMsg = (Blockly.Msg['MSG_SWITCH_CONFIRM'] || '確定要切換至 %1 模式嗎？這將會重置工作區。').replace('%1', newPlatform);
                window.CocoyaBridge.send('confirmSwitch', { 
                    message: confirmMsg, 
                    newPlatform: newPlatform, 
                    xml: Blockly.Xml.domToPrettyText(Blockly.Xml.workspaceToDom(this.workspace)) 
                });
                
                // 先還原選擇，等待後端確認後再由 switchPlatform 正式切換
                selector.value = this.currentPlatform;
            };
        },

        /**
         * 執行平台切換 (由後端確認後發起)
         */
        switchPlatform: async function(platform) {
            await this.setPlatformUI(platform);
            this.resetWorkspace();
        },

        /**
         * 更新平台相關 UI 與產生器狀態
         */
        setPlatformUI: async function(platform) {
            this.currentPlatform = platform;
            const selector = document.getElementById('platform-selector');
            if (selector) selector.value = platform;
            if (Blockly.Python) Blockly.Python.PLATFORM = platform;
            
            if (this.manifest) {
                const finalXml = await this.buildToolboxXml(this.manifest, window.CocoyaMediaUri, platform, this.currentLang);
                this.workspace.updateToolbox(finalXml);
                
                // 重建搜尋索引與 UI 注入
                setTimeout(() => {
                    CocoyaUtils.BlockSearcher.buildIndex(this.workspace);
                    CocoyaUtils.BlockSearcher.inject(this.workspace);
                }, 500);
            }
            if (window.CocoyaUI) window.CocoyaUI.updateRunTooltip(platform);
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
                    case 'loadWorkspace': await this.loadWorkspace(message.xml, message.filename, message.platform); break;
                    case 'resetWorkspace': this.resetWorkspace(); break;
                    case 'saveCompleted': this.onSaveCompleted(message.filename); break;
                    case 'runCompleted': if (window.CocoyaUI) window.CocoyaUI.flashButton('btn-run', '#c8e6c9'); break;
                    case 'updateStatus': if (window.CocoyaUI) window.CocoyaUI.setUpdateStatus(message.data); break;
                    case 'serialPortsData': if (window.CocoyaUI) window.CocoyaUI.updateSerialPorts(message.ports); break;
                    case 'environmentStatus': if (window.CocoyaUI) window.CocoyaUI.updateEnvironmentStatus(message.results); break;
                    case 'switchPlatform': await this.switchPlatform(message.platform); break;
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
            this.manifest = manifest;
            this.currentLang = lang || 'zh-hant';
            window.CocoyaMediaUri = mediaUri;
            if (window.CocoyaUI) window.CocoyaUI.mediaUri = mediaUri;

            try {
                // 1. 載入核心語系檔
                await CocoyaLoader.loadScript(`${mediaUri}/${this.currentLang}.js`);
                
                // 2. 註冊插件與自定義對話框
                this.registerPlugins();
                this.setupBlocklyPrompts();

                // 3. 準備 Toolbox
                const finalToolboxXML = await this.buildToolboxXml(manifest, mediaUri, this.currentPlatform, this.currentLang);

                // 4. 清理舊工作區 (防重啟崩潰)
                if (this.workspace) {
                    try { this.workspace.dispose(); } catch(e) {}
                }

                // 5. 注入 Blockly
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

                // 6. 初始化 Minimap
                this.initMinimap();

                // 7. 啟動搜尋引擎 (延遲確保 Toolbox DOM 已就緒)
                setTimeout(() => {
                    CocoyaUtils.BlockSearcher.buildIndex(this.workspace);
                    CocoyaUtils.BlockSearcher.inject(this.workspace);
                }, 1000);

                // 8. 設定產生器與監聽器
                if (Blockly.Python) Blockly.Python.PLATFORM = this.currentPlatform;
                if (window.CocoyaUI) window.CocoyaUI.applyI18n();
                if (window.CocoyaUI) window.CocoyaUI.initToolbar((msg) => window.CocoyaBridge.send(msg.command, msg));
                
                window.CocoyaBridge.send('setLocale', { messages: Blockly.Msg });
                
                this.registerVariablesCallback();
                CocoyaUtils.setupGeneratorOverrides();
                this.setupWorkspaceListeners();

                // 9. 建立預設積木
                if (this.workspace.getTopBlocks(false).length === 0) {
                    this.createDefaultBlocks();
                }
                
                this.triggerCodeUpdate();
            } catch (error) {
                console.error('[Cocoya] Initialization Failed:', error);
            }
        },

        /**
         * 註冊 Blockly 自定義欄位與插件
         */
        registerPlugins: function() {
            if (typeof Blockly === 'undefined') return;
            try {
                // Blockly v12+ 建議使用 registry.hasItem 檢查
                if (window.FieldMultilineInput) {
                    if (!Blockly.registry.hasItem(Blockly.registry.Type.FIELD, 'field_multilinetext')) {
                        Blockly.fieldRegistry.register('field_multilinetext', window.FieldMultilineInput); 
                    }
                }
                if (window.FieldColour) {
                    if (!Blockly.registry.hasItem(Blockly.registry.Type.FIELD, 'field_colour')) {
                        Blockly.fieldRegistry.register('field_colour', window.FieldColour); 
                    }
                }
            } catch (e) { console.warn('[Cocoya] Plugin registration warning:', e); }
        },

        /**
         * 初始化 Minimap
         */
        initMinimap: function() {
            try {
                const MinimapClass = (window.workspaceMinimap && window.workspaceMinimap.PositionedMinimap) || 
                                   (window.PositionedMinimap) || 
                                   (Blockly.workspaceMinimap && Blockly.workspaceMinimap.PositionedMinimap);
                if (!MinimapClass) return;

                // 封裝重繪邏輯以攔截異常 SVG 屬性 (NaN Shield)
                const originalUpdate = MinimapClass.prototype.update;
                MinimapClass.prototype.update = function() {
                    try {
                        if (!this.primaryWorkspace) return;
                        const pm = this.primaryWorkspace.getMetricsManager().getContentMetrics(true);
                        if (!pm || !pm.width || isNaN(pm.width)) return;
                        originalUpdate.apply(this, arguments);
                    } catch (e) { }
                };

                this.minimap = new MinimapClass(this.workspace);
                this.minimap.init();

                // 強化事件鏡像攔截
                const originalMirror = this.minimap.mirror.bind(this.minimap);
                this.minimap.mirror = (event) => {
                    if (this.minimap._isPaused) return;
                    try {
                        // 排除刪除事件，因為此時 getBlockById 為空
                        if (event.type !== Blockly.Events.BLOCK_DELETE && event.blockId && !this.workspace.getBlockById(event.blockId)) return;
                        originalMirror(event);
                    } catch (e) { }
                };

                this.setupMinimapToggle();
            } catch (e) { }
        },

        /**
         * 建立 Minimap 切換按鈕
         */
        setupMinimapToggle: function() {
            const mWrapper = document.querySelector('.blockly-minimap');
            if (!mWrapper) return;

            let toggleBtn = document.getElementById('minimap-toggle');
            if (!toggleBtn) {
                toggleBtn = document.createElement('div');
                toggleBtn.id = 'minimap-toggle';
                document.getElementById('blocklyArea').appendChild(toggleBtn);
            }
            
            const mediaUri = window.CocoyaMediaUri || '/src';
            const updateBtnUI = (collapsed) => {
                const iconUri = collapsed ? `${mediaUri}/icons/public_24dp_FE2F89.png` : `${mediaUri}/icons/cancel_24dp_FE2F89.png`;
                toggleBtn.style.background = 'white';
                toggleBtn.innerHTML = `<img src="${iconUri}" style="width: 18px; height: 18px; vertical-align: middle;">`;
            };

            updateBtnUI(mWrapper.classList.contains('collapsed'));

            toggleBtn.onclick = () => {
                const isCollapsed = mWrapper.classList.toggle('collapsed');
                updateBtnUI(isCollapsed);
                this.minimap._isPaused = isCollapsed;
                if (!isCollapsed) this.refreshMinimap();
            };
        },

        /**
         * 強制同步 Minimap 畫面
         */
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
         * 註冊變數分類回調
         */
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
                window.prompt(Blockly.Msg['BKY_NEW_VARIABLE_HINT'] || '請輸入變數名稱:', '', (input) => {
                    if (input) input.split(/[，,]/).forEach(name => ws.createVariable(name.trim()));
                });
            });
        },

        /**
         * 設定工作區變動監聽器
         */
        setupWorkspaceListeners: function() {
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

                // 處理髒狀態與孤兒檢查
                if (isBlockChange && !event.isUiEvent) { 
                    this.setDirty(true); 
                    this.triggerBlockStateUpdate(); 
                }
                
                // 處理選中同步
                if (event.type === Blockly.Events.SELECTED && window.CocoyaUI) {
                    window.CocoyaUI.syncSelection(event.newElementId);
                }

                // 處理程式碼即時預覽
                if (!event.isUiEvent || isBlockChange) {
                    this.triggerCodeUpdate();
                }
            });
        },

        /**
         * 執行孤兒積木檢查 (Orphan Block Check)
         */
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
                    // 手動通知 Minimap 刷新
                    if (this.minimap && !this.minimap._isPaused) this.refreshMinimap();
                }
            }, 150);
        },

        /**
         * 觸發程式碼產出與預覽渲染
         */
        triggerCodeUpdate: function() {
            if (this.updateTimer) clearTimeout(this.updateTimer);
            this.updateTimer = setTimeout(() => {
                try {
                    let code = Blockly.Python.workspaceToCode(this.workspace);
                    // 清理無效的變數初始化與隱形標記
                    code = code.replace(/^[a-zA-Z_][a-zA-Z0-9_]* = None(  # ID:.*)?\n/mg, '');
                    code = code.replace(/\u0001ID:.*?\u0002/g, '');
                    this.lastCleanCode = code.trim();
                    
                    if (window.CocoyaUI) window.CocoyaUI.renderPythonPreview(code.trim());
                } catch (e) { }
            }, 300);
        },

        /**
         * 設定髒狀態並通知後端
         */
        setDirty: function(dirty) { 
            this.isDirty = dirty; 
            if (window.CocoyaUI) window.CocoyaUI.setDirty(dirty); 
            window.CocoyaBridge.send('setDirty', { isDirty: dirty }); 
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
            const resolve = window.CocoyaXMLRequests.get(message.requestId); 
            if (resolve) { 
                resolve(message.data); 
                window.CocoyaXMLRequests.delete(message.requestId); 
            } 
        },

        /**
         * 載入工作區 XML 內容
         */
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
            
            if (window.CocoyaUI) window.CocoyaUI.updateFileStatus(filename); 
            this.setDirty(false); 
            this.triggerCodeUpdate();
            setTimeout(() => { if (this.minimap) { this.minimap._isPaused = false; this.refreshMinimap(); } }, 300);
        },

        /**
         * 重置工作區為預設狀態
         */
        resetWorkspace: function() { 
            if (this.workspace) {
                this.workspace.clear(); 
                this.createDefaultBlocks(); 
                if (window.CocoyaUI) window.CocoyaUI.updateFileStatus(''); 
                this.setDirty(false); 
                this.triggerCodeUpdate(); 
            }
        },

        /**
         * 儲存完成後的回調
         */
        onSaveCompleted: function(filename) { 
            if (filename && window.CocoyaUI) window.CocoyaUI.updateFileStatus(filename); 
            this.setDirty(false); 
            if (window.CocoyaUI) window.CocoyaUI.flashButton('btn-save', '#e3f2fd'); 
        },

        /**
         * 根據目前平台建立起始積木
         */
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
            } catch (e) { console.error('[Cocoya] Failed to create default blocks:', e); }
        }
    };

    // 全域暴露與初始化
    window.CocoyaApp = CocoyaApp;
    CocoyaApp.init();
})();
