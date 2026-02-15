import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';

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

    constructor(context: vscode.ExtensionContext, panel: vscode.WebviewPanel) {
        this.context = context;
        this.panel = panel;
        this.setupMessageListener();
        this.scheduleUpdateCheck();
        // 初始重新整理序列埠
        setTimeout(() => this.handleRefreshSerialPorts(), 1000);
        // 初始化標題
        this.updateTitle();
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
                    vscode.window.showInformationMessage(this.t('MSG_UPDATE_LATEST'));
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
            }
        }, undefined, this.context.subscriptions);
    }

    // --- 訊息處理方法 ---

    /**
     * 重新整理序列埠清單 (目前僅支援 Windows)
     */
    private async handleRefreshSerialPorts() {
        const ports: string[] = [];
        try {
            const { execSync } = require('child_process');
            // Windows: 使用 PowerShell 獲取 COM 埠清單
            const output = execSync('powershell "[System.IO.Ports.SerialPort]::GetPortNames()"', { encoding: 'utf8' });
            if (output) {
                const lines = output.split(/\r?\n/).map((s: string) => s.trim()).filter((s: string) => s !== '');
                lines.forEach((p: string) => { if (!ports.includes(p)) ports.push(p); });
            }
        } catch (e) {
            console.error('Failed to list serial ports', e);
        }
        this.panel.webview.postMessage({ command: 'serialPortsData', ports });
    }

    private handleGetManifest() {
        const manifestPath = path.join(this.context.extensionPath, 'media', 'core_manifest.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const mediaUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media')).toString();
        
        // 取得 VS Code 語系並映射
        let lang = vscode.env.language.toLowerCase();
        if (lang === 'zh-tw' || lang === 'zh-hant') lang = 'zh-hant';
        else if (lang.startsWith('en')) lang = 'en';
        else lang = 'en'; // 預設英文

        this.panel.webview.postMessage({ command: 'manifestData', data: manifest, mediaUri, lang: lang });
    }

    private handleGetModuleToolbox(message: any) {
        // 模組現在統一放在 media/modules 下
        const toolboxPath = path.join(this.context.extensionPath, 'media', 'modules', message.moduleId, 'toolbox.xml');

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

    private async checkDirtyAndConfirm(message: any): Promise<boolean> {
        if (!message.isDirty) return true;
        const choice = await vscode.window.showWarningMessage(this.t('MSG_SAVE_CONFIRM'), { modal: true }, this.t('MSG_SAVE'), this.t('MSG_DONT_SAVE'));
        if (choice === this.t('MSG_SAVE')) return await this.performSave(message.xml);
        return choice === this.t('MSG_DONT_SAVE');
    }

    private async performSave(xml: string): Promise<boolean> {
        if (this.currentFilePath) {
            fs.writeFileSync(this.currentFilePath, xml, 'utf8');
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
                this.updateTitle();
                return true;
            }
        }
        return false;
    }

    private updateTitle() {
        const displayName = this.currentFilePath ? path.basename(this.currentFilePath) : this.t('TLB_FILE_NEW');
        const dirtyMarker = this.lastDirtyState ? '*' : '';
        this.panel.title = `Cocoya Editor: [${displayName}${dirtyMarker}]`;
    }

    private async handleNewFile(message: any) {
        if (await this.checkDirtyAndConfirm(message)) {
            this.currentFilePath = undefined;
            this.lastDirtyState = false;
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
                    if (content.includes('type="py_loop_while"')) platform = 'CircuitPython';
                    else if (content.includes('type="py_main"')) platform = 'PC';
                }
                
                this.currentPlatform = platform;
                this.lastDirtyState = false;
                this.updateTitle();
                this.panel.webview.postMessage({ command: 'loadWorkspace', xml: content, filename, platform });
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

        // 1. 清理定位用的標記並準備代碼
        const cleanCode = message.code.replace(/\u0001ID:.*?\u0002/g, '').replace(/# ID:.*?\n/g, '');
        
        if (platform === 'CircuitPython') {
            const port = message.serialPort;
            if (!port) {
                vscode.window.showErrorMessage(this.t('MSG_SELECT_PORT'));
                return;
            }

            // 檢查 Python 與 pyserial 效力
            let pythonPath = this.context.globalState.get<string>('pythonPath', 'python');
            if (!await this.validatePythonPath(pythonPath)) {
                vscode.window.showErrorMessage(this.t('MSG_PYTHON_NOT_FOUND', pythonPath));
                return;
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

            vscode.window.showInformationMessage(this.t('MSG_DEPLOYING_MCU', port));

            let terminal = vscode.window.terminals.find(t => t.name === 'Cocoya Execution');
            if (!terminal) terminal = vscode.window.createTerminal('Cocoya Execution');
            terminal.show();
            terminal.sendText(`& "${pythonPath}" "${deployScriptPath}" "${port}" "${mcuCodePath}"`);
            
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
        terminal.sendText(`& "${pythonPath}" "${tempFilePath}"`);
        this.panel.webview.postMessage({ command: 'runCompleted' });
    }

    private async validatePySerial(pPath: string): Promise<boolean> {
        try {
            const { execSync } = require('child_process');
            execSync(`"${pPath}" -c "import serial"`, { stdio: 'ignore' });
            return true;
        } catch (e) {
            return false;
        }
    }

    private async validatePythonPath(pPath: string): Promise<boolean> {
        try {
            const { execSync } = require('child_process');
            execSync(`"${pPath}" --version`, { stdio: 'ignore' });
            return true;
        } catch (e) {
            return false;
        }
    }

    private handleStopCode() {
        const terminal = vscode.window.terminals.find(t => t.name === 'Cocoya Execution');
        if (terminal) {
            terminal.show();
            terminal.sendText('\u0003');
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
        const panel = vscode.window.createWebviewPanel('cocoyaEditor', 'Cocoya Editor', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')] });
        new CocoyaManager(context, panel);
        panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);
    }));
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const htmlPath = vscode.Uri.joinPath(extensionUri, 'media', 'index.html');
    let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
    const mediaPath = vscode.Uri.joinPath(extensionUri, 'media');
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src * 'unsafe-inline'; img-src * data: blob:; style-src * 'unsafe-inline';">`;
    html = html.replace('<head>', `<head>${csp}`);
    html = html.replace(/src="(?!\/|http)(.*?)"/g, (match, p1) => `src="${webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, p1))}"`);
    return html;
}

export function deactivate() {}
