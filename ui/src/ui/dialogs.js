/**
 * Cocoya UI Dialogs 模組
 * 負責彈出視窗 (Modal)、快速選取 (QuickPick) 與視覺反饋 (Flash/Highlight)
 */
window.CocoyaUI = Object.assign(window.CocoyaUI || {}, {
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

    sshConfig: null,

    showSshConfigDialog: function(onConfirm, onCancel) {
        let dialog = document.getElementById('dataset-ssh-dialog');
        if (dialog) dialog.remove();

        dialog = document.createElement('div');
        dialog.id = 'dataset-ssh-dialog';
        dialog.className = 'dataset-manager-overlay';
        dialog.style.zIndex = '10001';
        dialog.style.display = 'flex';

        const current = this.sshConfig || {};
        const defaultHost = current.host || '192.168.3.8';
        const defaultPort = current.port || '22';
        const defaultUser = current.username || 'simfonia';

        const escapeHtml = (val) => {
            return String(val ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        };

        dialog.innerHTML = `
            <div class="dataset-manager-dialog" style="max-width: 400px; padding: 20px; background: white; border-radius: 8px; border: 1px solid #ddd; box-shadow: 0 4px 15px rgba(0,0,0,0.15);">
                <header class="dataset-manager-header" style="margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                    <h3 style="margin: 0; font-size: 14px; color: #9c27b0;">☁️ 連線至雲端訓練伺服器</h3>
                </header>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <label style="display: flex; flex-direction: column; gap: 4px; font-size: 12px;">
                        <span>主機 IP / Host</span>
                        <input type="text" id="ssh-host" value="${escapeHtml(defaultHost)}" placeholder="例如 192.168.3.8" style="padding: 6px; border: 1px solid #ccc; border-radius: 4px;">
                    </label>
                    <label style="display: flex; flex-direction: column; gap: 4px; font-size: 12px;">
                        <span>連接埠 / Port</span>
                        <input type="number" id="ssh-port" value="${escapeHtml(defaultPort)}" placeholder="預設 22" style="padding: 6px; border: 1px solid #ccc; border-radius: 4px;">
                    </label>
                    <label style="display: flex; flex-direction: column; gap: 4px; font-size: 12px;">
                        <span>使用者名稱 / Username</span>
                        <input type="text" id="ssh-user" value="${escapeHtml(defaultUser)}" placeholder="例如 user" style="padding: 6px; border: 1px solid #ccc; border-radius: 4px;">
                    </label>
                    <label style="display: flex; flex-direction: column; gap: 4px; font-size: 12px;">
                        <span>密碼 / Password</span>
                        <input type="password" id="ssh-pass" placeholder="輸入密碼" style="padding: 6px; border: 1px solid #ccc; border-radius: 4px;">
                    </label>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; border-top: 1px solid #eee; padding-top: 12px;">
                    <button type="button" id="ssh-dialog-cancel" class="dataset-secondary-btn" style="margin: 0; padding: 6px 12px;">取消</button>
                    <button type="button" id="ssh-dialog-confirm" class="dataset-small-btn" style="background: #9c27b0; color: white; border: none; margin: 0; padding: 6px 16px; font-weight: bold;">連線</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);

        dialog.querySelector('#ssh-dialog-cancel').onclick = () => {
            dialog.remove();
            if (onCancel) onCancel();
        };

        dialog.querySelector('#ssh-dialog-confirm').onclick = () => {
            const host = dialog.querySelector('#ssh-host').value.trim();
            const port = parseInt(dialog.querySelector('#ssh-port').value.trim(), 10) || 22;
            const username = dialog.querySelector('#ssh-user').value.trim();
            const password = dialog.querySelector('#ssh-pass').value;

            if (!host || !username || !password) {
                alert('請填寫完整的主機 IP、使用者名稱與密碼！');
                return;
            }

            this.sshConfig = { host, port, username, password };
            dialog.remove();
            if (onConfirm) onConfirm(this.sshConfig);
        };
    },

    ensureSshConfig: function(onConfirm, onCancel) {
        if (this.sshConfig && this.sshConfig.host && this.sshConfig.username && this.sshConfig.password) {
            if (onConfirm) onConfirm(this.sshConfig);
        } else {
            this.showSshConfigDialog(onConfirm, onCancel);
        }
    }
});
