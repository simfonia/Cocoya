/**
 * ui/src/bridge/tauri/firmware.js — 韌體部署／檔案系統重建／韌體燒錄指令群（P2-1 拆檔）
 *
 * 對應原 `BridgeTauri.send()` switch 內 3 個 case：deployMcu / eraseFilesystem / resetFirmware
 *
 * 【handler 契約】簽名 `async function handler(command, data)`，以
 * `handler.call(this, command, data)` 呼叫。**回傳值被刻意丟棄**（原 send() 的
 * `let result` 從未 return，見 send() 註解）。
 *
 * 【resetFirmware 的 catch 會 rethrow】
 * 原碼在 catch 中 `throw e;` 向上拋，讓 send() 的外層 catch 統一處理並額外彈
 * alert（AGENTS.md 記載的燒錄失敗提示）。搬成 handler 後此 rethrow 仍會冒泡到
 * send() 的 try/catch，語意不變 —— 切勿「順手改成 return」否則燒錄失敗會靜默無提示。
 */

import { getSetting, SETTINGS_KEY } from '../../core/settingsApi.js';

/**
 * 部署 MicroPython 韌體到 MCU（deploy_mcu）。
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function deployMcu(_command, data) {
    await this.tauriInvoke('deploy_mcu', {
        pythonPath: getSetting(SETTINGS_KEY.PYTHON_PATH) || 'python',
        port: data.port,
        code: data.code,
        serialUploadOnly: false,
        rawDumpEnabled: data.rawDumpEnabled === undefined
            ? getSetting(SETTINGS_KEY.SERIAL_RAW_DUMP_ENABLED)
            : !!data.rawDumpEnabled,
        lang: (window.Blockly && Blockly.Msg['BKY_LANG']) || 'zh-hant'
    });
    this._dispatchToFrontend({ command: 'deployCompleted' });
}

/**
 * 重建 MCU 檔案系統（erase_filesystem）。成功與失敗都會彈 alert。
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function eraseFilesystem(_command, data) {
    try {
        this._firstLogReceived = true;
        window.CocoyaUI.toggleTerminal(true);
        const loadingMsg = window.Blockly?.Msg['MSG_ERASING_FS'] || 'Rebuilding filesystem... Please wait about 15 seconds.';
        window.CocoyaUI.showLoadingModal(loadingMsg);
        const pythonPath = getSetting(SETTINGS_KEY.PYTHON_PATH) || 'python';
        const lang = (window.Blockly && Blockly.Msg['BKY_LANG']) || 'zh-hant';
        await this.tauriInvoke('erase_filesystem', {
            port: data.serialPort,
            pythonPath: pythonPath,
            lang: lang
        });
        window.CocoyaUI.hideLoadingModal();
        this.alert(window.Blockly?.Msg['MSG_ERASE_FS_SUCCESS'] || 'Filesystem rebuilt successfully!');
    } catch (e) {
        this._firstLogReceived = true;
        window.CocoyaUI.hideLoadingModal();
        this.alert('Erase failed: ' + e);
    }
}

/**
 * 燒錄原廠韌體（reset_firmware）。
 *
 * ⚠️ catch 中刻意 `throw e` 往上拋 —— 由 send() 的外層 catch 統一記錄並彈
 * MSG_FIRMWARE_BURN_FAILED 提示。不可改成 return，否則燒錄失敗會靜默。
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function resetFirmware(_command, data) {
    try {
        const loadingMsg = window.Blockly?.Msg['MSG_BURNING_FIRMWARE'] || 'Burning firmware... Please do not close the window.';
        window.CocoyaUI.showLoadingModal(loadingMsg);
        await this.tauriInvoke('reset_firmware', {
            model: data.model,
            shouldClear: data.shouldClear,
            serialPort: data.serialPort || '',
            // P1-6 F1：esptool 必須用與使用者設定一致的 Python（venv/conda 環境）
            pythonPath: getSetting(SETTINGS_KEY.PYTHON_PATH) || ''
        });
        window.CocoyaUI.hideLoadingModal();
        this.alert(window.Blockly?.Msg['MSG_FIRMWARE_BURN_SUCCESS'] || 'Burn success!');
    } catch (e) {
        window.CocoyaUI.hideLoadingModal();
        throw e;
    }
}
