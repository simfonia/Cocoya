/**
 * Cocoya Dataset Sampler 模組
 * [Sidecar 重構版] 負責透過 Python Sidecar 管理攝影機與擷取
 * [Stage 2] 所有 Bridge 通訊改經 io/bridge.js（correlation + timeout + unsubscribe）
 */

import { datasetBridge } from './io/bridge.js';

export const Sampler = {
    state: {
        isCapturing: false,
        isCamRunning: false, 
        lastPreviewUrl: null, 
        burstTimer: null,
        burstInterval: 500, 
        targetLabel: '',
        onSampleCaptured: null,
        onStatusChanged: null,
        cameraList: [],        // 可用的攝影機清單 [{id, name}]
        selectedDeviceId: 0    // 目前選擇的攝影機 ID
    },

    /**
     * 初始化監聽器 (應由外部呼叫一次)；回傳的 dispose 可解除訂閱
     */
    init() {
        if (this._offStatus) { this._offStatus(); this._offStatus = null; }
        this._offStatus = datasetBridge.subscribe('datasetCameraStatus', (message) => {
            const oldStatus = this.state.isCamRunning;
            this.state.isCamRunning = message.success;
            console.log('[Sampler] Camera status updated:', this.state.isCamRunning);
            
            if (oldStatus !== this.state.isCamRunning && this.state.onStatusChanged) {
                this.state.onStatusChanged(this.state.isCamRunning);
            }
        });
    },

    /** 解除訂閱與連拍（modal 關閉時呼叫，不留幽靈 callback） */
    dispose() {
        if (this._offStatus) { this._offStatus(); this._offStatus = null; }
        this.stopBurst();
    },

    /**
     * 列舉可用攝影機 (呼叫 Sidecar)
     */
    async listCameras() {
        console.log('[Sampler] Requesting camera list...');
        const { promise } = datasetBridge.request({
            command: 'datasetListCameras',
            payload: {},
            resultCommand: 'datasetCameraListResult',
            timeoutMs: 15000
        });
        try {
            const message = await promise;
            if (message.success && message.cameras) {
                this.state.cameraList = message.cameras;
                // 如果目前選擇的 deviceId 不在清單中，重設為第一個
                if (this.state.cameraList.length > 0) {
                    const exists = this.state.cameraList.some(c => c.id === this.state.selectedDeviceId);
                    if (!exists) {
                        this.state.selectedDeviceId = this.state.cameraList[0].id;
                    }
                }
            } else {
                this.state.cameraList = [];
            }
        } catch (e) {
            console.error('[Sampler] Camera list failed:', e.message);
            this.state.cameraList = [];
        }
        return this.state.cameraList;
    },

    /**
     * 設定選擇的攝影機 (切換後不會自動啟動)
     */
    setCameraDevice(deviceId) {
        this.state.selectedDeviceId = deviceId;
        console.log('[Sampler] Camera device selected:', deviceId);
    },

    /**
     * 啟動攝影機 (呼叫 Sidecar)
     */
    async startCamera(deviceId = 0) {
        console.log('[Sampler] Requesting Sidecar Camera start...');
        try {
            // 狀態由全域訂閱處理；此處等待啟動回覆（pending 先註冊，無 race）
            const { promise } = datasetBridge.request({
                command: 'datasetStartCamera',
                payload: { deviceId },
                resultCommand: 'datasetCameraStatus',
                timeoutMs: 15000
            });
            const message = await promise;
            return message.success;
        } catch (e) {
            console.error('[Sampler] Camera start failed:', e.message);
            return false;
        }
    },

    /**
     * 停止攝影機
     * @param {boolean} [force] true＝略過 isCamRunning 守衛（關閉 modal／切換會話等清理路徑用，
     *   避免狀態已失步時漏送 stopCamera 而留下 OpenCV 視窗）
     */
    stopCamera(force = false) {
        if (!force && !this.state.isCamRunning) {
            return; // 防止重複停止
        }
        datasetBridge.send('datasetStopCamera', {});
        this.state.isCamRunning = false; // 更新狀態
        this.stopBurst();
    },

    /**
     * 擷取單張畫面 (呼叫 Sidecar)
     */
    async takeSnapshot(projectName = 'dataset') {
        console.log('[Sampler] Requesting snapshot...');
        const requestId = Math.random().toString(36).substring(7);
        // Stage 2：request correlation（requestId 精準配對 + timeout 清理，取代裸 listener）
        const { promise } = datasetBridge.request({
            command: 'datasetCaptureImage',
            payload: {
                projectName,
                label: this.state.targetLabel
            },
            resultCommand: 'datasetCaptureResult',
            requestId,
            timeoutMs: 15000
        });

        let message;
        try {
            message = await promise;
        } catch (e) {
            throw new Error(e.code === 'TIMEOUT' ? '擷取超時 (Host 無回應)' : (e.message || '擷取失敗'));
        }

        console.log('[Sampler] Capture result received:', message.success);

        if (!(message.success && message.base64)) {
            throw new Error(message.error || '擷取失敗 (Sidecar 無回傳資料)');
        }

        try {
            const byteCharacters = atob(message.base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'image/jpeg' });

            // 更新最近預覽圖 URL
            if (this.state.lastPreviewUrl) URL.revokeObjectURL(this.state.lastPreviewUrl);
            this.state.lastPreviewUrl = URL.createObjectURL(blob);

            // 嘗試更新 DOM
            const previewImg = document.getElementById('dataset-sampler-last-preview');
            const placeholder = document.getElementById('dataset-sampler-placeholder');
            if (previewImg) {
                previewImg.src = this.state.lastPreviewUrl;
                previewImg.style.display = 'block';
                if (placeholder) placeholder.style.display = 'none';
                console.log('[Sampler] DOM preview updated');
            } else {
                console.warn('[Sampler] Preview element not found in DOM');
            }

            if (this.state.onSampleCaptured) {
                this.state.onSampleCaptured(blob, this.state.targetLabel, message.savePath || null);
            }
            return blob;
        } catch (err) {
            console.error('[Sampler] Base64 conversion failed:', err);
            throw err;
        }
    },

    /**
     * 開始連拍
     */
    startBurst(interval = 500, projectName = 'dataset') {
        if (this.state.burstTimer) this.stopBurst();
        this.state.burstInterval = interval;
        this.state.isCapturing = true;

        this.state.burstTimer = setInterval(async () => {
            try {
                await this.takeSnapshot(projectName);
            } catch (e) {
                console.error('[Sampler] Burst capture failed:', e);
            }
        }, this.state.burstInterval);
    },

    /**
     * 停止連拍
     */
    stopBurst() {
        if (this.state.burstTimer) {
            clearInterval(this.state.burstTimer);
            this.state.burstTimer = null;
        }
        this.state.isCapturing = false;
    },

    /**
     * 設定目標標籤
     */
    setTargetLabel(label) {
        this.state.targetLabel = label;
    }
};
