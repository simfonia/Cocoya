/**
 * Cocoya 通用工具函式庫
 */
window.CocoyaUtils = {
    TAG_START: '\u0001',
    TAG_END: '\u0002',

    extractIds: function(line) {
        let ids = [];
        let starts = [];
        let ends = [];
        let cleanLine = line;
        
        // 1. 處理不可見標記 (運算式) - 運算式通常不跨行，視為既是開始也是結束
        const invisibleRegex = new RegExp(this.TAG_START + 'ID:([\\s\\S]+?)' + this.TAG_END, 'g');
        const invisibleMatches = [...cleanLine.matchAll(invisibleRegex)];
        for (const match of invisibleMatches) {
            ids.push(match[1]);
        }
        cleanLine = cleanLine.replace(invisibleRegex, '');

        // 2. 處理行尾註解 ID (陳述句)
        // 匹配 "  # ID:xxx", "  # S_ID:xxx", "  # E_ID:xxx"
        const idRegex = /  # ID:([^\s\n]+)/g;
        const startRegex = /  # S_ID:([^\s\n]+)/g;
        const endRegex = /  # E_ID:([^\s\n]+)/g;

        // 提取一般的 ID (視為單行範圍)
        const idMatches = [...cleanLine.matchAll(idRegex)];
        for (const match of idMatches) {
            ids.push(match[1]);
        }
        cleanLine = cleanLine.replace(idRegex, '');

        // 提取 S_ID (開始)
        const startMatches = [...cleanLine.matchAll(startRegex)];
        for (const match of startMatches) {
            starts.push(match[1]);
        }
        cleanLine = cleanLine.replace(startRegex, '');

        // 提取 E_ID (結束)
        const endMatches = [...cleanLine.matchAll(endRegex)];
        for (const match of endMatches) {
            ends.push(match[1]);
        }
        cleanLine = cleanLine.replace(endRegex, '');

        return { cleanLine: cleanLine.trimEnd(), ids, starts, ends };
    },

    /**
     * 變形器 (Mutator) 終極 Undo 方案 (A-E 流程)
     */
    Mutator: {
        execute: function(block, dataChangeFunc, silentShapeFunc) {
            // 安全檢查：確保傳入的是函式
            const runData = typeof dataChangeFunc === 'function' ? dataChangeFunc : () => {};
            const runShape = typeof silentShapeFunc === 'function' ? silentShapeFunc : () => {};

            if (!Blockly.Events.isEnabled()) {
                runData();
                runShape();
                return;
            }

            // A. 紀錄原始狀態並開啟 Group
            const oldMutation = Blockly.Xml.domToText(block.mutationToDom());
            
            // 使用正確的 V12 API 產生 ID
            const groupId = (Blockly.utils.idGenerator && Blockly.utils.idGenerator.genUid) 
                ? Blockly.utils.idGenerator.genUid() 
                : true;
            
            Blockly.Events.setGroup(groupId);

            try {
                // B. 執行數據變更 (紀錄進 Undo)
                runData();

                // C. 暫停錄製
                Blockly.Events.disable();
                try {
                    // D. 執行形狀重組 (不紀錄連線變動)
                    runShape();
                } finally {
                    // E. 恢復錄製
                    Blockly.Events.enable();
                }

                // 觸發 Mutation 變更事件
                const newMutation = Blockly.Xml.domToText(block.mutationToDom());
                if (oldMutation !== newMutation) {
                    Blockly.Events.fire(new Blockly.Events.BlockChange(block, 'mutation', null, oldMutation, newMutation));
                }
            } finally {
                Blockly.Events.setGroup(false);
            }
        }
    }
};
