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
                // [關鍵修正] 如果正在輸入文字，暫停 Minimap 同步，避免 Minimap 渲染奪走 WidgetDiv 焦點
                const isInputActive = Blockly.WidgetDiv && Blockly.WidgetDiv.isVisible();
                if (this.minimap._isPaused || isInputActive) return;
                
                try {
                    // [工作區註解支援] 允許註解事件通過 (COMMENT_CREATE, COMMENT_DELETE, COMMENT_CHANGE, COMMENT_MOVE, COMMENT_RESIZE)
                    const isCommentEvent = [
                        Blockly.Events.COMMENT_CREATE,
                        Blockly.Events.COMMENT_DELETE,
                        Blockly.Events.COMMENT_CHANGE,
                        Blockly.Events.COMMENT_MOVE,
                        Blockly.Events.COMMENT_RESIZE
                    ].includes(event.type);
                    
                    // 對於積木事件：如果不是刪除事件，且 blockId 不存在於主工作區，則跳過
                    // 對於註解事件：直接通過 (註解沒有 blockId，而是有 commentId)
                    if (!isCommentEvent && event.type !== Blockly.Events.BLOCK_DELETE && event.blockId && !this.workspace.getBlockById(event.blockId)) return;
                    
                    // [關鍵修正] 註解事件需要完整重新載入，因為 minimap 內部的 p Set 不包含註解事件
                    if (isCommentEvent) {
                        const dom = Blockly.Xml.workspaceToDom(this.workspace);
                        this.minimap.minimapWorkspace.clear();
                        Blockly.Xml.domToWorkspace(dom, this.minimap.minimapWorkspace);
                        setTimeout(() => {
                            if (this.minimap && this.minimap.minimapWorkspace) {
                                this.minimap.minimapWorkspace.zoomToFit();
                                Blockly.svgResize(this.minimap.minimapWorkspace);
                            }
                        }, 50);
                    } else {
                        originalMirror(event);
                        
                        // 確保增量更新後依然維持滿版 (縮圖模式)
                        if (this.minimap.minimapWorkspace && !event.isUiEvent) {
                            this.minimap.minimapWorkspace.zoomToFit();
                        }
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

                const syncCommentGeometry = () => {
                    if (!this.minimap || !this.minimap.minimapWorkspace) return;

                    const mainComments = this.workspace.getTopComments();
                    const minimapComments = this.minimap.minimapWorkspace.getTopComments();
                    if (mainComments.length === 0 || minimapComments.length === 0) return;

                    const commentMap = new Map();
                    mainComments.forEach(c => commentMap.set(c.id, c));

                    minimapComments.forEach(mc => {
                        const mainComment = commentMap.get(mc.id);
                        if (!mainComment) return;

                        const size = mainComment.getSize();
                        if (size && size.width && size.height) {
                            mc.setSize(new Blockly.utils.Size(size.width, size.height));
                        }

                        if (mainComment.location) {
                            mc.moveTo(new Blockly.utils.Coordinate(mainComment.location.x, mainComment.location.y));
                        }
                    });
                };

                const applyRefresh = () => {
                    if (!this.minimap || !this.minimap.minimapWorkspace) return;
                    syncCommentGeometry();
                    this.minimap.minimapWorkspace.zoomToFit();
                    Blockly.svgResize(this.minimap.minimapWorkspace);
                };

                const scheduleRefresh = (delay) => setTimeout(() => {
                    requestAnimationFrame(applyRefresh);
                }, delay);

                scheduleRefresh(120);
                scheduleRefresh(260);
                scheduleRefresh(420);
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
            xmlList.push(Blockly.utils.xml.textToDom('<block type="py_variables_del"></block>'));
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
        window.addEventListener('mouseenter', (e) => {
            if (e.buttons === 0 && this.workspace) {
                const gesture = this.workspace.getGesture(e);
                if (gesture) gesture.dispose();
                if (Blockly.Gesture && Blockly.Gesture.allGestures_) {
                    Blockly.Gesture.allGestures_.forEach(g => g.dispose());
                }
            }
        });

        this.workspace.addChangeListener((event) => {
            // [關鍵修正] 如果正在打字，立即跳過所有會影響焦點或重繪的非必要動作
            const isInputActive = Blockly.WidgetDiv && Blockly.WidgetDiv.isVisible();
            
            if (event.type === 'selected' || event.type === Blockly.Events.SELECTED) {
                if (window.CocoyaUI && !isInputActive) {
                    window.CocoyaUI.syncSelection(event.newElementId);
                }
            }

            if (this.isInitializing || event.isUiEvent) return;

            const isBlockChange = [
                'move', 'create', 'change', 'delete',
                'var_create', 'var_rename', 'var_delete',
                Blockly.Events.BLOCK_MOVE,
                Blockly.Events.BLOCK_CREATE,
                Blockly.Events.BLOCK_CHANGE,
                Blockly.Events.BLOCK_DELETE,
                Blockly.Events.COMMENT_CREATE,
                Blockly.Events.COMMENT_MOVE,
                Blockly.Events.COMMENT_CHANGE,
                Blockly.Events.COMMENT_RESIZE,
                Blockly.Events.COMMENT_DELETE
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
        
        // [關鍵修正] 如果正在打字，延後檢查，避免 Enabled/Disabled 狀態切換導致積木重繪而丟失焦點
        const isInputActive = Blockly.WidgetDiv && Blockly.WidgetDiv.isVisible();
        if (isInputActive) {
            this.stateUpdateTimer = setTimeout(() => this.triggerBlockStateUpdate(), 500);
            return;
        }

        this.stateUpdateTimer = setTimeout(() => {
            Blockly.Events.disable();
            try {
                const topBlocks = this.workspace.getTopBlocks(false);
                const allowedTypes = ['py_main', 'mcu_main', 'mcu_board_init', 'py_definition_zone', 'py_function_def', 'py_coding_comment'];
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
     * @param {boolean} forceUI 是否無視輸入狀態強制更新 UI (預覽與高亮)
     * @returns {string} 清理後的程式碼
     */
    /**
     * Zombie 陷阱（2026-09-22 續修）：攔截主工作區的 newBlock，捕捉「定義未註冊就建積木」
     * 的當下呼叫堆。空積木的錯誤現場（valueToCode）與犯案現場（newBlock）時間分離，
     * 只有在建立當下留下證據才能定位真正的載入路徑。
     * @param {Blockly.WorkspaceSvg} ws 主工作區
     */
    _installZombieTrap: function(ws) {
        if (!ws || ws.__zombieTrapInstalled) return;
        ws.__zombieTrapInstalled = true;
        this._zombieTraces = [];
        const app = this;
        const orig = ws.newBlock.bind(ws);
        ws.newBlock = function(type, id) {
            if (typeof Blockly === 'undefined' || !Blockly.Blocks[type]) {
                const trace = {
                    type: type,
                    platform: app.currentPlatform,
                    time: new Date().toISOString(),
                    stack: (new Error().stack || '').split('\n').slice(1, 9).join('\n')
                };
                (app._zombieTraces = app._zombieTraces || []).push(trace);
                console.error('[Zombie-Trap] 未註冊型別建立積木！type=' + type +
                    ' platform=' + trace.platform + ' at ' + trace.time + '\n' + trace.stack);
            }
            return orig(type, id);
        };
    },

    /**
     * Zombie 自癒（2026-09-22 續修）：產碼前掃描，若積木型別「現在已註冊」但實例
     * 缺 input（空積木，定義是在建立之後才載入），重跑定義 init 補回 input，
     * 讓產碼恢復運作（欄位值/連線在建立當下已遺失，無法復原，只能補回結構）。
     * @returns {boolean} 是否有修復任何積木
     */
    _repairZombieBlocks: function() {
        let repaired = false;
        try {
            if (!this.workspace || typeof Blockly === 'undefined') return false;
            this.workspace.getAllBlocks(false).forEach((b) => {
                try {
                    const def = Blockly.Blocks[b.type];
                    if (!def || typeof def.init !== 'function') return;
                    if (b.inputList && b.inputList.length > 0) return; // 正常積木
                    def.init.call(b);
                    if (b.inputList && b.inputList.length > 0) {
                        b.initSvg();
                        b.render();
                        repaired = true;
                        console.warn('[Workspace] Zombie block repaired:', b.type, b.id,
                            (this._zombieTraces || []).filter((t) => t.type === b.type).map((t) => t.stack));
                    }
                } catch (err) {
                    console.error('[Workspace] Zombie repair failed:', b.type, err);
                }
            });
        } catch (e) { /* 掃描失敗不阻擋產碼 */ }
        if (repaired) this.setDirty(true);
        return repaired;
    },

    triggerCodeUpdateSync: function(forceUI = false) {
        try {
            if (!this.workspace || typeof Blockly === 'undefined') return this.lastCleanCode;
            
            this._repairZombieBlocks();
            let code = Blockly.Python.workspaceToCode(this.workspace);
            // 徹底清理：濾掉變數宣告預設值、行尾 ID 註解與運算式隱形標記
            code = code.replace(/^[a-zA-Z_][a-zA-Z0-9_]* = None(  # ID:.*)?\n/mg, '');
            code = code.replace(/\u0001ID:.*?\u0002/g, '');
            
            const isCodeChanged = code.trim() !== this.lastCleanCode;
            this.lastCleanCode = code.trim();

            if (window.CocoyaUI && window.CocoyaUI.renderPythonPreview) {
                // [關鍵修正] 保護輸入焦點，除非是強制更新 (例如點擊執行按鈕)
                const isInputActive = Blockly.WidgetDiv && Blockly.WidgetDiv.isVisible();
                
                if (forceUI || (!isInputActive && isCodeChanged)) {
                    window.CocoyaUI.renderPythonPreview(this.lastCleanCode);
                }
            }
            return this.lastCleanCode;
        } catch (e) {
            console.error('[Workspace] Sync Code Update failed:', e);
            const hint = this._describeCodegenError(e);
            alert(hint || ('Blockly to Python Error: ' + e.message + '\n' + e.stack));
            return this.lastCleanCode;
        }
    },

    /**
     * 將產碼例外轉為可行動的提示（2026-09-22，回傳 null 表示無更好訊息，交回原始 alert）。
     *
     * 典型情境：專案 XML 的平台與目前平台不符（多視窗共用 localStorage／預設 MicroPython），
     * 該平台模組未載入 → 積木被建成「空積木」→ 之後補上產生器產碼即爆
     * `Input "RESULT" doesn't exist on "py_ai_get_line_end"` 這類對使用者毫無意義的訊息。
     * 此處改為「列出目前平台未註冊的積木型別 + 平台提示」；原始錯誤仍完整輸出 console。
     *
     * 注意：修掉「平台未先切換就載入積木」的根因在 CocoyaApp.ensurePlatformForXml
     *      （persistence.checkAutoBackup / lifecycle._restoreReloadSnapshot）；本函式僅為
     *      殘餘情境（例如使用者手動把 PC 專案在 MicroPython 平台開啟）的降噪。
     * @param {Error} e 產碼時拋出的例外
     * @returns {string|null} 友善訊息或 null
     */
    _describeCodegenError: function(e) {
        try {
            const raw = (e && e.message) ? e.message : String(e);
            const m = raw.match(/Input "[^"]+" doesn't exist on "([^"]+)"/) ||
                      raw.match(/does not know how to generate code for block type "([^"]+)"/);
            if (!m || !this.workspace || typeof Blockly === 'undefined') return null;
            // 該型別有註冊卻缺 input → 不是平台問題（真正的產生器/積木契約錯誤）→ 不降噪
            if (Blockly.Blocks[m[1]]) return null;

            const types = [];
            this.workspace.getAllBlocks(false).forEach((b) => {
                if (!Blockly.Blocks[b.type] && types.indexOf(b.type) === -1) types.push(b.type);
            });
            if (types.length === 0) types.push(m[1]);

            const tpl = Blockly.Msg['MSG_CODEGEN_UNKNOWN_BLOCK'] ||
                '此專案含有目前平台未載入的積木：%1\n\n可能原因：專案平台與目前平台不符（PC / MicroPython）。\n請以「開啟專案」重新載入該專案，或確認專案內容。';
            return tpl.replace('%1', types.join(', '));
        } catch (err) {
            return null;
        }
    }
});
