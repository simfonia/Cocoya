/**
 * application/annotationMutations.test.mjs — 標註 mutation 純函式測試（Node）
 * 執行：node --test ui/src/modules/dataset_manager/application/annotationMutations.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    countAnnotated, countUnannotated, countUnclassifiedBoxes, countBoxesWithClassId,
    countImagesWithLabel, removeAnnotationsByClassId, reassignLabelsToUnlabeled,
    resolveDeleteIndex, setAnnotationClassId, removeAnnotationAt
} from './annotationMutations.js';

const IMG = (annotations, label) => ({ annotations, label });

test('countAnnotated / countUnannotated', () => {
    const imgs = [IMG([{ x: 1 }]), IMG([]), IMG(undefined), IMG([{ x: 2 }])];
    assert.equal(countAnnotated(imgs), 2);
    assert.equal(countUnannotated(imgs), 2);
    assert.equal(countUnannotated([]), 0);
});

test('countUnclassifiedBoxes：僅計 class_id === -1', () => {
    const imgs = [IMG([{ class_id: -1 }, { class_id: 0 }]), IMG([{ class_id: -1 }]), IMG(undefined)];
    assert.equal(countUnclassifiedBoxes(imgs), 2);
});

test('countBoxesWithClassId / countImagesWithLabel', () => {
    const imgs = [IMG([{ class_id: 3 }]), IMG([{ class_id: 3 }, { class_id: 1 }])];
    assert.equal(countBoxesWithClassId(imgs, 3), 2);
    assert.equal(countImagesWithLabel([IMG(null, 'cat'), IMG(null, 'dog'), IMG(null, 'cat')], 'cat'), 2);
});

test('removeAnnotationsByClassId：原地刪除並回傳總數', () => {
    const imgs = [IMG([{ class_id: 2 }, { class_id: 0 }]), IMG([{ class_id: 2 }])];
    assert.equal(removeAnnotationsByClassId(imgs, 2), 2);
    assert.deepEqual(imgs[0].annotations, [{ class_id: 0 }]);
    assert.deepEqual(imgs[1].annotations, []);
    // annotations undefined 不拋錯
    assert.equal(removeAnnotationsByClassId([IMG(undefined)], 1), 0);
});

test('reassignLabelsToUnlabeled：原地改 label 並回傳改動數', () => {
    const imgs = [IMG(null, 'cat'), IMG(null, 'dog'), IMG(null, 'cat')];
    assert.equal(reassignLabelsToUnlabeled(imgs, 'cat'), 2);
    assert.equal(imgs[0].label, 'unlabeled');
    assert.equal(imgs[1].label, 'dog');
});

test('resolveDeleteIndex：無效選擇退回最後一個；空陣列 -1', () => {
    const anns = [{ a: 1 }, { a: 2 }, { a: 3 }];
    assert.equal(resolveDeleteIndex(anns, 1), 1);
    assert.equal(resolveDeleteIndex(anns, -1), 2);
    assert.equal(resolveDeleteIndex(anns, 99), 2);
    assert.equal(resolveDeleteIndex([], 0), -1);
    assert.equal(resolveDeleteIndex(undefined, 0), -1);
});

test('setAnnotationClassId / removeAnnotationAt：邊界回 false', () => {
    const anns = [{ class_id: 0 }, { class_id: 1 }];
    assert.equal(setAnnotationClassId(anns, 0, 5), true);
    assert.equal(anns[0].class_id, 5);
    assert.equal(setAnnotationClassId(anns, 9, 5), false);
    assert.equal(removeAnnotationAt(anns, 1), true);
    assert.equal(anns.length, 1);
    assert.equal(removeAnnotationAt(anns, 5), false);
    assert.equal(removeAnnotationAt(undefined, 0), false);
});
