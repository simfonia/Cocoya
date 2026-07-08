import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { DatasetSidecarManager } from './sidecarManager';
import { TrainingOpsHandler } from './handlers/trainingOps';
import { FileOpsHandler } from './handlers/fileOps';
import { FirmwareOpsHandler } from './handlers/firmwareOps';
import { DatasetOpsHandler } from './handlers/datasetOps';
import { SerialOpsHandler } from './handlers/serialOps';
import { EnvOpsHandler } from './handlers/envOps';

/**
 * Cocoya Extension 主管理器
 * 負責協調 Webview 通訊、檔案操作與程式執行
 */
export class CocoyaManager {
    public currentFilePath: string | undefined;
    public currentPlatform: string = 'PC';
    public localeMessages: any = {};
    public panel: vscode.WebviewPanel;
    public context: vscode.ExtensionContext;
    public lastDirtyState: boolean = false;
    public sidecar: DatasetSidecarManager;
    public cloudAiEnabled: boolean = false;
    public remoteWorkspaceRoot: string | undefined;
    public uploadBuffers: Map<string, Buffer[]> = new Map();

    // Handler 實例
    public trainingOps: TrainingOpsHandler;
    public fileOps: FileOpsHandler;
    public firmwareOps: FirmwareOpsHandler;
    public datasetOps: DatasetOpsHandler;
    public serialOps: SerialOpsHandler;
    public envOps: EnvOpsHandler;

    constructor(context: vscode.ExtensionContext, panel: vscode.WebviewPanel) {
        this.context = context;
        this.panel = panel;

        const pythonPath = this.getPythonPath();
        this.sidecar = new DatasetSidecarManager(context, pythonPath);

        // 初始化 handlers
        this.trainingOps = new TrainingOpsHandler(this);
        this.fileOps = new FileOpsHandler(this);
        this.firmwareOps = new FirmwareOpsHandler(this);
        this.datasetOps = new DatasetOpsHandler(this);
        this.serialOps = new SerialOpsHandler(this);
        this.envOps = new EnvOpsHandler(this);

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

        this.panel.onDidDispose(() => {
            console.log('[Extension] Panel disposed, stopping sidecar...');
            this.sidecar.stop();
            activeManagers.delete(this);
        }, null, this.context.subscriptions);

        activeManagers.add(this);

        setTimeout(() => this.serialOps.handleRefreshSerialPorts(), 1000);
        this.updateTitle();
    }

    public dispose() {
        this.sidecar.stop();
    }

    public getPythonPath(): string {
        return this.context.globalState.get<string>('pythonPath', 'python');
    }

    /**
     * 翻譯輔助函式 (Host 端)
     */
    public t(key: string, ...args: string[]): string {
        let msg = this.localeMessages[key] || key;
        args.forEach((arg, i) => msg = msg.replace(`%${i + 1}`, arg));
        return msg;
    }

    public updateTitle() {
        const displayName = this.currentFilePath ? path.basename(this.currentFilePath) : this.t('TLB_FILE_NEW');
        const dirtyMarker = this.lastDirtyState ? '*' : '';

        if (this.currentFilePath) {
            const folderName = path.basename(path.dirname(this.currentFilePath));
            this.panel.title = `${displayName}${dirtyMarker} (${folderName}) - Cocoya`;
            vscode.window.setStatusBarMessage(`Cocoya Project: ${this.currentFilePath}`, 5000);
        } else {
            this.panel.title = `${displayName}${dirtyMarker} - Cocoya`;
        }
    }

    /**
     * 停止所有 Cocoya 相關的終端機任務，釋放序列埠
     */
    public async stopAllCocoyaTerminals() {
        const cocoyaTerminals = vscode.window.terminals.filter(t => t.name.startsWith('Cocoya'));
        for (const t of cocoyaTerminals) {
            t.sendText('\u0003');
            await new Promise(resolve => setTimeout(resolve, 300));
            t.dispose();
        }
    }

    /**
     * 設定 Webview 訊息監聽器
     */
    private setupMessageListener() {
        this.panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'setLocale':
                    this.localeMessages = message.messages;
                    this.updateTitle();
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
                    await this.fileOps.handleNewFile(message);
                    break;
                case 'openFile':
                    await this.fileOps.handleOpenFile(message);
                    break;
                case 'saveFile':
                    await this.fileOps.handleSaveFile(message);
                    break;
                case 'saveFileAs':
                    await this.fileOps.handleSaveFileAs(message);
                    break;
                case 'openSerialMonitor':
                    await this.stopAllCocoyaTerminals();
                    this.serialOps.handleOpenSerialMonitor(message);
                    break;
                case 'refreshSerialPorts':
                    await this.serialOps.handleRefreshSerialPorts();
                    break;
                case 'setPythonPath':
                    await this.serialOps.handleSetPythonPath();
                    break;
                case 'runCode':
                    await this.envOps.handleRunCode(message);
                    break;
                case 'stopCode':
                    this.envOps.handleStopCode();
                    break;
                case 'checkUpdate':
                    const v = this.context.extension.packageJSON.version;
                    vscode.window.showInformationMessage(this.t('MSG_UPDATE_LATEST', v));
                    break;
                case 'closeEditor':
                    await this.fileOps.handleCloseEditor(message);
                    break;
                case 'setDirty':
                    this.lastDirtyState = message.isDirty;
                    this.updateTitle();
                    break;
                case 'confirmSwitch':
                    await this.handleConfirmSwitch(message);
                    break;
                case 'checkEnvironment':
                    await this.envOps.handleCheckEnvironment();
                    break;
                case 'installModule':
                    await this.envOps.handleInstallModule(message.module);
                    break;
                case 'pickMcuModel':
                    await this.firmwareOps.handlePickMcuModel(message);
                    break;
                case 'resetFirmware':
                    await this.firmwareOps.handleResetFirmware(message.model, message.shouldClear, message.serialPort);
                    break;
                case 'openHelp':
                    this.handleOpenHelp(message.helpId);
                    break;
                case 'eraseFilesystem':
                    await this.stopAllCocoyaTerminals();
                    this.firmwareOps.handleEraseFilesystem(message);
                    break;
                case 'setupStableMode':
                    await this.stopAllCocoyaTerminals();
                    this.firmwareOps.handleSetupStableMode(message);
                    break;
                case 'autoBackup':
                    this.fileOps.handleAutoBackup(message.xml);
                    break;
                case 'clearBackup':
                    this.fileOps.handleClearBackup();
                    break;
                case 'rejectRecovery':
                    this.fileOps.handleRejectRecovery();
                    break;
                case 'setCloudAiMode':
                    await this.envOps.handleSetCloudAiMode(message.enabled);
                    break;
                case 'datasetStartCamera':
                    this.datasetOps.handleDatasetStartCamera(message);
                    break;
                case 'datasetStopCamera':
                    this.datasetOps.handleDatasetStopCamera();
                    break;
                case 'datasetCaptureImage':
                    this.datasetOps.handleDatasetCaptureImage(message);
                    break;
                case 'datasetExport':
                    await this.datasetOps.handleDatasetExport(message);
                    break;
                case 'datasetUploadArchive':
                    await this.datasetOps.handleDatasetUploadArchive(message);
                    break;
                case 'openDatasetManager':
                    this.datasetOps.handleOpenDatasetManager();
                    break;
                case 'startTraining':
                    await this.trainingOps.handleStartTraining(message);
                    break;
                case 'checkRemoteEnvironment':
                    await this.envOps.handleCheckRemoteEnvironment(message);
                    break;
                case 'pickFolder':
                    await this.datasetOps.handlePickFolder(message);
                    break;
                case 'openTrainingReport':
                    this.trainingOps.handleOpenTrainingReport(message);
                    break;
                case 'openLatestTrainingReport':
                    await this.trainingOps.handleOpenLatestTrainingReport();
                    break;
            }
        }, undefined, this.context.subscriptions);
    }

    private async handleConfirmSwitch(message: any) {
        const choice = await vscode.window.showWarningMessage(
            message.message,
            { modal: true },
            this.t('MSG_SAVE'), this.t('MSG_DONT_SAVE')
        );
        if (choice === this.t('MSG_SAVE')) {
            if (await this.fileOps.performSave(message.xml)) {
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
    }

    private handleGetManifest() {
        const manifestPath = path.join(this.context.extensionPath, 'ui', 'src', 'core_manifest.json');
        const manifest = JSON.parse(require('fs').readFileSync(manifestPath, 'utf8'));

        const mediaUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'ui', 'src')).toString();

        let lang = vscode.env.language.toLowerCase();
        if (lang === 'zh-tw' || lang === 'zh-hant') lang = 'zh-hant';
        else if (lang.startsWith('en')) lang = 'en';
        else lang = 'en';

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

        const tempBPath = path.join(this.context.extensionPath, 'temp_scripts', 'untitled_backup.xml');
        if (require('fs').existsSync(tempBPath)) {
            const xml = require('fs').readFileSync(tempBPath, 'utf8');
            this.panel.webview.postMessage({ command: 'recoveryData', xml: xml });
        }
    }

    private handleGetModuleToolbox(message: any) {
        const toolboxPath = path.join(this.context.extensionPath, 'ui', 'src', 'modules', message.moduleId, 'toolbox.xml');
        if (require('fs').existsSync(toolboxPath)) {
            const xml = require('fs').readFileSync(toolboxPath, 'utf8');
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
        const choice = await vscode.window.showInformationMessage(message.message, { modal: true }, ok);
        this.panel.webview.postMessage({ command: 'promptResponse', requestId: message.requestId, result: choice === ok });
    }

    private handleOpenHelp(helpId: string) {
        if (!helpId) return;
        const helpUri = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'docs', `${helpId}.html`);
        vscode.env.openExternal(helpUri);
    }

    private scheduleUpdateCheck() {
        setTimeout(() => this.envOps.checkUpdate(), 2000);
    }
}

// 全域管理器註冊表，用於清理
export const activeManagers: Set<CocoyaManager> = new Set();