/**
 * ui/src/bridge/tauri/serial.js — 序列埠列舉與監看指令群（P2-1 拆檔）
 *
 * 對應原 `BridgeTauri.send()` switch 內 4 個 case：
 *   openSerialMonitor / toggleSerialMonitor（區塊式）／ refreshSerialPorts / getSerialPorts
 *
 * 【fallthrough 組】
 * 原碼中 `refreshSerialPorts` 只有 case 標籤、下一行就是 `case 'getSerialPorts'`，
 * 靠 **switch fallthrough** 共用同一段 body。搬成 handler 表後 fallthrough 語法消失，
 * 故兩個匯出**指向同一函式**。不可拆成兩份 —— 拆了 `refreshSerialPorts` 會變成空實作，
 * 且**不會報錯**，只會靜默失效（序列埠按鈕點了沒反應）。
 *
 * 【block → return 的轉換】
 * `toggleSerialMonitor` 原為區塊式 case，內含 `if (!data.serialPort) break;`。
 * `break` 在函式內是語法錯誤，搬移時已改為 `return;`（語意等價：都只是提前離開本 case）。
 *
 * 【handler 契約】簽名 `async function handler(command, data)`，以
 * `handler.call(this, command, data)` 呼叫。**回傳值被刻意丟棄**（原 send() 的
 * `let result` 從未 return，見 send() 註解）。
 */

/**
 * 開啟序列埠監看（open_serial_monitor）。
 * @this {import('../tauri.js').BridgeTauri}
 */
import { getSetting, SETTINGS_KEY } from '../../core/settingsApi.js';

export async function openSerialMonitor(_command, data) {
    try {
        if (!data.serialPort) return;
        const pythonPath = getSetting(SETTINGS_KEY.PYTHON_PATH) || 'python';
        const lang = (window.Blockly && Blockly.Msg['BKY_LANG']) || 'zh-hant';
        if (window.CocoyaUI) {
            window.CocoyaUI.toggleTerminal(true);
            window.CocoyaUI.appendTerminal(`--- Opening Monitor: ${data.serialPort} ---`, 'info');
        }
        await this.tauriInvoke('open_serial_monitor', {
            port: data.serialPort,
            pythonPath: pythonPath,
            rawDumpEnabled: data.rawDumpEnabled === undefined
                ? getSetting(SETTINGS_KEY.SERIAL_RAW_DUMP_ENABLED)
                : !!data.rawDumpEnabled,
            lang: lang
        });
    } catch (e) {
        console.error('[Bridge] Failed to open monitor:', e);
        const errLabel = window.Blockly?.Msg['MSG_MONITOR_FAILED'] || 'Failed to open monitor: ';
        this.alert(errLabel + e);
    }
}

/**
 * 序列監看鈕 toggle：後端已啟用中 → 停止；否則對指定埠啟動。
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function toggleSerialMonitor(_command, data) {
    // 序列監看鈕 toggle：後端已啟用中 → 停止；否則對指定埠啟動
    try {
        if (!data.serialPort) return;   // 原碼為 break（區塊式 case），函式內改用 return
        const monPython = getSetting(SETTINGS_KEY.PYTHON_PATH) || 'python';
        const monLang = (window.Blockly && Blockly.Msg['BKY_LANG']) || 'zh-hant';
        const res = await this.tauriInvoke('toggle_serial_monitor', {
            port: data.serialPort,
            pythonPath: monPython,
            rawDumpEnabled: data.rawDumpEnabled === undefined
                ? getSetting(SETTINGS_KEY.SERIAL_RAW_DUMP_ENABLED)
                : !!data.rawDumpEnabled,
            lang: monLang
        });
        const opened = res === 'opened';
        if (window.CocoyaUI) {
            window.CocoyaUI.appendTerminal(
                opened ? `--- Opening Monitor: ${data.serialPort} ---` : '--- Monitor Stopped ---',
                'info'
            );
            if (opened) window.CocoyaUI.toggleTerminal(true);
        }
    } catch (e) {
        console.error('[Bridge] Failed to toggle monitor:', e);
        this.alert('Failed to toggle monitor: ' + e);
    }
}

/**
 * 取得序列埠清單並回報給前端。
 *
 * ⚠️ refreshSerialPorts 與本函式指向同一實作（對應原 switch 的 fallthrough）。
 * @this {import('../tauri.js').BridgeTauri}
 */
async function serialPorts() {
    const result = await this.tauriInvoke('get_serial_ports');
    this._dispatchToFrontend({ command: 'serialPortsData', ports: result });
}

export { serialPorts as getSerialPorts };
export { serialPorts as refreshSerialPorts };
