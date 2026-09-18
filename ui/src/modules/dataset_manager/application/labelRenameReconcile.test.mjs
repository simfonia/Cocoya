/**
 * application/labelRenameReconcile.test.mjs — 標籤改名路徑對帳契約測試（2026-09-17）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileRenamedPaths } from './labelRenameReconcile.js';

const WIN_DISK = 'C:\\Workspace\\proj/dataset\\ds/cat/cat_1.jpg';
const POSIX_OLD = 'C:/Workspace/proj/dataset/ds/cat/cat_1.jpg';
const POSIX_NEW = 'C:/Workspace/proj/dataset/ds/cat2/cat2_1.jpg';

test('Windows 反斜線 diskPath 對後端正斜線 oldPath 仍能命中（回歸：比對 miss 導致檔名不更新）', () => {
    const images = [{ name: 'cat_1.jpg', path: 'cat/cat_1.jpg', label: 'cat2', diskPath: WIN_DISK }];
    const changed = reconcileRenamedPaths(images, [{ oldPath: POSIX_OLD, newPath: POSIX_NEW }], {
        oldLabel: 'cat', newLabel: 'cat2'
    });
    assert.equal(changed, 1);
    assert.equal(images[0].diskPath, POSIX_NEW);
    assert.equal(images[0].name, 'cat2_1.jpg');
    assert.equal(images[0].path, 'cat2/cat2_1.jpg');
});

test('兩端皆正斜線時命中（Tauri 情境）', () => {
    const images = [{ name: 'cat_1.jpg', path: 'cat/cat_1.jpg', label: 'cat2', diskPath: POSIX_OLD }];
    reconcileRenamedPaths(images, [{ oldPath: POSIX_OLD, newPath: POSIX_NEW }], { oldLabel: 'cat', newLabel: 'cat2' });
    assert.equal(images[0].path, 'cat2/cat2_1.jpg');
    assert.equal(images[0].diskPath, POSIX_NEW);
});

test('未命中（檔名未回報）時僅同步 path 目錄段，動到檔名', () => {
    const images = [{ name: 'cat_9.jpg', path: 'cat/cat_9.jpg', label: 'cat2', diskPath: null }];
    const changed = reconcileRenamedPaths(images, [{ oldPath: POSIX_OLD, newPath: POSIX_NEW }], {
        oldLabel: 'cat', newLabel: 'cat2'
    });
    assert.equal(changed, 1);
    assert.equal(images[0].path, 'cat2/cat_9.jpg');
    assert.equal(images[0].diskPath, null);
});

test('絕對路徑前綴不一致時以檔名唯一兜底', () => {
    const images = [
        { name: 'cat_1.jpg', path: 'cat/cat_1.jpg', label: 'cat2', diskPath: 'D:\\other\\dataset\\ds\\cat\\cat_1.jpg' },
        { name: 'cat_2.jpg', path: 'cat/cat_2.jpg', label: 'cat2', diskPath: 'D:\\other\\dataset\\ds\\cat\\cat_2.jpg' }
    ];
    reconcileRenamedPaths(images, [{ oldPath: POSIX_OLD, newPath: POSIX_NEW }], { oldLabel: 'cat', newLabel: 'cat2' });
    assert.equal(images[0].path, 'cat2/cat2_1.jpg');
    assert.equal(images[0].diskPath, POSIX_NEW);
    // 未在清單中的檔名不可被誤改（僅目錄段同步）
    assert.equal(images[1].path, 'cat2/cat_2.jpg');
});

test('檔名在清單中不唯一時不兜底（僅同步目錄段）', () => {
    const images = [
        { name: 'cat_1.jpg', path: 'cat/cat_1.jpg', label: 'cat2', diskPath: 'D:\\a\\cat\\cat_1.jpg' },
        { name: 'cat_1.jpg', path: 'cat/cat_1.jpg', label: 'cat2', diskPath: 'E:\\b\\cat\\cat_1.jpg' }
    ];
    reconcileRenamedPaths(images, [{ oldPath: POSIX_OLD, newPath: POSIX_NEW }], { oldLabel: 'cat', newLabel: 'cat2' });
    assert.equal(images[0].path, 'cat2/cat_1.jpg');
    assert.equal(images[1].path, 'cat2/cat_1.jpg');
    // 無法唯一判定 → 不動 diskPath（保留原值，避免錯改無關檔案）
    assert.equal(images[0].diskPath, 'D:\\a\\cat\\cat_1.jpg');
});

test('空 renames / 空 images / 缺 label 一律 no-op', () => {
    const images = [{ name: 'cat_1.jpg', path: 'cat/cat_1.jpg', label: 'cat2', diskPath: WIN_DISK }];
    assert.equal(reconcileRenamedPaths(images, [], { oldLabel: 'cat', newLabel: 'cat2' }), 0);
    assert.equal(reconcileRenamedPaths([], [{ oldPath: POSIX_OLD, newPath: POSIX_NEW }], { oldLabel: 'cat', newLabel: 'cat2' }), 0);
    assert.equal(reconcileRenamedPaths(images, [{ oldPath: POSIX_OLD, newPath: POSIX_NEW }], { oldLabel: '', newLabel: '' }), 0);
    assert.equal(images[0].path, 'cat/cat_1.jpg');
});

test('label 尚未同步為新名（label === oldLabel）時不做目錄段改寫', () => {
    const images = [{ name: 'cat_9.jpg', path: 'cat/cat_9.jpg', label: 'cat', diskPath: null }];
    assert.equal(reconcileRenamedPaths(images, [{ oldPath: POSIX_OLD, newPath: POSIX_NEW }], { oldLabel: 'cat', newLabel: 'cat2' }), 0);
    assert.equal(images[0].path, 'cat/cat_9.jpg');
});
