/**
 * Cocoya 通訊橋樑基礎類別 (Base Bridge)
 * 定義通訊規格與共用設施
 */
export class BaseBridge {
    constructor() {
        this.isVsCode = false;
        this.isTauri = false;
        this.ready = new Promise((resolve) => {
            this._resolveReady = resolve;
        });
        this._listeners = new Set();
        
        // 預設能力清單
        this._caps = {
            hasTerminal: false,
            canClose: false,
            supportsAutoUpdate: false,
            supportsFirmwareReset: false,
            supportsEnvironmentCheck: false,
            supportsStableMode: false,
            supportsEraseFS: false,
            isTauri: false,
            isRemoteAware: false,
            isRemoteConnected: false
        };
    }

    /**
     * 獲取環境功能清單 (Capabilities)
     * @returns {Object}
     */
    get capabilities() {
        return this._caps;
    }

    /**
     * 更新環境功能清單 (由 Host 注入環境資訊時調用)
     */
    updateCapabilities(caps) {
        if (caps) {
            Object.assign(this._caps, caps);
        }
    }

    /**
     * 初始化橋接器 (由子類別重寫)
     */
    init() {
        this._resolveReady();
    }

    /**
     * 發送指令至後端 (由子類別實作核心邏輯)
     * @param {string} command 
     * @param {object} data 
     */
    async send(command, data = {}) {
        await this.ready;
        // 由子類別實作
    }

    /**
     * 註冊監聽器
     */
    onMessage(callback) {
        this._listeners.add(callback);
    }

    /**
     * 移除監聽器
     */
    offMessage(callback) {
        this._listeners.delete(callback);
    }

    /**
     * 將訊息分發給所有註冊的監聽器
     */
    _dispatchToFrontend(message) {
        this._listeners.forEach(cb => cb(message));
    }

    // --- 通用捷徑方法 ---

    getManifest() { 
        this.send('getManifest'); 
    }

    saveFile(xml, isDirty) { 
        this.send('saveFile', { xml, isDirty }); 
    }

    runCode(code, platform, serialPort, serialUploadOnly = false) { 
        this.send('runCode', { code, platform, serialPort, serialUploadOnly }); 
    }

    stopCode() { 
        this.send('stopCode'); 
    }

    /**
     * 彈出資料夾選取視窗 (回傳 Promise<Object|null>)
     */
    pickFolder() {
        const requestId = 'pickFolder_' + Date.now();
        return new Promise((resolve) => {
            const handler = (msg) => {
                if (msg.command === 'pickFolderResponse' && msg.requestId === requestId) {
                    this.offMessage(handler);
                    resolve(msg.result);
                }
            };
            this.onMessage(handler);
            this.send('pickFolder', { requestId });
        });
    }

    /**
     * 彈出確認視窗 (回傳 Promise<boolean>)
     */
    confirm(message) {
        const requestId = 'confirm_' + Date.now();
        return new Promise((resolve) => {
            const handler = (msg) => {
                if (msg.command === 'promptResponse' && msg.requestId === requestId) {
                    this.offMessage(handler);
                    resolve(msg.result);
                }
            };
            this.onMessage(handler);
            this.send('confirm', { message, requestId });
        });
    }

    /**
     * 彈出輸入視窗 (回傳 Promise<string|null>)
     */
    prompt(message, defaultValue = '') {
        const requestId = 'prompt_' + Date.now();
        return new Promise((resolve) => {
            const handler = (msg) => {
                if (msg.command === 'promptResponse' && msg.requestId === requestId) {
                    this.offMessage(handler);
                    resolve(msg.result);
                }
            };
            this.onMessage(handler);
            this.send('prompt', { message, defaultValue, requestId });
        });
    }

    /**
     * 彈出警告視窗
     */
    alert(message) {
        this.send('alert', { message });
    }

    /**
     * 彈出型號選取視窗 (由子類別根據平台特性優化實作)
     */
    async pickMcuModel(options) {
        const requestId = 'pick_' + Date.now();
        return new Promise((resolve) => {
            const handler = (msg) => {
                if (msg.command === 'promptResponse' && msg.requestId === requestId) {
                    this.offMessage(handler);
                    resolve(msg.result);
                }
            };
            this.onMessage(handler);
            this.send('pickMcuModel', { options, requestId });
        });
    }

    /**
     * 開始訓練模型（本地或 DGX）
     * @param {Object} config - 訓練配置
     * @param {string} config.projectName - 專案名稱
     * @param {string} config.taskType - 任務類型
     * @param {string} config.backend - 訓練後端 ('local' 或 'dgx')
     * @param {Object} [config.sshConfig] - SSH 配置（DGX 模式需要）
     * @returns {Promise<Object>} 訓練結果
     */
    startTraining(config) {
        const requestId = 'train_' + Date.now();
        return new Promise((resolve) => {
            const handler = (msg) => {
                if (msg.command === 'trainingComplete' && msg.requestId === requestId) {
                    this.offMessage(handler);
                    resolve({ success: true, ...msg });
                } else if (msg.command === 'trainingError' && msg.requestId === requestId) {
                    this.offMessage(handler);
                    resolve({ success: false, error: msg.error });
                }
            };
            this.onMessage(handler);
            this.send('startTraining', { ...config, requestId });
        });
    }

    /**
     * 監聽訓練日誌（用於即時顯示訓練進度）
     * @param {Function} callback - 回調函式，接收日誌訊息
     */
    onTrainingLog(callback) {
        const handler = (msg) => {
            if (msg.command === 'trainingLog') {
                callback(msg.message);
            }
        };
        this.onMessage(handler);
        // 返回取消監聽的函式
        return () => this.offMessage(handler);
    }
}
