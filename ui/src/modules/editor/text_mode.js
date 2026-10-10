/**
 * modules/editor/text_mode.js — 文字模式（「程式設計實驗室」模型，2026-10-10 重構）
 *
 * ★ 真相源永遠只有一個：block workspace 永不 dispose。
 *   文字模式只是疊在積木之上的一層「記憶體草稿」——隱藏積木區、把唯讀預覽面板
 *   換成可寫編輯器。退出即取消隱藏，積木與預覽原封不動還原（預覽同步自動成立，
 *   因積木從未被動過）。cocoya 不管理 .py：實驗室中的「存檔」＝匯出下載（blob）。
 *
 *   「單向」的真正定義：語意上程式不能自動轉回積木；但 UI 導航不受限 ——
 *   從實驗室「開一個 XML 檔」回到積木模式，那是「開啟另一個本質就是積木專案的
 *   XML 檔」，不是「把 .py 轉成積木」。
 *
 * 分層（計畫 §11.2，為將來 .py 受管化升級而設計）：
 *   Layer A「文字模式引擎」（本檔核心，永不 dispose，將來 100% 復用）：
 *     enterLab / exitLab / enterTextModeWithCode / exportPy / cleanPreviewCode
 *   Layer B「檔案 I/O 適配器」（現在只做匯出下載）＋純函式零件庫
 *     （parsePlatformLine / ensurePlatformLine / guessPlatform / detectContentKind，
 *      保留不刪，將來受管化直接復用）。
 *
 * 載入方式與 editor.js 一致：純 script，掛 globalThis.CocoyaTextMode。
 */
(function (global) {
    'use strict';

    var editorHandle = null;
    var seedCode = null;   // 進入實驗室時的種子碼（乾淨預覽碼），用於判斷草稿是否被改動
    var switching = false;

    function isTextMode() {
        try {
            return !!(document && document.body &&
                document.body.classList.contains('cocoya-text-mode'));
        } catch (e) { return false; }
    }

    function getEditor() { return editorHandle; }

    /** 取得進入實驗室時的種子碼（exitLab 的 dirty 判斷用） */
    function getSeedCode() { return seedCode; }

    function readMsg(key, fallback) {
        try {
            if (global.Blockly && global.Blockly.Msg && global.Blockly.Msg[key]) {
                return global.Blockly.Msg[key];
            }
        } catch (e) {}
        return fallback;
    }

    /**
     * 行尾 ID 註解清理：triggerCodeUpdateSync 只剝隱形標記，行尾「兩空格＋# ID:」註解
     * 執行無害但進編輯器會髒 —— 與複製鈕同款清理。
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
        // 防禦：進場前 codeArea 若處於收合（僅極端競態），強制展開避免黑屏
        try {
            var panel = document.getElementById('codeArea');
            if (panel) panel.classList.remove('collapsed');
        } catch (e) {}
    }

    // --- 純函式零件庫（Layer B；保留不刪，將來 .py 受管化直接復用）---

    /** 檔頭平台行格式：`# cocoya-platform: PC` 或 `# cocoya-platform: MicroPython` */
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

    /**
     * 內容型別偵測（不可只看副檔名）。Blockly 匯出 XML 恆以 `<xml` 或 `<?xml` 起頭
     * （允許前置空白／BOM）；其餘一律視為 Python —— 含空檔。
     * @param {string} content
     * @returns {'xml'|'python'}
     */
    function detectContentKind(content) {
        return /^\s*<(\?xml|xml[\s>])/.test(String(content == null ? '' : content)) ? 'xml' : 'python';
    }
    // --- Layer A：實驗室引擎（永不 dispose）---

    /**
     * 取「目前乾淨預覽碼」—— SSOT，供複製鈕、進入實驗室、執行共用。
     * 不可讀 lastCleanCode（debounce＋焦點保護可能 stale）；取後做行尾 ID 註解清理。
     */
    function cleanPreviewCode() {
        var app = global.CocoyaApp || window.CocoyaApp;
        var code = '';
        try {
            if (app && typeof app.triggerCodeUpdateSync === 'function') {
                code = app.triggerCodeUpdateSync(true) || '';
            } else if (app) {
                code = app.lastCleanCode || '';
            }
        } catch (e) { code = (app && app.lastCleanCode) || ''; }
        return stripIdComments(code);
    }

    /**
     * 還原積木側 UI（exitLab 與檔案作業護欄共用）—— 只是 UI，不碰 workspace。
     * workspace 從未 dispose，故無需 re-inject。
     */
    function restoreBlockUi() {
        try {
            var info = document.getElementById('block-type-info');
            if (info) info.style.display = '';
        } catch (e) {}
        // codeHeader 標題還原為「程式碼預覽」（與 retireBlockOnlyUi 對稱）
        try {
            var title = document.getElementById('code-title');
            if (title) title.textContent = readMsg('TLB_PYTHON_PREVIEW', 'Code preview');
        } catch (e) {}
        // 積木還原可見後刷新 minimap（隱藏期間可能未同步）
        try {
            var app = global.CocoyaApp || window.CocoyaApp;
            if (app && app.minimap && typeof app.refreshMinimap === 'function') app.refreshMinimap();
        } catch (e) {}
    }

    /**
     * 切換實驗室（btn-text-mode 單一入口）。@returns {Promise<boolean>}
     * 目前在積木模式 → 進入實驗室；目前在實驗室 → 退出（草稿有改動先確認捨棄）。
     */
    async function toggleTextMode() {
        if (switching) return false;
        if (isTextMode()) return exitLab();
        return enterLab();
    }

    /**
     * 進入實驗室：以目前乾淨預覽碼為種子，顯示編輯器、隱藏積木區。
     * ★ 不 dispose workspace（實驗室模型核心）。@returns {Promise<boolean>}
     */
    async function enterLab() {
        if (switching || isTextMode()) return false;
        var app = global.CocoyaApp || window.CocoyaApp;
        if (!app || !app.workspace) return false;   // 必須有活著的積木工作區（實驗室基底）
        switching = true;
        try {
            var code = cleanPreviewCode();
            var ed = ensureEditor();
            if (!ed) return false;
            ed.setValue(code);
            seedCode = code;                         // 記錄種子，exitLab 判斷草稿是否被改動
            fillAriaLabel();
            try { document.body.classList.add('cocoya-text-mode'); } catch (e) {}
            retireBlockOnlyUi();
            return true;
        } finally {
            switching = false;
        }
    }

    /**
     * 退出實驗室：取消隱藏，積木與預覽原封不動還原（workspace 從未動過）。
     * 草稿若相對種子有改動 → 先確認捨棄（cocoya 不管理 .py，離開即丟草稿）。
     * @returns {Promise<boolean>} true=已退出
     */
    async function exitLab() {
        if (!isTextMode()) return false;
        var ed = getEditor();
        var dirty = !!(ed && typeof ed.getValue === 'function' && ed.getValue() !== seedCode);
        if (dirty) {
            var go = true;
            try {
                var tip = readMsg('TLB_TEXT_MODE_EXIT_CONFIRM',
                    'Leave the code lab? Your edits here are not saved to any file and will be discarded.');
                if (global.CocoyaBridge && typeof global.CocoyaBridge.confirm === 'function') {
                    go = await global.CocoyaBridge.confirm(tip);
                } else if (typeof global.confirm === 'function') {
                    go = global.confirm(tip);
                }
            } catch (e) { go = false; }
            if (!go) return false;
        }
        try { document.body.classList.remove('cocoya-text-mode'); } catch (e) {}
        restoreBlockUi();
        seedCode = null;
        return true;
    }

    /**
     * 同步還原積木 UI（無草稿確認）—— 供檔案作業護欄（開檔/開新/範例/回首頁）呼叫。
     * 這些是明確導航動作，dirty 由各流程既有機制處理，此處只把疊加層移除。
     */
    function restoreBlockUiOnly() {
        if (!isTextMode()) return;
        try { document.body.classList.remove('cocoya-text-mode'); } catch (e) {}
        restoreBlockUi();
        seedCode = null;
    }

    /**
     * 匯出實驗室內容為 .py（blob 下載，非受管、不錨定）—— Layer B 現行實作。
     * @returns {boolean} true=已觸發下載
     */
    function exportPy() {
        var ed = getEditor();
        var code = (ed && typeof ed.getValue === 'function') ? ed.getValue() : '';
        try {
            var app = global.CocoyaApp || window.CocoyaApp;
            var plat = (app && app.currentPlatform) || 'PC';
            code = ensurePlatformLine(code, plat);   // 檔頭平台行（零件庫純函式）
        } catch (e) {}
        try {
            var filename = 'cocoya_code.py';
            try {
                var ui = global.CocoyaUI || window.CocoyaUI;
                var base = (ui && ui.currentFilename) ? String(ui.currentFilename).replace(/\.[^.]+$/, '') : '';
                if (base) filename = base + '.py';
            } catch (e) {}
            var blob = new Blob([code], { type: 'text/x-python;charset=utf-8' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 0);
            return true;
        } catch (e) { return false; }
    }

    /**
     * 以指定碼進入實驗室（reload 快照還原用；不再 dispose workspace）。
     * 已在實驗室則僅更新編輯器內容。
     */
    function enterTextModeWithCode(code) {
        if (isTextMode()) {
            var ed0 = ensureEditor();
            if (ed0) ed0.setValue(code);
            seedCode = code;
            return !!ed0;
        }
        var ed = ensureEditor();
        if (!ed) return false;
        ed.setValue(code);
        seedCode = code;
        fillAriaLabel();
        try { document.body.classList.add('cocoya-text-mode'); } catch (e) {}
        retireBlockOnlyUi();
        return true;
    }

    global.CocoyaTextMode = {
        isTextMode: isTextMode,
        getEditor: getEditor,
        getSeedCode: getSeedCode,
        // Layer A：實驗室引擎（永不 dispose）
        toggleTextMode: toggleTextMode,
        enterLab: enterLab,
        exitLab: exitLab,
        enterTextModeWithCode: enterTextModeWithCode,
        // 檔案作業護欄（開檔/開新/範例/回首頁前，同步還原積木 UI，無草稿確認）
        restoreBlockUiOnly: restoreBlockUiOnly,
        // 共用取碼（複製鈕與進入實驗室共用，兌現 SSOT）
        cleanPreviewCode: cleanPreviewCode,
        // Layer B：.py 匯出（現行為 blob 下載）
        exportPy: exportPy,
        // 純函式零件庫（保留不刪，將來 .py 受管化直接復用）
        parsePlatformLine: parsePlatformLine,
        ensurePlatformLine: ensurePlatformLine,
        guessPlatform: guessPlatform,
        detectContentKind: detectContentKind,
        stripIdComments: stripIdComments
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);

