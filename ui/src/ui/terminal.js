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
        const terminalCloseBtn = document.getElementById('btn-close-terminal');
        const terminalClearBtn = document.getElementById('btn-clear-terminal');
        const terminalPauseBtn = document.getElementById('btn-pause-terminal');

        // （原 btn-terminal 開/關終端機綁定已移除：toolbar 改為「序列監看」按鈕，
        //  終端機展開/收合由下方三角箭頭 terminal-toggle 負責）

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

        // 複製全部文字到剪貼簿
        const copyBtn = document.getElementById('btn-copy-terminal');
        if (copyBtn) {
            copyBtn.onclick = () => {
                const content = document.getElementById('terminalContent');
                if (!content) return;
                navigator.clipboard.writeText(content.textContent).then(() => {
                    if (this.flashButton) this.flashButton('btn-copy-terminal', '#c8e6c9');
                });
            };
        }

        // 字體大小切換（終端機）與（程式碼預覽）——共用機制、各自記憶
        this.setupFontSizeCycler('btn-fontsize-terminal', 'terminalContent', [12, 14, 16, 18], 'cocoya_terminal_fontsize');
        this.setupFontSizeCycler('btn-fontsize-code', 'codeContent', [13, 15, 17], 'cocoya_code_fontsize');

        // 三角形收合把手
        const toggleHandle = document.getElementById('terminal-toggle');
        if (toggleHandle) {
            toggleHandle.onclick = () => this.toggleTerminal();
        }

        // 高度拖曳調整（對齊 #panel-resizer 風格）
        const resizer = document.getElementById('terminal-resizer');
        const panel = document.getElementById('terminalArea');
        if (resizer && panel) {
            let isResizing = false;
            let startY = 0, startHeight = 0;
            let rafId = null;

            resizer.onmousedown = (e) => {
                // 點擊收合把手時不啟動拖曳
                if (e.target.closest && e.target.closest('#terminal-toggle')) return;
                if (panel.classList.contains('collapsed')) return;
                isResizing = true;
                startY = e.clientY;
                startHeight = panel.offsetHeight;
                document.body.classList.add('resizing-terminal');
                resizer.classList.add('is-dragging');
            };

            window.addEventListener('mousemove', (e) => {
                if (!isResizing) return;
                if (rafId) cancelAnimationFrame(rafId);
                rafId = requestAnimationFrame(() => {
                    // 向上拖 = 變高
                    const h = startHeight + (startY - e.clientY);
                    if (h > 100 && h < window.innerHeight - 200) {
                        panel.style.height = `${h}px`;
                        this.syncTerminalToggle();
                        if (window.Blockly) {
                            const ws = Blockly.getMainWorkspace();
                            if (ws) Blockly.svgResize(ws);
                        }
                    }
                });
            });

            window.addEventListener('mouseup', () => {
                if (!isResizing) return;
                isResizing = false;
                document.body.classList.remove('resizing-terminal');
                resizer.classList.remove('is-dragging');
                if (rafId) cancelAnimationFrame(rafId);
                setTimeout(() => {
                    if (window.Blockly) {
                        const ws = Blockly.getMainWorkspace();
                        if (ws) Blockly.svgResize(ws);
                    }
                    window.dispatchEvent(new Event('resize'));
                }, 50);
            });
        }

        // 視窗縮放時同步把手位置
        window.addEventListener('resize', () => this.syncTerminalToggle());

        // 初始同步
        this.syncTerminalToggle();
    };

    /**
     * 字體大小循環切換（共用機制，各面板獨立記憶）
     * @param {string} btnId 按鈕 id
     * @param {string} targetId 套用字體大小的目標元素 id
     * @param {number[]} sizes 循環的大小序列 (px)
     * @param {string} storageKey localStorage 儲存 key
     */
    UI.setupFontSizeCycler = function(btnId, targetId, sizes, storageKey) {
        const btn = document.getElementById(btnId);
        const target = document.getElementById(targetId);
        if (!btn || !target) return;

        let idx = sizes.indexOf(parseInt(localStorage.getItem(storageKey), 10));
        if (idx < 0) idx = 0;

        const apply = () => {
            target.style.fontSize = `${sizes[idx]}px`;
            localStorage.setItem(storageKey, String(sizes[idx]));
        };
        apply();

        btn.onclick = () => {
            idx = (idx + 1) % sizes.length;
            apply();
        };
    };

    /**
     * 同步終端機收合把手箭頭方向
     * 把手位於 #terminal-resizer 內（面板上緣水平置中），位置由 CSS 錨定，無需 JS 同步
     * 箭頭語意：收合時顯示 ▲，展開時顯示 ▼
     */
    UI.syncTerminalToggle = function() {
        const toggle = document.getElementById('terminal-toggle');
        const panel = document.getElementById('terminalArea');
        if (!toggle || !panel) return;
        const arrow = toggle.querySelector('.arrow');
        if (arrow) arrow.textContent = panel.classList.contains('collapsed') ? '▲' : '▼';
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

        // 同步收合把手位置與箭頭方向
        this.syncTerminalToggle();

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
    UI.appendTerminal = function(text, type = 'out', inline = false) {
        const content = document.getElementById('terminalContent');
        if (!content) return;

        // --- 優化：只要有訊息就自動展開 (除非面板已收合且非錯誤訊息) ---
        if (document.getElementById('terminalArea').classList.contains('collapsed')) {
            this.toggleTerminal(true);
        }

        const lastChild = content.lastElementChild;
        // inline 模式：同一行水平附加（不做換行），需在一般合併規則前判斷
        if (lastChild && lastChild.className === `term-${type}` && inline && !lastChild.textContent.endsWith('\n')) {
            lastChild.textContent += text;
        } else if (lastChild && lastChild.className === `term-${type}` && !lastChild.textContent.endsWith('\n')) {
            // 如果最後一行存在，且類型相同，且不以換行符結尾，則先插入換行再附加文字
            lastChild.textContent += '\n' + text;
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
