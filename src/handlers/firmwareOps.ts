import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

/**
 * 韌體操作 Handler（燒錄、抹除、穩定模式設定等）
 */
export class FirmwareOpsHandler {
    private manager: any;

    constructor(manager: any) {
        this.manager = manager;
    }

    /**
     * 執行韌體重置 (UF2 燒錄 或 Serial 燒錄)
     */
    public async handleResetFirmware(model: string, shouldClear: boolean = true, serialPort: string = '') {
        await this.manager.stopAllCocoyaTerminals();

        let srcPath: string | undefined;
        let firmwareFileName: string | undefined;
        let isSerial = model.includes('SERIAL') || model.includes('CAMERA') || model.includes('FACTORY');
        let flashSegments: { addr: string, path: string }[] = [];

        if (model === 'custom') {
            const uris = await vscode.window.showOpenDialog({
                canSelectMany: false,
                filters: { 'Firmware': ['uf2', 'bin'] },
                title: 'Select Custom Firmware'
            });
            if (uris && uris[0]) {
                const sPath = uris[0].fsPath;
                firmwareFileName = path.basename(sPath);
                if (firmwareFileName.endsWith('.bin')) isSerial = true;
                flashSegments.push({ addr: '0x0', path: sPath });
                srcPath = sPath;
            } else return;
        } else {
            let subDir = 'XIAO_ESP32_S3';
            if (model.includes('CAMERA')) {
                subDir = path.join('XIAO_ESP32_S3', 'Sense_microPython');
            } else if (model.includes('FACTORY')) {
                subDir = path.join('XIAO_ESP32_S3', 'Sense_Factory');
            } else if (model.includes('RP2040')) {
                subDir = 'MakerPi_RP2040';
            }

            const firmwareDir = path.join(this.manager.context.extensionPath, 'resources', 'firmware', 'MicroPython', subDir);
            if (!fs.existsSync(firmwareDir)) {
                vscode.window.showErrorMessage(`Firmware directory not found: ${firmwareDir}`);
                return;
            }

            const configPath = path.join(firmwareDir, 'project_config.json');
            if (isSerial && fs.existsSync(configPath)) {
                try {
                    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    const projectKey = model.includes('SENSE') ? 'xiao_esp32_sense_factory' : 'xiao_esp32_factory';
                    const files = config[projectKey];
                    if (files) {
                        for (const [addr, name] of Object.entries(files)) {
                            const fPath = path.join(firmwareDir, name as string);
                            if (fs.existsSync(fPath)) {
                                flashSegments.push({ addr, path: fPath });
                            }
                        }
                    }
                } catch (e) {}
            }

            if (flashSegments.length === 0) {
                const files = fs.readdirSync(firmwareDir);
                if (isSerial) {
                    const binFile = files.find(f => f.endsWith('.bin'));
                    if (!binFile) {
                        vscode.window.showErrorMessage('No .bin file found for serial mode.');
                        return;
                    }
                    flashSegments.push({ addr: '0x0', path: path.join(firmwareDir, binFile) });
                } else {
                    const uf2File = files.find(f => f.endsWith('.uf2'));
                    if (!uf2File) {
                        vscode.window.showErrorMessage('No .uf2 file found in firmware directory.');
                        return;
                    }
                    flashSegments.push({ addr: 'UF2', path: path.join(firmwareDir, uf2File) });
                    firmwareFileName = uf2File;
                }
            }
        }

        if (isSerial) {
            if (!serialPort) {
                vscode.window.showErrorMessage('Please select a serial port first.');
                return;
            }

            const pythonPath = this.manager.getPythonPath();
            const chip = model.includes('ESP32_S3') ? 'esp32s3' : 'auto';
            const terminal = vscode.window.createTerminal('Cocoya Firmware Burn');
            terminal.show();

            let cmd = `& "${pythonPath}" -m esptool --chip ${chip} --port ${serialPort} --baud 921600 --before default-reset --after hard-reset write-flash -z --flash-mode dio --flash-freq 80m --flash-size 8MB`;
            for (const seg of flashSegments) {
                cmd += ` ${seg.addr} "${seg.path}"`;
            }

            terminal.sendText(cmd);
            return;
        }

        // UF2 模式
        const uf2File = flashSegments[0];
        let burnTarget: string | null = null;
        const findDisk = (label: string) => {
            try {
                const output = execSync('wmic logicaldisk get name, volumename').toString();
                const lines = output.split('\n');
                for (const line of lines) {
                    if (line.includes(label)) {
                        const match = line.match(/[A-Z]:/);
                        if (match) return match[0] + path.sep;
                    }
                }
            } catch (e) {}
            return null;
        };

        burnTarget = findDisk('RPI-RP2');
        if (!burnTarget) {
            vscode.window.showErrorMessage('Please put MCU into BOOTSEL mode (RPI-RP2 drive not found).');
            return;
        }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Burning firmware...`,
                cancellable: false
            }, async (progress) => {
                const destPath = path.join(burnTarget!, firmwareFileName!);
                fs.copyFileSync(srcPath!, destPath);

                if (!shouldClear) {
                    progress.report({ message: "Done. Skip clearing code.py." });
                    return;
                }

                progress.report({ message: "Success! Firmware burned. Rebooting..." });
                await new Promise(resolve => setTimeout(resolve, 3000));
            });
            vscode.window.showInformationMessage(this.manager.localeMessages['MSG_FIRMWARE_BURN_SUCCESS'] || 'Firmware burned and initialized!');
        } catch (e: any) {
            vscode.window.showErrorMessage(`Burning failed: ${e.message}`);
        }
    }

    public async handlePickMcuModel(message: any) {
        interface McuPickItem extends vscode.QuickPickItem {
            id: string;
        }
        const items: McuPickItem[] = message.options.map((opt: any) => ({
            label: opt.label,
            id: opt.id
        }));
        const selection = await vscode.window.showQuickPick(items, {
            placeHolder: this.manager.localeMessages['MSG_SELECT_MCU_MODEL'] || 'Select MCU model'
        });
        this.manager.panel.webview.postMessage({
            command: 'promptResponse',
            requestId: message.requestId,
            result: selection ? selection.id : null
        });
    }

    public handleEraseFilesystem(message: any) {
        const ePort = message.serialPort;
        if (!ePort) return;

        const ePython = this.manager.getPythonPath();
        const eLang = vscode.env.language.startsWith('zh') ? 'zh-hant' : 'en';
        const eTerminal = vscode.window.createTerminal('Cocoya Deep Repair');
        eTerminal.show();
        eTerminal.sendText(`& "${ePython}" -m esptool --port ${ePort} erase-flash`);

        const infoMsg = this.manager.localeMessages['MSG_ERASE_START_REFLASH'] ||
            (eLang === 'zh-hant' ? '已啟動硬體抹除。完成後請務必重新「重置韌體」！' : 'Hardware erase started. Please re-flash firmware after it completes!');
        vscode.window.showInformationMessage(infoMsg);
    }

    public handleSetupStableMode(message: any) {
        const sPort = message.serialPort;
        const sPython = this.manager.getPythonPath();
        const sLang = vscode.env.language.startsWith('zh') ? 'zh-hant' : 'en';
        const sScript = vscode.Uri.joinPath(this.manager.context.extensionUri, 'resources', 'deploy_mcu.py').fsPath;
        const sTerminal = vscode.window.createTerminal('Cocoya Setup');
        sTerminal.sendText(`& "${sPython}" "${sScript}" "${sPort}" --setup-stable --lang ${sLang}`);
        sTerminal.show();
    }
}