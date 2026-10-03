/**
 * ui/src/bridge/tauri/manifest.js — 模組清單／工具箱／外部資源指令群（P2-1 拆檔）
 *
 * 對應原 `BridgeTauri.send()` switch 內 7 個 case：
 *   getManifest / getModuleToolbox / reloadWebview / openHelp / openExternal / openFolder / setLocale
 *
 * 【handler 契約】簽名 `async function handler(command, data)`，以
 * `handler.call(this, command, data)` 呼叫。**回傳值被刻意丟棄**（原 send() 的
 * `let result` 從未 return，見 send() 註解）。
 *
 * 【搬移紀律】由機械式抽取自 `tauri.js`（見 log/plan/BridgeTauri_Split.md §7），
 * case body 逐字元保留，僅做兩件事：① `result = ` 改為 `const result = `；
 * ② 去掉 `break;`（改為函式自然結束）。
 */

/**
 * 取得模組清單（core_manifest.json）並回報給前端。
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function getManifest() {
    const result = await this.tauriInvoke('get_manifest');
    this._dispatchToFrontend({ command: 'manifestData', data: result, mediaUri: 'src', lang: 'zh-hant' });
}

/**
 * 主題／語系切換：Tauri 無 host HTML 管理，直接重載頁面。
 *
 * 原碼另有 `result = true;` 一行 —— 因原 send() 的 `result` 從不回傳，該賦值是
 * **死賦值**（無任何讀取點）。此處刻意不保留，避免讀者誤以為它有意義。
 * 對外行為完全不變（send() 恆回傳 undefined，由 tauri_send_dispatch.test.mjs 釘死）。
 */
export async function reloadWebview() {
    // 主題/語系切換：Tauri 無 host HTML 管理，直接重載頁面
    location.reload();
}

/**
 * 取得單一模組的 toolbox.xml 並回報給前端。
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function getModuleToolbox(_command, data) {
    // 原碼以獨立 block 包住（switch 內宣告 const/let 需要區塊作用域）；
    // 搬成獨立函式後 block 已自然成立，僅保留說明。
    const toolboxPath = `${data.moduleId}/toolbox.xml`;
    const result = await this.tauriInvoke('get_module_toolbox', { path: toolboxPath });
    if (data.requestId) {
        this._dispatchToFrontend({ command: 'toolboxData', data: result, requestId: data.requestId });
    }
}

/**
 * 開啟內嵌 help 文件。
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function openHelp(_command, data) {
    try {
        await this.tauriInvoke('open_help', { helpId: data.helpId });
    } catch (e) {
        console.error('[Bridge] Failed to open help:', e);
    }
}

/**
 * 以系統預設瀏覽器開啟外部網址；失敗時退回 window.open。
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function openExternal(_command, data) {
    try {
        const { open } = await import('@tauri-apps/plugin-shell');
        await open(data.url);
    } catch (e) {
        console.error('[Bridge] Failed to open external URL:', e);
        window.open(data.url, '_blank');
    }
}

/**
 * 以系統檔案管理器開啟資料夾。
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function openFolder(_command, data) {
    try {
        await this.tauriInvoke('open_folder', { path: data.path || data.folderPath || '' });
    } catch (e) {
        console.error('[Bridge] openFolder failed:', e);
    }
}

/**
 * Tauri 模式沒有 host 的語系同步，這裡明確忽略（保留 log 供除錯）。
 */
export async function setLocale() {
    console.log('[Bridge] Locale sync ignored in Tauri mode');
}
