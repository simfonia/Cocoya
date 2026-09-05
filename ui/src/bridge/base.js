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
            isRemoteConnected: false,
            isAnchored: false,
            projectRoot: null
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
     * @param {string|null} defaultPath 對話框起始目錄（預設用 XML 專案根）
     * 回傳物件包含 { path, images, labelCounts, labelMap }
     */
    pickFolder(defaultPath = null) {
        const requestId = 'pickFolder_' + Date.now();
        return new Promise((resolve) => {
            const handler = (msg) => {
                if (msg.command === 'folderSelected' && msg.requestId === requestId) {
                    this.offMessage(handler);
                    if (msg.error) {
                        resolve(null);
                    } else {
                        resolve({
                            path: msg.path,
                            images: msg.images || [],
                            labelCounts: msg.labelCounts || {},
                            labelMap: msg.labelMap || {}
                        });
                    }
                }
            };
            this.onMessage(handler);
            this.send('pickFolder', { requestId, defaultPath });
        });
    }

    /**
     * 彈出資料檔（CSV/JSON）選取視窗 (回傳 Promise<Object|null>)
     * @param {string|null} defaultPath 對話框起始目錄（預設用 XML 專案根）
     * 回傳物件包含 { path, content }（content 為 UTF-8 檔案內容）
     */
    pickDataFile(defaultPath = null) {
        const requestId = 'pickDataFile_' + Date.now();
        return new Promise((resolve) => {
            const handler = (msg) => {
                if (msg.command === 'dataFileSelected' && msg.requestId === requestId) {
                    this.offMessage(handler);
                    if (msg.error) {
                        resolve(null);
                    } else {
                        resolve({
                            path: msg.path,
                            content: msg.content
                        });
                    }
                }
            };
            this.onMessage(handler);
            this.send('pickDataFile', { requestId, defaultPath });
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
     * 儲存資料集標註進度（寫入 dataset.json）
     * @param {string} projectName - 資料集專案名稱
     * @param {Object} spec - DatasetSpec 的 toJSON() 結果（含 annotations）
     */
    saveDatasetProgress(projectName, spec) {
        this.send('datasetSaveProgress', { projectName, spec });
    }

    /**
     * 讀取資料集標註進度（讀取指定資料夾內的 dataset.json）
     * @param {string} folderPath - 已掃描的資料集資料夾路徑
     */
    loadDatasetProgress(folderPath) {
        this.send('datasetLoadProgress', { folderPath });
    }

    /**
     * 查詢目前視窗的權威錨定狀態（後端即時裁決，非 capabilities 快照）。
     * @returns {Promise<{isAnchored:boolean, projectRoot:string|null}>}
     */
    getProjectAnchor() {
        return new Promise((resolve) => {
            const requestId = 'anchor_' + Date.now() + '_' + Math.random().toString(36).slice(2);
            const handler = (msg) => {
                if (msg.command === 'projectAnchorResult' && msg.requestId === requestId) {
                    this.offMessage(handler);
                    resolve({ isAnchored: !!msg.isAnchored, projectRoot: msg.projectRoot || null });
                }
            };
            this.onMessage(handler);
            this.send('getProjectAnchor', { requestId });
        });
    }

    /**
     * 資料集匯入前置檢查（2026-08-26 決策：資料集必須位於專案根 dataset/<專案名>）。
     * 來源在專案根內且即 canonical → action='use'；
     * 來源在外 → action='confirm_required'（confirmed=true 時後端複製後掃描，action='copied'）。
     * @param {string} sourcePath - 使用者選擇的來源資料夾
     * @param {string} projectName - 目前表單專案名稱
     * @param {boolean} [confirmed=false] - 使用者已確認複製
     * @returns {Promise<Object>} datasetImportFromFolderResult payload
     */
    prepareDatasetImport(sourcePath, projectName, confirmed = false) {
        return new Promise((resolve) => {
            const requestId = 'dsimp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
            const handler = (msg) => {
                if (msg.command === 'datasetImportFromFolderResult' && msg.requestId === requestId) {
                    this.offMessage(handler);
                    resolve(msg);
                }
            };
            this.onMessage(handler);
            this.send('datasetImportFromFolder', { requestId, sourcePath, projectName, confirmed });
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
