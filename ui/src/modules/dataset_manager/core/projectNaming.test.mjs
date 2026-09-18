/**
 * core/projectNaming.test.mjs — 資料集名稱規則與「改名漂移偵測」契約測試（方案 A，2026-09-17）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    sanitizeProjectName,
    isProjectNameEqual,
    datasetNameFromImagePath,
    datasetNameFromFolderPath,
    detectDatasetNameDrift
} from './projectNaming.js';

test('sanitizeProjectName 只保留 [A-Za-z0-9_-]', () => {
    assert.equal(sanitizeProjectName('cat-1_x'), 'cat-1_x');
    assert.equal(sanitizeProjectName('cat!.1'), 'cat1');
    assert.equal(sanitizeProjectName(undefined), '');
    assert.equal(sanitizeProjectName(123), '123');
});

test('isProjectNameEqual 以清理後字串比較', () => {
    assert.equal(isProjectNameEqual('cat', 'cat!'), true);
    assert.equal(isProjectNameEqual('cat', 'dog'), false);
});

test('datasetNameFromImagePath：尾段（標籤/檔名）反推最精確，正/反斜線皆可', () => {
    assert.equal(datasetNameFromImagePath('C:/proj/dataset/cat/label1/cat_1.jpg', { name: 'cat_1.jpg', label: 'label1' }), 'cat');
    assert.equal(datasetNameFromImagePath('C:\\proj\\dataset\\dog\\dog\\dog_1.jpg', { name: 'dog_1.jpg', label: 'dog' }), 'dog');
    // 專案根內也有名為 dataset 的資料夾時，尾段反推仍正確（錨點法會誤判）
    assert.equal(datasetNameFromImagePath('C:/work/dataset/proj/dataset/cat/cat/cat_1.jpg', { name: 'cat_1.jpg', label: 'cat' }), 'cat');
});

test('datasetNameFromImagePath：資料集名稱本身就叫 dataset（無尾段資訊時用錨點）', () => {
    assert.equal(datasetNameFromImagePath('C:/proj/dataset/dataset/a/a_1.jpg'), 'dataset');
    assert.equal(datasetNameFromImagePath('C:\\proj\\dataset\\cat\\label\\cat_1.jpg'), 'cat');
});

test('datasetNameFromImagePath：無證據一律回空字串（保守，不誤報）', () => {
    assert.equal(datasetNameFromImagePath(''), '');
    assert.equal(datasetNameFromImagePath(null), '');
    assert.equal(datasetNameFromImagePath('C:/proj/cat/cat_1.jpg'), '');
    assert.equal(datasetNameFromImagePath('C:/proj/dataset/cat_1.jpg'), '');
    // 非 canonical（缺標籤目錄）→ 不猜測
    assert.equal(datasetNameFromImagePath('C:\\proj\\dataset\\cat\\cat_1.jpg'), '');
});

test('datasetNameFromFolderPath：僅接受 canonical 形狀（dataset 段之後一段）', () => {
    assert.equal(datasetNameFromFolderPath('C:\\proj\\dataset\\cat'), 'cat');
    assert.equal(datasetNameFromFolderPath('C:/proj/dataset/cat/'), 'cat');
    assert.equal(datasetNameFromFolderPath('D:/myfolder'), '');
    assert.equal(datasetNameFromFolderPath(null), '');
});

test('live 落盤影像：名稱不同 → drifted，回報磁碟名稱與來源', () => {
    const state = {
        images: [{ name: 'cat_1.jpg', label: 'cat', diskPath: 'C:\\proj/dataset\\cat/cat/cat_1.jpg' }],
        sourceFolderPath: null
    };
    assert.deepEqual(detectDatasetNameDrift(state, 'dog'), { drifted: true, diskName: 'cat', source: 'live' });
});

test('名稱相同（含非法字元清理後相同）→ 不漂移', () => {
    const state = { images: [{ name: 'cat_1.jpg', label: 'cat', diskPath: 'C:/proj/dataset/cat/cat/cat_1.jpg' }] };
    assert.equal(detectDatasetNameDrift(state, 'cat').drifted, false);
    assert.equal(detectDatasetNameDrift(state, 'cat!').drifted, false);
    assert.equal(detectDatasetNameDrift(state, 'cat').diskName, 'cat');
});

test('file 匯入（canonical 目錄）→ 以目錄判定', () => {
    const state = { images: [{ path: 'cat/cat_1.jpg', diskPath: null }], sourceFolderPath: 'D:\\proj\\dataset\\cat' };
    const result = detectDatasetNameDrift(state, 'dog');
    assert.equal(result.drifted, true);
    assert.equal(result.diskName, 'cat');
    assert.equal(result.source, 'import');
});

test('live 證據優先於 sourceFolderPath', () => {
    const state = {
        images: [{ name: 'a.jpg', label: 'label', diskPath: 'C:/proj/dataset/live1/label/a.jpg' }],
        sourceFolderPath: 'C:/proj/dataset/imported'
    };
    const result = detectDatasetNameDrift(state, 'other');
    assert.equal(result.diskName, 'live1');
    assert.equal(result.source, 'live');
});

test('未有落盤證據（無 diskPath、無 sourceFolderPath、取不到名稱）→ 不漂移（名稱可自由變更）', () => {
    assert.equal(detectDatasetNameDrift({ images: [{ path: 'cat/cat_1.jpg', diskPath: null }] }, 'dog').drifted, false);
    assert.equal(detectDatasetNameDrift({ images: [{ diskPath: 'D:/myfolder/a.jpg' }] }, 'dog').drifted, false);
    assert.equal(detectDatasetNameDrift({ images: [] }, 'dog').drifted, false);
    assert.equal(detectDatasetNameDrift({}, 'dog').drifted, false);
    assert.equal(detectDatasetNameDrift(undefined, 'dog').drifted, false);
    assert.equal(detectDatasetNameDrift({ images: null, sourceFolderPath: 'D:/myfolder' }, 'dog').drifted, false);
});

test('名稱清空／空白 → 視為表單 fallback dataset', () => {
    const state = { images: [{ name: 'cat_1.jpg', label: 'cat', diskPath: 'C:/proj/dataset/cat/cat/cat_1.jpg' }] };
    assert.equal(detectDatasetNameDrift(state, '').drifted, true);
    assert.equal(detectDatasetNameDrift(state, '   ').drifted, true);
    const sameName = { images: [{ diskPath: 'C:/proj/dataset/dataset/a/a_1.jpg' }] };
    assert.equal(detectDatasetNameDrift(sameName, '').drifted, false);
});
