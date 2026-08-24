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
        // 「開新專案」語意：直接以目前平台重建初始積木，不再回到啟動首頁
        // （首頁僅在 app 初始未錨定時由 controller 顯示一次）
        this.hideStartupHome();
    },

    /**
     * 儲存完成後的回調
     */
    onSaveCompleted: async function(filename, tag) {
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

        // 開新專案流程：另存已成功錨定 → 此時才套用目標平台初始積木（先確認、後破壞）
        if (tag === 'newProject' && this._pendingNewProjectPlatform) {
            const target = this._pendingNewProjectPlatform;
            this._pendingNewProjectPlatform = null;
            if (target !== this.currentPlatform) await this.setPlatformUI(target);
            this._applyInitialBlocks();
        }

        this.hideStartupHome();
    },

    /**
     * 套用目前平台的初始積木（開新專案錨定成功後呼叫）
     * 與 resetWorkspace 不同：不清檔名、不觸發首頁邏輯，保留剛錨定的檔名狀態
     */
    _applyInitialBlocks: function() {
        if (!this.workspace) return;
        this.isReadOnly = false;
        Blockly.Events.disable();
        try {
            this.workspace.clear();
            this.createDefaultBlocks();
        } finally {
            Blockly.Events.enable();
        }
        this.setDirty(false);
        this.triggerCodeUpdate();
        setTimeout(() => { if (this.minimap) { this.minimap._isPaused = false; this.refreshMinimap(); } }, 300);
    },

    // --- 啟動首頁 (Startup Home)：未錨定時強制選「開新/開啟」以確立專案根 ---

    /**
     * 顯示啟動首頁（兩平台共用）。錨定後由 loadWorkspace/onSaveCompleted 隱藏。
     */
    showStartupHomeIfNeeded: function() {
        const home = document.getElementById('startup-home');
        if (!home) return;
        const anchored = !!(window.CocoyaBridge && window.CocoyaBridge.capabilities && window.CocoyaBridge.capabilities.isAnchored);
        const newBtn = home.querySelector('#startup-new');
        const openBtn = home.querySelector('#startup-open');
        const examplesBtn = home.querySelector('#startup-examples');
        const summary = home.querySelector('#startup-settings-panel summary');
        const setPythonBtn = home.querySelector('#startup-set-python-path');
        const diagnoseBtn = home.querySelector('#startup-diagnose');
        const langSelect = home.querySelector('#startup-lang');
        const themeSelect = home.querySelector('#startup-theme');
        const newOptions = home.querySelectorAll('.startup-new-option');
        if (newBtn) newBtn.textContent = (Blockly.Msg['BKY_STARTUP_NEW'] || '開新專案');
        if (openBtn) openBtn.textContent = (Blockly.Msg['BKY_STARTUP_OPEN'] || '開啟專案');
        if (examplesBtn) examplesBtn.textContent = (Blockly.Msg['BKY_STARTUP_EXAMPLES'] || '開啟範例');
        if (summary) summary.textContent = (Blockly.Msg['BKY_STARTUP_SETTINGS'] || '⚙ 快速設定');
        if (setPythonBtn) setPythonBtn.textContent = (Blockly.Msg['BKY_STARTUP_PYTHON_PATH'] || '設定 Python 路徑');
        if (diagnoseBtn) diagnoseBtn.textContent = (Blockly.Msg['BKY_STARTUP_DIAGNOSE'] || '檢查 Python 套件');
        for (const opt of newOptions) {
            const platform = opt.getAttribute('data-platform');
            if (platform === 'PC') opt.textContent = (Blockly.Msg['TLB_MODE_PC'] || '💻 Python (PC)');
            else if (platform === 'MicroPython') opt.textContent = (Blockly.Msg['TLB_MODE_MCU'] || '📟 MicroPython (MCU)');
        }
        // 語系 / 主題偏好：反映目前設定值 + 顯式填充文案（不依賴全域 applyI18n 掃描）
        const langLabel = home.querySelector('#startup-lang-label');
        const themeLabel = home.querySelector('#startup-theme-label');
        if (langLabel) langLabel.textContent = (Blockly.Msg['BKY_STARTUP_LANG'] || 'Language');
        if (themeLabel) themeLabel.textContent = (Blockly.Msg['BKY_STARTUP_THEME'] || 'Theme');
        // 主題下拉選單：由 ThemeManager registry 動態生成（auto 固定第一個）
        if (themeSelect && window.CocoyaTheme) {
            const savedMode = window.CocoyaTheme.getMode();
            themeSelect.innerHTML = '';
            const autoOpt = document.createElement('option');
            autoOpt.value = 'auto';
            autoOpt.textContent = (Blockly.Msg['BKY_THEME_AUTO'] || 'Auto (System)');
            themeSelect.appendChild(autoOpt);
            for (const t of window.CocoyaTheme.getThemes()) {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = (t.labelKey && Blockly.Msg[t.labelKey]) || t.labelFallback || t.id;
                themeSelect.appendChild(opt);
            }
            themeSelect.value = savedMode;
            if (themeSelect.selectedIndex < 0) themeSelect.value = 'auto';
        }
        if (langSelect) {
            let savedLang = '';
            try { savedLang = localStorage.getItem('cocoya_lang') || ''; } catch (e) { }
            langSelect.value = savedLang || this.currentLang || 'zh-hant';
        }
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
        // 「開新專案」為 hover 選單：點選平台選項即依該平台開新專案
        // 僅限 Startup Home 範圍，避免抓到 toolbar 的 #toolbar-new-menu 選項
        const newOptions = document.querySelectorAll('#startup-home .startup-new-option');
        for (const opt of newOptions) {
            // hover 高亮交由 .startup-new-option:hover CSS（支援深色變體）
            opt.onclick = () => this.startNewProjectFromHome(opt.getAttribute('data-platform'));
        }
        openBtn.onclick = () => this.startOpenProjectFromHome();
        const examplesBtn = document.getElementById('startup-examples');
        if (examplesBtn) examplesBtn.onclick = () => window.CocoyaBridge.send('openExamples', { includeXml: true });
        const setPythonBtn = document.getElementById('startup-set-python-path');
        if (setPythonBtn) setPythonBtn.onclick = () => window.CocoyaBridge.send('setPythonPath');
        const diagnoseBtn = document.getElementById('startup-diagnose');
        if (diagnoseBtn) diagnoseBtn.onclick = () => {
            if (window.CocoyaUI && window.CocoyaUI.showDiagnoseModal) window.CocoyaUI.showDiagnoseModal();
            window.CocoyaBridge.send('checkEnvironment');
        };
        // 語系切換：存偏好 → 重載 webview（VSIX 需由 host 重建 HTML，避免白屏）
        const langSelect = document.getElementById('startup-lang');
        if (langSelect) {
            langSelect.onchange = () => {
                try { localStorage.setItem('cocoya_lang', langSelect.value); } catch (e) { }
                if (window.CocoyaBridge && typeof window.CocoyaBridge.send === 'function') {
                    window.CocoyaBridge.send('reloadWebview');
                } else {
                    location.reload();
                }
            };
        }
        // 主題切換：交由 ThemeManager 存偏好 → 即時套用（不需重載）
        const themeSelect = document.getElementById('startup-theme');
        if (themeSelect) {
            themeSelect.onchange = () => {
                if (window.CocoyaTheme) window.CocoyaTheme.setMode(themeSelect.value);
            };
        }
    },

    /**
     * 「開新專案」（Startup Home 選平台 / toolbar 新增選單共用，雙平台統一）：
     * 1. 檢查 dirty（有未存變更時提示 儲存/不儲存/取消；已錨定故「儲存」=靜默寫回原檔）
     * 2. 送出「另存新檔」對話框（XML 的 platform 屬性直接標目標平台）
     * 3. ★ 先確認、後破壞：存檔成功（saveCompleted + tag='newProject'）之前，
     *    不清工作區、不改檔名、不隱藏首頁 —— 取消對話框時原狀態完整保留
     * @param {string} [selectedPlatform] 選單選擇的平台 (PC / MicroPython)
     */
    startNewProjectFromHome: async function(selectedPlatform) {
        console.log('[StartupHome] New project', selectedPlatform);
        const nextPlatform = (selectedPlatform || this.currentPlatform).trim();

        // 檢查 dirty：取消則中止，不進入開新流程
        if (!(await this._confirmSaveBeforeNew())) return;

        // 記錄目標平台，待另存成功後（onSaveCompleted 收到 tag='newProject'）才套用初始積木
        this._pendingNewProjectPlatform = nextPlatform;
        // ★ 另存寫入的是「目標平台的乾淨初始專案」，絕不帶入目前工作區（原專案）的內容
        if (!window.CocoyaBridge) return;
        window.CocoyaBridge.send('saveFileAs', {
            xml: this._getInitialProjectXml(nextPlatform),
            tag: 'newProject'
        });
    },

    /**
     * 序列化目前工作區 XML 並注入目前平台屬性（用於 dirty 存回原檔）
     */
    _getCurrentXmlWithPlatform: function() {
        try {
            if (!this.workspace) return '';
            const dom = Blockly.Xml.workspaceToDom(this.workspace);
            dom.setAttribute('platform', this.currentPlatform);
            return Blockly.Xml.domToPrettyText(dom);
        } catch (e) { return ''; }
    },

    /**
     * 產生目標平台的新專案初始 XML（靜態模板，結構對應 createDefaultBlocks）：
     * - PC：py_definition_zone + py_main
     * - MicroPython：py_definition_zone + mcu_main(DO) > py_loop_while(CONDITION) > py_logic_boolean(True)
     * @param {string} platform PC / MicroPython
     */
    _getInitialProjectXml: function(platform) {
        const header = '<xml xmlns="https://developers.google.com/blockly/xml" platform="' + platform + '">';
        let body;
        if (platform === 'MicroPython') {
            body =
                '  <block type="py_definition_zone" x="100" y="20"></block>\n' +
                '  <block type="mcu_main" x="100" y="200">\n' +
                '    <statement name="DO">\n' +
                '      <block type="py_loop_while">\n' +
                '        <value name="CONDITION">\n' +
                '          <block type="py_logic_boolean">\n' +
                '            <field name="BOOL">True</field>\n' +
                '          </block>\n' +
                '        </value>\n' +
                '      </block>\n' +
                '    </statement>\n' +
                '  </block>';
        } else {
            body =
                '  <block type="py_definition_zone" x="100" y="20"></block>\n' +
                '  <block type="py_main" x="100" y="140"></block>';
        }
        return header + '\n' + body + '\n</xml>';
    },

    /**
     * 開新專案前的 dirty 檢查：回傳 false 表示使用者取消，應中止開新
     */
    _confirmSaveBeforeNew: async function() {
        if (!this.isDirty) return true;
        const msg = (window.Blockly && Blockly.Msg['MSG_SAVE_CONFIRM']) || 'Do you want to save changes to the current project?';
        let choice = 'cancel';
        if (window.CocoyaUI && window.CocoyaUI.showSaveConfirm) {
            choice = await window.CocoyaUI.showSaveConfirm(msg);
        }
        if (choice === 'cancel') return false;
        if (choice === 'save') {
            // 已錨定存回原檔（靜默寫回）；VSIX send 無回傳值，以 undefined 容錯
            const saved = await window.CocoyaBridge.send('saveFile', { xml: this._getCurrentXmlWithPlatform() });
            return saved !== false;
        }
        return true; // discard
    },

    /**
     * 啟動首頁「開啟專案」
     */
    startOpenProjectFromHome: function() {
        console.log('[StartupHome] Open project from home');
        if (window.CocoyaBridge) window.CocoyaBridge.send('openFile', {});
    }
});
