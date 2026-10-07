/**
 * modules/editor/highlight.js — Python 語法高亮 tokenizer（純函式）
 *
 * 計畫 §3：自寫約 150 行，零新增相依（不引入 CodeMirror/Monaco）。
 * 輸出為 HTML 字串，**必經 HTML escape**（< > &），否則程式碼內容會破版或形成 XSS。
 *
 * 處理範圍：關鍵字 / 字串（含三引號、f 前綴、跳脫、未閉合）/ 註解（#）/ 數字 /
 * 內建函式與常用模組（含 MicroPython 名稱）/ 運算子。
 *
 * 載入方式與其他 ui 模組一致：純 script，掛到 globalThis（測試以 new Function 載入）。
 * ⚠️ 檔內註解刻意不寫「星號＋斜線」字面序列（AGENTS.md：會提前閉合區塊註解）。
 */
(function (global) {
    'use strict';

    /** HTML escape：tokenizer 輸出的唯一進出口 */
    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // Python 關鍵字（含 MicroPython 常用語法詞）
    var KEYWORDS = new Set([
        'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
        'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from',
        'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not',
        'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
        'True', 'False', 'None'
    ]);

    // 內建函式 / 常用模組與名稱（含 MicroPython：machine、Pin、UART…）
    var BUILTINS = new Set([
        'print', 'len', 'range', 'int', 'str', 'float', 'bool', 'list',
        'dict', 'set', 'tuple', 'input', 'open', 'type', 'isinstance',
        'enumerate', 'zip', 'map', 'filter', 'sorted', 'reversed', 'abs',
        'min', 'max', 'sum', 'round', 'format', 'repr', 'hash',
        'id', 'super', 'property', 'staticmethod', 'classmethod',
        'Exception', 'ValueError', 'TypeError', 'KeyError', 'IndexError',
        'RuntimeError', 'StopIteration', 'NotImplementedError',
        // 常用模組名
        'math', 'random', 'time', 'os', 'sys', 'json', 're', 'collections',
        'itertools', 'functools', 'threading', 'subprocess',
        // MicroPython / 硬體
        'machine', 'Pin', 'UART', 'SPI', 'I2C', 'ADC', 'PWM', 'Timer',
        'RTC', 'WDT', 'Signal', 'mem8', 'mem16', 'mem32', 'light',
        'network', 'ujson', 'usys', 'utime', 'uio', 'ustruct', 'ubinascii',
        'gc', 'micropython', 'const', 'esp32', 'esp8266', 'pyb'
    ]);

    function isDigit(ch) { return ch >= '0' && ch <= '9'; }
    function isHexDigit(ch) {
        return isDigit(ch) || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F');
    }
    function isIdentStart(ch) {
        return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
    }
    function isIdentPart(ch) {
        return isIdentStart(ch) || isDigit(ch);
    }

    /**
     * 將 Python 原始碼高亮為 HTML。
     * @param {string} code 原始碼
     * @returns {string} 已 escape 的 HTML（span.tok-* 標記 token）
     */
    function highlightPython(code) {
        var src = String(code == null ? '' : code);
        var out = '';
        var i = 0;
        var n = src.length;

        while (i < n) {
            var ch = src[i];

            // --- 註解：# 到行尾 ---
            if (ch === '#') {
                var nl = src.indexOf('\n', i);
                if (nl === -1) nl = n;
                out += '<span class="tok-comment">' + escapeHtml(src.slice(i, nl)) + '</span>';
                i = nl;
                continue;
            }

            // --- 字串：含前綴（f/r/b/u/fr/rb…）與三引號 ---
            var strMatch = matchString(src, i);
            if (strMatch) {
                out += '<span class="tok-string">' + escapeHtml(strMatch.text) + '</span>';
                i = strMatch.end;
                continue;
            }

            // --- 數字（含 0x / 0b / 小數 / 指數 / 底線分隔） ---
            if (isDigitStart(src, i)) {
                var numEnd = scanNumber(src, i);
                out += '<span class="tok-number">' + escapeHtml(src.slice(i, numEnd)) + '</span>';
                i = numEnd;
                continue;
            }

            // --- 識別字：關鍵字 / 內建 / 一般標識字 ---
            if (isIdentStart(ch)) {
                var idEnd = i + 1;
                while (idEnd < n && isIdentPart(src[idEnd])) idEnd++;
                var word = src.slice(i, idEnd);
                if (KEYWORDS.has(word)) {
                    out += '<span class="tok-keyword">' + escapeHtml(word) + '</span>';
                } else if (BUILTINS.has(word)) {
                    out += '<span class="tok-builtin">' + escapeHtml(word) + '</span>';
                } else {
                    out += escapeHtml(word);
                }
                i = idEnd;
                continue;
            }

            // --- 運算子（成組輸出，如 ** // <= >= == != -> :=） ---
            if ('+-*/%=<>!&|^~@'.indexOf(ch) !== -1) {
                var opEnd = i + 1;
                while (opEnd < n && '+-*/%=<>!&|^~@'.indexOf(src[opEnd]) !== -1) opEnd++;
                out += '<span class="tok-operator">' + escapeHtml(src.slice(i, opEnd)) + '</span>';
                i = opEnd;
                continue;
            }

            // --- 其餘（空白、括號、逗號、點…）只 escape 不包 span ---
            out += escapeHtml(ch);
            i++;
        }
        return out;
    }
    /**
     * 掃描數字終點：0x1F、0b1010、1_000、3.14、1e-9、2j（複數）等。
     * 非法格式只會少抓（退回逐字元），不會誤吞後續程式碼。
     */
    function scanNumber(src, i) {
        var n = src.length;
        var j = i;
        // 十六/八/二進位前綴
        if (src[j] === '0' && j + 1 < n && (src[j + 1] === 'x' || src[j + 1] === 'X' ||
            src[j + 1] === 'b' || src[j + 1] === 'B' || src[j + 1] === 'o' || src[j + 1] === 'O')) {
            j += 2;
            while (j < n && (isHexDigit(src[j]) || src[j] === '_')) j++;
            return j;
        }
        while (j < n && (isDigit(src[j]) || src[j] === '_')) j++;
        if (j < n && src[j] === '.') {
            j++;
            while (j < n && (isDigit(src[j]) || src[j] === '_')) j++;
        }
        if (j < n && (src[j] === 'e' || src[j] === 'E')) {
            var k = j + 1;
            if (k < n && (src[k] === '+' || src[k] === '-')) k++;
            if (k < n && isDigit(src[k])) {
                j = k;
                while (j < n && isDigit(src[j])) j++;
            }
        }
        if (j < n && (src[j] === 'j' || src[j] === 'J')) j++; // 複數
        return j;
    }

    /** 數字起始：數字，或 '.' 後接數字（避免把 1.5 的點拆成運算子） */
    function isDigitStart(src, i) {
        if (isDigit(src[i])) return true;
        return src[i] === '.' && isDigit(src[i + 1]);
    }

    /**
     * 嘗試在位置 i 匹配字串。
     * 處理：前綴（f r b u fr rf bu… 大小寫）＋ 單/雙引號 ＋ 三引號 ＋ 跳脫 ＋ 未閉合。
     * @returns {{text:string, end:number}|null}
     */
    function matchString(src, i) {
        var n = src.length;
        var p = i;
        var prefixLen = 0;
        while (prefixLen < 2 && p < n && 'fFrRbBuU'.indexOf(src[p]) !== -1) {
            p++;
            prefixLen++;
        }
        var q = src[p];
        if (q !== '"' && q !== "'") return null;
        // 前綴不可與識別字黏連（如 xf"y" 不是 f-string）
        if (prefixLen > 0 && i > 0 && isIdentPart(src[i - 1])) return null;

        var triple = (p + 2 < n && src[p + 1] === q && src[p + 2] === q);
        var j = triple ? p + 3 : p + 1;

        if (triple) {
            // 三引號可跨行；未閉合則吞到結尾（與 Python 報錯前狀態一致）
            while (j < n) {
                if (src[j] === '\\' && q === '"') { j += 2; continue; }
                if (src[j] === q && src[j + 1] === q && src[j + 2] === q) {
                    return { text: src.slice(i, j + 3), end: j + 3 };
                }
                j++;
            }
            return { text: src.slice(i, n), end: n };
        }

        // 單行字串：不可跨行，未閉合吞到行尾
        while (j < n && src[j] !== '\n') {
            if (src[j] === '\\') { j += 2; continue; }
            if (src[j] === q) {
                return { text: src.slice(i, j + 1), end: j + 1 };
            }
            j++;
        }
        return { text: src.slice(i, j), end: j };
    }

    var api = {
        highlightPython: highlightPython,
        escapeHtml: escapeHtml
    };

    global.CocoyaPyHighlight = api;
    // 注意：刻意不加 module.exports —— 本檔是瀏覽器 script（非 ESM），
    // 測試走 new Function 載入讀 globalThis（見 highlight.test.mjs 與 pin_resolve.test.mjs 同模式）。
    // 加 CommonJS 層反而要求 eslint 額外宣告 node 全域（ai_inference_blocks.js 同決策）。
})(typeof globalThis !== 'undefined' ? globalThis : this);
