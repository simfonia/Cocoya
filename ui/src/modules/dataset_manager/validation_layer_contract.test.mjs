import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatasetSpec } from './spec.js';
import { VALIDATION_MESSAGES, localizeValidationIssue, localizeValidationResult } from './application/validationMessages.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SPEC_FILE = path.join(here, 'spec.js');
const I18N = path.join(here, 'i18n');

// 從 spec.js 原始碼抽出 validate() 內的 issue('CODE' 呼叫
function codesInValidate() {
    const src = fs.readFileSync(SPEC_FILE, 'utf8');
    const start = src.indexOf('    validate() {');
    assert.ok(start > 0, 'spec.js 找不到 validate()');
    const end = src.indexOf('\n    }', start);
    const body = src.slice(start, end);
    return [...body.matchAll(/issue\(\s*'([A-Z][A-Z0-9_]+)'/g)].map((m) => m[1]);
}

test('P2-13 守門 1：spec.js 不得再 import t()（純函式層不該依賴 i18n）', () => {
    const src = fs.readFileSync(SPEC_FILE, 'utf8');
    assert.ok(
        !/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"][^'"]*i18n\.js['"]/.test(src),
        'spec.js 不得 import t()：文案翻譯屬 ui/application 層（validationMessages.js）'
    );
});

test('P2-13 守門 2：validate() 用到的每個 code 都必須有文案（否則 UI 顯示「未定義的驗證代碼」）', () => {
    const codes = codesInValidate();
    assert.ok(codes.length >= 16, `只掃到 ${codes.length} 個 code，validate() 結構可能已變更`);
    const missing = codes.filter((c) => !(c in VALIDATION_MESSAGES));
    assert.deepEqual(missing, [], `以下 code 沒有文案定義：\n  ${missing.join('\n  ')}`);
});

test('P2-13 守門 3：每個 code 都必須在 zh-hant 與 en 都有翻譯', () => {
    const codes = codesInValidate();
    for (const lang of ['zh-hant', 'en']) {
        const src = fs.readFileSync(path.join(I18N, `${lang}.js`), 'utf8');
        const missing = codes.filter((c) => !src.includes(`DSM_${c}`));
        assert.deepEqual(missing, [], `${lang}.js 缺少以下 code 的翻譯：\n  ${missing.join('\n  ')}`);
    }
});

test('P2-13 守門 4：validate() 的 errors/warnings 元素必須是 {code, params} 結構', () => {
    const v = new DatasetSpec({
        project: { name: '', type: 'not_a_type' },
        data_source: { mode: 'bogus', files: [], samples: [] },
        schema: { columns: [], features: [], label: '' }
    }).validate();
    assert.equal(v.ok, false);
    const all = [...v.errors, ...v.warnings];
    assert.ok(all.length > 0);
    for (const item of all) {
        assert.equal(typeof item.code, 'string', '每個問題必須有字串 code');
        assert.ok(Array.isArray(item.params), '每個問題必須有 params 陣列');
        assert.equal(typeof item.text, 'undefined', '不得夾帶已翻譯文案（會讓分層失效）');
    }
});

test('P2-13：localizeValidationIssue 正確代入 params 並替換佔位符', () => {
    const issue = { code: 'VALIDATE_UNLABELED_SAMPLES', params: [3, 2] };
    const out = localizeValidationIssue(issue, (k, fb, ...a) => {
        let s = fb;
        a.forEach((v, i) => { s = s.replace(`%${i + 1}`, String(v)); });
        return s;
    });
    assert.ok(out.includes('3') && out.includes('2'), 'params 未被代入');
});

test('P2-13：未知 code 必須顯示明確提示，不得靜默吞掉（新增 code 忘了寫文案要看得見）', () => {
    const out = localizeValidationIssue({ code: 'VALIDATE_TYPO_HERE', params: [] }, (k, fb) => fb);
    assert.ok(out.includes('VALIDATE_TYPO_HERE'), `未知 code 應顯示代碼本身，實際：${out}`);
});

test('P2-13：localizeValidationResult 保留 ok 並轉換整份清單', () => {
    const raw = {
        ok: false,
        errors: [{ code: 'VALIDATE_PROJECT_NAME_REQUIRED', params: [] }],
        warnings: [{ code: 'VALIDATE_NO_LABEL', params: [] }]
    };
    const out = localizeValidationResult(raw, (k, fb) => fb);
    assert.equal(out.ok, false);
    assert.ok(Array.isArray(out.errors) && typeof out.errors[0] === 'string');
    assert.ok(out.errors[0].includes('Project name'));
    assert.ok(out.warnings[0].includes('label column'));
});