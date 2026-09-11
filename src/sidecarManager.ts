import * as vscode from 'vscode';
import { ChildProcess, spawn } from 'child_process';
import { hostMsg } from './hostI18n';

/**
 * Dataset Manager Sidecar 進程管理器
 * 負責啟動 Python 進程、維護 stdin/stdout 通訊與生命週期
 */
export class DatasetSidecarManager {
    private process: ChildProcess | null = null;
    private context: vscode.ExtensionContext;
    private pythonPath: string;
    private callbacks: Map<string, (data: any) => void> = new Map();
    private stdoutBuffer: string = ''; 
    /** sidecar 主動事件（type=event）監聽器清單。
     *  歷史教訓（2026-09-10）：原本為單一槽位 `onEvent` 屬性，trainingOps 註冊 trainingLog
     *  時會整個覆蓋 cocoyaManager 的 cameraStatus 轉發，導致手動關閉 OpenCV 視窗後
     *  前端按鈕永遠卡在「停止攝影機」。改為多監聽器，各訂閱者互不干擾。 */
    private eventListeners: Set<(event: string, data: any) => void> = new Set();
    private outputChannel: vscode.OutputChannel;

    /** 註冊 sidecar 事件監聽器；回傳 unsubscribe 函式 */
    public addEventListener(fn: (event: string, data: any) => void): () => void {
        this.eventListeners.add(fn);
        return () => { this.eventListeners.delete(fn); };
    }

    constructor(context: vscode.ExtensionContext, pythonPath: string) {
        this.context = context;
        this.pythonPath = pythonPath;
        this.outputChannel = vscode.window.createOutputChannel("Cocoya Sidecar");
    }

    /**
     * 啟動 Sidecar 進程
     */
    public start(): boolean {
        if (this.process) return true;

        const scriptPath = vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'dataset_manager', 'dataset_sidecar.py').fsPath;
        const workingDir = vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'dataset_manager').fsPath;

        this.outputChannel.appendLine(`[Sidecar Manager] Starting sidecar process...`);
        this.outputChannel.appendLine(`[Sidecar Manager] Python Path: ${this.pythonPath}`);
        this.outputChannel.appendLine(`[Sidecar Manager] Script Path: ${scriptPath}`);

        try {
            this.process = spawn(this.pythonPath, [scriptPath], {
                cwd: workingDir,
                env: Object.assign({}, process.env, { PYTHONIOENCODING: 'utf-8' })
            });

            this.process.on('error', (err) => {
                this.outputChannel.appendLine(`[Sidecar Manager] Failed to start: ${err.message}`);
                this.outputChannel.appendLine(`[Sidecar Manager] Please check:`);
                this.outputChannel.appendLine(`[Sidecar Manager]   1. Python path: ${this.pythonPath}`);
                this.outputChannel.appendLine(`[Sidecar Manager]   2. Script path: ${scriptPath}`);
                this.outputChannel.appendLine(`[Sidecar Manager]   3. Working dir: ${workingDir}`);
                vscode.window.showErrorMessage(hostMsg('sidecarStartFailed'));
            });

            this.process.on('close', (code) => {
                if (code === 9009) {
                    this.outputChannel.appendLine(`[Sidecar Manager] ERROR: Python executable not found (exit code 9009)`);
                    this.outputChannel.appendLine(`[Sidecar Manager] Current pythonPath: ${this.pythonPath}`);
                    this.outputChannel.appendLine(`[Sidecar Manager] Please set Python path via: Cocoya: Set Python Path`);
                }
            });

            this.process.stdout?.on('data', (data) => {
                const raw = data.toString();
                this.outputChannel.append(`[Sidecar stdout] ${raw}`);
                this.stdoutBuffer += raw;
                const lines = this.stdoutBuffer.split('\n');
                
                this.stdoutBuffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    try {
                        const msg = JSON.parse(trimmed);
                        
                        if (msg.type === 'response' && msg.requestId && this.callbacks.has(msg.requestId)) {
                            const cb = this.callbacks.get(msg.requestId);
                            if (cb) cb(msg);
                            this.callbacks.delete(msg.requestId);
                        }
                        else if (msg.type === 'response') {
                            // 診斷：response 到了但沒有對應 callback（requestId 不配對）——過去會無聲丟失，
                            // 造成訓練完成但前端/通知完全無反應
                            const unMatched = `[Sidecar Manager] response without callback (requestId=${msg.requestId}, success=${msg.success})`;
                            this.outputChannel.appendLine(unMatched);
                            console.warn(unMatched);
                        }
                        else if (msg.type === 'event' && msg.event) {
                            if (this.eventListeners.size > 0) {
                                for (const listener of this.eventListeners) {
                                    try {
                                        listener(msg.event, msg);
                                    } catch (e: any) {
                                        // 防禦：單一 listener 例外不得中斷其他 listener 或靜默吞掉
                                        const errMsg = `[Sidecar Manager] event listener error (${msg.event}): ${e?.message || e}`;
                                        this.outputChannel.appendLine(errMsg);
                                        console.error(errMsg);
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.log('[Sidecar Log]', trimmed);
                    }
                }
            });

            this.process.stderr?.on('data', (data) => {
                const str = data.toString().trim();
                if (!str) return;

                this.outputChannel.appendLine(`[Sidecar stderr] ${str}`);

                if (str.includes('DeprecationWarning') || str.includes('UserWarning')) {
                    console.warn('[Sidecar Warning]', str);
                    return;
                }

                if (str.includes('[Sidecar Log]')) {
                    console.log(str);
                } else {
                    console.error('[Sidecar Error]', str);
                }
            });

            this.process.on('close', (code) => {
                this.outputChannel.appendLine(`[Sidecar Manager] Process exited with code ${code}`);
                console.log(`[Sidecar] Process exited with code ${code}`);
                this.process = null;
            });

            return true;
        } catch (e: any) {
            this.outputChannel.appendLine(`[Sidecar Manager] Spawn failed: ${e.message || e}`);
            console.error('[Sidecar] Spawn failed', e);
            return false;
        }
    }

    /**
     * 發送指令至 Sidecar
     */
    public send(command: string, data: any, callback?: (response: any) => void) {
        if (!this.process) {
            if (!this.start()) {
                this.outputChannel.appendLine(`[Sidecar Manager] Failed to start sidecar, command "${command}" aborted.`);
                if (callback) {
                    callback({
                        type: 'response',
                        success: false,
                        error: '無法啟動本地 Python Sidecar 服務。請確認 VS Code 中的 Python 環境路徑設定正確，且已安裝 Python。'
                    });
                }
                return;
            }
        }

        const requestId = data.requestId || Math.random().toString(36).substring(7);
        if (callback) {
            this.callbacks.set(requestId, callback);
        }

        const msg = Object.assign({ command, requestId }, data);
        this.outputChannel.appendLine(`[Sidecar Manager] Sending command "${command}" (ID: ${requestId})`);
        this.process?.stdin?.write(JSON.stringify(msg) + '\n');
    }

    /**
     * 關閉 Sidecar
     */
    public stop() {
        if (this.process) {
            this.send('exit', {});
            this.process.kill();
            this.process = null;
        }
    }
}