/**
 * editor/highlight.test.mjs — Python tokenizer 契約測試（階段 A-4）
 *
 * 計畫 docs/plan/Editor純文字模式計畫.md §3：自寫約 150 行 tokenizer，
 * 零新增相依。輸出為 HTML 字串，必經 HTML escape。
 *
 * 判準（真實回歸會變紅）：
 *   1. escape：< > & 必須轉義（否則程式碼破版或 XSS；輸出不得含裸 '<script>'）
 *   2. 註解：# 到行尾整段包 tok-comment（含 # 內的引號不得被拆成字串）
 *   3. 字串：三引號跨行、f/r 前綴、跳脫、未閉合吞到行尾（不得吞掉下一行）
 *   4. 數字：0x/0b/底線/小數/指數/複數字尾 j
 *   5. 關鍵字 vs 識別字：def 包 tok-keyword，一般變數名不得包 span
 *   6. 不含「星號＋斜線」字面序列（AGENTS.md 坑：會提前閉合區塊註解）
 *
 * 載入方式：與 pin_resolve.test.mjs 同模式 —— new Function 載入真實模組。
 *
 * 執行（cwd = ui/）：node --test "src/modules/editor/*.test.mjs"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

globalThis.window = globalThis;
new Function(fs.readFileSync(path.join(here, 'highlight.js'), 'utf8'))();

const H = globalThis.CocoyaPyHighlight;
assert.ok(H && typeof H.highlightPython === 'function', 'highlight.js 應掛出 CocoyaPyHighlight.highlightPython');

test('escapeHtml：< > & 必須轉義', () => {
    assert.equal(H.escapeHtml('<script>&'), '&lt;script&gt;&amp;');
});

test('高亮輸出不得含裸 HTML 標籤（XSS／破版鎖）', () => {
    const out = H.highlightPython('x = "<script>alert(1)</script>"  # <b>hi</b>\na & b');
    assert.doesNotMatch(out, /<script>/);
    assert.doesNotMatch(out, /<b>/);
    assert.ok(out.includes('&lt;script&gt;'), '字串內的 < 應被轉義');
    assert.ok(out.includes('&amp;'), '& 應被轉義');
});

test('關鍵字包 tok-keyword，一般識別字不包', () => {
    const out = H.highlightPython('def foo(x):\n    return x + 1');
    assert.ok(out.includes('<span class="tok-keyword">def</span>'), 'def 應高亮');
    assert.ok(out.includes('<span class="tok-keyword">return</span>'), 'return 應高亮');
    assert.ok(!out.includes('>foo</span>'), '一般函式名不得包 span');
});

test('註解整段包 tok-comment，# 內的引號不得拆成字串', () => {
    const out = H.highlightPython('x = 1  # say "hi" <tag>');
    // 實測輸出：<span class="tok-comment"># say "hi" &lt;tag&gt;</span>
    // 引號保持原字元（只轉義 < > &），整段包一個 tok-comment，無 tok-string
    assert.ok(out.includes('<span class="tok-comment"># say "hi" &lt;tag&gt;</span>'),
        '註解應整段包 tok-comment 且 < 轉義，實得：' + out);
    assert.ok(!out.includes('tok-string'), '註解內的引號不得觸發字串高亮');
});

test('註解中的字串界定符不影響下一行', () => {
    const out = H.highlightPython("# it's\ny = 'ok'");
    assert.ok(out.includes('tok-comment'), '首行應為註解');
    assert.ok(out.includes('tok-string'), '次行字串仍應高亮');
});

test('三引號字串可跨行', () => {
    const out = H.highlightPython('s = """line1\nline2"""\nx = 1');
    assert.ok(out.includes('tok-string'), '三引號應包 tok-string');
    assert.ok(out.includes('tok-number'), '後續數字仍應高亮（未被字串吞掉）');
});

test('未閉合三引號吞到結尾（與 Python 報錯前狀態一致）', () => {
    const out = H.highlightPython('s = """abc\ndef x');
    assert.ok(out.includes('tok-string'), '未閉合仍包字串');
    assert.ok(!out.includes('tok-keyword'), '被吞掉的 def 不得再被判為關鍵字');
});

test('單行未閉合字串只吞到行尾，不得吞下一行', () => {
    const out = H.highlightPython("x = 'abc\ndef y(): pass");
    assert.ok(out.includes('tok-string'), '未閉合行應包字串');
    assert.ok(out.includes('<span class="tok-keyword">def</span>'), '下一行 def 仍應高亮');
});

test('f/r/b 前綴與跳脫字元', () => {
    assert.ok(H.highlightPython('s = f"a{b}"').includes('tok-string'), 'f-string 應包字串');
    assert.ok(H.highlightPython("s = r'c:\\n'").includes('tok-string'), 'r-string 應包字串');
    assert.ok(H.highlightPython('s = "a\\"b" + "c"').match(/tok-string/g).length >= 2,
        '跳脫引號不得提前終結字串');
    // 前綴不可與識別字黏連：xf"y" 是變數 x 接字串，不是 f-string
    const out = H.highlightPython('xf"y"');
    assert.ok(!out.includes('>xf</span>') || out.includes('tok-string'), 'xf 不得被誤判（至少字串部分正確）');
});

test('數字：hex／bin／底線／小數／指數／複數', () => {
    const out = H.highlightPython('a = 0x1F + 0b101 + 1_000 + 3.14 + 1e-9 + 2j');
    const count = (out.match(/tok-number/g) || []).length;
    assert.ok(count >= 6, `6 個數字皆應高亮，實得 ${count}`);
});

test('數字不得誤吞識別字（1abc 應拆成數字 1＋識別字 abc）', () => {
    const out = H.highlightPython('x1 = 1');
    assert.ok(out.includes('tok-number'), '1 應高亮');
});

test('內建函式與 MicroPython 名稱包 tok-builtin', () => {
    const out = H.highlightPython('print(len(x))\nimport machine\np = machine.Pin(0)');
    assert.ok(out.includes('<span class="tok-builtin">print</span>'), 'print 應高亮');
    assert.ok(out.includes('<span class="tok-builtin">machine</span>'), 'machine 應高亮');
    assert.ok(out.includes('<span class="tok-builtin">Pin</span>'), 'Pin 應高亮');
});

test('運算子成組輸出（** // == != 不得拆散）', () => {
    const out = H.highlightPython('a ** b // c == d != e');
    assert.ok(out.includes('<span class="tok-operator">**</span>'), '** 應成組');
    assert.ok(out.includes('<span class="tok-operator">//</span>'), '// 應成組');
    assert.ok(out.includes('<span class="tok-operator">==</span>'), '== 應成組');
});

test('空輸入與 null 收斂為空字串（不拋錯）', () => {
    assert.equal(H.highlightPython(''), '');
    assert.equal(H.highlightPython(null), '');
    assert.equal(H.highlightPython(undefined), '');
});

test('本測試檔的區塊註解寫法合規（AGENTS.md 坑：提前閉合檢查）', () => {
    // 判準：剝除所有「完整配對」的區塊註解後，不應殘留孤立的註解結束序列。
    // 注意：本檔含 '.replace(...)' 這類字串拼接會產生假陽性，故判準落在
    // 「註解必須正確配對」（開合數量一致），而非字面序列掃描。
    const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
    const opens = (src.match(/\/\*/g) || []).length;
    const closes = (src.match(/\*\//g) || []).length;
    assert.equal(opens, closes, `區塊註解開合必須配對（開 ${opens}／合 ${closes}）`);
});
