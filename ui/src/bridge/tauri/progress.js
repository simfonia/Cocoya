/**
 * ui/src/bridge/tauri/progress.js — dataset autosave / restore progress and project anchoring command group（P2-1 split）
 *
 * Maps to the following cases in the original `BridgeTauri.send()` switch:
 *   datasetSaveProgress / datasetLoadProgress / getProjectAnchor
 *
 * getProjectAnchor is the anchoring query shared by four commands across the bridge layer.
 * It lives in this group because all three commands depend on `_normalizeAnchor`
 * (the snake/camel dual safeguard mandated by the AGENTS.md serde contract).
 *
 * 【handler contract】signature `async function handler(command, data)`, invoked via
 * `handler.call(this, command, data)`. The return value is deliberately discarded
 * (see the send() note in tauri.js).
 * @this {import('../tauri.js').BridgeTauri}
 */

/**
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function datasetSaveProgress(_command, data) {
    try {
        // 依「專案根 SSOT」動態取得最新專案根（與 M4c captureImage 同策略）
        let projectRoot = this._anchor && this._anchor.projectRoot;
        if (!projectRoot) {
            try {
                const anchor = this._normalizeAnchor(await this.tauriInvoke('get_project_anchor'));
                projectRoot = anchor && anchor.projectRoot;
                this._anchor = anchor;
            } catch (e) { projectRoot = null; }
        }
        if (!projectRoot) {
            this._dispatchToFrontend({
                command: 'datasetSaveProgressResult',
                success: false,
                errorCode: 'PROJECT_ROOT_REQUIRED',
                error: '未錨定專案，請先開新或開啟一個 .xml 專案後再儲存進度'
            });
            return;
        }
        const savedPath = await this.tauriInvoke('dataset_save_progress', {
            folderPath: projectRoot,
            projectName: data.projectName || 'dataset',
            specJson: JSON.stringify(data.spec)
        });
        console.log('[Bridge] Saved dataset progress to', savedPath);
        this._dispatchToFrontend({ command: 'datasetSaveProgressResult', success: true, path: savedPath });
    } catch (e) {
        console.error('[Bridge] Save progress failed:', e);
        // 後端錯誤字串以 "CODE: message" 前綴回傳，解析為穩定 errorCode
        const errStr = String(e || '');
        const codeMatch = errStr.match(/^([A-Z][A-Z0-9_]*):/);
        this._dispatchToFrontend({
            command: 'datasetSaveProgressResult',
            success: false,
            errorCode: codeMatch ? codeMatch[1] : 'IO_ERROR',
            error: errStr
        });
    }
    return;
}

/**
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function getProjectAnchor(_command, data) {
    try {
        const anchorNow = this._normalizeAnchor(await this.tauriInvoke('get_project_anchor'));
        this._anchor = anchorNow; // 順便刷新快照
        this._dispatchToFrontend({
            command: 'projectAnchorResult',
            requestId: data.requestId,
            isAnchored: anchorNow.isAnchored,
            projectRoot: anchorNow.projectRoot
        });
    } catch (e) {
        console.error('[Bridge] getProjectAnchor failed:', e);
        this._dispatchToFrontend({
            command: 'projectAnchorResult',
            requestId: data.requestId,
            isAnchored: false,
            projectRoot: null
        });
    }
    return;
}

/**
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function datasetLoadProgress(_command, data) {
    try {
        const result = await this.tauriInvoke('dataset_load_progress', { folderPath: data.folderPath });
        this._dispatchToFrontend({
            command: 'datasetLoadProgressResult',
            success: true,
            hasProgress: result.hasProgress,
            spec: result.spec || null,
            path: result.path,
            errorCode: result.errorCode || undefined
        });
    } catch (e) {
        console.error('[Bridge] Load progress failed:', e);
        const errStr = String(e || '');
        const codeMatch = errStr.match(/^([A-Z][A-Z0-9_]*):/);
        this._dispatchToFrontend({
            command: 'datasetLoadProgressResult',
            success: false,
            errorCode: codeMatch ? codeMatch[1] : 'IO_ERROR',
            error: errStr
        });
    }
    return;
}
