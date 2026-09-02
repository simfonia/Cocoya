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
        const labelEl = root.querySelector('.serial-dropdown-label');
        const menu = root.querySelector('.serial-dropdown-menu');
        if (!trigger || !menu) return;

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
            root.setAttribute('data-value', '');
            addItem('', '(No Port)');
        } else {
            ports.forEach(p => {
                const portValue = typeof p === 'string' ? p : p.port;
                const portLabel = typeof p === 'string' ? p : p.label;
                addItem(portValue, portLabel);
            });
            // 嘗試保留上次選取（若埠仍在）
            if (currentVal && Array.from(menu.children).some(c => c.getAttribute('data-value') === currentVal)) {
                root.setAttribute('data-value', currentVal);
            }
        }

        this._bindSerialDropdown(root, trigger, labelEl, menu);
        this.setSerialPortLabel(root, labelEl);
    },

    /** 從自繪 serial 下拉讀取目前選取的埠 */
    getSerialPort: function() {
        const root = document.getElementById('serial-selector');
        if (!root) return '';
        return root.getAttribute('data-value') || '';
    },

    /** 設定 serial 下拉目前的選取值（data-value + label + active 樣式） */
    setSerialPortLabel: function(root, labelEl) {
        const currentVal = root.getAttribute('data-value') || '';
        const menu = root.querySelector('.serial-dropdown-menu');
        if (!labelEl) return;
        if (menu) {
            const active = Array.from(menu.children).find(c => c.getAttribute('data-value') === currentVal);
            Array.from(menu.children).forEach(c => c.classList.toggle('active', c === active));
            labelEl.textContent = active ? active.textContent : (currentVal || '');
        }
        if (currentVal && menu) {
            const activeEl = Array.from(menu.children).find(c => c.getAttribute('data-value') === currentVal);
            if (activeEl) root.setAttribute('title', activeEl.textContent);
        }
    },

    /** 綁定 serial 自繪下拉的開闔與點選 */
    _bindSerialDropdown: function(root, trigger, labelEl, menu) {
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
            this.setSerialPortLabel(root, labelEl);
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
            const installBtnHtml = !installed ? `<button class="btn-install" onclick="window.CocoyaBridge.send('installModule', {module: '${mod.id}', moduleDisplay: '${mod.name}'})">${btnTxt}</button>` : '';
            
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
