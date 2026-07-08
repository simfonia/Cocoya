import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

/**
 * 資料集操作 Handler（拍照、掃描、匯出、上傳等）
 */
export class DatasetOpsHandler {
    private manager: any;

    constructor(manager: any) {
        this.manager = manager;
    }

    public handleOpenDatasetManager() {
        this.manager.panel.webview.postMessage({ command: 'openDatasetManager' });
    }

    public async handlePickFolder(message: any) {
        const { requestId, fieldName } = message;
        const lastPath = (this.manager.context.globalState as any).get('lastDatasetFolder') as string | undefined;
        
        try {
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
                await this.manager.context.globalState.update('lastDatasetFolder', folderPath);
                this.manager.panel.webview.postMessage({
                    command: 'folderSelected',
                    requestId: requestId,
                    fieldName: fieldName,
                    path: folderPath
                });
            } else {
                this.manager.panel.webview.postMessage({
                    command: 'folderSelected',
                    requestId: requestId,
                    fieldName: fieldName,
                    error: '使用者取消選擇'
                });
            }
        } catch (e: any) {
            vscode.window.showErrorMessage('選擇資料夾失敗: ' + e.message);
            this.manager.panel.webview.postMessage({
                command: 'folderSelected',
                requestId: requestId,
                fieldName: fieldName,
                error: e.message
            });
        }
    }

    public async scanDatasetFolder(folderPath: string) {
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
                        const parts = relDir.split(path.sep);
                        const label = parts.length > 0 && parts[parts.length - 1] !== '' ? parts[parts.length - 1] : 'unlabeled';

                        if (!labelCounts[label]) {
                            labelCounts[label] = 0;
                            labelMap[label] = nextLabelId++;
                        }
                        labelCounts[label]++;

                        images.push({
                            name: entry.name,
                            path: relPath.replace(/\\/g, '/'),
                            label: label,
                            blobUrl: this.manager.panel.webview.asWebviewUri(vscode.Uri.file(fullPath)).toString()
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

    public async handleDatasetExport(message: any) {
        console.log('[Host] Received datasetExport request', message.spec?.project?.name);
        const spec = message.spec;
        const projectName = spec.project?.name || 'dataset';
        const sourceFolderPath = message.sourceFolderPath; 
        
        const baseDir = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0)
            ? vscode.workspace.workspaceFolders[0].uri.fsPath
            : path.join(this.manager.context.extensionPath, 'temp_scripts');
        
        const datasetDir = path.join(baseDir, 'dataset', projectName);
        const specPath = path.join(datasetDir, 'dataset.json');

        try {
            if (!fs.existsSync(datasetDir)) {
                fs.mkdirSync(datasetDir, { recursive: true });
            }

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

            this.manager.sidecar.start();
            this.manager.sidecar.send('exportDataset', {
                sourceDir: datasetDir,
                outputZip: outputZip
            }, (resp: any) => {
                if (resp.success) {
                    vscode.window.showInformationMessage(`資料集匯出成功: ${resp.path}`);
                    this.manager.panel.webview.postMessage({ command: 'datasetExportResult', success: true, path: resp.path });
                } else {
                    vscode.window.showErrorMessage(`資料集匯出失敗: ${resp.error}`);
                    this.manager.panel.webview.postMessage({ command: 'datasetExportResult', success: false, error: resp.error });
                }
            });

        } catch (e: any) {
            vscode.window.showErrorMessage(`匯出程序錯誤: ${e.message}`);
            this.manager.panel.webview.postMessage({ command: 'datasetExportResult', success: false, error: e.message });
        }
    }

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

    public async handleDatasetUploadArchive(message: any) {
        const { fileId, chunkIndex, totalChunks, zipDataChunk, projectName, isLast,
                host, port, username, password } = message;

        if (!host || !username || !password) {
            this.manager.panel.webview.postMessage({
                command: 'datasetUploadResult',
                success: false,
                error: '缺少 SSH 連線資訊，請重新開啟資料集管理員並輸入帳密。'
            });
            return;
        }

        if (!this.manager.uploadBuffers.has(fileId)) {
            this.manager.uploadBuffers.set(fileId, new Array(totalChunks));
        }

        const chunks = this.manager.uploadBuffers.get(fileId)!;
        chunks[chunkIndex] = Buffer.from(zipDataChunk, 'base64');

        if (!isLast) return;

        const tempDir = path.join(this.manager.context.extensionPath, 'temp_scripts');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        const localZipPath = path.join(tempDir, projectName + '_upload.zip');

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '正在準備上傳資料集至雲端伺服器...',
            cancellable: false
        }, async (progress) => {
            try {
                const completeBuffer = Buffer.concat(chunks);
                fs.writeFileSync(localZipPath, completeBuffer);
                this.manager.uploadBuffers.delete(fileId);

                progress.report({ message: '正在透過 SFTP 上傳至遠端...' });

                this.manager.sidecar.start();
                this.manager.sidecar.send('uploadDataset', {
                    host,
                    port: port || 22,
                    username,
                    password,
                    projectName,
                    localZipPath: localZipPath.replace(/\\/g, '/')
                }, (resp: any) => {
                    if (resp.success) {
                        vscode.window.showInformationMessage('資料集 ' + projectName + ' 已成功上傳至雲端伺服器！');
                        this.manager.panel.webview.postMessage({ command: 'datasetUploadResult', success: true });
                    } else {
                        vscode.window.showErrorMessage('上傳失敗: ' + (resp.error || '原因未知'));
                        this.manager.panel.webview.postMessage({
                            command: 'datasetUploadResult',
                            success: false,
                            error: resp.error || '上傳失敗'
                        });
                    }
                });

            } catch (e: any) {
                vscode.window.showErrorMessage('資料集上傳錯誤: ' + e.message);
                this.manager.panel.webview.postMessage({ command: 'datasetUploadResult', success: false, error: e.message });
            }
        });
    }

    public handleDatasetStartCamera(message: any) {
        this.manager.sidecar.start();
        this.manager.sidecar.send('startCamera', { deviceId: message.deviceId || 0 }, (resp: any) => {
            this.manager.panel.webview.postMessage({ command: 'datasetCameraStatus', success: resp.success });
        });
    }

    public handleDatasetStopCamera() {
        this.manager.sidecar.send('stopCamera', {});
    }

    public handleDatasetCaptureImage(message: any) {
        const baseDir = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0)
            ? vscode.workspace.workspaceFolders[0].uri.fsPath
            : path.join(this.manager.context.extensionPath, 'temp_scripts');

        const projectName = message.projectName || 'dataset';
        const label = message.label || 'unlabeled';
        const timestamp = Date.now();
        const savePath = message.savePath || path.join(baseDir, 'dataset', projectName, label, `${label}_${timestamp}.jpg`);
        
        console.log(`[Host] Requesting capture: ${savePath} (ID: ${message.requestId})`);
        
        this.manager.sidecar.send('captureImage', { 
            savePath, 
            label,
            requestId: message.requestId
        }, (resp: any) => {
            console.log(`[Host] Capture result received for ID: ${resp.requestId}`);
            this.manager.panel.webview.postMessage(Object.assign({ command: 'datasetCaptureResult' }, resp));
        });
    }
}