/**
 * Cocoya 通訊橋樑 (Bridge)
 * 封裝 VS Code Webview 與 Tauri 兩種通訊模式
 * 提供統一的介面給前端邏輯呼叫
 */

// Tauri 2.0 API 引用
let tauriInvoke = null;
let tauriListen = null;

const CocoyaBridge = {
    // 環境判定
    isVsCode: typeof acquireVsCodeApi === 'function',
    isTauri: !!window.__TAURI_INTERNALS__,

    // VS Code API 實體
    vscode: null,

    // 初始化 Promise
    _resolveReady: null,
    ready: null,

    // 監聽器列表 (Set 確保唯一性)
    _listeners: new Set(),

    /**
     * 初始化 Bridge
     */
    async init() {
        // 建立一個可供外部等待的 Promise
        this.ready = new Promise((resolve) => {
            this._resolveReady = resolve;
        });

        if (this.isVsCode) {
            this.vscode = acquireVsCodeApi();
            console.log('[Bridge] Running in VS Code mode');
            window.addEventListener('message', (event) => {
                this._dispatchToFrontend(event.data);
            });
            this._resolveReady();
        } else if (this.isTauri) {
            console.log('[Bridge] Running in Tauri mode');
            try {
                // 動態導入 Tauri v2 API
                const { invoke } = await import('@tauri-apps/api/core');
                const { listen } = await import('@tauri-apps/api/event');
                tauriInvoke = invoke;
                tauriListen = listen;
                console.log('[Bridge] Tauri API loaded successfully');
                this._setupTauriListeners();
                this._resolveReady();
            } catch (e) {
                console.error('[Bridge] Failed to load Tauri API:', e);
                this._resolveReady();
            }
        } else {
            console.warn('[Bridge] Running in Browser (Preview) mode');
            this._resolveReady();
        }
    },

    /**
     * 發送指令至後端
     */
    async send(command, data = {}) {
        await this.ready;

        // --- 核心分發邏輯 ---
        try {
            let result;
            switch (command) {
                case 'getManifest':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        result = await tauriInvoke('get_manifest'); 
                        this._dispatchToFrontend({ command: 'manifestData', data: result, mediaUri: '/src', lang: 'zh-hant' });
                    }
                    break;

                case 'getModuleToolbox':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        const toolboxPath = `${data.moduleId}/toolbox.xml`;
                        result = await tauriInvoke('get_module_toolbox', { path: toolboxPath });
                        if (data.requestId) {
                            this._dispatchToFrontend({ command: 'toolboxData', data: result, requestId: data.requestId });
                        }
                    }
                    break;

                case 'runCode':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        if (data.platform === 'MicroPython') {
                            await tauriInvoke('deploy_mcu', {
                                pythonPath: localStorage.getItem('pythonPath') || 'python',
                                port: data.serialPort,
                                code: data.code
                            });
                            this._dispatchToFrontend({ command: 'deployCompleted' });
                        } else {
                            await tauriInvoke('run_python', { 
                                code: data.code, 
                                pythonPath: localStorage.getItem('pythonPath') || 'python' 
                            });
                        }
                    }
                    break;

                case 'stopCode':
                    if (this.isVsCode) this.vscode.postMessage({ command, ...data });
                    else if (this.isTauri) await tauriInvoke('stop_python');
                    break;

                case 'refreshSerialPorts':
                case 'getSerialPorts':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        result = await tauriInvoke('get_serial_ports');
                        this._dispatchToFrontend({ command: 'serialPortsData', ports: result });
                    }
                    break;

                case 'deployMcu':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        await tauriInvoke('deploy_mcu', {
                            pythonPath: localStorage.getItem('pythonPath') || 'python',
                            port: data.port,
                            code: data.code
                        });
                        this._dispatchToFrontend({ command: 'deployCompleted' });
                    }
                    break;

                case 'saveFile':
                case 'saveFileAs':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        const isSaveAs = (command === 'saveFileAs');
                        const filename = await tauriInvoke('save_file', { xml: data.xml, saveAs: isSaveAs });
                        this._dispatchToFrontend({ command: 'saveCompleted', filename: filename });
                    }
                    break;

                case 'openFile':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        const res = await tauriInvoke('open_file');
                        this._dispatchToFrontend({ 
                            command: 'loadWorkspace', 
                            xml: res.xml, 
                            filename: res.filename, 
                            platform: res.platform 
                        });
                        if (res.backup_xml) {
                            this._dispatchToFrontend({ command: 'recoveryData', xml: res.backup_xml });
                        }
                    }
                    break;

                case 'autoBackup':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        await tauriInvoke('auto_backup', { xml: data.xml });
                    }
                    break;

                case 'clearBackup':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        await tauriInvoke('clear_backup');
                    }
                    break;

                case 'rejectRecovery':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        await tauriInvoke('reject_recovery');
                    }
                    break;

                case 'setDirty':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        const { getCurrentWindow } = await import('@tauri-apps/api/window');
                        const appWindow = getCurrentWindow();
                        const title = await appWindow.title();
                        if (data.isDirty && !title.includes('*')) {
                            await appWindow.setTitle(title + ' *');
                        } else if (!data.isDirty && title.includes('*')) {
                            await appWindow.setTitle(title.replace(' *', ''));
                        }
                    }
                    break;

                case 'resetFirmware':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        await tauriInvoke('reset_firmware', { model: data.model, shouldClear: data.shouldClear });
                        this.alert(window.Blockly?.Msg['MSG_FIRMWARE_BURN_SUCCESS'] || 'Burn success!');
                    }
                    break;

                case 'prompt':
                case 'confirm':
                case 'alert':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        const { ask, message } = await import('@tauri-apps/plugin-dialog');
                        if (command === 'alert') {
                            await message(data.message, { title: 'Cocoya', kind: 'info' });
                        } else {
                            const okLabel = (window.Blockly && (Blockly.Msg['MSG_OK'] || Blockly.Msg['MSG_SAVE'])) || 'OK';
                            const cancelLabel = (window.Blockly && Blockly.Msg['MSG_CANCEL']) || 'Cancel';
                            const ok = await ask(data.message, { title: 'Cocoya', kind: 'warning', okLabel, cancelLabel });
                            this._dispatchToFrontend({ 
                                command: 'promptResponse', 
                                requestId: data.requestId, 
                                result: (command === 'prompt' && ok) ? data.defaultValue : ok 
                            });
                        }
                    }
                    break;

                case 'pickMcuModel':
                    // 此指令僅用於 VS Code QuickPick
                    if (this.isVsCode) this.vscode.postMessage({ command, ...data });
                    break;

                case 'setLocale':
                    if (this.isVsCode) this.vscode.postMessage({ command, ...data });
                    else console.log('[Bridge] Locale sync ignored in Tauri mode');
                    break;

                default:
                    if (this.isVsCode) this.vscode.postMessage({ command, ...data });
                    else console.warn(`[Bridge] Command "${command}" not handled in current mode`);
                    break;
            }
        } catch (e) {
            console.error(`[Bridge] Error processing command "${command}":`, e);
            if (this.isTauri && command === 'resetFirmware') {
                this.alert((window.Blockly?.Msg['MSG_FIRMWARE_BURN_FAILED'] || 'Failed: ') + e);
            }
        }
    },

    /**
     * 註冊監聽器 (支援多重註冊)
     */
    onMessage(callback) {
        this._listeners.add(callback);
    },

    /**
     * 移除監聽器
     */
    offMessage(callback) {
        this._listeners.delete(callback);
    },

    _dispatchToFrontend(message) {
        this._listeners.forEach(cb => cb(message));
    },

    async _setupTauriListeners() {
        if (!tauriListen) return;
        await tauriListen('python-log', (event) => {
            console.log('%c[Python]', 'color: #4caf50; font-weight: bold;', event.payload);
        });
        await tauriListen('python-error', (event) => {
            console.error('[Python Error]', event.payload);
        });
        await tauriListen('recoveryData', (event) => {
            this._dispatchToFrontend({ command: 'recoveryData', xml: event.payload.xml });
        });
    },

    /**
     * 彈出型號選取視窗 (回傳 Promise<string|null>)
     * @param {Array<{id:string, label:string}>} options 
     */
    pickMcuModel(options) {
        const requestId = 'pick_' + Date.now();
        return new Promise((resolve) => {
            const handler = (msg) => {
                if (msg.command === 'promptResponse' && msg.requestId === requestId) {
                    this.offMessage(handler);
                    resolve(msg.result);
                }
            };
            this.onMessage(handler);

            if (this.isVsCode) {
                this.send('pickMcuModel', { options, requestId });
            } else {
                // Tauri 模式目前簡化為使用 prompt (未來可實作自定義選單)
                const msg = (window.Blockly?.Msg['MSG_SELECT_MCU_MODEL'] || 'Select MCU:') + '\n' + 
                            options.map((m, i) => `${i+1}. ${m.label}`).join('\n');
                this.prompt(msg, '1').then(res => {
                    if (!res) { resolve(null); return; }
                    const idx = parseInt(res, 10) - 1;
                    resolve(options[idx]?.id || null);
                });
            }
        });
    },

    /**
     * 彈出確認視窗 (Promise)
     */
    confirm(message) {
        const requestId = 'confirm_' + Date.now();
        return new Promise((resolve) => {
            const handler = (msg) => {
                if (msg.command === 'promptResponse' && msg.requestId === requestId) {
                    this.offMessage(handler);
                    resolve(msg.result);
                }
            };
            this.onMessage(handler);
            this.send('confirm', { message, requestId });
        });
    },

    /**
     * 彈出輸入視窗 (Promise)
     */
    prompt(message, defaultValue = '') {
        const requestId = 'prompt_' + Date.now();
        return new Promise((resolve) => {
            const handler = (msg) => {
                if (msg.command === 'promptResponse' && msg.requestId === requestId) {
                    this.offMessage(handler);
                    resolve(msg.result);
                }
            };
            this.onMessage(handler);
            this.send('prompt', { message, defaultValue, requestId });
        });
    },

    /**
     * 彈出警告視窗
     */
    alert(message) {
        this.send('alert', { message });
    },

    getManifest() { this.send('getManifest'); },
    saveFile(xml, isDirty) { this.send('saveFile', { xml, isDirty }); },
    runCode(code, platform, serialPort) { this.send('runCode', { code, platform, serialPort }); },
    stopCode() { this.send('stopCode'); }
};

// 全域初始化
CocoyaBridge.init();
window.CocoyaBridge = CocoyaBridge;
export default CocoyaBridge;
