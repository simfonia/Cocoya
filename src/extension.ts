import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
    console.log('Cocoya Extension: activate() called');

    let disposable = vscode.commands.registerCommand('cocoya.openWorkspace', (uri: vscode.Uri) => {
        console.log('Cocoya: Command triggered');
        
        let localeMessages: any = {};
        const t = (key: string, ...args: string[]) => {
            let msg = localeMessages[key] || key;
            args.forEach((arg, i) => msg = msg.replace(`%${i + 1}`, arg));
            return msg;
        };

        const panel = vscode.window.createWebviewPanel(
            'cocoyaEditor',
            'Cocoya Editor',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'media')
                ]
            }
        );

        // 監聽訊息
        let currentFilePath: string | undefined = undefined;

        const checkUpdate = async () => {
            const currentVersion = context.extension.packageJSON.version;
            const repo = "simfonia/Cocoya";
            console.log(`Cocoya: Checking for updates... (Current: ${currentVersion})`);
            
            const options = {
                hostname: 'api.github.com',
                path: `/repos/${repo}/releases/latest`,
                headers: { 'User-Agent': 'vscode-extension-cocoya' }
            };

            const https = require('https');
            const req = https.get(options, (res: any) => {
                let data = '';
                res.on('data', (chunk: any) => data += chunk);
                res.on('end', () => {
                    try {
                        const release = JSON.parse(data);
                        if (!release.tag_name) {
                            console.log('Cocoya: No release found on GitHub.');
                            return;
                        }
                        const latestVersion = release.tag_name.replace('v', '');
                        console.log(`Cocoya: Latest version on GitHub is ${latestVersion}`);
                        
                        // 版本比較函式
                        const isNewer = (curr: string, late: string) => {
                            const c = curr.split('.').map(Number);
                            const l = late.split('.').map(Number);
                            for (let i = 0; i < 3; i++) {
                                if (l[i] > c[i]) return true;
                                if (l[i] < c[i]) return false;
                            }
                            return false;
                        };

                        const hasUpdate = isNewer(currentVersion, latestVersion);
                        console.log(`Cocoya: hasUpdate = ${hasUpdate}`);

                        panel.webview.postMessage({
                            command: 'updateStatus',
                            data: {
                                hasUpdate: hasUpdate,
                                currentVersion: currentVersion,
                                latestVersion: latestVersion,
                                url: `https://github.com/${repo}/releases`
                            }
                        });
                    } catch (e) {
                        console.error('Cocoya: Failed to parse GitHub release data', e);
                        panel.webview.postMessage({
                            command: 'updateStatus',
                            data: { hasUpdate: false, currentVersion: currentVersion, latestVersion: currentVersion }
                        });
                    }
                });
            });
            req.on('error', () => {
                panel.webview.postMessage({
                    command: 'updateStatus',
                    data: { hasUpdate: false, currentVersion: currentVersion, latestVersion: currentVersion }
                });
            });
        };

        // 啟動 2 秒後檢查更新
        setTimeout(checkUpdate, 2000);

        panel.webview.onDidReceiveMessage(async message => {
            if (message.command === 'setLocale') {
                localeMessages = message.messages;
            } else if (message.command === 'openExternal') {
                vscode.env.openExternal(vscode.Uri.parse(message.url));
            } else if (message.command === 'getManifest') {
                const manifestPath = path.join(context.extensionPath, 'media', 'core_manifest.json');
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                const mediaUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media')).toString();
                panel.webview.postMessage({ 
                    command: 'manifestData', 
                    data: manifest,
                    mediaUri: mediaUri
                });
            } else if (message.command === 'getModuleToolbox') {
                const toolboxPath = path.join(context.extensionPath, 'media', 'core_modules', message.moduleId, 'toolbox.xml');
                const xml = fs.readFileSync(toolboxPath, 'utf8');
                panel.webview.postMessage({ 
                    command: 'toolboxData', 
                    data: xml,
                    requestId: message.requestId
                });
            } else if (message.command === 'prompt') {
                const result = await vscode.window.showInputBox({
                    prompt: message.message,
                    value: message.defaultValue
                });
                panel.webview.postMessage({
                    command: 'promptResponse',
                    requestId: message.requestId,
                    result: result
                });
            } else if (message.command === 'newFile') {
                if (message.isDirty) {
                    const choice = await vscode.window.showWarningMessage(
                        t('MSG_SAVE_CONFIRM'),
                        { modal: true },
                        t('MSG_SAVE'), t('MSG_DONT_SAVE')
                    );
                    if (choice === t('MSG_SAVE')) {
                        // 執行儲存邏輯
                        if (currentFilePath) {
                            fs.writeFileSync(currentFilePath, message.xml, 'utf8');
                        } else {
                            const uri = await vscode.window.showSaveDialog({ filters: { 'Cocoya Project': ['xml'] } });
                            if (uri) {
                                currentFilePath = uri.fsPath;
                                fs.writeFileSync(currentFilePath, message.xml, 'utf8');
                            } else {
                                return; // 取消
                            }
                        }
                    } else if (choice === undefined) {
                        return; // 按下 ESC 或取消
                    }
                }
                currentFilePath = undefined;
                panel.title = 'Cocoya Editor';
                panel.webview.postMessage({ command: 'resetWorkspace' });
            } else if (message.command === 'openFile') {
                if (message.isDirty) {
                    const choice = await vscode.window.showWarningMessage(
                        t('MSG_SAVE_CONFIRM'),
                        { modal: true },
                        t('MSG_SAVE'), t('MSG_DONT_SAVE')
                    );
                    if (choice === t('MSG_SAVE')) {
                        if (currentFilePath) {
                            fs.writeFileSync(currentFilePath, message.xml, 'utf8');
                        } else {
                            const uri = await vscode.window.showSaveDialog({ filters: { 'Cocoya Project': ['xml'] } });
                            if (uri) {
                                currentFilePath = uri.fsPath;
                                fs.writeFileSync(currentFilePath, message.xml, 'utf8');
                            } else {
                                return;
                            }
                        }
                    } else if (choice === undefined) {
                        return;
                    }
                }

                const uris = await vscode.window.showOpenDialog({
                    canSelectMany: false,
                    filters: { 'Cocoya Project': ['xml'] }
                });
                if (uris && uris[0]) {
                    currentFilePath = uris[0].fsPath;
                    const content = fs.readFileSync(currentFilePath, 'utf8');
                    const filename = path.basename(currentFilePath);
                    panel.title = `Cocoya - ${filename}`;
                    panel.webview.postMessage({ command: 'loadWorkspace', xml: content, filename: filename });
                }
            } else if (message.command === 'saveFile') {
                if (currentFilePath) {
                    fs.writeFileSync(currentFilePath, message.xml, 'utf8');
                    panel.webview.postMessage({ command: 'saveCompleted', success: true, filename: path.basename(currentFilePath) });
                } else {
                    const uri = await vscode.window.showSaveDialog({
                        filters: { 'Cocoya Project': ['xml'] }
                    });
                    if (uri) {
                        currentFilePath = uri.fsPath;
                        fs.writeFileSync(currentFilePath, message.xml, 'utf8');
                        const filename = path.basename(currentFilePath);
                        panel.title = `Cocoya - ${filename}`;
                        panel.webview.postMessage({ command: 'saveCompleted', success: true, filename: filename });
                    }
                }
            } else if (message.command === 'saveFileAs') {
                const uri = await vscode.window.showSaveDialog({
                    filters: { 'Cocoya Project': ['xml'] }
                });
                if (uri) {
                    currentFilePath = uri.fsPath;
                    fs.writeFileSync(currentFilePath, message.xml, 'utf8');
                    const filename = path.basename(currentFilePath);
                    panel.title = `Cocoya - ${filename}`;
                    panel.webview.postMessage({ command: 'saveCompleted', success: true, filename: filename });
                }
            } else if (message.command === 'runCode') {
                // 1. 確保暫存目錄存在
                const tempDir = path.join(context.extensionPath, 'temp_scripts');
                if (!fs.existsSync(tempDir)) { fs.mkdirSync(tempDir, { recursive: true }); }
                const tempFilePath = path.join(tempDir, 'cocoya_run.py');
                
                // 2. 清除定位用的標記並寫入
                let cleanCode = message.code.replace(/\u0001ID:.*?\u0002/g, '').replace(/# ID:.*?\n/g, '');
                fs.writeFileSync(tempFilePath, cleanCode, 'utf8');

                // 3. 檢查 Python 路徑效力
                let pythonPath = context.globalState.get<string>('pythonPath', 'python');
                let pathIsValid = false;

                try {
                    // 嘗試執行 --version 來確認該指令/路徑是否有效
                    const { execSync } = require('child_process');
                    execSync(`"${pythonPath}" --version`, { stdio: 'ignore' });
                    pathIsValid = true;
                } catch (e) {
                    pathIsValid = false;
                }
                
                if (!pathIsValid) {
                    const pick = await vscode.window.showErrorMessage(
                        t('MSG_PYTHON_NOT_FOUND', pythonPath),
                        t('MSG_SELECT_PATH')
                    );
                    if (pick === t('MSG_SELECT_PATH')) {
                        const uris = await vscode.window.showOpenDialog({
                            canSelectMany: false,
                            filters: { 'Executables': ['exe'] },
                            title: '選取 python.exe'
                        });
                        if (uris && uris[0]) {
                            pythonPath = uris[0].fsPath;
                            await context.globalState.update('pythonPath', pythonPath);
                        } else {
                            return; // 取消執行
                        }
                    } else {
                        return;
                    }
                }

                // 4. 獲取或建立終端機
                let terminal = vscode.window.terminals.find(t => t.name === 'Cocoya Execution');
                if (!terminal) { terminal = vscode.window.createTerminal('Cocoya Execution'); }
                
                // 5. 顯示並執行
                terminal.show();
                terminal.sendText(`& "${pythonPath}" "${tempFilePath}"`);
                panel.webview.postMessage({ command: 'runCompleted' });

            } else if (message.command === 'setPythonPath') {
                const uris = await vscode.window.showOpenDialog({
                    canSelectMany: false,
                    filters: { 'Executables': ['exe'] },
                    title: '選取 python.exe'
                });
                if (uris && uris[0]) {
                    const newPath = uris[0].fsPath;
                    await context.globalState.update('pythonPath', newPath);
                    vscode.window.showInformationMessage(t('MSG_PYTHON_UPDATED', newPath));
                }
            } else if (message.command === 'checkUpdate') {
                vscode.window.showInformationMessage(t('MSG_UPDATE_LATEST'));
            } else if (message.command === 'stopCode') {
                let terminal = vscode.window.terminals.find(t => t.name === 'Cocoya Execution');
                if (terminal) {
                    terminal.show();
                    terminal.sendText('\u0003'); // 傳送 SIGINT (Ctrl+C)
                }
            } else if (message.command === 'closeEditor') {
                if (message.isDirty) {
                    const choice = await vscode.window.showWarningMessage(
                        t('MSG_SAVE_CONFIRM'),
                        { modal: true },
                        t('MSG_SAVE'), t('MSG_DONT_SAVE')
                    );
                    if (choice === t('MSG_SAVE')) {
                        if (currentFilePath) {
                            fs.writeFileSync(currentFilePath, message.xml, 'utf8');
                        } else {
                            const uri = await vscode.window.showSaveDialog({ filters: { 'Cocoya Project': ['xml'] } });
                            if (uri) {
                                currentFilePath = uri.fsPath;
                                fs.writeFileSync(currentFilePath, message.xml, 'utf8');
                            } else {
                                return;
                            }
                        }
                    } else if (choice === undefined) {
                        return;
                    }
                }
                panel.dispose();
            }
        }, undefined, context.subscriptions);

        panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);
    });

    context.subscriptions.push(disposable);
}

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri) {
    const htmlPath = vscode.Uri.joinPath(extensionUri, 'media', 'index.html');
    let html = fs.readFileSync(htmlPath.fsPath, 'utf8');

    const mediaPath = vscode.Uri.joinPath(extensionUri, 'media');
    
    // 放寬 CSP 進行偵錯
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src * 'unsafe-inline'; img-src * data: blob:; style-src * 'unsafe-inline';">`;
    html = html.replace('<head>', `<head>${csp}`);

    // 替換路徑
    html = html.replace(/src="(?!\/|http)(.*?)"/g, (match: string, p1: string) => {
        const uri = webview.asWebviewUri(vscode.Uri.joinPath(mediaPath, p1));
        return `src="${uri}"`;
    });

    return html;
}

export function deactivate() {}