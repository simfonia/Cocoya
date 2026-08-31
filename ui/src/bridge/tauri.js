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
        this._isClosing = false;
        this._datasetUploadChain = Promise.resolve();
        this._anchor = null; // { isAnchored, projectRoot } 由 init() 從後端取得
    }

    /**
     * 獲取環境功能清單 (Tauri)
     */
    get capabilities() {
        return {
            hasTerminal: true,
            canClose: true,
            supportsAutoUpdate: true,
            supportsFirmwareReset: true,
            supportsEnvironmentCheck: true,
            supportsStableMode: false,
            supportsEraseFS: false,
            isTauri: true,
            isRemoteAware: true, // Tauri 亦保留雲端/SSH 擴充可能性
            isAnchored: !!(this._anchor && this._anchor.isAnchored),
            projectRoot: (this._anchor && this._anchor.projectRoot) || null
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
            
            // 取得專案根錨定狀態（供 Startup Home / Dataset Manager 查詢）
            try {
                this._anchor = this._normalizeAnchor(await this.tauriInvoke('get_project_anchor'));
            } catch (e) {
                console.error('[Bridge] Failed to get project anchor:', e);
                this._anchor = null;
            }
            
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

                case 'reloadWebview':
                    // 主題/語系切換：Tauri 無 host HTML 管理，直接重載頁面
                    location.reload();
                    result = true;
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
                    // 順帶中斷遠端訓練（若無進行中訓練，sidecar 回「目前沒有」僅靜默）
                    this._handleDatasetCommand('stopTraining', {}, null).catch(() => {});
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
                    {
                        const isSaveAs = (command === 'saveFileAs');
                        const xml = data.xml || this._getCurrentXml();
                        try {
                            const filename = await this.tauriInvoke('save_file', { xml, saveAs: isSaveAs });
                            this._dispatchToFrontend({ command: 'saveCompleted', filename: filename, tag: data.tag });
                            await this._refreshAnchor(); // 存檔後同步前端錨定（首檔另存即錨定）
                            return true;
                        } catch (e) {
                            if (e === 'EXAMPLES_PATH') {
                                // 要寫入 examples 目錄，顯示警告對話框
                                await this._handleExamplesSaveDialog(xml);
                            } else if (e !== 'Canceled') {
                                console.error('[Bridge] Save failed:', e);
                                this.alert((window.Blockly?.Msg['BKY_SAVE_FAILED'] || 'Save failed: ') + e);
                            }
                            return false;
                        }
                    }

                case 'openFile':
                    if (!(await this._confirmSaveBeforeOpen(data))) return;
                    try {
                        const res = await this.tauriInvoke('open_file');
                        this._dispatchToFrontend({ 
                            command: 'loadWorkspace', 
                            xml: res.xml, 
                            filename: res.filename, 
                            platform: res.platform,
                            is_read_only: res.is_read_only // 補上遺漏的唯讀旗標
                        });
                        await this._refreshAnchor(); // 開檔後同步前端錨定（後端 current_paths 已更新）
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

                case 'openHelp':
                    try {
                        await this.tauriInvoke('open_help', { helpId: data.helpId });
                    } catch (e) {
                        console.error('[Bridge] Failed to open help:', e);
                    }
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

                case 'closeEditor':
                    // toolbar 的「關閉編輯器」：與右上角 X 走相同 dirty 檢查與存檔確認流程
                    if (this._appWindow) await this._handleCloseDialog(this._appWindow);
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
                        await this.tauriInvoke('reset_firmware', {
                            model: data.model,
                            shouldClear: data.shouldClear,
                            serialPort: data.serialPort || ''
                        });
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

                case 'openExamples':
                    if (!(await this._confirmSaveBeforeOpen(data))) return;
                    try {
                        const res = await this.tauriInvoke('open_examples');
                        this._dispatchToFrontend({ 
                            command: 'loadWorkspace', 
                            xml: res.xml, 
                            filename: res.filename, 
                            platform: res.platform 
                        });
                    } catch (e) {
                        if (e !== 'Canceled') console.error('[Bridge] Open examples failed:', e);
                    }
                    break;

                case 'openDatasetManager':
                    // 前端已有 CocoyaDataset 模組，直接 dispatch
                    this._dispatchToFrontend({ command: 'openDatasetManager' });
                    break;

                case 'startRemoteTraining': {
                    // 遠端訓練（D4）：重用 sidecar trainRemote（同步 -> Docker 遠端訓練 -> 下載 .keras/labels）
                    // 前端自行解析參數（Tauri 無 host 層 handler），路徑以最新專案錨定為基準
                    let projectRoot = (this._anchor && this._anchor.projectRoot) || null;
                    if (!projectRoot) {
                        try {
                            // 鐵律：get_project_anchor 回傳需經 _normalizeAnchor（snake/camel 雙保險，AGENTS.md serde 坑）
                            const anchor = this._normalizeAnchor(await this.tauriInvoke('get_project_anchor'));
                            projectRoot = (anchor && anchor.projectRoot) || null;
                            if (anchor) this._anchor = anchor;
                        } catch (e) { /* 未錨定 */ }
                    }
                    const pickRt = (re, d) => { const m = (data.code || '').match(re); return m ? m[1] : d; };
                    let dsDir = data.datasetDir || '';
                    if (dsDir && projectRoot && !/^[A-Za-z]:[\\/]/.test(dsDir) && !dsDir.startsWith('/')) {
                        dsDir = projectRoot.replace(/[\\/]+$/, '') + '/' + dsDir;
                    }
                    const projName = (dsDir || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'training_project';
                    const taskRt = pickRt(/task_type='([^']+)'/, 'classifier');
                    const remotePayload = {
                        host: data.sshConfig?.host,
                        port: data.sshConfig?.port || 22,
                        username: data.sshConfig?.username,
                        password: data.sshConfig?.password,
                        localDatasetDir: dsDir,
                        projectName: projName,
                        syncMode: data.syncMode || 'smart',
                        hyperparams: {
                            epochs: parseInt(pickRt(/epochs=(\d+)/, '30'), 10) || 30,
                            batchSize: parseInt(pickRt(/batch_size=(\d+)/, '32'), 10) || 32,
                            learningRate: parseFloat(pickRt(/learning_rate=([\d.]+)/, '0.001')) || 0.001,
                            validationSplit: parseFloat(pickRt(/validation_split=([\d.]+)/, '0.2')) || 0.2,
                            dropout: parseFloat(pickRt(/dropout=([\d.]+)/, '0.2')) || 0.2,
                            augmentation: pickRt(/augmentation=(True|False)/, 'False') === 'True' ? 'true' : 'false',
                            backbone: pickRt(/backbone='([^']+)'/, 'mobilenetv2'),
                            optimizer: pickRt(/optimizer='([^']+)'/, 'adam'),
                            dnnLayers: pickRt(/dnn_layers='([^']+)'/, '128,64'),
                            fineTune: pickRt(/fine_tune=(True|False)/, 'False') === 'True' ? 'true' : 'false',
                            modelOutput: pickRt(/model_output='([^']+)'/, 'none'),
                            taskType: taskRt
                        },
                        outputDir: (projectRoot ? projectRoot.replace(/[\\/]+$/, '') + '/model/' + projName : 'model/' + projName),
                        dockerImage: 'cocoya-train-' + (taskRt === 'detector' ? 'detector' : 'classifier')
                    };
                    await this._handleDatasetCommand('trainRemote', remotePayload, (response) => {
                        this._dispatchToFrontend({
                            command: response.success ? 'trainingComplete' : 'trainingError',
                            success: !!response.success,
                            modelDir: response.modelDir,
                            projectName: response.projectName,
                            modelOutput: response.modelOutput,
                            reportPath: response.reportPath,
                            kerasPath: response.kerasPath,
                            curvePath: response.curvePath,
                            historyPath: response.historyPath,
                            error: response.error
                        });
                    }, { timeoutSecs: 3600 });
                    break;
                }

                case 'stopRemoteTraining':
                    // 中斷遠端訓練（sidecar 端 docker rm -f 訓練容器）
                    await this._handleDatasetCommand('stopTraining', {}, (response) => {
                        if (!response.success && window.CocoyaUI?.appendTerminal) {
                            window.CocoyaUI.appendTerminal('[Remote] ' + (response.error || '中斷失敗'), 'err');
                        }
                    });
                    break;

                case 'openFolder':
                    try {
                        await this.tauriInvoke('open_folder', { path: data.path || data.folderPath || '' });
                    } catch (e) {
                        console.error('[Bridge] openFolder failed:', e);
                    }
                    break;

                case 'datasetListCameras':
                    await this._handleDatasetCommand('listCameras', data, (response) => {
                        this._dispatchToFrontend({
                            command: 'datasetCameraListResult',
                            success: response.success,
                            cameras: response.cameras || []
                        });
                    });
                    break;

                case 'datasetStartCamera':
                    await this._handleDatasetCommand('startCamera', data, (response) => {
                        this._dispatchToFrontend({
                            command: 'datasetCameraStatus',
                            success: response.success
                        });
                    });
                    break;

                case 'datasetStopCamera':
                    await this._handleDatasetCommand('stopCamera', data, (response) => {
                        // 停止成功後，攝影機不在 running 狀態，故 success: false
                        this._dispatchToFrontend({
                            command: 'datasetCameraStatus',
                            success: false
                        });
                    });
                    break;

                case 'datasetCaptureImage':
                    {
                        // live 影像落盤：動態取得最新專案根（_anchor 是 init 時快照，開啟專案後會過期）
                        // 依 `projectRoot/dataset/<專案>/<標籤>/` 生成 savePath（對齊 VSIX 慣例）。
                        // 未錨定（無專案根）則不落盤（diskPath 為 null）。
                        if (!data.savePath) {
                            let projectRoot = this._anchor && this._anchor.projectRoot;
                            if (!projectRoot) {
                                try {
                                    const anchor = this._normalizeAnchor(await this.tauriInvoke('get_project_anchor'));
                                    projectRoot = anchor && anchor.projectRoot;
                                    this._anchor = anchor;
                                } catch (e) { projectRoot = null; }
                            }
                            if (projectRoot) {
                                const project = data.projectName || 'dataset';
                                const label = data.label || 'unlabeled';
                                const stamp = Date.now();
                                data.savePath = `${projectRoot}/dataset/${project}/${label}/${label}_${stamp}.jpg`;
                            }
                            console.log('[Capture] projectRoot =', projectRoot, '-> generated savePath =', data.savePath);
                        }
                    }
                    await this._handleDatasetCommand('captureImage', data, (response) => {
                        console.log('[Capture] sidecar response savePath =', response.savePath);
                        this._dispatchToFrontend({
                            command: 'datasetCaptureResult',
                            requestId: data.requestId,
                            success: response.success,
                            base64: response.base64 || null,
                            width: response.width || 0,
                            height: response.height || 0,
                            label: response.label || data.label,
                            savePath: response.savePath || null,
                            error: response.error
                        });
                    });
                    break;

                case 'datasetDeleteImage':
                    try {
                        await this.tauriInvoke('delete_file', { path: data.filePath });
                        this._dispatchToFrontend({ command: 'datasetDeleteImageResult', success: true });
                    } catch (e) {
                        console.error('[Bridge] Delete image failed:', e);
                        this._dispatchToFrontend({ command: 'datasetDeleteImageResult', success: false, error: String(e) });
                    }
                    break;

                case 'pickFolder':
                    try {
                        const result = await this.tauriInvoke('pick_folder');
                        const { convertFileSrc } = await import('@tauri-apps/api/core');
                        const images = (result.images || []).map(img => ({
                            name: img.name,
                            path: img.path,
                            label: img.label,
                            blobUrl: convertFileSrc(img.blobUrl)
                        }));
                        this._dispatchToFrontend({
                            command: 'folderSelected',
                            requestId: data.requestId,
                            path: result.path,
                            images: images,
                            labelCounts: result.labelCounts,
                            labelMap: result.labelMap
                        });
                    } catch (e) {
                        if (e === 'Canceled') {
                            this._dispatchToFrontend({
                                command: 'folderSelected',
                                requestId: data.requestId,
                                error: '使用者取消選擇'
                            });
                        } else {
                            console.error('[Bridge] Pick folder failed:', e);
                            this._dispatchToFrontend({
                                command: 'folderSelected',
                                requestId: data.requestId,
                                error: String(e)
                            });
                        }
                    }
                    break;

                case 'datasetExport':
                    try {
                        const pythonPath = localStorage.getItem('pythonPath') || 'python';
                        const result = await this.tauriInvoke('export_dataset', {
                            specJson: JSON.stringify(data.spec),
                            sourceFolderPath: data.sourceFolderPath || '',
                            pythonPath: pythonPath
                        });
                        this._dispatchToFrontend({
                            command: 'datasetExportResult',
                            success: true,
                            path: result
                        });
                    } catch (e) {
                        if (e === 'Canceled') {
                            // 使用者取消存檔對話框，靜默處理
                        } else {
                            console.error('[Bridge] Export dataset failed:', e);
                            this._dispatchToFrontend({
                                command: 'datasetExportResult',
                                success: false,
                                error: String(e)
                            });
                        }
                    }
                    break;

                case 'datasetUploadArchive':
                    {
                        const uploadTask = async () => {
                            try {
                                const localZipPath = await this.tauriInvoke('dataset_upload_chunk', {
                                    fileId: data.fileId,
                                    chunkIndex: data.chunkIndex,
                                    totalChunks: data.totalChunks,
                                    zipDataChunk: data.zipDataChunk,
                                    projectName: data.projectName || 'dataset',
                                    isLast: !!data.isLast
                                });
                                if (!localZipPath) return;

                                const uploadPayload = Object.assign({}, data, { localZipPath });
                                delete uploadPayload.zipDataChunk;
                                delete uploadPayload.chunkIndex;
                                delete uploadPayload.totalChunks;
                                delete uploadPayload.isLast;
                                await this._handleDatasetCommand('uploadDataset', uploadPayload, (response) => {
                                    this._dispatchToFrontend({
                                        command: 'datasetUploadResult',
                                        success: !!response.success,
                                        error: response.error
                                    });
                                });
                            } catch (e) {
                                console.error('[Bridge] Dataset upload failed:', e);
                                this._dispatchToFrontend({
                                    command: 'datasetUploadResult',
                                    success: false,
                                    error: String(e)
                                });
                            }
                        };
                        this._datasetUploadChain = this._datasetUploadChain.then(uploadTask, uploadTask);
                        await this._datasetUploadChain;
                    }
                    break;

                case 'datasetSaveProgress':
                    try {
                        // 依「專案根 SSOT」動態取得最新專案根（與 M4c captureImage 同策略）
                        let projectRoot = this._anchor && this._anchor.projectRoot;
                        if (!projectRoot) {
                            try {
                                const anchor = this._normalizeAnchor(await this.tauriInvoke('get_project_anchor'));
                                projectRoot = anchor && anchor.projectRoot;
                                this._anchor = anchor;
                            } catch (e) { projectRoot = null; }
                        }
                        if (!projectRoot) {
                            this._dispatchToFrontend({
                                command: 'datasetSaveProgressResult',
                                success: false,
                                errorCode: 'PROJECT_ROOT_REQUIRED',
                                error: '未錨定專案，請先開新或開啟一個 .xml 專案後再儲存進度'
                            });
                            break;
                        }
                        const savedPath = await this.tauriInvoke('dataset_save_progress', {
                            folderPath: projectRoot,
                            projectName: data.projectName || 'dataset',
                            specJson: JSON.stringify(data.spec)
                        });
                        console.log('[Bridge] Saved dataset progress to', savedPath);
                        this._dispatchToFrontend({ command: 'datasetSaveProgressResult', success: true, path: savedPath });
                    } catch (e) {
                        console.error('[Bridge] Save progress failed:', e);
                        // 後端錯誤字串以 "CODE: message" 前綴回傳，解析為穩定 errorCode
                        const errStr = String(e || '');
                        const codeMatch = errStr.match(/^([A-Z][A-Z0-9_]*):/);
                        this._dispatchToFrontend({
                            command: 'datasetSaveProgressResult',
                            success: false,
                            errorCode: codeMatch ? codeMatch[1] : 'IO_ERROR',
                            error: errStr
                        });
                    }
                    break;

                case 'getProjectAnchor':
                    try {
                        const anchorNow = this._normalizeAnchor(await this.tauriInvoke('get_project_anchor'));
                        this._anchor = anchorNow; // 順便刷新快照
                        this._dispatchToFrontend({
                            command: 'projectAnchorResult',
                            requestId: data.requestId,
                            isAnchored: anchorNow.isAnchored,
                            projectRoot: anchorNow.projectRoot
                        });
                    } catch (e) {
                        console.error('[Bridge] getProjectAnchor failed:', e);
                        this._dispatchToFrontend({
                            command: 'projectAnchorResult',
                            requestId: data.requestId,
                            isAnchored: false,
                            projectRoot: null
                        });
                    }
                    break;

                case 'datasetImportFromFolder':
                    try {
                        const importResult = await this.tauriInvoke('dataset_import_from_folder', {
                            sourcePath: data.sourcePath,
                            projectName: data.projectName,
                            confirmed: !!data.confirmed
                        });
                        // 與 pickFolder 同規範：Rust 回傳原始絕對路徑，必須轉 asset protocol URL 才能在 webview 顯示
                        const { convertFileSrc } = await import('@tauri-apps/api/core');
                        const importImagesConverted = (importResult.images || []).map(img => ({
                            name: img.name,
                            path: img.path,
                            label: img.label,
                            blobUrl: convertFileSrc(img.blobUrl)
                        }));
                        this._dispatchToFrontend({
                            command: 'datasetImportFromFolderResult',
                            requestId: data.requestId,
                            action: importResult.action,
                            path: importResult.path || null,
                            canonicalDir: importResult.canonicalDir,
                            copiedFiles: importResult.copiedFiles || null,
                            images: importImagesConverted,
                            labelCounts: importResult.labelCounts || {},
                            labelMap: importResult.labelMap || {}
                        });
                    } catch (e) {
                        console.error('[Bridge] Dataset import from folder failed:', e);
                        const errStr = String(e || '');
                        const codeMatch = errStr.match(/^([A-Z][A-Z0-9_]*):/);
                        this._dispatchToFrontend({
                            command: 'datasetImportFromFolderResult',
                            requestId: data.requestId,
                            errorCode: codeMatch ? codeMatch[1] : 'IO_ERROR',
                            error: errStr
                        });
                    }
                    break;

                case 'datasetLoadProgress':
                    try {
                        const result = await this.tauriInvoke('dataset_load_progress', { folderPath: data.folderPath });
                        this._dispatchToFrontend({
                            command: 'datasetLoadProgressResult',
                            success: true,
                            hasProgress: result.hasProgress,
                            spec: result.spec || null,
                            path: result.path,
                            errorCode: result.errorCode || undefined
                        });
                    } catch (e) {
                        console.error('[Bridge] Load progress failed:', e);
                        const errStr = String(e || '');
                        const codeMatch = errStr.match(/^([A-Z][A-Z0-9_]*):/);
                        this._dispatchToFrontend({
                            command: 'datasetLoadProgressResult',
                            success: false,
                            errorCode: codeMatch ? codeMatch[1] : 'IO_ERROR',
                            error: errStr
                        });
                    }
                    break;

                case 'openTrainingReport':
                    try {
                        await this.tauriInvoke('open_report', { reportPath: data.path });
                    } catch (e) {
                        console.error('[Bridge] open_report failed:', e);
                        this.alert(`開啟失敗，請手動開啟檔案：\n${data.path}\n\n錯誤：${e}`);
                    }
                    break;

                case 'openLatestTrainingReport':
                    try {
                        const reports = await this.tauriInvoke('find_latest_training_report');
                        if (!reports || reports.length === 0) {
                            this.alert('尚無訓練結果，請先執行訓練。');
                            break;
                        }
                        if (reports.length === 1) {
                            await this.tauriInvoke('open_report', { reportPath: reports[0].path });
                        } else {
                            // 多個報告：顯示 QuickPick 讓使用者選擇
                            const options = reports.map(r => ({
                                id: r.path,
                                label: r.projectName
                            }));
                            window.CocoyaUI.showQuickPick(
                                `找到 ${reports.length} 個訓練報告，請選擇要開啟的項目：`,
                                options,
                                (selectedPath) => {
                                    if (selectedPath) {
                                        this.tauriInvoke('open_report', { reportPath: selectedPath })
                                            .catch(e => this.alert(`開啟失敗：${e}`));
                                    }
                                }
                            );
                        }
                    } catch (e) {
                        console.error('[Bridge] find_latest_training_report failed:', e);
                        this.alert('搜尋訓練報告失敗：' + e);
                    }
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
                        const data = await this.tauriInvoke('check_environment', { pythonPath: pythonPath });
                        console.log('[Bridge] check_environment returned:', data);
                        this._dispatchToFrontend({ command: 'environmentStatus', ...data });
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
            this._appWindow = appWindow; // 供 closeEditor（toolbar 關閉）復用同一關閉流程
            
            // 監聽後端發來的「要關了」請求 (由 Rust 攔截 X 按鈕觸發)
            await appWindow.listen('closeRequested', () => {
                this._handleCloseDialog(appWindow);
            });

            // 視窗焦點/失焦偵測（方案 B：多視窗自動交接串列埠監控）。
            // document blur 於視窗層級失焦時觸發（切換到別的 Cocoya 視窗/其他應用），
            // 呼叫後端釋放（blur）或重取（focus）monitor。
            const doc = window.document;
            if (doc && this.tauriInvoke) {
                doc.addEventListener('blur', () => {
                    if (this.tauriInvoke) {
                        this.tauriInvoke('set_window_focus', { focused: false }).catch(() => {});
                    }
                });
                doc.addEventListener('focus', () => {
                    if (this.tauriInvoke) {
                        this.tauriInvoke('set_window_focus', { focused: true }).catch(() => {});
                    }
                });
            }

            // 監聽日誌
            await appWindow.listen('python-log', (event) => {
                if (!this._firstLogReceived) {
                    this._firstLogReceived = true;
                    if (window.CocoyaUI) window.CocoyaUI.hideLoadingModal();
                }
                if (window.CocoyaUI) window.CocoyaUI.appendTerminal(event.payload, 'out');

                // 解析訓練結果 RESULT: {...} 格式（由 classifier_train.py 輸出）
                // 注意：輸出可能以 \n 開頭，需用 includes + indexOf 定位
                const text = event.payload || '';
                const resultIdx = text.indexOf('RESULT:');
                if (resultIdx !== -1) {
                    try {
                        const result = JSON.parse(text.substring(resultIdx + 7).trim());
                        console.log('[Bridge] Training result detected:', result);
                        this._dispatchToFrontend({ command: 'trainingComplete', ...result });
                    } catch (e) {
                        console.warn('[Bridge] Failed to parse training result:', e);
                    }
                }
            });

            await appWindow.listen('python-error', (event) => {
                this._firstLogReceived = true;
                if (window.CocoyaUI) window.CocoyaUI.hideLoadingModal();
                if (window.CocoyaUI) window.CocoyaUI.appendTerminal(event.payload, 'err');
            });

            // 監聽 sidecar 事件（如 cameraStatus 變化）
            await appWindow.listen('sidecar-event', (event) => {
                try {
                    const payload = typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload);
                    const parsed = JSON.parse(payload);
                    // 將 sidecar event 轉為前端可理解的格式
                    if (parsed.type === 'event' && parsed.event) {
                        // D4 遠端訓練日誌：保留原名轉發（base.js onTrainingLog / trainingError 監聽）
                        // 注意：sidecar send_event 把 message 放在頂層（{type,event,message}），非 data 子物件
                        if (parsed.event === 'trainingLog') {
                            this._dispatchToFrontend({
                                command: 'trainingLog',
                                message: parsed.message || (parsed.data && parsed.data.message) || ''
                            });
                            return;
                        }
                        const command = 'dataset' + parsed.event.charAt(0).toUpperCase() + parsed.event.slice(1);
                        this._dispatchToFrontend({
                            command,
                            success: parsed.running !== undefined ? parsed.running : true,
                            ...parsed
                        });
                    }
                } catch (e) {
                    console.warn('[Bridge] Failed to parse sidecar event:', e);
                }
            });
        } catch (e) {
            console.error('[Bridge] Failed to setup Tauri listeners:', e);
        }
    }

    async _handleCloseDialog(appWindow) {
        if (this._isClosing) return;
        this._isClosing = true;

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
                            // 3. 確保後端 dirty 狀態已更新，再要求關閉視窗
                            await this.tauriInvoke('set_dirty', { isDirty: false });
                            await this.tauriInvoke('close_window'); 
                        }
                    } catch (e) {
                        // 處理取消與失敗
                        if (e === 'EXAMPLES_PATH') {
                            // 目標是內建範例目錄：跳出範例警示（覆蓋/另存）
                            // 完成（覆蓋成功或另存成功）才關閉；若使用者取消則維持視窗回到原作業
                            const done = await this._handleExamplesSaveDialog(xml);
                            if (done) {
                                await this.tauriInvoke('set_dirty', { isDirty: false });
                                await this.tauriInvoke('close_window');
                            } else {
                                console.log('[Bridge] Close canceled after examples dialog (user aborted).');
                            }
                        } else if (e === 'Canceled') {
                            // 使用者在系統對話框案取消，不做任何事，讓視窗維持開啟並保持 isDirty=true
                            console.log('[Bridge] Save canceled by user.');
                        } else {
                            // 真正的儲存錯誤（如權限、磁碟滿）
                            this.alert((window.Blockly?.Msg['BKY_SAVE_FAILED'] || 'Save failed: ') + e);
                        }
                    }
                } else if (choice === 'discard') {
                    // 強制不儲存：先同步 dirty 狀態後再關閉
                    await app.setDirty(false);
                    await this.tauriInvoke('set_dirty', { isDirty: false });
                    await this.tauriInvoke('close_window');
                }
            } else {
                // Fallback for simple alert
                const { ask } = await import('@tauri-apps/plugin-dialog');
                const ok = await ask(confirmMsg, { title: 'Cocoya', kind: 'warning' });
                if (ok) {
                    // 這裡簡化處理，如果不支援 showSaveConfirm 則僅問是否要關閉 (可能遺失未存檔)
                    await app.setDirty(false);
                    await this.tauriInvoke('set_dirty', { isDirty: false });
                    await this.tauriInvoke('close_window');
                }
            }
        } catch (err) {
            console.error('[Bridge] Error in _handleCloseDialog:', err);
            await this.tauriInvoke('close_window');
        } finally {
            this._isClosing = false;
        }
    }

    async _handleDatasetCommand(sidecarCommand, data, callback, opts) {
        try {
            // 1. 確保 sidecar 已啟動（使用輕量 ping 健康檢查 + 狀態快取）
            const pythonPath = localStorage.getItem('pythonPath') || 'python';
            let sidecarReady = false;

            // 快取狀態：若已知 sidecar 啟動中，先嘗試 ping（輕量，不遍歷攝影機）
            try {
                await this.tauriInvoke('sidecar_send', {
                    command: 'ping',
                    payload: '{}'
                });
                sidecarReady = true;
            } catch (e) {
                // sidecar 未啟動或已死，啟動它
                console.log('[Bridge] Sidecar not running, starting...');
                await this.tauriInvoke('start_sidecar', { pythonPath });
                // 等待 sidecar 啟動
                await new Promise(r => setTimeout(r, 1000));
                sidecarReady = true;
            }

            if (!sidecarReady) {
                if (callback) callback({ success: false, error: 'Sidecar failed to start' });
                return;
            }

            // 2. 發送實際指令到 sidecar（長時任務如 trainRemote 可指定 timeoutSecs）
            const payload = JSON.stringify(data);
            const raw = await this.tauriInvoke('sidecar_send', {
                command: sidecarCommand,
                payload,
                timeoutSecs: (opts && opts.timeoutSecs) || undefined
            });

            // 3. 解析回應
            const response = JSON.parse(raw);
            if (response.type === 'response' && callback) {
                callback(response);
            } else if (response.type === 'error') {
                console.error('[Bridge] Sidecar error:', response.error);
                if (callback) callback({ success: false, error: response.error });
            } else {
                if (callback) callback(response);
            }
        } catch (e) {
            console.error(`[Bridge] Dataset command "${sidecarCommand}" failed:`, e);
            if (callback) callback({ success: false, error: String(e) });
        }
    }

    async _handleCheckUpdate() {
        try {
            const currentVersion = await this.tauriInvoke('get_version').catch(() => '0.8.0');
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
                const current = await this.tauriInvoke('get_version').catch(() => '0.8.0');
                window.CocoyaUI.setUpdateStatus({ hasUpdate: false, currentVersion: current, latestVersion: current, url: '' });
            }
        }
    }

    async _confirmSaveBeforeOpen(data) {
        if (!data.isDirty) return true;

        const confirmMsg = (window.Blockly && Blockly.Msg['MSG_SAVE_CONFIRM']) || 'Do you want to save changes to the current project?';
        let choice = 'cancel';
        if (window.CocoyaUI && window.CocoyaUI.showSaveConfirm) {
            choice = await window.CocoyaUI.showSaveConfirm(confirmMsg);
        }

        if (choice === 'cancel') return false;
        if (choice === 'save') {
            const xml = data.xml || this._getCurrentXml();
            const saved = await this.send('saveFile', { xml });
            return saved === true;
        }
        return true; // discard
    }

    async _handleNativeDialogs(command, data) {
        const { ask, message } = await import('@tauri-apps/plugin-dialog');
        
        if (command === 'alert') {
            await message(data.message, { title: 'Cocoya', kind: 'info' });
            this._dispatchToFrontend({ 
                command: 'promptResponse', 
                requestId: data.requestId, 
                result: null 
            });
        } else if (command === 'confirm') {
            const okLabel = (window.Blockly && (Blockly.Msg['MSG_OK'] || Blockly.Msg['MSG_SAVE'])) || 'OK';
            const cancelLabel = (window.Blockly && Blockly.Msg['MSG_CANCEL']) || 'Cancel';
            const ok = await ask(data.message, { title: 'Cocoya', kind: 'warning', okLabel, cancelLabel });
            this._dispatchToFrontend({ 
                command: 'promptResponse', 
                requestId: data.requestId, 
                result: ok 
            });
        } else if (command === 'prompt') {
            // Tauri 2.0 沒有內建的 input dialog，使用自定義 HTML 對話框
            const value = await this._showPromptDialog(data.message, data.defaultValue || '');
            this._dispatchToFrontend({ 
                command: 'promptResponse', 
                requestId: data.requestId, 
                result: value 
            });
        }
    }
    
    /**
     * 自定義 prompt 對話框（Tauri 2.0 沒有內建 input dialog）
     */
    async _showPromptDialog(message, defaultValue) {
        return new Promise((resolve) => {
            // 建立對話框 HTML
            const dialog = document.createElement('div');
            dialog.className = 'cocoya-prompt-dialog-overlay';
            dialog.innerHTML = `
                <div class="cocoya-prompt-dialog">
                    <div class="cocoya-prompt-message">${this._escapeHtml(message)}</div>
                    <input type="text" class="cocoya-prompt-input" value="${this._escapeHtml(defaultValue)}" autofocus>
                    <div class="cocoya-prompt-buttons">
                        <button class="cocoya-prompt-btn cocoya-prompt-cancel">${window.Blockly?.Msg['MSG_CANCEL'] || 'Cancel'}</button>
                        <button class="cocoya-prompt-btn cocoya-prompt-ok">${window.Blockly?.Msg['MSG_OK'] || 'OK'}</button>
                    </div>
                </div>
            `;
            
            // 加入樣式
            if (!document.getElementById('cocoya-prompt-styles')) {
                const styles = document.createElement('style');
                styles.id = 'cocoya-prompt-styles';
                styles.textContent = `
                    .cocoya-prompt-dialog-overlay {
                        position: fixed;
                        inset: 0;
                        background: rgba(0, 0, 0, 0.5);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 9999;
                    }
                    .cocoya-prompt-dialog {
                        background: var(--dsm-surface, #ffffff);
                        border: 1px solid var(--dsm-border-strong, #cccccc);
                        border-radius: 8px;
                        padding: 20px;
                        min-width: 300px;
                        max-width: 500px;
                        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                    }
                    .cocoya-prompt-message {
                        margin-bottom: 12px;
                        font-size: 13px;
                        color: var(--dsm-text, #333333);
                        word-wrap: break-word;
                    }
                    .cocoya-prompt-input {
                        width: 100%;
                        padding: 8px 10px;
                        border: 1px solid var(--dsm-border-strong, #cccccc);
                        border-radius: 4px;
                        font-size: 13px;
                        margin-bottom: 16px;
                        box-sizing: border-box;
                        outline: none;
                        background: var(--dsm-input-bg, #ffffff);
                        color: var(--dsm-text, #333333);
                    }
                    .cocoya-prompt-input:focus {
                        border-color: var(--dsm-brand, #FE2F89);
                        box-shadow: 0 0 0 2px var(--dsm-brand-soft, rgba(254, 47, 137, 0.12));
                    }
                    .cocoya-prompt-buttons {
                        display: flex;
                        justify-content: flex-end;
                        gap: 8px;
                    }
                    .cocoya-prompt-btn {
                        padding: 6px 16px;
                        border: 1px solid var(--dsm-border-strong, #cccccc);
                        border-radius: 4px;
                        background: var(--dsm-btn-bg, #f7f7f7);
                        color: var(--dsm-text, #333333);
                        cursor: pointer;
                        font-size: 12px;
                        min-height: 30px;
                    }
                    .cocoya-prompt-btn:hover {
                        border-color: var(--dsm-brand, #FE2F89);
                        color: var(--dsm-brand, #FE2F89);
                        background: var(--dsm-btn-hover-bg, #fff7fb);
                    }
                    .cocoya-prompt-ok {
                        background: var(--dsm-brand, #FE2F89);
                        color: white;
                        border: none;
                    }
                    .cocoya-prompt-ok:hover {
                        background: #e91e63;
                        color: white;
                    }
                    body.vscode-dark .cocoya-prompt-dialog,
                    body.vscode-high-contrast .cocoya-prompt-dialog {
                        background: #252526;
                        border-color: #404040;
                    }
                    body.vscode-dark .cocoya-prompt-message,
                    body.vscode-high-contrast .cocoya-prompt-message {
                        color: #e0e0e0;
                    }
                    body.vscode-dark .cocoya-prompt-input,
                    body.vscode-high-contrast .cocoya-prompt-input {
                        background: #1e1e1e;
                        border-color: #555555;
                        color: #e0e0e0;
                    }
                    body.vscode-dark .cocoya-prompt-btn,
                    body.vscode-high-contrast .cocoya-prompt-btn {
                        background: #3c3c3c;
                        border-color: #555555;
                        color: #e0e0e0;
                    }
                `;
                document.head.appendChild(styles);
            }
            
            document.body.appendChild(dialog);
            
            const input = dialog.querySelector('.cocoya-prompt-input');
            const okBtn = dialog.querySelector('.cocoya-prompt-ok');
            const cancelBtn = dialog.querySelector('.cocoya-prompt-cancel');
            
            // 自動聚焦並選中文字
            input.focus();
            input.select();
            
            // 處理 Enter 鍵
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    dialog.remove();
                    resolve(input.value);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    dialog.remove();
                    resolve(null);
                }
            });
            
            // 處理按鈕點擊
            okBtn.onclick = () => {
                dialog.remove();
                resolve(input.value);
            };
            
            cancelBtn.onclick = () => {
                dialog.remove();
                resolve(null);
            };
            
            // 點擊背景關閉
            dialog.addEventListener('click', (e) => {
                if (e.target === dialog) {
                    dialog.remove();
                    resolve(null);
                }
            });
        });
    }
    
    /**
     * HTML 轉義函數
     */
    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    _getCurrentXml() {
        if (typeof Blockly !== 'undefined' && Blockly.getMainWorkspace) {
            const dom = Blockly.Xml.workspaceToDom(Blockly.getMainWorkspace());
            const platform = window.CocoyaApp?.currentPlatform;
            dom.setAttribute('platform', platform);
            return Blockly.Xml.domToPrettyText(dom);
        }
        return '';
    }

    /**
     * 重新取得目前視窗的專案根錨定狀態，並更新 _anchor 快取。
     * 呼叫時機：開啟專案後、存檔/另存後，讓 capabilities.isAnchored/projectRoot 與後端同步，
     * 避免 _anchor（init 時快照）在開檔/存檔後過期。
     */
    /**
     * 正規化後端回傳的錨定物件（相容 camelCase / snake_case），統一為 { isAnchored, projectRoot }
     */
    _normalizeAnchor(a) {
        if (!a) return { isAnchored: false, projectRoot: null };
        return {
            isAnchored: !!(a.isAnchored ?? a.is_anchored),
            projectRoot: (a.projectRoot ?? a.project_root) || null
        };
    }

    async _refreshAnchor() {
        try {
            this._anchor = this._normalizeAnchor(await this.tauriInvoke('get_project_anchor'));
            console.log('[Anchor] refreshed -> projectRoot =', this._anchor.projectRoot,
                '| isAnchored =', this._anchor.isAnchored);
        } catch (e) {
            console.error('[Bridge] Failed to refresh project anchor:', e);
            this._anchor = null;
        }
    }

    async _handleExamplesSaveDialog(xml) {
        try {
            const { ask, message } = await import('@tauri-apps/plugin-dialog');
            const okLabel = window.Blockly?.Msg['MSG_SAVE'] || '覆蓋範例';
            const cancelLabel = window.Blockly?.Msg['MSG_CANCEL'] || '另存新檔';
            const overwrite = await ask(
                '此為 Cocoya 內建範例目錄，是否要覆蓋原始範例？',
                { 
                    title: 'Cocoya', 
                    kind: 'warning', 
                    okLabel, 
                    cancelLabel 
                }
            );
            
            if (overwrite) {
                // 覆蓋範例：直接呼叫 save_file 並標註強制覆蓋 examples 目錄
                try {
                    const filename = await this.tauriInvoke('save_file', { xml, saveAs: false, forceExamples: true });
                    this._dispatchToFrontend({ command: 'saveCompleted', filename: filename });
                    return true;
                } catch (e2) {
                    if (e2 !== 'Canceled' && e2 !== 'EXAMPLES_PATH') {
                        this.alert((window.Blockly?.Msg['BKY_SAVE_FAILED'] || 'Save failed: ') + e2);
                    }
                    return false;
                }
            } else {
                // 另存新檔：成功（含取消）由 send 回傳判斷
                return (await this.send('saveFileAs', { xml })) === true;
            }
        } catch (e) {
            console.error('[Bridge] Examples save dialog error:', e);
            return false;
        }
    }

    /**
     * 覆寫 _dispatchToFrontend：除了調用內部 listeners，
     * 也要透過 window.postMessage 讓 sampler.js 能接收
     */
    _dispatchToFrontend(message) {
        // 內部 listeners
        this._listeners.forEach(cb => cb(message));
        // window message event（相容 sampler.js 的 window.addEventListener('message') 監聽）
        window.postMessage(message, '*');
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
