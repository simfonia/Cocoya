/**
 * ui/entryCards.test.mjs — 卡片入口契約測試（M1，R2）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPE_CATALOG, getTypeEntry, isDevEntry, buildEntryTemplate } from './entryCards.js';

const t = (key, fallback) => fallback || key;

test('目錄含 6 類型；feature/serial 為 dev，其餘 stable', () => {
    assert.equal(TYPE_CATALOG.length, 6);
    assert.equal(isDevEntry('feature'), true);
    assert.equal(isDevEntry('serial'), true);
    assert.equal(isDevEntry('image'), false);
    assert.equal(isDevEntry('table'), false);
    assert.ok(getTypeEntry('object_detection'));
    assert.equal(getTypeEntry('unknown'), null);
});

test('模板輸出 6 張卡＋dev 徽章 2 枚＋無殘留佔位符', () => {
    const html = buildEntryTemplate({ t });
    assert.equal(typeof html, 'string');
    const cards = html.match(/data-type="/g) || [];
    assert.equal(cards.length, 6);
    const badges = html.match(/dataset-entry-dev-badge/g) || [];
    assert.equal(badges.length, 2);
    assert.ok(!html.includes('${'));
});
