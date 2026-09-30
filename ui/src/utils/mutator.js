/**
 * Cocoya 通用工具：Mutator Undo 方案
 */
(function() {
    window.CocoyaUtils = window.CocoyaUtils || {};

    Object.assign(window.CocoyaUtils, {
        /**
         * 變形器 (Mutator) 終極 Undo 方案 (A-E 流程)
         */
        Mutator: {
            execute: function(block, dataChangeFunc, silentShapeFunc) {
                // 傳入非函式時視為「不需資料變更」/「不需重建形狀」。
                const runData = typeof dataChangeFunc === 'function' ? dataChangeFunc : () => {
                    // no-op
                };
                const runShape = typeof silentShapeFunc === 'function' ? silentShapeFunc : () => {
                    // no-op
                };

                if (!Blockly.Events.isEnabled()) {
                    runData();
                    runShape();
                    return;
                }

                const oldMutation = Blockly.Xml.domToText(block.mutationToDom());
                const groupId = (Blockly.utils.idGenerator && Blockly.utils.idGenerator.genUid) 
                    ? Blockly.utils.idGenerator.genUid() 
                    : true;
                
                Blockly.Events.setGroup(groupId);

                try {
                    runData();
                    Blockly.Events.disable();
                    try {
                        runShape();
                    } finally {
                        Blockly.Events.enable();
                    }

                    const newMutation = Blockly.Xml.domToText(block.mutationToDom());
                    if (oldMutation !== newMutation) {
                        Blockly.Events.fire(new Blockly.Events.BlockChange(block, 'mutation', null, oldMutation, newMutation));
                    }
                } finally {
                    Blockly.Events.setGroup(false);
                }
            }
        }
    });
})();
