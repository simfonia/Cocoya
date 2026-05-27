/**
 * Cocoya 通用工具：積木搜尋引擎
 */
(function() {
    window.CocoyaUtils = window.CocoyaUtils || {};

    Object.assign(window.CocoyaUtils, {
        /**
         * Cocoya 專屬積木搜尋引擎
         */
        BlockSearcher: {
            _cache: new Map(),
            _defCache: new Map(),
            _isComposing: false,

            _extractXmlDefs: function(xml) {
                if (!xml) return;
                if (xml.tagName === 'BLOCK' || xml.tagName === 'block') {
                    const type = xml.getAttribute('type');
                    if (type && !this._defCache.has(type)) {
                        this._defCache.set(type, xml);
                    }
                }
                for (let child of xml.childNodes) {
                    if (child.nodeType === 1) {
                        this._extractXmlDefs(child);
                    }
                }
            },

            buildIndex: function(workspace) {
                this._cache.clear();
                this._defCache.clear();

                const tree = workspace.options.languageTree;
                if (tree) {
                    if (tree.tagName === 'XML' || tree.tagName === 'xml') {
                        this._extractXmlDefs(tree);
                    } else if (tree.contents) {
                        const collectJson = (items) => {
                            items.forEach(item => {
                                if (item.kind === 'BLOCK' || item.kind === 'block') {
                                    if (item.type) this._defCache.set(item.type, item);
                                } else if (item.contents) {
                                    collectJson(item.contents);
                                }
                            });
                        };
                        collectJson(tree.contents);
                    }
                }

                const allTypes = Object.keys(Blockly.Blocks);
                Blockly.Events.disable();
                try {
                    allTypes.forEach(type => {
                        try {
                            let searchBlob = type.toLowerCase();
                            const blockDef = Blockly.Blocks[type];
                            if (blockDef) {
                                for (let i = 0; i < 5; i++) {
                                    const msg = blockDef['message' + i];
                                    if (typeof msg === 'string') {
                                        searchBlob += ' ' + Blockly.utils.parsing.replaceMessageReferences(msg).toLowerCase();
                                    }
                                }
                            }

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
                console.log(`BlockSearcher: Indexed ${this._cache.size} blocks, Cached ${this._defCache.size} definitions.`);
            },

            search: function(query) {
                const results = [];
                const q = query.toLowerCase().trim();
                if (!q) return results;

                const keywords = q.split(/\s+/).filter(k => k.length > 0);

                this._cache.forEach((blob, type) => {
                    const isMatch = keywords.every(k => blob.includes(k));
                    if (isMatch) {
                        if (this._defCache.has(type)) {
                            results.push(this._defCache.get(type));
                        } else {
                            results.push({ 'kind': 'block', 'type': type });
                        }
                    }
                });
                return results;
            },

            inject: function(workspace) {
                const tryInject = () => {
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
                    
                    if (toolboxDiv.firstChild) {
                        toolboxDiv.insertBefore(container, toolboxDiv.firstChild);
                    } else {
                        toolboxDiv.appendChild(container);
                    }

                    const searchInput = document.getElementById('block-search');
                    const clearBtn = document.getElementById('block-search-clear');

                    workspace.addChangeListener((e) => {
                        if (e.type === Blockly.Events.BLOCK_CREATE && searchInput.value !== '') {
                            setTimeout(() => {
                                searchInput.value = '';
                                doSearch('');
                                searchInput.blur();
                            }, 100);
                        }
                    });

                    const stopEvents = ['click', 'mousedown', 'pointerdown', 'touchstart'];
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
    });
})();
