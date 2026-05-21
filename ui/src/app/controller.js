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
            // 先更新 Bridge 的能力資訊 (包含重要的 isRemoteConnected 狀態)
            if (this.bridge.updateCapabilities && m.capabilities) {
                this.bridge.updateCapabilities(m.capabilities);
            }

            // 同步雲端 AI 狀態
            if (m.cloudAiEnabled !== undefined && this.ui.updateCloudAiToggle) {
                this.ui.updateCloudAiToggle(m.cloudAiEnabled);
            }

            await this.app.initializeCocoya(m.data, m.mediaUri, m.lang);
            // 當環境資訊就緒後，執行雲端模式校準
            if (this.ui.syncCloudAiToggle) this.ui.syncCloudAiToggle();
        });
        this.handlers.set('loadWorkspace', async (m) => await this.app.loadWorkspace(m.xml, m.filename, m.platform, m.is_read_only));
        this.handlers.set('resetWorkspace', () => this.app.resetWorkspace());
        this.handlers.set('saveCompleted', (m) => this.app.onSaveCompleted(m.filename));
        this.handlers.set('switchPlatform', async (m) => await this.app.switchPlatform(m.platform));
        this.handlers.set('recoveryData', async (m) => await this.app.checkAutoBackup(m.xml));
        this.handlers.set('promptResponse', (m) => this.app.handlePromptResponse(m));
        this.handlers.set('toolboxData', (m) => this.app.handleToolboxData(m));

        // UI 渲染與反饋
        this.handlers.set('runCompleted', () => { if (this.ui.flashButton) this.ui.flashButton('btn-run', '#c8e6c9'); });
        this.handlers.set('updateStatus', (m) => { if (this.ui.setUpdateStatus) this.ui.setUpdateStatus(m.data); });
        this.handlers.set('serialPortsData', (m) => { if (this.ui.updateSerialPorts) this.ui.updateSerialPorts(m.ports); });
        this.handlers.set('environmentStatus', (m) => { if (this.ui.updateEnvironmentStatus) this.ui.updateEnvironmentStatus(m.results); });
        this.handlers.set('cloudAiModeStatus', (m) => { if (this.ui.updateCloudAiToggle) this.ui.updateCloudAiToggle(m.enabled); });
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
