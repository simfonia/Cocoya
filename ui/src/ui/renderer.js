/**
 * Cocoya UI Renderer 模組
 * 負責 Python 程式碼預覽、積木同步高亮與預覽面板佈局
 */
window.CocoyaUI = Object.assign(window.CocoyaUI || {}, {
    /** @type {Map<string, {start: number, end: number}>} 積木 ID 到程式碼行範圍的映射表 */
    blockToRangeMap: new Map(),

    /** @type {HTMLElement[]} 儲存所有代碼行 DOM 以便快速存取 */
    lineDoms: [],

    /**
     * 更新 Python 代碼預覽區域
     * @param {string} rawCode Blockly 產出的原始碼 (包含隱藏的 ID 標記)
     */
    renderPythonPreview: function(rawCode) {
        const codeContent = document.getElementById('codeContent');
        const indentSize = (typeof Blockly !== 'undefined' && Blockly.Python) ? 
            Blockly.Python.INDENT.length : 4;

        if (!codeContent) return;

        // 使用原始換行分割，確保 1:1 行號
        let lines = rawCode.split('\n');
        
        // 如果最後一行是空字串（因為 split '\n' 的特性），則移除它
        if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

        codeContent.innerHTML = '';
        this.blockToRangeMap.clear();
        this.lineDoms = [];

        lines.forEach((line, index) => {
            // 解析並提取 ID 資訊
            const result = window.CocoyaUtils.extractIds(line);
            const { cleanLine, ids, starts, ends } = result;

            // 建立行容器
            const lineDiv = document.createElement('div');
            lineDiv.className = 'code-line';
            lineDiv.setAttribute('data-line-index', index);
            this.lineDoms.push(lineDiv);
            
            // 處理代碼渲染與縮排輔助線
            if (cleanLine.length > 0) {
                const leadingSpaceMatch = cleanLine.match(/^(\s+)/);
                const leadingSpaces = leadingSpaceMatch ? leadingSpaceMatch[1].length : 0;
                const actualCode = cleanLine.substring(leadingSpaces);
                
                let guideHtml = '';
                const spaces = '&nbsp;'.repeat(indentSize);
                for (let i = 0; i < leadingSpaces; i += indentSize) {
                    guideHtml += `<span class="indent-guide" style="width: ${indentSize}ch;">${spaces}</span>`;
                }

                const highlighted = hljs.highlight(actualCode, { language: 'python' }).value;
                lineDiv.innerHTML = guideHtml + highlighted;
            } else {
                lineDiv.innerHTML = '&nbsp;'; 
            }

            // 更新範圍映射表
            // 1. 處理單行 ID (運算式或單行陳述句)
            ids.forEach(id => {
                if (!this.blockToRangeMap.has(id)) {
                    this.blockToRangeMap.set(id, { start: index, end: index });
                } else {
                    // 如果已存在 (可能是一行有多個 ID)，更新結束點
                    this.blockToRangeMap.get(id).end = index;
                }
            });

            // 2. 處理範圍開始
            starts.forEach(id => {
                if (!this.blockToRangeMap.has(id)) {
                    this.blockToRangeMap.set(id, { start: index, end: index });
                } else {
                    // 如果已存在 (可能是一行有多個 ID)，更新結束點
                    this.blockToRangeMap.get(id).start = index;
                }
            });

            // 3. 處理範圍結束
            ends.forEach(id => {
                if (this.blockToRangeMap.has(id)) {
                    this.blockToRangeMap.get(id).end = index;
                } else {
                    // 異常情況：沒看到開始先看到結束，則視為單行
                    this.blockToRangeMap.set(id, { start: index, end: index });
                }
            });

            codeContent.appendChild(lineDiv);
        });

        // 同步目前的選取狀態
        const selectedId = (typeof Blockly !== 'undefined' && Blockly.getSelected()) ? Blockly.getSelected().id : null;
        if (selectedId) this.syncSelection(selectedId);
    },

    /**
     * 高亮並捲動到指定積木對應的代碼範圍
     * @param {string} blockId 積木 ID
     */
    syncSelection: function(blockId) {
        document.querySelectorAll('.highlight-line').forEach(el => el.classList.remove('highlight-line'));
        
        const infoBar = document.getElementById('block-type-info');
        if (!blockId) {
            if (infoBar) infoBar.style.display = 'none';
            return;
        }

        // 顯示積木 type ID
        const block = Blockly.getMainWorkspace().getBlockById(blockId);
        if (block && infoBar) {
            infoBar.textContent = 'Type: ' + block.type;
            infoBar.style.display = 'block';
        } else if (infoBar) {
            infoBar.style.display = 'none';
        }

        const range = this.blockToRangeMap.get(blockId);
        if (range && this.lineDoms.length > 0) {
            // 高亮範圍內的所有行
            for (let i = range.start; i <= range.end; i++) {
                if (this.lineDoms[i]) this.lineDoms[i].classList.add('highlight-line');
            }

            // 捲動到起始行
            const startLine = this.lineDoms[range.start];
            if (startLine) {
                startLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    },

    /**
     * 切換代碼預覽面板顯示狀態
     * @param {boolean|null} force 強制狀態 (true=開, false=關)
     */
    toggleCodeArea: function(force) {
        const panel = document.getElementById('codeArea');
        const toggle = document.getElementById('code-toggle');
        if (!panel) return;

        const isCollapsed = panel.classList.contains('collapsed');
        const targetState = (force !== undefined && force !== null) ? !force : !isCollapsed;

        if (targetState) {
            panel.classList.add('collapsed');
        } else {
            panel.classList.remove('collapsed');
        }

        // 更新箭頭方向
        if (toggle) {
            const arrow = toggle.querySelector('.arrow');
            if (arrow) arrow.textContent = panel.classList.contains('collapsed') ? '◀' : '▶';
        }

        // 觸發畫布調整
        setTimeout(() => {
            if (window.Blockly) Blockly.svgResize(Blockly.getMainWorkspace());
            window.dispatchEvent(new Event('resize'));
        }, 310);
    },

    /**
     * 初始化介面佈局邏輯 (縮放與收合)
     */
    initLayout: function() {
        const self = this;
        const resizer = document.getElementById('panel-resizer');
        const panel = document.getElementById('codeArea');
        const toggle = document.getElementById('code-toggle');

        let isResizing = false;
        let startX, startWidth;
        let rafId = null;

        // --- 1. 面板縮放 ---
        if (resizer && panel) {
            resizer.onmousedown = (e) => {
                if (panel.classList.contains('collapsed')) return;
                
                isResizing = true;
                startX = e.clientX;
                startWidth = panel.offsetWidth;
                document.body.classList.add('resizing-panel');
                resizer.classList.add('is-dragging');
            };

            window.addEventListener('mousemove', (e) => {
                if (!isResizing) return;
                
                if (rafId) cancelAnimationFrame(rafId);
                
                rafId = requestAnimationFrame(() => {
                    const width = startWidth + (startX - e.clientX);
                    if (width > 100 && width < window.innerWidth - 300) {
                        panel.style.width = `${width}px`;
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
                document.body.classList.remove('resizing-panel');
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

        // --- 2. 面板收合 ---
        if (toggle) {
            toggle.onclick = () => self.toggleCodeArea();
        }
        
        // 綁定收合按鈕 (內部的 X 按鈕)
        const codeCloseBtn = document.getElementById('btn-close-code');
        if (codeCloseBtn) {
            codeCloseBtn.onclick = () => self.toggleCodeArea(false);
        }
    }
});
