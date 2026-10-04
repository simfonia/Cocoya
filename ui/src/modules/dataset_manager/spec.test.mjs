/**
 * ui (root) spec.test.mjs — DatasetSpec 契約測試（R7 表格落盤）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatasetSpec, TABLE_SAMPLES_PERSIST_LIMIT } from './spec.js';

/** [P2-13] validate() 回傳的 code 清單（不讀文案，避免文案改寫就變紪測試） */
const codesOf = (list) => (list || []).map((i) => i.code);

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
    assert.ok(!codesOf(v.errors).includes('VALIDATE_COLUMN_REQUIRED'));
    assert.ok(codesOf(v.warnings).includes('VALIDATE_NO_SAMPLES_FEATURE'));
});

test('feature live 無欄位無樣本：不發 NO_LABEL / NO_FEATURES', () => {
    const v = makeFeatureSpec('live').validate();
    assert.ok(!codesOf(v.warnings).includes('VALIDATE_NO_LABEL'));
    assert.ok(!codesOf(v.warnings).includes('VALIDATE_NO_FEATURES'));
});

test('feature file 模式無欄位：維持 COLUMN_REQUIRED error（匯出必要條件不變）', () => {
    const v = makeFeatureSpec('file').validate();
    assert.equal(v.ok, false);
    assert.ok(v.errors.length > 0);
});

// 2026-09-16：影像類標籤存在於每張樣本，schema.label 不適用——
// 不再發出「尚未指定 Label 欄位」誤導訊息；改為真實反映未標籤樣本數
function makeImageSpec(sampleCount, labelCounts = {}) {
    return new DatasetSpec({
        project: { name: 'img', type: 'image_classification' },
        data_source: { mode: 'live', files: [], samples: [], base_dir: 'dataset/img/' },
        schema: { columns: [], features: [], label: '', label_map: {} },
        stats: { sample_count: sampleCount, label_counts: labelCounts, samples_truncated: false }
    });
}

test('image_classification live 已拍樣本：不發 NO_LABEL；有未標籤照片時真實警告', () => {
    const v = makeImageSpec(3, { unlabeled: 2, cat: 1 }).validate();
    assert.equal(v.ok, true);
    assert.ok(!codesOf(v.warnings).includes('VALIDATE_NO_LABEL'), '不懂出現 NO_LABEL 誤導訊息');
    const un = v.warnings.find((w) => w.code === 'VALIDATE_UNLABELED_SAMPLES');
    assert.ok(un, '應有 VALIDATE_UNLABELED_SAMPLES');
    assert.deepEqual(un.params, [3, 2], '參數應為 [總樣本數, 未標約數]');
});

test('image_classification live 全部照片已標籤：乾淨無警告', () => {
    const v = makeImageSpec(3, { cat: 2, dog: 1 }).validate();
    assert.equal(v.ok, true);
    assert.equal(v.warnings.length, 0);
});
