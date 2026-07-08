import * as vscode from 'vscode';
import * as path from 'path';

/**
 * 序列埠操作 Handler（序列埠列表、監控器、Python 路徑設定等）
 */
export class SerialOpsHandler {
    private manager: any;

    constructor(manager: any) {
        this.manager = manager;
    }

    public async handleRefreshSerialPorts() {
        try {
            const { exec } = require('child_process');
            
            const boardMap: { [key: string]: string } = {
                "VID_2E8A&PID_0005": "Maker Pi RP2040 / Pico",
                "VID_2E8A&PID_0003": "Maker Pi RP2040 (CP)",
                "VID_303A&PID_1001": "XIAO ESP32-S3 / ESP32",
                "VID_1A86&PID_7523": "Arduino Uno / CH340",
                "VID_10C4&PID_EA60": "CP210x USB Adapter",
                "VID_2341&PID_0043": "Arduino Uno R3"
            };

            const psCmd = "Get-CimInstance Win32_SerialPort | ForEach-Object { $_.Name + '|' + $_.PNPDeviceID }";
            const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCmd}"`;
            
            exec(cmd, (error: any, stdout: string) => {
                const ports: any[] = [];
                if (!error && stdout) {
                    const lines = stdout.split(/\r?\n/).map((s: string) => s.trim()).filter((s: string) => s !== '');
                    lines.forEach((line: string) => {
                        const parts = line.split('|');
                        if (parts.length < 2) return;
                        
                        const name = parts[0];
                        const pnpId = parts[1];
                        const comMatch = name.match(/\((COM\d+)\)/);
                        if (!comMatch) return;
                        
                        const port = comMatch[1];
                        let label = port;

                        for (const [key, boardName] of Object.entries(boardMap)) {
                            if (pnpId.includes(key)) {
                                label = `[${boardName}] ${port}`;
                                break;
                            }
                        }
                        ports.push({ port: port, label: label });
                    });
                }
                
                if (ports.length === 0) {
                    const { execSync } = require('child_process');
                    try {
                        const basicOutput = execSync('powershell "[System.IO.Ports.SerialPort]::GetPortNames()"', { encoding: 'utf8' });
                        if (basicOutput) {
                            const lines = basicOutput.split(/\r?\n/).map((s: string) => s.trim()).filter((s: string) => s !== '');
                            lines.forEach((p: string) => {
                                if (!ports.find((x: any) => x.port === p)) {
                                    ports.push({ port: p, label: p });
                                }
                            });
                        }
                    } catch (e) {}
                }
                this.manager.panel.webview.postMessage({ command: 'serialPortsData', ports });
            });
        } catch (e) {
            console.error('Failed to list serial ports', e);
            this.manager.panel.webview.postMessage({ command: 'serialPortsData', ports: [] });
        }
    }

    public handleOpenSerialMonitor(message: any) {
        const monPort = message.serialPort;
        if (!monPort) return;
        const monPython = this.manager.getPythonPath();
        const monLang = vscode.env.language.startsWith('zh') ? 'zh-hant' : 'en';
        const monScript = vscode.Uri.joinPath(this.manager.context.extensionUri, 'resources', 'deploy_mcu.py').fsPath;
        
        const monTerminal = vscode.window.createTerminal('Cocoya Serial Monitor');
        monTerminal.sendText(`& "${monPython}" "${monScript}" "${monPort}" --monitor-only --lang ${monLang}`);
        monTerminal.show();
    }

    public async handleSetPythonPath() {
        const uris = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Executables': ['exe'] }, title: '選取 python.exe' });
        if (uris && uris[0]) {
            const newPath = uris[0].fsPath;
            await this.manager.context.globalState.update('pythonPath', newPath);
            vscode.window.showInformationMessage(this.manager.t('MSG_PYTHON_UPDATED', newPath));
        }
    }
}