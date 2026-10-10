/**
 * editor_contract.test.mjs — 純文字模式契約守門（「程式設計實驗室」模型，2026-10-10 重構）
 *
 * 判準（皆已做變異測試驗紅）：
 *   1. detectContentKind：內容偵測純函式（零件庫，保留供將來 .py 受管化）
 *   2. stripIdComments：進編輯器前必須剝除行尾「兩空格＋# ID:」註解
 *   A. 實驗室永不 dispose：text_mode.js 不得呼叫 workspace.dispose（積木永存）
 *   B. 進入/退出：enterLab 以乾淨預覽碼為種子；exitLab/restoreBlockUiOnly 還原 UI 且不碰積木
 *   C. 匯出：exportPy 走 blob 下載，不送後端 saveFile
 *   D. 檔案作業護欄：controller.loadWorkspace 先 exitLab；persistence 三方法呼叫 restoreBlockUiOnly
 *   5. VSIX 隱藏按鈕：base.js 以 caps.supportsTextEditor 決定顯示
 *   7. escape：高亮輸出不得含裸 HTML（highlight.test.mjs 15 測的契約摘要）
 *   8. 版面重構（方案 B）：toolbar/terminal 不得關回 blocklyArea；文字模式隱藏 blocklyArea
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
assert.ok(TM && typeof TM.isTextMode === 'function', 'text_mode.js 應掛出 CocoyaTextMode');
assert.ok(H && typeof H.highlightPython === 'function', 'highlight.js 應掛出 CocoyaPyHighlight');

// ---------------------------------------------------------------------------
// 1. detectContentKind —— 內容偵測純函式（零件庫）
// ---------------------------------------------------------------------------

test('detectContentKind：Blockly XML（含前置空白／<?xml／BOM）→ xml', () => {
    assert.equal(TM.detectContentKind('<xml xmlns="http://www.w3.org/1999/xhtml"></xml>'), 'xml');
    assert.equal(TM.detectContentKind('<?xml version="1.0" encoding="utf-8"?>\n<xml></xml>'), 'xml');
    assert.equal(TM.detectContentKind('   \n\t<xml platform="PC"></xml>'), 'xml');
    assert.equal(TM.detectContentKind('\ufeff<xml></xml>'), 'xml', 'BOM 起頭也算 XML');
});

test('detectContentKind：Python／空檔 → python', () => {
    assert.equal(TM.detectContentKind('# cocoya-platform: PC\nprint(1)'), 'python');
    assert.equal(TM.detectContentKind('print("hi")'), 'python');
    assert.equal(TM.detectContentKind(''), 'python');
    assert.equal(TM.detectContentKind('   \n'), 'python');
    assert.equal(TM.detectContentKind(null), 'python');
    assert.equal(TM.detectContentKind('<xml></xml>'), 'xml', '副檔名 .py 但內容是 XML → 內容優先');
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
// 不變式 A：實驗室永不 dispose（積木 workspace 永存，實驗室模型核心）
// ---------------------------------------------------------------------------

test('不變式 A：text_mode.js 不得呼叫 workspace.dispose（實驗室永不銷毀積木）', () => {
    const src = fs.readFileSync(path.join(here, 'text_mode.js'), 'utf8');
    assert.doesNotMatch(src, /workspace\s*\.\s*dispose/,
        '實驗室模型下 text_mode.js 不得 dispose workspace（積木永存，退出只還原 UI）');
    assert.doesNotMatch(src, /disposeBlocklySide/,
        'dispose 模型的 disposeBlocklySide 應已移除');
    assert.doesNotMatch(src, /app\.workspace\s*=\s*null/,
        '不得把 workspace 設為 null（下游到處依賴它存活）');
});

test('不變式 A：匯出 enterLab/exitLab/restoreBlockUiOnly/exportPy/toggleTextMode', () => {
    assert.equal(typeof TM.enterLab, 'function');
    assert.equal(typeof TM.exitLab, 'function');
    assert.equal(typeof TM.restoreBlockUiOnly, 'function');
    assert.equal(typeof TM.exportPy, 'function');
    assert.equal(typeof TM.toggleTextMode, 'function');
    assert.equal(typeof TM.cleanPreviewCode, 'function');
    // dispose 模型的舊 API 不得殘留
    assert.equal(TM.switchToTextMode, undefined, 'switchToTextMode 應已移除');
    assert.equal(TM.openPyFile, undefined, 'openPyFile 應已移除（.py 不再受管開啟）');
});

// ---------------------------------------------------------------------------
// 不變式 B：進入以乾淨預覽碼為種子；退出/還原只動 UI，不碰積木
// ---------------------------------------------------------------------------

test('不變式 B：enterLab 用 cleanPreviewCode 取種子（非 lastCleanCode）；exitLab 用 seedCode 判 dirty', () => {
    const src = fs.readFileSync(path.join(here, 'text_mode.js'), 'utf8');
    assert.match(src, /function enterLab[\s\S]*?cleanPreviewCode\(\)/,
        'enterLab 必須以乾淨預覽碼為種子（複製鈕與進入共用 SSOT）');
    assert.match(src, /seedCode\s*=\s*code/,
        '進入時記錄 seedCode 供退出 dirty 判斷');
    assert.match(src, /ed\.getValue\(\)\s*!==\s*seedCode/,
        'exitLab 以「編輯器值 !== seedCode」判斷草稿是否被改動');
    assert.match(src, /classList\.remove\('cocoya-text-mode'\)/,
        '退出必須移除 body class（還原積木可見）');
});

// ---------------------------------------------------------------------------
// 不變式 C：匯出走 blob 下載，不送後端 saveFile
// ---------------------------------------------------------------------------

test('不變式 C：exportPy 用 Blob＋createElement(a).download（非受管匯出）', () => {
    const src = fs.readFileSync(path.join(here, 'text_mode.js'), 'utf8');
    assert.match(src, /new Blob\(/,
        'exportPy 必須以 Blob 打包下載內容');
    assert.match(src, /a\.download\s*=/,
        'exportPy 必須以 <a download> 觸發瀏覽器下載');
    assert.doesNotMatch(src, /send\('saveFile'/,
        'exportPy 不得走後端 saveFile（.py 非受管）');
});

// ---------------------------------------------------------------------------
// 不變式 D：檔案作業護欄（開檔/開新/範例/回首頁前還原積木 UI）
// ---------------------------------------------------------------------------

test('不變式 D：controller.loadWorkspace 先 exitLab；base.js 存檔走 exportPy', () => {
    const ctrl = fs.readFileSync(path.join(uiDir, 'src', 'app', 'controller.js'), 'utf8');
    assert.match(ctrl, /TM\.exitLab\(/, '開啟前必須先退出實驗室（還原積木 UI 再載入 XML）');
    assert.doesNotMatch(ctrl, /TM\.openPyFile\(/, '.py 不再受管開啟，不得殘留 openPyFile 呼叫');

    const base = fs.readFileSync(path.join(uiDir, 'src', 'ui', 'base.js'), 'utf8');
    assert.match(base, /window\.CocoyaTextMode\.exportPy\(\)/, '文字模式存檔按鈕必須走 exportPy（blob 下載）');
});

test('不變式 D：persistence 三檔案作業方法開頭呼叫 restoreBlockUiOnly', () => {
    const p = fs.readFileSync(path.join(uiDir, 'src', 'app', 'persistence.js'), 'utf8');
    const count = (p.match(/CocoyaTextMode\.restoreBlockUiOnly\(\)/g) || []).length;
    assert.ok(count >= 3, 'loadWorkspace/resetWorkspace/_applyInitialBlocks 開頭應各自呼叫 restoreBlockUiOnly，實際 ' + count);
});

// ---------------------------------------------------------------------------
// 5. VSIX 隱藏按鈕
// ---------------------------------------------------------------------------

test('VSIX 隱藏按鈕：base.js 以 caps.supportsTextEditor 決定 #btn-text-mode 顯示', () => {
    const src = fs.readFileSync(path.join(uiDir, 'src', 'ui', 'base.js'), 'utf8');
    assert.match(src, /caps\.supportsTextEditor\s*\?\s*'flex'\s*:\s*'none'/, '按鈕顯示必須由 caps.supportsTextEditor 決定（與 hasTerminal 同模式）');
    assert.match(src, /toggleTextMode/, '切換鈕應綁定 toggleTextMode（進入/退出單一入口）');
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
        assert.ok(at > last, `${key} 應依序出現，實際位置 ${at} <= ${last}`);
        last = at;
    }
    assert.ok(html.includes('id="code-title"'), 'codeHeader 標題應有 #code-title 錨點');

    const css = fs.readFileSync(path.join(uiDir, 'src', 'style.css'), 'utf8');
    assert.match(css, /#container\s*\{[^}]*flex-direction:\s*column/, '#container 必須是上下容器');
    assert.match(css, /#workbench\s*\{[^}]*display:\s*flex/, '#workbench 中段左右分欄規則不得移除');
});

test('文字模式版面：#blocklyArea 整段 display:none（非 400px）＋切換鈕保持可見＋另存隱藏', () => {
    const css = fs.readFileSync(path.join(here, 'editor.css'), 'utf8');
    assert.match(css, /body\.cocoya-text-mode #blocklyArea\s*\{\s*display:\s*none/, '文字模式應隱藏整個 #blocklyArea（方案 B）');
    assert.doesNotMatch(css, /body\.cocoya-text-mode #blocklyArea\s*\{[^}]*400px/, '400px 左欄是方案 A 舊繞路，不得復活');
    assert.match(css, /body\.cocoya-text-mode #btn-save-as\s*\{\s*display:\s*none/, '實驗室中另存必須隱藏（.py 非受管，無另存語意）');
    assert.doesNotMatch(css, /body\.cocoya-text-mode #btn-text-mode\s*\{\s*display:\s*none/, '切換鈕在文字模式必須保持可見（退出實驗室要靠它）');
    assert.match(css, /body\.cocoya-text-mode #code-toggle,\s*body\.cocoya-text-mode #btn-close-code\s*\{\s*display:\s*none/, '編輯器唯一面板：收合把手與關閉鈕必須隱藏');
    const tm = fs.readFileSync(path.join(here, 'text_mode.js'), 'utf8');
    assert.match(tm, /getElementById\('code-title'\)/, '進文字模式時 retireBlockOnlyUi 應把 codeHeader 標題切為編輯器標籤');
});
