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

    /** @type {Array<{text: string, type: 'out'|'err'|'info'|'success', inline: boolean}>} 批次緩衝隊列 */
    UI._terminalQueue = [];
    /** @type {number|null} requestAnimationFrame 或 setTimeout handle */
    UI._terminalRafId = null;
    /** @type {number} 前端丟棄的普通日誌筆數 */
    UI._terminalDroppedCount = 0;
    /** @type {number} 隊列最大長度（超過時丟棄普通 out 訊息保護 WebView） */
    const MAX_TERMINAL_QUEUE_SIZE = 600;
    /** @type {number} 單個 span 節點最大字元數保護，超過時建立新節點避免 DOM 渲染卡死 */
    const MAX_SPAN_TEXT_LEN = 20000;

    /**
     * 立即將隊列中的日誌 flush 到終端機 DOM
     */
    UI.flushTerminal = function() {
        if (this._terminalRafId) {
            if (typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(this._terminalRafId);
            } else {
                clearTimeout(this._terminalRafId);
            }
            this._terminalRafId = null;
        }

        const items = this._terminalQueue;
        this._terminalQueue = [];
        const dropped = this._terminalDroppedCount;
        this._terminalDroppedCount = 0;

        if (items.length === 0 && dropped === 0) return;

        const content = document.getElementById('terminalContent');
        if (!content) return;

        // 若收合則自動展開（單次 flush 最多檢查一次）
        const panel = document.getElementById('terminalArea');
        if (panel && panel.classList.contains('collapsed')) {
            this.toggleTerminal(true);
        }

        // 若有被丟棄的訊息，注入一筆 info 警告
        if (dropped > 0) {
            items.unshift({
                text: `\n[Cocoya Warning: 介面渲染保護，已略過 ${dropped} 筆高頻日誌]\n`,
                type: 'info',
                inline: false
            });
        }

        const fragment = document.createDocumentFragment();
        // 追蹤當前最後一個節點（先從 content 取，若建立新節點則指向 fragment 內的最後一個）
        let curLast = content.lastElementChild;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const text = item.text;
            const type = item.type || 'out';
            const inline = !!item.inline;

            const isSameType = curLast && curLast.className === `term-${type}`;
            const isNotTooLong = curLast && (curLast.textContent.length + text.length <= MAX_SPAN_TEXT_LEN);

            if (isSameType && inline && !curLast.textContent.endsWith('\n') && isNotTooLong) {
                curLast.textContent += text;
            } else if (isSameType && !curLast.textContent.endsWith('\n') && isNotTooLong) {
                curLast.textContent += '\n' + text;
            } else {
                const span = document.createElement('span');
                span.className = `term-${type}`;
                span.textContent = text;
                fragment.appendChild(span);
                curLast = span;
            }
        }

        if (fragment.childNodes.length > 0) {
            content.appendChild(fragment);
        }

        // 行數限制保護 (保留最多 1000 行)
        const excess = content.children.length - 1000;
        if (excess > 0) {
            for (let k = 0; k < excess; k++) {
                if (content.firstChild) content.removeChild(content.firstChild);
            }
        }

        // 自動捲動到底部（單次 flush 僅計算一次 scrollHeight）
        if (this.isTerminalAutoScroll) {
            content.scrollTop = content.scrollHeight;
        }
    };

    /**
     * 排程 flush 終端機隊列
     */
    UI._scheduleTerminalFlush = function() {
        if (this._terminalRafId) return;
        const scheduleFn = (typeof requestAnimationFrame === 'function')
            ? requestAnimationFrame
            : (cb) => setTimeout(cb, 25);
        this._terminalRafId = scheduleFn(() => {
            UI._terminalRafId = null;
            UI.flushTerminal();
        });
    };

    /**
     * 向終端機新增日誌（有界隊列＋批次渲染，解決高頻輸出時 DOM reflow 阻塞問題）
     * @param {string} text 文字內容
     * @param {'out'|'err'|'info'|'success'} type 類型 (影響顏色)
     * @param {boolean} inline 是否為行內附加
     */
    UI.appendTerminal = function(text, type = 'out', inline = false) {
        if (text === undefined || text === null) return;
        const str = String(text);

        // 背壓丟棄保護：隊列超量時僅丟棄普通 'out' 日誌，重要控制或報錯永不丟棄
        if (this._terminalQueue.length >= MAX_TERMINAL_QUEUE_SIZE) {
            if (type === 'out') {
                this._terminalDroppedCount++;
                this._scheduleTerminalFlush();
                return;
            }
        }

        this._terminalQueue.push({ text: str, type, inline });
        this._scheduleTerminalFlush();
    };

    /**
     * 批次向終端機新增日誌
     * @param {Array<{text: string, type?: 'out'|'err'|'info'|'success', inline?: boolean}>} items
     */
    UI.appendTerminalBatch = function(items) {
        if (!Array.isArray(items)) return;
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (it && it.text !== undefined && it.text !== null) {
                this.appendTerminal(it.text, it.type || 'out', !!it.inline);
            }
        }
    };

    /**
     * 清空終端機
     */
    UI.clearTerminal = function() {
        this._terminalQueue = [];
        this._terminalDroppedCount = 0;
        if (this._terminalRafId) {
            if (typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(this._terminalRafId);
            } else {
                clearTimeout(this._terminalRafId);
            }
            this._terminalRafId = null;
        }
        const content = document.getElementById('terminalContent');
        if (content) content.innerHTML = '';
    };

})(window.CocoyaUI = window.CocoyaUI || {});
