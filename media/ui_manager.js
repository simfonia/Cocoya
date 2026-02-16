/**
 * Cocoya UI 渲染與同步管理器
 * 負責處理 Python 預覽渲染、積木導航、工具列互動與 i18n
 */
window.CocoyaUI = {
    /** @type {Map<string, HTMLElement>} 積木 ID 到程式碼行 DOM 的映射表 */
    blockToLineMap: new Map(),
    
    /** @type {string} 目前編輯的檔案名稱 */
    currentFilename: '',

    /** @type {boolean} 是否處於未儲存狀態 */
    isDirty: false,

    /** @type {string} GitHub 更新下載網址 */
    updateUrl: '',

    /** @type {string} 基礎媒體資源路徑 */
    /**
     * 更新序列埠下拉選單
     * @param {string[]} ports 序列埠名稱列表
     */
    updateSerialPorts: function(ports) {
        const selector = document.getElementById('serial-selector');
        if (!selector) return;

        // 保留目前選中的值 (若存在)
        const currentValue = selector.value;
        selector.innerHTML = '';

        if (ports.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '(No Port)';
            selector.appendChild(opt);
        } else {
            ports.forEach(port => {
                const opt = document.createElement('option');
                opt.value = port;
                opt.textContent = port;
                selector.appendChild(opt);
            });
        }

        // 嘗試恢復選中狀態
        if (currentValue && ports.includes(currentValue)) {
            selector.value = currentValue;
        }
    },

    mediaUri: '',

    /**
     * 更新 Python 代碼預覽區域
     * @param {string} rawCode Blockly 產出的原始碼 (包含隱藏的 ID 標記)
     */
    renderPythonPreview: function(rawCode) {
        const codeContent = document.getElementById('codeContent');
        const indentSize = (typeof Blockly !== 'undefined' && Blockly.Python) ? 
            Blockly.Python.INDENT.length : 4;

        if (!codeContent) return;

        // 使用原始換行分割，確保 1:1 行號
        let lines = rawCode.split('\n');
        
        // 如果最後一行是空字串（因為 split '\n' 的特性），則移除它
        if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

        codeContent.innerHTML = '';
        this.blockToLineMap.clear();

        lines.forEach((line) => {
            // 解析並提取 ID，同時取得乾淨的代碼列
            const result = window.CocoyaUtils.extractIds(line);
            const { cleanLine, ids } = result;

            // 建立行容器
            const lineDiv = document.createElement('div');
            lineDiv.className = 'code-line';
            
            // 只要不是全空白行，就進行處理，否則顯示空行佔位
            if (cleanLine.length > 0) {
                // 解析縮排對齊線 (動態對齊 indentSize)
                const leadingSpaceMatch = cleanLine.match(/^(\s+)/);
                const leadingSpaces = leadingSpaceMatch ? leadingSpaceMatch[1].length : 0;
                const actualCode = cleanLine.substring(leadingSpaces);
                
                let guideHtml = '';
                const spaces = '&nbsp;'.repeat(indentSize);
                for (let i = 0; i < leadingSpaces; i += indentSize) {
                    guideHtml += `<span class="indent-guide" style="width: ${indentSize}ch;">${spaces}</span>`;
                }

                // 剩餘代碼進行語法高亮
                const highlighted = hljs.highlight(actualCode, { language: 'python' }).value;
                lineDiv.innerHTML = guideHtml + highlighted;
            } else {
                lineDiv.innerHTML = '&nbsp;'; 
            }

            // 同步目前的選取狀態
            const selectedId = (typeof Blockly !== 'undefined' && Blockly.getSelected()) ? Blockly.getSelected().id : null;

            ids.forEach(id => {
                lineDiv.setAttribute('data-block-id', id);
                // 記錄積木 ID 與 DOM 的映射 (只記錄第一次出現的行)
                if (!this.blockToLineMap.has(id)) {
                    this.blockToLineMap.set(id, lineDiv);
                }
                
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
        
        // 檔名狀態現在由 VS Code 頁籤顯示，不再需要更新前端 DOM
    },

    /**
     * 處理 HTML 中的 i18n 佔位符 (%{BKY_...})
     * 會掃描所有的 title 屬性、span 內容以及 option 內容
     */
    applyI18n: function() {
        if (typeof Blockly === 'undefined') return;
        
        const elements = document.querySelectorAll('[title^="%{BKY_"], span, option');
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
     * 更新執行按鈕的 Tooltip
     * @param {string} platform 
     */
    updateRunTooltip: function(platform) {
        const btn = document.getElementById('btn-run');
        if (!btn || typeof Blockly === 'undefined') return;
        
        // 修正判定條件：選單的值是 CircuitPython
        const isMCU = (platform === 'MCU' || platform === 'CircuitPython');
        const key = isMCU ? 'TLB_RUN_MCU' : 'TLB_RUN_PC';
        const tip = Blockly.Msg[key] || (isMCU ? 'Upload to MCU' : 'Run PC Program');
        btn.setAttribute('title', tip);
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
                    const dom = Blockly.Xml.workspaceToDom(Blockly.getMainWorkspace());
                    // 注入平台屬性標記 (PC 或 CircuitPython)
                    const platform = document.getElementById('platform-selector')?.value || 'PC';
                    dom.setAttribute('platform', platform);
                    
                    msg.xml = Blockly.Xml.domToPrettyText(dom);
                }

                // 4. 若需要程式碼 (執行程式)
                if (cmd === 'runCode' && typeof Blockly !== 'undefined') {
                    // 使用 CocoyaApp 處理過的乾淨代碼，確保行號與 Preview 一致且縮排正確
                    msg.code = window.CocoyaApp.lastCleanCode || Blockly.Python.workspaceToCode(Blockly.getMainWorkspace());
                    msg.platform = document.getElementById('platform-selector')?.value || 'PC';
                    msg.serialPort = document.getElementById('serial-selector')?.value || '';
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
        bind('btn-refresh-serial', 'refreshSerialPorts');
        bind('btn-run', 'runCode');
        bind('btn-update', 'checkUpdate');

        // 綁定複製程式碼按鈕
        const copyBtn = document.getElementById('btn-copy-code');
        if (copyBtn) {
            copyBtn.onclick = () => {
                const rawCode = window.CocoyaApp.lastCleanCode || '';
                // 徹底清理：濾掉行尾 ID 註解與運算式隱形標記
                const cleanCode = rawCode.replace(/  # ID:.*$/mg, '').replace(/\u0001ID:.*?\u0002/g, '');
                
                navigator.clipboard.writeText(cleanCode).then(() => {
                    self.flashButton('btn-copy-code', '#c8e6c9'); // 綠色閃爍表示成功
                });
            };
        }
        
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
