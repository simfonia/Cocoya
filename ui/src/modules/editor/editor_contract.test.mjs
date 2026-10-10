/**
 * editor_contract.test.mjs — 純文字模式契約守門（計畫 D-13，2026-10-10）
 *
 * 判準（皆已做變異測試驗紅）：
 *   1. detectContentKind：內容偵測不可只看副檔名（.py 內容是 XML → 回退積木）
 *   2. stripIdComments：進編輯器前必須剝除行尾「兩空格＋# ID:」註解
 *   3. VSIX 閘門：caps.supportsTextEditor=false → openPyFile 提示且完全不動工作區
 *      （無 DOM 環境必須優雅回 false —— 閘門在任何 DOM 存取之前）
 *   4. 模式不可逆：text_mode.js 不得移除 cocoya-text-mode class（無「切回去」路徑）
 *   5. VSIX 隱藏按鈕：base.js 以 caps.supportsTextEditor 決定顯示
 *   6. 開檔分叉接線：controller.loadWorkspace 必須呼叫 detectContentKind/openPyFile
 *   7. escape：高亮輸出不得含裸 HTML（highlight.test.mjs 15 測的契約摘要）
 *
 * 載入方式：new Function 載入真實模組（與 highlight.test.mjs 同模式）。
 * 執行（cwd = ui/）：node --test "src/modules/editor/*.test.mjs"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.resolve(here, '..', '..', '..');

globalThis.window = globalThis;
new Function(fs.readFileSync(path.join(here, 'text_mode.js'), 'utf8'))();
new Function(fs.readFileSync(path.join(here, 'highlight.js'), 'utf8'))();

const TM = globalThis.CocoyaTextMode;
const H = globalThis.CocoyaPyHighlight;
assert.ok(TM && typeof TM.detectContentKind === 'function', 'text_mode.js 應掛出 CocoyaTextMode');
assert.ok(H && typeof H.highlightPython === 'function', 'highlight.js 應掛出 CocoyaPyHighlight');

// ---------------------------------------------------------------------------
// 1. detectContentKind —— 內容偵測（D-12）
// ---------------------------------------------------------------------------

test('detectContentKind：Blockly XML（含前置空白／<?xml／BOM）→ xml', () => {
    assert.equal(TM.detectContentKind('<xml xmlns="http://www.w3.org/1999/xhtml"></xml>'), 'xml');
    assert.equal(TM.detectContentKind('<?xml version="1.0" encoding="utf-8"?>\n<xml></xml>'), 'xml');
    assert.equal(TM.detectContentKind('   \n\t<xml platform="PC"></xml>'), 'xml');
    assert.equal(TM.detectContentKind('﻿<xml></xml>'), 'xml', 'BOM 起頭也算 XML');
});

test('detectContentKind：Python／空檔 → python（空檔開文字檔勝過 textToDom 爆掉）', () => {
    assert.equal(TM.detectContentKind('# cocoya-platform: PC\nprint(1)'), 'python');
    assert.equal(TM.detectContentKind('print("hi")'), 'python');
    assert.equal(TM.detectContentKind(''), 'python');
    assert.equal(TM.detectContentKind('   \n'), 'python');
    assert.equal(TM.detectContentKind(null), 'python');
    // 副檔名 .py 但內容是 XML → 內容優先（回退積木的判準）
    assert.equal(TM.detectContentKind('<xml></xml>'), 'xml');
});

// ---------------------------------------------------------------------------
// 2. stripIdComments —— 行尾 ID 註解剝除
// ---------------------------------------------------------------------------

test('stripIdComments：剝「兩空格＋# ID:」行尾註解，其他註解保留', () => {
    const src = 'x = 1  # ID: bky-abc\nprint(x)  # ID: bky-def\ny = 2  # normal\n# full line';
    const out = TM.stripIdComments(src);
    assert.equal(out, 'x = 1\nprint(x)\ny = 2  # normal\n# full line');
    assert.equal(TM.stripIdComments(''), '');
    // 單空格或行首 ID 註解不是 Blockly 註入格式，不得誤刪
    assert.equal(TM.stripIdComments('z = 3 # ID: single-space'), 'z = 3 # ID: single-space');
});

// ---------------------------------------------------------------------------
// 3. VSIX 閘門 —— openPyFile 在無 editor 能力時優雅回 false
// ---------------------------------------------------------------------------

test('openPyFile：VSIX（supportsTextEditor=false）→ 提示且不動工作區', async () => {
    const alerts = [];
    const picks = [];
    globalThis.CocoyaBridge = {
        capabilities: { supportsTextEditor: false },
        alert: (msg) => { alerts.push(msg); }
    };
    globalThis.CocoyaUI = {
        showQuickPick: (title, options, cb) => { picks.push(options); cb('PC'); }
    };
    // 無 document stub —— 閘門若被移到 DOM 存取之後，此測試會因 ReferenceError 而紅
    try {
        const ok = await TM.openPyFile({ code: 'print(1)', filename: 'a.py' });
        assert.equal(ok, false, 'VSIX 應回 false');
        assert.equal(alerts.length, 1, '應提示一次（fallback 文案或 i18n）');
        assert.equal(picks.length, 0, '閘門在 QuickPick 之前，不得彈平台選單');
    } finally {
        delete globalThis.CocoyaBridge;
        delete globalThis.CocoyaUI;
    }
});

test('openPyFile：缺平台行 → QuickPick；取消 → 回 false 不動工作區', async () => {
    const picks = [];
    globalThis.CocoyaBridge = { capabilities: { supportsTextEditor: true } };
    globalThis.CocoyaUI = {
        showQuickPick: (title, options, cb) => { picks.push({ title, options }); cb(null); } // 取消
    };
    globalThis.document = { getElementById: () => null }; // 無編輯器根節點
    try {
        const ok = await TM.openPyFile({ code: 'print(1)', filename: 'a.py' });
        assert.equal(ok, false, '取消平台選擇應中止');
        assert.equal(picks.length, 1, '缺平台行應彈一次 QuickPick');
        assert.deepEqual(picks[0].options.map((o) => o.id), ['PC', 'MicroPython']);
    } finally {
        delete globalThis.CocoyaBridge;
        delete globalThis.CocoyaUI;
        delete globalThis.document;
    }
});

test('openPyFile：有檔頭平台行 → 不彈 QuickPick（直接走 enter）', async () => {
    const picks = [];
    globalThis.CocoyaBridge = { capabilities: { supportsTextEditor: true } };
    globalThis.CocoyaUI = {
        showQuickPick: (title, options, cb) => { picks.push(options); cb('PC'); }
    };
    globalThis.document = { getElementById: () => null }; // enter 失敗 → 回 false
    try {
        const ok = await TM.openPyFile({ code: '# cocoya-platform: MicroPython\nimport machine', filename: 'b.py' });
        assert.equal(ok, false, '無編輯器根節點時 enter 失敗');
        assert.equal(picks.length, 0, '有平台行不得彈 QuickPick');
    } finally {
        delete globalThis.CocoyaBridge;
        delete globalThis.CocoyaUI;
        delete globalThis.document;
    }
});

// ---------------------------------------------------------------------------
// 4~6. 掃描型守門（不可逆／VSIX 隱藏／controller 接線）
// ---------------------------------------------------------------------------

test('模式不可逆：text_mode.js 不得移除 cocoya-text-mode class、不得匯出「切回去」API', () => {
    const src = fs.readFileSync(path.join(here, 'text_mode.js'), 'utf8');
    assert.doesNotMatch(src, /classList\.remove\(\s*['"]cocoya-text-mode['"]\s*\)/,
        '單向契約：只有 add，不得有 remove');
    const keys = Object.keys(TM);
    assert.ok(!keys.some((k) => /exit|backToBlock|leaveText/i.test(k)),
        '不得匯出離開文字模式的 API；離場只走開新／開舊／回首頁：' + keys.join(','));
});

test('VSIX 隱藏按鈕：base.js 以 caps.supportsTextEditor 決定 #btn-text-mode 顯示', () => {
    const src = fs.readFileSync(path.join(uiDir, 'src', 'ui', 'base.js'), 'utf8');
    assert.match(src, /caps\.supportsTextEditor\s*\?\s*'flex'\s*:\s*'none'/,
        '按鈕顯示必須由 caps.supportsTextEditor 決定（與 hasTerminal 同模式）');
});

test('開檔分叉接線：controller.loadWorkspace 必須呼叫 detectContentKind 與 openPyFile', () => {
    const src = fs.readFileSync(path.join(uiDir, 'src', 'app', 'controller.js'), 'utf8');
    assert.match(src, /TM\.detectContentKind\(m\.xml\)\s*===\s*'python'/, 'Python 內容偵測分派');
    assert.match(src, /TM\.openPyFile\(/, 'Python 內容應交給 openPyFile');
    assert.match(src, /m\.is_read_only/, '唯讀旗標必須傳進文字路徑');
});

// ---------------------------------------------------------------------------
// 7. escape 契約摘要（詳測見 highlight.test.mjs）
// ---------------------------------------------------------------------------

test('escape：高亮輸出不得含裸 HTML 標籤', () => {
    const out = H.highlightPython('x = "<script>"  # <b>hi</b>');
    assert.doesNotMatch(out, /<script>|<b>/);
    assert.ok(out.includes('&lt;script&gt;'));
});

// ---------------------------------------------------------------------------
// 8. 版面重構（方案 B，2026-10-10）—— toolbar/terminal 不得關回 blocklyArea
// ---------------------------------------------------------------------------

test('版面重構：index.html 依序 toolbar → workbench(blockly/panel-resizer/code) → terminal；style.css 為上下容器', () => {
    const html = fs.readFileSync(path.join(uiDir, 'index.html'), 'utf8');
    const containerAt = html.indexOf('<div id="container">');
    assert.ok(containerAt > 0, '應有 #container');
    // 順序是層級的必要條件：toolbar 出現在 #blocklyArea 之前 → 不可能在 blocklyArea 之內；
    // terminal-resizer 出現在 #codeArea 之後 → 亦在 workbench 之外（方案 B 的核心）。
    const order = [
        'id="toolbar"',
        'id="workbench"',
        'id="blocklyArea"',
        'id="panel-resizer"',
        'id="codeArea"',
        'id="terminal-resizer"',
        'id="terminalArea"',
    ];
    let last = -1;
    for (const key of order) {
        const at = html.indexOf(key, containerAt);
        assert.ok(at > last, `${key} 應依序出現（重構後 toolbar/terminal 不得關回 #blocklyArea 內），實際位置 ${at} <= ${last}`);
        last = at;
    }
    // codeHeader 標題錨點（文字模式換標籤用）
    assert.ok(html.includes('id="code-title"'), 'codeHeader 標題應有 #code-title 錨點');

    const css = fs.readFileSync(path.join(uiDir, 'src', 'style.css'), 'utf8');
    assert.match(css, /#container\s*\{[^}]*flex-direction:\s*column/,
        '#container 必須是上下容器（toolbar / workbench / terminal）');
    assert.match(css, /#workbench\s*\{[^}]*display:\s*flex/,
        '#workbench 中段左右分欄規則不得移除');
});

test('文字模式版面：#blocklyArea 整段 display:none（非 400px 左欄）＋收合鈕/✕ 隱藏＋標題切換', () => {
    const css = fs.readFileSync(path.join(here, 'editor.css'), 'utf8');
    assert.match(css, /body\.cocoya-text-mode #blocklyArea\s*\{\s*display:\s*none/,
        '文字模式應隱藏整個 #blocklyArea（方案 B），不得回到 flex: 0 0 400px 左欄');
    assert.doesNotMatch(css, /body\.cocoya-text-mode #blocklyArea\s*\{[^}]*400px/,
        '400px 左欄是方案 A 的舊繞路，方案 B 下不得復活');
    assert.match(css, /body\.cocoya-text-mode #code-toggle,\s*body\.cocoya-text-mode #btn-close-code\s*\{\s*display:\s*none/,
        '編輯器唯一面板：收合把手與 ✕ 必須隱藏（收合後將無內容）');
    const tm = fs.readFileSync(path.join(here, 'text_mode.js'), 'utf8');
    assert.match(tm, /getElementById\('code-title'\)/,
        '進文字模式時 retireBlockOnlyUi 應把 codeHeader 標題切為編輯器標籤');
});
