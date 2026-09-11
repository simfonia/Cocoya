/**
 * core/typePolicy.test.mjs — 類型政策 SSOT 契約測試（M1，R3）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    isImageType, needsAnnotationCheck, needsUnclassifiedCheck,
    isClassificationType, isDevType, allowedModes
} from './typePolicy.js';

test('影像系判定：image/object_detection/line_following', () => {
    assert.equal(isImageType('image'), true);
    assert.equal(isImageType('object_detection'), true);
    assert.equal(isImageType('line_following'), true);
    assert.equal(isImageType('table'), false);
    assert.equal(isImageType('feature'), false);
    assert.equal(isImageType('serial'), false);
});

test('標註檢查：僅 object_detection/line_following；未分類僅 object_detection', () => {
    assert.equal(needsAnnotationCheck('object_detection'), true);
    assert.equal(needsAnnotationCheck('line_following'), true);
    assert.equal(needsAnnotationCheck('image'), false);
    assert.equal(needsUnclassifiedCheck('object_detection'), true);
    assert.equal(needsUnclassifiedCheck('line_following'), false);
});

test('分類校正：僅 image；開發中：feature/serial', () => {
    assert.equal(isClassificationType('image'), true);
    assert.equal(isClassificationType('object_detection'), false);
    assert.equal(isDevType('feature'), true);
    assert.equal(isDevType('serial'), true);
    assert.equal(isDevType('table'), false);
});

test('allowedModes：影像系 live+file，表格系 file；未知 fallback file', () => {
    assert.deepEqual(allowedModes('image'), ['live', 'file']);
    assert.deepEqual(allowedModes('table'), ['file']);
    assert.deepEqual(allowedModes('feature'), ['file']);
    assert.deepEqual(allowedModes('serial'), ['file']);
    assert.deepEqual(allowedModes('unknown'), ['file']);
});
