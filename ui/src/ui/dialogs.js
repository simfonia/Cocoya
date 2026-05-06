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
    }
});
