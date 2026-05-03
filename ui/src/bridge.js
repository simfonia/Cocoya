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

                case 'setPythonPath':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        try {
                            const newPath = await tauriInvoke('pick_python_path');
                            if (newPath) {
                                localStorage.setItem('pythonPath', newPath);
                                const msg = (window.Blockly?.Msg['MSG_PYTHON_UPDATED'] || 'Python path updated to: %1').replace('%1', newPath);
                                this.alert(msg);
                            }
                        } catch (e) {
                            if (e !== 'Canceled') console.error('[Bridge] Failed to pick python path:', e);
                        }
                    }
                    break;

                case 'runCode':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        try {
                            const pythonPath = localStorage.getItem('pythonPath') || 'python';
                            const lang = (window.Blockly && Blockly.Msg['BKY_LANG']) || 'zh-hant';
                            
                            if (data.platform === 'MicroPython') {
                                if (!data.serialPort) {
                                    this.alert(window.Blockly?.Msg['MSG_SELECT_PORT'] || 'Please select a serial port first!');
                                    return;
                                }
                                window.CocoyaUI.showLoadingModal(window.Blockly?.Msg['MSG_UPLOADING'] || 'Uploading code to MCU...');
                                
                                await tauriInvoke('deploy_mcu', {
                                    pythonPath: pythonPath,
                                    port: data.serialPort,
                                    code: data.code,
                                    serialUploadOnly: data.serialUploadOnly || false,
                                    lang: lang
                                });
                                
                                window.CocoyaUI.hideLoadingModal();
                                // 成功後閃爍綠燈
                                window.CocoyaUI.flashButton('btn-run', '#75FB4C');
                            } else {
                                // PC 模式：直接執行
                                await tauriInvoke('run_python', { 
                                    code: data.code, 
                                    pythonPath: pythonPath 
                                });
                                window.CocoyaUI.flashButton('btn-run', '#75FB4C');
                            }
                        } catch (e) {
                            window.CocoyaUI.hideLoadingModal();
                            this.alert('Run failed: ' + e);
                        }
                    }
                    break;

                case 'stopCode':
                    if (this.isVsCode) this.vscode.postMessage({ command, ...data });
                    else if (this.isTauri) await tauriInvoke('stop_python');
                    break;

                case 'openSerialMonitor':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        try {
                            if (!data.serialPort) return;
                            const pythonPath = localStorage.getItem('pythonPath') || 'python';
                            const lang = (window.Blockly && Blockly.Msg['BKY_LANG']) || 'zh-hant';
                            // 開啟監控前自動展開終端機
                            if (window.CocoyaUI) {
                                window.CocoyaUI.toggleTerminal(true);
                                window.CocoyaUI.appendTerminal(`--- Opening Monitor: ${data.serialPort} ---`, 'info');
                            }
                            await tauriInvoke('open_serial_monitor', { 
                                port: data.serialPort,
                                pythonPath: pythonPath,
                                lang: lang
                            });
                        } catch (e) {
                            console.error('[Bridge] Failed to open monitor:', e);
                            const errLabel = window.Blockly?.Msg['MSG_MONITOR_FAILED'] || 'Failed to open monitor: ';
                            this.alert(errLabel + e);
                        }
                    }
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

                case 'checkUpdate':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        try {
                            // 1. 獲取目前版本
                            const currentVersion = await tauriInvoke('get_version').catch(() => '0.7.5');
                            const GITHUB_REPO_API = "https://api.github.com/repos/simfonia/Cocoya/releases/latest";
                            const DOWNLOAD_URL = "https://github.com/simfonia/Cocoya/releases";

                            // 2. 獲取遠端版本
                            const res = await fetch(GITHUB_REPO_API);
                            if (!res.ok) throw new Error('Network response was not ok');
                            const release = await res.json();
                            const latestVersion = release.tag_name.replace('v', '');

                            // 3. 版本比對 (簡化版語義化比對)
                            const cParts = currentVersion.split(/[.-]/).map(v => parseInt(v) || 0);
                            const lParts = latestVersion.split(/[.-]/).map(v => parseInt(v) || 0);
                            
                            let hasUpdate = false;
                            for (let i = 0; i < 3; i++) {
                                const l = lParts[i] || 0;
                                const c = cParts[i] || 0;
                                if (l > c) { hasUpdate = true; break; }
                                if (l < c) { hasUpdate = false; break; }
                            }

                            // 4. 回傳狀態給前端 UI
                            if (window.CocoyaUI) {
                                window.CocoyaUI.setUpdateStatus({
                                    hasUpdate,
                                    currentVersion,
                                    latestVersion,
                                    url: DOWNLOAD_URL
                                });
                            }
                        } catch (e) {
                            console.error('[Bridge] Check update failed:', e);
                            // 失敗時也回傳目前狀態以停止旋轉動畫
                            if (window.CocoyaUI) {
                                const current = await tauriInvoke('get_version').catch(() => '0.7.5');
                                window.CocoyaUI.setUpdateStatus({ hasUpdate: false, currentVersion: current, latestVersion: current, url: '' });
                            }
                        }
                    }
                    break;

                case 'openExternal':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        try {
                            const { open } = await import('@tauri-apps/plugin-shell');
                            await open(data.url);
                        } catch (e) {
                            console.error('[Bridge] Failed to open external URL:', e);
                            window.open(data.url, '_blank'); // 退回原始方式
                        }
                    }
                    break;

                case 'eraseFilesystem':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        try {
                            this._firstLogReceived = true;
                            // 主動打開終端機面板 (正確名稱為 toggleTerminal)
                            window.CocoyaUI.toggleTerminal(true);
                            const loadingMsg = window.Blockly?.Msg['MSG_ERASING_FS'] || 'Rebuilding filesystem... Please wait about 15 seconds.';
                            window.CocoyaUI.showLoadingModal(loadingMsg);
                            const pythonPath = localStorage.getItem('pythonPath') || 'python';
                            const lang = (window.Blockly && Blockly.Msg['BKY_LANG']) || 'zh-hant';
                            await tauriInvoke('erase_filesystem', { 
                                port: data.serialPort,
                                pythonPath: pythonPath,
                                lang: lang
                            });
                            window.CocoyaUI.hideLoadingModal();
                            this.alert(window.Blockly?.Msg['MSG_ERASE_FS_SUCCESS'] || 'Filesystem rebuilt successfully!');
                        } catch (e) {
                            this._firstLogReceived = true;
                            window.CocoyaUI.hideLoadingModal();
                            this.alert('Erase failed: ' + e);
                        }
                    }
                    break;
                case 'confirmSwitch':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        const { ask } = await import('@tauri-apps/plugin-dialog');
                        const ok = await ask(data.message, { title: 'Cocoya', kind: 'warning' });
                        if (ok) {
                            this._dispatchToFrontend({ command: 'switchPlatform', platform: data.newPlatform });
                        }
                    }
                    break;

                case 'setDirty':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        // Tauri 模式：通常由 ui_manager 透過 setWindowTitle 處理，
                        // 這裡保留以防未來有其他後端需求
                    }
                    break;

                case 'setWindowTitle':
                    if (this.isTauri) {
                        try {
                            await tauriInvoke('set_window_title', { title: `Cocoya - ${data.title}` });
                        } catch (e) { console.warn('[Bridge] Failed to set window title via Rust:', e); }
                    }
                    break;

                case 'setupStableMode':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        try {
                            window.CocoyaUI.showLoadingModal('Setting up stable mode...');
                            await tauriInvoke('setup_stable_mode', { port: data.serialPort });
                            window.CocoyaUI.hideLoadingModal();
                            this.alert('Stable mode enabled!');
                        } catch (e) {
                            window.CocoyaUI.hideLoadingModal();
                            this.alert('Setup failed: ' + e);
                        }
                    }
                    break;

                case 'resetFirmware':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        try {
                            const loadingMsg = window.Blockly?.Msg['MSG_BURNING_FIRMWARE'] || 'Burning firmware... Please do not close the window.';
                            window.CocoyaUI.showLoadingModal(loadingMsg);
                            
                            await tauriInvoke('reset_firmware', { model: data.model, shouldClear: data.shouldClear });
                            
                            window.CocoyaUI.hideLoadingModal();
                            this.alert(window.Blockly?.Msg['MSG_FIRMWARE_BURN_SUCCESS'] || 'Burn success!');
                        } catch (e) {
                            window.CocoyaUI.hideLoadingModal();
                            throw e; // 交給外層 catch 處理錯誤彈窗
                        }
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

                case 'newFile':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        // Tauri 模式下，開新檔案改為建立新視窗 (方案 B)
                        await tauriInvoke('create_window');
                    }
                    break;

                case 'createWindow':
                    if (this.isTauri) {
                        await tauriInvoke('create_window');
                    }
                    break;

                case 'checkEnvironment':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        try {
                            const pythonPath = localStorage.getItem('pythonPath') || 'python';
                            const results = await tauriInvoke('check_environment', { pythonPath: pythonPath });
                            this._dispatchToFrontend({ command: 'environmentStatus', results });
                        } catch (e) {
                            console.error('[Bridge] Check environment failed:', e);
                        }
                    }
                    break;

                case 'installModule':
                    if (this.isVsCode) {
                        this.vscode.postMessage({ command, ...data });
                    } else if (this.isTauri) {
                        // Tauri 模式：開啟終端機執行安裝
                        try {
                            const pythonPath = localStorage.getItem('pythonPath') || 'python';
                            if (window.CocoyaUI) {
                                window.CocoyaUI.toggleTerminal(true);
                                window.CocoyaUI.appendTerminal(`--- Installing module: ${data.module} ---`, 'info');
                            }
                            // 執行 pip install，不需要 await 因為我們想讓它異步執行
                            tauriInvoke('run_python', { 
                                code: `import subprocess; import sys; subprocess.run(["${pythonPath}", "-m", "pip", "install", "${data.module}", "--user"])`,
                                pythonPath: pythonPath 
                            });
                        } catch (e) {
                            console.error('[Bridge] Failed to start installation:', e);
                        }
                    }
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
            // 收到第一筆日誌時，關閉 Loading 視窗 (適用於 PC 模式啟動緩慢)
            if (!this._firstLogReceived) {
                this._firstLogReceived = true;
                window.CocoyaUI.hideLoadingModal();
            }
            // 轉向至終端機面板
            if (window.CocoyaUI) window.CocoyaUI.appendTerminal(event.payload, 'out');
        });
        await tauriListen('python-error', (event) => {
            this._firstLogReceived = true;
            window.CocoyaUI.hideLoadingModal();
            // 轉向至終端機面板 (紅色)
            if (window.CocoyaUI) window.CocoyaUI.appendTerminal(event.payload, 'err');
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
                // Tauri 模式使用自定義的 QuickPick UI
                const title = window.Blockly?.Msg['MSG_SELECT_MCU_MODEL'] || 'Select MCU Model';
                window.CocoyaUI.showQuickPick(title, options, (selectedId) => {
                    this._dispatchToFrontend({ 
                        command: 'promptResponse', 
                        requestId: requestId, 
                        result: selectedId 
                    });
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
