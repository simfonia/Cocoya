import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import { exec, ChildProcess, spawn } from 'child_process';

/**
 * Dataset Manager Sidecar 進程管理器
 * 負責啟動 Python 進程、維護 stdin/stdout 通訊與生命週期
 */
class DatasetSidecarManager {
    private process: ChildProcess | null = null;
    private context: vscode.ExtensionContext;
    private pythonPath: string;
    private callbacks: Map<string, (data: any) => void> = new Map();
    private stdoutBuffer: string = ''; 
    public onEvent: ((event: string, data: any) => void) | null = null;

    constructor(context: vscode.ExtensionContext, pythonPath: string) {
        this.context = context;
        this.pythonPath = pythonPath;
    }

    /**
     * 啟動 Sidecar 進程
     */
    public start(): boolean {
        if (this.process) return true;

        const scriptPath = vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'dataset_manager', 'dataset_sidecar.py').fsPath;
        const workingDir = vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'dataset_manager').fsPath;

        try {
            // 使用 spawn 以便進行長期的 stdin/stdout 通訊
            this.process = spawn(this.pythonPath, [scriptPath], {
                cwd: workingDir,
                env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' })
            });

            this.process.stdout?.on('data', (data) => {
                this.stdoutBuffer += data.toString();
                const lines = this.stdoutBuffer.split('\n');
                
                // 保留最後一行（可能不完整），其餘皆為完整行
                this.stdoutBuffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    try {
                        const msg = JSON.parse(trimmed);
                        
                        // 處理回應
                        if (msg.type === 'response' && msg.requestId && this.callbacks.has(msg.requestId)) {
                            const cb = this.callbacks.get(msg.requestId);
                            if (cb) cb(msg);
                            this.callbacks.delete(msg.requestId);
                        } 
                        // 處理非同步事件
                        else if (msg.type === 'event' && msg.event && this.onEvent) {
                            this.onEvent(msg.event, msg);
                        }
                    } catch (e) {
                        // 這裡可能是 Python 的普通 print 輸出，若非 JSON 則忽略或記錄
                        console.log('[Sidecar Log]', trimmed);
                    }
                }
            });

            this.process.stderr?.on('data', (data) => {
                const str = data.toString().trim();
                if (str.includes('[Sidecar Log]')) {
                    console.log(str);
                } else {
                    console.error('[Sidecar Error]', str);
                }
            });

            this.process.on('close', (code) => {
                console.log(`[Sidecar] Process exited with code ${code}`);
                this.process = null;
            });

            return true;
        } catch (e) {
            console.error('[Sidecar] Spawn failed', e);
            return false;
        }
    }

    /**
     * 發送指令至 Sidecar
     */
    public send(command: string, data: any, callback?: (response: any) => void) {
        if (!this.process) {
            if (!this.start()) return;
        }

        const requestId = data.requestId || Math.random().toString(36).substring(7);
        if (callback) {
            this.callbacks.set(requestId, callback);
        }

        const msg = { command, requestId, ...data };
        this.process?.stdin?.write(JSON.stringify(msg) + '\n');
    }

    /**
     * 關閉 Sidecar
     */
    public stop() {
        if (this.process) {
            this.send('exit', {});
            this.process.kill();
            this.process = null;
        }
    }
}

// 全域管理器註冊表，用於清理
const activeManagers: Set<CocoyaManager> = new Set();

/**
 * Cocoya Extension 主管理器
 * 負責協調 Webview 通訊、檔案操作與程式執行
 */
export class CocoyaManager {
    private currentFilePath: string | undefined;
    private currentPlatform: string = 'PC';
    private localeMessages: any = {};
    private panel: vscode.WebviewPanel;
    private context: vscode.ExtensionContext;
    private lastDirtyState: boolean = false;
    private sidecar: DatasetSidecarManager;
    
    // 雲端 AI 相關屬性
    private cloudAiEnabled: boolean = false;
    private remoteWorkspaceRoot: string | undefined;

    constructor(context: vscode.ExtensionContext, panel: vscode.WebviewPanel) {
        this.context = context;
        this.panel = panel;
        this.sidecar = new DatasetSidecarManager(context, this.getPythonPath());
        
        // 註冊事件轉發
        this.sidecar.onEvent = (event, data) => {
            if (event === 'cameraStatus') {
                this.panel.webview.postMessage({ 
                    command: 'datasetCameraStatus', 
                    success: data.running 
                });
            }
        };

        this.cloudAiEnabled = this.context.globalState.get<boolean>('cloudAiEnabled', false);
        this.setupMessageListener();
        this.scheduleUpdateCheck();

        // [關鍵修正] 面板關閉時停止 Sidecar
        this.panel.onDidDispose(() => {
            console.log('[Extension] Panel disposed, stopping sidecar...');
            this.sidecar.stop();
            activeManagers.delete(this);
        }, null, this.context.subscriptions);

        activeManagers.add(this);

        // 初始重新整理序列埠
        setTimeout(() => this.handleRefreshSerialPorts(), 1000);
        // 初始化標題
        this.updateTitle();
    }

    /**
     * 公開停止方法
     */
    public dispose() {
        this.sidecar.stop();
    }

    /**
     * 取得目前設定的 Python 路徑
     */
    private getPythonPath(): string {
        return this.context.globalState.get<string>('pythonPath', 'python');
    }

    /**
     * 停止所有 Cocoya 相關的終端機任務，釋放序列埠
     */
    private async stopAllCocoyaTerminals() {
        const cocoyaTerminals = vscode.window.terminals.filter(t => t.name.startsWith('Cocoya'));
        for (const t of cocoyaTerminals) {
            t.sendText('\u0003'); // 發送 Ctrl+C
            await new Promise(resolve => setTimeout(resolve, 300));
            t.dispose(); // 徹底關閉
        }
    }

    /**
     * 翻譯輔助函式 (Host 端)
     */
    private t(key: string, ...args: string[]): string {
        let msg = this.localeMessages[key] || key;
        args.forEach((arg, i) => msg = msg.replace(`%${i + 1}`, arg));
        return msg;
    }

    /**
     * 設定 Webview 訊息監聽器
     */
    private setupMessageListener() {
        this.panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'setLocale':
                    this.localeMessages = message.messages;
                    this.updateTitle(); // 語系就緒後更新一次標題
                    break;
                case 'openExternal':
                    vscode.env.openExternal(vscode.Uri.parse(message.url));
                    break;
                case 'getManifest':
                    this.handleGetManifest();
                    break;
                case 'getModuleToolbox':
                    this.handleGetModuleToolbox(message);
                    break;
                case 'prompt':
                    this.handlePrompt(message);
                    break;
                case 'confirm':
                    this.handleConfirm(message);
                    break;
                case 'alert':
                    vscode.window.showInformationMessage(message.message);
                    break;
                case 'newFile':
                    await this.handleNewFile(message);
                    break;
                case 'openFile':
                    await this.handleOpenFile(message);
                    break;
                case 'saveFile':
                    await this.handleSaveFile(message);
                    break;
                case 'saveFileAs':
                    await this.handleSaveFileAs(message);
                    break;
                case 'openSerialMonitor':
                await this.stopAllCocoyaTerminals();
                const monPort = message.serialPort;
                if (!monPort) return;
                const monPython = this.getPythonPath();
                const monLang = vscode.env.language.startsWith('zh') ? 'zh-hant' : 'en';
                const monScript = vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'deploy_mcu.py').fsPath;
                
                const monTerminal = vscode.window.createTerminal('Cocoya Serial Monitor');
                monTerminal.sendText(`& "${monPython}" "${monScript}" "${monPort}" --monitor-only --lang ${monLang}`);
                monTerminal.show();
                break;

            case 'refreshSerialPorts':
                    await this.handleRefreshSerialPorts();
                    break;
                case 'setPythonPath':
                    await this.handleSetPythonPath();
                    break;
                case 'runCode':
                    await this.handleRunCode(message);
                    break;
                case 'stopCode':
                    this.handleStopCode();
                    break;
                case 'checkUpdate':
                    const v = this.context.extension.packageJSON.version;
                    vscode.window.showInformationMessage(this.t('MSG_UPDATE_LATEST', v));
                    break;
                case 'closeEditor':
                    await this.handleCloseEditor(message);
                    break;
                case 'setDirty':
                    this.lastDirtyState = message.isDirty;
                    this.updateTitle();
                    break;
                case 'confirmSwitch':
                    const choice = await vscode.window.showWarningMessage(
                        message.message,
                        { modal: true },
                        this.t('MSG_SAVE'), this.t('MSG_DONT_SAVE')
                    );
                    if (choice === this.t('MSG_SAVE')) {
                        if (await this.performSave(message.xml)) {
                            this.currentPlatform = message.newPlatform;
                            this.currentFilePath = undefined;
                            this.lastDirtyState = false;
                            this.updateTitle();
                            this.panel.webview.postMessage({ command: 'switchPlatform', platform: message.newPlatform });
                        }
                    } else if (choice === this.t('MSG_DONT_SAVE')) {
                        this.currentPlatform = message.newPlatform;
                        this.currentFilePath = undefined;
                        this.lastDirtyState = false;
                        this.updateTitle();
                        this.panel.webview.postMessage({ command: 'switchPlatform', platform: message.newPlatform });
                    }
                    break;
                case 'checkEnvironment':
                    await this.handleCheckEnvironment();
                    break;
                case 'installModule':
                    await this.handleInstallModule(message.module);
                    break;
                case 'pickMcuModel':
                    await this.handlePickMcuModel(message);
                    break;
                case 'resetFirmware':
                    await this.handleResetFirmware(message.model, message.shouldClear, message.serialPort);
                    break;
                case 'openHelp':
                    this.handleOpenHelp(message.helpId);
                    break;
                case 'eraseFilesystem':
                    await this.stopAllCocoyaTerminals();
                    const ePort = message.serialPort;
                    if (!ePort) return;
                    
                    const ePython = this.getPythonPath();
                    const eLang = vscode.env.language.startsWith('zh') ? 'zh-hant' : 'en';
                    const eTerminal = vscode.window.createTerminal('Cocoya Deep Repair');
                    eTerminal.show();

                    // --- 關鍵邏輯：根據型號選擇抹除方案 ---
                    // 為了簡化，目前我們先執行 esptool 抹除 (針對 S3 救磚最有效)
                    eTerminal.sendText(`& "${ePython}" -m esptool --port ${ePort} erase-flash`);
                    
                    const infoMsg = this.localeMessages['MSG_ERASE_START_REFLASH'] || 
                        (eLang === 'zh-hant' ? '已啟動硬體抹除。完成後請務必重新「重置韌體」！' : 'Hardware erase started. Please re-flash firmware after it completes!');
                    vscode.window.showInformationMessage(infoMsg);
                    break;
                case 'setupStableMode':
                    await this.stopAllCocoyaTerminals();
                    const sPort = message.serialPort;
                    const sPython = this.getPythonPath();
                    const sLang = vscode.env.language.startsWith('zh') ? 'zh-hant' : 'en';
                    const sScript = vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'deploy_mcu.py').fsPath;
                    const sTerminal = vscode.window.createTerminal('Cocoya Setup');
                    sTerminal.sendText(`& "${sPython}" "${sScript}" "${sPort}" --setup-stable --lang ${sLang}`);
                    sTerminal.show();
                    break;
                case 'autoBackup':
                    this.handleAutoBackup(message.xml);
                    break;
                case 'clearBackup':
                    this.handleClearBackup();
                    break;
                case 'rejectRecovery':
                    this.handleRejectRecovery();
                    break;
                case 'setCloudAiMode':
                    await this.handleSetCloudAiMode(message.enabled);
                    break;
                case 'datasetStartCamera':
                    this.sidecar.start();
                    this.sidecar.send('startCamera', { deviceId: message.deviceId || 0 }, (resp) => {
                        this.panel.webview.postMessage({ command: 'datasetCameraStatus', success: resp.success });
                    });
                    break;
                case 'datasetStopCamera':
                    this.sidecar.send('stopCamera', {});
                    break;
                case 'datasetCaptureImage':
                    // 1. 決定基礎路徑 (優先使用工作區根目錄，避免 process.cwd() 指向 VS Code 安裝路徑導致權限或路徑混亂)
                    const baseDir = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0)
                        ? vscode.workspace.workspaceFolders[0].uri.fsPath
                        : path.join(this.context.extensionPath, 'temp_scripts');

                    const projectName = message.projectName || 'dataset';
                    const label = message.label || 'unlabeled';
                    const timestamp = Date.now();
                    const savePath = message.savePath || path.join(baseDir, 'dataset', projectName, label, `${label}_${timestamp}.jpg`);
                    
                    console.log(`[Host] Requesting capture: ${savePath} (ID: ${message.requestId})`);
                    
                    // 關鍵修正：將 message.requestId 傳給 sidecar.send 的第二個參數（data 物件）
                    this.sidecar.send('captureImage', { 
                        savePath, 
                        label,
                        requestId: message.requestId // 確保 ID 跟著下去
                    }, (resp) => {
                        console.log(`[Host] Capture result received for ID: ${resp.requestId}`);
                        this.panel.webview.postMessage({ 
                            command: 'datasetCaptureResult', 
                            ...resp 
                        });
                    });
                    break;
                case 'datasetExport':
                    this.handleDatasetExport(message);
                    break;
                case 'datasetUploadArchive':
                    await this.handleDatasetUploadArchive(message);
                    break;
                case 'checkRemoteEnvironment':
                    await this.handleCheckRemoteEnvironment();
                    break;
                case 'pickFolder':
                    this.handlePickFolder(message);
                    break;
            }
        }, undefined, this.context.subscriptions);
    }

    /**
     * 處理資料夾選取與掃描
     */
    private async handlePickFolder(message: any) {
        const lastPath = this.context.globalState.get<string>('lastDatasetFolder');
        const defaultUri = lastPath ? vscode.Uri.file(lastPath) : undefined;
        
        const uris = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            defaultUri: defaultUri,
            title: '選取資料集資料夾'
        });

        if (uris && uris[0]) {
            const folderPath = uris[0].fsPath;
            await this.context.globalState.update('lastDatasetFolder', folderPath);
            
            const result = await this.scanDatasetFolder(folderPath);
            this.panel.webview.postMessage({ 
                command: 'pickFolderResponse', 
                requestId: message.requestId, 
                result: {
                    path: folderPath,
                    ...result
                } 
            });
        } else {
            this.panel.webview.postMessage({ 
                command: 'pickFolderResponse', 
                requestId: message.requestId, 
                result: null 
            });
        }
    }

    /**
     * 掃描資料集資料夾並轉換為 Webview 可用的 URI
     */
    private async scanDatasetFolder(folderPath: string) {
        const images: any[] = [];
        const labelCounts: { [key: string]: number } = {};
        const labelMap: { [key: string]: number } = {};
        let nextLabelId = 0;
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.bmp'];

        const walk = (dir: string, relDir: string = '') => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relPath = path.join(relDir, entry.name);
                
                if (entry.isDirectory()) {
                    walk(fullPath, relPath);
                } else {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (imageExtensions.includes(ext)) {
                        // 提取父目錄名作為標籤
                        const parts = relDir.split(path.sep);
                        const label = parts.length > 0 && parts[parts.length - 1] !== '' ? parts[parts.length - 1] : 'unlabeled';

                        if (!labelCounts[label]) {
                            labelCounts[label] = 0;
                            labelMap[label] = nextLabelId++;
                        }
                        labelCounts[label]++;

                        images.push({
                            name: entry.name,
                            path: relPath.replace(/\\/g, '/'), // 統一使用正斜槓
                            label: label,
                            blobUrl: this.panel.webview.asWebviewUri(vscode.Uri.file(fullPath)).toString()
                        });
                    }
                }
            }
        };

        try {
            walk(folderPath);
        } catch (e) {
            console.error('[Extension] Scan folder failed', e);
        }
        
        return { images, labelCounts, labelMap };
    }

    /**
     * 處理資料集匯出
     */
    private async handleDatasetExport(message: any) {
        console.log('[Host] Received datasetExport request', message.spec?.project?.name);
        const spec = message.spec;
        const projectName = spec.project?.name || 'dataset';
        const sourceFolderPath = message.sourceFolderPath; 
        
        // 1. 決定基礎路徑 (優先使用工作區根目錄，確保與補拍相片儲存於同一基底目錄)
        const baseDir = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0)
            ? vscode.workspace.workspaceFolders[0].uri.fsPath
            : path.join(this.context.extensionPath, 'temp_scripts');
        
        const datasetDir = path.join(baseDir, 'dataset', projectName);
        const specPath = path.join(datasetDir, 'dataset.json');

        try {
            if (!fs.existsSync(datasetDir)) {
                fs.mkdirSync(datasetDir, { recursive: true });
            }

            // 同步外部影像
            if (sourceFolderPath && fs.existsSync(sourceFolderPath)) {
                console.log(`[Host] Synchronizing imported images from ${sourceFolderPath} to ${datasetDir}`);
                this.copyRecursiveSync(sourceFolderPath, datasetDir);
            }

            fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));

            const options: vscode.SaveDialogOptions = {
                defaultUri: vscode.Uri.file(path.join(os.homedir(), `${projectName}.zip`)),
                filters: { 'ZIP Archive': ['zip'] },
                title: '匯出資料集'
            };

            const fileUri = await vscode.window.showSaveDialog(options);
            if (!fileUri) return;

            const outputZip = fileUri.fsPath;

            this.sidecar.start();
            this.sidecar.send('exportDataset', {
                sourceDir: datasetDir,
                outputZip: outputZip
            }, (resp) => {
                if (resp.success) {
                    vscode.window.showInformationMessage(`資料集匯出成功: ${resp.path}`);
                    this.panel.webview.postMessage({ command: 'datasetExportResult', success: true, path: resp.path });
                } else {
                    vscode.window.showErrorMessage(`資料集匯出失敗: ${resp.error}`);
                    this.panel.webview.postMessage({ command: 'datasetExportResult', success: false, error: resp.error });
                }
            });

        } catch (e: any) {
            vscode.window.showErrorMessage(`匯出程序錯誤: ${e.message}`);
            this.panel.webview.postMessage({ command: 'datasetExportResult', success: false, error: e.message });
        }
    }

    /**
     * 遞迴複製資料夾
     */
    private copyRecursiveSync(src: string, dest: string) {
        const exists = fs.existsSync(src);
        const stats = exists && fs.statSync(src);
        const isDirectory = exists && stats && stats.isDirectory();
        if (isDirectory) {
            if (!fs.existsSync(dest)) fs.mkdirSync(dest);
            fs.readdirSync(src).forEach((childItemName) => {
                this.copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
            });
        } else {
            if (fs.existsSync(dest)) {
                const srcStat = fs.statSync(src);
                const destStat = fs.statSync(dest);
                if (srcStat.size === destStat.size) return;
            }
            fs.copyFileSync(src, dest);
        }
    }

    /**
     * 使用 Python 抓取攝影機畫面 (Webview 權限受限時的備援方案)
     */
    private async handleCaptureImage(message: any) {
        const pythonPath = this.getPythonPath();
        const captureScript = `
import cv2
import base64
import sys

try:
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("ERROR:無法開啟攝影機")
        sys.exit(1)
    
    ret, frame = cap.read()
    if ret:
        _, buffer = cv2.imencode('.jpg', frame)
        jpg_as_text = base64.b64encode(buffer).decode('utf-8')
        print("DATA:" + jpg_as_text)
    else:
        print("ERROR:擷取失敗")
    cap.release()
except Exception as e:
    print(f"ERROR:{str(e)}")
`.trim();

        const { execFile } = require('child_process');
        execFile(pythonPath, ['-c', captureScript], (error: any, stdout: string) => {
            if (error) {
                this.panel.webview.postMessage({ 
                    command: 'captureResponse', 
                    requestId: message.requestId, 
                    success: false, 
                    error: error.message 
                });
                return;
            }

            const output = stdout.trim();
            if (output.startsWith('DATA:')) {
                const base64 = output.replace('DATA:', '');
                this.panel.webview.postMessage({ 
                    command: 'captureResponse', 
                    requestId: message.requestId, 
                    success: true, 
                    base64: base64 
                });
            } else {
                this.panel.webview.postMessage({ 
                    command: 'captureResponse', 
                    requestId: message.requestId, 
                    success: false, 
                    error: output.replace('ERROR:', '') 
                });
            }
        });
    }

    // --- 訊息處理方法 ---

    /**
     * 處理拒絕恢復：封存目前的備份檔，以免被覆蓋
     */
    private handleRejectRecovery() {
        try {
            let backupPath: string | undefined;
            if (this.currentFilePath) {
                backupPath = path.join(path.dirname(this.currentFilePath), `.${path.basename(this.currentFilePath)}.bak`);
            } else {
                backupPath = path.join(this.context.extensionPath, 'temp_scripts', 'untitled_backup.xml');
            }

            if (backupPath && fs.existsSync(backupPath)) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const archivePath = `${backupPath}.old_${timestamp}`;
                fs.renameSync(backupPath, archivePath);
            }
        } catch (e) {
            console.error('[Extension] Reject recovery (archive) failed', e);
        }
    }

    /**
     * 取得機器唯一識別碼 (學生電腦名稱)
     */
    private getMachineId(): string {
        return os.hostname() || 'Unknown_PC';
    }

    /**
     * 處理雲端 AI 模式切換
     */
    private async handleSetCloudAiMode(enabled: boolean) {
        const isRemote = vscode.env.remoteName !== undefined;
        if (enabled && !isRemote) {
            vscode.window.showWarningMessage(
                this.t('MSG_CLOUD_AI_REQUIRES_REMOTE') || 
                'Cloud AI mode requires a Remote SSH connection. Please connect to your server first.'
            );
            this.panel.webview.postMessage({ command: 'cloudAiModeStatus', enabled: false });
            return;
        }

        this.cloudAiEnabled = enabled;
        this.context.globalState.update('cloudAiEnabled', enabled);

        if (enabled) {
            await this.initializeRemoteSandbox();
        }
    }

    /**
     * 處理遠端環境診斷 (CUDA/Docker)
     */
    private async handleCheckRemoteEnvironment() {
        if (!vscode.env.remoteName) {
            this.panel.webview.postMessage({
                command: 'checkRemoteEnvironmentResult',
                success: false,
                error: 'Not in remote SSH environment'
            });
            return;
        }

        const result = {
            cudaAvailable: false,
            gpuName: '',
            dockerRunning: false,
            gpuPassthrough: false,
            errors: [] as string[]
        };

        const executeCommand = (cmd: string): Promise<{ stdout: string; stderr: string; error: any }> => {
            return new Promise((resolve) => {
                // 合併常見的 Linux 二進位路徑到 PATH，解決非登入式 Shell PATH 缺失的問題
                const env = Object.assign({}, process.env);
                const isWindows = process.platform === 'win32';
                if (!isWindows) {
                    const extraPaths = '/usr/bin:/usr/sbin:/usr/local/bin:/usr/local/cuda/bin:/snap/bin';
                    env.PATH = env.PATH ? `${env.PATH}:${extraPaths}` : extraPaths;
                }
                exec(cmd, { env }, (error, stdout, stderr) => {
                    resolve({ stdout, stderr, error });
                });
            });
        };

        // 1. 偵測 GPU (nvidia-smi)
        const nvidiaSmi = await executeCommand('nvidia-smi --query-gpu=name --format=csv,noheader');
        console.log('[CheckEnvironment] nvidia-smi result:', nvidiaSmi.error, nvidiaSmi.stdout, nvidiaSmi.stderr);
        if (!nvidiaSmi.error) {
            result.cudaAvailable = true;
            result.gpuName = nvidiaSmi.stdout.trim() || 'NVIDIA GPU';
        } else {
            const detail = nvidiaSmi.error ? nvidiaSmi.error.message : nvidiaSmi.stderr;
            result.errors.push(`無法偵測到 NVIDIA GPU。詳情: ${detail.trim()}`);
        }

        // 2. 偵測 Docker (docker info)
        const dockerInfo = await executeCommand('docker info');
        console.log('[CheckEnvironment] docker info result:', dockerInfo.error, dockerInfo.stdout, dockerInfo.stderr);
        if (!dockerInfo.error) {
            result.dockerRunning = true;
        } else {
            const detail = dockerInfo.error ? dockerInfo.error.message : dockerInfo.stderr;
            result.errors.push(`Docker 服務未執行。詳情: ${detail.trim()}`);
        }

        // 3. 偵測 GPU Container Toolkit (--gpus)
        const dockerHelp = await executeCommand('docker run --help');
        console.log('[CheckEnvironment] docker run --help result:', dockerHelp.error, dockerHelp.stdout, dockerHelp.stderr);
        if (!dockerHelp.error && dockerHelp.stdout.includes('--gpus')) {
            result.gpuPassthrough = true;
        } else {
            const detail = dockerHelp.error ? dockerHelp.error.message : dockerHelp.stderr;
            result.errors.push(`未偵測到 Docker --gpus 參數支援。詳情: ${detail.trim()}`);
        }

        this.panel.webview.postMessage({
            command: 'checkRemoteEnvironmentResult',
            success: true,
            status: result
        });
    }

    /**
     * 處理資料集上傳與遠端 python 解壓
     */
    private async handleDatasetUploadArchive(message: any) {
        const base64Data = message.zipData;
        const projectName = message.projectName || 'dataset';
        
        if (!vscode.env.remoteName) {
            vscode.window.showWarningMessage('目前非遠端 SSH 環境，無需上傳資料集。');
            this.panel.webview.postMessage({ command: 'datasetUploadResult', success: false, error: 'Not in remote environment' });
            return;
        }

        const machineId = this.getMachineId();
        const homedir = os.homedir();
        const targetDir = path.join(homedir, 'cocoya_ai', 'sessions', machineId, 'dataset', projectName);
        const tempZipPath = path.join(homedir, 'cocoya_ai', 'sessions', machineId, 'dataset', `${projectName}_temp.zip`);

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `正在上傳並在遠端解壓縮資料集 ${projectName}...`,
            cancellable: false
        }, async (progress) => {
            try {
                // 確保目標資料夾存在
                if (!fs.existsSync(path.dirname(tempZipPath))) {
                    fs.mkdirSync(path.dirname(tempZipPath), { recursive: true });
                }

                // 1. 將 Base64 寫入暫存 ZIP 檔
                const buffer = Buffer.from(base64Data, 'base64');
                fs.writeFileSync(tempZipPath, buffer);
                
                // 2. 確保解壓縮的目標資料夾存在
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }

                // 3. 呼叫 python 腳本在遠端進行解壓縮，解壓完畢後自動移除 zip
                const pythonPath = this.getPythonPath();
                const escapedZipPath = tempZipPath.replace(/\\/g, '/');
                const escapedTargetDir = targetDir.replace(/\\/g, '/');
                
                const unzipScript = `
import zipfile
import os
try:
    with zipfile.ZipFile("${escapedZipPath}", 'r') as zip_ref:
        zip_ref.extractall("${escapedTargetDir}")
    os.remove("${escapedZipPath}")
    print("SUCCESS")
except Exception as e:
    print("ERROR:", str(e))
`.trim();

                const { execFile } = require('child_process');
                execFile(pythonPath, ['-c', unzipScript], (error: any, stdout: string) => {
                    if (error || stdout.trim().startsWith('ERROR')) {
                        const errMsg = error ? error.message : stdout.trim();
                        vscode.window.showErrorMessage(`遠端資料集解壓失敗: ${errMsg}`);
                        this.panel.webview.postMessage({ command: 'datasetUploadResult', success: false, error: errMsg });
                    } else {
                        vscode.window.showInformationMessage(`資料集 ${projectName} 成功同步至雲端沙盒！`);
                        this.panel.webview.postMessage({ command: 'datasetUploadResult', success: true });
                    }
                });

            } catch (e: any) {
                vscode.window.showErrorMessage(`資料集上傳錯誤: ${e.message}`);
                this.panel.webview.postMessage({ command: 'datasetUploadResult', success: false, error: e.message });
            }
        });
    }

    /**
     * 初始化遠端沙盒目錄
     */
    private async initializeRemoteSandbox() {
        if (!vscode.env.remoteName) return;

        const machineId = this.getMachineId();
        // 在遠端環境中，$HOME 應透過 os.homedir() 或環境變數獲取
        this.remoteWorkspaceRoot = `~/cocoya_ai/sessions/${machineId}`;

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Initializing Cloud Sandbox...",
            cancellable: false
        }, async (progress) => {
            try {
                // 使用 VS Code 終端機建立遠端目錄 (mkdir -p)
                const setupCmd = `mkdir -p "${this.remoteWorkspaceRoot}/dataset" "${this.remoteWorkspaceRoot}/models" "${this.remoteWorkspaceRoot}/src"`;
                const terminal = vscode.window.createTerminal('Cocoya Sandbox');
                terminal.sendText(setupCmd);
                
                await new Promise(resolve => setTimeout(resolve, 1500));
                terminal.dispose();
                
                vscode.window.showInformationMessage(`Cloud Sandbox Ready: ${this.remoteWorkspaceRoot}`);
            } catch (e) {
                vscode.window.showErrorMessage("Failed to initialize remote sandbox.");
            }
        });
    }

    /**
     * 處理自動備份實體化
     */
    private handleAutoBackup(xml: string) {
        try {
            let backupPath: string;
            if (this.currentFilePath) {
                // 情境 A：已存檔專案 -> 存放在專案旁 (隱藏檔)
                const dir = path.dirname(this.currentFilePath);
                const name = path.basename(this.currentFilePath);
                backupPath = path.join(dir, `.${name}.bak`);
            } else {
                // 情境 B：未存檔專案 -> 存放在擴充功能暫存區
                const tempDir = path.join(this.context.extensionPath, 'temp_scripts');
                if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                backupPath = path.join(tempDir, 'untitled_backup.xml');
            }
            fs.writeFileSync(backupPath, xml, 'utf8');
        } catch (e) {
            console.error('[Extension] Auto-backup failed', e);
        }
    }

    /**
     * 清理自動備份
     */
    private handleClearBackup() {
        try {
            // 嘗試清理兩種可能的備份位置
            if (this.currentFilePath) {
                const bPath = path.join(path.dirname(this.currentFilePath), `.${path.basename(this.currentFilePath)}.bak`);
                if (fs.existsSync(bPath)) fs.unlinkSync(bPath);
            }
            const tempBPath = path.join(this.context.extensionPath, 'temp_scripts', 'untitled_backup.xml');
            if (fs.existsSync(tempBPath)) fs.unlinkSync(tempBPath);
        } catch (e) {}
    }

    /**
     * 開啟本地積木說明文件
     */
    private handleOpenHelp(helpId: string) {
        if (!helpId) return;
        // 根據目前的 Webview 語言決定說明文件檔名
        const helpUri = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'docs', `${helpId}.html`);
        vscode.env.openExternal(helpUri);
    }

    /**
     * 檢查必要的 Python 模組是否已安裝
     * 使用 execFile 以數組傳遞參數，徹底避免 Windows 上的引號轉義問題
     */
    private async handleCheckEnvironment() {
        let pythonPath = this.context.globalState.get<string>('pythonPath', 'python');
        const modules = ['cv2', 'mediapipe', 'PIL', 'serial', 'esptool'];
        
        const checkScript = `
import importlib.util
import json
import sys

modules = ${JSON.stringify(modules)}
results = {}
for m in modules:
    try:
        results[m] = importlib.util.find_spec(m) is not None
    except:
        results[m] = False
print(json.dumps(results))
        `.trim();

        const { execFile } = require('child_process');
        
        // 使用 execFile，將 -c 與腳本作為獨立參數傳遞，不經過 Shell 字串解析
        execFile(pythonPath, ['-c', checkScript], (error: any, stdout: string) => {
            let results: any = {};
            if (!error) {
                try {
                    results = JSON.parse(stdout.trim());
                } catch (e) {
                    console.error('[Cocoya] Failed to parse environment check output:', e);
                    modules.forEach(m => results[m] = false);
                }
            } else {
                // 如果 Python 執行失敗 (路徑不對或權限問題)，全部設為 false
                modules.forEach(m => results[m] = false);
            }
            this.panel.webview.postMessage({ command: 'environmentStatus', results });
        });
    }

    /**
     * 執行 pip install 安裝缺失模組
     */
    private async handleInstallModule(moduleName: string) {
        let pythonPath = this.context.globalState.get<string>('pythonPath', 'python');
        let terminal = vscode.window.terminals.find(t => t.name === 'Cocoya Environment');
        if (!terminal) terminal = vscode.window.createTerminal('Cocoya Environment');
        
        terminal.show();
        // 建議加上 --user 以避免權限問題，並使用 -m pip 確保安裝到正確的 Python 環境
        terminal.sendText(`& "${pythonPath}" -m pip install ${moduleName} --user`);
        
        // 安裝後自動重新診斷 (延遲 5 秒讓 pip 開始跑)
        setTimeout(() => this.handleCheckEnvironment(), 5000);
    }

    /**
     * 重新整理序列埠清單 (目前僅支援 Windows)
     */
    private async handleRefreshSerialPorts() {
        try {
            const { exec } = require('child_process');
            
            const boardMap: { [key: string]: string } = {
                "VID_2E8A&PID_0005": "Maker Pi RP2040 / Pico",
                "VID_2E8A&PID_0003": "Maker Pi RP2040 (CP)",
                "VID_303A&PID_1001": "XIAO ESP32-S3 / ESP32",
                "VID_1A86&PID_7523": "Arduino Uno / CH340",
                "VID_10C4&PID_EA60": "CP210x USB Adapter",
                "VID_2341&PID_0043": "Arduino Uno R3"
            };

            // 使用 Win32_SerialPort (速度比 Win32_PnPEntity 快 10 倍以上)
            const psCmd = "Get-CimInstance Win32_SerialPort | ForEach-Object { $_.Name + '|' + $_.PNPDeviceID }";
            const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCmd}"`;
            
            exec(cmd, (error: any, stdout: string) => {
                const ports: any[] = [];
                if (!error && stdout) {
                    const lines = stdout.split(/\r?\n/).map((s: string) => s.trim()).filter((s: string) => s !== '');
                    lines.forEach((line: string) => {
                        const parts = line.split('|');
                        if (parts.length < 2) return;
                        
                        const name = parts[0];
                        const pnpId = parts[1];
                        const comMatch = name.match(/\((COM\d+)\)/);
                        if (!comMatch) return;
                        
                        const port = comMatch[1];
                        let label = port;

                        for (const [key, boardName] of Object.entries(boardMap)) {
                            if (pnpId.includes(key)) {
                                label = `[${boardName}] ${port}`;
                                break;
                            }
                        }
                        ports.push({ port: port, label: label });
                    });
                }
                
                // 備援：如果詳細描述沒抓到 (或是為空)，改用基本的 GetPortNames
                if (ports.length === 0) {
                    const { execSync } = require('child_process');
                    try {
                        const basicOutput = execSync('powershell "[System.IO.Ports.SerialPort]::GetPortNames()"', { encoding: 'utf8' });
                        if (basicOutput) {
                            const lines = basicOutput.split(/\r?\n/).map((s: string) => s.trim()).filter((s: string) => s !== '');
                            lines.forEach((p: string) => {
                                if (!ports.find((x: any) => x.port === p)) {
                                    ports.push({ port: p, label: p });
                                }
                            });
                        }
                    } catch (e) {}
                }
                this.panel.webview.postMessage({ command: 'serialPortsData', ports });
            });
        } catch (e) {
            console.error('Failed to list serial ports', e);
            this.panel.webview.postMessage({ command: 'serialPortsData', ports: [] });
        }
    }

    private handleGetManifest() {
        // 核心 manifest 現在位於 ui/src 下
        const manifestPath = path.join(this.context.extensionPath, 'ui', 'src', 'core_manifest.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        
        // mediaUri 指向 ui 目錄
        const mediaUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'ui', 'src')).toString();
        
        // 取得 VS Code 語系並映射
        let lang = vscode.env.language.toLowerCase();
        if (lang === 'zh-tw' || lang === 'zh-hant') lang = 'zh-hant';
        else if (lang.startsWith('en')) lang = 'en';
        else lang = 'en'; // 預設英文

        // 注入 Host 端能力與環境資訊
        const capabilities = {
            isRemoteAware: true,
            isRemoteConnected: vscode.env.remoteName !== undefined,
            remoteName: vscode.env.remoteName
        };

        this.panel.webview.postMessage({ 
            command: 'manifestData', 
            data: manifest, 
            mediaUri, 
            lang: lang,
            capabilities: capabilities,
            cloudAiEnabled: this.cloudAiEnabled 
        });

        // --- 新增：啟動時檢查未存檔備份 ---
        const tempBPath = path.join(this.context.extensionPath, 'temp_scripts', 'untitled_backup.xml');
        if (fs.existsSync(tempBPath)) {
            const xml = fs.readFileSync(tempBPath, 'utf8');
            this.panel.webview.postMessage({ command: 'recoveryData', xml: xml });
        }
    }

    private handleGetModuleToolbox(message: any) {
        // 模組現在統一放在 ui/src/modules 下
        const toolboxPath = path.join(this.context.extensionPath, 'ui', 'src', 'modules', message.moduleId, 'toolbox.xml');

        if (fs.existsSync(toolboxPath)) {
            const xml = fs.readFileSync(toolboxPath, 'utf8');
            this.panel.webview.postMessage({ command: 'toolboxData', data: xml, requestId: message.requestId });
        } else {
            console.error(`Toolbox not found for module: ${message.moduleId} at ${toolboxPath}`);
        }
    }

    private async handlePrompt(message: any) {
        const result = await vscode.window.showInputBox({ prompt: message.message, value: message.defaultValue });
        this.panel.webview.postMessage({ command: 'promptResponse', requestId: message.requestId, result });
    }

    private async handleConfirm(message: any) {
        const ok = this.t('MSG_OK') || 'OK';
        // 在 modal 模式下，VS Code 會自動提供取消/關閉機制，不需手動添加 cancel 按鈕以免重複
        const choice = await vscode.window.showInformationMessage(message.message, { modal: true }, ok);
        this.panel.webview.postMessage({ command: 'promptResponse', requestId: message.requestId, result: choice === ok });
    }

    private async checkDirtyAndConfirm(message: any): Promise<boolean> {
        if (!message.isDirty) return true;
        const choice = await vscode.window.showWarningMessage(this.t('MSG_SAVE_CONFIRM'), { modal: true }, this.t('MSG_SAVE'), this.t('MSG_DONT_SAVE'));
        if (choice === this.t('MSG_SAVE')) return await this.performSave(message.xml);
        return choice === this.t('MSG_DONT_SAVE');
    }

    private async performSave(xml: string): Promise<boolean> {
        if (this.currentFilePath) {
            fs.writeFileSync(this.currentFilePath, xml, 'utf8');
            this.handleClearBackup(); // 儲存成功，清理備份
            return true;
        } else {
            const lastPath = this.context.globalState.get<string>('lastWorkspacePath');
            const defaultUri = lastPath ? vscode.Uri.file(lastPath) : undefined;

            const uri = await vscode.window.showSaveDialog({ 
                filters: { 'Cocoya Project': ['xml'] },
                defaultUri: defaultUri
            });

            if (uri) {
                this.currentFilePath = uri.fsPath;
                await this.context.globalState.update('lastWorkspacePath', path.dirname(this.currentFilePath));
                fs.writeFileSync(this.currentFilePath, xml, 'utf8');
                this.handleClearBackup(); // 儲存成功，清理備份
                this.updateTitle();
                return true;
            }
        }
        return false;
    }

    private updateTitle() {
        const displayName = this.currentFilePath ? path.basename(this.currentFilePath) : this.t('TLB_FILE_NEW');
        const dirtyMarker = this.lastDirtyState ? '*' : '';
        
        // 1. 更新頁籤標題 (採用 檔名 - 資料夾名 格式)
        if (this.currentFilePath) {
            const folderName = path.basename(path.dirname(this.currentFilePath));
            this.panel.title = `${displayName}${dirtyMarker} (${folderName}) - Cocoya`;
            
            // 2. 同步完整路徑到 VS Code 狀態列，讓使用者隨時可見
            vscode.window.setStatusBarMessage(`Cocoya Project: ${this.currentFilePath}`, 5000);
        } else {
            this.panel.title = `${displayName}${dirtyMarker} - Cocoya`;
        }
    }

    private async handleNewFile(message: any) {
        if (await this.checkDirtyAndConfirm(message)) {
            this.currentFilePath = undefined;
            this.lastDirtyState = false;
            this.handleClearBackup(); // 開新檔案也清理舊的未命名備份
            this.updateTitle();
            this.panel.webview.postMessage({ command: 'resetWorkspace' });
        }
    }

    private async handleOpenFile(message: any) {
        if (await this.checkDirtyAndConfirm(message)) {
            const lastPath = this.context.globalState.get<string>('lastWorkspacePath');
            const defaultUri = lastPath ? vscode.Uri.file(lastPath) : undefined;

            const uris = await vscode.window.showOpenDialog({ 
                canSelectMany: false, 
                filters: { 'Cocoya Project': ['xml'] },
                defaultUri: defaultUri
            });

            if (uris && uris[0]) {
                this.currentFilePath = uris[0].fsPath;
                await this.context.globalState.update('lastWorkspacePath', path.dirname(this.currentFilePath));
                const content = fs.readFileSync(this.currentFilePath, 'utf8');
                const filename = path.basename(this.currentFilePath);
                
                // 1. 優先從 XML 屬性偵測平台模式
                let platform = 'PC';
                const platformMatch = content.match(/<xml[^>]+platform="([^"]+)"/);
                if (platformMatch) {
                    platform = platformMatch[1];
                } else {
                    // 2. 備援方案：偵測特定積木 (針對舊檔案)
                    if (content.includes('type="py_loop_while"')) platform = 'MicroPython';
                    else if (content.includes('type="py_main"')) platform = 'PC';
                }
                
                this.currentPlatform = platform;
                this.lastDirtyState = false;
                this.updateTitle();
                this.panel.webview.postMessage({ command: 'loadWorkspace', xml: content, filename, platform });

                // --- 新增：開啟檔案後檢查實體備份 ---
                const bPath = path.join(path.dirname(this.currentFilePath), `.${path.basename(this.currentFilePath)}.bak`);
                if (fs.existsSync(bPath)) {
                    const backupXml = fs.readFileSync(bPath, 'utf8');
                    // 只有當備份內容與磁碟原始檔不一致時，才提示恢復
                    if (backupXml.trim() !== content.trim()) {
                        this.panel.webview.postMessage({ command: 'recoveryData', xml: backupXml });
                    }
                }
            }
        }
    }

    private async handleSaveFile(message: any) {
        if (await this.performSave(message.xml)) {
            const filename = this.currentFilePath ? path.basename(this.currentFilePath) : undefined;
            this.lastDirtyState = false;
            this.updateTitle();
            this.panel.webview.postMessage({ command: 'saveCompleted', success: true, filename });
        }
    }

    private async handleSaveFileAs(message: any) {
        const lastPath = this.context.globalState.get<string>('lastWorkspacePath');
        const defaultUri = lastPath ? vscode.Uri.file(lastPath) : undefined;

        const uri = await vscode.window.showSaveDialog({ 
            filters: { 'Cocoya Project': ['xml'] },
            defaultUri: defaultUri
        });

        if (uri) {
            this.currentFilePath = uri.fsPath;
            await this.context.globalState.update('lastWorkspacePath', path.dirname(this.currentFilePath));
            fs.writeFileSync(this.currentFilePath, message.xml, 'utf8');
            this.lastDirtyState = false;
            this.updateTitle();
            this.panel.webview.postMessage({ command: 'saveCompleted', success: true, filename: path.basename(this.currentFilePath) });
        }
    }

    private async handleSetPythonPath() {
        const uris = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Executables': ['exe'] }, title: '選取 python.exe' });
        if (uris && uris[0]) {
            const newPath = uris[0].fsPath;
            await this.context.globalState.update('pythonPath', newPath);
            vscode.window.showInformationMessage(this.t('MSG_PYTHON_UPDATED', newPath));
        }
    }

    private async handleRunCode(message: any) {
        const platform = message.platform || this.currentPlatform;
        const tempDir = path.join(this.context.extensionPath, 'temp_scripts');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        // 1. 清理定位用的隱形標記 (保留 # ID 註解以維持行號一致)
        const cleanCode = message.code.replace(/\u0001ID:.*?\u0002/g, '');
        
        if (platform === 'MicroPython') {
            const port = message.serialPort;
            if (!port) {
                vscode.window.showErrorMessage(this.t('MSG_SELECT_PORT'));
                return;
            }

            // 檢查 Python 與 pyserial 效力
            let pythonPath = this.context.globalState.get<string>('pythonPath', 'python');
            if (!await this.validatePythonPath(pythonPath)) {
                const pick = await vscode.window.showErrorMessage(this.t('MSG_PYTHON_NOT_FOUND', pythonPath), this.t('MSG_SELECT_PATH'));
                if (pick === this.t('MSG_SELECT_PATH')) {
                    const uris = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Executables': ['exe'] } });
                    if (uris && uris[0]) {
                        pythonPath = uris[0].fsPath;
                        await this.context.globalState.update('pythonPath', pythonPath);
                    } else return;
                } else return;
            }

            if (!await this.validatePySerial(pythonPath)) {
                vscode.window.showErrorMessage(this.t('MSG_PYSERIAL_MISSING'));
                return;
            }

            // 準備待部署的原始碼
            const mcuCodePath = path.join(tempDir, 'mcu_code.py');
            fs.writeFileSync(mcuCodePath, cleanCode, 'utf8');

            // 獲取靜態部署腳本路徑
            const deployScriptPath = path.join(this.context.extensionPath, 'resources', 'deploy_mcu.py');

            // --- 優化：合併為一階段執行，避免多次打開序列埠導致重啟 ---
            await this.stopAllCocoyaTerminals();
            
            // 永遠開啟一個乾淨的終端機，確保不會用到正在 disposed 的舊視窗
            const terminal = vscode.window.createTerminal('Cocoya Execution');
            
            terminal.show();
            // 直接執行：這會觸發「上傳中」訊息並接著進入「監控」
            const lang = vscode.env.language.toLowerCase().startsWith('zh') ? 'zh-hant' : 'en';
            const serialFlag = message.serialUploadOnly ? '--serial-only' : '';
            terminal.sendText(`& "${pythonPath}" "${deployScriptPath}" "${port}" "${mcuCodePath}" ${serialFlag} --lang ${lang}`);
            
            this.panel.webview.postMessage({ command: 'runCompleted' });
            return;
        }

        // --- 原有的 PC 執行邏輯 ---
        const tempFilePath = path.join(tempDir, 'cocoya_run.py');
        fs.writeFileSync(tempFilePath, cleanCode, 'utf8');

        let pythonPath = this.context.globalState.get<string>('pythonPath', 'python');
        if (!await this.validatePythonPath(pythonPath)) {
            const pick = await vscode.window.showErrorMessage(this.t('MSG_PYTHON_NOT_FOUND', pythonPath), this.t('MSG_SELECT_PATH'));
            if (pick === this.t('MSG_SELECT_PATH')) {
                const uris = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Executables': ['exe'] } });
                if (uris && uris[0]) {
                    pythonPath = uris[0].fsPath;
                    await this.context.globalState.update('pythonPath', pythonPath);
                } else return;
            } else return;
        }

        let terminal = vscode.window.terminals.find(t => t.name === 'Cocoya Execution');
        if (!terminal) terminal = vscode.window.createTerminal('Cocoya Execution');
        terminal.show();

        // 2. 如果已存檔，先切換終端機目錄至專案路徑
        if (this.currentFilePath) {
            const projectDir = path.dirname(this.currentFilePath);
            // 使用 pushd 以便後續可以 popd，或是單純 cd
            terminal.sendText(`cd "${projectDir}"`);
        }

        terminal.sendText(`& "${pythonPath}" "${tempFilePath}"`);
        this.panel.webview.postMessage({ command: 'runCompleted' });
    }

    private async validatePySerial(pPath: string): Promise<boolean> {
        return new Promise((resolve) => {
            exec(`"${pPath}" -c "import serial"`, (error) => {
                resolve(!error);
            });
        });
    }

    private async validatePythonPath(pPath: string): Promise<boolean> {
        return new Promise((resolve) => {
            exec(`"${pPath}" --version`, (error) => {
                resolve(!error);
            });
        });
    }

    private handleStopCode() {
        const terminal = vscode.window.terminals.find(t => t.name === 'Cocoya Execution');
        if (terminal) {
            terminal.show();
            // 發送多次 Ctrl+C，第一次停掉電腦端的 Python，第二次以後停掉板子上的程式
            terminal.sendText('\u0003\u0003\u0003');
            
            // 延遲一下再關閉，讓中斷訊號有時間傳出去
            setTimeout(() => {
                terminal.dispose();
            }, 500);
        }
    }

    private async handleCloseEditor(message: any) {
        if (await this.checkDirtyAndConfirm(message)) this.panel.dispose();
    }

    private scheduleUpdateCheck() {
        setTimeout(() => this.checkUpdate(), 2000);
    }

    private async checkUpdate() {
        const currentVersion = this.context.extension.packageJSON.version;
        const repo = "simfonia/Cocoya";
        const options = { hostname: 'api.github.com', path: `/repos/${repo}/releases/latest`, headers: { 'User-Agent': 'vscode-extension-cocoya' } };
        https.get(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const release = JSON.parse(data);
                    if (!release.tag_name) return;
                    const latestVersion = release.tag_name.replace('v', '');
                    const hasUpdate = this.isNewerVersion(currentVersion, latestVersion);
                    this.panel.webview.postMessage({ command: 'updateStatus', data: { hasUpdate, currentVersion, latestVersion, url: `https://github.com/${repo}/releases` } });
                } catch (e) {}
            });
        }).on('error', () => {});
    }

    private async handlePickMcuModel(message: any) {
        interface McuPickItem extends vscode.QuickPickItem {
            id: string;
        }
        const items: McuPickItem[] = message.options.map((opt: any) => ({
            label: opt.label,
            id: opt.id
        }));
        const selection = await vscode.window.showQuickPick(items, {
            placeHolder: this.localeMessages['MSG_SELECT_MCU_MODEL'] || 'Select MCU model'
        });
        this.panel.webview.postMessage({ 
            command: 'promptResponse', 
            requestId: message.requestId, 
            result: selection ? selection.id : null 
        });
    }

    /**
     * 執行韌體重置 (UF2 燒錄 或 Serial 燒錄)
     */
    private async handleResetFirmware(model: string, shouldClear: boolean = true, serialPort: string = '') {
        // [關鍵修正] 燒錄前先關閉所有可能佔用序列埠的 Cocoya 終端機
        await this.stopAllCocoyaTerminals();

        let srcPath: string | undefined;
        let firmwareFileName: string | undefined;
        let isSerial = model.includes('SERIAL') || model.includes('CAMERA') || model.includes('FACTORY');
        let flashSegments: { addr: string, path: string }[] = [];

        if (model === 'custom') {
            const uris = await vscode.window.showOpenDialog({
                canSelectMany: false,
                filters: { 'Firmware': ['uf2', 'bin'] },
                title: 'Select Custom Firmware'
            });
            if (uris && uris[0]) {
                const sPath = uris[0].fsPath;
                firmwareFileName = path.basename(sPath);
                if (firmwareFileName.endsWith('.bin')) isSerial = true;
                flashSegments.push({ addr: '0x0', path: sPath });
                srcPath = sPath;
            } else return;
        } else {
            // --- 關鍵對應：將 UI ID 映射到實際目錄 ---
            let subDir = 'XIAO_ESP32_S3';
            if (model.includes('CAMERA')) {
                subDir = path.join('XIAO_ESP32_S3', 'Sense_microPython');
            } else if (model.includes('FACTORY')) {
                subDir = path.join('XIAO_ESP32_S3', 'Sense_Factory');
            } else if (model.includes('RP2040')) {
                subDir = 'MakerPi_RP2040';
            }

            const firmwareDir = path.join(this.context.extensionPath, 'resources', 'firmware', 'MicroPython', subDir);
            if (!fs.existsSync(firmwareDir)) {
                vscode.window.showErrorMessage(`Firmware directory not found: ${firmwareDir}`);
                return;
            }

            // 檢查是否有專案組態檔 (支援多段燒錄)
            const configPath = path.join(firmwareDir, 'project_config.json');
            if (isSerial && fs.existsSync(configPath)) {
                try {
                    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    const projectKey = model.includes('SENSE') ? 'xiao_esp32_sense_factory' : 'xiao_esp32_factory';
                    const files = config[projectKey];
                    if (files) {
                        for (const [addr, name] of Object.entries(files)) {
                            const fPath = path.join(firmwareDir, name as string);
                            if (fs.existsSync(fPath)) {
                                flashSegments.push({ addr, path: fPath });
                            }
                        }
                    }
                } catch (e) {}
            }

            // 如果沒有組態，退回單一檔案模式
            if (flashSegments.length === 0) {
                const files = fs.readdirSync(firmwareDir);
                if (isSerial) {
                    const binFile = files.find(f => f.endsWith('.bin'));
                    if (!binFile) {
                        vscode.window.showErrorMessage('No .bin file found for serial mode.');
                        return;
                    }
                    flashSegments.push({ addr: '0x0', path: path.join(firmwareDir, binFile) });
                } else {
                    const uf2File = files.find(f => f.endsWith('.uf2'));
                    if (!uf2File) {
                        vscode.window.showErrorMessage('No .uf2 file found in firmware directory.');
                        return;
                    }
                    flashSegments.push({ addr: 'UF2', path: path.join(firmwareDir, uf2File) });
                    firmwareFileName = uf2File;
                }
            }
        }

        if (isSerial) {
            // --- B 方案：Serial 模式 (esptool) ---
            if (!serialPort) {
                vscode.window.showErrorMessage('Please select a serial port first.');
                return;
            }

            const pythonPath = this.getPythonPath();
            const chip = model.includes('ESP32_S3') ? 'esp32s3' : 'auto';
            const terminal = vscode.window.createTerminal('Cocoya Firmware Burn');
            terminal.show();
            
            // 構建 esptool 指令，使用現代語法與高速鮑率
            let cmd = `& "${pythonPath}" -m esptool --chip ${chip} --port ${serialPort} --baud 921600 --before default-reset --after hard-reset write-flash -z --flash-mode dio --flash-freq 80m --flash-size 8MB`;
            for (const seg of flashSegments) {
                cmd += ` ${seg.addr} "${seg.path}"`;
            }

            terminal.sendText(cmd);
            return;
        }

        // --- A 方案：UF2 模式 (磁碟複製) ---
        const uf2File = flashSegments[0];
        let burnTarget: string | null = null;
        const findDisk = (label: string) => {
            try {
                const { execSync } = require('child_process');
                const output = execSync('wmic logicaldisk get name, volumename').toString();
                const lines = output.split('\n');
                for (const line of lines) {
                    if (line.includes(label)) {
                        const match = line.match(/[A-Z]:/);
                        if (match) return match[0] + path.sep;
                    }
                }
            } catch (e) {}
            return null;
        };

        burnTarget = findDisk('RPI-RP2');
        if (!burnTarget) {
            vscode.window.showErrorMessage('Please put MCU into BOOTSEL mode (RPI-RP2 drive not found).');
            return;
        }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Burning firmware...`,
                cancellable: false
            }, async (progress) => {
                const destPath = path.join(burnTarget!, firmwareFileName!);
                fs.copyFileSync(srcPath!, destPath);
                
                if (!shouldClear) {
                    progress.report({ message: "Done. Skip clearing code.py." });
                    return;
                }

                progress.report({ message: "Success! Firmware burned. Rebooting..." });
                await new Promise(resolve => setTimeout(resolve, 3000));
            });
            vscode.window.showInformationMessage(this.localeMessages['MSG_FIRMWARE_BURN_SUCCESS'] || 'Firmware burned and initialized!');
        } catch (e: any) {
            vscode.window.showErrorMessage(`Burning failed: ${e.message}`);
        }
    }

    private isNewerVersion(curr: string, late: string): boolean {
        const c = curr.split('.').map(Number);
        const l = late.split('.').map(Number);
        for (let i = 0; i < 3; i++) {
            if (l[i] > c[i]) return true;
            if (l[i] < c[i]) return false;
        }
        return false;
    }
}

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('cocoya.openWorkspace', () => {
        // 決定許可的資源根目錄
        const roots: vscode.Uri[] = [
            vscode.Uri.joinPath(context.extensionUri, 'ui'),
            vscode.Uri.joinPath(context.extensionUri, 'resources'),
            vscode.Uri.file(path.join(context.extensionPath, 'temp_scripts'))
        ];
        
        // 加入工作區路徑
        if (vscode.workspace.workspaceFolders) {
            vscode.workspace.workspaceFolders.forEach(folder => {
                roots.push(folder.uri);
                // 加入工作區所在的磁碟根目錄
                try {
                    const driveRoot = path.parse(folder.uri.fsPath).root;
                    if (driveRoot) roots.push(vscode.Uri.file(driveRoot));
                } catch (e) {}
            });
        }

        // 強力修復 401：加入常見的磁碟根目錄 (大小寫皆備)
        const commonDrives = ['c', 'd', 'e', 'f', 'C', 'D', 'E', 'F'];
        commonDrives.forEach(drive => {
            try {
                roots.push(vscode.Uri.file(`${drive}:/`));
                roots.push(vscode.Uri.file(`${drive}:\\`));
            } catch (e) {}
        });
        
        // 加入系統根目錄 (在某些 VS Code 版本中有效)
        roots.push(vscode.Uri.file('/'));

        const panel = vscode.window.createWebviewPanel(
            'cocoyaEditor', 
            'Cocoya Editor', 
            vscode.ViewColumn.One, 
            { 
                enableScripts: true, 
                retainContextWhenHidden: true, 
                localResourceRoots: roots
            }
        );
        new CocoyaManager(context, panel);
        panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);
    }));
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const htmlPath = vscode.Uri.joinPath(extensionUri, 'ui', 'index.html');
    let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
    const uiPath = vscode.Uri.joinPath(extensionUri, 'ui');

    const cspSource = webview.cspSource;
    // 強化 CSP：移除過時的 vscode-resource:，改用標準的 cspSource
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${cspSource} 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com; connect-src ${cspSource} 'unsafe-inline' https: https://api.github.com; img-src ${cspSource} https: data: blob:; style-src ${cspSource} 'unsafe-inline' https://cdnjs.cloudflare.com; font-src ${cspSource}; media-src ${cspSource} blob: data:; worker-src blob:;">`;
    
    html = html.replace('<head>', `<head>${csp}`);
    
    // --- 強化版路徑轉換邏輯 ---
    // 匹配 src="/path" 或 src="path"
    html = html.replace(/(src|href)="(\/)?(?!\/|http)(.*?)"/g, (match, attr, slash, pathStr) => {
        // 不論有沒有領頭斜槓，都對齊到 ui/ 路徑下
        const uri = webview.asWebviewUri(vscode.Uri.joinPath(uiPath, pathStr));
        return `${attr}="${uri}"`;
    });
    
    return html;
}

export function deactivate() {
    console.log('[Extension] Deactivating, cleaning up managers...');
    for (const manager of activeManagers) {
        manager.dispose();
    }
    activeManagers.clear();
}
