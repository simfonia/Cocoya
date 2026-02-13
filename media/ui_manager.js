/**
 * Cocoya UI 渲染與同步管理器
 */
window.CocoyaUI = {
    blockToLineMap: new Map(),
    pendingIds: [],

    /**
     * 更新 Python 代碼預覽區域
     * @param {string} rawCode Blockly 產出的原始碼
     */
    renderPythonPreview: function(rawCode) {
        const codeContent = document.getElementById('codeContent');
        if (!codeContent) return;

        const lines = rawCode.split('\n');
        codeContent.innerHTML = '';
        this.blockToLineMap.clear();
        this.pendingIds = [];

        lines.forEach((line) => {
            const result = window.CocoyaUtils.extractIds(line);
            const cleanLine = result.cleanLine;
            const ids = result.ids;
            
            let blockIdsOnThisLine = [...this.pendingIds, ...ids];
            this.pendingIds = [];

            // 處理空行 ID 累積
            if (cleanLine.trim() === '' && blockIdsOnThisLine.length > 0) {
                this.pendingIds = blockIdsOnThisLine;
                return;
            }
            if (cleanLine.trim() === '' && blockIdsOnThisLine.length === 0) return;

            // 建立 DOM
            const lineDiv = document.createElement('div');
            lineDiv.className = 'code-line';
            
            if (cleanLine.trim() !== '') {
                lineDiv.innerHTML = hljs.highlight(cleanLine, { language: 'python' }).value;
            } else {
                lineDiv.textContent = ' ';
            }

            // 選取狀態檢查
            const selectedId = Blockly.getSelected() ? Blockly.getSelected().id : null;

            blockIdsOnThisLine.forEach(id => {
                lineDiv.setAttribute('data-block-id', id);
                if (!this.blockToLineMap.has(id)) this.blockToLineMap.set(id, lineDiv);
                if (id === selectedId) lineDiv.classList.add('highlight-line');
            });

            codeContent.appendChild(lineDiv);
        });
    },

    /**
     * 高亮並捲動到指定積木對應的代碼行
     * @param {string} blockId 
     */
    syncSelection: function(blockId) {
        document.querySelectorAll('.highlight-line').forEach(el => el.classList.remove('highlight-line'));
        const targetLine = this.blockToLineMap.get(blockId);
        if (targetLine) {
            targetLine.classList.add('highlight-line');
            targetLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
};
