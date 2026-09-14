/**
 * Cocoya UI Hardware 模組
 * 負責序列埠管理、執行按鈕狀態、韌體設定選單與環境診斷顯示
 */
window.CocoyaUI = Object.assign(window.CocoyaUI || {}, {
    /**
     * 更新序列埠下拉選單
     * @param {string[]} ports 序列埠列表
     */
    updateSerialPorts: function(ports) {
        const root = document.getElementById('serial-selector');
        if (!root) return;
        const trigger = root.querySelector('.serial-dropdown-trigger');
        const menu = root.querySelector('.serial-dropdown-menu');
        if (!trigger || !menu) return;

        // 記錄埠 → boardId 對應（Tauri 由 Rust detect_board_id 提供；VSIX 由 serialOps.ts 推導）
        root.__boardIdMap = {};
        (ports || []).forEach(p => {
            if (p && typeof p === 'object' && p.port && p.boardId) {
                root.__boardIdMap[p.port] = p.boardId;
            }
        });
        // 記錄埠 → VID/PID（除錯用：tooltip 顯示，韌體/驅動問題一眼可查）
        root.__portInfoMap = {};
        (ports || []).forEach(p => {
            if (p && typeof p === 'object' && p.port && p.vid) {
                root.__portInfoMap[p.port] = (p.vid || '') + ':' + (p.pid || '');
            }
        });

        const currentVal = root.getAttribute('data-value') || '';

        // 清空清單（保留初始「無連接埠」項）
        menu.innerHTML = '';

        const addItem = (value, label) => {
            const item = document.createElement('div');
            item.className = 'serial-dropdown-item';
            item.setAttribute('data-value', value);
            if (value === '') item.classList.add('placeholder');
            item.textContent = label;
            menu.appendChild(item);
        };

        if (!ports || ports.length === 0) {
            if (currentVal) {
                // 偵測不到任何埠時仍保留已選取的埠項目（避免下拉清單消失），
                // 並維持 data-value 以支援上傳/監視；顯示用先前選取時的完整 label
                const lastLabel = root.__lastLabel || currentVal;
                addItem(currentVal, lastLabel);
                root.setAttribute('data-value', currentVal);
            } else {
                root.setAttribute('data-value', '');
                addItem('', '(No Port)');
            }
        } else {
            ports.forEach(p => {
                const portValue = typeof p === 'string' ? p : p.port;
                const portLabel = typeof p === 'string' ? p : p.label;
                addItem(portValue, portLabel);
            });
            const values = ports.map(p => (typeof p === 'string' ? p : p.port));
            // 目前選取的埠已消失（拔線/換板）或尚未選取 → 自動選第一個偵測到的埠並切板
            // （解決「拔掉 A 板插 B 板後仍卡舊埠、硬體不更新」的問題）
            if (ports.length > 0 && (!currentVal || !values.includes(currentVal))) {
                const first = ports[0];
                const firstVal = typeof first === 'string' ? first : first.port;
                const firstLabel = typeof first === 'string' ? first : first.label;
                root.setAttribute('data-value', firstVal);
                root.__lastLabel = firstLabel; // 記錄完整 label，供偵測不到時重現
                this._applyBoardFromPort(root); // 自動切板（boardIdMap 已含該埠）
            } else if (currentVal && values.includes(currentVal)) {
                // 保留上次選取（埠仍在）
                root.setAttribute('data-value', currentVal);
            }
        }

        this._bindSerialDropdown(root, trigger, menu);
        this.setSerialPortLabel(root);
    },

    /** 從自繪 serial 下拉讀取目前選取的埠 */
    getSerialPort: function() {
        const root = document.getElementById('serial-selector');
        if (!root) return '';
        return root.getAttribute('data-value') || '';
    },

    /** 設定 serial 下拉目前的選取值（data-value + label + active 樣式）
     *  鐵壁版：直接寫 trigger.textContent，不依賴內部 span 是否可被 query 到，
     *  且顯示文字不以 %{BKY_ 開頭，徹底避開 applyI18n 掃描重置。 */
    setSerialPortLabel: function(root) {
        const trigger = root.querySelector('.serial-dropdown-trigger');
        const menu = root.querySelector('.serial-dropdown-menu');
        if (!trigger) return;
        const currentVal = root.getAttribute('data-value') || '';
        let displayText = '';
        if (menu) {
            const active = Array.from(menu.children).find(c => c.getAttribute('data-value') === currentVal);
            Array.from(menu.children).forEach(c => c.classList.toggle('active', c === active));
            displayText = active ? active.textContent : (currentVal || root.__lastLabel || '');
        } else {
            displayText = currentVal || root.__lastLabel || '';
        }
        trigger.textContent = displayText ? displayText + ' \u25BE' : '(No Port)';
        if (displayText) {
            const vpid = (root.__portInfoMap || {})[currentVal];
            root.setAttribute('title', vpid ? displayText + ' [' + vpid + ']' : displayText);
        }
    },

    /** 根據目前選取的序列埠自動切換板子 */
    _applyBoardFromPort: function(root) {
        if (!window.CocoyaBoard || typeof window.CocoyaBoard.setCurrent !== 'function') return;
        const port = root.getAttribute('data-value') || '';
        const boardIdMap = root.__boardIdMap || {};
        const boardId = boardIdMap[port] || '';
        if (boardId) {
            window.CocoyaBoard.setCurrent(boardId, 'port');
        }
    },

    /** 序列監看鈕狀態（toggle 亮燈；由 bridge 收到結果/結束事件時呼叫） */
    _serialMonitorActive: false,
    setSerialMonitorActive: function(on) {
        this._serialMonitorActive = !!on;
        const btn = document.getElementById('btn-serial-monitor');
        if (btn) btn.style.backgroundColor = on ? '#c8e6c9' : '';
    },

    /** 綁定 serial 自繪下拉的開闔與點選 */
    _bindSerialDropdown: function(root, trigger, menu) {
        if (root.__serialBound) return;
        root.__serialBound = true;

        const close = () => {
            root.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
        };
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = root.classList.toggle('open');
            trigger.setAttribute('aria-expanded', String(isOpen));
        });
        menu.addEventListener('click', (e) => {
            const item = e.target.closest('.serial-dropdown-item');
            if (!item) return;
            const val = item.getAttribute('data-value');
            if (val === '') return; // 忽略「無連接埠」
            root.setAttribute('data-value', val);
            root.__lastLabel = item.textContent; // 記錄完整 label，供偵測不到時重現
            this.setSerialPortLabel(root);
            this._applyBoardFromPort(root);
            close();
        });
        document.addEventListener('click', () => close());
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

    // === Python 環境安裝狀態（2026-09-15）===
    // 掛在 CocoyaUI 上、而非 modal DOM 內，是本次的關鍵設計：
    // 狀態存活於 modal 之外 → 即使 modal 被關閉／頁面局部重繪，重開時仍能立刻
    // 知道「卡在哪個套件」。同時讓「重開 modal」與「持續顯示進度」兩個需求合一。
    _envState: function() {
        const UI = window.CocoyaUI;
        if (!UI._envInstall) {
            UI._envInstall = {
                active: false,      // pip 安裝進行中
                aborting: false,    // 已送中止請求，等待 done 事件
                queue: [],          // 待安裝 moduleId（第 0 筆為正在安裝者）
                current: null,      // 目前安裝中的 moduleId
                total: 0,           // 本批總數（供 n/m 進度）
                done: [],           // 本批成功清單
                failed: [],         // 本批失敗 [{id, display, exitCode}]
                lastLine: {},       // moduleId → pip 最後一行輸出（顯示於該列）
                lastOutputAt: 0,    // 最後一次收到輸出的時間戳（停滯偵測）
                startedAt: 0,       // 本批開始時間
                logLines: [],       // 全部安裝輸出 [{moduleId, text, stream}]
                meta: {}            // moduleId → {pipPackage, display}
            };
        }
        return UI._envInstall;
    },

    /** 環境檢查結果快照：安裝中重開 modal 時用來重建畫面（不重跑檢查） */
    _envSnapshot: function() {
        const UI = window.CocoyaUI;
        if (!UI._envCheck) {
            UI._envCheck = {
                results: {}, modules: [], pythonPath: '',
                pythonValid: null, pythonResolvedPath: '', pythonVersion: ''
            };
        }
        return UI._envCheck;
    },

    /** i18n 取值（Blockly.Msg 未就緒時回退） */
    _envT: function(key, fallback) {
        return (window.Blockly && Blockly.Msg && Blockly.Msg[key]) || fallback;
    },

    /**
     * 是否有 pip 安裝進行中。
     * 供三類「逃逸路徑」攔截使用：Ctrl+R 重載、語系切換、主題切換（皆會重載頁面，
     * 導致前端狀態消失而後端 pip 仍在跑 → 形成看不到進度的幽靈安裝）。
     */
    isEnvInstallActive: function() {
        return !!(window.CocoyaUI._envInstall && window.CocoyaUI._envInstall.active);
    },

    /**
     * 顯示環境設定視窗（Python 路徑 + 套件檢查 + 安裝進度）
     */
    showDiagnoseModal: function() {
        const modal = document.getElementById('diagnose-modal');
        if (modal) modal.style.display = 'flex';

        this._bindDiagnoseControls();

        const state = this._envState();
        if (state.active) {
            // 逃逸路徑 E1 的守門：安裝中重開 modal 不重跑檢查。
            // 重跑會把清單重置為「正在檢查…」，且舊結果（必然尚未反映安裝中的套件）
            // 會覆蓋畫面 → 看起來像沒在安裝。改以持久狀態 + 上次快照直接重繪。
            this.updatePythonPathDisplay(this._envSnapshot().pythonPath);
            this._renderModuleList();
            this._renderInstallLog();
            this._updateProgressBar();
            this._startElapsedTick();
        } else {
            const list = document.getElementById('module-list');
            if (list) list.innerHTML = `<li>${this._envT('DIAG_CHECKING', 'Checking...')}</li>`;
            const loadingPara = document.querySelector('#diagnose-body .diag-loading-text');
            if (loadingPara) loadingPara.style.display = '';
            // 路徑列：向 Bridge 取得目前 pythonPath（Tauri: localStorage / VSIX: host globalState）
            // 檢查統一由此處發起，呼叫端不需再送一次
            if (window.CocoyaBridge) {
                window.CocoyaBridge.send('getPythonPath');
                window.CocoyaBridge.send('checkEnvironment');
            }
        }
        this._updateDiagnoseLock();
    },

    /**
     * 關閉環境設定視窗。
     *
     * 安裝中禁止關閉（使用者決策）：環境沒裝好、進去也做不了事，
     * 反而會因分心而忽略正在安裝的重要環境。
     * 唯一逃生口是「中止安裝」——這是「禁止關閉」不致變成牢籠的關鍵配套。
     */
    closeDiagnoseModal: function() {
        if (this.isEnvInstallActive()) {
            // 理論上按鈕已 disabled，此為防禦性守門（含 Esc／程式化呼叫）
            return;
        }
        const modal = document.getElementById('diagnose-modal');
        if (modal) modal.style.display = 'none';
        try { localStorage.setItem('cocoya_env_setup_done', 'true'); } catch (e) { /* 隱私模式等情境忽略 */ }
    },

    /**
     * 綁定環境設定視窗的按鈕（每次開啟重綁，避免重複 listener）
     */
    _bindDiagnoseControls: function() {
        const self = this;

        const selectBtn = document.getElementById('btn-python-path-select');
        if (selectBtn) {
            selectBtn.onclick = () => {
                if (window.CocoyaBridge) window.CocoyaBridge.send('setPythonPath');
            };
        }

        const abortBtn = document.getElementById('btn-abort-install');
        if (abortBtn) {
            abortBtn.onclick = () => self.abortInstall();
        }

        const logBtn = document.getElementById('btn-install-log-toggle');
        if (logBtn) {
            logBtn.onclick = () => self.toggleInstallLog();
        }

        const installAllBtn = document.getElementById('btn-install-all-missing');
        if (installAllBtn) {
            installAllBtn.onclick = () => self.startInstallAll();
        }

        const recheckBtn = document.getElementById('btn-recheck-env');
        if (recheckBtn) {
            recheckBtn.onclick = () => {
                if (self.isEnvInstallActive()) return; // 安裝中重檢無意義且會誤導
                if (window.CocoyaBridge) window.CocoyaBridge.send('checkEnvironment');
            };
        }
    },

    /**
     * 更新 Python 路徑列（含「解析後的真實路徑」與有效性警示）。
     *
     * 預設值是字面字串 `python`（靠 OS PATH 查找），使用者無從得知實際解析到哪個直譯器；
     * 且 pythonValid=false 時必須明確警示——否則「找不到 Python」與「Python 正常但沒裝套件」
     * 在畫面上長得一樣（都顯示全部未安裝），使用者會去按安裝而 pip 必然也失敗（死路）。
     */
    updatePythonPathDisplay: function(pythonPath) {
        const snap = this._envSnapshot();
        if (pythonPath) snap.pythonPath = pythonPath;

        const valueEl = document.getElementById('python-path-value');
        if (valueEl) valueEl.textContent = snap.pythonPath || 'python';

        // 顯示 PATH／別名實際解析到的直譯器（exe 路徑 + 版本）
        const resolvedEl = document.getElementById('python-path-resolved');
        if (resolvedEl) {
            if (snap.pythonValid === true && snap.pythonResolvedPath) {
                resolvedEl.textContent = this._envT('DIAG_PATH_RESOLVED', 'Resolved to %1 (%2)')
                    .replace('%1', snap.pythonResolvedPath)
                    .replace('%2', snap.pythonVersion || '');
            } else {
                resolvedEl.textContent = '';
            }
        }

        const warnEl = document.getElementById('python-path-warning');
        if (warnEl) {
            if (snap.pythonValid === false) {
                warnEl.textContent = this._envT('DIAG_PATH_INVALID',
                    'No usable Python found (current setting: %1).').replace('%1', snap.pythonPath || 'python');
                warnEl.style.display = 'block';
            } else {
                warnEl.style.display = 'none';
            }
        }
    },

    /**
     * 更新環境偵測結果
     * @param {Object} results 模組安裝狀態
     */
    updateEnvironmentStatus: function(data) {
        console.log('[UI] updateEnvironmentStatus received:', data);
        const list = document.getElementById('module-list');
        if (!list || !data) {
            console.error('[UI] Cannot find diagnosis modal elements or data is empty');
            return;
        }

        // 更新快照（模組定義單一真相來源 = 後端 config/python_modules.json）
        const snap = this._envSnapshot();
        snap.results = data.results || {};
        snap.modules = data.modules || [];
        // pythonValid 未提供（舊後端）時保留 null，不誤判為無效
        snap.pythonValid = (data.pythonValid === undefined) ? null : !!data.pythonValid;
        snap.pythonResolvedPath = data.pythonResolvedPath || '';
        snap.pythonVersion = data.pythonVersion || '';

        // 安裝不在進行中時，權威檢查結果優先：
        // - done 的樂觀標記交還給 results（避免重檢後仍殘留「已安裝」假象）
        // - 已確認安裝者從 failed 移除（否則安裝成功後仍顯示 ✗ 失敗）
        // 安裝進行中則不動：此時 results 是舊資料，必須保留狀態才能正確顯示進度
        const st = this._envState();
        if (!st.active) {
            st.done = [];
            st.failed = (st.failed || []).filter(f => !snap.results[f.id]);
        }

        // 隱藏「正在偵測...」的提示段落
        const loadingPara = document.querySelector('#diagnose-body .diag-loading-text');
        if (loadingPara) loadingPara.style.display = 'none';

        this.updatePythonPathDisplay();
        this._renderModuleList();
        this.updateInstallAllButton();
        this._updateDiagnoseLock();
    },

    /** 繪製套件清單（HTML 轉義：套件名／輸出來自後端，不可直接內插） */
    _escapeHtml: function(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    /**
     * 繪製套件清單。
     *
     * 一律以「持久安裝狀態」覆蓋後端檢查結果，三個理由：
     * 1. 安裝中的套件後端檢查必然還沒反映 → 若不用狀態覆蓋，任何一次重檢
     *    都會把「⟳ 安裝中」洗成「○ 未安裝」（競態，使用者會以為失敗又按一次）。
     * 2. 本批已成功的套件先樂觀顯示 ● 已安裝，讓使用者立即看到進展；
     *    批次結束後的權威重檢會校正任何偏差。
     * 3. 失敗的套件顯示 ✗ 與 exit code，並提供「重試」，讓使用者知道卡在哪。
     */
    _renderModuleList: function() {
        const list = document.getElementById('module-list');
        if (!list) return;

        const snap = this._envSnapshot();
        const st = this._envState();
        const modules = snap.modules || [];
        if (!modules.length) return;

        const installBtnTxt = this._envT('DIAG_INSTALL_BTN', 'Install');

        list.innerHTML = '';
        modules.forEach(mod => {
            const id = mod.id;
            const isCurrent = st.active && st.current === id;
            const inQueue = st.active && st.queue.indexOf(id) !== -1;
            const failed = (st.failed || []).find(f => f.id === id);
            const locallyDone = (st.done || []).indexOf(id) !== -1;
            const installed = locallyDone || (!inQueue && !failed && !!snap.results[id]);

            let statusTxt;
            let statusCls;
            if (isCurrent) {
                statusTxt = `<span class="diag-spinner"></span>${this._envT('DIAG_INSTALLING', 'Installing...')}`;
                statusCls = 'status-installing';
            } else if (failed) {
                const code = (failed.exitCode === null || failed.exitCode === undefined) ? '?' : failed.exitCode;
                statusTxt = this._envT('DIAG_INSTALL_FAILED', '✗ Install failed (exit %1)').replace('%1', code);
                statusCls = 'status-failed';
            } else if (installed) {
                statusTxt = this._envT('DIAG_INSTALLED', '● Installed');
                statusCls = 'status-ok';
            } else {
                statusTxt = this._envT('DIAG_MISSING', '○ Missing');
                statusCls = 'status-missing';
            }

            // 目前套件的 pip 最後一行輸出：不必展開詳細輸出就知道「有在動」
            const lastLine = (isCurrent && st.lastLine[id]) ? st.lastLine[id] : '';

            let btnHtml = '';
            if (!installed && !isCurrent && !inQueue) {
                if (st.active) {
                    // 安裝中（含批次）：全面停用，避免並行 pip 互鎖
                    btnHtml = `<button class="btn-install" disabled>${installBtnTxt}</button>`;
                } else {
                    const label = failed ? this._envT('DIAG_RETRY', 'Retry') : installBtnTxt;
                    btnHtml = `<button class="btn-install" data-install-id="${this._escapeHtml(id)}">${label}</button>`;
                }
            }

            const li = document.createElement('li');
            li.className = 'module-item';
            li.innerHTML = `
                <div class="module-item-main">
                    <span style="font-size: 14px;">${this._escapeHtml(mod.name)}</span>
                    ${lastLine ? `<div class="module-lastline">${this._escapeHtml(lastLine)}</div>` : ''}
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="module-status ${statusCls}">${statusTxt}</span>
                    ${btnHtml}
                </div>
            `;
            list.appendChild(li);
        });

        // 事件委派綁定安裝／重試。用 data 屬性而非 inline onclick：
        // 套件名可能含引號（如 Pillow (Image)），inline 字串會爆掉
        list.querySelectorAll('button[data-install-id]').forEach(btn => {
            btn.onclick = () => this.startModuleInstall(btn.getAttribute('data-install-id'));
        });
    },

    /**
     * 開始安裝單一套件（列上的「安裝」／「重試」按鈕）。
     */
    startModuleInstall: function(moduleId) {
        if (this.isEnvInstallActive()) return; // 防連點
        const snap = this._envSnapshot();
        if (snap.pythonValid === false) {
            // 路徑無效時 pip 必然失敗，直接擋下並提示，避免使用者掉進必敗迴圈
            if (window.CocoyaBridge && window.CocoyaBridge.alert) {
                window.CocoyaBridge.alert(this._envT('DIAG_INSTALL_NO_PYTHON',
                    'Please set a valid Python path before installing packages.'));
            }
            return;
        }

        const mod = (snap.modules || []).find(m => m.id === moduleId);
        const meta = {};
        meta[moduleId] = {
            pipPackage: (mod && mod.pipPackage) || moduleId,
            display: (mod && mod.name) || moduleId
        };
        this._beginInstallQueue([moduleId], meta);
    },

    /**
     * 一鍵安裝所有缺少的套件（序列執行，非並行）。
     * 序列的理由：並行 pip 會互相鎖檔，且輸出交錯會讓「卡在哪個套件」無法判讀。
     */
    startInstallAll: function() {
        if (this.isEnvInstallActive()) return;
        const snap = this._envSnapshot();
        if (snap.pythonValid === false) {
            if (window.CocoyaBridge && window.CocoyaBridge.alert) {
                window.CocoyaBridge.alert(this._envT('DIAG_INSTALL_NO_PYTHON',
                    'Please set a valid Python path before installing packages.'));
            }
            return;
        }

        const st = this._envState();
        const missing = (snap.modules || []).filter(m => {
            const inQueue = st.queue.indexOf(m.id) !== -1;
            const locallyDone = (st.done || []).indexOf(m.id) !== -1;
            return !snap.results[m.id] && !inQueue && !locallyDone;
        });
        if (!missing.length) return;

        // 確認框列出清單與總數（大套件耗時長，先讓使用者知情再開始）
        const names = missing.map(m => '• ' + m.name).join('\n');
        const msg = this._envT('DIAG_INSTALL_ALL_CONFIRM',
            'Will install %1 missing package(s):\n%2\n\nStart now?')
            .replace('%1', missing.length)
            .replace('%2', names);

        const start = () => {
            const meta = {};
            missing.forEach(m => {
                meta[m.id] = { pipPackage: m.pipPackage || m.id, display: m.name };
            });
            this._beginInstallQueue(missing.map(m => m.id), meta);
        };

        if (window.CocoyaBridge && window.CocoyaBridge.confirm) {
            window.CocoyaBridge.confirm(msg).then(ok => { if (ok) start(); });
        } else {
            start();
        }
    },

    /**
     * 啟動一批安裝佇列。
     * @param {string[]} ids 依序安裝的 moduleId
     * @param {Object} meta moduleId → {pipPackage, display}
     */
    _beginInstallQueue: function(ids, meta) {
        const st = this._envState();
        st.active = true;
        st.aborting = false;
        st.queue = ids.slice();
        st.current = null;
        st.total = ids.length;
        st.done = [];
        st.failed = [];
        st.lastLine = {};
        st.logLines = [];
        st.meta = meta || {};
        st.startedAt = Date.now();
        st.lastOutputAt = Date.now();

        this._renderInstallLog();
        this._updateDiagnoseLock();
        this._startElapsedTick();
        this._installNext();
    },

    /**
     * 安裝佇列中的下一套件；佇列空 → 收尾。
     */
    _installNext: function() {
        const st = this._envState();
        if (!st.active) return;

        if (!st.queue.length) {
            this._finishInstallBatch();
            return;
        }

        const id = st.queue[0];
        st.current = id;
        st.lastOutputAt = Date.now();
        if (st.lastLine[id] === undefined) st.lastLine[id] = '';

        const meta = st.meta[id] || { pipPackage: id, display: id };
        this._renderModuleList();
        this._updateProgressBar();

        if (window.CocoyaBridge) {
            window.CocoyaBridge.send('installModule', {
                module: id,
                pipPackage: meta.pipPackage,
                moduleDisplay: meta.display
            });
        }
    },

    /**
     * 安裝完成事件（後端真實結束訊號，取代舊版「猜 5 秒」）。
     * @param {Object} payload {moduleId, success, exitCode, aborted, errorCode}
     */
    onInstallDone: function(payload) {
        const st = this._envState();
        const data = payload || {};

        // 中止：中止時 moduleId 為 null，以 aborted 旗標為準
        if (data.aborted) {
            st.active = false;
            st.aborting = false;
            st.current = null;
            st.queue = [];
            this._stopElapsedTick();
            this._updateDiagnoseLock();
            this._updateProgressBar();
            // 中止後環境狀態未知（pip 非原子操作，可能有部分檔案落地）
            // → 強制重檢，不假設結果
            if (window.CocoyaBridge) window.CocoyaBridge.send('checkEnvironment');
            return;
        }

        if (!st.active) return; // 非本批的事件（殘留）
        const id = data.moduleId;
        if (!id) return;

        const meta = st.meta[id] || { display: id };
        if (data.success && !data.errorCode) {
            st.done.push(id);
        } else if (!(st.failed || []).some(f => f.id === id)) {
            st.failed.push({
                id: id,
                display: meta.display,
                exitCode: (data.exitCode === undefined) ? null : data.exitCode
            });
        }

        st.queue = st.queue.filter(q => q !== id);
        if (st.current === id) st.current = null;

        this._renderModuleList();
        this._updateProgressBar();
        // 失敗不停整批：一次暴露所有問題，避免使用者反覆手動重試 N 次
        this._installNext();
    },

    /**
     * 一批安裝的收尾：權威重檢 + 失敗總結。
     */
    _finishInstallBatch: function() {
        const st = this._envState();
        const successCount = st.done.length;
        const failedList = st.failed.slice();

        st.active = false;
        st.current = null;
        st.queue = [];
        this._stopElapsedTick();
        this._updateDiagnoseLock();
        this._updateProgressBar();

        // 權威重檢一次：以真實環境狀態校正樂觀顯示。
        // 只在整批結束後檢一次（而非每個套件各檢一次），一次往返即可暴露整批問題
        if (window.CocoyaBridge) window.CocoyaBridge.send('checkEnvironment');

        if (failedList.length) {
            const summaryTxt = this._envT('DIAG_SUMMARY', 'Install finished: %1 succeeded, %2 failed')
                .replace('%1', successCount)
                .replace('%2', failedList.length);
            console.log('[UI] ' + summaryTxt);
            if (window.CocoyaBridge && window.CocoyaBridge.alert) {
                const failNames = failedList.map(f => '• ' + (f.display || f.id)).join('\n');
                window.CocoyaBridge.alert(summaryTxt + '\n' + failNames);
            }
        }
    },

    /**
     * 中止安裝（終止子進程）。
     *
     * 精準用詞：這是「中止安裝」，**不是**「卸載」（移除已安裝的套件）。
     * pip 安裝非原子操作，中止不會 rollback；已下載的 wheel 留在 pip 快取
     * （無害，重新安裝時會重用）。
     */
    abortInstall: function() {
        const st = this._envState();
        if (!st.active || st.aborting) return;
        st.aborting = true;

        const progressText = document.getElementById('install-progress-text');
        if (progressText) progressText.textContent = this._envT('DIAG_PROGRESS_ABORTING', 'Stopping install...');
        this._updateDiagnoseLock();

        if (window.CocoyaBridge) window.CocoyaBridge.send('abortInstall');
    },

    /**
     * 接收 pip 輸出（由後端 installModuleLog 事件驅動）。
     * 同時更新 lastOutputAt，供純前端停滯偵測使用（零後端成本）。
     */
    appendInstallLog: function(payload) {
        const data = payload || {};
        const text = data.text;
        if (typeof text !== 'string' || text === '') return;

        const st = this._envState();
        if (!st.active) return;

        st.lastOutputAt = Date.now();

        st.logLines.push({
            moduleId: data.moduleId || st.current,
            text: text,
            stream: data.stream || 'out'
        });
        // 上限保護：tensorflow 可吐數百行，避免無限成長
        if (st.logLines.length > 2000) st.logLines.splice(0, st.logLines.length - 2000);

        // 該套件最後一行「非空」輸出 → 該列摘要與進度橫幅
        const modId = data.moduleId || st.current;
        if (modId) {
            const lines = text.split('\n');
            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i].trim();
                if (line) { st.lastLine[modId] = line; break; }
            }
        }

        this._renderInstallLog();
        this._renderLastLineOnly(modId);
        this._updateProgressBar();
    },

    /**
     * 只更新「目前套件」那一列的最後一行摘要。
     * 不整表重繪的理由：pip 輸出密集，整表重繪會讓清單閃爍、scroll 位置跳動。
     */
    _renderLastLineOnly: function(moduleId) {
        const st = this._envState();
        if (!moduleId || st.current !== moduleId) return;

        const list = document.getElementById('module-list');
        if (!list) return;
        const rows = list.querySelectorAll('li.module-item');
        const snap = this._envSnapshot();
        const idx = (snap.modules || []).findIndex(m => m.id === moduleId);
        if (idx < 0 || !rows[idx]) return;

        const main = rows[idx].querySelector('.module-item-main');
        if (!main) return;
        let el = main.querySelector('.module-lastline');
        if (!el) {
            el = document.createElement('div');
            el.className = 'module-lastline';
            main.appendChild(el);
        }
        el.textContent = st.lastLine[moduleId] || '';
    },

    /** 繪製詳細安裝輸出區（收合時不渲染內容，避免無謂重排） */
    _renderInstallLog: function() {
        const wrap = document.getElementById('diagnose-install-log-wrap');
        const pre = document.getElementById('diagnose-install-log');
        if (!wrap || !pre) return;

        const st = this._envState();
        st.logExpanded = !!st.logExpanded;
        pre.style.display = st.logExpanded ? 'block' : 'none';

        if (!st.logLines.length) {
            wrap.style.display = 'none';
            return;
        }
        wrap.style.display = 'block';

        if (!st.logExpanded) return; // 收合時不更新，展開時一次性渲染

        pre.innerHTML = st.logLines.map(entry => {
            const text = this._escapeHtml(entry.text);
            return entry.stream === 'err'
                ? `<span class="log-err">${text}</span>`
                : `<span>${text}</span>`;
        }).join('');
        pre.scrollTop = pre.scrollHeight;
    },

    /** 展開／收合詳細安裝輸出 */
    toggleInstallLog: function() {
        const st = this._envState();
        st.logExpanded = !st.logExpanded;

        const btn = document.getElementById('btn-install-log-toggle');
        if (btn) {
            btn.textContent = st.logExpanded
                ? this._envT('DIAG_INSTALL_LOG_HIDE', '▾ Hide detailed install output')
                : this._envT('DIAG_INSTALL_LOG_SHOW', '▸ Show detailed install output');
        }
        this._renderInstallLog();
    },

    /** 更新「一鍵安裝缺少的套件 (n)」文案與可用性 */
    updateInstallAllButton: function() {
        const btn = document.getElementById('btn-install-all-missing');
        if (!btn) return;
        const snap = this._envSnapshot();
        const st = this._envState();

        const missingCount = (snap.modules || []).filter(m => {
            const inQueue = st.queue.indexOf(m.id) !== -1;
            const locallyDone = (st.done || []).indexOf(m.id) !== -1;
            return !snap.results[m.id] && !inQueue && !locallyDone;
        }).length;

        btn.textContent = this._envT('DIAG_INSTALL_ALL', 'Install all missing (%1)')
            .replace('%1', missingCount);
        // 路徑無效時停用：否則使用者會掉進「按了必然失敗」的迴圈
        btn.disabled = (missingCount === 0) || st.active || snap.pythonValid === false;
    },

    /**
     * 更新環境設定視窗的鎖定狀態。
     *
     * 鎖定範圍 =「安裝進行中」，**不是**「環境未完成」。
     * 這點至關重要：若以「環境未完成」為鎖定條件，路徑設錯的使用者會被永久鎖在
     * modal 內無法逃脫。鎖定只掛在進行中的安裝上，才是可解除的。
     *
     * 唯一的逃生口是「中止安裝」（永不因安裝而 disable）——這正是
     * 「安裝中禁止關閉」不致變成牢籠的關鍵配套。
     */
    _updateDiagnoseLock: function() {
        const st = this._envState();
        const locked = st.active;

        // 關閉鈕：安裝中禁止關閉，文案改為「安裝中，請稍候」
        const closeBtn = document.getElementById('btn-diag-close');
        if (closeBtn) {
            closeBtn.disabled = locked;
            closeBtn.textContent = locked
                ? this._envT('DIAG_CLOSE_LOCKED', 'Installing, please wait')
                : this._envT('MSG_CLOSE', 'Close');
        }

        // 路徑選擇：裝到一半換路徑只會混淆（pip 進程已綁定舊路徑）
        const selectBtn = document.getElementById('btn-python-path-select');
        if (selectBtn) selectBtn.disabled = locked;

        // 清單內安裝／重試按鈕（_renderModuleList 已依 active 決定，此處補保險）
        const list = document.getElementById('module-list');
        if (list && locked) {
            list.querySelectorAll('button.btn-install').forEach(b => { b.disabled = true; });
        }

        // 「重新檢查」在安裝中無意義且會誤導
        const recheckBtn = document.getElementById('btn-recheck-env');
        if (recheckBtn) recheckBtn.disabled = locked;

        this.updateInstallAllButton();

        // 中止鈕：安裝中可見；送出中止請求後 disable（避免重複送出）
        const abortBtn = document.getElementById('btn-abort-install');
        if (abortBtn) abortBtn.disabled = !locked || st.aborting;
    },

    /**
     * 啟動每秒 tick：更新耗時顯示 + 停滯偵測。
     *
     * 停滯偵測為純前端：後端只在子進程「結束」時發 install-module-done，
     * 真 hang 住時永遠收不到事件。以「無輸出時間」而非「卡住」措辭分級，
     * 避免誤判——tensorflow 編譯期或大檔下載本來就可能長時間無輸出。
     */
    _startElapsedTick: function() {
        this._stopElapsedTick();
        const self = this;
        window.CocoyaUI._envInstallTimer = setInterval(() => {
            const st = self._envState();
            if (!st.active) { self._stopElapsedTick(); return; }
            self._updateProgressBar();
        }, 1000);
    },

    /** 停止每秒 tick */
    _stopElapsedTick: function() {
        if (window.CocoyaUI._envInstallTimer) {
            clearInterval(window.CocoyaUI._envInstallTimer);
            window.CocoyaUI._envInstallTimer = null;
        }
    },

    /**
     * 更新安裝進度橫幅：n/m、目前套件、耗時、最後一行輸出、停滯警示。
     */
    _updateProgressBar: function() {
        const bar = document.getElementById('install-progress-bar');
        const textEl = document.getElementById('install-progress-text');
        if (!bar || !textEl) return;

        const st = this._envState();
        if (!st.active) {
            bar.style.display = 'none';
            bar.classList.remove('stalled');
            return;
        }

        bar.style.display = 'flex';

        if (st.aborting) {
            textEl.textContent = this._envT('DIAG_PROGRESS_ABORTING', 'Stopping install...');
            return;
        }

        // n = 已完成數 + 1（目前正在裝的這一個）
        const finished = st.done.length + st.failed.length;
        const n = Math.min(finished + 1, st.total);
        const elapsed = Math.max(0, Math.round((Date.now() - (st.startedAt || Date.now())) / 1000));
        const meta = st.current ? (st.meta[st.current] || {}) : {};

        let txt = this._envT('DIAG_PROGRESS_BAR', 'Installing %1/%2: %3 (%4s elapsed)')
            .replace('%1', n)
            .replace('%2', st.total)
            .replace('%3', meta.display || st.current || '')
            .replace('%4', elapsed);

        // 停滯分級：90 秒無輸出 → 提示（說明性措辭，不武斷說「卡住」）
        const silentFor = Math.round((Date.now() - (st.lastOutputAt || Date.now())) / 1000);
        if (silentFor >= 90) {
            bar.classList.add('stalled');
            txt += ' ' + this._envT('DIAG_INSTALL_STALLED', 'No new output for %1s.')
                .replace('%1', silentFor);
        } else {
            bar.classList.remove('stalled');
        }

        // 附上最後一行輸出，讓使用者立即看到進展
        const lastLine = st.current ? st.lastLine[st.current] : '';
        textEl.textContent = txt + (lastLine ? '　' + lastLine : '');
    }
});
