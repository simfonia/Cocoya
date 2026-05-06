/**
 * Cocoya UI 渲染與同步管理器
 * 負責處理 Python 預覽渲染、積木導航、工具列互動與 i18n
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
            fileLabel.title = displayName; // Hover 顯示完整路徑/名稱
        }
        
        // 同步更新 Tauri 視窗標題
        window.CocoyaBridge.send('setWindowTitle', { title: displayName });
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
     * 更新序列埠下拉選單
     * @param {string[]} ports 序列埠列表
     */
    updateSerialPorts: function(ports) {
        const selector = document.getElementById('serial-selector');
        if (!selector) return;

        const currentVal = selector.value;
        selector.innerHTML = '';

        if (!ports || ports.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '(No Port)';
            selector.appendChild(opt);
            return;
        }

        ports.forEach(p => {
            const opt = document.createElement('option');
            // 兼容舊有的 string 格式與新的物件格式
            const portValue = typeof p === 'string' ? p : p.port;
            const portLabel = typeof p === 'string' ? p : p.label;
            
            opt.value = portValue;
            opt.textContent = portLabel;
            if (portValue === currentVal) {
                opt.selected = true;
                // 同步將完整名稱設為 selector 的 title，讓 hover 時能看完整名字
                selector.setAttribute('title', portLabel);
            }
            selector.appendChild(opt);
        });

        // 監聽改變事件，同步更新 title
        selector.onchange = (e) => {
            const selectedOpt = selector.options[selector.selectedIndex];
            if (selectedOpt) selector.setAttribute('title', selectedOpt.textContent);
        };
    },

    /**
     * 更新執行按鈕的 Tooltip
     * @param {string} platform 
     */
    updateRunTooltip: function(platform) {
        const btn = document.getElementById('btn-run');
        if (!btn || typeof Blockly === 'undefined') return;
        
        // 修正判定條件：選單的值是 MicroPython
        const isMCU = (platform === 'MCU' || platform === 'MicroPython');
        const key = isMCU ? 'TLB_RUN_MCU' : 'TLB_RUN_PC';
        const tip = Blockly.Msg[key] || (isMCU ? 'Upload to MCU' : 'Run PC Program');
        btn.setAttribute('title', tip);
        
        // 同步更新設定選單中的「重置韌體」顯示狀態
        this.updateSettingsMenu(platform);
    },

    /**
     * 根據平台顯示或隱藏特定的設定選項
     * @param {string} platform 
     */
    updateSettingsMenu: function(platform) {
        const group = document.getElementById('group-firmware-settings');
        const resetBtn = document.getElementById('btn-reset-firmware');
        const eraseBtn = document.getElementById('btn-erase-filesystem');
        
        const isMCU = (platform === 'MCU' || platform === 'MicroPython');
        
        // 切換整個群組的顯示狀態
        if (group) group.style.display = isMCU ? 'block' : 'none';

        // 同時切換分隔線 (如果有的話)
        const separator = group?.previousElementSibling;
        if (separator && separator.classList.contains('dropdown-separator')) {
            separator.style.display = isMCU ? 'block' : 'none';
        }

        // 只有 MCU 模式才顯示重置與修復內容
        if (resetBtn) resetBtn.style.display = isMCU ? 'flex' : 'none';
        if (eraseBtn) eraseBtn.style.display = isMCU ? 'flex' : 'none';
    },

    /**
     * 閃爍按鈕背景色提供回饋
     * @param {string} btnId 按鈕 ID
     * @param {string} color 閃爍顏色
     */
    flashButton: function(btnId, color) {
        const btn = document.getElementById(btnId);
        if (btn) {
            const originalBg = btn.style.backgroundColor;
            btn.style.backgroundColor = color;
            setTimeout(() => {
                btn.style.backgroundColor = originalBg;
            }, 300);
        }
    },

    /**
     * 開啟快速選取 (QuickPick) 視窗
     * @param {string} title 視窗標題
     * @param {Array<{id:string, label:string}>} options 選項列表
     * @param {Function} onSelect 選取後的回調函式
     */
    showQuickPick: function(title, options, onSelect) {
        const modal = document.getElementById('quick-pick-modal');
        const titleEl = document.getElementById('quick-pick-title');
        const listEl = document.getElementById('quick-pick-list');
        if (!modal || !listEl) return;

        titleEl.textContent = title;
        listEl.innerHTML = '';
        this._onQuickPickSelect = onSelect;

        options.forEach(opt => {
            const item = document.createElement('div');
            item.className = 'quick-pick-item';
            item.textContent = opt.label;
            item.onclick = () => {
                this.closeQuickPick(opt.id);
            };
            listEl.appendChild(item);
        });

        modal.style.display = 'flex';
    },

    /**
     * 關閉快速選取視窗
     * @param {string|null} result 選取的 ID 或取消
     */
    closeQuickPick: function(result) {
        const modal = document.getElementById('quick-pick-modal');
        if (modal) modal.style.display = 'none';
        if (this._onQuickPickSelect) {
            this._onQuickPickSelect(result);
            this._onQuickPickSelect = null;
        }
    },

    /**
     * 顯示全域 Loading 提示
     * @param {string} message 提示訊息
     */
    showLoadingModal: function(message) {
        let modal = document.getElementById('loading-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'loading-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content" style="width: auto; padding: 30px; text-align: center;">
                    <div class="loading-spinner" style="border: 4px solid #f3f3f3; border-top: 4px solid #FE2F89; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 15px;"></div>
                    <p id="loading-message" style="margin: 0; font-size: 14px; font-weight: bold; color: #333;"></p>
                </div>
            `;
            document.body.appendChild(modal);
            
            // 加入 spinner 動畫樣式 (若 style.css 沒寫的話)
            const style = document.createElement('style');
            style.textContent = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
            document.head.appendChild(style);
        }
        
        document.getElementById('loading-message').textContent = message;
        modal.style.display = 'flex';
    },

    /**
     * 隱藏全域 Loading 提示
     */
    hideLoadingModal: function() {
        const modal = document.getElementById('loading-modal');
        if (modal) modal.style.display = 'none';
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
            
            // 3秒後自動隱藏
            setTimeout(() => {
                btn.classList.add('update-hidden');
            }, 3000);
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
        
        // --- 環境偵測：按鈕顯示控制 ---
        const stopBtn = document.getElementById('btn-stop');
        const closeBtn = document.getElementById('btn-close');
        const terminalToggleBtn = document.getElementById('btn-terminal');

        if (window.CocoyaBridge) {
            if (window.CocoyaBridge.isTauri) {
                // Tauri: 顯示停止鈕、隱藏關閉鈕、顯示自訂終端機
                if (stopBtn) stopBtn.style.display = 'flex';
                if (closeBtn) closeBtn.style.display = 'none';
                if (terminalToggleBtn) terminalToggleBtn.style.display = 'flex';
            } else if (window.CocoyaBridge.isVsCode) {
                // VSIX: 顯示停止鈕、顯示關閉鈕、隱藏自訂終端機 (VSIX 用不到)
                if (stopBtn) stopBtn.style.display = 'flex';
                if (closeBtn) closeBtn.style.display = 'flex';
                if (terminalToggleBtn) terminalToggleBtn.style.display = 'none';
            }
        }

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
                    // 注入平台屬性標記 (PC 或 MicroPython)
                    const platform = document.getElementById('platform-selector')?.value || 'PC';
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
                    
                    // 使用 CocoyaApp 處理過的乾淨代碼，確保行號與 Preview 一致且縮排正確
                    msg.code = window.CocoyaApp.lastCleanCode || Blockly.Python.workspaceToCode(Blockly.getMainWorkspace());
                    msg.platform = document.getElementById('platform-selector')?.value || 'PC';
                    msg.serialPort = document.getElementById('serial-selector')?.value || '';
                    msg.serialUploadOnly = localStorage.getItem('cocoya_serial_upload_only') === 'true';
                    self.flashButton(id, '#e8f5e9'); // 綠色回饋
                }

                postMessageFunc(msg);
            };
        };

        const codeCloseBtn = document.getElementById('btn-close-code');
        if (codeCloseBtn) {
            codeCloseBtn.onclick = () => self.toggleCodeArea(false);
        }

        // 綁定檔案操作
        bind('btn-new', 'newFile', { includeXml: true });
        bind('btn-open', 'openFile', { includeXml: true });
        bind('btn-save', 'saveFile', { includeXml: true });
        bind('btn-save-as', 'saveFileAs', { includeXml: true });
        bind('btn-close', 'closeEditor', { includeXml: true }); // VSIX 模式關閉編輯器
        
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
                const port = document.getElementById('serial-selector')?.value;
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
                const port = document.getElementById('serial-selector')?.value;
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
                    { id: 'XIAO_ESP32_S3', label: 'XIAO ESP32-S3 (UF2 Mode)' },
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
                    window.CocoyaBridge.send('resetFirmware', { model, shouldClear });
                }
            };
        }

        const refreshBtn = document.getElementById('btn-refresh-serial');
        if (refreshBtn) {
            refreshBtn.onclick = () => {
                const port = document.getElementById('serial-selector')?.value;
                // 1. 執行原本的整理清單
                postMessageFunc({ command: 'refreshSerialPorts' });
                // 2. 如果有選埠，則嘗試開啟監控器 (對齊使用者想重新進入的需求)
                if (port) {
                    postMessageFunc({ command: 'openSerialMonitor', serialPort: port });
                }
                self.flashButton('btn-refresh-serial', '#e3f2fd');
            };
        }

        bind('btn-run', 'runCode');
        bind('btn-update', 'checkUpdate');

        // 綁定診斷按鈕
        const diagBtn = document.getElementById('btn-diagnose');
        if (diagBtn) {
            diagBtn.onclick = () => {
                self.showDiagnoseModal();
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
                    self.flashButton('btn-copy-code', '#c8e6c9'); // 綠色閃爍表示成功
                });
            };
        }
        
        // 綁定停止按鈕 (終止程式)
        if (stopBtn) {
            stopBtn.onclick = () => {
                self.flashButton('btn-stop', '#ffebee'); // 紅色回饋
                postMessageFunc({ command: 'stopCode' });
            };
        }

        // --- 高亮顏色選取器邏輯 ---
        const colorInput = document.getElementById('highlight-color-input');
        if (colorInput) {
            // 從 localStorage 恢復顏色
            const savedColor = localStorage.getItem('cocoya_highlight_color') || '#fff59d';
            colorInput.value = savedColor;
            self.applyHighlightColor(savedColor);

            colorInput.oninput = (e) => {
                self.applyHighlightColor(e.target.value);
            };
        }
    },

    /**
     * 應用高亮顏色
     * @param {string} color 十六進制顏色
     */
    applyHighlightColor: function(color) {
        document.documentElement.style.setProperty('--highlight-bg', color);
        // 生成稍微深一點的邊框色
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        const border = `rgb(${Math.max(0, r - 31)}, ${Math.max(0, g - 31)}, ${Math.max(0, b - 31)})`;
        document.documentElement.style.setProperty('--highlight-border', border);
        
        const preview = document.getElementById('highlight-color-preview');
        if (preview) preview.style.backgroundColor = color;
        
        localStorage.setItem('cocoya_highlight_color', color);
    },

    /**
     * 顯示環境診斷視窗
     */
    showDiagnoseModal: function() {
        const modal = document.getElementById('diagnose-modal');
        if (modal) modal.style.display = 'flex';
        
        const list = document.getElementById('module-list');
        if (list) list.innerHTML = `<li>${Blockly.Msg['DIAG_CHECKING'] || 'Checking...'}</li>`;
    },

    /**
     * 顯示儲存確認對話框 (支援儲存、不儲存、取消)
     * @param {string} message 提示訊息
     * @returns {Promise<'save'|'discard'|'cancel'>} 使用者選擇
     */
    showSaveConfirm: function(message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('save-confirm-modal');
            if (!modal) { resolve('cancel'); return; }

            const msgEl = document.getElementById('save-confirm-message');
            if (msgEl && message) msgEl.textContent = message;

            modal.style.display = 'flex';

            const btnSave = document.getElementById('btn-save-confirm-save');
            const btnDiscard = document.getElementById('btn-save-confirm-discard');
            const btnCancel = document.getElementById('btn-save-confirm-cancel');

            btnSave.onclick = () => { modal.style.display = 'none'; resolve('save'); };
            btnDiscard.onclick = () => { modal.style.display = 'none'; resolve('discard'); };
            btnCancel.onclick = () => { modal.style.display = 'none'; resolve('cancel'); };
        });
    },

    /**
     * 更新環境偵測結果
     * @param {Object} results 模組安裝狀態
     */
    updateEnvironmentStatus: function(results) {
        console.log('[UI] updateEnvironmentStatus received:', results);
        const modal = document.getElementById('diagnose-modal');
        const body = document.getElementById('diagnose-body');
        const list = document.getElementById('module-list');
        
        if (!modal || !list || !results) {
            console.error('[UI] Cannot find diagnosis modal elements or results is empty');
            return;
        }

        // 隱藏「正在偵測...」的提示段落 (如果有)
        const loadingPara = body?.querySelector('p');
        if (loadingPara) loadingPara.style.display = 'none';

        const modules = [
            { id: 'cv2', name: 'opencv-python' },
            { id: 'mediapipe', name: 'mediapipe' },
            { id: 'PIL', name: 'Pillow (Image)' },
            { id: 'serial', name: 'pyserial' }
        ];

        list.innerHTML = '';
        modules.forEach(mod => {
            const installed = !!results[mod.id];
            const li = document.createElement('li');
            li.className = 'module-item';
            
            const statusTxt = installed ? 
                (Blockly.Msg['DIAG_INSTALLED'] || '● Installed') : 
                (Blockly.Msg['DIAG_MISSING'] || '○ Missing');
            
            const btnTxt = Blockly.Msg['DIAG_INSTALL_BTN'] || 'Install';
            
            // 使用 Bridge 發送安裝指令
            const installBtnHtml = !installed ? `<button class="btn-install" onclick="window.CocoyaBridge.send('installModule', {module: '${mod.name}'})">${btnTxt}</button>` : '';
            
            li.innerHTML = `
                <span style="font-size: 14px;">${mod.name}</span>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="module-status ${installed ? 'status-ok' : 'status-missing'}">
                        ${statusTxt}
                    </span>
                    ${installBtnHtml}
                </div>
            `;
            list.appendChild(li);
        });
    }
});
