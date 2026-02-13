/**
 * Cocoya 通用工具函式庫
 */
window.CocoyaUtils = {
    TAG_START: '\u0001',
    TAG_END: '\u0002',

    extractIds: function(line) {
        let ids = [];
        let cleanLine = line;
        const regex = new RegExp(this.TAG_START + 'ID:([\\s\\S]+?)' + this.TAG_END, 'g');
        const matches = line.matchAll(regex);
        for (const match of matches) ids.push(match[1]);
        cleanLine = line.replace(regex, '');
        const commentIdMatch = cleanLine.match(/# ID:([^\s]+)/);
        if (commentIdMatch) {
            ids.push(commentIdMatch[1]);
            cleanLine = cleanLine.replace(/# ID:[^\s]+/, '').trimEnd();
        }
        return { cleanLine, ids };
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
