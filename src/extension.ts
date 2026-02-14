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
    private localeMessages: any = {};
    private panel: vscode.WebviewPanel;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext, panel: vscode.WebviewPanel) {
        this.context = context;
        this.panel = panel;
        this.setupMessageListener();
        this.scheduleUpdateCheck();
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
            }
        }, undefined, this.context.subscriptions);
    }

    // --- 訊息處理方法 ---

    private handleGetManifest() {
        const manifestPath = path.join(this.context.extensionPath, 'media', 'core_manifest.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const mediaUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media')).toString();
        this.panel.webview.postMessage({ command: 'manifestData', data: manifest, mediaUri });
    }

    private handleGetModuleToolbox(message: any) {
        const toolboxPath = path.join(this.context.extensionPath, 'media', 'core_modules', message.moduleId, 'toolbox.xml');
        const xml = fs.readFileSync(toolboxPath, 'utf8');
        this.panel.webview.postMessage({ command: 'toolboxData', data: xml, requestId: message.requestId });
    }

    private async handlePrompt(message: any) {
        const result = await vscode.window.showInputBox({ prompt: message.message, value: message.defaultValue });
        this.panel.webview.postMessage({ command: 'promptResponse', requestId: message.requestId, result });
    }

    /**
     * 檢查髒狀態並詢問是否儲存
     * @returns boolean 是否繼續執行後續動作 (false 代表取消)
     */
    private async checkDirtyAndConfirm(message: any): Promise<boolean> {
        if (!message.isDirty) return true;

        const choice = await vscode.window.showWarningMessage(
            this.t('MSG_SAVE_CONFIRM'),
            { modal: true },
            this.t('MSG_SAVE'), this.t('MSG_DONT_SAVE')
        );

        if (choice === this.t('MSG_SAVE')) {
            return await this.performSave(message.xml);
        }
        return choice === this.t('MSG_DONT_SAVE'); // 取消或關閉對話框回傳 false
    }

    private async performSave(xml: string): Promise<boolean> {
        if (this.currentFilePath) {
            fs.writeFileSync(this.currentFilePath, xml, 'utf8');
            return true;
        } else {
            const uri = await vscode.window.showSaveDialog({ filters: { 'Cocoya Project': ['xml'] } });
            if (uri) {
                this.currentFilePath = uri.fsPath;
                fs.writeFileSync(this.currentFilePath, xml, 'utf8');
                this.updateTitle();
                return true;
            }
        }
        return false;
    }

    private updateTitle() {
        const filename = this.currentFilePath ? path.basename(this.currentFilePath) : '';
        this.panel.title = filename ? `Cocoya - ${filename}` : 'Cocoya Editor';
    }

    private async handleNewFile(message: any) {
        if (await this.checkDirtyAndConfirm(message)) {
            this.currentFilePath = undefined;
            this.updateTitle();
            this.panel.webview.postMessage({ command: 'resetWorkspace' });
        }
    }

    private async handleOpenFile(message: any) {
        if (await this.checkDirtyAndConfirm(message)) {
            const uris = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Cocoya Project': ['xml'] } });
            if (uris && uris[0]) {
                this.currentFilePath = uris[0].fsPath;
                const content = fs.readFileSync(this.currentFilePath, 'utf8');
                const filename = path.basename(this.currentFilePath);
                this.updateTitle();
                this.panel.webview.postMessage({ command: 'loadWorkspace', xml: content, filename });
            }
        }
    }

    private async handleSaveFile(message: any) {
        if (await this.performSave(message.xml)) {
            const filename = this.currentFilePath ? path.basename(this.currentFilePath) : undefined;
            this.panel.webview.postMessage({ command: 'saveCompleted', success: true, filename });
        }
    }

    private async handleSaveFileAs(message: any) {
        const uri = await vscode.window.showSaveDialog({ filters: { 'Cocoya Project': ['xml'] } });
        if (uri) {
            this.currentFilePath = uri.fsPath;
            fs.writeFileSync(this.currentFilePath, message.xml, 'utf8');
            this.updateTitle();
            this.panel.webview.postMessage({ command: 'saveCompleted', success: true, filename: path.basename(this.currentFilePath) });
        }
    }

    private async handleSetPythonPath() {
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { 'Executables': ['exe'] },
            title: '選取 python.exe'
        });
        if (uris && uris[0]) {
            const newPath = uris[0].fsPath;
            await this.context.globalState.update('pythonPath', newPath);
            vscode.window.showInformationMessage(this.t('MSG_PYTHON_UPDATED', newPath));
        }
    }

    private async handleRunCode(message: any) {
        const tempDir = path.join(this.context.extensionPath, 'temp_scripts');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const tempFilePath = path.join(tempDir, 'cocoya_run.py');
        
        const cleanCode = message.code.replace(/\u0001ID:.*?\u0002/g, '').replace(/# ID:.*?\n/g, '');
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
        if (await this.checkDirtyAndConfirm(message)) {
            this.panel.dispose();
        }
    }

    private scheduleUpdateCheck() {
        setTimeout(() => this.checkUpdate(), 2000);
    }

    private async checkUpdate() {
        const currentVersion = this.context.extension.packageJSON.version;
        const repo = "simfonia/Cocoya";
        const options = {
            hostname: 'api.github.com',
            path: `/repos/${repo}/releases/latest`,
            headers: { 'User-Agent': 'vscode-extension-cocoya' }
        };

        https.get(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const release = JSON.parse(data);
                    if (!release.tag_name) return;
                    const latestVersion = release.tag_name.replace('v', '');
                    const hasUpdate = this.isNewerVersion(currentVersion, latestVersion);
                    this.panel.webview.postMessage({
                        command: 'updateStatus',
                        data: { hasUpdate, currentVersion, latestVersion, url: `https://github.com/${repo}/releases` }
                    });
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
    context.subscriptions.push(
        vscode.commands.registerCommand('cocoya.openWorkspace', () => {
            const panel = vscode.window.createWebviewPanel(
                'cocoyaEditor', 'Cocoya Editor', vscode.ViewColumn.One,
                { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')] }
            );
            new CocoyaManager(context, panel);
            panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);
        })
    );
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const htmlPath = vscode.Uri.joinPath(extensionUri, 'media', 'index.html');
    let html = fs.readFileSync(htmlPath.fsPath, 'utf8');
    const mediaPath = vscode.Uri.joinPath(extensionUri, 'media');
    
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src * 'unsafe-inline'; img-src * data: blob:; style-src * 'unsafe-inline';">`;
    html = html.replace('<head>', `<head>${csp}`);

    html = html.replace(/src="(?!\/|http)(.*?)"/g, (match, p1) => {
        return `src="${webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, p1))}"`;
    });
    return html;
}

export function deactivate() {}
