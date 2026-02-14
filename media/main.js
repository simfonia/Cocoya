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

        /**
         * 啟動應用程式
         */
        init: function() {
            // 初始化請求 Map (確保 module_loader 能共用)
            if (!window.CocoyaXMLRequests) window.CocoyaXMLRequests = new Map();

            this.setupWindowListeners();
            // 請求初始清單
            vscode.postMessage({ command: 'getManifest' });
        },

        /**
         * 設定全域視窗監聽器 (處理來自 Host 的訊息)
         */
        setupWindowListeners: function() {
            window.addEventListener('message', async (event) => {
                const message = event.data;
                switch (message.command) {
                    case 'manifestData':
                        await this.initializeCocoya(message.data, message.mediaUri);
                        break;
                    case 'toolboxData':
                        this.handleToolboxData(message);
                        break;
                    case 'promptResponse':
                        this.handlePromptResponse(message);
                        break;
                    case 'loadWorkspace':
                        this.loadWorkspace(message.xml, message.filename);
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
                }
            });
        },

        /**
         * 初始化 Cocoya 編輯器環境
         */
        initializeCocoya: async function(manifest, mediaUri) {
            window.CocoyaMediaUri = mediaUri;
            window.CocoyaUI.mediaUri = mediaUri;

            try {
                this.registerPlugins();
                this.setupBlocklyPrompts();

                // 載入模組並建立工具箱
                const coreToolboxes = await CocoyaLoader.loadModules(manifest, `${mediaUri}/core_modules`);
                const finalToolboxXML = `<xml>${document.getElementById('toolbox').innerHTML}${coreToolboxes.join('')}</xml>`;

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
                return block.outputConnection ? `${s}ID:${block.id}${e}${code}${nextCode}` : `# ID:${block.id}\n${code}${nextCode}`;
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
         * 更新積木啟用狀態 (孤兒積木檢查)
         */
        triggerBlockStateUpdate: function() {
            setTimeout(() => {
                Blockly.Events.disable();
                try {
                    const blocks = this.workspace.getAllBlocks(false);
                    blocks.forEach(block => {
                        let root = block;
                        while (root.getParent()) root = root.getParent();
                        const isAllowed = ['py_main', 'py_definition_zone', 'py_function_def'].includes(root.type) || root.type.startsWith('procedures_def');
                        if (typeof block.setDisabledReason === 'function') {
                            block.setDisabledReason(!isAllowed, 'orphan');
                        } else {
                            block.setEnabled(isAllowed);
                        }
                    });
                } finally {
                    Blockly.Events.enable();
                }
            }, 0);
        },

        /**
         * 代碼預覽更新邏輯 (含防抖)
         */
        triggerCodeUpdate: function() {
            if (this.updateTimer) clearTimeout(this.updateTimer);
            this.updateTimer = setTimeout(() => {
                try {
                    let code = Blockly.Python.workspaceToCode(this.workspace);
                    code = code.replace(/^[a-zA-Z_][a-zA-Z0-9_]* = None\n/mg, '');
                    window.CocoyaUI.renderPythonPreview(code);
                } catch (e) {
                    console.error('Code update failed:', e);
                }
            }, 200);
        },

        /**
         * 設定髒狀態
         */
        setDirty: function(dirty) {
            this.isDirty = dirty;
            window.CocoyaUI.setDirty(dirty);
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

        loadWorkspace: function(xml, filename) {
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
    CocoyaApp.init();
})();
