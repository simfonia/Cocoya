/**
 * Cocoya App 持久化模組
 * 負責 XML 載入/儲存、自動備份、恢復與髒狀態管理
 */
window.CocoyaApp = Object.assign(window.CocoyaApp || {}, {
    isDirty: false,
    isReadOnly: false,
    autoBackupTimer: null,

    /**
     * 設定髒狀態並通知後端
     */
    setDirty: function(dirty) { 
        if (this.isInitializing && dirty === true) return Promise.resolve();

        const shouldSync = this.isDirty !== dirty || dirty === false;
        if (!shouldSync) return Promise.resolve();

        // 唯讀模式也應該可以變髒，以便提示使用者更動了需另存新檔
        // if (this.isReadOnly && dirty === true) return; 

        this.isDirty = dirty; 
        if (window.CocoyaUI) window.CocoyaUI.setDirty(dirty); 
        if (window.CocoyaBridge && typeof window.CocoyaBridge.send === 'function') {
            return window.CocoyaBridge.send('setDirty', { isDirty: dirty });
        }
        return Promise.resolve();
    },

    /**
     * 觸發自動備份 (Debounced)
     */
    triggerAutoBackup: function() {
        if (this.isReadOnly) return; // 唯讀模式不執行備份
        
        if (this.autoBackupTimer) clearTimeout(this.autoBackupTimer);
        this.autoBackupTimer = setTimeout(() => {
            if (!this.workspace) return;
            try {
                const dom = Blockly.Xml.workspaceToDom(this.workspace);
                dom.setAttribute('platform', this.currentPlatform);
                const xml = Blockly.Xml.domToPrettyText(dom);
                window.CocoyaBridge.send('autoBackup', { xml: xml });
            } catch (e) { }
        }, 2000);
    },

    /**
     * 檢查並恢復自動備份
     */
    checkAutoBackup: async function(backupXml) {
        if (!backupXml || backupXml.trim().length === 0) return;
        
        setTimeout(() => {
            const msg = Blockly.Msg['MSG_RECOVER_BACKUP'] || '偵測到上次未儲存的變更，是否要恢復？';
            Blockly.dialog.confirm(msg, (ok) => {
                if (ok) {
                    Blockly.Events.disable();
                    try {
                        this.workspace.clear();
                        const dom = Blockly.utils.xml.textToDom(backupXml);
                        Blockly.Xml.domToWorkspace(dom, this.workspace);
                        const platform = dom.getAttribute('platform');
                        if (platform) this.setPlatformUI(platform);
                        this.triggerCodeUpdate();
                        this.setDirty(true);
                        
                        if (this.minimap) {
                            this.minimap._isPaused = false;
                            this.refreshMinimap();
                        }
                        window.CocoyaBridge.send('clearBackup');
                    } catch (e) {
                        console.error('[App] Recovery failed:', e);
                    } finally {
                        Blockly.Events.enable();
                    }
                } else {
                    window.CocoyaBridge.send('rejectRecovery');
                }
            });
        }, 800);
    },

    /**
     * 載入工作區 XML 內容
     */
    loadWorkspace: async function(xml, filename, platform, isReadOnly = false) {
        if (this.minimap) this.minimap._isPaused = true;
        if (platform && platform !== this.currentPlatform) await this.setPlatformUI(platform);
        
        // 設定唯讀狀態
        this.isReadOnly = !!isReadOnly;
        
        if (window.CocoyaUI && window.CocoyaUI.setSaveButtonState) {
            const hint = this.isReadOnly ? (Blockly.Msg['MSG_READ_ONLY_HINT'] || '此檔案已被其他視窗開啟，目前為唯讀模式。') : '';
            window.CocoyaUI.setSaveButtonState(!this.isReadOnly, hint);
        }

        if (this.isReadOnly) {
            window.CocoyaBridge.alert(Blockly.Msg['MSG_READ_ONLY_ALERT'] || '此檔案已被其他視窗開啟，將以唯讀模式載入。您可以使用「另存新檔」來編輯。');
        }
        
        Blockly.Events.disable();
        try { 
            this.workspace.clear(); 
            Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(xml), this.workspace); 
        } finally { 
            Blockly.Events.enable(); 
        }
        
        if (window.CocoyaUI) window.CocoyaUI.updateFileStatus(filename); 
        await this.setDirty(false); 
        this.triggerCodeUpdate();
        setTimeout(() => { if (this.minimap) { this.minimap._isPaused = false; this.refreshMinimap(); } }, 300);
        this.hideStartupHome(); // 開啟專案成功 → 已錨定
    },

    /**
     * 重置工作區為預設狀態
     */
    resetWorkspace: function() { 
        if (this.workspace) {
            this.isReadOnly = false; // 重置時恢復為可寫
            
            if (window.CocoyaUI && window.CocoyaUI.setSaveButtonState) {
                window.CocoyaUI.setSaveButtonState(true, '');
            }

            Blockly.Events.disable();
            try {
                this.workspace.clear(); 
                this.createDefaultBlocks(); 
            } finally {
                Blockly.Events.enable();
            }
            if (window.CocoyaUI) window.CocoyaUI.updateFileStatus(''); 
            this.setDirty(false); 
            this.triggerCodeUpdate(); 
        }
        // X 錨定：開新檔案（newFile）使 currentFilePath 歸零 = 未錨定 → 回到啟動首頁重新錨定。
        // 已錨定專案切平台（switchPlatform）時 isAnchored 仍為 true，不會誤跳首頁。
        this.showStartupHomeIfNeeded();
    },

    /**
     * 儲存完成後的回調
     */
    onSaveCompleted: async function(filename) { 
        if (filename) {
            // 存檔成功，不論之前是否為唯讀，現在我就是這個新檔的擁有者了
            this.isReadOnly = false;
            
            if (window.CocoyaUI && window.CocoyaUI.setSaveButtonState) {
                window.CocoyaUI.setSaveButtonState(true, '');
            }

            if (window.CocoyaUI) window.CocoyaUI.updateFileStatus(filename); 
            await this.setDirty(false); 
            if (window.CocoyaUI) window.CocoyaUI.flashButton('btn-save', '#e3f2fd'); 
            if (window.CocoyaBridge) {
                window.CocoyaBridge.send('clearBackup');
            }
        }
        this.hideStartupHome();
    },

    // --- 啟動首頁 (Startup Home)：未錨定時強制選「開新/開啟」以確立專案根 ---

    /**
     * 顯示啟動首頁（兩平台共用）。錨定後由 loadWorkspace/onSaveCompleted 隱藏。
     */
    showStartupHomeIfNeeded: function() {
        const home = document.getElementById('startup-home');
        if (!home) return;
        const anchored = !!(window.CocoyaBridge && window.CocoyaBridge.capabilities && window.CocoyaBridge.capabilities.isAnchored);
        const title = home.querySelector('#startup-home-title');
        const hint = home.querySelector('#startup-home-hint');
        const newBtn = home.querySelector('#startup-new');
        const openBtn = home.querySelector('#startup-open');
        if (title) title.textContent = 'Cocoya';
        if (hint) hint.textContent = (Blockly.Msg['BKY_STARTUP_HINT'] || '請先選擇「開新專案」或「開啟專案」以確立專案位置。');
        if (newBtn) newBtn.textContent = (Blockly.Msg['BKY_STARTUP_NEW'] || '開新專案');
        if (openBtn) openBtn.textContent = (Blockly.Msg['BKY_STARTUP_OPEN'] || '開啟專案');
        this._bindStartupHome();
        if (!anchored) home.style.display = 'flex';
    },

    /**
     * 隱藏啟動首頁（錨定完成：開啟專案 or 另存新檔）
     */
    hideStartupHome: function() {
        const home = document.getElementById('startup-home');
        if (home) home.style.display = 'none';
    },

    /**
     * 綁定啟動首頁按鈕（僅一次；DOM 未就緒時延遲重試）
     */
    _bindStartupHome: function() {
        if (this._startupBound) return;
        const newBtn = document.getElementById('startup-new');
        const openBtn = document.getElementById('startup-open');
        if (!newBtn || !openBtn) {
            // DOM 尚未就緒（理論上 index.html 靜態存在），延遲重試
            setTimeout(() => this._bindStartupHome(), 300);
            return;
        }
        this._startupBound = true;
        console.log('[StartupHome] Buttons bound:', !!newBtn, !!openBtn);
        newBtn.onclick = () => this.startNewProjectFromHome();
        openBtn.onclick = () => this.startOpenProjectFromHome();
    },

    /**
     * 啟動首頁「開新專案」：先「另存新檔」取得 .xml 路徑以錨定專案根
     */
    startNewProjectFromHome: function() {
        console.log('[StartupHome] New project from home');
        let xml = '';
        try {
            if (this.workspace) {
                const dom = Blockly.Xml.workspaceToDom(this.workspace);
                xml = Blockly.Xml.domToPrettyText(dom);
            }
        } catch (e) { xml = ''; }
        if (window.CocoyaBridge) window.CocoyaBridge.send('saveFileAs', { xml });
    },

    /**
     * 啟動首頁「開啟專案」
     */
    startOpenProjectFromHome: function() {
        console.log('[StartupHome] Open project from home');
        if (window.CocoyaBridge) window.CocoyaBridge.send('openFile', {});
    }
});
