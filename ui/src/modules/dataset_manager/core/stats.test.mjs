/**
 * core/stats.test.mjs — 統計計算契約（2026-09-22 Issue 1：摘要列資料源）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateStats, countAnnotatedImages } from './stats.js';

test('countAnnotatedImages：image 類型全部視為已標註', () => {
    assert.equal(countAnnotatedImages('image', [{}, { annotations: [] }]), 2);
    assert.equal(countAnnotatedImages('image', []), 0);
});

test('countAnnotatedImages：object_detection 只算有框的圖', () => {
    const images = [
        { annotations: [{ class_id: 0, bbox: [0.1, 0.1, 0.2, 0.2] }] },
        { annotations: [] },
        {},
        { annotations: [{ class_id: 1, bbox: [0, 0, 1, 1] }] }
    ];
    assert.equal(countAnnotatedImages('object_detection', images), 2);
});

test('countAnnotatedImages：line_following 只算有線段的圖', () => {
    const images = [
        { annotations: [{ line: [0, 0, 1, 1] }] },
        { annotations: [] }
    ];
    assert.equal(countAnnotatedImages('line_following', images), 1);
});

test('countAnnotatedImages：非陣列輸入回 0（表格系無 images）', () => {
    assert.equal(countAnnotatedImages('object_detection', null), 0);
    assert.equal(countAnnotatedImages('table', undefined), 0);
});

test('calculateStats：偵測未採集框時 label_counts 為 0 但 sampleCount=張數', () => {
    const images = [{ annotations: [] }, { annotations: [] }];
    const stats = calculateStats('object_detection', images, { redBall: 0 });
    assert.equal(stats.sampleCount, 2);
    assert.equal(stats.labelCounts.redBall, 0);
});