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
        if (displayText) root.setAttribute('title', displayText);
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
     * 更新環境偵測結果
     * @param {Object} results 模組安裝狀態
     */
    updateEnvironmentStatus: function(data) {
        console.log('[UI] updateEnvironmentStatus received:', data);
        const modal = document.getElementById('diagnose-modal');
        const body = document.getElementById('diagnose-body');
        const list = document.getElementById('module-list');
        
        if (!modal || !list || !data) {
            console.error('[UI] Cannot find diagnosis modal elements or data is empty');
            return;
        }

        // 隱藏「正在偵測...」的提示段落 (如果有)
        const loadingPara = body?.querySelector('p');
        if (loadingPara) loadingPara.style.display = 'none';

        // 使用後端傳來的模組定義（單一真相來源）
        const results = data.results || {};
        const modules = data.modules || [];

        list.innerHTML = '';
        modules.forEach(mod => {
            const installed = !!results[mod.id];
            const li = document.createElement('li');
            li.className = 'module-item';
            
            const statusTxt = installed ? 
                (Blockly.Msg['DIAG_INSTALLED'] || '● Installed') : 
                (Blockly.Msg['DIAG_MISSING'] || '○ Missing');
            
            const btnTxt = Blockly.Msg['DIAG_INSTALL_BTN'] || 'Install';
            
            // 使用 Bridge 發送安裝指令（傳入 pip 套件名稱 = id，而非顯示名 name）
            const installBtnHtml = !installed ? `<button class="btn-install" onclick="window.CocoyaBridge.send('installModule', {module: '${mod.id}', moduleDisplay: '${mod.name}', pipPackage: '${mod.pipPackage || mod.id}'})">${btnTxt}</button>` : '';
            
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
