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
            fileLabel.title = displayName; // Hover 顯示完整路徑/名稱
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
        const cloudAiContainer = document.getElementById('cloud-ai-container');
        const cloudAiSeparator = document.getElementById('cloud-ai-separator');

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
            
            // 雲端 AI 模式：僅在具備雲端感知能力時顯示
            if (cloudAiContainer && caps.isRemoteAware) {
                cloudAiContainer.style.display = 'flex';
                if (cloudAiSeparator) cloudAiSeparator.style.display = 'block';
            }
        }

        // --- 遠端訓練模式：事件處理 ---
        const cloudAiToggle = document.getElementById('cloud-ai-toggle');
        if (cloudAiToggle) {
            // 僅設定初始顯示，不要在此處進行「連線校準」以免時間差誤刪 localStorage
            const isRemoteModeEnabled = localStorage.getItem('cocoya_remote_mode_enabled') === 'true';
            cloudAiToggle.checked = isRemoteModeEnabled;

            cloudAiToggle.onchange = () => {
                const enabled = cloudAiToggle.checked;
                if (enabled) {
                                    if (window.CocoyaUI && window.CocoyaUI.ensureSshConfig) {
                                        window.CocoyaUI.ensureSshConfig(
                                            (sshConfig) => {
                                                localStorage.setItem('cocoya_remote_mode_enabled', 'true');
                                                window.CocoyaBridge.send('setCloudAiMode', { enabled: true });
                                                
                                                // 同步更新資料管理器中的動態顯示
                                                if (window.CocoyaDataset && window.CocoyaDataset.refreshDynamicPanels) {
                                                    window.CocoyaDataset.refreshDynamicPanels();
                                                }
                                            },
                                            () => {
                                                cloudAiToggle.checked = false;
                                                localStorage.setItem('cocoya_remote_mode_enabled', 'false');
                                                window.CocoyaBridge.send('setCloudAiMode', { enabled: false });
                                            }
                                        );
                                    } else {
                                        localStorage.setItem('cocoya_remote_mode_enabled', 'true');
                                        window.CocoyaBridge.send('setCloudAiMode', { enabled: true });
                                    }
                } else {
                    localStorage.setItem('cocoya_remote_mode_enabled', 'false');
                    window.CocoyaBridge.send('setCloudAiMode', { enabled: false });
                    // 同步更新資料管理器中的動態顯示
                    if (window.CocoyaDataset && window.CocoyaDataset.refreshDynamicPanels) {
                        window.CocoyaDataset.refreshDynamicPanels();
                    }
                }
            };
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
                    // 注入 platform屬性標記 (PC 或 MicroPython)
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
                    msg.platform = document.getElementById('platform-selector')?.value || 'PC';
                    msg.serialPort = document.getElementById('serial-selector')?.value || '';
                    msg.serialUploadOnly = localStorage.getItem('cocoya_serial_upload_only') === 'true';
                    if (self.flashButton) self.flashButton(id, '#e8f5e9'); // 綠色回饋
                }

                postMessageFunc(msg);
            };
        };

        const codeCloseBtn = document.getElementById('btn-close-code');
        if (codeCloseBtn) {
            codeCloseBtn.onclick = () => self.toggleCodeArea(false);
        }

        // 綁定範例按鈕：觸發後端 Quick Pick 並載入範例
        const examplesBtn = document.getElementById('btn-examples');
        if (examplesBtn) {
            examplesBtn.onclick = () => {
                postMessageFunc({ command: 'openExamples', isDirty: self.isDirty, includeXml: true });
            };
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

                    const port = document.getElementById('serial-selector')?.value || '';
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
                const port = document.getElementById('serial-selector')?.value;
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

        // --- 遠端訓練切換（AI 下拉選單中的第一個項目）---
        const cloudAiToggleDropdown = document.getElementById('btn-cloud-ai-toggle');
        const cloudAiStatus = document.getElementById('cloud-ai-status');
        if (cloudAiToggleDropdown && cloudAiStatus) {
            cloudAiToggleDropdown.addEventListener('click', async () => {
                const currentEnabled = localStorage.getItem('cocoya_remote_mode_enabled') === 'true';
                const newEnabled = !currentEnabled;

                if (newEnabled) {
                    // 開啟時需要 SSH 設定
                    if (self.ensureSshConfig) {
                        const sshConfig = await new Promise((resolve) => {
                            self.ensureSshConfig(resolve, () => resolve(null));
                        });
                        
                        if (!sshConfig) {
                            console.log('[UI] Remote training cancelled (no SSH config)');
                            return;
                        }
                        
                        localStorage.setItem('cocoya_remote_mode_enabled', 'true');
                        window.CocoyaBridge.send('setCloudAiMode', { enabled: true });
                        cloudAiStatus.textContent = '●';
                        cloudAiStatus.className = 'enabled';
                    }
                } else {
                    // 關閉遠端訓練
                    localStorage.setItem('cocoya_remote_mode_enabled', 'false');
                    window.CocoyaBridge.send('setCloudAiMode', { enabled: false });
                    cloudAiStatus.textContent = '○';
                    cloudAiStatus.className = 'disabled';
                }
            });

            // 初始化狀態
            const isRemoteEnabled = localStorage.getItem('cocoya_remote_mode_enabled') === 'true';
            cloudAiStatus.textContent = isRemoteEnabled ? '●' : '○';
            cloudAiStatus.className = isRemoteEnabled ? 'enabled' : 'disabled';
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
                } else if (msg.command === 'trainingComplete') {
                    // 訓練完成，開啟 HTML 訓練報告
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
     * 更新雲端 AI 切換開關狀態
     * @param {boolean} enabled 
     */
    updateCloudAiToggle: function(enabled) {
        const toggle = document.getElementById('cloud-ai-toggle');
        if (toggle) {
            toggle.checked = enabled;
            localStorage.setItem('cocoya_cloud_ai_enabled', enabled);
        }
    },

    /**
     * 環境就緒後的雲端模式校準 (由 AppController 觸發)
     * 注意：舊的 #cloud-ai-toggle 已移至 AI 下拉選單，此函式僅保留向後相容
     */
    syncCloudAiToggle: function() {
        // 舊的 toggle 已刪除，改為檢查 AI 下拉選單中的狀態
        const cloudAiStatus = document.getElementById('cloud-ai-status');
        if (!cloudAiStatus || !window.CocoyaBridge) return;

        const isEnabled = localStorage.getItem('cocoya_remote_mode_enabled') === 'true';
        const hasSshConfig = !!(window.CocoyaUI && window.CocoyaUI.sshConfig);

        // 方案 C：如果設定開啟但實際上沒有 SSH 帳密（例如重啟或刷新），則強制關閉
        if (isEnabled && !hasSshConfig) {
            localStorage.setItem('cocoya_remote_mode_enabled', 'false');
            cloudAiStatus.textContent = '○';
            cloudAiStatus.className = 'disabled';
            window.CocoyaBridge.send('setCloudAiMode', { enabled: false });
        } else if (isEnabled && hasSshConfig) {
            // 確保後端狀態同步
            cloudAiStatus.textContent = '●';
            cloudAiStatus.className = 'enabled';
            window.CocoyaBridge.send('setCloudAiMode', { enabled: true });
        } else {
            // 確保 UI 狀態正確
            cloudAiStatus.textContent = '○';
            cloudAiStatus.className = 'disabled';
        }
    },

    /**
     * 向後相容：保留空殼
     */
    updateTrainingResultButton: function() {
        // 不再需要動態啟用/禁用按鈕
    }
});
