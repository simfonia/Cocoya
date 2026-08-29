import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 訓練相關操作 Handler
 */
export class TrainingOpsHandler {
    private manager: any;

    constructor(manager: any) {
        this.manager = manager;
    }

    /**
     * 處理模型訓練請求（本地或遠端）
     */
    public async handleStartTraining(message: any) {
        const { projectName, taskType, backend, sshConfig, datasetDir, outputDir } = message;

        const baseDir = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0)
            ? vscode.workspace.workspaceFolders[0].uri.fsPath
            : path.join(this.manager.context.extensionPath, 'temp_scripts');

        const finalDatasetDir = datasetDir || path.join(baseDir, 'dataset', projectName);
        const finalOutputDir = outputDir || path.join(baseDir, 'model', projectName);

        console.log(`[Training] Starting training:`);
        console.log(`[Training]   projectName: ${projectName}`);
        console.log(`[Training]   baseDir: ${baseDir}`);
        console.log(`[Training]   datasetDir: ${finalDatasetDir}`);
        console.log(`[Training]   outputDir: ${finalOutputDir}`);
        console.log(`[Training]   backend: ${backend}`);

        if (backend === 'local') {
            this.manager.sidecar.start();
            this.manager.sidecar.send('trainLocal', {
                projectName,
                taskType,
                datasetDir: finalDatasetDir,
                outputDir: finalOutputDir,
                hyperparams: {
                    epochs: 30,
                    batchSize: 32,
                    learningRate: 0.001
                }
            }, (resp: any) => {
                if (resp.success) {
                    console.log(`[Training] Training completed successfully:`);
                    console.log(`[Training]   modelDir: ${resp.modelDir}`);
                    console.log(`[Training]   reportPath: ${resp.reportPath}`);
                    console.log(`[Training]   curvePath: ${resp.curvePath}`);
                    
                    vscode.window.showInformationMessage(`訓練完成！模型已儲存至: ${resp.modelDir}`);
                    this.manager.panel.webview.postMessage({
                        command: 'trainingComplete',
                        success: true,
                        modelDir: resp.modelDir,
                        projectName: resp.projectName,
                        accuracy: resp.accuracy,
                        epochs: resp.epochs,
                        curvePath: resp.curvePath,
                        historyPath: resp.historyPath,
                        reportPath: resp.reportPath
                    });
                } else {
                    console.error(`[Training] Training failed:`, resp.error);
                    vscode.window.showErrorMessage('訓練失敗: ' + (resp.error || '未知錯誤'));
                    this.manager.panel.webview.postMessage({
                        command: 'trainingError',
                        success: false,
                        error: resp.error || '訓練失敗'
                    });
                }
            });

            this.manager.sidecar.onEvent = (event: string, data: any) => {
                if (event === 'trainingLog') {
                    this.manager.panel.webview.postMessage({
                        command: 'trainingLog',
                        message: data.message
                    });
                }
            };

        } else if (backend === 'dgx' || backend === 'remote') {
            vscode.window.showWarningMessage('遠端訓練功能開發中，請使用本地訓練模式。');
            this.manager.panel.webview.postMessage({
                command: 'trainingError',
                success: false,
                error: '遠端訓練功能尚未開放'
            });
        }
    }

    /**
     * 處理遠端訓練請求（RemoteTrainingRefactor D3/D4：backend=remote 執行當下由 host 觸發）
     * 流程：SSH 精靈(前端) -> sidecar trainRemote（同步 -> Docker 遠端訓練 -> 下載 .keras/labels）
     */
    public handleStartRemoteTraining(message: any) {
        const { code, syncMode, datasetDir, sshConfig } = message;

        // 從產出程式碼解析超參數（積木產生之 train_model(...) 呼叫）
        const pick = (re: RegExp, dflt: string) => {
            const m = (code || '').match(re);
            return m ? m[1] : dflt;
        };
        const taskType = pick(/task_type='([^']+)'/, 'classifier');
        const projectName = path.basename(datasetDir || '') || pick(/--project_name/, 'training_project');
        const epochs = parseInt(pick(/epochs=(\d+)/, '30'), 10) || 30;
        const batchSize = parseInt(pick(/batch_size=(\d+)/, '32'), 10) || 32;
        const learningRate = parseFloat(pick(/learning_rate=([\d.]+)/, '0.001')) || 0.001;
        const validationSplit = parseFloat(pick(/validation_split=([\d.]+)/, '0.2')) || 0.2;
        const dropout = parseFloat(pick(/dropout=([\d.]+)/, '0.2')) || 0.2;
        const augmentation = pick(/augmentation=(True|False)/, 'False') === 'True' ? 'true' : 'false';
        const backbone = pick(/backbone='([^']+)'/, 'mobilenetv2');
        const optimizer = pick(/optimizer='([^']+)'/, 'adam');
        const dnnLayers = pick(/dnn_layers='([^']+)'/, '128,64');
        const fineTune = pick(/fine_tune=(True|False)/, 'False') === 'True' ? 'true' : 'false';
        const modelOutput = pick(/model_output='([^']+)'/, 'none');

        // 解析本地資料集目錄（相對路徑以專案目錄為基準）
        let baseDir = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0)
            ? vscode.workspace.workspaceFolders[0].uri.fsPath
            : path.join(this.manager.context.extensionPath, 'temp_scripts');
        if (this.manager.currentFilePath) {
            baseDir = path.dirname(this.manager.currentFilePath);
        }
        const localDatasetDir = path.isAbsolute(datasetDir) ? datasetDir : path.join(baseDir, datasetDir || '');
        const outputDir = path.join(baseDir, 'model', projectName);

        if (!sshConfig || !sshConfig.host || !sshConfig.username || !sshConfig.password) {
            vscode.window.showErrorMessage('缺少 SSH 連線資訊，請重新執行遠端訓練。');
            this.manager.panel.webview.postMessage({
                command: 'trainingError',
                success: false,
                error: '缺少 SSH 連線資訊'
            });
            return;
        }

        console.log(`[RemoteTraining] dataset=${localDatasetDir} project=${projectName} sync=${syncMode} epochs=${epochs}`);
        this.manager.sidecar.start();
        this.manager.sidecar.send('trainRemote', {
            host: sshConfig.host,
            port: sshConfig.port || 22,
            username: sshConfig.username,
            password: sshConfig.password,
            localDatasetDir,
            projectName,
            syncMode: syncMode || 'smart',
            hyperparams: {
                    epochs, batchSize, learningRate,
                    validationSplit, dropout, augmentation,
                    backbone, optimizer, dnnLayers, fineTune,
                    modelOutput, taskType
                },
            outputDir,
            dockerImage: 'cocoya-train-' + (taskType === 'detector' ? 'detector' : 'classifier')
        }, (resp: any) => {
            if (resp.success) {
                vscode.window.showInformationMessage(`遠端訓練完成！模型已下載至: ${resp.modelDir}`);
                this.manager.panel.webview.postMessage({
                    command: 'trainingComplete',
                    success: true,
                    modelDir: resp.modelDir,
                    projectName: resp.projectName
                });
            } else {
                vscode.window.showErrorMessage('遠端訓練失敗: ' + (resp.error || '未知錯誤'));
                this.manager.panel.webview.postMessage({
                    command: 'trainingError',
                    success: false,
                    error: resp.error || '遠端訓練失敗'
                });
            }
        });

        this.manager.sidecar.onEvent = (event: string, data: any) => {
            if (event === 'trainingLog') {
                this.manager.panel.webview.postMessage({
                    command: 'trainingLog',
                    message: data.message
                });
            }
        };
    }

    /**
     * 用系統預設瀏覽器開啟 HTML 訓練報告
     */
    public handleOpenTrainingReport(message: any) {
        const reportPath = message.path;
        if (!reportPath) {
            vscode.window.showErrorMessage('找不到訓練報告檔案: 路徑為空');
            return;
        }

        // 若為相對路徑，結合當前專案目錄解析（對齊 Tauri 版 open_report 行為）
        let resolvedPath = reportPath;
        if (!path.isAbsolute(reportPath)) {
            const baseDir = this.manager.currentFilePath
                ? path.dirname(this.manager.currentFilePath)
                : (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
                    ? vscode.workspace.workspaceFolders[0].uri.fsPath
                    : this.manager.context.extensionPath);
            resolvedPath = path.resolve(baseDir, reportPath);
        }

        if (!fs.existsSync(resolvedPath)) {
            vscode.window.showErrorMessage('找不到訓練報告檔案: ' + resolvedPath);
            return;
        }
        
        console.log(`[TrainingReport] Opening report in browser:`);
        console.log(`[TrainingReport]   path: ${reportPath}`);
        
        const hasChinesePath = /[\u4e00-\u9fa5]/.test(resolvedPath);
        
        if (hasChinesePath) {
            this.showChinesePathError(resolvedPath);
            return;
        }
        
        vscode.env.openExternal(vscode.Uri.file(resolvedPath)).then((success: boolean) => {
            if (!success) {
                console.error(`[TrainingReport] openExternal returned false`);
                vscode.window.showErrorMessage(`開啟失敗，請手動開啟檔案：\n${resolvedPath}`);
            } else {
                console.log(`[TrainingReport] Successfully opened in browser`);
            }
        }, (err: any) => {
            console.error(`[TrainingReport] openExternal failed:`, err);
            vscode.window.showErrorMessage(`開啟失敗，請手動開啟檔案：\n${resolvedPath}\n\n錯誤：${err.message || '未知錯誤'}`);
        });
    }
    
    /**
     * 顯示中文路徑錯誤提示
     */
    private showChinesePathError(reportPath: string) {
        const errorMsg = `開啟訓練報告失敗！

原因：路徑或檔名包含中文，導致無法直接開啟。

解決方案：
1. 將專案資料夾移到英文路徑，例如：
   C:/Workspace/training/
   
2. 自行開啟：
   ${reportPath}

3. 建議：專案資料夾中的路徑及檔名都以英文命名。`;
        
        vscode.window.showErrorMessage(errorMsg, { modal: true });
    }

    /**
     * 開啟目前專案 model 目錄下最新的訓練報告
     */
    public async handleOpenLatestTrainingReport() {
        let baseDir: string;
        if (this.manager.currentFilePath) {
            baseDir = path.dirname(this.manager.currentFilePath);
            console.log(`[TrainingReport] Using current project dir: ${baseDir}`);
        } else if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            baseDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
            console.log(`[TrainingReport] Using workspace folder: ${baseDir}`);
        } else {
            baseDir = path.join(this.manager.context.extensionPath, 'temp_scripts');
            console.log(`[TrainingReport] Using fallback temp_scripts: ${baseDir}`);
        }

        const modelDir = path.join(baseDir, 'model');
        console.log(`[TrainingReport] Searching in modelDir: ${modelDir}`);
        
        if (!fs.existsSync(modelDir)) {
            const msg = `尚無訓練結果，請先執行訓練。\n(搜尋路徑: ${modelDir})`;
            vscode.window.showInformationMessage(msg);
            console.log(`[TrainingReport] modelDir does not exist: ${modelDir}`);
            return;
        }

        const reportFiles: string[] = [];
        const walk = (dir: string) => {
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        walk(fullPath);
                    } else if (entry.name.endsWith('_training_report.html')) {
                        reportFiles.push(fullPath);
                    }
                }
            } catch (e) {}
        };
        walk(modelDir);

        console.log(`[TrainingReport] Found ${reportFiles.length} report(s):`, reportFiles);

        if (reportFiles.length === 0) {
            const msg = `尚無訓練結果，請先執行訓練。\n(搜尋路徑: ${modelDir})`;
            vscode.window.showInformationMessage(msg);
            console.log(`[TrainingReport] No reports found in: ${modelDir}`);
            return;
        }

        reportFiles.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
        
        if (reportFiles.length > 1) {
            console.log(`[TrainingReport] Multiple reports found, showing picker...`);
            const items = reportFiles.map(filePath => {
                const projectName = path.basename(path.dirname(filePath));
                const mtime = fs.statSync(filePath).mtime;
                const timeStr = mtime.toLocaleString('zh-TW', { 
                    month: 'short', 
                    day: 'numeric', 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                return {
                    label: projectName,
                    description: timeStr,
                    path: filePath
                };
            });

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `找到 ${reportFiles.length} 個訓練報告，請選擇要開啟的項目：`
            });

            if (selected) {
                console.log(`[TrainingReport] User selected: ${selected.path}`);
                this.handleOpenTrainingReport({ path: selected.path });
            } else {
                console.log(`[TrainingReport] User cancelled selection`);
            }
        } else {
            const latest = reportFiles[0];
            console.log(`[TrainingReport] Opening only report: ${latest}`);
            this.handleOpenTrainingReport({ path: latest });
        }
    }
}