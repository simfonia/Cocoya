/**
 * application/importUseCases.test.mjs — parseDataFileRows 純轉換測試（Node）
 * 對應施工指引 U3-3（匯入資料一致性）可自動化部分。
 * 執行：node --test ui/src/modules/dataset_manager/application/importUseCases.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDataFileRows } from './importUseCases.js';

test('CSV：基本解析（parseCSV 自動轉型數值）', () => {
    const rows = parseDataFileRows('data.csv', 'a,b\n1,2\n3,4\n');
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], { a: 1, b: 2 });
});

test('JSON：陣列直接使用', () => {
    const rows = parseDataFileRows('data.json', '[{"x":1},{"x":2}]');
    assert.equal(rows.length, 2);
    assert.equal(rows[1].x, 2);
});

test('JSON：單一物件包裝為一列', () => {
    const rows = parseDataFileRows('data.json', '{"x":1}');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].x, 1);
});

test('JSON：物件含 data/samples 欄位取用', () => {
    assert.equal(parseDataFileRows('d.json', '{"data":[{"a":1}]}').length, 1);
    assert.equal(parseDataFileRows('d.json', '{"samples":[{"a":1},{"a":2}]}').length, 2);
});

test('空內容拋 EMPTY_OR_INVALID', () => {
    assert.throws(() => parseDataFileRows('d.csv', ''), (e) => e.message === 'EMPTY_OR_INVALID');
    assert.throws(() => parseDataFileRows('d.json', '[]'), (e) => e.message === 'EMPTY_OR_INVALID');
});

test('未知副檔名視為空內容拋錯', () => {
    assert.throws(() => parseDataFileRows('d.txt', 'hello'), (e) => e.message === 'EMPTY_OR_INVALID');
});

test('非法 JSON 拋 SyntaxError（不吞例外）', () => {
    assert.throws(() => parseDataFileRows('d.json', '{bad json'), SyntaxError);
});
