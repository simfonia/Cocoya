/**
 * ui/src/bridge/tauri/window.js — 視窗生命週期與原生對話框轉呼叫指令群（P2-1 拆檔）
 *
 * 對應原 `BridgeTauri.send()` switch 內 8 個 case：
 *   setWindowTitle / setDirty / closeWindow / closeEditor / backToHome
 *   ＋ alert / confirm / prompt（原為 fallthrough 三連，全部轉呼叫 `_handleNativeDialogs`）
 *
 * 【fallthrough 組的處理】
 * 原碼中 `alert` / `confirm` / `prompt` 三個 case 只有 `prompt` 有 body，
 * 前兩者靠 **switch fallthrough** 共用。搬成 handler 表後 fallthrough 語法消失，
 * 故三個匯出**指向同一個函式** —— 這是 fallback 語意的等價表達。
 * 不可改成三個各自獨立的函式（那會讓 alert/confirm 變成空實作 → 靜默失效）。
 *
 * 【handler 契約】簽名 `async function handler(command, data)`，以
 * `handler.call(this, command, data)` 呼叫。**回傳值被刻意丟棄**（原 send() 的
 * `let result` 從未 return，見 send() 註解）。
 */

/**
 * 設定視窗標題（同步 document.title 並通知 Rust 視窗管理器）。
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function setWindowTitle(_command, data) {
    try {
        const fullTitle = `Cocoya - ${data.title}`;
        document.title = fullTitle;
        await this.tauriInvoke('set_window_title', { title: fullTitle });
    } catch (e) { console.warn('[Bridge] Failed to set window title via Rust:', e); }
}

/**
 * 設定 dirty 標記。
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function setDirty(_command, data) {
    await this.tauriInvoke('set_dirty', { isDirty: data.isDirty });
}

/**
 * 關閉視窗。
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function closeWindow() {
    await this.tauriInvoke('close_window');
}

/**
 * toolbar 的「關閉編輯器」：與右上角 X 走相同 dirty 檢查與存檔確認流程。
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function closeEditor() {
    // toolbar 的「關閉編輯器」：與右上角 X 走相同 dirty 檢查與存檔確認流程
    if (this._appWindow) await this._handleCloseDialog();
}

/**
 * 回首頁（模式 label 點擊 / Ctrl+R 攔截共用）：釋放本視窗 session
 * （current_paths 錨定 / file_locks / dirty_states）並同步 _anchor 快照。
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function backToHome() {
    // 回首頁（模式 label 點擊 / Ctrl+R 攔截共用）：釋放本視窗 session
    // （current_paths 錨定 / file_locks / dirty_states）並同步 _anchor 快照
    try {
        await this.tauriInvoke('release_session');
    } catch (e) {
        console.error('[Bridge] release_session failed:', e);
    }
    await this._refreshAnchor();
}

/**
 * alert / confirm / prompt 的共用實作（原生對話框）。
 *
 * ⚠️ 三個匯出指向同一函式 —— 對應原 switch 的 fallthrough 三連。
 *   `command` 參數會被 `_handleNativeDialogs` 用來判斷是哪一種對話框。
 * @this {import('../tauri.js').BridgeTauri}
 */
async function nativeDialog(command, data) {
    await this._handleNativeDialogs(command, data);
}

export { nativeDialog as alert };
export { nativeDialog as confirm };
export { nativeDialog as prompt };
