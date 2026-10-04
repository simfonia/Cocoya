/**
 * ui/src/bridge/tauri/annotation.js — dataset image deletion and label renaming command group（P2-1 split）
 *
 * Maps to the following cases in the original `BridgeTauri.send()` switch:
 *   datasetDeleteImage / datasetRenameLabel
 *
 * These two are the only dataset commands that call tauriInvoke **directly**
 * rather than going through `_handleDatasetCommand`. Deliberately kept separate from
 * `camera.js` so sidecar-dispatched and directly-invoked commands are not mixed.
 * datasetRenameLabel was originally a block-form case (case 'x': {).
 *
 * 【handler contract】signature `async function handler(command, data)`, invoked via
 * `handler.call(this, command, data)`. The return value is deliberately discarded
 * (see the send() note in tauri.js).
 * @this {import('../tauri.js').BridgeTauri}
 */

/**
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function datasetDeleteImage(_command, data) {
    try {
        await this.tauriInvoke('delete_file', { path: data.filePath });
        this._dispatchToFrontend({ command: 'datasetDeleteImageResult', success: true });
    } catch (e) {
        console.error('[Bridge] Delete image failed:', e);
        // Rust 回 "FILE_NOT_FOUND: ..." → 帶 errorCode 供前端區分「檔案本就不存在」與真實 IO 失敗
        const codeMatch = String(e || '').match(/^([A-Z][A-Z0-9_]*):/);
        this._dispatchToFrontend({
            command: 'datasetDeleteImageResult',
            success: false,
            errorCode: codeMatch ? codeMatch[1] : 'IO_ERROR',
            error: String(e)
        });
    }
    return;
}

/**
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function datasetRenameLabel(_command, data) {
    // 標籤改名磁碟同步（2026-09-16 Part B）：canonical <projectRoot>/dataset/<專案>/ 落盤區
    try {
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
                command: 'datasetRenameLabelResult',
                success: false,
                errorCode: 'PROJECT_ROOT_REQUIRED',
                error: '未錨定專案，無法同步磁碟資料夾'
            });
            return;
        }
        const datasetDir = `${projectRoot}/dataset/${data.projectName || 'dataset'}`;
        const renames = await this.tauriInvoke('dataset_rename_label', {
            datasetDir,
            oldLabel: data.oldLabel,
            newLabel: data.newLabel
        });
        this._dispatchToFrontend({ command: 'datasetRenameLabelResult', success: true, renames: renames || [] });
    } catch (e) {
        console.error('[Bridge] Label disk rename failed:', e);
        const errStr = String(e || '');
        const codeMatch = errStr.match(/^([A-Z][A-Z0-9_]*):/);
        this._dispatchToFrontend({
            command: 'datasetRenameLabelResult',
            success: false,
            errorCode: codeMatch ? codeMatch[1] : 'IO_ERROR',
            error: errStr
        });
    }
    return;
}
