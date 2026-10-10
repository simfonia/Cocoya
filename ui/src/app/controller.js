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
            // 使用者語系偏好覆寫（首頁快速設定），雙平台統一；存取走 core/settings.js
            const savedLang = CocoyaSettings.get(CocoyaSettings.SETTINGS_KEY.LANG);
            if (savedLang === 'zh-hant' || savedLang === 'en') m.lang = savedLang;
            // 先更新 Bridge 的能力資訊 (包含重要的 isRemoteConnected 狀態)
            if (this.bridge.updateCapabilities && m.capabilities) {
                this.bridge.updateCapabilities(m.capabilities);
            }

            // 雲端 AI 全域開關已移除（見 log/plan/RemoteTrainingRefactor.md D1）

            await this.app.initializeCocoya(m.data, m.mediaUri, m.lang);
            // 專案錨定檢查：未錨定則顯示啟動首頁（開新/開啟）
            if (this.app.showStartupHomeIfNeeded) this.app.showStartupHomeIfNeeded();
        });
        // 2026-10-10 D-1 開檔分叉：內容偵測（計畫 D-12，不可只看副檔名）——
        // Python 內容 → 文字模式（openPyFile 內含 VSIX 閘門與缺平台行 QuickPick）；
        // XML 內容（即使副檔名 .py，使用者改錯）→ 既有積木流程並提示回退。
        this.handlers.set('loadWorkspace', async (m) => {
            const TM = window.CocoyaTextMode;
            if (TM && typeof TM.detectContentKind === 'function' && typeof TM.openPyFile === 'function' &&
                TM.detectContentKind(m.xml) === 'python') {
                await TM.openPyFile({
                    code: m.xml,
                    filename: m.filename,
                    platform: m.platform,
                    isReadOnly: !!m.is_read_only
                });
                return;
            }
            if (TM && typeof TM.detectContentKind === 'function' &&
                /\.py$/i.test(String(m.filename || '')) && TM.detectContentKind(m.xml) === 'xml') {
                try {
                    const tip = (typeof Blockly !== 'undefined' && Blockly.Msg['MSG_OPENED_AS_BLOCKS']) ||
                        'File content is a Cocoya project XML; opened in block mode.';
                    if (window.CocoyaBridge && typeof window.CocoyaBridge.alert === 'function') {
                        window.CocoyaBridge.alert(tip);
                    }
                } catch (e) {}
            }
            await this.app.loadWorkspace(m.xml, m.filename, m.platform, m.is_read_only);
        });
        this.handlers.set('resetWorkspace', () => this.app.resetWorkspace());
        this.handlers.set('saveCompleted', (m) => this.app.onSaveCompleted(m.filename, m.tag));
        this.handlers.set('recoveryData', async (m) => await this.app.checkAutoBackup(m.xml));
        this.handlers.set('promptResponse', (m) => this.app.handlePromptResponse(m));
        this.handlers.set('toolboxData', (m) => this.app.handleToolboxData(m));

        // UI 渲染與反饋
        this.handlers.set('runCompleted', () => { if (this.ui.flashButton) this.ui.flashButton('btn-run', '#c8e6c9'); });
        this.handlers.set('updateStatus', (m) => { if (this.ui.setUpdateStatus) this.ui.setUpdateStatus(m.data); });
        this.handlers.set('serialPortsData', (m) => { if (this.ui.updateSerialPorts) this.ui.updateSerialPorts(m.ports); });
        this.handlers.set('serialMonitorActive', (m) => { if (this.ui.setSerialMonitorActive) this.ui.setSerialMonitorActive(m.active); });
        this.handlers.set('environmentStatus', (m) => { if (this.ui.updateEnvironmentStatus) this.ui.updateEnvironmentStatus(m); });
        this.handlers.set('pythonPathData', (m) => { if (this.ui.updatePythonPathDisplay) this.ui.updatePythonPathDisplay(m.pythonPath); });
        // Python 套件安裝（雙平台統一事件契約，見 hardware.js 的 _envInstall 狀態機）
        this.handlers.set('installModuleLog', (m) => { if (this.ui.appendInstallLog) this.ui.appendInstallLog(m); });
        this.handlers.set('installModuleDone', (m) => { if (this.ui.onInstallDone) this.ui.onInstallDone(m); });
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
