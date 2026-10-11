/**
 * Cocoya 通用工具：核心邏輯
 * 包含 DOM 攔截、ID 提取與縮排修復
 */
(function() {
    // --- 全局屬性安全攔截器 (徹底解決 NaN 報錯) ---
    const originalSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
        if (typeof value === 'string' && (value.includes('NaN') || value.includes('Infinity'))) {
            return;
        }
        if (typeof value === 'number' && isNaN(value)) return;
        return originalSetAttribute.apply(this, arguments);
    };

    window.CocoyaUtils = window.CocoyaUtils || {};
    
    Object.assign(window.CocoyaUtils, {
        TAG_START: '\u0001',
        TAG_END: '\u0002',

        /**
         * 提取代碼中的 ID 標記
         */
        extractIds: function(line) {
            let ids = [];
            let starts = [];
            let ends = [];
            let cleanLine = line;
            
            const invisibleRegex = new RegExp(this.TAG_START + 'ID:([\\s\\S]+?)' + this.TAG_END, 'g');
            const invisibleMatches = [...cleanLine.matchAll(invisibleRegex)];
            for (const match of invisibleMatches) {
                ids.push(match[1]);
            }
            cleanLine = cleanLine.replace(invisibleRegex, '');

            const idRegex = /  # ID:\s*([^\s\n]+)/g;
            const startRegex = /  # S_ID:\s*([^\s\n]+)/g;
            const endRegex = /  # E_ID:\s*([^\s\n]+)/g;

            const idMatches = [...cleanLine.matchAll(idRegex)];
            for (const match of idMatches) {
                ids.push(match[1]);
            }
            cleanLine = cleanLine.replace(idRegex, '');

            const startMatches = [...cleanLine.matchAll(startRegex)];
            for (const match of startMatches) {
                starts.push(match[1]);
            }
            cleanLine = cleanLine.replace(startRegex, '');

            const endMatches = [...cleanLine.matchAll(endRegex)];
            for (const match of endMatches) {
                ends.push(match[1]);
            }
            cleanLine = cleanLine.replace(endRegex, '');

            return { cleanLine: cleanLine.trimEnd(), ids, starts, ends };
        },

        /**
         * ID 標記剝除 SSOT（解 D-2 #2/#5）：逐行走 extractIds，
         * 與 renderer.js 預覽渲染同一函式，剝 S_ID/E_ID/舊式 # ID/隱形標記。
         * 注意輸入必須是 triggerCodeUpdateSync 之後的原始碼。
         */
        stripIdMarks: function(code) {
            try {
                if (typeof this.extractIds === 'function') {
                    return String(code == null ? '' : code).split('\n')
                        .map((line) => this.extractIds(line).cleanLine)
                        .join('\n');
                }
            } catch (e) {}
            // 降級：extractIds 不可用時走三正則（與 extractIds 同語意）
            return String(code == null ? '' : code)
                .replace(/ {2}# (?:S_ID|E_ID|ID):\s*[^\s\n]+/g, '')
                .replace(/\u0001ID:.*?\u0002/g, '');
        },

        /**
         * 修復靜態注入程式碼的縮排
         */
        fixIndent: function(code, indent) {
            if (!code) return '';
            const lines = code.split('\n');
            if (indent === '    ') return code;
            
            return lines.map(line => {
                return line.replace(/^(    )+/g, (match) => {
                    const depth = match.length / 4;
                    return indent.repeat(depth);
                });
            }).join('\n');
        }
    });
})();
