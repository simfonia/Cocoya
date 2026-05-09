import { BaseBridge } from './base.js';

/**
 * Tauri 桌面應用專屬橋接實作
 */
export class BridgeTauri extends BaseBridge {
    constructor() {
        super();
        this.isTauri = true;
        this.tauriInvoke = null;
        this.tauriListen = null;
        this.tauriGetCurrent = null;
        this._firstLogReceived = false;
    }

    /**
     * 獲取環境功能清單 (Tauri)
     */
    get capabilities() {
        return {
            hasTerminal: true,
            canClose: false,
            supportsAutoUpdate: true,
            supportsFirmwareReset: true,
            supportsEnvironmentCheck: true,
            supportsStableMode: true,
            supportsEraseFS: true
        };
    }

    /**
     * 初始化 Tauri 通訊與監聽器
     */
    async init() {
        try {
            // 動態導入 Tauri 2.0 API，確保在非 Tauri 環境下不會報錯
            const { invoke } = await import('@tauri-apps/api/core');
            const { listen } = await import('@tauri-apps/api/event');
            const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
            
            this.tauriInvoke = invoke;
            this.tauriListen = listen;
            this.tauriGetCurrent = getCurrentWebviewWindow;
            
            await this._setupTauriListeners();
            console.log('[Bridge] Tauri mode initialized');
            this._resolveReady();
        } catch (e) {
            console.error('[Bridge] Failed to load Tauri API:', e);
            this._resolveReady(); // 即使失敗也要 resolve 以免前端卡死
        }
    }

    /**
     * 處理 Tauri 指令分發
     */
    async send(command, data = {}) {
        await this.ready;
        if (!this.tauriInvoke) return;

        try {
            let result;
            switch (command) {
                case 'getManifest':
                    result = await this.tauriInvoke('get_manifest'); 
                    this._dispatchToFrontend({ command: 'manifestData', data: result, mediaUri: 'src', lang: 'zh-hant' });
                    break;

                case 'getModuleToolbox':
                    const toolboxPath = `${data.moduleId}/toolbox.xml`;
                    result = await this.tauriInvoke('get_module_toolbox', { path: toolboxPath });
                    if (data.requestId) {
                        this._dispatchToFrontend({ command: 'toolboxData', data: result, requestId: data.requestId });
                    }
                    break;

                case 'setPythonPath':
                    try {
                        const newPath = await this.tauriInvoke('pick_python_path');
                        if (newPath) {
                            localStorage.setItem('pythonPath', newPath);
                            const msg = (window.Blockly?.Msg['MSG_PYTHON_UPDATED'] || 'Python path updated to: %1').replace('%1', newPath);
                            this.alert(msg);
                        }
                    } catch (e) {
                        if (e !== 'Canceled') console.error('[Bridge] Failed to pick python path:', e);
                    }
                    break;

                case 'runCode':
                    try {
                        const pythonPath = localStorage.getItem('pythonPath') || 'python';
                        const lang = (window.Blockly && Blockly.Msg['BKY_LANG']) || 'zh-hant';
                        
                        if (data.platform === 'MicroPython') {
                            if (!data.serialPort) {
                                this.alert(window.Blockly?.Msg['MSG_SELECT_PORT'] || 'Please select a serial port first!');
                                return;
                            }
                            window.CocoyaUI.showLoadingModal(window.Blockly?.Msg['MSG_UPLOADING'] || 'Uploading code to MCU...');
                            
                            await this.tauriInvoke('deploy_mcu', {
                                pythonPath: pythonPath,
                                port: data.serialPort,
                                code: data.code,
                                serialUploadOnly: data.serialUploadOnly || false,
                                lang: lang
                            });
                            
                            window.CocoyaUI.hideLoadingModal();
                            window.CocoyaUI.flashButton('btn-run', '#75FB4C');
                        } else {
                            await this.tauriInvoke('run_python', { 
                                code: data.code, 
                                pythonPath: pythonPath 
                            });
                            window.CocoyaUI.flashButton('btn-run', '#75FB4C');
                        }
                    } catch (e) {
                        window.CocoyaUI.hideLoadingModal();
                        this.alert('Run failed: ' + e);
                    }
                    break;

                case 'stopCode':
                    await this.tauriInvoke('stop_python');
                    break;

                case 'openSerialMonitor':
                    try {
                        if (!data.serialPort) return;
                        const pythonPath = localStorage.getItem('pythonPath') || 'python';
                        const lang = (window.Blockly && Blockly.Msg['BKY_LANG']) || 'zh-hant';
                        if (window.CocoyaUI) {
                            window.CocoyaUI.toggleTerminal(true);
                            window.CocoyaUI.appendTerminal(`--- Opening Monitor: ${data.serialPort} ---`, 'info');
                        }
                        await this.tauriInvoke('open_serial_monitor', { 
                            port: data.serialPort,
                            pythonPath: pythonPath,
                            lang: lang
                        });
                    } catch (e) {
                        console.error('[Bridge] Failed to open monitor:', e);
                        const errLabel = window.Blockly?.Msg['MSG_MONITOR_FAILED'] || 'Failed to open monitor: ';
                        this.alert(errLabel + e);
                    }
                    break;

                case 'refreshSerialPorts':
                case 'getSerialPorts':
                    result = await this.tauriInvoke('get_serial_ports');
                    this._dispatchToFrontend({ command: 'serialPortsData', ports: result });
                    break;

                case 'deployMcu':
                    await this.tauriInvoke('deploy_mcu', {
                        pythonPath: localStorage.getItem('pythonPath') || 'python',
                        port: data.port,
                        code: data.code
                    });
                    this._dispatchToFrontend({ command: 'deployCompleted' });
                    break;

                case 'saveFile':
                case 'saveFileAs':
                    const isSaveAs = (command === 'saveFileAs');
                    try {
                        const filename = await this.tauriInvoke('save_file', { xml: data.xml, saveAs: isSaveAs });
                        this._dispatchToFrontend({ command: 'saveCompleted', filename: filename });
                    } catch (e) {
                        if (e !== 'Canceled') {
                            console.error('[Bridge] Save failed:', e);
                            this.alert((window.Blockly?.Msg['BKY_SAVE_FAILED'] || 'Save failed: ') + e);
                        }
                    }
                    break;

                case 'openFile':
                    try {
                        const res = await this.tauriInvoke('open_file');
                        this._dispatchToFrontend({ 
                            command: 'loadWorkspace', 
                            xml: res.xml, 
                            filename: res.filename, 
                            platform: res.platform,
                            is_read_only: res.is_read_only // 補上遺漏的唯讀旗標
                        });
                        if (res.backup_xml) {
                            this._dispatchToFrontend({ command: 'recoveryData', xml: res.backup_xml });
                        }
                    } catch (e) {
                        if (e !== 'Canceled') console.error('[Bridge] Open failed:', e);
                    }
                    break;

                case 'checkStartupBackup':
                    result = await this.tauriInvoke('check_startup_backup');
                    if (result) {
                        this._dispatchToFrontend({ command: 'recoveryData', xml: result });
                    }
                    break;

                case 'autoBackup':
                    await this.tauriInvoke('auto_backup', { xml: data.xml });
                    break;

                case 'clearBackup':
                    await this.tauriInvoke('clear_backup');
                    break;

                case 'rejectRecovery':
                    await this.tauriInvoke('reject_recovery');
                    break;

                case 'checkUpdate':
                    await this._handleCheckUpdate();
                    break;

                case 'openExternal':
                    try {
                        const { open } = await import('@tauri-apps/plugin-shell');
                        await open(data.url);
                    } catch (e) {
                        console.error('[Bridge] Failed to open external URL:', e);
                        window.open(data.url, '_blank');
                    }
                    break;

                case 'eraseFilesystem':
                    try {
                        this._firstLogReceived = true;
                        window.CocoyaUI.toggleTerminal(true);
                        const loadingMsg = window.Blockly?.Msg['MSG_ERASING_FS'] || 'Rebuilding filesystem... Please wait about 15 seconds.';
                        window.CocoyaUI.showLoadingModal(loadingMsg);
                        const pythonPath = localStorage.getItem('pythonPath') || 'python';
                        const lang = (window.Blockly && Blockly.Msg['BKY_LANG']) || 'zh-hant';
                        await this.tauriInvoke('erase_filesystem', { 
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
                    break;

                case 'confirmSwitch':
                    const { ask } = await import('@tauri-apps/plugin-dialog');
                    const ok = await ask(data.message, { title: 'Cocoya', kind: 'warning' });
                    if (ok) {
                        this._dispatchToFrontend({ command: 'switchPlatform', platform: data.newPlatform });
                    }
                    break;

                case 'setWindowTitle':
                    try {
                        const fullTitle = `Cocoya - ${data.title}`;
                        document.title = fullTitle;
                        await this.tauriInvoke('set_window_title', { title: fullTitle });
                    } catch (e) { console.warn('[Bridge] Failed to set window title via Rust:', e); }
                    break;

                case 'setDirty':
                    await this.tauriInvoke('set_dirty', { isDirty: data.isDirty });
                    break;

                case 'closeWindow':
                    await this.tauriInvoke('close_window');
                    break;

                case 'setupStableMode':
                    try {
                        window.CocoyaUI.showLoadingModal('Setting up stable mode...');
                        const lang = (window.Blockly && Blockly.Msg['BKY_LANG']) || 'zh-hant';
                        await this.tauriInvoke('setup_stable_mode', { port: data.serialPort, lang: lang });
                        window.CocoyaUI.hideLoadingModal();
                        this.alert('Stable mode enabled!');
                    } catch (e) {
                        window.CocoyaUI.hideLoadingModal();
                        this.alert('Setup failed: ' + e);
                    }
                    break;

                case 'resetFirmware':
                    try {
                        const loadingMsg = window.Blockly?.Msg['MSG_BURNING_FIRMWARE'] || 'Burning firmware... Please do not close the window.';
                        window.CocoyaUI.showLoadingModal(loadingMsg);
                        await this.tauriInvoke('reset_firmware', { model: data.model, shouldClear: data.shouldClear });
                        window.CocoyaUI.hideLoadingModal();
                        this.alert(window.Blockly?.Msg['MSG_FIRMWARE_BURN_SUCCESS'] || 'Burn success!');
                    } catch (e) {
                        window.CocoyaUI.hideLoadingModal();
                        throw e;
                    }
                    break;

                case 'alert':
                case 'confirm':
                case 'prompt':
                    await this._handleNativeDialogs(command, data);
                    break;

                case 'newFile':
                case 'createWindow':
                    await this.tauriInvoke('create_window');
                    break;

                case 'setLocale':
                    console.log('[Bridge] Locale sync ignored in Tauri mode');
                    break;

                case 'checkEnvironment':
                    try {
                        const pythonPath = localStorage.getItem('pythonPath') || 'python';
                        const results = await this.tauriInvoke('check_environment', { pythonPath: pythonPath });
                        this._dispatchToFrontend({ command: 'environmentStatus', results });
                    } catch (e) {
                        console.error('[Bridge] Check environment failed:', e);
                    }
                    break;

                case 'installModule':
                    try {
                        const pythonPath = localStorage.getItem('pythonPath') || 'python';
                        if (window.CocoyaUI) {
                            window.CocoyaUI.toggleTerminal(true);
                            window.CocoyaUI.appendTerminal(`--- Installing module: ${data.module} ---`, 'info');
                        }
                        this.tauriInvoke('run_python', { 
                            code: `import subprocess; import sys; subprocess.run(["${pythonPath}", "-m", "pip", "install", "${data.module}", "--user"])`,
                            pythonPath: pythonPath 
                        });
                    } catch (e) {
                        console.error('[Bridge] Failed to start installation:', e);
                    }
                    break;

                default:
                    console.warn(`[Bridge] Command "${command}" not handled in Tauri mode`);
                    break;
            }
        } catch (e) {
            console.error(`[Bridge] Error processing command "${command}":`, e);
            if (command === 'resetFirmware') {
                this.alert((window.Blockly?.Msg['MSG_FIRMWARE_BURN_FAILED'] || 'Failed: ') + e);
            }
        }
    }

    // --- Tauri 專屬私有方法 ---

    async _setupTauriListeners() {
        if (!this.tauriListen || !this.tauriGetCurrent) return;

        try {
            const appWindow = this.tauriGetCurrent();
            
            // 監聽後端發來的「要關了」請求 (由 Rust 攔截 X 按鈕觸發)
            await appWindow.listen('closeRequested', () => {
                this._handleCloseDialog(appWindow);
            });

            // 監聽日誌
            await appWindow.listen('python-log', (event) => {
                if (!this._firstLogReceived) {
                    this._firstLogReceived = true;
                    if (window.CocoyaUI) window.CocoyaUI.hideLoadingModal();
                }
                if (window.CocoyaUI) window.CocoyaUI.appendTerminal(event.payload, 'out');
            });

            await appWindow.listen('python-error', (event) => {
                this._firstLogReceived = true;
                if (window.CocoyaUI) window.CocoyaUI.hideLoadingModal();
                if (window.CocoyaUI) window.CocoyaUI.appendTerminal(event.payload, 'err');
            });
        } catch (e) {
            console.error('[Bridge] Failed to setup Tauri listeners:', e);
        }
    }

    async _handleCloseDialog(appWindow) {
        try {
            const app = window.CocoyaApp;
            const confirmMsg = (window.Blockly && Blockly.Msg['MSG_SAVE_CONFIRM']) || 'Do you want to save changes?';
            
            if (window.CocoyaUI && window.CocoyaUI.showSaveConfirm) {
                const choice = await window.CocoyaUI.showSaveConfirm(confirmMsg);

                if (choice === 'save') {
                    // 準備 XML
                    const dom = Blockly.Xml.workspaceToDom(app.workspace);
                    dom.setAttribute('platform', app.currentPlatform);
                    const xml = Blockly.Xml.domToPrettyText(dom);
                    
                    try {
                        // 1. 執行存檔 (若為唯讀則強制另存新檔)
                        const isReadOnly = !!app.isReadOnly;
                        const filename = await this.tauriInvoke('save_file', { xml, saveAs: isReadOnly });
                        
                        if (filename) {
                            // 2. 存檔成功
                            await app.onSaveCompleted(filename); 
                            // 3. 要求後端關閉視窗
                            await this.tauriInvoke('close_window'); 
                        }
                    } catch (e) {
                        // 處理取消與失敗
                        if (e === 'Canceled') {
                            // 使用者在系統對話框案取消，不做任何事，讓視窗維持開啟並保持 isDirty=true
                            console.log('[Bridge] Save canceled by user.');
                        } else {
                            // 真正的儲存錯誤（如權限、磁碟滿）
                            this.alert((window.Blockly?.Msg['BKY_SAVE_FAILED'] || 'Save failed: ') + e);
                        }
                    }
                } else if (choice === 'discard') {
                    // 強制不儲存：直接清除狀態並要求關閉
                    await app.setDirty(false);
                    await this.tauriInvoke('close_window');
                }
            } else {
                // Fallback for simple alert
                const { ask } = await import('@tauri-apps/plugin-dialog');
                const ok = await ask(confirmMsg, { title: 'Cocoya', kind: 'warning' });
                if (ok) {
                    // 這裡簡化處理，如果不支援 showSaveConfirm 則僅問是否要關閉 (可能遺失未存檔)
                    app.setDirty(false);
                    await this.tauriInvoke('close_window');
                }
            }
        } catch (err) {
            console.error('[Bridge] Error in _handleCloseDialog:', err);
            await this.tauriInvoke('close_window');
        }
    }

    async _handleCheckUpdate() {
        try {
            const currentVersion = await this.tauriInvoke('get_version').catch(() => '0.7.5');
            const GITHUB_REPO_API = "https://api.github.com/repos/simfonia/Cocoya/releases/latest";
            const DOWNLOAD_URL = "https://github.com/simfonia/Cocoya/releases";

            const res = await fetch(GITHUB_REPO_API);
            if (!res.ok) throw new Error('Network response was not ok');
            const release = await res.json();
            const latestVersion = release.tag_name.replace('v', '');

            const cParts = currentVersion.split(/[.-]/).map(v => parseInt(v) || 0);
            const lParts = latestVersion.split(/[.-]/).map(v => parseInt(v) || 0);
            
            let hasUpdate = false;
            for (let i = 0; i < 3; i++) {
                const l = lParts[i] || 0;
                const c = cParts[i] || 0;
                if (l > c) { hasUpdate = true; break; }
                if (l < c) { hasUpdate = false; break; }
            }

            if (window.CocoyaUI) {
                window.CocoyaUI.setUpdateStatus({ hasUpdate, currentVersion, latestVersion, url: DOWNLOAD_URL });
            }
        } catch (e) {
            console.error('[Bridge] Check update failed:', e);
            if (window.CocoyaUI) {
                const current = await this.tauriInvoke('get_version').catch(() => '0.7.5');
                window.CocoyaUI.setUpdateStatus({ hasUpdate: false, currentVersion: current, latestVersion: current, url: '' });
            }
        }
    }

    async _handleNativeDialogs(command, data) {
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

    // 覆寫父類別方法以使用 Tauri 特有的 UI
    async pickMcuModel(options) {
        const requestId = 'pick_' + Date.now();
        return new Promise((resolve) => {
            const handler = (msg) => {
                if (msg.command === 'promptResponse' && msg.requestId === requestId) {
                    this.offMessage(handler);
                    resolve(msg.result);
                }
            };
            this.onMessage(handler);

            const title = window.Blockly?.Msg['MSG_SELECT_MCU_MODEL'] || 'Select MCU Model';
            window.CocoyaUI.showQuickPick(title, options, (selectedId) => {
                this._dispatchToFrontend({ 
                    command: 'promptResponse', 
                    requestId: requestId, 
                    result: selectedId 
                });
            });
        });
    }
}
