/**
 * ui/src/bridge/tauri/camera.js — dataset camera and feature acquisition command group（P2-1 split）
 *
 * Maps to the following cases in the original `BridgeTauri.send()` switch:
 *   datasetListCameras / datasetStartCamera / datasetGetCameraStatus /
 *   datasetStopCamera / datasetCaptureImage / datasetCollectFeature
 *
 * All six commands go through `_handleDatasetCommand` (sidecar dispatch),
 * none call tauriInvoke directly -- this is what distinguishes this group from `annotation.js`.
 * Note: datasetCaptureImage additionally reads get_project_anchor for the save path,
 * so this file is not purely sidecar.
 *
 * 【handler contract】signature `async function handler(command, data)`, invoked via
 * `handler.call(this, command, data)`. The return value is deliberately discarded
 * (see the send() note in tauri.js).
 * @this {import('../tauri.js').BridgeTauri}
 */

/**
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function datasetListCameras(_command, data) {
    await this._handleDatasetCommand('listCameras', data, (response) => {
        this._dispatchToFrontend({
            command: 'datasetCameraListResult',
            success: response.success,
            cameras: response.cameras || []
        });
    });
    return;
}

/**
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function datasetStartCamera(_command, data) {
    await this._handleDatasetCommand('startCamera', data, (response) => {
        this._dispatchToFrontend({
            command: 'datasetCameraStartResult',
            requestId: data.requestId,
            success: response.success,
            running: response.success,
            error: response.error
        });
    });
    return;
}

/**
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function datasetGetCameraStatus(_command, data) {
    await this._handleDatasetCommand('getCameraStatus', data, (response) => {
        const running = (response.running !== undefined) ? !!response.running : !!response.success;
        this._dispatchToFrontend({
            command: 'datasetCameraStatusSync',
            requestId: data.requestId,
            running,
            success: running
        });
    });
    return;
}

/**
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function datasetStopCamera(_command, data) {
    await this._handleDatasetCommand('stopCamera', data, (_response) => {
        // 停止成功後，攝影機不在 running 狀態，故 success: false
        this._dispatchToFrontend({
            command: 'datasetCameraStatus',
            success: false
        });
    });
    return;
}

/**
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function datasetCaptureImage(_command, data) {
    {
        // live 影像落盤：動態取得最新專案根（_anchor 是 init 時快照，開啟專案後會過期）
        // 依 `projectRoot/dataset/<專案>/<標籤>/` 生成 savePath（對齊 VSIX 慣例）。
        // 未錨定（無專案根）則不落盤（diskPath 為 null）。
        if (!data.savePath) {
            let projectRoot = this._anchor && this._anchor.projectRoot;
            if (!projectRoot) {
                try {
                    const anchor = this._normalizeAnchor(await this.tauriInvoke('get_project_anchor'));
                    projectRoot = anchor && anchor.projectRoot;
                    this._anchor = anchor;
                } catch (e) { projectRoot = null; }
            }
            if (projectRoot) {
                const project = data.projectName || 'dataset';
                const label = data.label || 'unlabeled';
                const stamp = Date.now();
                data.savePath = `${projectRoot}/dataset/${project}/${label}/${label}_${stamp}.jpg`;
            }
            console.log('[Capture] projectRoot =', projectRoot, '-> generated savePath =', data.savePath);
        }
    }
    await this._handleDatasetCommand('captureImage', data, (response) => {
        console.log('[Capture] sidecar response savePath =', response.savePath);
        this._dispatchToFrontend({
            command: 'datasetCaptureResult',
            requestId: data.requestId,
            success: response.success,
            base64: response.base64 || null,
            width: response.width || 0,
            height: response.height || 0,
            label: response.label || data.label,
            savePath: response.savePath || null,
            error: response.error
        });
    });
    return;
}

/**
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function datasetCollectFeature(_command, data) {
    // M4：特徵採集——轉發到 sidecar collectFeature；回應帶原始 landmarks（前端持 schema）
    await this._handleDatasetCommand('collectFeature', data, (response) => {
        this._dispatchToFrontend({
            command: 'datasetCollectFeatureResult',
            requestId: data.requestId,
            success: response.success,
            label: response.label || data.label,
            useZ: response.useZ,
            handDetected: response.hand_detected,
            poseDetected: response.pose_detected,
            hand: response.hand,
            pose: response.pose,
            errorCode: response.errorCode,
            error: response.error
        });
    });
    return;
}
