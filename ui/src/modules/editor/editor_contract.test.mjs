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
// 不變式 C：實驗室存檔（D-2 #7，Q2=原生對話框）—— saveLabCode 走後端 save_file
// .py 分叉；exportPy 保留為 blob fallback（VSIX／無原生能力）
// ---------------------------------------------------------------------------

test('不變式 C：saveLabCode 走 sendWithResult saveFile（原生 .py）；exportPy 保留 Blob fallback', () => {
    const src = fs.readFileSync(path.join(here, 'text_mode.js'), 'utf8');
    assert.match(src, /sendWithResult\(\s*'saveFile'/,
        'saveLabCode 必須走 sendWithResult（回傳檔名＋例外穿透，send() 會吞掉 Canceled）');
    assert.match(src, /isTextMode:\s*true/,
        '存檔參數必須帶 isTextMode:true 以分派 Rust .py 分叉');
    assert.match(src, /new Blob\(/,
        'exportPy 必須保留 Blob 下載（fallback）');
    assert.match(src, /a\.download\s*=/,
        'exportPy 必須以 <a download> 觸發瀏覽器下載（fallback）');
});

// ---------------------------------------------------------------------------
// 不變式 D：檔案作業護欄（開檔/開新/範例/回首頁前還原積木 UI）
// ---------------------------------------------------------------------------

test('不變式 D：controller.loadWorkspace 先 exitLab；base.js 存檔走 saveLabCode', () => {
    const ctrl = fs.readFileSync(path.join(uiDir, 'src', 'app', 'controller.js'), 'utf8');
    assert.match(ctrl, /TM\.exitLab\(/, '開啟前必須先退出實驗室（還原積木 UI 再載入 XML）');
    assert.doesNotMatch(ctrl, /TM\.openPyFile\(/, '.py 不再受管開啟，不得殘留 openPyFile 呼叫');

    const base = fs.readFileSync(path.join(uiDir, 'src', 'ui', 'base.js'), 'utf8');
    assert.match(base, /window\.CocoyaTextMode\.saveLabCode\(/,
        '文字模式存檔按鈕必須走 saveLabCode（原生 .py 對話框；fallback 在其內部）');
});

// ---------------------------------------------------------------------------
// D-2 #8：exitLab 三鈕（存 .py／不存／取消）＋ #1 退場 tooltip 同步
// ---------------------------------------------------------------------------

test('exitLab 三鈕：showSaveConfirm 分派、cancel 留在實驗室、save 失敗也留下', () => {
    const src = fs.readFileSync(path.join(here, 'text_mode.js'), 'utf8');
    assert.match(src, /showSaveConfirm\(\s*tip/,
        'dirty 退出必須走三鈕 showSaveConfirm');
    assert.match(src, /if \(choice === 'cancel'\) return false/,
        '取消 → 回 false 留在實驗室');
    assert.match(src, /var saved = await saveLabCode\(\);\s*\r?\n\s*if \(!saved\) return false/,
        '存分支取消/失敗 → 回 false 留在實驗室（不可丟草稿）');
    assert.match(src, /restoreBlockUi\(\);\s*\r?\n\s*seedCode = null;\s*\r?\n\s*\/\/ D-2 #1 收尾[\s\S]{0,200}?syncLabChromeTips\(\)/,
        '退場後必須重呼 syncLabChromeTips 還原積木 tooltip（#1 收尾）');
});

test('D-2 #2：enterTextModeWithCode 進編輯器前剝 ID 註解', () => {
    const src = fs.readFileSync(path.join(here, 'text_mode.js'), 'utf8');
    assert.match(src, /function enterTextModeWithCode\(code\) \{\s*\r?\n\s*\/\/ D-2 #2[\s\S]*?code = stripIdComments\(code\)/,
        '快照還原路徑進編輯器前必須剝行尾 ID 註解（顯示剝除，執行 Q3 照原樣）');
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

// ---------------------------------------------------------------------------
// D-2 實機回報修正守門（2026-10-11）：#1 切換鈕圖示、#3 行號版面、#6 save tooltip
// ---------------------------------------------------------------------------

test('D-2 #3：文字模式 padding-left 加在 block 級 .editor-highlight（不得加在 inline code）', () => {
    const css = fs.readFileSync(path.join(here, 'editor.css'), 'utf8');
    assert.doesNotMatch(css, /body\.cocoya-text-mode #codeEditor \.editor-highlight code,/,
        'inline code 的 left padding 僅位移首行（第 2 行起與 36px 行號欄重疊），不得復活');
    assert.match(css, /body\.cocoya-text-mode #codeEditor \.editor-highlight,\s*\r?\n\s*body\.cocoya-text-mode #codeEditor \.editor-input\s*\{\s*\r?\n\s*padding-left:\s*36px/,
        'block 級 pre 與 textarea 必須同為 padding-left:36px（兩層對齊鐵則）');
    assert.match(css, /#codeEditor \.editor-gutter\s*\{[^}]*padding-top:\s*4px/,
        'gutter 必須 padding-top:4px 與文字層 padding: 4px 8px 頂距對齊');
});

test('D-2 #1：syncLabChromeTips 依模式切換 #btn-text-mode 圖示（實驗室=X cancel，積木=code）', () => {
    const base = fs.readFileSync(path.join(uiDir, 'src', 'ui', 'base.js'), 'utf8');
    assert.match(base, /inLab \? 'src\/icons\/cancel_24dp_FE2F89\.png'/,
        '實驗室中切換鈕圖示必須換成 X（cancel）');
    assert.match(base, /: 'src\/icons\/code_24dp_FE2F89\.png'/,
        '積木模式必須還原 code 圖示');
    const tm = fs.readFileSync(path.join(here, 'text_mode.js'), 'utf8');
    // 判準必須落在真不變式：不只是「出現呼叫字面」，而是「經 feature-detect 後實際呼叫」，
    // 否則寫成 if (false) _ui4.syncLabChromeTips(); 這種死碼也能過關（mutation 實證）。
    assert.match(tm, /function restoreBlockUiOnly\(\) \{[\s\S]*?if \(_ui4 && typeof _ui4\.syncLabChromeTips === 'function'\) _ui4\.syncLabChromeTips\(\);/,
        '檔案作業護欄路徑（restoreBlockUiOnly）也必須重呼 syncLabChromeTips（圖示/tooltip 還原）');
});

test('D-2 #6：setSaveButtonState 空 hint 不得清空 title；syncLabChromeTips 兩模式明確寫 title', () => {
    const base = fs.readFileSync(path.join(uiDir, 'src', 'ui', 'base.js'), 'utf8');
    assert.doesNotMatch(base, /saveBtn\.setAttribute\('title', hint\);\r?\n        \}\r?\n    \},/,
        '不得無條件 setAttribute(title, hint)（hint 為空會永久清空 tooltip，applyI18n 只在啟動跑一次）');
    assert.match(base, /if \(hint\) \{\s*\r?\n\s*saveBtn\.setAttribute\('title', hint\);/,
        '有 hint 時照舊寫入（唯讀提示流程不變）');
    assert.match(base, /setSaveButtonState[\s\S]{0,400}?syncLabChromeTips\(\);/,
        '空 hint 必須交還 syncLabChromeTips 依模式還原');
    assert.match(base, /if \(inLab\) \{\s*\r?\n\s*\/\/[^\n]*\r?\n\s*const tip = Blockly\.Msg\['TLB_SAVE_PY_TIP'\][^\n]*\r?\n\s*saveBtn\.setAttribute\('data-lab-tip', tip\);\s*\r?\n\s*saveBtn\.setAttribute\('title', tip\);/,
        '實驗室分支必須直設 .py title（進場即正確，不等 hover）');
    assert.match(base, /saveBtn\.setAttribute\('title', Blockly\.Msg\['TLB_SAVE'\] \|\| '/,
        '積木分支必須還原 TLB_SAVE 預設 title（退出/存檔後 tooltip 不空白）');
});

test('D-2 #9：縮排標籤依模式切換語意（實驗室=Tab：，積木=縮排：）', () => {
    const base = fs.readFileSync(path.join(uiDir, 'src', 'ui', 'base.js'), 'utf8');
    const html = fs.readFileSync(path.join(uiDir, 'index.html'), 'utf8');
    const zh = fs.readFileSync(path.join(uiDir, 'src', 'zh-hant.js'), 'utf8');
    const en = fs.readFileSync(path.join(uiDir, 'src', 'en.js'), 'utf8');
    assert.match(html, /<span id="indent-label"[^>]*>%\{BKY_TLB_INDENT\}<\/span>/,
        '縮排標籤 span 必須有 id="indent-label"（否則 syncLabChromeTips 無法切換語意）');
    // 判準落在真不變式：inLab 三元直接選 TLB_INDENT_LAB／TLB_INDENT（死碼寫法無法過關）
    assert.match(base, /const lk = inLab \? 'TLB_INDENT_LAB' : 'TLB_INDENT';/,
        '必須依模式選 key：實驗室 TLB_INDENT_LAB（Tab：）、積木 TLB_INDENT（縮排：）');
    assert.match(base, /const lab = Blockly\.Msg\[lk\] \|\| Blockly\.Msg\['TLB_INDENT'\] \|\| '';/,
        'fallback 必須退回 TLB_INDENT（新 key 缺定義時不至於空白標籤）');
    assert.match(base, /if \(lab\) indentLabel\.textContent = lab;/,
        '有值才寫入（空字串不得清空標籤）');
    assert.match(zh, /"TLB_INDENT_LAB":\s*"Tab："/, 'zh-hant 必須定義 TLB_INDENT_LAB');
    assert.match(en, /"TLB_INDENT_LAB":\s*"Tab:"/, 'en 必須定義 TLB_INDENT_LAB（i18n 契約要求雙語鍵集合一致）');
});

test('D-2 #9b 行號欄：.ln 必須 box-sizing:border-box（否則行號緊貼第一個字）', () => {
    const css = fs.readFileSync(path.join(here, 'editor.css'), 'utf8');
    assert.match(css, /#codeEditor \.editor-gutter \.ln\s*\{[^}]*box-sizing:\s*border-box/,
        '預設 content-box 會讓 width:100% 只涵蓋內容區、padding-right 被 overflow:hidden 裁掉，' +
        'text-align:right 把行號右緣對到 x=36px（正是文字層 padding-left 起點）→ 零間距緊貼');
});

test('D-2 #10：舊不可逆模型的兩個 i18n 鍵不得復活（TLB_TEXT_MODE_TIP / _CONFIRM）', () => {
    // 背景：實驗室模型（2026-10-10 重構）下積木會被保留、可退出，這兩個鍵的文案
    // （「不可逆，積木將無法恢復」）是舊單向模型的，且 _CONFIRM 已無任何程式引用、
    // _TIP 僅剩 fallback 與 index.html 佔位符 —— 留著只會在 ENTER/EXIT_TIP 遺失時
    // 向使用者顯示假訊息。已全數移除，此守門防止復活。
    const zh = fs.readFileSync(path.join(uiDir, 'src', 'zh-hant.js'), 'utf8');
    const en = fs.readFileSync(path.join(uiDir, 'src', 'en.js'), 'utf8');
    const base = fs.readFileSync(path.join(uiDir, 'src', 'ui', 'base.js'), 'utf8');
    const html = fs.readFileSync(path.join(uiDir, 'index.html'), 'utf8');
    assert.doesNotMatch(zh, /"TLB_TEXT_MODE_TIP"\s*:/, 'zh-hant 不得再有 TLB_TEXT_MODE_TIP');
    assert.doesNotMatch(en, /"TLB_TEXT_MODE_TIP"\s*:/, 'en 不得再有 TLB_TEXT_MODE_TIP');
    assert.doesNotMatch(zh, /"TLB_TEXT_MODE_CONFIRM"\s*:/, 'zh-hant 不得再有 TLB_TEXT_MODE_CONFIRM');
    assert.doesNotMatch(en, /"TLB_TEXT_MODE_CONFIRM"\s*:/, 'en 不得再有 TLB_TEXT_MODE_CONFIRM');
    assert.doesNotMatch(base, /Msg\['TLB_TEXT_MODE_TIP'\]/, 'base.js 不得再以 TIP 當 fallback（會顯示舊模型假訊息）');
    assert.doesNotMatch(html, /BKY_TLB_TEXT_MODE_TIP/, 'index.html 佔位符改用 ENTER_TIP（積木模式的正確初始 tooltip）');
    // 佔位符必須指向仍存在的鍵，否則 applyI18n 會留下 %{BKY_...} 原文字串當 tooltip
    assert.match(html, /id="btn-text-mode" title="%\{BKY_TLB_TEXT_MODE_ENTER_TIP\}"/,
        '佔位符必須是 TLB_TEXT_MODE_ENTER_TIP');
});

});
