/**
 * ui (root) spec.test.mjs — DatasetSpec 契約測試（R7 表格落盤）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatasetSpec, TABLE_SAMPLES_PERSIST_LIMIT } from './spec.js';

test('TABLE_SAMPLES_PERSIST_LIMIT 為 2000', () => {
    assert.equal(TABLE_SAMPLES_PERSIST_LIMIT, 2000);
});

test('buildTableSamples：未超限不回傳截斷、total 全量', () => {
    const rows = [{ a: 1 }, { a: 2 }];
    const r = DatasetSpec.buildTableSamples(rows, 10);
    assert.equal(r.samples.length, 2);
    assert.equal(r.truncated, false);
    assert.equal(r.total, 2);
});

test('buildTableSamples：超限只取前 limit 筆並標 truncated', () => {
    const rows = Array.from({ length: 2000 }, (_, i) => ({ a: i }));
    const r = DatasetSpec.buildTableSamples(rows, 2000);
    assert.equal(r.samples.length, 2000);
    assert.equal(r.truncated, false);
    assert.equal(r.total, 2000);

    const overflow = Array.from({ length: 2001 }, (_, i) => ({ a: i }));
    const r2 = DatasetSpec.buildTableSamples(overflow, 2000);
    assert.equal(r2.samples.length, 2000);
    assert.equal(r2.truncated, true);
    assert.equal(r2.total, 2001);
});

test('buildTableSamples：非陣列與自訂 limit', () => {
    assert.deepEqual(DatasetSpec.buildTableSamples(null, 5), { samples: [], truncated: false, total: 0 });
    const r = DatasetSpec.buildTableSamples([{ a: 1 }, { a: 2 }, { a: 3 }], 2);
    assert.equal(r.samples.length, 2);
    assert.equal(r.truncated, true);
    assert.equal(r.total, 3);
});

test('createDefault 預設 samples_truncated = false', () => {
    const spec = DatasetSpec.createDefault({ name: 'd', type: 'table' });
    assert.equal(spec.toJSON().stats.samples_truncated, false);
});

test('toJSON round-trip 保留 samples_truncated', () => {
    const spec = new DatasetSpec({
        project: { name: 'd', type: 'table' },
        stats: { sample_count: 5, label_counts: {}, samples_truncated: true }
    });
    assert.equal(spec.toJSON().stats.samples_truncated, true);
    // 再次建構（模擬讀檔）仍保留
    const reloaded = new DatasetSpec(JSON.parse(JSON.stringify(spec.toJSON())));
    assert.equal(reloaded.toJSON().stats.samples_truncated, true);
});

// M4：feature live 模式驗證豁免——無欄位時走引導式 warning，不出現 file 模式 error
function makeFeatureSpec(mode, sampleCount = 0) {
    return new DatasetSpec({
        project: { name: 'f', type: 'feature' },
        data_source: { mode, files: [], samples: [], base_dir: 'dataset/f/' },
        schema: { columns: [], features: [], label: '' },
        stats: { sample_count: sampleCount, label_counts: {}, samples_truncated: false }
    });
}

test('feature live 無欄位無樣本：不出現 COLUMN_REQUIRED error，出現樣本引導 warning', () => {
    const v = makeFeatureSpec('live').validate();
    assert.equal(v.ok, true);
    assert.ok(!v.errors.some((e) => e.includes('欄位')));
    assert.ok(v.warnings.some((w) => w.includes('feature samples') || w.includes('特徵樣本')));
});

test('feature live 無欄位無樣本：不發 NO_LABEL / NO_FEATURES', () => {
    const v = makeFeatureSpec('live').validate();
    assert.ok(!v.warnings.some((w) => w.includes('Label')));
    assert.ok(!v.warnings.some((w) => w.includes('Feature 欄位')));
});

test('feature file 模式無欄位：維持 COLUMN_REQUIRED error（匯出必要條件不變）', () => {
    const v = makeFeatureSpec('file').validate();
    assert.equal(v.ok, false);
    assert.ok(v.errors.length > 0);
});
