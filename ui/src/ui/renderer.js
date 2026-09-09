/**
 * Cocoya UI Renderer 模組
 * 負責 Python 程式碼預覽、積木同步高亮與預覽面板佈局
 */
window.CocoyaUI = Object.assign(window.CocoyaUI || {}, {
    /** @type {Map<string, {start: number, end: number}>} 積木 ID 到程式碼行範圍的映射表 */
    blockToRangeMap: new Map(),

    /** @type {HTMLElement[]} 儲存所有代碼行 DOM 以便快速存取 */
    lineDoms: [],

    /** @type {(string|null)[]} 行索引 (0-based) 到「可定位積木 ID」的反查表（由 code 定位回積木用） */
    lineIndexToBlockId: [],

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
        this.lineIndexToBlockId = [];

        // 確保空白點擊清除高亮的綁定已就緒（render 必然執行；有去重標記，多次呼叫無副作用）
        this.bindWorkspaceClickToClearHighlight();

        lines.forEach((line, index) => {
            // 解析並提取 ID 資訊
            const result = window.CocoyaUtils.extractIds(line);
            const { cleanLine, ids, starts, ends } = result;

            // 建立行容器
            const lineDiv = document.createElement('div');
            lineDiv.className = 'code-line';
            lineDiv.setAttribute('data-line-index', index);
            this.lineDoms.push(lineDiv);

            // [反向定位] 點擊代碼行 → 定位到對應積木
            lineDiv.style.cursor = 'pointer';
            lineDiv.addEventListener('click', (evt) => {
                // 避免誤觸純文字選取
                if (window.getSelection && window.getSelection().toString()) return;
                this.locateBlockByLineIndex(index);
            });
            
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

        // [反向定位] 建立「行索引 → 可定位積木 ID」反查表。
        // 取覆蓋該行、且範圍最窄的積木（內層通常比外層更特定），並把 value 積木
        // 往上轉成 statement 父積木（與單向定位 findLocatableBlock 對稱）。
        this.lineIndexToBlockId = new Array(this.lineDoms.length).fill(null);
        const pickNarrower = (best, challenger) => {
            if (challenger === null) return best;
            if (best === null) return challenger;
            const r1 = this.blockToRangeMap.get(best);
            const r2 = this.blockToRangeMap.get(challenger);
            if (!r1) return challenger;
            if (!r2) return best;
            return ((r2.end - r2.start) < (r1.end - r1.start)) ? challenger : best;
        };
        this.blockToRangeMap.forEach((range, blockId) => {
            let targetId = blockId;
            // value 積木 → 往上找 statement 父積木（若無法解析則保留原 id）
            try {
                const ws = (typeof Blockly !== 'undefined') ? Blockly.getMainWorkspace() : null;
                const block = ws ? ws.getBlockById(blockId) : null;
                if (block) {
                    const loc = this.findLocatableBlock(block);
                    if (loc) targetId = loc.id;
                }
            } catch (e) { /* 保留 blockId */ }
            const start = Math.max(0, range.start);
            const end = Math.min(range.end, this.lineIndexToBlockId.length - 1);
            for (let i = start; i <= end; i++) {
                this.lineIndexToBlockId[i] = pickNarrower(this.lineIndexToBlockId[i], targetId);
            }
        });

        // 同步目前的選取狀態
        const selectedId = (typeof Blockly !== 'undefined' && Blockly.getSelected()) ? Blockly.getSelected().id : null;
        if (selectedId) this.syncSelection(selectedId);
    },

    /**
     * 遞迴尋找可定位的父積木 (參考 CodeBridge findLocatableBlock)
     * 若積木有 outputConnection (value/expression 積木)，往上遞迴找到
     * 沒有 outputConnection 的 statement 積木，該積木的 ID 才會在
     * 程式碼中有範圍標記 (S_ID/E_ID)。
     * @param {Blockly.Block} block 當前積木
     * @returns {Blockly.Block|null} 可定位的積木
     */
    findLocatableBlock: function(block) {
        if (!block) return null;
        if (block.outputConnection) {
            var parent = block.getParent();
            if (parent) return this.findLocatableBlock(parent);
        }
        return block;
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

        // 遞迴尋找可定位的父積木 (value 積木通常沒有自己的範圍標記，
        // 需要往上找到 statement 父積木才能定位)
        var locatableBlock = this.findLocatableBlock(block);
        if (!locatableBlock) return;
        const range = this.blockToRangeMap.get(locatableBlock.id);
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
     * [反向定位] 清除所有積木的選取框與高亮 (手動管理，繞開 Blockly focus 系統)
     * @param {object} ws Blockly workspace
     */
    clearBlockHighlight: function(ws) {
        if (!ws) return;
        // 清除 workspace 維護的 highlightedBlocks 陣列 (若曾用 auto-fallback 的 highlightBlock)
        if (typeof ws.highlightBlock === 'function') {
            try { ws.highlightBlock(); } catch (e) { }
        }
        // 對所有積木 removeSelect() 移除 .blocklySelected 框 (直接操作視覺，不需 DOM focus)
        try {
            const all = typeof ws.getAllBlocks === 'function' ? ws.getAllBlocks(false) : [];
            all.forEach((b) => {
                if (b && typeof b.removeSelect === 'function') {
                    try { b.removeSelect(); } catch (e) { }
                }
            });
        } catch (e) { }
    },

    /**
     * [反向定位] 由代碼行索引定位到對應積木（點擊代碼行時觸發）
     * @param {number} lineIndex 代碼行索引 (0-based)
     */
    locateBlockByLineIndex: function(lineIndex) {
        if (lineIndex === null || lineIndex === undefined) return;
        const blockId = this.lineIndexToBlockId ? this.lineIndexToBlockId[lineIndex] : null;
        if (!blockId) return;

        const ws = (typeof Blockly !== 'undefined') ? Blockly.getMainWorkspace() : null;
        if (!ws) return;

        // 1. 捲動並置中到積木
        if (typeof ws.centerOnBlock === 'function') {
            ws.centerOnBlock(blockId);
        }

        // 2. 明確切換 code 高亮：syncSelection 開頭必然清除所有舊 .highlight-line，
        //    再高亮新範圍 —— 不依賴 SELECTED 事件回饋，保證第二次點其它行也能清除舊高亮。
        this.syncSelection(blockId);

        // 3. 積木側：手動「先清全部積木選取框 → 再對目標 addSelect」。
        //    這繞開 Blockly focus 系統 (其在 webview 下不穩定，會造成舊積木高亮累積)：
        //    - 先 removeSelect() 所有積木框（含目標本身重複無害）
        //    - 再對目標 addSelect() 加框
        this.clearBlockHighlight(ws);
        const block = ws.getBlockById(blockId);
        if (block) {
            if (typeof block.addSelect === 'function') {
                block.addSelect();
            } else if (typeof block.select === 'function') {
                block.select();
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

        self.bindWorkspaceClickToClearHighlight();
    },

    /**
     * [反向定位] 點擊 Blockly 工作區空白處時，清除所有積木選取框與 code 高亮。
     * 這補償 Blockly focus 系統在 webview 下失效（原生「點空白取消選取」不作用）。
     */
    bindWorkspaceClickToClearHighlight: function() {
        try {
            const ws = (typeof Blockly !== 'undefined') ? Blockly.getMainWorkspace() : null;
            if (!ws) return;
            const svg = typeof ws.getParentSvg === 'function' ? ws.getParentSvg() : null;
            if (!svg || svg.getAttribute('data-cocoya-clear-bound') === '1') return;
            svg.setAttribute('data-cocoya-clear-bound', '1');

            svg.addEventListener('pointerdown', (evt) => {
                // 若點在積木/欄位/對話框上：交給 Blockly 原生處理，不做清除
                const t = evt.target;
                if (!t) return;
                const inBlock = (typeof t.closest === 'function') && (t.closest('[data-id]') || t.closest('.blocklyWidgetDiv') || t.closest('.blocklyDropdownDiv'));
                if (inBlock) return;

                // 點在空白 → 清除積木選取框 + code 高亮
                const ws2 = (typeof Blockly !== 'undefined') ? Blockly.getMainWorkspace() : null;
                if (window.CocoyaUI) {
                    window.CocoyaUI.clearBlockHighlight(ws2);
                    window.CocoyaUI.syncSelection(null);
                }
            }, true);
        } catch (e) { }
    }
});
