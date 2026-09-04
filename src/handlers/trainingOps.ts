import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { hostMsg } from '../hostI18n';

/**
 * 訓練/雲端訓練的 VS Code 終端機（方案 A）
 * 將 sidecar 的 trainingLog 逐行導向原生 Pseudoterminal，而非 webview 自訂 terminal。
 * 仿照 envOps.ts runCode 既有成功 pattern：writeEmitter、\n→\r\n、不 fire closeEmitter 保持開啟。
 */
export class TrainingTerminal {
    private static instance: { terminal: vscode.Terminal; write: (s: string) => void } | null = null;

    static get(): { terminal: vscode.Terminal; write: (s: string) => void } {
        if (TrainingTerminal.instance) {
            return TrainingTerminal.instance;
        }
        const writeEmitter = new vscode.EventEmitter<string>();
        const closeEmitter = new vscode.EventEmitter<void>();
        const pty: vscode.Pseudoterminal = {
            onDidWrite: writeEmitter.event,
            onDidClose: closeEmitter.event,
            open: () => {
                writeEmitter.fire('Cocoya 訓練終端機\r\n');
            },
            close: () => {
                // 不 fire closeEmitter：讓終端機保持開啟供回顧歷史
            }
        };
        const terminal = vscode.window.createTerminal({ name: 'Cocoya Training', pty });
        terminal.show();
        TrainingTerminal.instance = { terminal, write: (s) => writeEmitter.fire(s.replace(/\n/g, '\r\n')) };
        return TrainingTerminal.instance;
    }

    static dispose() {
        if (TrainingTerminal.instance) {
            TrainingTerminal.instance.terminal.dispose();
            TrainingTerminal.instance = null;
        }
    }

    static writeLine(s: string) {
        try {
            const inst = TrainingTerminal.get();
            inst.write(s + '\n');
        } catch (e: any) {
            // 防禦：Pseudoterminal 建立或寫入失敗不得靜默（先前例外會被 sidecarManager 的 try/catch 吞掉，
            // 造成「訓練成功但 VS Code 終端機零訊息」）。fallback 寫入輸出頻道供診斷。
            const msg = `[TrainingTerminal] write failed: ${e?.message || e}`;
            console.error(msg);
            TrainingTerminal.fallback().appendLine(msg);
            TrainingTerminal.fallback().appendLine(s);
        }
    }

    /** 錯誤 fallback 輸出頻道（延遲建立） */
    static fallback(): vscode.OutputChannel {
        if (!TrainingTerminal._fallbackChannel) {
            TrainingTerminal._fallbackChannel = vscode.window.createOutputChannel('Cocoya Training (fallback)');
        }
        return TrainingTerminal._fallbackChannel;
    }

    private static _fallbackChannel: vscode.OutputChannel | null = null;
}

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
                    
                    vscode.window.showInformationMessage(hostMsg('localComplete', resp.modelDir));
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
                    vscode.window.showErrorMessage(hostMsg('localFailed', resp.error || 'Unknown error'));
                    this.manager.panel.webview.postMessage({
                        command: 'trainingError',
                        success: false,
                        error: resp.error || hostMsg('localFailedErr')
                    });
                }
            });

            this.manager.sidecar.onEvent = (event: string, data: any) => {
                if (event === 'trainingLog') {
                    // 方案 A：導向 VS Code 原生終端機，而非 webview 自訂 terminal
                    TrainingTerminal.writeLine(data.message || '');
                }
            };

        } else if (backend === 'dgx' || backend === 'remote') {
            vscode.window.showWarningMessage(hostMsg('remoteNotAvailable'));
            this.manager.panel.webview.postMessage({
                command: 'trainingError',
                success: false,
                error: hostMsg('remoteNotAvailableErr')
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
            vscode.window.showErrorMessage(hostMsg('missingSsh'));
            this.manager.panel.webview.postMessage({
                command: 'trainingError',
                success: false,
                error: hostMsg('missingSshErr')
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
                vscode.window.showInformationMessage(hostMsg('remoteComplete', resp.modelDir));
                TrainingTerminal.writeLine(hostMsg('remoteCompleteMarker'));
                // 轉發完整產物路徑（sidecar send_response 已掃描），webview 靠 reportPath 開訓練報告
                this.manager.panel.webview.postMessage({
                    command: 'trainingComplete',
                    success: true,
                    remote: true,
                    modelDir: resp.modelDir,
                    projectName: resp.projectName,
                    downloaded: resp.downloaded,
                    modelOutput: resp.modelOutput,
                    reportPath: resp.reportPath,
                    kerasPath: resp.kerasPath,
                    curvePath: resp.curvePath,
                    historyPath: resp.historyPath,
                    tflitePaths: resp.tflitePaths
                });
            } else {
                vscode.window.showErrorMessage(hostMsg('remoteFailed', resp.error || 'Unknown error'));
                TrainingTerminal.writeLine(hostMsg('remoteFailedMarker', resp.error || 'Unknown error'));
                this.manager.panel.webview.postMessage({
                    command: 'trainingError',
                    success: false,
                    error: resp.error || '遠端訓練失敗'
                });
            }
        });

        // 方案 A：trainingLog 導向 VS Code 原生終端機，而非 webview 自訂 terminal。
        // 第一筆 trainingLog 額外送一次性 trainingConnected 信號給 webview，讓「連線中…」點點計時器提前停止
        //（trainingComplete 才停會讓點點跑完整場訓練，2026-09-03 使用者回報）。
        let connectedSignalSent = false;
        this.manager.sidecar.onEvent = (event: string, data: any) => {
            if (event === 'trainingLog') {
                TrainingTerminal.writeLine(data.message || '');
                if (!connectedSignalSent) {
                    connectedSignalSent = true;
                    this.manager.panel.webview.postMessage({ command: 'trainingConnected' });
                }
            }
        };
    }

    /**
     * 用系統預設瀏覽器開啟 HTML 訓練報告
     */
    public handleOpenTrainingReport(message: any) {
        const reportPath = message.path;
        if (!reportPath) {
            vscode.window.showErrorMessage(hostMsg('reportNotFoundEmpty'));
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
            vscode.window.showErrorMessage(hostMsg('reportNotFound', resolvedPath));
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
                vscode.window.showErrorMessage(hostMsg('openFailed', resolvedPath));
            } else {
                console.log(`[TrainingReport] Successfully opened in browser`);
            }
        }, (err: any) => {
            console.error(`[TrainingReport] openExternal failed:`, err);
            vscode.window.showErrorMessage(hostMsg('openFailedWithErr', resolvedPath, err.message || 'Unknown error'));
        });
    }
    
    /**
     * 顯示中文路徑錯誤提示
     */
    private showChinesePathError(reportPath: string) {
        const errorMsg = hostMsg('chinesePathError', reportPath);
        
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
            const msg = hostMsg('noTrainingResults', modelDir);
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
            const msg = hostMsg('noTrainingResults', modelDir);
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
                placeHolder: hostMsg('reportPickerPlaceholder', String(reportFiles.length))
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