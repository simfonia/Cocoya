/**
 * Cocoya App 工作區模組
 * 負責 Blockly 注入、Minimap、外掛註冊、搜尋引擎索引、孤兒積木檢查與程式碼產出
 */
window.CocoyaApp = Object.assign(window.CocoyaApp || {}, {
    workspace: null,
    minimap: null,
    updateTimer: null,
    stateUpdateTimer: null,
    lastCleanCode: '',

    /**
     * 註冊 Blockly 自定義欄位與插件
     */
    registerPlugins: function() {
        if (typeof Blockly === 'undefined') return;
        try {
            if (window.FieldMultilineInput) {
                if (!Blockly.registry.hasItem(Blockly.registry.Type.FIELD, 'field_multilinetext')) {
                    Blockly.fieldRegistry.register('field_multilinetext', window.FieldMultilineInput); 
                }
            }
            if (window.FieldColour) {
                if (!Blockly.registry.hasItem(Blockly.registry.Type.FIELD, 'field_colour')) {
                    Blockly.fieldRegistry.register('field_colour', window.FieldColour); 
                }
            }
        } catch (e) { }
    },

    /**
     * 初始化 Minimap
     */
    initMinimap: function() {
        try {
            const MinimapClass = (window.workspaceMinimap && window.workspaceMinimap.PositionedMinimap) || 
                               (window.PositionedMinimap) || 
                               (Blockly.workspaceMinimap && Blockly.workspaceMinimap.PositionedMinimap);
            if (!MinimapClass) return;

            const originalUpdate = MinimapClass.prototype.update;
            MinimapClass.prototype.update = function() {
                try {
                    if (!this.primaryWorkspace) return;
                    const pm = this.primaryWorkspace.getMetricsManager().getContentMetrics(true);
                    if (!pm || !pm.width || isNaN(pm.width)) return;
                    originalUpdate.apply(this, arguments);
                } catch (e) { }
            };

            this.minimap = new MinimapClass(this.workspace);
            this.minimap.init();

            // 強制關閉 Minimap 內部的捲軸功能 (JS 層級)
            if (this.minimap.minimapWorkspace) {
                this.minimap.minimapWorkspace.options.hasScrollbars = false;
            }

            const originalMirror = this.minimap.mirror.bind(this.minimap);
            this.minimap.mirror = (event) => {
                if (this.minimap._isPaused) return;
                try {
                    if (event.type !== Blockly.Events.BLOCK_DELETE && event.blockId && !this.workspace.getBlockById(event.blockId)) return;
                    originalMirror(event);
                    
                    // 確保增量更新後依然維持滿版 (縮圖模式)
                    if (this.minimap.minimapWorkspace && !event.isUiEvent) {
                        this.minimap.minimapWorkspace.zoomToFit();
                    }
                } catch (e) { }
            };

            this.setupMinimapToggle();
        } catch (e) { }
    },

    /**
     * 建立 Minimap 切換按鈕
     */
    setupMinimapToggle: function() {
        const mWrapper = document.querySelector('.blockly-minimap');
        if (!mWrapper) return;

        let toggleBtn = document.getElementById('minimap-toggle');
        if (!toggleBtn) {
            toggleBtn = document.createElement('div');
            toggleBtn.id = 'minimap-toggle';
            document.getElementById('blocklyArea').appendChild(toggleBtn);
        }
        
        const mediaUri = window.CocoyaMediaUri || '/src';
        const updateBtnUI = (collapsed) => {
            const iconUri = collapsed ? `${mediaUri}/icons/public_24dp_FE2F89.png` : `${mediaUri}/icons/cancel_24dp_FE2F89.png`;
            toggleBtn.style.background = 'white';
            toggleBtn.innerHTML = `<img src="${iconUri}" style="width: 18px; height: 18px; vertical-align: middle;">`;
        };

        updateBtnUI(mWrapper.classList.contains('collapsed'));

        toggleBtn.onclick = () => {
            const isCollapsed = mWrapper.classList.toggle('collapsed');
            updateBtnUI(isCollapsed);
            this.minimap._isPaused = isCollapsed;
            if (!isCollapsed) this.refreshMinimap();
        };
    },

    /**
     * 強制同步 Minimap 畫面
     */
    refreshMinimap: function() {
        if (this.minimap && this.minimap.minimapWorkspace) {
            try {
                const dom = Blockly.Xml.workspaceToDom(this.workspace);
                this.minimap.minimapWorkspace.clear();
                Blockly.Xml.domToWorkspace(dom, this.minimap.minimapWorkspace);
                setTimeout(() => { 
                    if (this.minimap && this.minimap.minimapWorkspace) { 
                        this.minimap.minimapWorkspace.zoomToFit(); 
                        Blockly.svgResize(this.minimap.minimapWorkspace); 
                    } 
                }, 50);
            } catch (e) { }
        }
    },

    /**
     * 註冊變數分類回調
     */
    registerVariablesCallback: function() {
        this.workspace.registerToolboxCategoryCallback('VARIABLE', (ws) => {
            const xmlList = [];
            xmlList.push(Blockly.utils.xml.textToDom('<button text="%{BKY_NEW_VARIABLE}" callbackKey="CREATE_VARIABLE"></button>'));
            xmlList.push(Blockly.utils.xml.textToDom('<block type="py_variables_global"></block>'));
            xmlList.push(Blockly.utils.xml.textToDom('<block type="py_variables_set"><value name="VALUE"><shadow type="py_math_number"><field name="NUM">0</field></shadow></value></block>'));
            xmlList.push(Blockly.utils.xml.textToDom('<block type="py_variables_get"></block>'));
            return xmlList;
        });
        this.workspace.registerButtonCallback('CREATE_VARIABLE', (btn) => {
            const ws = btn.getTargetWorkspace();
            const msg = Blockly.Msg['BKY_NEW_VARIABLE_HINT'] || '請輸入變數名稱:';
            Blockly.dialog.prompt(msg, '', (input) => {
                if (input) {
                    const names = input.split(/[，,]/);
                    names.forEach(name => {
                        const trimmedName = name.trim();
                        if (trimmedName) ws.createVariable(trimmedName);
                    });
                }
            });
        });
    },

    /**
     * 設定工作區變動監聽器
     */
    setupWorkspaceListeners: function() {
        // --- BUG FIX: 解決積木拖拽粘性問題 (Sticky Drag) ---
        // 當滑鼠從外部重新進入視窗時，如果沒按著按鍵，強制終止 Blockly 的所有手勢
        window.addEventListener('mouseenter', (e) => {
            if (e.buttons === 0 && this.workspace) {
                const gesture = this.workspace.getGesture(e);
                if (gesture) gesture.dispose();
                // 強制結束所有可能的手勢狀態
                if (Blockly.Gesture && Blockly.Gesture.allGestures_) {
                    Blockly.Gesture.allGestures_.forEach(g => g.dispose());
                }
            }
        });

        this.workspace.addChangeListener((event) => {
            if (event.type === 'selected' || event.type === Blockly.Events.SELECTED) {
                if (window.CocoyaUI) window.CocoyaUI.syncSelection(event.newElementId);
            }

            if (this.isInitializing || event.isUiEvent) return;

            const isBlockChange = [
                'move', 'create', 'change', 'delete',
                'var_create', 'var_rename', 'var_delete',
                Blockly.Events.BLOCK_MOVE,
                Blockly.Events.BLOCK_CREATE,
                Blockly.Events.BLOCK_CHANGE,
                Blockly.Events.BLOCK_DELETE
            ].includes(event.type);

            if (isBlockChange) { 
                this.setDirty(true); 
                this.triggerBlockStateUpdate(); 
                this.triggerCodeUpdate();
                this.triggerAutoBackup(); 
            }
        });
    },

    /**
     * 執行孤兒積木檢查 (Orphan Block Check)
     */
    triggerBlockStateUpdate: function() {
        if (this.stateUpdateTimer) clearTimeout(this.stateUpdateTimer);
        this.stateUpdateTimer = setTimeout(() => {
            Blockly.Events.disable();
            try {
                const topBlocks = this.workspace.getTopBlocks(false);
                const allowedTypes = ['py_main', 'mcu_main', 'py_definition_zone', 'py_function_def'];
                topBlocks.forEach(root => {
                    const isAllowed = allowedTypes.includes(root.type) || root.type.startsWith('procedures_def');
                    root.getDescendants(false).forEach(block => {
                        const targetState = !isAllowed;
                        if (typeof block.setDisabledReason === 'function') {
                            block.setDisabledReason(targetState, 'orphan');
                        } else {
                            block.setEnabled(!targetState);
                        }

                        if (this.minimap && this.minimap.minimapWorkspace) {
                            const mBlock = this.minimap.minimapWorkspace.getBlockById(block.id);
                            if (mBlock) {
                                if (typeof mBlock.setDisabledReason === 'function') {
                                    mBlock.setDisabledReason(targetState, 'orphan');
                                } else {
                                    mBlock.setEnabled(!targetState);
                                }
                            }
                        }
                    });
                });
            } finally { 
                Blockly.Events.enable(); 
            }
        }, 150);
    },

    /**
     * 觸發程式碼產出與預覽渲染
     */
    triggerCodeUpdate: function() {
        if (this.updateTimer) clearTimeout(this.updateTimer);
        this.updateTimer = setTimeout(() => {
            this.triggerCodeUpdateSync();
        }, 300);
    },

    /**
     * [SYNC] 立即執行程式碼產出並同步 lastCleanCode (修復欄位焦點未更新 Bug)
     * @returns {string} 清理後的程式碼
     */
    triggerCodeUpdateSync: function() {
        try {
            if (!this.workspace || typeof Blockly === 'undefined') return this.lastCleanCode;
            
            let code = Blockly.Python.workspaceToCode(this.workspace);
            // 徹底清理：濾掉變數宣告預設值、行尾 ID 註解與運算式隱形標記
            code = code.replace(/^[a-zA-Z_][a-zA-Z0-9_]* = None(  # ID:.*)?\n/mg, '');
            code = code.replace(/\u0001ID:.*?\u0002/g, '');
            
            this.lastCleanCode = code.trim();
            if (window.CocoyaUI && window.CocoyaUI.renderPythonPreview) {
                window.CocoyaUI.renderPythonPreview(this.lastCleanCode);
            }
            return this.lastCleanCode;
        } catch (e) {
            console.error('[Workspace] Sync Code Update failed:', e);
            return this.lastCleanCode;
        }
    }
});
