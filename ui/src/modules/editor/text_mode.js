/**
 * modules/editor/text_mode.js — 純文字模式切換 SSOT（階段 C-2）
 *
 * 單向（不可逆）：積木 → 文字。切後 Blockly.dispose()，workspace 物件即銷毀，
 * 沒有「切回去」—— 離場只能經開新／開舊／回首頁（皆走既有 dirty 三選）。
 *
 * 流程（Q1 定案：三按鈕確認，不寫 temp_scripts）：
 *   dirty 才彈 showSaveConfirm（存／不存／取消）→ 存即 saveFile 落盤 →
 *   triggerCodeUpdateSync(true) 取新鮮碼 → 二次清理行尾 ID 註解 →
 *   createEditor.setValue → dispose ＋ body.cocoya-text-mode →
 *   退場（#block-type-info 隱藏、aria-label 顯式填充）。
 *
 * 載入方式與 editor.js 一致：純 script，掛 globalThis.CocoyaTextMode。
 */
(function (global) {
    'use strict';

    var editorHandle = null;
    var switching = false;

    function isTextMode() {
        try {
            return !!(document && document.body &&
                document.body.classList.contains('cocoya-text-mode'));
        } catch (e) { return false; }
    }

    function getEditor() { return editorHandle; }

    function readMsg(key, fallback) {
        try {
            if (global.Blockly && global.Blockly.Msg && global.Blockly.Msg[key]) {
                return global.Blockly.Msg[key];
            }
        } catch (e) {}
        return fallback;
    }

    /**
     * 二次清理：triggerCodeUpdateSync 只剝隱形標記與 X=None 行，
     * 行尾「兩個空格＋# ID:」註解執行無害但進編輯器會髒 —— 與複製鈕同款清理。
     */
    function stripIdComments(code) {
        return String(code == null ? '' : code).replace(/ {2}# ID:.*$/mg, '');
    }

    function ensureEditor() {
        if (editorHandle) return editorHandle;
        var root = document.getElementById('codeEditor');
        if (!root) return null;
        if (!global.CocoyaTextEditor || typeof global.CocoyaTextEditor.createEditor !== 'function') return null;
        editorHandle = global.CocoyaTextEditor.createEditor(root);
        return editorHandle;
    }

    function fillAriaLabel() {
        try {
            var input = document.querySelector('#codeEditor .editor-input');
            if (input) input.setAttribute('aria-label', readMsg('TLB_TEXT_MODE_EDITOR_LABEL', 'Python code editor'));
        } catch (e) {}
    }

    function retireBlockOnlyUi() {
        try {
            var info = document.getElementById('block-type-info');
            if (info) info.style.display = 'none';
        } catch (e) {}
        // 2026-10-10 版面重構：codeHeader 標題「程式碼預覽」→ 編輯器標籤
        //（✕ 與收合把手由 editor.css 在文字模式隱藏 —— 編輯器是唯一面板，不可收合）
        try {
            var title = document.getElementById('code-title');
            if (title) title.textContent = readMsg('TLB_TEXT_MODE_EDITOR_LABEL', 'Python text editor');
        } catch (e) {}
        // 防禦：進場前 codeArea 若處於收合（一般路徑按鈕不可達，僅極端競態），強制展開避免黑屏
        try {
            var panel = document.getElementById('codeArea');
            if (panel) panel.classList.remove('collapsed');
        } catch (e) {}
    }

    // --- C-3：檔頭平台行（Q3 選 A）---
    // 格式：首行 `# cocoya-platform: PC` 或 `# cocoya-platform: MicroPython`。
    // .py 無 platform 屬性，執行要走 run_python 還是 deploy_mcu 全靠此行。
    var PLATFORM_LINE_RE = /^#\s*cocoya-platform\s*:\s*(PC|MicroPython)\s*$/m;

    function parsePlatformLine(code) {
        try {
            var lines = String(code == null ? '' : code).split('\n');
            for (var i = 0; i < Math.min(lines.length, 5); i++) {
                var m = lines[i].match(/^#\s*cocoya-platform\s*:\s*(PC|MicroPython)\s*$/);
                if (m) return m[1];
            }
        } catch (e) {}
        return null;
    }

    function ensurePlatformLine(code, platform) {
        var src = String(code == null ? '' : code);
        var plat = (platform === 'MicroPython') ? 'MicroPython' : 'PC';
        if (PLATFORM_LINE_RE.test(src)) {
            return src.replace(PLATFORM_LINE_RE, '# cocoya-platform: ' + plat);
        }
        return '# cocoya-platform: ' + plat + '\n' + src;
    }

    /** heuristic：含 machine/utime/ujson 等 MicroPython 痕跡 → 預選 MicroPython */
    function guessPlatform(code) {
        try {
            if (/(import\s+machine|from\s+machine|utime|ujson|deploy_mcu|Pin\s*\()/i.test(String(code))) return 'MicroPython';
        } catch (e) {}
        return 'PC';
    }

    // --- D-1 開檔分叉（2026-10-10）---

    /**
     * 內容型別偵測（計畫 D-12：不可只看副檔名）。
     * Blockly 匯出 XML 恆以 `<xml` 或 `<?xml` 起頭（允許前置空白／BOM）；
     * 其餘一律視為 Python —— 含空檔（開空文字檔，勝過把 '' 塞給 textToDom 爆掉）。
     * @param {string} content 檔案內容
     * @returns {'xml'|'python'}
     */
    function detectContentKind(content) {
        return /^\s*<(\?xml|xml[\s>])/.test(String(content == null ? '' : content)) ? 'xml' : 'python';
    }

    /** QuickPick Promise 化（cancel 或無 UI 時回 null） */
    function quickPick(title, options) {
        return new Promise(function (resolve) {
            try {
                if (global.CocoyaUI && typeof global.CocoyaUI.showQuickPick === 'function') {
                    global.CocoyaUI.showQuickPick(title, options, function (id) { resolve(id); });
                    return;
                }
            } catch (e) {}
            resolve(null);
        });
    }

    /**
     * 拆掉 Blockly 側（minimap＋workspace）—— 進文字模式的共用退場。
     * workspace 銷毀後即為 null，下游（監聽、產碼、備份）全靠 null 護欄。
     */
    function disposeBlocklySide(app) {
        if (!app) return;
        try {
            if (app.minimap && typeof app.minimap.dispose === 'function') {
                try { app.minimap.dispose(); } catch (e) {}
            }
            app.minimap = null;
        } catch (e) {}
        try {
            if (app.workspace && typeof app.workspace.dispose === 'function') {
                app.workspace.dispose();
            }
        } catch (e) {}
        app.workspace = null;
    }

    /**
     * 切換為文字模式（單向）。@returns {Promise<boolean>} true=已切換
     */
    async function switchToTextMode() {
        if (switching || isTextMode()) return false;
        var app = global.CocoyaApp || window.CocoyaApp;
        if (!app || !app.workspace) return false;
        switching = true;
        try {
            // --- Q1：dirty 才彈三按鈕（存／不存／取消），不寫 temp_scripts ---
            var dirty = !!(app.isDirty);
            if (dirty) {
                var msg = readMsg('MSG_SAVE_CONFIRM', 'Do you want to save changes?');
                var choice = 'cancel';
                if (global.CocoyaUI && typeof global.CocoyaUI.showSaveConfirm === 'function') {
                    choice = await global.CocoyaUI.showSaveConfirm(msg);
                }
                if (choice === 'cancel') return false;
                if (choice === 'save') {
                    var saved = true;
                    try {
                        if (global.CocoyaBridge && typeof global.CocoyaBridge.send === 'function') {
                            saved = await global.CocoyaBridge.send('saveFile', {
                                xml: (typeof app._getCurrentXmlWithPlatform === 'function')
                                    ? app._getCurrentXmlWithPlatform() : ''
                            });
                        }
                    } catch (e) { saved = false; }
                    if (saved === false) return false;
                    try { if (typeof app.setDirty === 'function') await app.setDirty(false); } catch (e) {}
                }
            }
            // --- 二次確認：明示不可逆 ---
            var go = true;
            try {
                var tip = readMsg('TLB_TEXT_MODE_CONFIRM', 'Switch to text mode? Blocks cannot be restored.');
                if (global.CocoyaBridge && typeof global.CocoyaBridge.confirm === 'function') {
                    go = await global.CocoyaBridge.confirm(tip);
                } else if (typeof global.confirm === 'function') {
                    go = global.confirm(tip);
                }
            } catch (e) { go = false; }
            if (!go) return false;

            // --- 取新鮮碼（不可讀 lastCleanCode：debounce＋焦點保護可能 stale）---
            var code = '';
            try {
                if (typeof app.triggerCodeUpdateSync === 'function') {
                    code = app.triggerCodeUpdateSync(true) || '';
                } else {
                    code = app.lastCleanCode || '';
                }
            } catch (e) { code = app.lastCleanCode || ''; }
            code = stripIdComments(code);

            // --- 寫入編輯器（先建 handle，dispose 後再取 DOM 仍在）---
            var ed = ensureEditor();
            if (!ed) return false;
            ed.setValue(code);
            fillAriaLabel();

            // --- dispose ＋ 切 body class（CSS 接管版面）---
            disposeBlocklySide(app);
            try { document.body.classList.add('cocoya-text-mode'); } catch (e) {}
            retireBlockOnlyUi();
            try { if (typeof app.setDirty === 'function') await app.setDirty(true); } catch (e) {}
            return true;
        } finally {
            switching = false;
        }
    }

    /**
     * 開啟 .py 進入文字模式（D-1 controller.loadWorkspace 的 Python 內容入口）。
     * 不經 Blockly：直接 setValue＋切 class。
     */
    function enterTextModeWithCode(code) {
        if (isTextMode()) {
            var ed0 = ensureEditor();
            if (ed0) ed0.setValue(code);
            return !!ed0;
        }
        var ed = ensureEditor();
        if (!ed) return false;
        ed.setValue(code);
        fillAriaLabel();
        try { document.body.classList.add('cocoya-text-mode'); } catch (e) {}
        retireBlockOnlyUi();
        return true;
    }

    /**
     * 開啟 Python 檔內容進入文字模式（2026-10-10 D-1 開檔分叉）。
     * controller.loadWorkspace 在 detectContentKind === 'python' 時呼叫。
     *
     * 流程：VSIX 閘門 → 檔頭平台行（缺 → QuickPick，選定補寫）→ enterTextModeWithCode
     *       （先 enter 成功才 dispose，與快照還原同一順序契約）→ 平台/檔名/唯讀/dirty。
     * 取消（QuickPick null）或失敗一律回 false 且**不動現有工作區**（先確認後破壞）。
     * @param {Object} payload { code, filename, platform, isReadOnly }
     *   payload.platform 是後端 XML 嗅探值，Python 內容不採用（以檔頭行為準）。
     * @returns {Promise<boolean>} true=已進入文字模式
     */
    async function openPyFile(payload) {
        payload = payload || {};
        // --- 平台閘門（D-1 VSIX fallback）：無 editor 能力 → 提示用 VS Code 開，不動工作區 ---
        var caps = (global.CocoyaBridge && global.CocoyaBridge.capabilities) || {};
        if (!caps.supportsTextEditor) {
            var tip = readMsg('TLB_TEXT_MODE_OPEN_VSIX',
                'This build does not support text editing. Open .py files with VS Code.');
            try {
                if (global.CocoyaBridge && typeof global.CocoyaBridge.alert === 'function') {
                    global.CocoyaBridge.alert(tip);
                }
            } catch (e) {}
            return false;
        }

        var code = String(payload.code == null ? '' : payload.code);
        var platform = parsePlatformLine(code);
        if (!platform) {
            // 缺檔頭平台行（外部 .py）→ QuickPick 選平台，選定後補寫檔頭行
            var picked = await quickPick(
                readMsg('TLB_TEXT_MODE_PICK_PLATFORM',
                    'This Python file has no platform header. Choose a platform:'),
                [{ id: 'PC', label: 'PC (Python)' }, { id: 'MicroPython', label: 'MicroPython' }]
            );
            if (!picked) return false; // 取消 → 完全不動現有工作區
            platform = picked;
            code = ensurePlatformLine(code, platform);
        }

        // --- 進入文字模式（先 enter 成功、才拆 Blockly 側 —— 同快照還原順序契約）---
        var ok = enterTextModeWithCode(code);
        if (!ok) return false;
        var app = global.CocoyaApp || window.CocoyaApp;
        disposeBlocklySide(app);

        if (app) {
            app.currentPlatform = platform;
            try { app.updatePlatformLabel(); } catch (e) {}
            app.isReadOnly = !!payload.isReadOnly;
            // 唯讀鈕態與提示（與 loadWorkspace 同待遇）
            if (global.CocoyaUI && typeof global.CocoyaUI.setSaveButtonState === 'function') {
                var hint = app.isReadOnly
                    ? readMsg('MSG_READ_ONLY_HINT', '此檔案已被其他視窗開啟，目前為唯讀模式。')
                    : '';
                global.CocoyaUI.setSaveButtonState(!app.isReadOnly, hint);
            }
            if (app.isReadOnly) {
                try {
                    if (global.CocoyaBridge && typeof global.CocoyaBridge.alert === 'function') {
                        global.CocoyaBridge.alert(readMsg('MSG_READ_ONLY_ALERT',
                            '此檔案已被其他視窗開啟，將以唯讀模式載入。您可以使用「另存新檔」來編輯。'));
                    }
                } catch (e) {}
            }
        }
        try {
            if (global.CocoyaUI && typeof global.CocoyaUI.updateFileStatus === 'function') {
                global.CocoyaUI.updateFileStatus(payload.filename || '');
            }
        } catch (e) {}
        try { if (app && typeof app.setDirty === 'function') await app.setDirty(false); } catch (e) {}
        try { if (app && typeof app.hideStartupHome === 'function') app.hideStartupHome(); } catch (e) {}
        return true;
    }

    global.CocoyaTextMode = {
        isTextMode: isTextMode,
        getEditor: getEditor,
        switchToTextMode: switchToTextMode,
        enterTextModeWithCode: enterTextModeWithCode,
        // C-3 匯出（供存檔／開檔／守門呼叫；純函式，可單元測試）
        parsePlatformLine: parsePlatformLine,
        ensurePlatformLine: ensurePlatformLine,
        guessPlatform: guessPlatform,
        // D-1 匯出（開檔分叉與 editor_contract 守門）
        detectContentKind: detectContentKind,
        stripIdComments: stripIdComments,
        openPyFile: openPyFile
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
