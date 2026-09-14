import test from 'node:test';
import assert from 'node:assert/strict';
import {
    HAND_POINTS, POSE_POINTS, FEATURE_MEDIAPIPE_MISSING,
    featureColumnNames, buildFeatureSchema, landmarksToRow, detectUseZ
} from './featureSchema.js';

test('常量與錯誤代碼契約', () => {
    assert.equal(HAND_POINTS, 21);
    assert.equal(POSE_POINTS, 33);
    assert.equal(FEATURE_MEDIAPIPE_MISSING, 'FEATURE_MEDIAPIPE_MISSING');
});

test('featureColumnNames：含 z = 63+99，不含 z = 42+66', () => {
    const withZ = featureColumnNames({ useZ: true });
    const withoutZ = featureColumnNames({ useZ: false });
    assert.equal(withZ.length, 21 * 3 + 33 * 3);
    assert.equal(withoutZ.length, 21 * 2 + 33 * 2);
    assert.ok(withZ.includes('hand_0_x'));
    assert.ok(withZ.includes('hand_20_z'));
    assert.ok(withZ.includes('pose_0_x'));
    assert.ok(withZ.includes('pose_32_z'));
    // 不含 z 時不得有 z 欄位
    assert.ok(!withoutZ.includes('hand_0_z'));
    assert.ok(!withoutZ.includes('pose_0_z'));
});

test('buildFeatureSchema：含 label 欄與 label 指定', () => {
    const s = buildFeatureSchema({ useZ: true });
    assert.equal(s.columns.length, 162 + 1);
    assert.equal(s.features.length, 162);
    assert.equal(s.label, 'label');
    const labelCol = s.columns[s.columns.length - 1];
    assert.deepEqual(labelCol, { name: 'label', type: 'string', role: 'label' });
    assert.ok(s.columns.every((c, i) => i < 162 ? c.role === 'feature' : c.role === 'label'));
});

test('landmarksToRow：含 z 組裝 162 特徵欄＋label', () => {
    const hand = Array.from({ length: 21 }, (_, i) => [i, i + 0.5, i + 1]);
    const pose = Array.from({ length: 33 }, (_, i) => [i, i + 0.25, i + 2]);
    const row = landmarksToRow({ hand, pose, label: 'up', useZ: true });
    assert.equal(row.label, 'up');
    assert.equal(row['hand_0_x'], 0);
    assert.equal(row['hand_20_z'], 21); // 20 + 1
    assert.equal(row['pose_32_z'], 34); // 32 + 2
    const featureKeys = Object.keys(row).filter((k) => k !== 'label');
    assert.equal(featureKeys.length, 162);
    // 未偵測（null）→ 欄位填 0
    const emptyRow = landmarksToRow({ hand: null, pose: null, label: 'x', useZ: false });
    assert.equal(emptyRow['hand_0_x'], 0);
});

test('detectUseZ 反推維度', () => {
    assert.equal(detectUseZ({ hand_0_x: 1, hand_0_z: 2 }), true);
    assert.equal(detectUseZ({ hand_0_x: 1 }), false);
    assert.equal(detectUseZ({}), null);
});