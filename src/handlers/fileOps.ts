import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 檔案操作 Handler（開檔、存檔、備份、標題更新等）
 */
export class FileOpsHandler {
    private manager: any;

    constructor(manager: any) {
        this.manager = manager;
    }

    public async checkDirtyAndConfirm(message: any): Promise<boolean> {
        if (!message.isDirty) return true;
        const choice = await vscode.window.showWarningMessage(
            this.manager.t('MSG_SAVE_CONFIRM'), { modal: true },
            this.manager.t('MSG_SAVE'), this.manager.t('MSG_DONT_SAVE')
        );
        if (choice === this.manager.t('MSG_SAVE')) return await this.performSave(message.xml);
        return choice === this.manager.t('MSG_DONT_SAVE');
    }

    public async performSave(xml: string): Promise<boolean> {
        if (this.manager.currentFilePath) {
            // 檢查是否要寫入 examples 目錄
            const examplesDir = path.join(this.manager.context.extensionPath, 'examples');
            
            if (this.manager.currentFilePath.startsWith(examplesDir)) {
                // 要寫入 examples 目錄，顯示警告對話框
                const choice = await vscode.window.showWarningMessage(
                    '此為 Cocoya 內建範例目錄，是否要覆蓋原始範例？',
                    { modal: true },
                    '覆蓋範例', '另存新檔'
                );
                
                if (choice === '另存新檔') {
                    await this.handleSaveFileAs({ xml });
                    return true;
                } else if (choice === '覆蓋範例') {
                    fs.writeFileSync(this.manager.currentFilePath, xml, 'utf8');
                    this.handleClearBackup();
                    return true;
                }
                return false;  // 取消
            }
            
            // 一般目錄，直接儲存
            fs.writeFileSync(this.manager.currentFilePath, xml, 'utf8');
            this.handleClearBackup();
            return true;
        } else {
            const lastPath = (this.manager.context.globalState as any).get('lastWorkspacePath') as string | undefined;
            const defaultUri = lastPath ? vscode.Uri.file(lastPath) : undefined;
            const uri = await vscode.window.showSaveDialog({
                filters: { 'Cocoya Project': ['xml'] },
                defaultUri: defaultUri
            });
            if (uri) {
                this.manager.currentFilePath = uri.fsPath;
                await this.manager.context.globalState.update('lastWorkspacePath', path.dirname(this.manager.currentFilePath));
                fs.writeFileSync(this.manager.currentFilePath, xml, 'utf8');
                this.handleClearBackup();
                this.manager.updateTitle();
                return true;
            }
        }
        return false;
    }

    public async handleNewFile(message: any) {
        if (await this.checkDirtyAndConfirm(message)) {
            this.manager.currentFilePath = undefined;
            this.manager.lastDirtyState = false;
            this.handleClearBackup();
            this.manager.updateTitle();
            this.manager.panel.webview.postMessage({ command: 'resetWorkspace' });
        }
    }

    public async handleOpenFile(message: any) {
        if (await this.checkDirtyAndConfirm(message)) {
            const lastPath = (this.manager.context.globalState as any).get('lastWorkspacePath') as string | undefined;
            const defaultUri = lastPath ? vscode.Uri.file(lastPath) : undefined;
            const uris = await vscode.window.showOpenDialog({
                canSelectMany: false,
                filters: { 'Cocoya Project': ['xml'] },
                defaultUri: defaultUri
            });
            if (uris && uris[0]) {
                this.manager.currentFilePath = uris[0].fsPath;
                await this.manager.context.globalState.update('lastWorkspacePath', path.dirname(this.manager.currentFilePath));
                const content = fs.readFileSync(this.manager.currentFilePath, 'utf8');
                const filename = path.basename(this.manager.currentFilePath);

                let platform = 'PC';
                const platformMatch = content.match(/<xml[^>]+platform="([^"]+)"/);
                if (platformMatch) {
                    platform = platformMatch[1];
                } else {
                    if (content.includes('type="py_loop_while"')) platform = 'MicroPython';
                    else if (content.includes('type="py_main"')) platform = 'PC';
                }

                this.manager.currentPlatform = platform;
                this.manager.lastDirtyState = false;
                this.manager.updateTitle();
                this.manager.panel.webview.postMessage({ command: 'loadWorkspace', xml: content, filename, platform });

                const bPath = path.join(path.dirname(this.manager.currentFilePath), `.${path.basename(this.manager.currentFilePath)}.bak`);
                if (fs.existsSync(bPath)) {
                    const backupXml = fs.readFileSync(bPath, 'utf8');
                    if (backupXml.trim() !== content.trim()) {
                        this.manager.panel.webview.postMessage({ command: 'recoveryData', xml: backupXml });
                    }
                }
            }
        }
    }

    public async handleSaveFile(message: any) {
        if (await this.performSave(message.xml)) {
            const filename = this.manager.currentFilePath ? path.basename(this.manager.currentFilePath) : undefined;
            this.manager.lastDirtyState = false;
            this.manager.updateTitle();
            this.manager.panel.webview.postMessage({ command: 'saveCompleted', success: true, filename });
        }
    }

    public async handleSaveFileAs(message: any) {
        const lastPath = (this.manager.context.globalState as any).get('lastWorkspacePath') as string | undefined;
        const defaultUri = lastPath ? vscode.Uri.file(lastPath) : undefined;
        const uri = await vscode.window.showSaveDialog({
            filters: { 'Cocoya Project': ['xml'] },
            defaultUri: defaultUri
        });
        if (uri) {
            this.manager.currentFilePath = uri.fsPath;
            await this.manager.context.globalState.update('lastWorkspacePath', path.dirname(this.manager.currentFilePath));
            fs.writeFileSync(this.manager.currentFilePath, message.xml, 'utf8');
            this.manager.lastDirtyState = false;
            this.manager.updateTitle();
            this.manager.panel.webview.postMessage({ command: 'saveCompleted', success: true, filename: path.basename(this.manager.currentFilePath) });
        }
    }

    public async handleCloseEditor(message: any) {
        if (await this.checkDirtyAndConfirm(message)) this.manager.panel.dispose();
    }

    public handleAutoBackup(xml: string) {
        try {
            let backupPath: string;
            if (this.manager.currentFilePath) {
                const dir = path.dirname(this.manager.currentFilePath);
                const name = path.basename(this.manager.currentFilePath);
                backupPath = path.join(dir, `.${name}.bak`);
            } else {
                const tempDir = path.join(this.manager.context.extensionPath, 'temp_scripts');
                if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                backupPath = path.join(tempDir, 'untitled_backup.xml');
            }
            fs.writeFileSync(backupPath, xml, 'utf8');
        } catch (e) {
            console.error('[Extension] Auto-backup failed', e);
        }
    }

    public handleClearBackup() {
        try {
            if (this.manager.currentFilePath) {
                const bPath = path.join(path.dirname(this.manager.currentFilePath), `.${path.basename(this.manager.currentFilePath)}.bak`);
                if (fs.existsSync(bPath)) fs.unlinkSync(bPath);
            }
            const tempBPath = path.join(this.manager.context.extensionPath, 'temp_scripts', 'untitled_backup.xml');
            if (fs.existsSync(tempBPath)) fs.unlinkSync(tempBPath);
        } catch (e) {}
    }

    public handleRejectRecovery() {
        try {
            let backupPath: string | undefined;
            if (this.manager.currentFilePath) {
                backupPath = path.join(path.dirname(this.manager.currentFilePath), `.${path.basename(this.manager.currentFilePath)}.bak`);
            } else {
                backupPath = path.join(this.manager.context.extensionPath, 'temp_scripts', 'untitled_backup.xml');
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
}