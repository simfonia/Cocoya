/* editor.js - pure-text editor (plan S2/S5 A-3). pre overlay + textarea input. */
(function (global) {
    'use strict';
    function hl() {
        if (global.CocoyaPyHighlight && typeof global.CocoyaPyHighlight.highlightPython === 'function') return global.CocoyaPyHighlight;
        return null;
    }
    function readIndentWidth() {
        // 真相（2026-10-06 實查 config.js）：縮排只活在 Blockly.Python.INDENT
        // （toolbar #indent-selector 寫入，不持久化到 localStorage），
        // settingsKeys.js 根本無 INDENT key —— 故 Blockly 優先，無則回 4。
        try {
            if (global.Blockly && global.Blockly.Python && typeof global.Blockly.Python.INDENT === 'string') {
                if (global.Blockly.Python.INDENT === '  ') return 2;
                if (/^ +$/.test(global.Blockly.Python.INDENT)) return global.Blockly.Python.INDENT.length;
            }
        } catch (e) {}
        return 4;
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function createEditor(root) {
        if (!root || typeof root.querySelector !== 'function') return null;
        var input = root.querySelector('.editor-input');
        var pre = root.querySelector('.editor-highlight');
        var code = root.querySelector('.editor-highlight code');
        if (!input || !pre || !code) return null;
        var rafId = 0, disposed = false;
        function syncScroll() { pre.scrollTop = input.scrollTop; pre.scrollLeft = input.scrollLeft; }
        function renderNow() {
            rafId = 0;
            var h = hl();
            code.innerHTML = h ? h.highlightPython(input.value) : esc(input.value);
            syncScroll();
        }
        function scheduleRender() {
            if (disposed || rafId) return;
            var raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame.bind(global) : function (fn) { return setTimeout(fn, 16); };
            rafId = raf(renderNow);
        }
        function insertIndent(shift) {
            var pad = readIndentWidth() === 2 ? '  ' : '    ';
            var s = input.selectionStart, e = input.selectionEnd, v = input.value;
            if (s == null || e == null || s === e) {
                var pos = (s == null ? v.length : s);
                input.value = v.slice(0, pos) + pad + v.slice(pos);
                input.selectionStart = input.selectionEnd = pos + pad.length;
            } else {
                var ls = v.lastIndexOf('\n', s - 1) + 1, lines = v.slice(ls, e).split('\n'), d = 0, i;
                for (i = 0; i < lines.length; i++) {
                    if (shift) {
                        if (lines[i].slice(0, pad.length) === pad) { lines[i] = lines[i].slice(pad.length); d -= pad.length; }
                        else if (lines[i][0] === ' ' || lines[i][0] === '\t') { lines[i] = lines[i].slice(1); d -= 1; }
                    } else { lines[i] = pad + lines[i]; d += pad.length; }
                }
                input.value = v.slice(0, ls) + lines.join('\n') + v.slice(e);
                input.selectionStart = s + (shift ? 0 : pad.length);
                input.selectionEnd = e + d;
            }
            scheduleRender();
        }
        function onInput() { scheduleRender(); }
        function onScroll() { syncScroll(); }
        function onKey(e) { if (e && e.key === 'Tab') { e.preventDefault(); insertIndent(e.shiftKey); } }
        input.addEventListener('input', onInput);
        input.addEventListener('scroll', onScroll);
        input.addEventListener('keydown', onKey);
        scheduleRender();
        return {
            setValue: function (t) { input.value = String(t == null ? '' : t); scheduleRender(); },
            getValue: function () { return input.value; },
            setReadOnly: function (ro) { if (ro) input.setAttribute('readonly', 'readonly'); else input.removeAttribute('readonly'); },
            refresh: function () { renderNow(); },
            dispose: function () {
                disposed = true;
                input.removeEventListener('input', onInput);
                input.removeEventListener('scroll', onScroll);
                input.removeEventListener('keydown', onKey);
            }
        };
    }
    global.CocoyaTextEditor = { createEditor: createEditor, readIndentWidth: readIndentWidth };
})(typeof globalThis !== 'undefined' ? globalThis : this);
