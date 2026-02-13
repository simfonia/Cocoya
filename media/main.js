(function() {
    let vscode;
    try {
        vscode = acquireVsCodeApi();
        window.vsCodeApi = vscode;
    } catch (e) {
        vscode = window.vsCodeApi;
    }

    // --- 通訊監聽 ---
    window.CocoyaXMLRequests = new Map();
    window.CocoyaPromptRequests = new Map();

    window.addEventListener('message', async event => {
        const message = event.data;
        if (message.command === 'manifestData') {
            initializeCocoya(message.data, message.mediaUri);
        } else if (message.command === 'toolboxData') {
            const resolve = window.CocoyaXMLRequests.get(message.requestId);
            if (resolve) {
                resolve(message.data);
                window.CocoyaXMLRequests.delete(message.requestId);
            }
        } else if (message.command === 'promptResponse') {
            const callback = window.CocoyaPromptRequests.get(message.requestId);
            if (callback) {
                callback(message.result);
                window.CocoyaPromptRequests.delete(message.requestId);
                
                const workspace = Blockly.getMainWorkspace();
                if (workspace && workspace.getToolbox()) {
                    const toolbox = workspace.getToolbox();
                    const selected = toolbox.getSelectedItem();
                    if (selected && selected.getContents() === 'VARIABLE') {
                        toolbox.setSelectedItem(selected);
                    }
                }
            }
        }
    });

    vscode.postMessage({ command: 'getManifest' });

    async function initializeCocoya(manifest, mediaUri) {
        window.CocoyaMediaUri = mediaUri;
        try {
            // 註冊插件
            if (typeof Blockly !== 'undefined') {
                if (window.FieldMultilineInput) {
                    Blockly.fieldRegistry.register('field_multilinetext', window.FieldMultilineInput);
                }
                if (window.FieldColour) {
                    Blockly.fieldRegistry.register('field_colour', window.FieldColour);
                }
            }

            const customPrompt = function(msg, defaultValue, callback) {
                const requestId = Date.now() + Math.random();
                if (typeof callback === 'function') window.CocoyaPromptRequests.set(requestId, callback);
                vscode.postMessage({ command: 'prompt', message: msg, defaultValue: defaultValue, requestId: requestId });
            };
            window.prompt = (msg, def) => { customPrompt(msg, def); return null; };
            Blockly.prompt = customPrompt;
            if (Blockly.dialog) {
                Blockly.dialog.prompt = customPrompt;
                if (Blockly.dialog.setPrompt) Blockly.dialog.setPrompt(customPrompt);
            }

            const coreToolboxes = await CocoyaLoader.loadModules(manifest, `${mediaUri}/core_modules`);
            const finalToolboxXML = `<xml>${document.getElementById('toolbox').innerHTML}${coreToolboxes.join('')}</xml>`;

            const workspace = Blockly.inject('blocklyDiv', {
                toolbox: finalToolboxXML,
                grid: { spacing: 20, length: 3, colour: '#ccc', snap: true },
                trashcan: true,
                sounds: false,
                scrollbars: true,
                move: { scrollbars: true, drag: true, wheel: true },
                zoom: { controls: true, wheel: false, startScale: 1.0, maxScale: 3, minScale: 0.3, scaleSpeed: 1.2 }
            });

            const updateBlocksEnabledState = function(ws) {
                const blocks = ws.getAllBlocks(false);
                blocks.forEach(block => {
                    // 找出最終根積木
                    let root = block;
                    while (root.getParent()) root = root.getParent();

                    const type = root.type;
                    const isAllowedAtTop = type === 'py_main' || type === 'py_definition_zone' || 
                                         type === 'py_function_def' || type.startsWith('procedures_def');
                    
                    // 只要根積木不合法，整串都應禁用
                    const shouldEnable = isAllowedAtTop;
                    
                    if (typeof block.setDisabledReason === 'function') {
                        block.setDisabledReason(!shouldEnable, 'orphan');
                    } else if (typeof block.setEnabled === 'function') {
                        block.setEnabled(shouldEnable);
                    }
                    if (block.rendered && block.updateDisabled) block.updateDisabled();
                });
            };

            // 註冊變數分類的 Callback
            workspace.registerToolboxCategoryCallback('VARIABLE', (ws) => {
                const xmlList = [];
                // 1. 建立變數按鈕
                xmlList.push(Blockly.utils.xml.textToDom('<button text="%{BKY_NEW_VARIABLE}" callbackKey="CREATE_VARIABLE"></button>'));
                
                // 2. 全域宣告積木
                xmlList.push(Blockly.utils.xml.textToDom('<block type="py_variables_global"></block>'));

                // 3. 通用變數操作積木 (只需各一個，使用者可從下拉選單切換)
                xmlList.push(Blockly.utils.xml.textToDom(
                    `<block type="py_variables_set">
                        <value name="VALUE"><shadow type="py_math_number"><field name="NUM">0</field></shadow></value>
                    </block>`
                ));
                xmlList.push(Blockly.utils.xml.textToDom('<block type="py_variables_get"></block>'));

                return xmlList;
            });

            workspace.registerButtonCallback('CREATE_VARIABLE', (btn) => {
                const ws = btn.getTargetWorkspace();
                customPrompt(Blockly.Msg['BKY_NEW_VARIABLE_HINT'] || 'New variables (comma separated):', '', (input) => {
                    if (input) {
                        // 支援逗號分隔批次建立 (支援全形與半形逗號)
                        const names = input.split(/[，,]/).map(s => s.trim()).filter(s => s !== '');
                        names.forEach(name => ws.createVariable(name));
                    }
                });
            });

            // 4. 自動預置入口與定義積木
            if (workspace.getTopBlocks(false).length === 0) {
                // 建立全域定義區
                const defBlock = workspace.newBlock('py_definition_zone');
                defBlock.initSvg();
                defBlock.render();
                defBlock.moveBy(20, 20);
                defBlock.setDeletable(false);

                // 建立 Main 入口
                const mainBlock = workspace.newBlock('py_main');
                mainBlock.initSvg();
                mainBlock.render();
                mainBlock.moveBy(20, 140); // 放在定義區下方
                mainBlock.setDeletable(false);
            }

            // 5. 代碼產生器擴充 (攔截禁用積木)
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

            // 8. 事件監聽 (含防抖機制)
            let updateTimer = null;
            workspace.addChangeListener((event) => {
                const isBlockChange = event.type === Blockly.Events.BLOCK_MOVE || 
                                     event.type === Blockly.Events.BLOCK_CREATE || 
                                     event.type === Blockly.Events.BLOCK_CHANGE ||
                                     event.type === Blockly.Events.BLOCK_DELETE;

                if (isBlockChange) {
                    setTimeout(() => {
                        // 狀態同步不應產生 Undo 紀錄
                        Blockly.Events.disable();
                        try {
                            updateBlocksEnabledState(workspace);
                        } finally {
                            Blockly.Events.enable();
                        }
                    }, 0);
                }

                if (event.type === Blockly.Events.SELECTED) {
                    window.CocoyaUI.syncSelection(event.newElementId);
                }

                if (!event.isUiEvent || isBlockChange) {
                    if (updateTimer) clearTimeout(updateTimer);
                    updateTimer = setTimeout(() => {
                        try {
                            let code = Blockly.Python.workspaceToCode(workspace);
                            // 移除自動產生的變數初始化 (例如 test = None)
                            code = code.replace(/^[a-zA-Z_][a-zA-Z0-9_]* = None\n/mg, '');
                            window.CocoyaUI.renderPythonPreview(code);
                        } catch (e) {
                            console.error('Update failed:', e);
                        }
                    }, 200);
                }
            });

            document.body.style.background = 'white';
        } catch (error) {
            console.error('WEBVIEW ERROR:', error);
        }
    }
})();
