import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import { exec } from 'child_process';

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
        const modules = ['cv2', 'mediapipe', 'PIL', 'serial', 'esptool'];
        
        const checkScript = `
import importlib.util
import json
import sys

modules = ${JSON.stringify(modules)}
results = {}
for m in modules:
    try:
        results[m] = importlib.util.find_spec(m) is not None
    except:
        results[m] = False
print(json.dumps(results))
        `.trim();

        const { execFile } = require('child_process');
        
        execFile(pythonPath, ['-c', checkScript], (error: any, stdout: string) => {
            let results: any = {};
            if (!error) {
                try {
                    results = JSON.parse(stdout.trim());
                } catch (e) {
                    console.error('[Cocoya] Failed to parse environment check output:', e);
                    modules.forEach(m => results[m] = false);
                }
            } else {
                modules.forEach(m => results[m] = false);
            }
            this.manager.panel.webview.postMessage({ command: 'environmentStatus', results });
        });
    }

    public async handleInstallModule(moduleName: string) {
        let pythonPath = (this.manager.context.globalState as any).get('pythonPath', 'python') as string;
        let terminal = vscode.window.terminals.find(t => t.name === 'Cocoya Environment');
        if (!terminal) terminal = vscode.window.createTerminal('Cocoya Environment');
        
        terminal.show();
        terminal.sendText(`& "${pythonPath}" -m pip install ${moduleName} --user`);
        
        setTimeout(() => this.handleCheckEnvironment(), 5000);
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

    public async handleSetCloudAiMode(enabled: boolean) {
        this.manager.cloudAiEnabled = enabled;
        this.manager.context.globalState.update('cloudAiEnabled', enabled);
        this.manager.panel.webview.postMessage({ command: 'cloudAiModeStatus', enabled });
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

        let terminal = vscode.window.terminals.find(t => t.name === 'Cocoya Execution');
        if (!terminal) terminal = vscode.window.createTerminal('Cocoya Execution');
        terminal.show();

        if (this.manager.currentFilePath) {
            const projectDir = path.dirname(this.manager.currentFilePath);
            terminal.sendText(`cd "${projectDir}"`);
        }

        const shell = (vscode as any).env?.shell || '';
        const isBashLike = shell.includes('bash') || shell.includes('git-bash') || shell.includes('zsh');
        const isPowerShell = shell.includes('powershell') || shell.includes('pwsh');
        
        let runCmd: string;
        if (isBashLike) {
            runCmd = `"${pythonPath}" "${tempFilePath}"`;
        } else if (isPowerShell || process.platform === 'win32') {
            runCmd = `& "${pythonPath}" "${tempFilePath}"`;
        } else {
            runCmd = `start "" "${pythonPath}" "${tempFilePath}"`;
        }
        
        terminal.sendText(runCmd);
        this.manager.panel.webview.postMessage({ command: 'runCompleted' });
    }

    public handleStopCode() {
        const terminal = vscode.window.terminals.find(t => t.name === 'Cocoya Execution');
        if (terminal) {
            terminal.show();
            terminal.sendText('\u0003\u0003\u0003');
            setTimeout(() => {
                terminal.dispose();
            }, 500);
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