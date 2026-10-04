/**
 * ui/src/bridge/tauri/pythonEnv.js — Python 環境與套件安裝指令群（P2-1 拆檔）
 *
 * 對應原 `BridgeTauri.send()` switch 內 5 個 case：
 *   setPythonPath / getPythonPath / checkEnvironment / installModule / abortInstall
 *
 * 【handler 契約】簽名 `async function handler(command, data)`，以
 * `handler.call(this, command, data)` 呼叫。**回傳值被刻意丟棄**（原 send() 的
 * `let result` 從未 return，見 send() 註解）。
 */

/**
 * 選擇 Python 執行檔路徑並回報環境狀態。
 * @this {import('../tauri.js').BridgeTauri}
 */
import { getSetting, setSetting, SETTINGS_KEY } from '../../core/settingsApi.js';

export async function setPythonPath() {
    try {
        const newPath = await this.tauriInvoke('pick_python_path');
        if (newPath) {
            setSetting(SETTINGS_KEY.PYTHON_PATH, newPath);
            const msg = (window.Blockly?.Msg['MSG_PYTHON_UPDATED'] || 'Python path updated to: %1').replace('%1', newPath);
            this.alert(msg);
            // 回報新路徑給環境設定視窗並自動重新檢查套件
            this._dispatchToFrontend({ command: 'pythonPathData', pythonPath: newPath });
            const checkData = await this.tauriInvoke('check_environment', { pythonPath: newPath });
            this._dispatchToFrontend({ command: 'environmentStatus', ...checkData });
        }
    } catch (e) {
        if (e !== 'Canceled') console.error('[Bridge] Failed to pick python path:', e);
    }
}

/**
 * 回報目前 pythonPath（Tauri 權威來源 = localStorage）。
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function getPythonPath() {
    // 環境設定視窗路徑列：回報目前 pythonPath（Tauri 權威來源 = localStorage）
    this._dispatchToFrontend({
        command: 'pythonPathData',
        pythonPath: getSetting(SETTINGS_KEY.PYTHON_PATH) || 'python'
    });
}

/**
 * 檢查 Python 環境與必要套件。
 *
 * 【命名說明】原碼在此寫 `const data = await ...`，與 handler 的 `data` 參數同名。
 * 搬成獨立函式後參數同名會造成遮蔽（block scope 下合法但易誤讀），
 * 故改名為 `envData`。僅為可讀性，行為完全相同。
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function checkEnvironment() {
    try {
        const pythonPath = getSetting(SETTINGS_KEY.PYTHON_PATH) || 'python';
        const envData = await this.tauriInvoke('check_environment', { pythonPath: pythonPath });
        console.log('[Bridge] check_environment returned:', envData);
        this._dispatchToFrontend({ command: 'environmentStatus', ...envData });
    } catch (e) {
        console.error('[Bridge] Check environment failed:', e);
        // 明確回報「無效」而非靜默：否則 modal 會永遠停在「正在偵測…」
        this._dispatchToFrontend({
            command: 'environmentStatus',
            results: {}, modules: [],
            pythonValid: false, pythonResolvedPath: '', pythonVersion: '',
            pythonError: String(e)
        });
    }
}

/**
 * 安裝 Python 套件。
 *
 * 走專用 command，而非 run_python。理由：
 * 1. run_python 開頭會 stop_python → 會殺掉使用者正在執行的程式，
 *    並釋放該視窗的串列埠監看（在專案中裝套件時會誤殺）。
 * 2. run_python 不回報 exit code → 前端無法得知安裝完成/失敗。
 * 輸出改由 install-module-log / install-module-done 事件回報，
 * 直接顯示在環境設定視窗內（不再送往底部終端機，避免被 modal 遮住）。
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function installModule(_command, data) {
    try {
        const pythonPath = getSetting(SETTINGS_KEY.PYTHON_PATH) || 'python';
        await this.tauriInvoke('install_python_module', {
            pythonPath: pythonPath,
            moduleId: data.module,
            pipPackage: data.pipPackage || data.module
        });
    } catch (e) {
        console.error('[Bridge] Failed to start installation:', e);
        // 讓前端狀態機收斂（否則列會永遠停在「安裝中…」）
        this._dispatchToFrontend({
            command: 'installModuleDone',
            moduleId: data.module,
            success: false,
            exitCode: null,
            aborted: false,
            errorCode: (e === 'INSTALL_ALREADY_RUNNING') ? 'INSTALL_ALREADY_RUNNING' : 'SPAWN_FAILED'
        });
    }
}

/**
 * 中止進行中的套件安裝。
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function abortInstall() {
    try {
        await this.tauriInvoke('abort_install_module');
    } catch (e) {
        console.error('[Bridge] Failed to abort installation:', e);
        // 後端未能中止時仍讓前端收斂，避免 modal 卡在鎖定狀態無法關閉
        this._dispatchToFrontend({
            command: 'installModuleDone',
            moduleId: null,
            success: false,
            exitCode: null,
            aborted: true
        });
    }
}
