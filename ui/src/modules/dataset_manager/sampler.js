/**
 * Cocoya Dataset Sampler 模組
 * [Sidecar 重構版] 負責透過 Python Sidecar 管理攝影機與擷取
 */

export const Sampler = {
    state: {
        isCapturing: false,
        isCamRunning: false, 
        lastPreviewUrl: null, 
        burstTimer: null,
        burstInterval: 500, 
        targetLabel: '',
        onSampleCaptured: null,
        onStatusChanged: null // 新增：狀態變更回調
    },

    /**
     * 初始化監聽器 (應由外部呼叫一次)
     */
    init() {
        window.addEventListener('message', (event) => {
            const message = event.data;
            if (message.command === 'datasetCameraStatus') {
                const oldStatus = this.state.isCamRunning;
                this.state.isCamRunning = message.success;
                console.log('[Sampler] Camera status updated:', this.state.isCamRunning);
                
                if (oldStatus !== this.state.isCamRunning && this.state.onStatusChanged) {
                    this.state.onStatusChanged(this.state.isCamRunning);
                }
            }
        });
    },

    /**
     * 啟動攝影機 (呼叫 Sidecar)
     */
    async startCamera(deviceId = 0) {
        console.log('[Sampler] Requesting Sidecar Camera start...');
        return new Promise((resolve) => {
            // 注意：這裡不再需要 handler，因為狀態會由全域監聽器處理
            // 但為了 Promise 我們仍然監聽一次性的成功回覆
            const onceHandler = (event) => {
                const message = event.data;
                if (message.command === 'datasetCameraStatus') {
                    window.removeEventListener('message', onceHandler);
                    resolve(message.success);
                }
            };
            window.addEventListener('message', onceHandler);
            window.CocoyaBridge.send('datasetStartCamera', { deviceId });
        });
    },

    /**
     * 停止攝影機
     */
    stopCamera() {
        console.log('[Sampler] Stopping Sidecar Camera...');
        window.CocoyaBridge.send('datasetStopCamera', {});
        this.state.isCamRunning = false; // 更新狀態
        this.stopBurst();
    },

    /**
     * 擷取單張畫面 (呼叫 Sidecar)
     */
    async takeSnapshot(projectName = 'dataset') {
        console.log('[Sampler] Requesting snapshot...');
        return new Promise((resolve, reject) => {
            const requestId = Math.random().toString(36).substring(7);
            
            const timeout = setTimeout(() => {
                window.removeEventListener('message', handler);
                reject(new Error('擷取超時 (Host 無回應)'));
            }, 5000);

            const handler = (event) => {
                const message = event.data;
                if (message.command === 'datasetCaptureResult' && message.requestId === requestId) {
                    clearTimeout(timeout);
                    window.removeEventListener('message', handler);
                    
                    console.log('[Sampler] Capture result received:', message.success);

                    if (message.success && message.base64) {
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
                                this.state.onSampleCaptured(blob, this.state.targetLabel);
                            }
                            resolve(blob);
                        } catch (err) {
                            console.error('[Sampler] Base64 conversion failed:', err);
                            reject(err);
                        }
                    } else {
                        reject(new Error(message.error || '擷取失敗 (Sidecar 無回傳資料)'));
                    }
                }
            };

            window.addEventListener('message', handler);
            window.CocoyaBridge.send('datasetCaptureImage', { 
                requestId,
                projectName,
                label: this.state.targetLabel
            });
        });
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
