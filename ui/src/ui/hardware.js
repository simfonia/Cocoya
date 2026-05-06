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
