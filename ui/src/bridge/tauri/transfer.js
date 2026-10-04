/**
 * ui/src/bridge/tauri/transfer.js — dataset import / export / upload command group（P2-1 split）
 *
 * Maps to the following cases in the original `BridgeTauri.send()` switch:
 *   datasetExport / datasetUploadArchive / datasetImportFromFolder
 *
 * datasetUploadArchive maintains `this._datasetUploadChain` (a promise chain guarding against
 * concurrent uploads) -- the only case in the whole bridge layer that carries mutable
 * instance state. Kept in its own file so that responsibility is easy to locate.
 *
 * 【handler contract】signature `async function handler(command, data)`, invoked via
 * `handler.call(this, command, data)`. The return value is deliberately discarded
 * (see the send() note in tauri.js).
 * @this {import('../tauri.js').BridgeTauri}
 */

/**
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function datasetExport(_command, data) {
    try {
        const pythonPath = localStorage.getItem('pythonPath') || 'python';
        const result = await this.tauriInvoke('export_dataset', {
            specJson: JSON.stringify(data.spec),
            sourceFolderPath: data.sourceFolderPath || '',
            pythonPath: pythonPath
        });
        this._dispatchToFrontend({
            command: 'datasetExportResult',
            success: true,
            path: result
        });
    } catch (e) {
        if (e === 'Canceled') {
            // 使用者取消存檔對話框：仍需回傳 result，否則 DSM 的
            // exportPromise 會等到 120s timeout，綠色進度條遲遲不消失。
            this._dispatchToFrontend({
                command: 'datasetExportResult',
                success: false,
                error: 'Canceled',
                errorCode: 'CANCELED'
            });
        } else {
            console.error('[Bridge] Export dataset failed:', e);
            this._dispatchToFrontend({
                command: 'datasetExportResult',
                success: false,
                error: String(e)
            });
        }
    }
    return;
}

/**
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function datasetUploadArchive(_command, data) {
    {
        const uploadTask = async () => {
            try {
                const localZipPath = await this.tauriInvoke('dataset_upload_chunk', {
                    fileId: data.fileId,
                    chunkIndex: data.chunkIndex,
                    totalChunks: data.totalChunks,
                    zipDataChunk: data.zipDataChunk,
                    projectName: data.projectName || 'dataset',
                    isLast: !!data.isLast
                });
                if (!localZipPath) return;

                const uploadPayload = Object.assign({}, data, { localZipPath });
                delete uploadPayload.zipDataChunk;
                delete uploadPayload.chunkIndex;
                delete uploadPayload.totalChunks;
                delete uploadPayload.isLast;
                await this._handleDatasetCommand('uploadDataset', uploadPayload, (response) => {
                    this._dispatchToFrontend({
                        command: 'datasetUploadResult',
                        success: !!response.success,
                        errorCode: response.errorCode,
                        error: response.error
                    });
                });
            } catch (e) {
                console.error('[Bridge] Dataset upload failed:', e);
                this._dispatchToFrontend({
                    command: 'datasetUploadResult',
                    success: false,
                    error: String(e)
                });
            }
        };
        this._datasetUploadChain = this._datasetUploadChain.then(uploadTask, uploadTask);
        await this._datasetUploadChain;
    }
    return;
}

/**
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function datasetImportFromFolder(_command, data) {
    try {
        const importResult = await this.tauriInvoke('dataset_import_from_folder', {
            sourcePath: data.sourcePath,
            projectName: data.projectName,
            confirmed: !!data.confirmed
        });
        // 與 pickFolder 同規範：Rust 回傳原始絕對路徑，必須轉 asset protocol URL 才能在 webview 顯示
        const { convertFileSrc } = await import('@tauri-apps/api/core');
        const importImagesConverted = (importResult.images || []).map(img => ({
            name: img.name,
            path: img.path,
            label: img.label,
            blobUrl: convertFileSrc(img.blobUrl)
        }));
        this._dispatchToFrontend({
            command: 'datasetImportFromFolderResult',
            requestId: data.requestId,
            action: importResult.action,
            path: importResult.path || null,
            canonicalDir: importResult.canonicalDir,
            copiedFiles: importResult.copiedFiles || null,
            images: importImagesConverted,
            labelCounts: importResult.labelCounts || {},
            labelMap: importResult.labelMap || {}
        });
    } catch (e) {
        console.error('[Bridge] Dataset import from folder failed:', e);
        const errStr = String(e || '');
        const codeMatch = errStr.match(/^([A-Z][A-Z0-9_]*):/);
        this._dispatchToFrontend({
            command: 'datasetImportFromFolderResult',
            requestId: data.requestId,
            errorCode: codeMatch ? codeMatch[1] : 'IO_ERROR',
            error: errStr
        });
    }
    return;
}
