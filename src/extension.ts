import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CocoyaManager, activeManagers } from './cocoyaManager';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('cocoya.setPythonPath', async () => {
        const uris = await vscode.window.showOpenDialog({ 
            canSelectMany: false, 
            filters: { 'Executables': ['exe'] }, 
            title: 'Select python.exe' 
        });
        if (uris && uris[0]) {
            const newPath = uris[0].fsPath;
            await context.globalState.update('pythonPath', newPath);
            vscode.window.showInformationMessage(`Python path updated: ${newPath}`);
        }
    }));
    
    context.subscriptions.push(vscode.commands.registerCommand('cocoya.openWorkspace', () => {
        const roots: vscode.Uri[] = [
            vscode.Uri.joinPath(context.extensionUri, 'ui'),
            vscode.Uri.joinPath(context.extensionUri, 'resources'),
            vscode.Uri.file(path.join(context.extensionPath, 'temp_scripts'))
        ];
        
        if (vscode.workspace.workspaceFolders) {
            vscode.workspace.workspaceFolders.forEach(folder => {
                roots.push(folder.uri);
                try {
                    const driveRoot = path.parse(folder.uri.fsPath).root;
                    if (driveRoot) roots.push(vscode.Uri.file(driveRoot));
                } catch (e) {}
            });
        }

        const commonDrives = ['c', 'd', 'e', 'f', 'C', 'D', 'E', 'F'];
        commonDrives.forEach(drive => {
            try {
                roots.push(vscode.Uri.file(`${drive}:/`));
                roots.push(vscode.Uri.file(`${drive}:\\`));
            } catch (e) {}
        });
        
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
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${cspSource} 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com; connect-src ${cspSource} 'unsafe-inline' https: https://api.github.com; img-src ${cspSource} https: data: blob:; style-src ${cspSource} 'unsafe-inline' https://cdnjs.cloudflare.com; font-src ${cspSource}; media-src ${cspSource} blob: data:; worker-src blob:;">`;
    
    html = html.replace('<head>', `<head>${csp}`);
    
    html = html.replace(/(src|href)="(\/)?(?!\/|http)(.*?)"/g, (match, attr, slash, pathStr) => {
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