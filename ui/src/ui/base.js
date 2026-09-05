/**
 * Cocoya UI 基礎模組
 * 負責核心 UI 狀態 (檔名、髒狀態)、i18n 套用、更新提示與工具列事件初始化
 */
window.CocoyaUI = Object.assign(window.CocoyaUI || {}, {
    /** @type {string} 目前編輯的檔案名稱 */
    currentFilename: '',

    /** @type {boolean} 是否處於未儲存狀態 */
    isDirty: false,

    /**
     * 設定髒狀態 (Dirty State) UI 反饋
     * @param {boolean} isDirty 是否已修改
     */
    setDirty: function(isDirty) {
        this.isDirty = isDirty;
        const saveBtn = document.getElementById('btn-save');
        if (saveBtn) {
            saveBtn.style.borderBottom = isDirty ? '2px solid #FE2F89' : 'none';
        }
        this.updateFileStatus(this.currentFilename);
    },

    /**
     * 更新目前的檔案狀態顯示
     * @param {string} filename 
     */
    updateFileStatus: function(filename) {
        if (filename !== undefined) this.currentFilename = filename;
        
        const fileLabel = document.getElementById('current-filename');
        const defaultName = window.Blockly ? (Blockly.Msg['TLB_FILE_NEW'] || '未命名專案') : 'Untitled';
        let displayName = this.currentFilename || defaultName;

        // 如果是髒狀態，檔名加上 *
        if (this.isDirty && !displayName.endsWith('*')) {
            displayName += ' *';
        }

        if (fileLabel) {
            fileLabel.textContent = displayName;
            // Hover 顯示完整路徑（專案根 + 檔名）；未錨定或未命名時 fallback 為顯示名稱
            // 分隔符統一正斜線（projectRoot 可能為反斜線，避免混合）
            const caps = window.CocoyaBridge ? window.CocoyaBridge.capabilities : null;
            const root = (caps && caps.projectRoot) ? String(caps.projectRoot).replace(/\\/g, '/').replace(/\/+$/, '') : null;
            const hasFile = !!this.currentFilename;
            fileLabel.title = (hasFile && root)
                ? (root + '/' + this.currentFilename)
                : displayName;

            // capabilities 快照可能過期（開檔/存檔後），以後端權威錨定非同步校正
            if (hasFile && window.CocoyaBridge && window.CocoyaBridge.getProjectAnchor) {
                window.CocoyaBridge.getProjectAnchor().then((anchor) => {
                    if (anchor && anchor.projectRoot && this.currentFilename) {
                        fileLabel.title = String(anchor.projectRoot).replace(/\\/g, '/').replace(/\/+$/, '') + '/' + this.currentFilename;
                    }
                }).catch(() => {});
            }
        }
        
        // 同步更新 Tauri 視窗標題
        window.CocoyaBridge.send('setWindowTitle', { title: displayName });
    },

    /**
     * 設定儲存按鈕啟用狀態 (由 Persistence 呼叫)
     */
    setSaveButtonState: function(enabled, hint = '') {
        const saveBtn = document.getElementById('btn-save');
        if (saveBtn) {
            saveBtn.disabled = !enabled;
            saveBtn.style.opacity = enabled ? '1' : '0.5';
            saveBtn.setAttribute('title', hint);
        }
    },

    /**
     * 處理 HTML 中的 i18n 佔位符 (%{BKY_...})
     * 會掃描所有的 title 屬性、span 內容以及 option 內容
     */
    applyI18n: function() {
        if (typeof Blockly === 'undefined') return;
        
        // 1. 處理 Tooltip (title) - 獨立處理，不影響內容
        const titleElements = document.querySelectorAll('[title^="%{BKY_"]');
        titleElements.forEach(el => {
            const title = el.getAttribute('title');
            if (title && title.startsWith('%{BKY_')) {
                const key = title.substring(6, title.length - 1);
                if (Blockly.Msg[key]) el.setAttribute('title', Blockly.Msg[key]);
            }
        });

        // 2. 處理文字內容 (textContent) - 僅限葉子節點標籤，避免誤刪容器內的 img
        const textElements = document.querySelectorAll('span, p, button, option');
        textElements.forEach(el => {
            const text = el.textContent.trim();
            if (text && text.startsWith('%{BKY_')) {
                const key = text.substring(6, text.length - 1);
                if (Blockly.Msg[key]) el.textContent = Blockly.Msg[key];
            }
        });
    },

    /**
     * 設定更新狀態 UI (對齊 #wavecode)
     * @param {Object} data 更新資訊
     * @param {boolean} data.hasUpdate 是否有新版本
     * @param {string} data.currentVersion 目前版本
     * @param {string} data.latestVersion 最新版本
     * @param {string} data.url 下載網址
     */
    setUpdateStatus: function(data) {
        const btn = document.getElementById('btn-update');
        const img = btn?.querySelector('img');
        if (!btn || !img || typeof Blockly === 'undefined') return;

        this.updateUrl = data.url;
        const base = window.CocoyaMediaUri || '/src';
        
        // 清除舊狀態 (包含圖片旋轉動畫)
        btn.classList.remove('update-hidden', 'update-blink', 'update-spin-ccw', 'update-bounce-pulse', 'update-available', 'update-latest', 'bounce-gradient');
        img.classList.remove('spin-animation');
        
        if (data.hasUpdate) {
            // --- 發現新版本 ---
            btn.classList.add('update-available', 'bounce-gradient');
            img.src = `${base}/icons/cloud_download_24dp_FE2F89.png`;
            
            let label = (Blockly.Msg['MSG_UPDATE_AVAILABLE'] || '發現新版本');
            if (label.includes('%1')) {
                label = label.replace('%1', `v${data.latestVersion}`);
            } else {
                label = `${label}: v${data.latestVersion}`;
            }
            btn.setAttribute('title', `${label} (目前版本: v${data.currentVersion})`);
        } else {
            // --- 目前已是最新 ---
            btn.classList.add('update-latest');
            img.src = `${base}/icons/published_with_changes_24dp_75FB4C.png`;
            
            let label = (Blockly.Msg['MSG_UPDATE_LATEST'] || '已是最新版');
            if (label.includes('%1')) {
                label = label.replace('%1', `v${data.currentVersion}`);
            } else {
                label = `${label}: v${data.currentVersion}`;
            }
            btn.setAttribute('title', label);
        }
    },

    /**
     * 初始化工具列事件綁定
     * @param {Function} postMessageFunc Webview 通訊函式
     */
    initToolbar: function(postMessageFunc) {
        const self = this;
        
        // --- 初始化子模組 ---
        if (this.initTerminal) this.initTerminal();

        // --- 初始化佈局 (縮放與收合) ---
        if (this.initLayout) this.initLayout();
        
        const stopBtn = document.getElementById('btn-stop');
        const closeBtn = document.getElementById('btn-close');
        const terminalToggleBtn = document.getElementById('btn-terminal');

        if (window.CocoyaBridge) {
            const caps = window.CocoyaBridge.capabilities;
            
            // 根據能力清單設定按鈕顯示
            if (stopBtn) stopBtn.style.display = 'flex'; // 停止鈕兩者皆有
            if (closeBtn) closeBtn.style.display = caps.canClose ? 'flex' : 'none';
            if (terminalToggleBtn) terminalToggleBtn.style.display = caps.hasTerminal ? 'flex' : 'none';
            
            // AI 下拉選單：VSIX 與 Tauri 皆顯示
            const aiDropdown = document.getElementById('ai-dropdown');
            const aiDropdownSeparator = document.getElementById('ai-dropdown-separator');
            if (aiDropdown && caps.isRemoteAware) {
                aiDropdown.style.display = 'inline-block';
                if (aiDropdownSeparator) aiDropdownSeparator.style.display = 'block';
            }
            // 雲端 AI 全域開關已移除（見 log/plan/RemoteTrainingRefactor.md D1）
        }

        // 雲端訓練全域開關已移除（見 log/plan/RemoteTrainingRefactor.md D1）；遠端交由 py_ai_train_run backend=remote 於執行當下觸發 SSH 精靈。

        /**
         * 綁定按鈕點擊事件的內部輔助函式
         */
        const bind = (id, cmd, options = {}) => {
            const el = document.getElementById(id);
            if (!el) return;
            
            el.onclick = () => {
                // 1. 處理外部連結 (更新按鈕)
                if (id === 'btn-update') {
                    if (self.updateUrl && el.classList.contains('update-available')) {
                        postMessageFunc({ command: 'openExternal', url: self.updateUrl });
                        return;
                    }
                    // 立即更新 Tooltip 並啟動旋轉動畫 (對齊 #wavecode)
                    const checkMsg = (typeof Blockly !== 'undefined' && Blockly.Msg['MSG_CHECKING_UPDATE']) || 'Checking for updates...';
                    el.setAttribute('title', checkMsg);
                    const img = el.querySelector('img');
                    if (img) img.classList.add('spin-animation');
                }

                // 2. 準備訊息酬載
                const msg = { 
                    command: cmd,
                    isDirty: self.isDirty 
                };

                // 3. 若需要 XML (檔案操作)
                if (options.includeXml && typeof Blockly !== 'undefined') {
                    const dom = Blockly.Xml.workspaceToDom(Blockly.getMainWorkspace());
                    // 注入 platform屬性標記 (PC 或 MicroPython)
                    const platform = window.CocoyaApp?.currentPlatform;
                    dom.setAttribute('platform', platform);
                    
                    msg.xml = Blockly.Xml.domToPrettyText(dom);
                }

                // 4. 若需要程式碼 (執行程式)
                if (cmd === 'runCode' && typeof Blockly !== 'undefined') {
                    // --- 自動恢復自動捲動 (對齊使用者需求) ---
                    if (!self.isTerminalAutoScroll) {
                        self.isTerminalAutoScroll = true;
                        const terminalPauseBtn = document.getElementById('btn-pause-terminal');
                        if (terminalPauseBtn) terminalPauseBtn.classList.add('paused');
                    }
                    
                    // [修正] 強制關閉輸入框並執行強制 UI 更新
                    if (Blockly.getMainWorkspace()) Blockly.hideChaff();
                    
                    let code = window.CocoyaApp.lastCleanCode;
                    if (typeof window.CocoyaApp.triggerCodeUpdateSync === 'function') {
                        // 傳入 true 以無視 focus 保護強制渲染預覽
                        code = window.CocoyaApp.triggerCodeUpdateSync(true);
                    }
                    
                    // 強制刷新 Minimap 確保縮圖一致
                    if (window.CocoyaApp.refreshMinimap) window.CocoyaApp.refreshMinimap();

                    msg.code = code;
                    msg.platform = window.CocoyaApp?.currentPlatform;
                    msg.serialPort = window.CocoyaUI && window.CocoyaUI.getSerialPort ? window.CocoyaUI.getSerialPort() : (document.getElementById('serial-selector')?.getAttribute('data-value') || '') || '';
                    msg.serialUploadOnly = localStorage.getItem('cocoya_serial_upload_only') === 'true';
                    if (self.flashButton) self.flashButton(id, '#e8f5e9'); // 綠色回饋

                    // --- 遠端訓練攔截（RemoteTrainingRefactor D3/D4）：backend='remote' 時改走 SSH 精靈 + host 遠端鏈 ---
                    const isRemoteTrain = /backend\s*=\s*'remote'/.test(code);
                    if (isRemoteTrain && msg.platform !== 'MicroPython') {
                        const syncMatch = code.match(/sync_mode\s*=\s*'(\w+)'/);
                        const dsMatch = code.match(/dataset_dir\s*=\s*'([^']+)'/);
                        const syncMode = syncMatch ? syncMatch[1] : 'smart';
                        const datasetDir = dsMatch ? dsMatch[1] : '';
                        (async () => {
                            if (!self.ensureSshConfig) {
                                postMessageFunc({ command: 'alert', message: 'SSH wizard unavailable' });
                                return;
                            }
                            const sshConfig = await new Promise((resolve) => {
                                self.ensureSshConfig(resolve, () => resolve(null));
                            });
                            if (!sshConfig) {
                                if (window.CocoyaUI?.appendTerminal) {
                                    window.CocoyaUI.appendTerminal('--- Remote training cancelled (no SSH config) ---', 'info');
                                }
                                return;
                            }
                            if (window.CocoyaUI?.appendTerminal) {
                                window.CocoyaUI.appendTerminal(`--- Remote training: sync=${syncMode}, dataset=${datasetDir} ---`, 'info');
                            }
                            // 連線動態提示（D4 UX）：每 0.7s 補一個 '.'，收到第一筆訓練事件即停止
                            if (self._remoteConnTimer) { clearInterval(self._remoteConnTimer); self._remoteConnTimer = null; }
                            if (window.CocoyaUI?.appendTerminal) {
                                window.CocoyaUI.appendTerminal('[Remote] 連線中 ', 'info');
                                self._remoteConnTimer = setInterval(() => {
                                    window.CocoyaUI.appendTerminal('.', 'info', true);
                                }, 700);
                            }
                            postMessageFunc({
                                command: 'startRemoteTraining',
                                code: code,
                                syncMode: syncMode,
                                datasetDir: datasetDir,
                                sshConfig: sshConfig,
                                isDirty: self.isDirty
                            });
                        })();
                        return; // 不走本地 runCode
                    }
                }

                postMessageFunc(msg);
            };
        };

        const codeCloseBtn = document.getElementById('btn-close-code');
        if (codeCloseBtn) {
            codeCloseBtn.onclick = () => self.toggleCodeArea(false);
        }

        // 綁定範例按鈕：觸發後端 Quick Pick 並載入範例
        bind('btn-examples', 'openExamples', { includeXml: true });

        // 綁定檔案操作
        bind('btn-open', 'openFile', { includeXml: true });
        bind('btn-save', 'saveFile', { includeXml: true });
        bind('btn-save-as', 'saveFileAs', { includeXml: true });
        bind('btn-close', 'closeEditor', { includeXml: true }); // VSIX 模式關閉編輯器

        // === 開新檔案：平台 hover 選單 (雙平台共用) ===
        // 點選平台 → startNewProjectFromHome(platform)：檢查 dirty 後另存錨定，
        // 於本視窗重建該平台初始積木（不回首頁、不開新視窗）。
        const toolbarNewWrap = document.getElementById('toolbar-new-wrap');
        const toolbarNewMenu = document.getElementById('toolbar-new-menu');
        if (toolbarNewWrap && toolbarNewMenu) {
            const pcBtn = toolbarNewMenu.querySelector('.startup-new-option[data-platform="PC"]');
            const mcuBtn = toolbarNewMenu.querySelector('.startup-new-option[data-platform="MicroPython"]');
            if (pcBtn) pcBtn.textContent = (Blockly.Msg['TLB_MODE_PC'] || '💻 Python (PC)');
            if (mcuBtn) mcuBtn.textContent = (Blockly.Msg['TLB_MODE_MCU'] || '📟 MicroPython (MCU)');

            // tooltip 依平台語意
            const newBtn = document.getElementById('btn-new');
            const isTauri = !!(window.CocoyaBridge && window.CocoyaBridge.capabilities && window.CocoyaBridge.capabilities.isTauri);
            if (newBtn) {
                const tip = isTauri
                    ? (Blockly.Msg['TLB_NEW_TAURI'] || '在本視窗開新專案')
                    : (Blockly.Msg['TLB_NEW_VSIX'] || '開新專案');
                newBtn.setAttribute('title', tip);
            }
            // 「開新視窗」按鈕：僅 Tauri 顯示（多視窗能力），與本視窗檔案狀態無關
            const newWindowBtn = document.getElementById('btn-new-window');
            if (newWindowBtn && isTauri) {
                newWindowBtn.style.display = '';
                newWindowBtn.onclick = () => window.CocoyaBridge.send('createWindow', {});
            }
            const handleOption = (platform) => {
                if (window.CocoyaApp && window.CocoyaApp.startNewProjectFromHome) {
                    window.CocoyaApp.startNewProjectFromHome(platform);
                }
            };
            for (const opt of [pcBtn, mcuBtn]) {
                if (!opt) continue;
                opt.onmouseover = () => { opt.style.background = '#e9e9e9'; };
                opt.onmouseout = () => { opt.style.background = '#fff'; };
                opt.onclick = () => handleOption(opt.getAttribute('data-platform'));
            }
        }
        
        // 綁定設定與功能按鈕
        bind('btn-set-python-path', 'setPythonPath');
        
        // 綁定捲軸優化插件切換
        const scrollOptionsBtn = document.getElementById('btn-toggle-scroll-options');
        const scrollCheck = document.getElementById('scroll-options-check');
        if (scrollOptionsBtn && scrollCheck) {
            const updateCheckUI = () => {
                const isEnabled = localStorage.getItem('cocoya_use_scroll_plugin') === 'true'; // 預設關閉
                scrollCheck.textContent = isEnabled ? '✔' : '';
            };
            updateCheckUI();
            
            scrollOptionsBtn.onclick = async () => {
                const current = localStorage.getItem('cocoya_use_scroll_plugin') === 'true';
                const nextValue = !current;
                localStorage.setItem('cocoya_use_scroll_plugin', nextValue);
                updateCheckUI();
                
                // 僅提示，不自動重啟以保護進度
                window.CocoyaBridge.alert(
                    Blockly.Msg['MSG_RELOAD_TO_APPLY'] || 'Settings saved. Please restart the application to apply changes.'
                );
            };
        }

        // --- 語系開關：[中文 ⇄ English] 膠囊雙選項（沿用首頁 cocoya_lang 偏好 + reloadWebview 機制） ---
        const langToggleBtn = document.getElementById('btn-toggle-language');
        if (langToggleBtn) {
            // tooltip 顯式填充（不依賴全域 applyI18n 掃描）
            const langTip = Blockly.Msg['BKY_STARTUP_LANG'] || 'Language';
            langToggleBtn.setAttribute('title', langTip);
            const currentLang = (() => {
                try { return localStorage.getItem('cocoya_lang') || 'zh-hant'; } catch (e) { return 'zh-hant'; }
            })();
            // 高亮目前語系側
            const langOpts = langToggleBtn.querySelectorAll('.lang-switch-opt');
            for (const opt of langOpts) {
                opt.classList.toggle('active', opt.getAttribute('data-lang') === currentLang);
                opt.onclick = (e) => {
                    e.stopPropagation();
                    const nextLang = opt.getAttribute('data-lang');
                    if (nextLang === currentLang) return; // 點擊目前語系側不動作
                    try { localStorage.setItem('cocoya_lang', nextLang); } catch (err) { }
                    if (window.CocoyaBridge && typeof window.CocoyaBridge.send === 'function') {
                        window.CocoyaBridge.send('reloadWebview');
                    } else {
                        location.reload();
                    }
                };
            }
        }

        // --- 主題子選單：由 ThemeManager registry 動態生成（auto 固定第一個，✔ 標示目前模式） ---
        const themeMenuTitle = document.getElementById('theme-menu-title');
        if (themeMenuTitle) {
            themeMenuTitle.textContent = Blockly.Msg['BKY_STARTUP_THEME'] || 'Theme';
        }
        const themeMenuItems = document.getElementById('theme-menu-items');
        if (themeMenuItems && window.CocoyaTheme) {
            const savedMode = window.CocoyaTheme.getMode();
            const buildOption = (value, text) => {
                const opt = document.createElement('div');
                opt.className = 'dropdown-item';
                const check = document.createElement('span');
                check.style.cssText = 'width: 16px; margin-right: 8px; display: inline-block;';
                check.textContent = (savedMode === value) ? '✔' : '';
                const label = document.createElement('span');
                label.textContent = text;
                opt.appendChild(check);
                opt.appendChild(label);
                opt.onclick = () => window.CocoyaTheme.setMode(value);
                return opt;
            };
            themeMenuItems.appendChild(buildOption('auto',
                Blockly.Msg['BKY_THEME_AUTO'] || 'Auto (System)'));
            for (const t of window.CocoyaTheme.getThemes()) {
                themeMenuItems.appendChild(buildOption(t.id,
                    (t.labelKey && Blockly.Msg[t.labelKey]) || t.labelFallback || t.id));
            }
        }

        // --- 穩定教學模式：切換開關 ---
        const serialUploadBtn = document.getElementById('btn-toggle-serial-upload');
        const serialUploadCheck = document.getElementById('serial-upload-check');
        if (serialUploadBtn && serialUploadCheck) {
            const updateUI = () => {
                const isEnabled = localStorage.getItem('cocoya_serial_upload_only') === 'true';
                serialUploadCheck.textContent = isEnabled ? '✔' : '';
            };
            updateUI();
            serialUploadBtn.onclick = () => {
                const current = localStorage.getItem('cocoya_serial_upload_only') === 'true';
                localStorage.setItem('cocoya_serial_upload_only', !current);
                updateUI();
            };
        }

        // --- 穩定教學模式：初始化 MCU (寫入 boot.py) ---
        const setupStableBtn = document.getElementById('btn-setup-stable-mcu');
        if (setupStableBtn) {
            setupStableBtn.onclick = async () => {
                const port = window.CocoyaUI && window.CocoyaUI.getSerialPort ? window.CocoyaUI.getSerialPort() : (document.getElementById('serial-selector')?.getAttribute('data-value') || '');
                if (!port) {
                    window.CocoyaBridge.alert(Blockly.Msg['MSG_SELECT_PORT'] || 'Please select a port first.');
                    return;
                }
                const confirmMsg = Blockly.Msg['MSG_SETUP_STABLE_CONFIRM'] || 
                    'This will write boot.py to MCU to enable Stable Mode. Windows will become Read-Only for this drive. Continue?';
                if (await window.CocoyaBridge.confirm(confirmMsg)) {
                    window.CocoyaBridge.send('setupStableMode', { serialPort: port });
                }
            };
        }

        // --- 深度修復清空檔案 (Erase Filesystem) ---
        const eraseFsBtn = document.getElementById('btn-erase-filesystem');
        if (eraseFsBtn) {
            eraseFsBtn.onclick = async () => {
                const port = window.CocoyaUI && window.CocoyaUI.getSerialPort ? window.CocoyaUI.getSerialPort() : (document.getElementById('serial-selector')?.getAttribute('data-value') || '');
                if (!port) {
                    window.CocoyaBridge.alert(Blockly.Msg['MSG_SELECT_PORT'] || 'Please select a port first.');
                    return;
                }
                const confirmMsg = Blockly.Msg['MSG_ERASE_FS_CONFIRM'] || 
                    'WARNING: This will ERASE ALL FILES on the MCU and rebuild the partition. This cannot be undone! Continue?';
                if (await window.CocoyaBridge.confirm(confirmMsg)) {
                    window.CocoyaBridge.send('eraseFilesystem', { serialPort: port });
                }
            };
        }
        
        const resetFirmwareBtn = document.getElementById('btn-reset-firmware');
        if (resetFirmwareBtn) {
            resetFirmwareBtn.onclick = async () => {
                const confirmMsg = Blockly.Msg['MSG_RESET_FIRMWARE_CONFIRM'] || 'Reset firmware?';
                const ok = await window.CocoyaBridge.confirm(confirmMsg);
                if (!ok) return;

                // 改用專用的 pick 指令，在 VS Code 會呈現漂亮的 QuickPick
                const model = await window.CocoyaBridge.pickMcuModel([
                    { id: 'MakerPi_RP2040', label: 'Maker Pi RP2040 (UF2 Mode)' },
                    { id: 'XIAO_ESP32_S3_SENSE_CAMERA', label: 'XIAO ESP32-S3 Sense (⚡ MicroPython)' },
                    { id: 'XIAO_ESP32_S3_SENSE_FACTORY', label: 'XIAO ESP32-S3 Sense (⚙️ C++ Factory Webserver)' },
                    { id: 'custom', label: '⚡ 自訂韌體 / Custom UF2' }
                ]);
                
                if (model) {
                    let shouldClear = true;
                    if (model === 'custom') {
                        // 自訂模式下，詢問是否要清空 code.py
                        shouldClear = await window.CocoyaBridge.confirm(
                            (Blockly.Msg['MSG_ASK_CLEAR_CODE'] || 'Do you want to clear code.py after burning?')
                        );
                    }

                    const port = window.CocoyaUI && window.CocoyaUI.getSerialPort ? window.CocoyaUI.getSerialPort() : (document.getElementById('serial-selector')?.getAttribute('data-value') || '') || '';
                    if (model.includes('SERIAL') && !port) {
                        window.CocoyaBridge.alert(Blockly.Msg['MSG_SELECT_PORT'] || 'Please select a port first.');
                        return;
                    }

                    window.CocoyaBridge.send('resetFirmware', { model, shouldClear, serialPort: port });
                }
            };
        }

        const refreshBtn = document.getElementById('btn-refresh-serial');
        if (refreshBtn) {
            refreshBtn.onclick = () => {
                const port = window.CocoyaUI && window.CocoyaUI.getSerialPort ? window.CocoyaUI.getSerialPort() : (document.getElementById('serial-selector')?.getAttribute('data-value') || '');
                // 1. 執行原本的整理清單
                postMessageFunc({ command: 'refreshSerialPorts' });
                // 2. 如果有選埠，則嘗試開啟監控器 (對齊使用者想重新進入的需求)
                if (port) {
                    postMessageFunc({ command: 'openSerialMonitor', serialPort: port });
                }
                if (self.flashButton) self.flashButton('btn-refresh-serial', '#e3f2fd');
            };
        }

        // 綁定訓練按鈕
        const trainBtn = document.getElementById('btn-train');
        if (trainBtn) {
            trainBtn.onclick = async () => {
                if (self.showTrainingDialog) {
                    const config = await new Promise((resolve) => {
                        self.showTrainingDialog({
                            onConfirm: resolve,
                            onCancel: () => resolve(null)
                        });
                    });
                    
                    if (!config) {
                        return;
                    }
                    
                    // 顯示 loading
                    if (self.showLoadingModal) {
                        self.showLoadingModal(config.backend === 'dgx' ? '正在上傳資料集至 DGX...' : '正在啟動本地訓練...');
                    }
                    
                    try {
                        // 根據後端選擇處理訓練
                        let trainingConfig = {
                            projectName: config.projectName,
                            taskType: config.taskType,
                            backend: config.backend
                        };
                        
                        if (config.backend === 'dgx') {
                            // DGX 模式：需要 SSH 設定
                            if (self.ensureSshConfig) {
                                const sshConfig = await new Promise((resolve) => {
                                    self.ensureSshConfig(resolve, () => resolve(null));
                                });
                                
                                if (!sshConfig) {
                                    console.log('[UI] DGX training cancelled (no SSH config)');
                                    if (self.hideLoadingModal) self.hideLoadingModal();
                                    return;
                                }
                                
                                trainingConfig.sshConfig = sshConfig;
                            }
                        }
                        
                        // 使用 Bridge API 開始訓練
                        const result = await window.CocoyaBridge.startTraining(trainingConfig);
                        
                        if (result.success) {
                            // 顯示訓練結果浮動視窗
                            if (self.showTrainingResultPanel) {
                                self.showTrainingResultPanel(result);
                            }
                        } else {
                            if (window.CocoyaBridge.alert) {
                                window.CocoyaBridge.alert('訓練失敗: ' + (result.error || '未知錯誤'));
                            }
                        }
                    } catch (error) {
                        console.error('[UI] Training error:', error);
                        if (window.CocoyaBridge.alert) {
                            window.CocoyaBridge.alert('訓練過程發生錯誤: ' + error.message);
                        }
                    } finally {
                        if (self.hideLoadingModal) {
                            self.hideLoadingModal();
                        }
                    }
                }
            };
        }

        bind('btn-run', 'runCode');
        bind('btn-update', 'checkUpdate');

        // --- AI 下拉選單邏輯 ---
        const aiDropdown = document.getElementById('ai-dropdown');
        const aiMenuBtn = document.getElementById('btn-ai-menu');
        const aiDropdownContent = document.querySelector('.ai-dropdown-content');
        let aiDropdownLocked = false; // 點擊鎖定狀態

        if (aiDropdown && aiMenuBtn && aiDropdownContent) {
            // Hover 顯示（僅當未鎖定時）
            aiMenuBtn.addEventListener('mouseenter', () => {
                if (!aiDropdownLocked) {
                    aiDropdownContent.style.display = 'block';
                }
            });

            // 滑鼠離開選單區域時，若未鎖定則隱藏
            aiDropdown.addEventListener('mouseleave', () => {
                if (!aiDropdownLocked) {
                    aiDropdownContent.style.display = 'none';
                }
            });

            // 點擊鎖定/解鎖
            aiMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                aiDropdownLocked = !aiDropdownLocked;
                aiDropdownContent.style.display = aiDropdownLocked ? 'block' : 'none';
            });

            // 點擊選單項目後自動關閉
            const dropdownItems = aiDropdownContent.querySelectorAll('.dropdown-item');
            dropdownItems.forEach(item => {
                item.addEventListener('click', () => {
                    aiDropdownLocked = false;
                    aiDropdownContent.style.display = 'none';
                });
            });
        }

        // --- 資料集管理按鈕（AI 下拉選單）---
        const datasetManagerBtn = document.getElementById('btn-dataset-manager-dropdown');
        if (datasetManagerBtn) {
            datasetManagerBtn.addEventListener('click', () => {
                if (window.CocoyaBridge) {
                    window.CocoyaBridge.send('openDatasetManager');
                }
            });
        }

        // --- 監聽 Dataset Manager 開啟事件 ---
        if (window.CocoyaBridge) {
            window.CocoyaBridge.onMessage((msg) => {
                if (msg.command === 'openDatasetManager') {
                    if (window.CocoyaDataset && window.CocoyaDataset.open) {
                        window.CocoyaDataset.open();
                    }
                } else if (msg.command === 'trainingConnected') {
                    // VSIX 方案 A：trainingLog 導向 VS Code 終端機，host 收到第一筆訓練事件時送此一次性信號，
                    // 讓「[Remote] 連線中…」點點計時器提前停止（原本要等到 trainingComplete）。
                    if (self._remoteConnTimer) { clearInterval(self._remoteConnTimer); self._remoteConnTimer = null; }
                } else if (msg.command === 'trainingComplete') {
                    // 訓練完成，開啟 HTML 訓練報告
                    if (self._remoteConnTimer) { clearInterval(self._remoteConnTimer); self._remoteConnTimer = null; }
                    if (self.showTrainingResultPanel && msg.success) {
                        self.showTrainingResultPanel({
                            projectName: msg.projectName,
                            accuracy: msg.accuracy,
                            epochs: msg.epochs,
                            curvePath: msg.curvePath,
                            historyPath: msg.historyPath,
                            modelDir: msg.modelDir,
                            reportPath: msg.reportPath
                        });
                    }
                    if (window.CocoyaUI?.appendTerminal) {
                        // remote 標記由遠端訓練鏈（VSIX trainingOps / Tauri trainRemote）帶入；
                        // 本地訓練（envOps RESULT / trainLocal）無此標記，勿誤標 Remote。
                        const key = msg.remote ? 'MSG_TRAINING_COMPLETE_REMOTE' : 'MSG_TRAINING_COMPLETE_LOCAL';
                        const fallback = msg.remote ? '--- Remote training complete: %1 ---' : '--- Training complete: %1 ---';
                        const text = ((Blockly.Msg && Blockly.Msg[key]) || fallback).replace('%1', msg.modelDir || '');
                        window.CocoyaUI.appendTerminal(text, 'info');
                    }
                } else if (msg.command === 'trainingLog') {
                    // D4 遠端訓練即時日誌（VSIX postMessage / Tauri sidecar-event 轉發）
                    // 注意：連線階段的「連線中」回報不算進度，不停止點點計時器；
                    // 收到連線成功/同步/錯誤等實質進度才停。
                    if (self._remoteConnTimer && msg.message && /連線成功|同步檢查|錯誤|error/i.test(msg.message)) {
                        clearInterval(self._remoteConnTimer); self._remoteConnTimer = null;
                    }
                    if (window.CocoyaUI?.appendTerminal && msg.message) {
                        window.CocoyaUI.appendTerminal(msg.message, 'info');
                    }
                } else if (msg.command === 'trainingError') {
                    // D4 遠端訓練失敗（含 SSH 認證失敗）：必須顯示於終端機，避免看似卡住
                    if (self._remoteConnTimer) { clearInterval(self._remoteConnTimer); self._remoteConnTimer = null; }
                    if (window.CocoyaUI?.appendTerminal) {
                        window.CocoyaUI.appendTerminal('[Remote] 錯誤: ' + (msg.error || '未知錯誤'), 'err');
                    }
                    // 連線失敗時清除 session SSH 設定，下次執行重新跳出精靈讓使用者修正
                    if (window.CocoyaUI && /SSH|連線失敗|timed out|Authentication|auth/i.test(msg.error || '')) {
                        window.CocoyaUI.sshConfig = null;
                    }
                    if (window.CocoyaUI?.hideLoadingModal) window.CocoyaUI.hideLoadingModal();
                }
            });
        }

        // --- 訓練結果按鈕（AI 下拉選單）---
        // 改為開啟目前專案 model 目錄下的 _training_report.html
        const trainingResultBtn = document.getElementById('btn-training-result');
        if (trainingResultBtn) {
            trainingResultBtn.addEventListener('click', () => {
                // 由後端搜尋目前專案的 model 目錄下最新的報告
                if (window.CocoyaBridge) {
                    window.CocoyaBridge.send('openLatestTrainingReport');
                }
            });
        }

        // 綁定診斷按鈕
        const diagBtn = document.getElementById('btn-diagnose');
        if (diagBtn) {
            diagBtn.onclick = () => {
                if (self.showDiagnoseModal) self.showDiagnoseModal();
                postMessageFunc({ command: 'checkEnvironment' });
            };
        }

        // 綁定複製程式碼按鈕
        const copyBtn = document.getElementById('btn-copy-code');
        if (copyBtn) {
            copyBtn.onclick = () => {
                const rawCode = window.CocoyaApp.lastCleanCode || '';
                // 徹底清理：濾掉行尾 ID 註解與運算式隱形標記
                const cleanCode = rawCode.replace(/  # ID:.*$/mg, '').replace(/\u0001ID:.*?\u0002/g, '');
                
                navigator.clipboard.writeText(cleanCode).then(() => {
                    if (self.flashButton) self.flashButton('btn-copy-code', '#c8e6c9'); // 綠色閃爍表示成功
                });
            };
        }
        
        // 綁定停止按鈕 (終止程式)
        if (stopBtn) {
            stopBtn.onclick = () => {
                if (self.flashButton) self.flashButton('btn-stop', '#ffebee'); // 紅色回饋
                postMessageFunc({ command: 'stopCode' });
            };
        }

        // --- 高亮顏色選取器邏輯 ---
        const colorInput = document.getElementById('highlight-color-input');
        if (colorInput) {
            // 從 localStorage 恢復顏色
            const savedColor = localStorage.getItem('cocoya_highlight_color') || '#fff59d';
            colorInput.value = savedColor;
            if (self.applyHighlightColor) self.applyHighlightColor(savedColor);

            colorInput.oninput = (e) => {
                if (self.applyHighlightColor) self.applyHighlightColor(e.target.value);
            };
        }
    },

    /**
     * 向後相容：保留空殼
     */
    updateTrainingResultButton: function() {
        // 不再需要動態啟用/禁用按鈕
    }
});
