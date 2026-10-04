/**
 * ui/src/bridge/tauri/codeRun.js — 程式執行／停止指令群（P2-1 拆檔）
 *
 * 對應原 `BridgeTauri.send()` switch 內 2 個 case：runCode / stopCode
 *
 * 【handler 契約】簽名 `async function handler(command, data)`，以
 * `handler.call(this, command, data)` 呼叫。**回傳值被刻意丟棄**（原 send() 的
 * `let result` 從未 return，見 send() 註解）。
 */

/**
 * 執行程式：PC 端走 run_python，MicroPython 平台走 deploy_mcu 上傳到 MCU。
 * @this {import('../tauri.js').BridgeTauri}
 */
import { getSetting, SETTINGS_KEY } from '../../core/settingsApi.js';

export async function runCode(_command, data) {
    try {
        const pythonPath = getSetting(SETTINGS_KEY.PYTHON_PATH) || 'python';
        const lang = (window.Blockly && Blockly.Msg['BKY_LANG']) || 'zh-hant';

        if (data.platform === 'MicroPython') {
            if (!data.serialPort) {
                this.alert(window.Blockly?.Msg['MSG_SELECT_PORT'] || 'Please select a serial port first!');
                return;
            }
            window.CocoyaUI.showLoadingModal(window.Blockly?.Msg['MSG_UPLOADING'] || 'Uploading code to MCU...');

            await this.tauriInvoke('deploy_mcu', {
                pythonPath: pythonPath,
                port: data.serialPort,
                code: data.code,
                serialUploadOnly: data.serialUploadOnly || false,
                rawDumpEnabled: data.rawDumpEnabled === undefined
                    ? getSetting(SETTINGS_KEY.SERIAL_RAW_DUMP_ENABLED)
                    : !!data.rawDumpEnabled,
                lang: lang
            });

            window.CocoyaUI.hideLoadingModal();
            window.CocoyaUI.flashButton('btn-run', '#75FB4C');
        } else {
            await this.tauriInvoke('run_python', {
                code: data.code,
                pythonPath: pythonPath
            });
            window.CocoyaUI.flashButton('btn-run', '#75FB4C');
        }
    } catch (e) {
        window.CocoyaUI.hideLoadingModal();
        this.alert('Run failed: ' + e);
    }
}

/**
 * 停止執行中程式，並順帶中斷遠端訓練（若無進行中訓練，sidecar 回「目前沒有」僅靜默）。
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function stopCode() {
    // 順帶中斷遠端訓練（若無進行中訓練，sidecar 回「目前沒有」僅靜默）
    this._handleDatasetCommand('stopTraining', {}, null).catch(() => {
        // 停止遠端訓練失敗不影響本機停止（sidecar 可能已結束），靜默忽略。
    });
    await this.tauriInvoke('stop_python');
}
