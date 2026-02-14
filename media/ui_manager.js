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
    },

    /**
     * 設定髒狀態 (Dirty State) UI 反饋
     * @param {boolean} isDirty 
     */
    setDirty: function(isDirty) {
        this.isDirty = isDirty;
        const saveBtn = document.getElementById('btn-save');
        if (saveBtn) {
            saveBtn.style.borderBottom = isDirty ? '2px solid #FE2F89' : 'none';
        }
        this.updateFileStatus();
    },

    /**
     * 更新檔名顯示與 Dirty 標記
     * @param {string} filename 
     */
    updateFileStatus: function(filename) {
        if (filename !== undefined) this.currentFilename = filename;
        if (!this.currentFilename || this.currentFilename === 'New Project') {
            this.currentFilename = Blockly.Msg['TLB_FILE_NEW'] || 'New Project';
        }
        
        const el = document.getElementById('file-status');
        if (el) {
            el.textContent = this.currentFilename + (this.isDirty ? ' *' : '');
        }
    },

    /**
     * 處理 HTML 中的 i18n 佔位符 (%{BKY_...})
     */
    applyI18n: function() {
        const elements = document.querySelectorAll('[title^="%{BKY_"], span');
        elements.forEach(el => {
            // 處理 title
            const title = el.getAttribute('title');
            if (title && title.startsWith('%{BKY_')) {
                const key = title.substring(6, title.length - 1);
                if (Blockly.Msg[key]) el.setAttribute('title', Blockly.Msg[key]);
            }
            // 處理內容 (Header)
            if (el.textContent && el.textContent.startsWith('%{BKY_')) {
                const key = el.textContent.substring(6, el.textContent.length - 1);
                if (Blockly.Msg[key]) el.textContent = Blockly.Msg[key];
            }
        });
    },

    currentFilename: '',
    isDirty: false,

    /**
     * 閃爍效果 (Feedback)
     * @param {string} btnId 
     * @param {string} color 
     */
    flashButton: function(btnId, color) {
        const btn = document.getElementById(btnId);
        if (btn) {
            const originalBg = btn.style.backgroundColor;
            btn.style.backgroundColor = color;
            setTimeout(() => {
                btn.style.backgroundColor = originalBg;
            }, 300);
        }
    },

    /**
     * 設定更新狀態 UI
     * @param {Object} data { hasUpdate: boolean, currentVersion: string, latestVersion: string, url: string }
     */
    setUpdateStatus: function(data) {
        const btn = document.getElementById('btn-update');
        if (!btn) return;

        this.updateUrl = data.url;
        
        if (data.hasUpdate) {
            btn.classList.add('update-blink', 'update-available');
            btn.classList.remove('update-latest');
            const tipTemplate = Blockly.Msg['MSG_UPDATE_AVAILABLE_TOOLTIP'] || 'New version (%1). Click to download.';
            btn.setAttribute('title', tipTemplate.replace('%1', 'v' + data.latestVersion));
        } else {
            btn.classList.remove('update-blink', 'update-available');
            btn.classList.add('update-latest');
            const tipTemplate = Blockly.Msg['MSG_UPDATE_LATEST_TOOLTIP'] || 'Already up to date (%1)';
            btn.setAttribute('title', tipTemplate.replace('%1', 'v' + data.currentVersion));
        }
    },

    updateUrl: '',

    /**
     * 初始化工具列事件綁定
     * @param {Function} postMessageFunc 
     */
    initToolbar: function(postMessageFunc) {
        const bind = (id, cmd, getXml = false) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.onclick = () => {
                if (id === 'btn-update' && this.updateUrl && el.classList.contains('update-available')) {
                    postMessageFunc({ command: 'openExternal', url: this.updateUrl });
                    return;
                }
                const msg = { 
                    command: cmd,
                    isDirty: this.isDirty 
                };
                if (getXml) {
                    const xmlText = Blockly.Xml.domToPrettyText(Blockly.Xml.workspaceToDom(Blockly.getMainWorkspace()));
                    msg.xml = xmlText;
                }
                if (cmd === 'runCode') {
                    msg.code = Blockly.Python.workspaceToCode(Blockly.getMainWorkspace());
                    this.flashButton(id, '#e8f5e9'); // 淺綠色閃爍
                }
                postMessageFunc(msg);
            };
        };

        bind('btn-new', 'newFile', true);
        bind('btn-open', 'openFile', true);
        bind('btn-save', 'saveFile', true);
        bind('btn-save-as', 'saveFileAs', true);
        bind('btn-settings', 'setPythonPath');
        bind('btn-run', 'runCode');
        bind('btn-update', 'checkUpdate');
        
        const stopBtn = document.getElementById('btn-stop');
        if (stopBtn) {
            stopBtn.onclick = () => {
                const xmlText = Blockly.Xml.domToPrettyText(Blockly.Xml.workspaceToDom(Blockly.getMainWorkspace()));
                this.flashButton('btn-stop', '#ffebee'); // 淺紅色閃爍
                postMessageFunc({ 
                    command: 'closeEditor', 
                    isDirty: this.isDirty,
                    xml: xmlText
                });
            };
        }
    }
};
