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
                this._resolveReady();
            } catch (e) {
                console.error('[Bridge] Failed to load Tauri API:', e);
                // 即使失敗也 resolve，避免前端永遠卡住，改走 Mock 模式
                this._resolveReady();
            }
        } else {
            console.warn('[Bridge] Running in Browser (Preview) mode');
            this._resolveReady();
        }
    },

    /**
     * 發送指令至後端 (增加等待機制)
     */
    async send(command, data = {}) {
        // 確保初始化完成後才執行
        await this.ready;

        if (this.isVsCode && this.vscode) {
            this.vscode.postMessage({ command, ...data });
        } else if (this.isTauri && tauriInvoke) {
            try {
                let result;
                switch (command) {
                    case 'getManifest': 
                        result = await tauriInvoke('get_manifest'); 
                        this._dispatchToFrontend({ command: 'manifestData', data: result, mediaUri: '/src', lang: 'zh-hant' });
                        break;
                    case 'getModuleToolbox':
                        // 修正：前端傳來的是 moduleId，我們需要將其轉為 path
                        const toolboxPath = `${data.moduleId}/toolbox.xml`;
                        result = await tauriInvoke('get_module_toolbox', { path: toolboxPath });
                        // 直接將結果回傳給發起者 (若有 requestId)
                        if (data.requestId) {
                            this._dispatchToFrontend({ command: 'toolboxData', data: result, requestId: data.requestId });
                        }
                        break;
                    case 'runCode':
                        if (data.platform === 'CircuitPython') {
                            // MCU 模式：執行部署
                            try {
                                await tauriInvoke('deploy_mcu', {
                                    pythonPath: localStorage.getItem('pythonPath') || 'python',
                                    port: data.serialPort,
                                    code: data.code
                                });
                                this._dispatchToFrontend({ command: 'deployCompleted' });
                            } catch (e) {
                                this._dispatchToFrontend({ command: 'deployFailed', error: e });
                            }
                        } else {
                            // PC 模式：執行本地 Python
                            await tauriInvoke('run_python', { 
                                code: data.code, 
                                pythonPath: localStorage.getItem('pythonPath') || 'python' 
                            });
                        }
                        break;
                    case 'stopCode':
                        await tauriInvoke('stop_python');
                        break;
                    case 'refreshSerialPorts':
                        try {
                            result = await tauriInvoke('get_serial_ports');
                            this._dispatchToFrontend({ command: 'serialPortsData', ports: result });
                        } catch (e) {
                            console.error('[Bridge] Failed to refresh serial ports:', e);
                        }
                        break;
                    case 'getSerialPorts':
                        try {
                            result = await tauriInvoke('get_serial_ports');
                            this._dispatchToFrontend({ command: 'serialPortsData', ports: result });
                        } catch (e) {
                            console.error('[Bridge] Failed to get serial ports:', e);
                        }
                        break;
                    case 'deployMcu':
                        try {
                            await tauriInvoke('deploy_mcu', {
                                pythonPath: localStorage.getItem('pythonPath') || 'python',
                                port: data.port,
                                code: data.code
                            });
                            this._dispatchToFrontend({ command: 'deployCompleted' });
                        } catch (e) {
                            this._dispatchToFrontend({ command: 'deployFailed', error: e });
                        }
                        break;
                    case 'saveFile':
                    case 'saveFileAs':
                        try {
                            const isSaveAs = (command === 'saveFileAs');
                            const filename = await tauriInvoke('save_file', { xml: data.xml, saveAs: isSaveAs });
                            this._dispatchToFrontend({ command: 'saveCompleted', filename: filename });
                        } catch (e) {
                            if (e !== 'Canceled') console.error('[Bridge] Save failed:', e);
                        }
                        break;
                    case 'openFile':
                        try {
                            const result = await tauriInvoke('open_file');
                            this._dispatchToFrontend({ 
                                command: 'loadWorkspace', 
                                xml: result.xml, 
                                filename: result.filename, 
                                platform: result.platform 
                            });
                            // 若後端偵測到備份，觸發恢復詢問
                            if (result.backup_xml) {
                                this._dispatchToFrontend({ command: 'recoveryData', xml: result.backup_xml });
                            }
                        } catch (e) {
                            if (e !== 'Canceled') console.error('[Bridge] Open failed:', e);
                        }
                        break;
                    case 'setLocale':
                        // Tauri 暫不需要處理語系同步，僅記錄
                        console.log('[Bridge] Locale set to:', data.messages ? 'Received' : 'Empty');
                        break;
                    case 'autoBackup':
                        if (this.isVsCode) this.vscode.postMessage({ command, ...data });
                        else if (this.isTauri) await tauriInvoke('auto_backup', { xml: data.xml });
                        break;
                    case 'clearBackup':
                        if (this.isVsCode) this.vscode.postMessage({ command, ...data });
                        else if (this.isTauri) await tauriInvoke('clear_backup');
                        break;
                    case 'rejectRecovery':
                        if (this.isVsCode) this.vscode.postMessage({ command, ...data });
                        else if (this.isTauri) await tauriInvoke('reject_recovery');
                        break;
                    case 'setDirty':
                        // Tauri 模式下動態更新視窗標題
                        try {
                            const { getCurrentWindow } = await import('@tauri-apps/api/window');
                            const appWindow = getCurrentWindow();
                            const title = await appWindow.title();
                            if (data.isDirty && !title.includes('*')) {
                                await appWindow.setTitle(title + ' *');
                            } else if (!data.isDirty && title.includes('*')) {
                                await appWindow.setTitle(title.replace(' *', ''));
                            }
                        } catch (e) {}
                        break;
                    case 'prompt':
                        if (this.isVsCode) {
                            this.vscode.postMessage({ command, ...data });
                        } else if (this.isTauri) {
                            try {
                                const { ask } = await import('@tauri-apps/api/plugin-dialog');
                                const ok = await ask(data.message, { title: 'Cocoya', kind: 'info' });
                                this._dispatchToFrontend({ command: 'promptResponse', requestId: data.requestId, result: ok ? data.defaultValue : null });
                            } catch (e) {}
                        }
                        break;
                    case 'confirm':
                        if (this.isVsCode) {
                            this.vscode.postMessage({ command: 'confirm', message: data.message, requestId: data.requestId });
                        } else if (this.isTauri) {
                            try {
                                const { ask } = await import('@tauri-apps/api/plugin-dialog');
                                const okLabel = (window.Blockly && (Blockly.Msg['MSG_OK'] || Blockly.Msg['MSG_SAVE'])) || 'OK';
                                const cancelLabel = (window.Blockly && Blockly.Msg['MSG_CANCEL']) || 'Cancel';
                                const ok = await ask(data.message, { title: 'Cocoya', kind: 'warning', okLabel, cancelLabel });
                                this._dispatchToFrontend({ command: 'promptResponse', requestId: data.requestId, result: ok });
                            } catch (e) { console.error('[Bridge] Confirm error:', e); }
                        }
                        break;
                    case 'alert':
                        if (this.isVsCode) {
                            this.vscode.postMessage({ command, ...data });
                        } else if (this.isTauri) {
                            try {
                                const { message } = await import('@tauri-apps/api/plugin-dialog');
                                await message(data.message, { title: 'Cocoya', kind: 'info' });
                            } catch (e) {}
                        }
                        break;
                    default:
                        console.warn(`[Bridge] Tauri command "${command}" not implemented yet`);
                }
            } catch (e) {
                console.error(`[Bridge] Tauri invoke error (${command}):`, e);
            }
        } else {
            console.log(`[Bridge-Mock] Sending: ${command}`, data);
        }
    },

    /**
     * 監聽後端回傳的訊息
     */
    onMessage(callback) {
        this.messageCallback = callback;
        if (this.isVsCode) {
            window.addEventListener('message', (event) => {
                callback(event.data);
            });
        } else if (this.isTauri) {
            this._setupTauriListeners();
        }
    },

    _dispatchToFrontend(message) {
        if (this.messageCallback) this.messageCallback(message);
    },

    async _setupTauriListeners() {
        await this.ready;
        if (!tauriListen) return;
        
        await tauriListen('python-log', (event) => {
            console.log('%c[Python]', 'color: #4caf50; font-weight: bold;', event.payload);
        });
        await tauriListen('python-error', (event) => {
            console.error('[Python Error]', event.payload);
        });
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
