/**
 * Cocoya UI Terminal Module
 * 負責處理終端機面板的顯示、日誌追加與自動捲動控制
 */
(function(UI) {
    /** @type {boolean} 終端機是否開啟自動捲動 */
    UI.isTerminalAutoScroll = true;

    /**
     * 初始化終端機相關事件監聽
     */
    UI.initTerminal = function() {
        const terminalToggleBtn = document.getElementById('btn-terminal');
        const terminalCloseBtn = document.getElementById('btn-close-terminal');
        const terminalClearBtn = document.getElementById('btn-clear-terminal');
        const terminalPauseBtn = document.getElementById('btn-pause-terminal');

        // 終端機切換按鈕
        if (terminalToggleBtn) {
            terminalToggleBtn.onclick = () => this.toggleTerminal();
        }

        // 關閉按鈕
        if (terminalCloseBtn) {
            terminalCloseBtn.onclick = () => this.toggleTerminal(false);
        }

        // 清除按鈕
        if (terminalClearBtn) {
            terminalClearBtn.onclick = () => this.clearTerminal();
        }

        // 暫停自動捲動按鈕
        if (terminalPauseBtn) {
            // 預設狀態同步
            if (this.isTerminalAutoScroll) terminalPauseBtn.classList.add('paused');
            
            terminalPauseBtn.onclick = () => {
                this.isTerminalAutoScroll = !this.isTerminalAutoScroll;
                if (this.isTerminalAutoScroll) {
                    terminalPauseBtn.classList.add('paused');
                    // 開啟時立即捲動到最新
                    const content = document.getElementById('terminalContent');
                    if (content) content.scrollTop = content.scrollHeight;
                } else {
                    terminalPauseBtn.classList.remove('paused');
                }
            };
        }
    };

    /**
     * 切換終端機面板顯示狀態
     * @param {boolean|null} force 強制狀態 (true=開, false=關)
     */
    UI.toggleTerminal = function(force) {
        const panel = document.getElementById('terminalArea');
        if (!panel) return;

        const isCollapsed = panel.classList.contains('collapsed');
        const targetState = (force !== undefined && force !== null) ? !force : !isCollapsed;

        if (targetState) {
            panel.classList.add('collapsed');
        } else {
            panel.classList.remove('collapsed');
        }

        // 觸發畫布調整
        setTimeout(() => {
            if (window.Blockly) Blockly.svgResize(Blockly.getMainWorkspace());
        }, 310);
    };

    /**
     * 向終端機新增日誌
     * @param {string} text 文字內容
     * @param {'out'|'err'|'info'|'success'} type 類型 (影響顏色)
     */
    UI.appendTerminal = function(text, type = 'out') {
        const content = document.getElementById('terminalContent');
        if (!content) return;

        // --- 優化：只要有訊息就自動展開 (除非面板已收合且非錯誤訊息) ---
        if (document.getElementById('terminalArea').classList.contains('collapsed')) {
            this.toggleTerminal(true);
        }

        const lastChild = content.lastElementChild;
        // 如果最後一行存在，且類型相同，且不以換行符結尾，則附加文字
        if (lastChild && lastChild.className === `term-${type}` && !lastChild.textContent.endsWith('\n')) {
            lastChild.textContent += text;
        } else {
            const span = document.createElement('span');
            span.className = `term-${type}`;
            span.textContent = text;
            content.appendChild(span);
        }

        // --- 優化：最大行數限制 (1000 行) ---
        if (content.children.length > 1000) {
            content.removeChild(content.firstChild);
        }

        // 自動捲動到底部 (除非已關閉自動捲動)
        if (this.isTerminalAutoScroll) {
            content.scrollTop = content.scrollHeight;
        }
    };

    /**
     * 清空終端機
     */
    UI.clearTerminal = function() {
        const content = document.getElementById('terminalContent');
        if (content) content.innerHTML = '';
    };

})(window.CocoyaUI = window.CocoyaUI || {});
