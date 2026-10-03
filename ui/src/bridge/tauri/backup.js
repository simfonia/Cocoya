/**
 * ui/src/bridge/tauri/backup.js — 備份與還原指令群（P2-1 拆檔，2026-10-03）
 *
 * 對應原 `BridgeTauri.send()` switch 內 4 個 case：
 *   checkStartupBackup / autoBackup / clearBackup / rejectRecovery
 *
 * 【handler 契約】
 * 簽名為 `async function handler(command, data)`，以 `handler.call(this, command, data)` 呼叫。
 * ⚠️ **回傳值被刻意丟棄** —— 原 `send()` 中 `let result` 宣告後從未 `return`（實測 0 處
 * `return result`），`base.js` 的呼叫端也只 `await` promise 等副作用完成、不取資料。
 * 故 handler 內 `result` 一律改為區域變數，語意與原碼等價。
 *
 * 【搬移紀律】
 * 本檔由機械式抽取自 `tauri.js`（見 log/plan/BridgeTauri_Split.md §7），
 * case body 逐字元保留，僅做兩件事：① `result = ` 改為 `const result = `；
 * ② 去掉 `break;`（改為函式自然結束）。
 */

/**
 * 啟動時檢查是否存在可回復的備份；有則回報給前端。
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function checkStartupBackup() {
    const result = await this.tauriInvoke('check_startup_backup');
    if (result) {
        this._dispatchToFrontend({ command: 'recoveryData', xml: result });
    }
}

/**
 * 自動備份目前工作區。
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function autoBackup(_command, data) {
    await this.tauriInvoke('auto_backup', { xml: data.xml });
}

/**
 * 清除備份。
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function clearBackup() {
    await this.tauriInvoke('clear_backup');
}

/**
 * 使用者拒絕還原，清除恢復狀態。
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function rejectRecovery() {
    await this.tauriInvoke('reject_recovery');
}
