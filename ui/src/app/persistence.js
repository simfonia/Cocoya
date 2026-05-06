/**
 * Cocoya App 持久化模組
 * 負責 XML 載入/儲存、自動備份、恢復與髒狀態管理
 */
window.CocoyaApp = Object.assign(window.CocoyaApp || {}, {
    isDirty: false,
    autoBackupTimer: null,

    /**
     * 設定髒狀態並通知後端
     */
    setDirty: function(dirty) { 
        if (this.isInitializing && dirty === true) return;
        if (this.isDirty === dirty) return;

        this.isDirty = dirty; 
        if (window.CocoyaUI) window.CocoyaUI.setDirty(dirty); 
        window.CocoyaBridge.send('setDirty', { isDirty: dirty }); 
    },

    /**
     * 觸發自動備份 (Debounced)
     */
    triggerAutoBackup: function() {
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
    loadWorkspace: async function(xml, filename, platform) {
        if (this.minimap) this.minimap._isPaused = true;
        if (platform && platform !== this.currentPlatform) await this.setPlatformUI(platform);
        
        Blockly.Events.disable();
        try { 
            this.workspace.clear(); 
            Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(xml), this.workspace); 
        } finally { 
            Blockly.Events.enable(); 
        }
        
        if (window.CocoyaUI) window.CocoyaUI.updateFileStatus(filename); 
        this.setDirty(false); 
        this.triggerCodeUpdate();
        setTimeout(() => { if (this.minimap) { this.minimap._isPaused = false; this.refreshMinimap(); } }, 300);
    },

    /**
     * 重置工作區為預設狀態
     */
    resetWorkspace: function() { 
        if (this.workspace) {
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
    },

    /**
     * 儲存完成後的回調
     */
    onSaveCompleted: function(filename) { 
        if (filename) {
            if (window.CocoyaUI) window.CocoyaUI.updateFileStatus(filename); 
            this.setDirty(false); 
            if (window.CocoyaUI) window.CocoyaUI.flashButton('btn-save', '#e3f2fd'); 
            window.CocoyaBridge.send('clearBackup');
        }
    }
});
