/**
 * Cocoya 通用工具：Blockly 產生器修補
 */
(function() {
    window.CocoyaUtils = window.CocoyaUtils || {};

    Object.assign(window.CocoyaUtils, {
        setupGeneratorOverrides: function() {
            if (!Blockly.Python) return;
            
            const self = this;

            // --- 1. 全域縮排比例縮放器 (Global Indent Scaler) ---
            const originalFinish = Blockly.Python.finish;
            Blockly.Python.finish = function(code) {
                const targetIndent = this.INDENT || '    ';
                const targetLen = targetIndent.length;
                
                for (let name in this.definitions_) {
                    let defCode = this.definitions_[name];
                    if (typeof defCode === 'string') {
                        if (targetLen !== 4) {
                            this.definitions_[name] = defCode.split('\n').map(line => {
                                return line.replace(/^(    )+/g, (match) => {
                                    const depth = match.length / 4;
                                    return targetIndent.repeat(depth);
                                });
                            }).join('\n');
                        }
                    }
                }
                
                return originalFinish.call(this, code);
            };

            // --- 2. 區塊代碼標記攔截器 (用於高亮同步) ---
            Blockly.Python.scrub_ = function(block, code, opt_thisOnly) {
                const nextBlock = (block.nextConnection && !opt_thisOnly) ? block.nextConnection.targetBlock() : null;
                if (!block.isEnabled()) return nextBlock ? Blockly.Python.blockToCode(nextBlock) : '';
                
                const s = self.TAG_START;
                const e = self.TAG_END;
                
                if (block.outputConnection) return `${s}ID:${block.id}${e}${code}`;
                
                const nextCode = nextBlock ? Blockly.Python.blockToCode(nextBlock) : '';
                let lines = code.split('\n');
                if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
                if (lines.length > 0) { 
                    lines[0] += `  # S_ID:${block.id}`; 
                    lines[lines.length - 1] += `  # E_ID:${block.id}`; 
                }
                return lines.join('\n') + '\n' + nextCode;
            };
        }
    });
})();
