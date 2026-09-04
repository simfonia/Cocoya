import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { hostMsg } from '../hostI18n';

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
                title: hostMsg('pickFolderTitle')
            });

            if (uris && uris[0]) {
                const folderPath = uris[0].fsPath;
                await this.manager.context.globalState.update('lastDatasetFolder', folderPath);
                
                // 掃描資料夾取得影像資訊、標籤統計與對照表
                const { images, labelCounts, labelMap } = await this.scanDatasetFolder(folderPath);
                
                this.manager.panel.webview.postMessage({
                    command: 'folderSelected',
                    requestId: requestId,
                    fieldName: fieldName,
                    path: folderPath,
                    images: images,
                    labelCounts: labelCounts,
                    labelMap: labelMap
                });
            } else {
                this.manager.panel.webview.postMessage({
                    command: 'folderSelected',
                    requestId: requestId,
                    fieldName: fieldName,
                    error: hostMsg('userCancelledPick')
                });
            }
        } catch (e: any) {
            vscode.window.showErrorMessage(hostMsg('folderPickFailed', e.message));
            this.manager.panel.webview.postMessage({
                command: 'folderSelected',
                requestId: requestId,
                fieldName: fieldName,
                error: e.message
            });
        }
    }

    /**
     * 資料集匯入前置檢查（2026-08-26 決策：資料集必須位於專案根 dataset/<專案名>）。
     * 來源即 canonical → action='use'；來源在外 → confirm_required；confirmed=true 時複製後掃描 canonical。
     */
    public async handleDatasetImportFromFolder(message: any) {
        const { requestId, sourcePath, projectName, confirmed } = message;
        const post = (payload: any) => this.manager.panel.webview.postMessage(
            Object.assign({ command: 'datasetImportFromFolderResult', requestId }, payload)
        );

        if (!sourcePath || !projectName) {
            return post({ errorCode: 'PARAM_REQUIRED', error: '缺少 sourcePath 或 projectName' });
        }

        // 專案根 SSOT：xml 所在資料夾優先，其次工作區根
        const projectRoot = this.manager.currentFilePath
            ? path.dirname(this.manager.currentFilePath)
            : ((vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0)
                ? vscode.workspace.workspaceFolders[0].uri.fsPath
                : undefined);
        if (!projectRoot) {
            return post({ errorCode: 'PROJECT_ROOT_REQUIRED', error: '未錨定專案，請先開新或開啟一個 .xml 專案' });
        }

        const safeName = String(projectName).trim();
        if (!safeName || safeName === '.' || safeName === '..' || !/^[A-Za-z0-9_-]+$/.test(safeName)) {
            return post({ errorCode: 'PROJECT_NAME_INVALID', error: `專案名稱不可用於路徑: ${projectName}` });
        }

        const canonicalDir = path.join(projectRoot, 'dataset', safeName);
        const norm = (p: string) => {
            let s = String(p).replace(/\\/g, '/').replace(/\/+$/, '');
            if (process.platform === 'win32') s = s.toLowerCase();
            return s;
        };

        try {
            if (norm(sourcePath) === norm(canonicalDir)) {
                const scan = await this.scanDatasetFolder(canonicalDir);
                return post({ action: 'use', path: canonicalDir.replace(/\\/g, '/'), ...scan });
            }

            if (!confirmed) {
                return post({ action: 'confirm_required', canonicalDir: canonicalDir.replace(/\\/g, '/') });
            }

            if (!fs.existsSync(sourcePath)) {
                return post({ errorCode: 'IO_ERROR', error: '來源資料夾不存在' });
            }
            let copiedFiles = 0;
            const copyMerge = (src: string, dst: string) => {
                fs.mkdirSync(dst, { recursive: true });
                for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
                    const s = path.join(src, entry.name);
                    const d = path.join(dst, entry.name);
                    if (entry.isDirectory()) {
                        copyMerge(s, d);
                    } else if (!fs.existsSync(d)) {
                        fs.copyFileSync(s, d);
                        copiedFiles++;
                    }
                }
            };
            copyMerge(sourcePath, canonicalDir);

            const scan = await this.scanDatasetFolder(canonicalDir);
            post({ action: 'copied', path: canonicalDir.replace(/\\/g, '/'), copiedFiles, ...scan });
        } catch (e: any) {
            console.error('[Host] Dataset import from folder failed:', e);
            post({ errorCode: 'IO_ERROR', error: e.message });
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
                title: hostMsg('exportSaveTitle')
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
                    vscode.window.showInformationMessage(hostMsg('exportSuccess', resp.path));
                    this.manager.panel.webview.postMessage({ command: 'datasetExportResult', success: true, path: resp.path });
                } else {
                    vscode.window.showErrorMessage(hostMsg('exportFailed', resp.error));
                    this.manager.panel.webview.postMessage({ command: 'datasetExportResult', success: false, error: resp.error });
                }
            });

        } catch (e: any) {
            vscode.window.showErrorMessage(hostMsg('exportError', e.message));
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
            title: hostMsg('uploadingTitle'),
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
                        vscode.window.showInformationMessage(hostMsg('uploadSuccess', projectName));
                        this.manager.panel.webview.postMessage({ command: 'datasetUploadResult', success: true });
                    } else {
                        vscode.window.showErrorMessage(hostMsg('uploadFailed', resp.error || hostMsg('unknownCause')));
                        this.manager.panel.webview.postMessage({
                            command: 'datasetUploadResult',
                            success: false,
                            error: resp.error || '上傳失敗'
                        });
                    }
                });

            } catch (e: any) {
                vscode.window.showErrorMessage(hostMsg('uploadError', e.message));
                this.manager.panel.webview.postMessage({ command: 'datasetUploadResult', success: false, error: e.message });
            }
        });
    }

    public handleDatasetListCameras(message: any) {
        this.manager.sidecar.start();
        this.manager.sidecar.send('listCameras', {}, (resp: any) => {
            this.manager.panel.webview.postMessage({
                command: 'datasetCameraListResult',
                success: resp.success,
                cameras: resp.cameras || []
            });
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

    public handleDatasetDeleteImage(message: any) {
        const filePath = message.filePath;
        if (!filePath) {
            this.manager.panel.webview.postMessage({
                command: 'datasetDeleteImageResult',
                success: false,
                error: '缺少檔案路徑'
            });
            return;
        }
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`[Host] Deleted image file: ${filePath}`);
                this.manager.panel.webview.postMessage({
                    command: 'datasetDeleteImageResult',
                    success: true
                });
            } else {
                // 檔案可能來自外部資料夾、或已被其他方式刪除 — 視為成功
                console.log(`[Host] Image file not found (may be external): ${filePath}`);
                this.manager.panel.webview.postMessage({
                    command: 'datasetDeleteImageResult',
                    success: true
                });
            }
        } catch (e: any) {
            console.error(`[Host] Failed to delete image: ${filePath}`, e);
            this.manager.panel.webview.postMessage({
                command: 'datasetDeleteImageResult',
                success: false,
                error: e.message
            });
        }
    }

    public handleDatasetCaptureImage(message: any) {
        // 依「專案根 SSOT」決定 live 拍照落盤位置：xml 專案所在資料夾優先；
        // 其次工作區根；再降級 temp_scripts（未錨定）。
        const projectRoot = this.manager.currentFilePath
            ? path.dirname(this.manager.currentFilePath)
            : undefined;
        const baseDir = projectRoot
            || ((vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0)
                ? vscode.workspace.workspaceFolders[0].uri.fsPath
                : undefined)
            || path.join(this.manager.context.extensionPath, 'temp_scripts');

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
/**
     * 儲存資料集標註進度（等級一存讀）
     * 寫入「專案根/dataset/<專案>/dataset.json」（內含 spec + annotations）
     */
    public async handleDatasetSaveProgress(message: any) {
        const { projectName, spec } = message;
        if (!spec) {
            this.manager.panel.webview.postMessage({
                command: 'datasetSaveProgressResult',
                success: false,
                errorCode: 'SPEC_REQUIRED',
                error: '缺少資料集規格 (spec)'
            });
            return;
        }

        // 專案名稱驗證（對齊 core/pathPolicy 契約：[A-Za-z0-9_-]+，拒絕 . 與 ..）
        const safeName = String(projectName || 'dataset').trim();
        if (!safeName || safeName === '.' || safeName === '..' || !/^[A-Za-z0-9_-]+$/.test(safeName)) {
            this.manager.panel.webview.postMessage({
                command: 'datasetSaveProgressResult',
                success: false,
                errorCode: 'PROJECT_NAME_INVALID',
                error: `專案名稱不可用於路徑: ${projectName}`
            });
            return;
        }

        // 依「專案根 SSOT」決定位置：xml 專案所在資料夾優先；其次工作區根；未錨定則拒絕（避免亂放）。
        const projectRoot = this.manager.currentFilePath
            ? path.dirname(this.manager.currentFilePath)
            : ((vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0)
                ? vscode.workspace.workspaceFolders[0].uri.fsPath
                : undefined);

        if (!projectRoot) {
            this.manager.panel.webview.postMessage({
                command: 'datasetSaveProgressResult',
                success: false,
                errorCode: 'PROJECT_ROOT_REQUIRED',
                error: '未錨定專案，請先開新或開啟一個 .xml 專案後再儲存進度'
            });
            return;
        }

        const datasetDir = path.join(projectRoot, 'dataset', safeName);
        const specPath = path.join(datasetDir, 'dataset.json');

        try {
            if (!fs.existsSync(datasetDir)) {
                fs.mkdirSync(datasetDir, { recursive: true });
            }
            fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));
            console.log(`[Host] Saved dataset progress: ${specPath}`);
            this.manager.panel.webview.postMessage({
                command: 'datasetSaveProgressResult',
                success: true,
                path: specPath.replace(/\\/g, '/')
            });
        } catch (e: any) {
            console.error(`[Host] Failed to save dataset progress: ${e}`);
            this.manager.panel.webview.postMessage({
                command: 'datasetSaveProgressResult',
                success: false,
                errorCode: 'IO_ERROR',
                error: e.message
            });
        }
    }

    /**
     * 讀取資料集標註進度（等級一存讀）
     * 契約（2026-08-26 canonical-only 匯入閘後精簡）：
     * folderPath 必為 `<專案根>/dataset/<專案名>`，直接讀取 "folderPath/dataset.json"；
     * 無檔案 → hasProgress=false + PROGRESS_NOT_FOUND。
     */
    public async handleDatasetLoadProgress(message: any) {
        const { folderPath } = message;
        if (!folderPath) {
            this.manager.panel.webview.postMessage({
                command: 'datasetLoadProgressResult',
                success: false,
                errorCode: 'FOLDER_PATH_REQUIRED',
                error: '缺少資料夾路徑'
            });
            return;
        }

        const normalize = (p: string) => p.replace(/\\/g, '/');
        const directPath = path.join(folderPath, 'dataset.json');

        try {
            if (!fs.existsSync(directPath)) {
                this.manager.panel.webview.postMessage({
                    command: 'datasetLoadProgressResult',
                    success: true,
                    hasProgress: false,
                    errorCode: 'PROGRESS_NOT_FOUND',
                    path: normalize(directPath)
                });
                return;
            }
            const content = fs.readFileSync(directPath, 'utf-8');
            console.log(`[Host] Loaded dataset progress: ${directPath}`);
            this.manager.panel.webview.postMessage({
                command: 'datasetLoadProgressResult',
                success: true,
                hasProgress: true,
                spec: JSON.parse(content),
                path: normalize(directPath)
            });
        } catch (e: any) {
            console.error(`[Host] Failed to load dataset progress: ${e}`);
            this.manager.panel.webview.postMessage({
                command: 'datasetLoadProgressResult',
                success: false,
                errorCode: 'JSON_INVALID',
                error: e.message
            });
        }
    }
}