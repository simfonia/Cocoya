/**
 * core/html.test.mjs — escapeHtml/escapeAttr 契約測試（M2，R4）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, escapeAttr } from './html.js';

test('轉義五元字元 &<>"\'', () => {
    assert.equal(escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
});

test('null/undefined → 空字串', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
});

test('數字轉字串', () => {
    assert.equal(escapeHtml(42), '42');
});

test('一般文字不變', () => {
    assert.equal(escapeHtml('影像分類 abc-123_'), '影像分類 abc-123_');
});

test('escapeAttr 與 escapeHtml 同規則', () => {
    assert.equal(escapeAttr('a"b<c>&d\'e'), escapeHtml('a"b<c>&d\'e'));
});
