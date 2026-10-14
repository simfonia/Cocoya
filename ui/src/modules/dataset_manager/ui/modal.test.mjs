/**
 * ui/modal.test.mjs
 * Stage 4 切片 2 測試：modal 模板建構純函式（buildModalTemplate）契約。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildModalTemplate } from './modal.js';
import * as depsStubs from '../../../../test/depsStubs.js';
// [T3 殘項 2026-10-03] 原本自帶的 optionList / t 已收攏至 ui/test/depsStubs.js。
// taggedT 的輸出格式（[KEY:fallback]）為本檔斷言所需，刻意不與 fallbackT 合併。
const { taggedT: t, optionListModal: optionList } = depsStubs;

const deps = {
    t,
    optionList,
    projectTypes: ['table', 'image_classification', 'object_detection', 'feature', 'serial', 'line_following'],
    sourceModes: ['file']
};

const REQUIRED_IDS = [
    'dataset-manager-title',
    'dataset-manager-subtitle',
    'dataset-manager-clear',
    'dataset-manager-close',
    'dataset-export-progress',
    'dataset-manager-message',
    // 2026-10-13：頂部常駐統計列（P2/P3 分類別＋總數）
    'dataset-global-stats',
    'dataset-import-btn',
    'dataset-file-input',
    'dataset-dir-import-btn',
    'dataset-structure-title',
    'dataset-add-column',
    'dataset-add-label',
    'dataset-column-list',
    'dataset-manager-validate',
    'dataset-manager-export',
    'dataset-header-entry',
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

// ---------------------------------------------------------------------------
// 2026-10-13：統計列必須在「捲動容器之外」
// ---------------------------------------------------------------------------
// 判據落在真不變式上，不是「有沒有這個 id」：.dataset-manager-body 是 overflow:auto
// 的捲動容器，統計列若被放進它的子樹，縮圖牆一多就會把統計捲出視野
// —— 那正是本次要解決的缺點 2（使用者回報：捲下管理縮圖時看不到數據）。
// 掃字串「id 存在」無法區分這兩種寫法，故斷言「body 起始之前出現」。
test('統計列 #dataset-global-stats 必須位於 .dataset-manager-body 之外（不得隨縮圖牆捲動）', () => {
    const html = buildModalTemplate(deps);
    const statsIdx = html.indexOf('id="dataset-global-stats"');
    const bodyIdx = html.indexOf('class="dataset-manager-body"');
    assert.ok(statsIdx > 0, '統計列應存在');
    assert.ok(bodyIdx > 0, 'body 應存在');
    assert.ok(statsIdx < bodyIdx,
        '#dataset-global-stats 必須在 .dataset-manager-body 之前（之外），否則會隨縮圖牆捲出視野');
});

test('守門自檢：把統計列移進 body 內必須報紅', () => {
    // 變異＝真實退化形狀：統計列成為 body 的子節點（縮圖牆會把它捲走）。
    const html = buildModalTemplate(deps);
    const block = html.match(/\s*<!-- 2026-10-13：頂部常駐統計列[\s\S]*?<\/div>\s*/);
    assert.ok(block, '應能定位統計列區塊');
    const regressed = html
        .replace(block[0], '\n')
        .replace('<div class="dataset-manager-body">',
            '<div class="dataset-manager-body">' + block[0]);
    const statsIdx = regressed.indexOf('id="dataset-global-stats"');
    const bodyIdx = regressed.indexOf('class="dataset-manager-body"');
    assert.ok(statsIdx > bodyIdx, '變異必須生效（統計列已落入 body 內）');
});