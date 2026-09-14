import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import { exec, spawn } from 'child_process';

/**
 * 環境操作 Handler（環境檢查、模組安裝、更新檢查等）
 */
export class EnvOpsHandler {
    private manager: any;

    constructor(manager: any) {
        this.manager = manager;
    }

    public async handleCheckEnvironment() {
        let pythonPath = this.manager.getPythonPath();
        
        // SSOT: 從 config/python_modules.json 讀取套件清單
        const configPath = path.join(this.manager.context.extensionPath, 'config', 'python_modules.json');
        let moduleDefs: any[] = [];
        try {
            const configContent = fs.readFileSync(configPath, 'utf-8');
            const config = JSON.parse(configContent);
            moduleDefs = config.modules || [];
        } catch (e) {
            console.error('[Cocoya] Failed to load python_modules.json:', e);
        }
        
        const modules = moduleDefs.map(m => m.id);
        
        const checkScript = `
import importlib.util
import json
import platform
import sys

modules = ${JSON.stringify(modules)}
results = {}
for m in modules:
    try:
        results[m] = importlib.util.find_spec(m) is not None
    except:
        results[m] = False
print(json.dumps({
    "results": results,
    "pythonResolvedPath": sys.executable,
    "pythonVersion": platform.python_version()
}))
        `.trim();

        const { execFile } = require('child_process');

        // UTF-8 I/O 鐵律：Windows 下 Python 輸出若為 cp950，父端以 UTF-8 解讀會亂碼
        execFile(pythonPath, ['-c', checkScript], {
            env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
            maxBuffer: 1024 * 1024
        }, (error: any, stdout: string) => {
            let results: any = {};
            // pythonValid：路徑是否真的指向可用的 Python。
            // 這修掉「Python 不存在」與「Python 正常但沒裝套件」在 UI 上長得一樣的問題
            // （兩者都顯示全部未安裝 → 使用者會去按安裝，但 pip 必然也失敗）。
            let pythonValid = !error;
            let pythonResolvedPath = '';
            let pythonVersion = '';
            let pythonError = '';
            if (!error) {
                try {
                    const parsed = JSON.parse(stdout.trim());
                    results = parsed.results || {};
                    pythonResolvedPath = parsed.pythonResolvedPath || '';
                    pythonVersion = parsed.pythonVersion || '';
                } catch (e) {
                    console.error('[Cocoya] Failed to parse environment check output:', e);
                    modules.forEach(m => results[m] = false);
                    pythonValid = false;
                    pythonError = 'PARSE_FAILED';
                }
            } else {
                modules.forEach(m => results[m] = false);
                pythonError = String(error.message || error);
            }

            // 使用 SSOT JSON 的模組定義
            const moduleDefinitions = moduleDefs.filter(m => modules.includes(m.id));

            console.log('[Cocoya] Sending environmentStatus:', {
                command: 'environmentStatus',
                resultsCount: Object.keys(results).length,
                modulesCount: moduleDefinitions.length,
                pythonValid
            });

            this.manager.panel.webview.postMessage({
                command: 'environmentStatus',
                results,
                modules: moduleDefinitions,
                pythonValid,
                pythonResolvedPath,
                pythonVersion,
                pythonError
            });
        });
    }

    /**
     * 安裝單一 Python 套件。
     *
     * 舊作法的兩個根本問題（本次修正）：
     * 1. 輸出送到 VS Code 原生終端機 → 診斷 modal 開著時使用者看不到（pip 進度是 modal 的內容）。
     * 2. 靠 `setTimeout(handleCheckEnvironment, 5000)` 猜完成時間 → tensorflow 要 1~3 分鐘，
     *    5 秒後重檢必然還是「未安裝」，狀態更新是假的。
     *
     * 新作法：spawn 獨立進程，stdout/stderr 轉為 `installModuleLog` 事件，
     * 以 `close`（真實結束訊號）發 `installModuleDone` 驅動前端重檢。
     */
    public async handleInstallModule(moduleId: string, pipPackage?: string, moduleDisplay?: string) {
        const post = (msg: any) => this.manager.panel.webview.postMessage(msg);
        const pipPkg = (pipPackage && pipPackage.trim()) ? pipPackage.trim() : moduleId;

        // 防連點／防並行：同一時間只允許一個 pip 安裝（並行 pip 會互相鎖檔）
        if (this.manager.installChildProcess) {
            post({
                command: 'installModuleDone', moduleId, success: false,
                exitCode: null, aborted: false, errorCode: 'INSTALL_ALREADY_RUNNING'
            });
            return;
        }

        const pythonPath = this.manager.getPythonPath();

        // --progress-bar off：pip 進度條以 \r 原地刷新，逐行讀取會變破碎行
        const child: any = spawn(pythonPath, [
            '-m', 'pip', 'install', pipPkg,
            '--user',
            '--no-warn-script-location',
            '--progress-bar', 'off',
            '--disable-pip-version-check'
        ], {
            // UTF-8 I/O 鐵律
            env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
        });

        this.manager.installChildProcess = child;
        let doneEmitted = false;

        post({ command: 'installModuleLog', moduleId, text: `$ pip install ${pipPkg} --user\n`, stream: 'out' });

        const streamLog = (data: Buffer, stream: 'out' | 'err') => {
            post({ command: 'installModuleLog', moduleId, text: data.toString('utf8'), stream });
        };
        if (child.stdout) child.stdout.on('data', (d: Buffer) => streamLog(d, 'out'));
        if (child.stderr) child.stderr.on('data', (d: Buffer) => streamLog(d, 'err'));

        const finish = (payload: any) => {
            if (doneEmitted) return;
            doneEmitted = true;
            if (this.manager.installChildProcess === child) this.manager.installChildProcess = null;
            post({ command: 'installModuleDone', moduleId, ...payload });
        };

        // spawn 本身失敗（如 python 路徑無效）→ Node 以 error 事件非同步回報
        child.on('error', (err: any) => {
            finish({ success: false, exitCode: null, aborted: false, errorCode: 'SPAWN_FAILED', error: String((err && err.message) || err) });
        });

        child.on('close', (code: number | null) => {
            if (child.__cocoyaAborted) return; // 中止已自行發送 done，避免重複
            finish({ success: code === 0, exitCode: code, aborted: false });
        });
    }

    /**
     * 中止進行中的安裝（終止子進程）。
     *
     * 精準用詞：這是「中止安裝」，**不是**「卸載」（移除已安裝套件）。
     * pip 安裝不是原子操作，中止不會 rollback；已下載的 wheel 留在 pip 快取（無害，重裝會重用）。
     * 由於中止後環境狀態未知，前端會強制重檢該套件，不假設其結果。
     */
    public handleAbortInstall() {
        const child: any = this.manager.installChildProcess;
        if (!child) return;
        this.manager.installChildProcess = null;
        child.__cocoyaAborted = true;

        // Windows：pip 會 spawn build backend 子進程，child.kill() 只殺直接子進程。
        // 必須用 taskkill /T 殺整棵進程樹，否則殘留的子進程會持有檔案鎖導致重試失敗。
        if (process.platform === 'win32' && child.pid) {
            try {
                require('child_process').execFile('taskkill', ['/F', '/T', '/PID', String(child.pid)], () => { /* noop */ });
            } catch (e) {
                console.error('[Cocoya] taskkill failed, falling back to kill():', e);
            }
        }
        try { child.kill(); } catch (e) { /* 進程可能已結束 */ }

        this.manager.panel.webview.postMessage({
            command: 'installModuleDone', moduleId: null, success: false,
            exitCode: null, aborted: true
        });
    }

    public async handleCheckRemoteEnvironment(message: any) {
        const { host, port, username, password } = message;

        if (!host || !username || !password) {
            this.manager.panel.webview.postMessage({
                command: 'checkRemoteEnvironmentResult',
                success: false,
                error: '缺少 SSH 連線資訊，請重新輸入主機、帳號與密碼。'
            });
            return;
        }

        this.manager.sidecar.start();
        this.manager.sidecar.send('checkRemoteEnvironment', {
            host,
            port: port || 22,
            username,
            password
        }, (resp: any) => {
            if (resp.success) {
                this.manager.panel.webview.postMessage({
                    command: 'checkRemoteEnvironmentResult',
                    success: true,
                    status: resp.status
                });
            } else {
                this.manager.panel.webview.postMessage({
                    command: 'checkRemoteEnvironmentResult',
                    success: false,
                    error: resp.error || 'SSH 診斷失敗'
                });
            }
        });
    }

    public async handleRunCode(message: any) {
        const platform = message.platform || this.manager.currentPlatform;
        const tempDir = path.join(this.manager.context.extensionPath, 'temp_scripts');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const cleanCode = message.code.replace(/\u0001ID:.*?\u0002/g, '');
        
        if (platform === 'MicroPython') {
            const port = message.serialPort;
            if (!port) {
                vscode.window.showErrorMessage(this.manager.t('MSG_SELECT_PORT'));
                return;
            }

            let pythonPath = (this.manager.context.globalState as any).get('pythonPath', 'python') as string;
            if (!await this.validatePythonPath(pythonPath)) {
                const pick = await vscode.window.showErrorMessage(this.manager.t('MSG_PYTHON_NOT_FOUND', pythonPath), this.manager.t('MSG_SELECT_PATH'));
                if (pick === this.manager.t('MSG_SELECT_PATH')) {
                    const uris = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Executables': ['exe'] } });
                    if (uris && uris[0]) {
                        pythonPath = uris[0].fsPath;
                        await this.manager.context.globalState.update('pythonPath', pythonPath);
                    } else return;
                } else return;
            }

            if (!await this.validatePySerial(pythonPath)) {
                vscode.window.showErrorMessage(this.manager.t('MSG_PYSERIAL_MISSING'));
                return;
            }

            const mcuCodePath = path.join(tempDir, 'mcu_code.py');
            fs.writeFileSync(mcuCodePath, cleanCode, 'utf8');
            const deployScriptPath = path.join(this.manager.context.extensionPath, 'resources', 'deploy_mcu.py');

            await this.manager.stopAllCocoyaTerminals();
            const terminal = vscode.window.createTerminal('Cocoya Execution');
            terminal.show();
            const lang = vscode.env.language.toLowerCase().startsWith('zh') ? 'zh-hant' : 'en';
            const serialFlag = message.serialUploadOnly ? '--serial-only' : '';
            terminal.sendText(`& "${pythonPath}" "${deployScriptPath}" "${port}" "${mcuCodePath}" ${serialFlag} --lang ${lang}`);
            
            this.manager.panel.webview.postMessage({ command: 'runCompleted' });
            return;
        }

        // PC 執行邏輯
        const tempFilePath = path.join(tempDir, 'cocoya_run.py');
        fs.writeFileSync(tempFilePath, cleanCode, 'utf8');

        let pythonPath = (this.manager.context.globalState as any).get('pythonPath', 'python') as string;
        if (!await this.validatePythonPath(pythonPath)) {
            const pick = await vscode.window.showErrorMessage(this.manager.t('MSG_PYTHON_NOT_FOUND', pythonPath), this.manager.t('MSG_SELECT_PATH'));
            if (pick === this.manager.t('MSG_SELECT_PATH')) {
                const uris = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Executables': ['exe'] } });
                if (uris && uris[0]) {
                    pythonPath = uris[0].fsPath;
                    await this.manager.context.globalState.update('pythonPath', pythonPath);
                } else return;
            } else return;
        }

        // 設定工作目錄為當前專案目錄
        const projectDir = this.manager.currentFilePath
            ? path.dirname(this.manager.currentFilePath)
            : (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
                ? vscode.workspace.workspaceFolders[0].uri.fsPath
                : tempDir);

        // 使用 Pseudoterminal 建立虛擬終端機
        // 優點：支援 ANSI 色碼顯示（與原終端機一致）+ 可攔截輸出解析 RESULT 行
        // 不會將輸出當作命令執行（不像 terminal.sendText）
        const shell = (vscode as any).env?.shell || '';
        const isBashLike = shell.includes('bash') || shell.includes('git-bash') || shell.includes('zsh');
        const isPowerShell = shell.includes('powershell') || shell.includes('pwsh');
        let runCmd: string;
        if (isBashLike) {
            runCmd = `"${pythonPath}" "${tempFilePath}"`;
        } else if (isPowerShell || process.platform === 'win32') {
            runCmd = `& "${pythonPath}" "${tempFilePath}"`;
        } else {
            runCmd = `"${pythonPath}" "${tempFilePath}"`;
        }

        // 建立 Pseudoterminal
        const writeEmitter = new vscode.EventEmitter<string>();
        const closeEmitter = new vscode.EventEmitter<void>();

        const pty: vscode.Pseudoterminal = {
            onDidWrite: writeEmitter.event,
            onDidClose: closeEmitter.event,
            open: () => {
                // 顯示執行命令
                writeEmitter.fire(`# 執行中: ${runCmd}\r\n`);

                // 啟動 Python 進程
                // 編碼修復：Windows pipe 下 Python 預設輸出 cp950，以 UTF-8 解讀會亂碼（對齊 Tauri run_python）
                // 模板路徑：注入 COCOYA_TRAIN_TEMPLATES（extensionPath/resources/train_templates），供 train_model() 候選 0 使用
                const trainTemplatesDir = path.join(this.manager.context.extensionPath, 'resources', 'train_templates');
                const child = spawn(pythonPath, ['-u', tempFilePath], {
                    cwd: projectDir,
                    stdio: ['ignore', 'pipe', 'pipe'],
                    env: {
                        ...process.env,
                        PYTHONIOENCODING: 'utf-8',
                        PYTHONUTF8: '1',
                        COCOYA_TRAIN_TEMPLATES: trainTemplatesDir
                    }
                });

                // 即時串流 stdout 到終端機 + 解析 RESULT 行
                let outputBuffer = '';
                child.stdout.on('data', (data: Buffer) => {
                    const text = data.toString('utf8');
                    outputBuffer += text;
                    // 顯示到終端機（保留 ANSI 色碼）
                    writeEmitter.fire(text.replace(/\n/g, '\r\n'));
                    // 解析 RESULT: {...} 行（由 classifier_train.py 輸出）
                    const lines = outputBuffer.split('\n');
                    for (const line of lines) {
                        const resultIdx = line.indexOf('RESULT:');
                        if (resultIdx !== -1) {
                            try {
                                const result = JSON.parse(line.substring(resultIdx + 7).trim());
                                console.log('[Cocoya] Training result detected:', result);
                                // 發送 trainingComplete 到前端，觸發自動顯示報告
                                this.manager.panel.webview.postMessage({
                                    command: 'trainingComplete',
                                    ...result
                                });
                            } catch (e) {
                                console.warn('[Cocoya] Failed to parse training result:', e);
                            }
                        }
                    }
                    // 清除已處理的行，保留最後不完整的行
                    const lastNewline = outputBuffer.lastIndexOf('\n');
                    if (lastNewline !== -1) {
                        outputBuffer = outputBuffer.substring(lastNewline + 1);
                    }
                });

                // stderr 也顯示到終端機
                child.stderr.on('data', (data: Buffer) => {
                    writeEmitter.fire(data.toString('utf8').replace(/\n/g, '\r\n'));
                });

                child.on('close', (code: number) => {
                    if (code !== 0) {
                        writeEmitter.fire(`\r\n程式結束 (退出碼: ${code})\r\n`);
                    } else {
                        writeEmitter.fire(`\r\n程式執行結束\r\n`);
                    }
                    // 不 fire closeEmitter：讓終端機保持開啟，使用者可回顧完整輸出歷史
                });

                // 儲存 child process 以供 stopCode 使用
                this.manager.currentChildProcess = child;
            },
            close: () => {
                // 終端機關閉時終止進程
                if (this.manager.currentChildProcess) {
                    try {
                        this.manager.currentChildProcess.kill('SIGTERM');
                    } catch (e) {
                        console.error('[Cocoya] Failed to kill child process on close:', e);
                    }
                    this.manager.currentChildProcess = null;
                }
            }
        };

        // 建立終端機並顯示
        const terminal = vscode.window.createTerminal({
            name: 'Cocoya Execution',
            pty
        });
        terminal.show();

        this.manager.panel.webview.postMessage({ command: 'runCompleted' });
    }

    public handleStopCode() {
        // 順帶中斷遠端訓練（若無進行中訓練，sidecar 回「目前沒有」僅忽略）
        try {
            this.manager.sidecar.send('stopTraining', {}, () => { /* 靜默 */ });
        } catch { /* sidecar 未啟動 */ }

        // 若有 child process（Pseudoterminal 模式），直接終止
        if (this.manager.currentChildProcess) {
            try {
                this.manager.currentChildProcess.kill('SIGTERM');
            } catch (e) {
                console.error('[Cocoya] Failed to kill child process:', e);
            }
            this.manager.currentChildProcess = null;
        }

        // 終止 Pseudoterminal 終端機
        const terminal = vscode.window.terminals.find(t => t.name === 'Cocoya Execution');
        if (terminal) {
            terminal.dispose();
        }
    }

    private async validatePySerial(pPath: string): Promise<boolean> {
        return new Promise((resolve) => {
            exec(`"${pPath}" -c "import serial"`, (error) => {
                resolve(!error);
            });
        });
    }

    private async validatePythonPath(pPath: string): Promise<boolean> {
        return new Promise((resolve) => {
            exec(`"${pPath}" --version`, (error) => {
                resolve(!error);
            });
        });
    }

    public async checkUpdate() {
        const currentVersion = this.manager.context.extension.packageJSON.version;
        const repo = "simfonia/Cocoya";
        const options = { hostname: 'api.github.com', path: `/repos/${repo}/releases/latest`, headers: { 'User-Agent': 'vscode-extension-cocoya' } };
        https.get(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const release = JSON.parse(data);
                    if (!release.tag_name) return;
                    const latestVersion = release.tag_name.replace('v', '');
                    const hasUpdate = this.isNewerVersion(currentVersion, latestVersion);
                    this.manager.panel.webview.postMessage({ command: 'updateStatus', data: { hasUpdate, currentVersion, latestVersion, url: `https://github.com/${repo}/releases` } });
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