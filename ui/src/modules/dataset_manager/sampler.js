/**
 * Cocoya Dataset Sampler 模組
 * [Sidecar 重構版] 負責透過 Python Sidecar 管理攝影機與擷取
 * [Stage 2] 所有 Bridge 通訊改經 io/bridge.js（correlation + timeout + unsubscribe）
 */

import { datasetBridge } from './io/bridge.js';

export const Sampler = {
    /** [2026-10-21] 連拍熔斷門檻：連續失敗達此數即停止連拍（避免無意義輪詢） */
    BURST_MAX_FAILURES: 3,

    state: {
        isCapturing: false,
        isCamRunning: false, 
        lastPreviewUrl: null, 
        burstTimer: null,
        burstInterval: 500,
        previewTimer: null,
        previewInterval: 66,
        previewPending: false,
        lastPreviewFrameId: null,
        targetLabel: '',
        onSampleCaptured: null,
        onStatusChanged: null,
        cameraList: [],        // 可用的攝影機清單 [{id, name}]
        selectedDeviceId: 0    // 目前選擇的攝影機 ID
    },

    /**
     * 初始化監聽器 (應由外部呼叫一次)；回傳的 dispose 可解除訂閱
     *
     * [2026-10-21 資源釋放] 冪等：重複呼叫不會產生第二組訂閱
     * （先解除既有訂閱再重新訂閱）。另注意 dispose() 會解除訂閱，
     * 而 Sampler 是跨 DM 開關存活的單例 —— 因此每次開啟 DM 都必須再呼叫
     * init()，否則關閉一次後相機狀態事件就再也收不到（見 ui_layout.openDatasetManager）。
     */
    init() {
        if (this._offStatus) { this._offStatus(); this._offStatus = null; }
        if (this._offStatusSync) { this._offStatusSync(); this._offStatusSync = null; }
        this._offStatus = datasetBridge.subscribe('datasetCameraStatus', (message) => {
            const oldStatus = this.state.isCamRunning;
            this.state.isCamRunning = message.success;
            console.log('[Sampler] Camera status updated:', this.state.isCamRunning);

            if (oldStatus !== this.state.isCamRunning && this.state.onStatusChanged) {
                this.state.onStatusChanged(this.state.isCamRunning);
            }
            // [2026-10-21 資源釋放] 相機被外部關閉 → 連拍一併停止
            if (!this.state.isCamRunning) this.stopBurst();
        });
        // 同步通道（getCameraStatus 輪詢/對帳用，與啟動回覆共用的 datasetCameraStatus
        // 不同 command，避免 FIFO 誤吃；狀態語意相同）
        this._offStatusSync = datasetBridge.subscribe('datasetCameraStatusSync', (message) => {
            const running = (message.running !== undefined) ? !!message.running : !!message.success;
            const oldStatus = this.state.isCamRunning;
            this.state.isCamRunning = running;
            if (oldStatus !== this.state.isCamRunning && this.state.onStatusChanged) {
                this.state.onStatusChanged(this.state.isCamRunning);
            }
        });
    },

    /** 解除訂閱與連拍（modal 關閉時呼叫，不留幽靈 callback） */
    dispose() {
        if (this._offStatus) { this._offStatus(); this._offStatus = null; }
        if (this._offStatusSync) { this._offStatusSync(); this._offStatusSync = null; }
        this.stopStatusPoll();
        this.stopBurst();
        this.stopPreviewPolling();
        // [2026-10-21 資源釋放] 釋放預覽用 object URL：
        // 原先只會被「下一次 takeSnapshot 覆蓋」或「永遠不釋放」，
        // 連拍中關閉 DM 會留下一個 blob: URL 與其 blob。
        this.releasePreviewUrl();
    },

    /** 釋放最近預覽圖的 object URL（冪等）。 */
    releasePreviewUrl() {
        if (this.state.lastPreviewUrl) {
            try {
                URL.revokeObjectURL(this.state.lastPreviewUrl);
            } catch (e) {
                console.warn('[Sampler] revokeObjectURL failed:', e);
            }
            this.state.lastPreviewUrl = null;
        }
    },

    /**
     * 向 sidecar 查詢攝影機真值（Ctrl+R 後前端狀態重置、事件遺失時的對帳用）。
     * 成功時同步 state.isCamRunning 並在變化時觸發 onStatusChanged；失敗回傳現值。
     */
    async syncCameraStatus() {
        const { promise } = datasetBridge.request({
            command: 'datasetGetCameraStatus',
            payload: {},
            resultCommand: 'datasetCameraStatusSync',
            timeoutMs: 8000
        });
        try {
            const message = await promise;
            const running = (message.running !== undefined) ? !!message.running : !!message.success;
            const oldStatus = this.state.isCamRunning;
            this.state.isCamRunning = running;
            if (oldStatus !== running && this.state.onStatusChanged) {
                this.state.onStatusChanged(running);
            }
            return running;
        } catch (e) {
            console.warn('[Sampler] syncCameraStatus failed:', e.message || e);
            return this.state.isCamRunning;
        }
    },

    /**
     * 啟動狀態對帳輪詢（X 關窗事件遺失時的兜底；僅在 isCamRunning==true 時查詢）。
     * 呼叫端（啟動成功分支）啟動；停止/重建面板時由 stopStatusPoll 收尾。
     */
    startStatusPoll(intervalMs = 2000) {
        this.stopStatusPoll();
        this._statusPollTimer = setInterval(() => {
            if (!this.state.isCamRunning) {
                this.stopStatusPoll();
                return;
            }
            this.syncCameraStatus().catch(() => {
                // 輪詢期間攝影機可能已被其他流程關閉，同步失敗不需中斷輪詢。
            });
        }, intervalMs);
    },

    stopStatusPoll() {
        if (this._statusPollTimer) {
            clearInterval(this._statusPollTimer);
            this._statusPollTimer = null;
        }
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
     * 回覆走專用 datasetCameraStartResult 通道（帶 requestId 精準配對），
     * 與背景 cameraStatus 事件（datasetCameraStatus）分離，避免兩者共用
     * 同一 command 造成 FIFO 誤吃（Ctrl+R 後 X 關窗事件遺失的主因之一）。
     */
    async startCamera(deviceId = 0) {
        console.log('[Sampler] Requesting Sidecar Camera start...');
        try {
            const requestId = 'cam_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
            const { promise } = datasetBridge.request({
                command: 'datasetStartCamera',
                payload: { deviceId },
                resultCommand: 'datasetCameraStartResult',
                requestId,
                timeoutMs: 15000
            });
            const message = await promise;
            const running = !!message.success;
            if (!running) {
                // 記錄失敗原因供 ui_layout onStartCamera 顯示友善提示（如 SIDECAR_START_FAILED）
                this.state.lastCameraError = message.error || (message.errorCode ? String(message.errorCode) : null);
            } else {
                this.state.lastCameraError = null;
            }
            const oldStatus = this.state.isCamRunning;
            this.state.isCamRunning = running;
            if (running) this.startStatusPoll();
            if (oldStatus !== running && this.state.onStatusChanged) {
                this.state.onStatusChanged(running);
            }
            return running;
        } catch (e) {
            console.error('[Sampler] Camera start failed:', e.message);
            this.state.lastCameraError = e.message || String(e);
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
            // [2026-10-21 資源釋放] 即使守衛早退，也必須清掉連拍計時器：
            // 原先守衛早退會讓 setInterval 殘留（相機已關但 burst 仍在送快照）。
            this.stopBurst();
            return; // 防止重複停止
        }
        datasetBridge.send('datasetStopCamera', {});
        this.state.isCamRunning = false; // 更新狀態
        this.stopStatusPoll();
        this.stopBurst();
        this.stopPreviewPolling();
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

        let newUrl = null;
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
            newUrl = URL.createObjectURL(blob);
            this.state.lastPreviewUrl = newUrl;

            // 直接送出 sample 資料（縮圖新增至影像網格），預覽窗格不再顯示拍攝畫面，避免閃爍
            if (this.state.onSampleCaptured) {
                this.state.onSampleCaptured(blob, this.state.targetLabel, message.savePath || null);
            }
            return blob;
        } catch (err) {
            console.error('[Sampler] Base64 conversion failed:', err);
            // [2026-10-21 資源釋放] 失敗路徑也要釋放剛建立的 object URL，
            // 否則 onSampleCaptured / DOM 拋錯時 blob 會殘留到下一次快照才被覆蓋。
            if (newUrl && this.state.lastPreviewUrl === newUrl) {
                try {
                    URL.revokeObjectURL(newUrl);
                } catch (e) {
                    console.warn('[Sampler] revokeObjectURL failed:', e);
                }
                this.state.lastPreviewUrl = null;
            }
            throw err;
        }
    },

    /**
     * 開始連拍
     *
     * [2026-10-21 資源釋放] 加入熔斷（circuit breaker）：
     * 連拍期間相機被關閉或 Sidecar 連續回應失敗時，setInterval 若不停止
     * 會一直送快照（每次都失敗），留下無意義的輪詢與錯誤噪音。
     */
    startBurst(interval = 500, projectName = 'dataset') {
        if (this.state.burstTimer) this.stopBurst();
        this.state.burstInterval = interval;
        this.state.isCapturing = true;
        // 熔斷狀態：連續失敗次數 + 是否已因相機關閉而中止
        this.state.burstFailCount = 0;
        this.state.burstAborted = false;
        this.state.burstProjectName = projectName;

        this.state.burstTimer = setInterval(async () => {
            // 熔斷：相機已關閉 → 停止連拍，不再送任何請求
            if (this.state.burstAborted || !this.state.isCamRunning) {
                console.warn('[Sampler] Burst aborted (camera not running).');
                this.stopBurst();
                return;
            }
            try {
                await this.takeSnapshot(projectName);
                this.state.burstFailCount = 0;
            } catch (e) {
                this.state.burstFailCount = (this.state.burstFailCount || 0) + 1;
                console.error('[Sampler] Burst capture failed:', e);
                if (this.state.burstFailCount >= Sampler.BURST_MAX_FAILURES) {
                    console.error('[Sampler] Burst circuit breaker triggered.');
                    this.stopBurst();
                }
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
        this.state.burstFailCount = 0;
        this.state.burstAborted = false;
    },

    /** 啟動嵌入式預覽輪詢 (~15fps) */
    startPreviewPolling() {
        if (this.state.previewTimer) this.stopPreviewPolling();
        this.state.previewPending = false;
        this.state.lastPreviewFrameId = null;
        this.state.previewTimer = setInterval(async () => {
            if (!this.state.isCamRunning) return;
            // 幀率節流：前一個請求尚未完成時跳過，避免 pending 堆積
            if (this.state.previewPending) return;
            this.state.previewPending = true;
            try {
                const { promise } = datasetBridge.request({
                    command: 'datasetGetPreviewFrame',
                    payload: {},
                    resultCommand: 'datasetPreviewFrameResult',
                    timeoutMs: 2000
                });
                const message = await promise;
                // [2026-10-24] 相機在請求中途被停止時，提前結束不render最後一幀
                if (!this.state.isCamRunning) return;
                this.state.previewPending = false;
                if (message && message.success && message.image) {
                    // 只渲染最新幀，避免重複渲染同一幀
                    if (message.frame_id != null && message.frame_id === this.state.lastPreviewFrameId) return;
                    this.state.lastPreviewFrameId = message.frame_id;
                    const img = document.getElementById('dataset-sampler-last-preview');
                    const ph = document.getElementById('dataset-sampler-placeholder');
                    if (img) {
                    const byteCharacters = atob(message.image);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
                    const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'image/jpeg' });
                    const url = URL.createObjectURL(blob);
                    if (this.state.lastPreviewUrl) URL.revokeObjectURL(this.state.lastPreviewUrl);
                    this.state.lastPreviewUrl = url;
                    img.src = url;
                        img.style.display = 'block';
                        if (ph) ph.style.display = 'none';
                    }
                }
            } catch (e) {
                this.state.previewPending = false;
                // preview poll 失敗不中斷輪詢，靜默略過
            }
        }, this.state.previewInterval);
    },

    stopPreviewPolling() {
        if (this.state.previewTimer) {
            clearInterval(this.state.previewTimer);
            this.state.previewTimer = null;
        }
        // [2026-10-23 小修] 停止預覽時釋放 object URL、清除 img.src、恢復 placeholder 文案畫面，
        // 避免停留在最後一張影像；重置節流狀態以供下次啟動使用。
        this.releasePreviewUrl();
        if (typeof document !== 'undefined') {
            const img = document.getElementById('dataset-sampler-last-preview');
            const ph = document.getElementById('dataset-sampler-placeholder');
            const flash = document.getElementById('dataset-sampler-flash');
            if (img) { img.src = ''; img.style.display = 'none'; }
            if (ph) ph.style.display = 'block';
            if (flash) flash.style.display = 'none';
        }
        this.state.lastPreviewFrameId = null;
        this.state.previewPending = false;
    },

    /**
     * 設定目標標籤
     */
    setTargetLabel(label) {
        this.state.targetLabel = label;
    }
};
