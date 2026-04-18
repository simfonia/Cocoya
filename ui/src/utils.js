/**
 * Cocoya 通用工具函式庫
 */
(function() {
    // --- 全局屬性安全攔截器 (徹底解決 NaN 報錯) ---
    const originalSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
        if (typeof value === 'string' && (value.includes('NaN') || value.includes('Infinity'))) {
            // console.warn(`Blocked invalid attribute: ${name}="${value}"`);
            return;
        }
        if (typeof value === 'number' && isNaN(value)) return;
        return originalSetAttribute.apply(this, arguments);
    };

    window.CocoyaUtils = {
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
         * 根據平台過濾 Toolbox XML
         * @param {string} xmlString 原始 XML 字串
         * @param {string} currentPlatform 當前平台 (PC/CircuitPython)
         * @returns {string} 過濾後的 XML 字串
         */
        filterToolboxXML: function(xmlString, currentPlatform) {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "text/xml");
            xmlDoc.querySelectorAll('block').forEach(block => {
                const p = block.getAttribute('platform');
                if (p && p !== currentPlatform) block.parentNode.removeChild(block);
            });
            return new XMLSerializer().serializeToString(xmlDoc);
        },

        /**
         * 配置 Blockly 產生器修補程式
         */
        setupGeneratorOverrides: function() {
            if (!Blockly.Python) return;
            
            const self = this;
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
        },

        /**
         * Cocoya 專屬積木搜尋引擎
         */
        BlockSearcher: {
            _cache: new Map(), // 儲存積木類型與對應搜尋字串的映射

            /**
             * 建立搜尋索引
             * @param {Blockly.Workspace} workspace 用於建立臨時積木以獲取文字內容
             */
            buildIndex: function(workspace) {
                this._cache.clear();
                const allTypes = Object.keys(Blockly.Blocks);
                
                // 暫時禁用事件，避免地圖或其它插件監聽到這些暫存積木
                Blockly.Events.disable();
                try {
                    allTypes.forEach(type => {
                        try {
                            let searchBlob = type.toLowerCase();
                            const msgKey = type.toUpperCase();
                            if (Blockly.Msg[msgKey]) searchBlob += ' ' + Blockly.Msg[msgKey].toLowerCase();

                            const tempBlock = workspace.newBlock(type);
                            if (tempBlock) {
                                tempBlock.inputList.forEach(input => {
                                    input.fieldRow.forEach(field => {
                                        const text = field.getText ? field.getText().toLowerCase() : '';
                                        if (text && !text.includes('%')) searchBlob += ' ' + text;
                                    });
                                });
                                tempBlock.dispose();
                            }
                            this._cache.set(type, searchBlob);
                        } catch (err) { }
                    });
                } finally {
                    Blockly.Events.enable();
                }
                console.log(`BlockSearcher: Indexed ${this._cache.size} blocks.`);
            },

            /**
             * 執行搜尋
             * @param {string} query 關鍵字
             * @returns {Array} 符合的積木 JSON 列表
             */
            search: function(query) {
                const results = [];
                const q = query.toLowerCase().trim();
                if (!q) return results;

                this._cache.forEach((blob, type) => {
                    if (blob.includes(q)) {
                        results.push({ 'kind': 'block', 'type': type });
                    }
                });
                return results;
            },

            /**
             * 注入搜尋框至 Toolbox
             * @param {Blockly.Workspace} workspace Blockly 工作區
             */
            inject: function(workspace) {
                const tryInject = () => {
                    // 嘗試多種可能的 Toolbox 容器選擇器
                    const toolboxDiv = document.querySelector('.blocklyToolboxDiv') || 
                                     document.querySelector('.blocklyTreeRoot') ||
                                     document.querySelector('[role="tree"]');
                    
                    if (!toolboxDiv) return false;
                    if (document.getElementById('block-search-container')) return true;

                    console.log('Found toolbox container, injecting search box...');
                    
                    const mediaUri = window.CocoyaMediaUri || '/src';
                    const container = document.createElement('div');
                    container.id = 'block-search-container';
                    container.innerHTML = `
                        <div class="search-input-wrapper">
                            <input type="text" id="block-search" placeholder="${Blockly.Msg['BKY_CAT_SEARCH'] || '搜尋積木...'}" autocomplete="off">
                            <div id="block-search-clear" style="display: none;">
                                <img src="${mediaUri}/icons/cancel_24dp_FE2F89.png" style="width: 16px; height: 16px; cursor: pointer;">
                            </div>
                        </div>
                    `;
                    
                    // 確保搜尋框被插入到 Toolbox 最頂部
                    if (toolboxDiv.firstChild) {
                        toolboxDiv.insertBefore(container, toolboxDiv.firstChild);
                    } else {
                        toolboxDiv.appendChild(container);
                    }

                    const searchInput = document.getElementById('block-search');
                    const clearBtn = document.getElementById('block-search-clear');

                    // Stop all possible events from reaching the Blockly Toolbox
                    const stopEvents = ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'];
                    stopEvents.forEach(eventName => {
                        container.addEventListener(eventName, (e) => e.stopPropagation());
                    });

                    const doSearch = (query) => {
                        const q = query.toLowerCase().trim();
                        const flyout = workspace.getFlyout();
                        if (!q) { 
                            flyout.hide(); 
                            clearBtn.style.display = 'none';
                            return; 
                        }
                        clearBtn.style.display = 'flex';
                        const results = this.search(q);
                        if (results.length > 0) {
                            flyout.show(results.slice(0, 30));
                            // --- 關鍵修正: 獲取實體寬度並強制校正 Flyout 位置 ---
                            const toolboxEl = document.querySelector('.blocklyToolboxDiv');
                            const toolboxWidth = toolboxEl ? toolboxEl.offsetWidth : workspace.getToolbox().getWidth();
                            if (flyout.setX) flyout.setX(toolboxWidth);
                        } else {
                            flyout.hide();
                        }
                    };

                    searchInput.addEventListener('input', (e) => doSearch(e.target.value));

                    searchInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Escape') {
                            searchInput.value = '';
                            doSearch('');
                            searchInput.blur();
                        }
                    });

                    clearBtn.onclick = () => {
                        searchInput.value = '';
                        doSearch('');
                        searchInput.focus();
                    };
                    return true;
                };

                // 執行多重時機點嘗試 (MutationObserver)
                if (!tryInject()) {
                    const observer = new MutationObserver((mutations, obs) => {
                        if (tryInject()) obs.disconnect();
                    });
                    observer.observe(document.body, { childList: true, subtree: true });
                    
                    let retry = 0;
                    const timer = setInterval(() => {
                        if (tryInject() || retry++ > 20) clearInterval(timer);
                    }, 500);
                }
            }
        }
    };
})();
