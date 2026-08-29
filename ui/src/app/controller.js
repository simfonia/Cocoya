/**
 * Cocoya App 中央控制器 (Command Controller)
 * 負責後端事件的分發與前端命令的轉發，達成邏輯與環境解耦
 */
class AppController {
    constructor(app, ui, bridge) {
        this.app = app;
        this.ui = ui;
        this.bridge = bridge;
        
        // 指令映射表 (Command Dispatcher Map)
        this.handlers = new Map();
        this._initHandlers();
        this._setupListeners();
    }

    /**
     * 註冊指令處理器
     */
    _initHandlers() {
        // App 核心邏輯
        this.handlers.set('manifestData', async (m) => {
            // 使用者語系偏好覆寫（首頁快速設定 → localStorage），雙平台統一
            try {
                const savedLang = localStorage.getItem('cocoya_lang');
                if (savedLang === 'zh-hant' || savedLang === 'en') m.lang = savedLang;
            } catch (e) { }
            // 先更新 Bridge 的能力資訊 (包含重要的 isRemoteConnected 狀態)
            if (this.bridge.updateCapabilities && m.capabilities) {
                this.bridge.updateCapabilities(m.capabilities);
            }

            // 雲端 AI 全域開關已移除（見 log/plan/RemoteTrainingRefactor.md D1）

            await this.app.initializeCocoya(m.data, m.mediaUri, m.lang);
            // 專案錨定檢查：未錨定則顯示啟動首頁（開新/開啟）
            if (this.app.showStartupHomeIfNeeded) this.app.showStartupHomeIfNeeded();
        });
        this.handlers.set('loadWorkspace', async (m) => await this.app.loadWorkspace(m.xml, m.filename, m.platform, m.is_read_only));
        this.handlers.set('resetWorkspace', () => this.app.resetWorkspace());
        this.handlers.set('saveCompleted', (m) => this.app.onSaveCompleted(m.filename, m.tag));
        this.handlers.set('recoveryData', async (m) => await this.app.checkAutoBackup(m.xml));
        this.handlers.set('promptResponse', (m) => this.app.handlePromptResponse(m));
        this.handlers.set('toolboxData', (m) => this.app.handleToolboxData(m));

        // UI 渲染與反饋
        this.handlers.set('runCompleted', () => { if (this.ui.flashButton) this.ui.flashButton('btn-run', '#c8e6c9'); });
        this.handlers.set('updateStatus', (m) => { if (this.ui.setUpdateStatus) this.ui.setUpdateStatus(m.data); });
        this.handlers.set('serialPortsData', (m) => { if (this.ui.updateSerialPorts) this.ui.updateSerialPorts(m.ports); });
        this.handlers.set('environmentStatus', (m) => { if (this.ui.updateEnvironmentStatus) this.ui.updateEnvironmentStatus(m); });
    }

    /**
     * 初始化監聽後端訊息
     */
    _setupListeners() {
        this.bridge.onMessage(async (message) => {
            await this.handleCommand(message);
        });
    }

    /**
     * 中央指令處理器
     */
    async handleCommand(message) {
        const { command } = message;
        const handler = this.handlers.get(command);

        if (handler) {
            try {
                await handler(message);
            } catch (error) {
                console.error(`[Controller] Error handling command "${command}":`, error);
            }
        } else {
            // console.warn(`[Controller] No handler registered for command: ${command}`);
        }
    }

    /**
     * 執行前端指令並轉發至後端
     */
    dispatch(command, payload = {}) {
        this.bridge.send(command, payload);
    }
}

// 註冊到全域以便初始化
window.AppController = AppController;
