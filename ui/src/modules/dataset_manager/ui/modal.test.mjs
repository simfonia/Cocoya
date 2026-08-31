/**
 * ui/modal.test.mjs
 * Stage 4 切片 2 測試：modal 模板建構純函式（buildModalTemplate）契約。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildModalTemplate } from './modal.js';

// 簡單 optionList 實作（與 ui_layout 行為等價）：`<option value="X" selected?...>X</option>`
function optionList(values, selected) {
    return values
        .map((value) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${value}</option>`)
        .join('');
}

const t = (key, fallback) => `[${key}:${fallback}]`;

const deps = {
    t,
    optionList,
    projectTypes: ['table', 'image', 'object_detection', 'feature', 'serial', 'line_following'],
    sourceModes: ['file']
};

const REQUIRED_IDS = [
    'dataset-manager-title',
    'dataset-manager-subtitle',
    'dataset-manager-clear',
    'dataset-manager-close',
    'dataset-export-progress',
    'dataset-manager-message',
    'dataset-import-btn',
    'dataset-file-input',
    'dataset-dir-import-btn',
    'dataset-structure-title',
    'dataset-add-column',
    'dataset-add-label',
    'dataset-column-list',
    'dataset-manager-validate',
    'dataset-manager-export',
    'dataset-json-preview'
];

test('回傳字串且包含所有必要元素 id（每 id 恰一個）', () => {
    const html = buildModalTemplate(deps);
    assert.equal(typeof html, 'string');
    requireAllIds(html);
});

function requireAllIds(html) {
    for (const id of REQUIRED_IDS) {
        const count = (html.match(new RegExp(`id="${id}"`, 'g')) || []).length;
        assert.equal(count, 1, `id "${id}" 應恰出現一次`);
    }
}

test('t 函式被呼叫並填入 i18n 結果（非原始 key）', () => {
    const html = buildModalTemplate(deps);
    // 標題應為 t() 翻譯後的佔位，而非未翻譯的硬編碼
    assert.ok(html.includes('[TITLE:Dataset Manager]'), 'TITLE 應經 t() 翻譯');
    assert.ok(html.includes('[EXPORT:匯出資料集]'), 'EXPORT 應經 t() 翻譯');
});

test('optionList 用於 projectType / sourceMode 下拉', () => {
    const html = buildModalTemplate(deps);
    assert.ok(html.includes('<select name="projectType">'), 'projectType 下拉存在');
    assert.ok(html.includes('<select name="sourceMode">'), 'sourceMode 下拉存在');
    // 專案類型選項皆列於 HTML（由 optionList 注入）
    for (const type of ['table', 'object_detection', 'line_following']) {
        assert.ok(html.includes(`value="${type}"`), `HTML 含 ${type} option`);
    }
    // 來源模式（sourceModes）也由 optionList 注入
    assert.ok(html.includes('value="file"'), 'HTML 含 file 來源模式 option');
});

test('無殘留未解析的模板佔位符 ${', () => {
    const html = buildModalTemplate(deps);
    assert.ok(!html.includes('${'), '不應殘留未解析的 ${ 佔位符');
});

test('純函式：重複呼叫結果一致（無副作用）', () => {
    const a = buildModalTemplate(deps);
    const b = buildModalTemplate(deps);
    assert.equal(a, b);
});