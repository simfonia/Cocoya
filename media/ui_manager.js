/**
 * Cocoya UI 渲染與同步管理器
 * 負責處理 Python 預覽渲染、積木導航、工具列互動與 i18n
 */
window.CocoyaUI = {
    /** @type {Map<string, HTMLElement>} 積木 ID 到程式碼行 DOM 的映射表 */
    blockToLineMap: new Map(),
    
    /** @type {string[]} 用於累積空行處積木 ID 的暫存陣列 */
    pendingIds: [],

    /** @type {string} 目前編輯的檔案名稱 */
    currentFilename: '',

    /** @type {boolean} 是否處於未儲存狀態 */
    isDirty: false,

    /** @type {string} GitHub 更新下載網址 */
    updateUrl: '',

    /** @type {string} 基礎媒體資源路徑 */
    mediaUri: '',

    /**
     * 更新 Python 代碼預覽區域
     * @param {string} rawCode Blockly 產出的原始碼 (包含隱藏的 ID 標記)
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
            const { cleanLine, ids } = result;
            
            let blockIdsOnThisLine = [...this.pendingIds, ...ids];
            this.pendingIds = [];

            // 處理空行中的 ID 累積 (將 ID 延後到下一個有內容的行顯示)
            if (cleanLine.trim() === '' && blockIdsOnThisLine.length > 0) {
                this.pendingIds = blockIdsOnThisLine;
                return;
            }
            if (cleanLine.trim() === '' && blockIdsOnThisLine.length === 0) return;

            // 建立行容器
            const lineDiv = document.createElement('div');
            lineDiv.className = 'code-line';
            
            if (cleanLine.trim() !== '') {
                lineDiv.innerHTML = hljs.highlight(cleanLine, { language: 'python' }).value;
            } else {
                lineDiv.textContent = ' ';
            }

            // 同步目前的選取狀態
            const selectedId = (typeof Blockly !== 'undefined' && Blockly.getSelected()) ? Blockly.getSelected().id : null;

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
     * @param {string} blockId 積木 ID
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
     * @param {boolean} isDirty 是否已修改
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
     * 更新檔名顯示與 Dirty 標記 (*)
     * @param {string} [filename] 新檔名，若省略則維持現狀
     */
    updateFileStatus: function(filename) {
        if (filename !== undefined) this.currentFilename = filename;
        
        // 使用 i18n 文字作為預設檔名
        let displayName = this.currentFilename;
        if (!displayName || displayName === 'New Project') {
            displayName = (typeof Blockly !== 'undefined' && Blockly.Msg['TLB_FILE_NEW']) || 'Untitled Project';
        }
        
        const el = document.getElementById('file-status');
        if (el) {
            el.textContent = displayName + (this.isDirty ? ' *' : '');
        }
    },

    /**
     * 處理 HTML 中的 i18n 佔位符 (%{BKY_...})
     * 會掃描所有的 title 屬性與 span 內容
     */
    applyI18n: function() {
        if (typeof Blockly === 'undefined') return;
        
        const elements = document.querySelectorAll('[title^="%{BKY_"], span');
        elements.forEach(el => {
            // 1. 處理 Tooltip (title)
            const title = el.getAttribute('title');
            if (title && title.startsWith('%{BKY_')) {
                const key = title.substring(6, title.length - 1);
                if (Blockly.Msg[key]) el.setAttribute('title', Blockly.Msg[key]);
            }
            
            // 2. 處理文字內容 (textContent)
            const text = el.textContent;
            if (text && text.startsWith('%{BKY_')) {
                const key = text.substring(6, text.length - 1);
                if (Blockly.Msg[key]) el.textContent = Blockly.Msg[key];
            }
        });
    },

    /**
     * 閃爍按鈕背景色提供回饋
     * @param {string} btnId 按鈕 ID
     * @param {string} color 閃爍顏色
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
     * 設定更新狀態 UI (包含按鈕閃爍、顏色與 Tooltip)
     * @param {Object} data 更新資訊
     * @param {boolean} data.hasUpdate 是否有新版本
     * @param {string} data.currentVersion 目前版本
     * @param {string} data.latestVersion 最新版本
     * @param {string} data.url 下載網址
     */
    setUpdateStatus: function(data) {
        const btn = document.getElementById('btn-update');
        if (!btn || typeof Blockly === 'undefined') return;

        this.updateUrl = data.url;
        const hoverIcon = btn.querySelector('.hover-icon');
        const base = this.mediaUri || '';
        
        if (data.hasUpdate) {
            btn.classList.add('update-blink', 'update-available');
            btn.classList.remove('update-latest');
            const template = Blockly.Msg['MSG_UPDATE_AVAILABLE_TOOLTIP'] || 'New version (%1). Click to download.';
            btn.setAttribute('title', template.replace('%1', 'v' + data.latestVersion));
        } else {
            btn.classList.remove('update-blink', 'update-available');
            btn.classList.add('update-latest');
            const template = Blockly.Msg['MSG_UPDATE_LATEST_TOOLTIP'] || 'Already up to date (%1)';
            btn.setAttribute('title', template.replace('%1', 'v' + data.currentVersion));
        }
    },

    /**
     * 初始化工具列事件綁定
     * @param {Function} postMessageFunc Webview 通訊函式
     */
    initToolbar: function(postMessageFunc) {
        const self = this;
        
        /**
         * 綁定按鈕點擊事件的內部輔助函式
         */
        const bind = (id, cmd, options = {}) => {
            const el = document.getElementById(id);
            if (!el) return;
            
            el.onclick = () => {
                // 1. 處理外部連結 (更新按鈕)
                if (id === 'btn-update' && self.updateUrl && el.classList.contains('update-available')) {
                    postMessageFunc({ command: 'openExternal', url: self.updateUrl });
                    return;
                }

                // 2. 準備訊息酬載
                const msg = { 
                    command: cmd,
                    isDirty: self.isDirty 
                };

                // 3. 若需要 XML (檔案操作)
                if (options.includeXml && typeof Blockly !== 'undefined') {
                    msg.xml = Blockly.Xml.domToPrettyText(Blockly.Xml.workspaceToDom(Blockly.getMainWorkspace()));
                }

                // 4. 若需要程式碼 (執行程式)
                if (cmd === 'runCode' && typeof Blockly !== 'undefined') {
                    msg.code = Blockly.Python.workspaceToCode(Blockly.getMainWorkspace());
                    self.flashButton(id, '#e8f5e9'); // 綠色回饋
                }

                postMessageFunc(msg);
            };
        };

        // 綁定檔案操作
        bind('btn-new', 'newFile', { includeXml: true });
        bind('btn-open', 'openFile', { includeXml: true });
        bind('btn-save', 'saveFile', { includeXml: true });
        bind('btn-save-as', 'saveFileAs', { includeXml: true });
        
        // 綁定設定與功能按鈕
        bind('btn-settings', 'setPythonPath');
        bind('btn-run', 'runCode');
        bind('btn-update', 'checkUpdate');
        
        // 綁定關閉按鈕
        const stopBtn = document.getElementById('btn-stop');
        if (stopBtn) {
            stopBtn.onclick = () => {
                const xml = (typeof Blockly !== 'undefined') ? 
                    Blockly.Xml.domToPrettyText(Blockly.Xml.workspaceToDom(Blockly.getMainWorkspace())) : '';
                
                self.flashButton('btn-stop', '#ffebee'); // 紅色回饋
                postMessageFunc({ 
                    command: 'closeEditor', 
                    isDirty: self.isDirty,
                    xml: xml
                });
            };
        }
    }
};
