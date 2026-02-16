/**
 * Cocoya Webview 主程式邏輯
 * 負責初始化 Blockly 工作區、處理通訊與協調 UI 更新
 */
(function() {
    let vscode;
    try {
        vscode = acquireVsCodeApi();
        window.vsCodeApi = vscode;
    } catch (e) {
        vscode = window.vsCodeApi;
    }

    /**
     * Cocoya 主應用程式類別
     */
    const CocoyaApp = {
        workspace: null,
        isDirty: false,
        updateTimer: null,
        promptRequests: new Map(),
        currentPlatform: 'PC',
        manifest: null,
        lastCleanCode: '',

        /**
         * 啟動應用程式
         */
        init: function() {
            // 初始化請求 Map (確保 module_loader 能共用)
            if (!window.CocoyaXMLRequests) window.CocoyaXMLRequests = new Map();

            this.setupWindowListeners();
            this.setupPlatformSelector();
            this.setupIndentSelector();
            // 請求初始清單
            vscode.postMessage({ command: 'getManifest' });
        },

        /**
         * 設定縮排空格數監聽
         */
        setupIndentSelector: function() {
            const selector = document.getElementById('indent-selector');
            if (!selector) return;

            const updateIndent = () => {
                const size = parseInt(selector.value, 10);
                if (typeof Blockly !== 'undefined' && Blockly.Python) {
                    Blockly.Python.INDENT = ' '.repeat(size);
                    this.triggerCodeUpdate();
                }
            };

            selector.onchange = updateIndent;
            // 初始設定 (預設為 4)
            if (typeof Blockly !== 'undefined' && Blockly.Python) {
                Blockly.Python.INDENT = '    ';
            }
        },

        /**
         * 設定平台切換監聽
         */
        setupPlatformSelector: function() {
            const selector = document.getElementById('platform-selector');
            if (!selector) return;
            
            selector.onchange = async () => {
                const newPlatform = selector.value;
                if (newPlatform === this.currentPlatform) return;

                // 詢問確認 (傳送目前 XML 供儲存，並記下舊平台以便取消時回復)
                const confirmMsg = (Blockly.Msg['MSG_SWITCH_CONFIRM'] || 'Switch to %1 mode?').replace('%1', newPlatform);
                vscode.postMessage({ 
                    command: 'confirmSwitch', 
                    message: confirmMsg,
                    newPlatform: newPlatform,
                    xml: Blockly.Xml.domToPrettyText(Blockly.Xml.workspaceToDom(this.workspace))
                });

                // 暫時將 DOM 選單恢復原值，直到 Host 確認切換
                selector.value = this.currentPlatform;
            };
        },

        /**
         * 真正執行切換邏輯 (由 Host 確認後觸發)
         */
        switchPlatform: async function(platform) {
            await this.setPlatformUI(platform);
            // 切換模式時重置工作區
            this.resetWorkspace();
        },

        /**
         * 僅更新 UI 與 Toolbox (不重置工作區)
         */
        setPlatformUI: async function(platform) {
            this.currentPlatform = platform;
            const selector = document.getElementById('platform-selector');
            if (selector) selector.value = platform;

            // 1. 重載 Toolbox
            if (this.manifest) {
                const toolboxes = await CocoyaLoader.loadModules(this.manifest, window.CocoyaMediaUri, platform, this.currentLang);
                
                const coreXml = [];
                const aiXml = [];
                const otherXml = [];

                toolboxes.forEach(mod => {
                    if (mod.id.startsWith('core/')) {
                        coreXml.push(mod.xml);
                    } else if (mod.id.startsWith('cv_') || mod.id.startsWith('ai_')) {
                        aiXml.push(mod.xml);
                    } else {
                        otherXml.push(mod.xml);
                    }
                });

                let finalXml = `<xml>${coreXml.join('')}`;
                if (aiXml.length > 0) {
                    finalXml += `<category name="%{BKY_CAT_AI}" colour="%{BKY_COLOUR_AI}">${aiXml.join('')}</category>`;
                }
                finalXml += `${otherXml.join('')}</xml>`;

                this.workspace.updateToolbox(finalXml);
            }

            // 2. 更新按鈕提示
            window.CocoyaUI.updateRunTooltip(platform);
        },

        /**
         * 設定全域視窗監聽器 (處理來自 Host 的訊息)
         */
        setupWindowListeners: function() {
            window.addEventListener('message', async (event) => {
                const message = event.data;
                switch (message.command) {
                    case 'manifestData':
                        await this.initializeCocoya(message.data, message.mediaUri, message.lang);
                        break;
                    case 'toolboxData':
                        this.handleToolboxData(message);
                        break;
                    case 'promptResponse':
                        this.handlePromptResponse(message);
                        break;
                    case 'loadWorkspace':
                        await this.loadWorkspace(message.xml, message.filename, message.platform);
                        break;
                    case 'resetWorkspace':
                        this.resetWorkspace();
                        break;
                    case 'saveCompleted':
                        this.onSaveCompleted(message.filename);
                        break;
                    case 'runCompleted':
                        window.CocoyaUI.flashButton('btn-run', '#c8e6c9');
                        break;
                    case 'updateStatus':
                        window.CocoyaUI.setUpdateStatus(message.data);
                        break;
                    case 'serialPortsData':
                        window.CocoyaUI.updateSerialPorts(message.ports);
                        break;
                    case 'switchPlatform':
                        await this.switchPlatform(message.platform);
                        break;
                }
            });
        },

        /**
         * 初始化 Cocoya 編輯器環境
         */
        initializeCocoya: async function(manifest, mediaUri, lang) {
            this.manifest = manifest;
            this.currentLang = lang || 'en';
            window.CocoyaMediaUri = mediaUri;
            window.CocoyaUI.mediaUri = mediaUri;

            try {
                // 1. 動態載入核心語系檔
                await CocoyaLoader.loadScript(`${mediaUri}/${this.currentLang}.js`);

                this.registerPlugins();
                this.setupBlocklyPrompts();

                // 2. 載入模組 (含模組語系) 並建立工具箱
                const toolboxes = await CocoyaLoader.loadModules(manifest, mediaUri, this.currentPlatform, this.currentLang);
                
                const coreXml = [];
                const aiXml = [];
                const otherXml = [];

                toolboxes.forEach(mod => {
                    if (mod.id.startsWith('core/')) {
                        coreXml.push(mod.xml);
                    } else if (mod.id.startsWith('cv_') || mod.id.startsWith('ai_')) {
                        aiXml.push(mod.xml);
                    } else {
                        otherXml.push(mod.xml);
                    }
                });

                let finalToolboxXML = `<xml>${coreXml.join('')}`;
                if (aiXml.length > 0) {
                    finalToolboxXML += `<category name="%{BKY_CAT_AI}" colour="%{BKY_COLOUR_AI}">${aiXml.join('')}</category>`;
                }
                finalToolboxXML += `${otherXml.join('')}</xml>`;

                // 注入 Blockly
                this.workspace = Blockly.inject('blocklyDiv', {
                    toolbox: finalToolboxXML,
                    grid: { spacing: 20, length: 3, colour: '#ccc', snap: true },
                    trashcan: true,
                    sounds: false,
                    scrollbars: true,
                    move: { scrollbars: true, drag: true, wheel: true },
                    zoom: { controls: true, wheel: false, startScale: 1.0, maxScale: 3, minScale: 0.3, scaleSpeed: 1.2 }
                });

                // 初始化 UI 元件
                window.CocoyaUI.applyI18n();
                window.CocoyaUI.initToolbar((msg) => vscode.postMessage(msg));
                window.CocoyaUI.updateRunTooltip(this.currentPlatform); // 初始化 Tooltip
                vscode.postMessage({ command: 'setLocale', messages: Blockly.Msg });

                this.registerVariablesCallback();
                this.setupGeneratorOverrides();
                this.setupWorkspaceListeners();
                
                // 預置初始積木
                if (this.workspace.getTopBlocks(false).length === 0) {
                    this.createDefaultBlocks();
                }

                // 設定初始 UI 狀態
                window.CocoyaUI.updateFileStatus('');
                this.triggerCodeUpdate();

                document.body.style.background = 'white';
            } catch (error) {
                console.error('Cocoya Initialization Failed:', error);
            }
        },

        /**
         * 註冊 Blockly 插件 (多行文字、顏色等)
         */
        registerPlugins: function() {
            if (typeof Blockly === 'undefined') return;
            if (window.FieldMultilineInput) {
                Blockly.fieldRegistry.register('field_multilinetext', window.FieldMultilineInput);
            }
            if (window.FieldColour) {
                Blockly.fieldRegistry.register('field_colour', window.FieldColour);
            }
        },

        /**
         * 設定自定義 Prompt 橋樑
         */
        setupBlocklyPrompts: function() {
            const self = this;
            const customPrompt = function(msg, defaultValue, callback) {
                const requestId = Date.now() + Math.random();
                if (typeof callback === 'function') self.promptRequests.set(requestId, callback);
                vscode.postMessage({ command: 'prompt', message: msg, defaultValue: defaultValue, requestId: requestId });
            };
            window.prompt = (msg, def) => { customPrompt(msg, def); return null; };
            Blockly.prompt = customPrompt;
            if (Blockly.dialog) {
                Blockly.dialog.prompt = customPrompt;
            }
        },

        /**
         * 註冊變數分類回調
         */
        registerVariablesCallback: function() {
            this.workspace.registerToolboxCategoryCallback('VARIABLE', (ws) => {
                const xmlList = [];
                xmlList.push(Blockly.utils.xml.textToDom('<button text="%{BKY_NEW_VARIABLE}" callbackKey="CREATE_VARIABLE"></button>'));
                xmlList.push(Blockly.utils.xml.textToDom('<block type="py_variables_global"></block>'));
                xmlList.push(Blockly.utils.xml.textToDom(
                    `<block type="py_variables_set">
                        <value name="VALUE"><shadow type="py_math_number"><field name="NUM">0</field></shadow></value>
                    </block>`
                ));
                xmlList.push(Blockly.utils.xml.textToDom('<block type="py_variables_get"></block>'));
                return xmlList;
            });

            this.workspace.registerButtonCallback('CREATE_VARIABLE', (btn) => {
                const ws = btn.getTargetWorkspace();
                const hint = Blockly.Msg['BKY_NEW_VARIABLE_HINT'] || 'New variables (comma separated):';
                window.prompt(hint, '', (input) => {
                    if (input) {
                        const names = input.split(/[，,]/).map(s => s.trim()).filter(s => s !== '');
                        names.forEach(name => ws.createVariable(name));
                    }
                });
            });
        },

        /**
         * 設定預設入口與定義區積木
         */
        createDefaultBlocks: function() {
            Blockly.Events.disable();
            try {
                if (this.currentPlatform === 'PC') {
                    const defBlock = this.workspace.newBlock('py_definition_zone');
                    defBlock.initSvg();
                    defBlock.render();
                    defBlock.moveBy(20, 20);
                    defBlock.setDeletable(false);

                    const mainBlock = this.workspace.newBlock('py_main');
                    mainBlock.initSvg();
                    mainBlock.render();
                    mainBlock.moveBy(20, 140);
                    mainBlock.setDeletable(false);
                } else {
                    // MCU 模式的預設積木 (使用 Engineer 風格的 py_loop_while)
                    const loopBlock = this.workspace.newBlock('py_loop_while');
                    loopBlock.initSvg();
                    loopBlock.render();
                    loopBlock.moveBy(20, 20);
                    loopBlock.setDeletable(false);
                    
                    const trueBlock = this.workspace.newBlock('py_logic_boolean');
                    trueBlock.setFieldValue('True', 'BOOL');
                    trueBlock.initSvg();
                    trueBlock.render();
                    
                    // 連接 CONDITION 輸入
                    const input = loopBlock.getInput('CONDITION');
                    if (input && input.connection) {
                        input.connection.connect(trueBlock.outputConnection);
                    }
                }
            } finally {
                Blockly.Events.enable();
            }
        },

        /**
         * 擴充 Python 產生器，注入定位 ID
         */
        setupGeneratorOverrides: function() {
            Blockly.Python.scrub_ = function(block, code, opt_thisOnly) {
                if (!block.isEnabled()) {
                    const nextBlock = block.nextConnection && block.nextConnection.targetBlock();
                    return (nextBlock && !opt_thisOnly) ? Blockly.Python.blockToCode(nextBlock) : '';
                }
                const nextBlock = block.nextConnection && block.nextConnection.targetBlock();
                const nextCode = (nextBlock && !opt_thisOnly) ? Blockly.Python.blockToCode(nextBlock) : '';
                
                const s = window.CocoyaUtils.TAG_START;
                const e = window.CocoyaUtils.TAG_END;

                if (block.outputConnection) {
                    // 運算式：使用不可見標記
                    return `${s}ID:${block.id}${e}${code}${nextCode}`;
                } else {
                    // 陳述句：將 ID 註解放在行尾以維持行號 1:1
                    let lines = code.split('\n');
                    // 處理最後一個換行導致的空陣列元素
                    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
                    
                    if (lines.length > 0) {
                        // 只在該積木產出的第一行加上 ID 標記
                        lines[0] += `  # ID:${block.id}`;
                    }
                    return lines.join('\n') + '\n' + nextCode;
                }
            };
        },

        /**
         * 設定工作區變動監聽器
         */
        setupWorkspaceListeners: function() {
            this.workspace.addChangeListener((event) => {
                const isBlockChange = event.type === Blockly.Events.BLOCK_MOVE || 
                                     event.type === Blockly.Events.BLOCK_CREATE || 
                                     event.type === Blockly.Events.BLOCK_CHANGE ||
                                     event.type === Blockly.Events.BLOCK_DELETE ||
                                     event.type === Blockly.Events.VAR_CREATE ||
                                     event.type === Blockly.Events.VAR_RENAME ||
                                     event.type === Blockly.Events.VAR_DELETE;

                if (isBlockChange && !event.isUiEvent) {
                    this.setDirty(true);
                    this.triggerBlockStateUpdate();
                }

                if (event.type === Blockly.Events.SELECTED) {
                    window.CocoyaUI.syncSelection(event.newElementId);
                }

                if (!event.isUiEvent || isBlockChange) {
                    this.triggerCodeUpdate();
                }
            });
        },

        /**
         * 更新積木啟用狀態 (孤兒積木檢查) - 效能優化版
         */
        triggerBlockStateUpdate: function() {
            if (this.stateUpdateTimer) clearTimeout(this.stateUpdateTimer);
            this.stateUpdateTimer = setTimeout(() => {
                Blockly.Events.disable();
                try {
                    const topBlocks = this.workspace.getTopBlocks(false);
                    const allowedTypes = ['py_main', 'py_definition_zone', 'py_function_def'];
                    if (this.currentPlatform === 'CircuitPython') {
                        allowedTypes.push('py_loop_while');
                    }

                    topBlocks.forEach(root => {
                        const isAllowed = allowedTypes.includes(root.type) || root.type.startsWith('procedures_def');
                        
                        // 遞迴處理該樹下的所有積木
                        const descendants = root.getDescendants(false);
                        descendants.forEach(block => {
                            if (typeof block.setDisabledReason === 'function') {
                                block.setDisabledReason(!isAllowed, 'orphan');
                            } else {
                                block.setEnabled(isAllowed);
                            }
                        });
                    });
                } finally {
                    Blockly.Events.enable();
                }
            }, 150); // 150ms 防抖，釋放 CPU 給動畫渲染
        },

        /**
         * 代碼預覽更新邏輯 (含防抖)
         */
        triggerCodeUpdate: function() {
            if (this.updateTimer) clearTimeout(this.updateTimer);
            this.updateTimer = setTimeout(() => {
                try {
                    let code = Blockly.Python.workspaceToCode(this.workspace);
                    
                    // 1. 移除自動產生的變數宣告 (連同換行符一起移除，避免殘留空行)
                    code = code.replace(/^[a-zA-Z_][a-zA-Z0-9_]* = None(  # ID:.*)?\n/mg, '');
                    
                    // 2. 移除運算式內部的隱形標記
                    code = code.replace(/\u0001ID:.*?\u0002/g, '');
                    
                    // 3. 建立「真理」基準：移除頭尾空白，這份代碼將直接用於執行與預覽
                    const theTruth = code.trim();
                    
                    // 4. 保存供執行使用的代碼 (包含行尾 ID 註解，Python 會忽略它們)
                    window.CocoyaApp.lastCleanCode = theTruth;
                    
                    // 5. 將這份唯一的字串傳給 UI 管理器
                    window.CocoyaUI.renderPythonPreview(theTruth);
                } catch (e) {
                    console.error('Code update failed:', e);
                }
            }, 300);
        },

        /**
         * 設定髒狀態
         */
        setDirty: function(dirty) {
            this.isDirty = dirty;
            window.CocoyaUI.setDirty(dirty);
            // 通知 Host 更新頁籤標題
            vscode.postMessage({ command: 'setDirty', isDirty: dirty });
        },

        // --- 訊息處理實作 ---

        handleToolboxData: function(message) {
            const resolve = window.CocoyaXMLRequests.get(message.requestId);
            if (resolve) {
                resolve(message.data);
                window.CocoyaXMLRequests.delete(message.requestId);
            }
        },

        handlePromptResponse: function(message) {
            const callback = this.promptRequests.get(message.requestId);
            if (callback) {
                callback(message.result);
                this.promptRequests.delete(message.requestId);
                this.refreshToolboxSelection();
            }
        },

        refreshToolboxSelection: function() {
            if (this.workspace && this.workspace.getToolbox()) {
                const toolbox = this.workspace.getToolbox();
                const selected = toolbox.getSelectedItem();
                if (selected && selected.getContents() === 'VARIABLE') {
                    toolbox.setSelectedItem(selected);
                }
            }
        },

        loadWorkspace: async function(xml, filename, platform) {
            // 如果傳入的平台與目前不同，則切換 UI (但不重置工作區，因為隨後要載入 XML)
            if (platform && platform !== this.currentPlatform) {
                await this.setPlatformUI(platform);
            }

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
            this.setDirty(false);
            window.CocoyaUI.flashButton('btn-save', '#e3f2fd');
        }
    };

    // 啟動 Cocoya
    window.CocoyaApp = CocoyaApp;
    CocoyaApp.init();
})();
