import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
    console.log('Cocoya Extension: activate() called');

    let disposable = vscode.commands.registerCommand('cocoya.openWorkspace', (uri: vscode.Uri) => {
        console.log('Cocoya: Command triggered');
        
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
        panel.webview.onDidReceiveMessage(async message => {

            if (message.command === 'getManifest') {
                const manifestPath = path.join(context.extensionPath, 'media', 'core_manifest.json');
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                
                const mediaUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media')).toString();
                
                console.log('HOST SENDING: manifestData');
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