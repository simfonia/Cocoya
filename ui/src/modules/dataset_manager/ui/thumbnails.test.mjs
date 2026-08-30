import test from 'node:test';
import assert from 'node:assert/strict';
import { createGridScrollManager } from './thumbnails.js';

function gridEl(scrollTop = 0) {
    return {
        scrollTop,
        querySelector(sel) {
            return sel === '.dataset-image-grid' ? this : null;
        }
    };
}

function makeEnv({ withGrid = true, images = 3 } = {}) {
    const state = { _savedGridScrollTop: 0 };
    const grid = gridEl(0);
    const container = withGrid ? { inner: grid } : {};
    const mgr = createGridScrollManager({
        state,
        getContainer: () => (withGrid || Object.keys(container).length ? container : null),
        hasImages: () => images > 0
    });
    // 讓 container.querySelector 直接回傳 grid（模擬 #dataset-image-preview 內的 grid）
    container.querySelector = (sel) => (sel === '.dataset-image-grid' && withGrid ? grid : null);
    return { state, grid, container, mgr };
}

test('saveGridScroll 記錄目前 grid.scrollTop', () => {
    const { state, grid, mgr } = makeEnv();
    grid.scrollTop = 420;
    mgr.saveGridScroll();
    assert.equal(state._savedGridScrollTop, 420);
});

test('saveGridScroll 無 grid 時記錄 0', () => {
    const { state, mgr } = makeEnv({ withGrid: false });
    mgr.saveGridScroll();
    assert.equal(state._savedGridScrollTop, 0);
});

test('restoreGridScroll 使用 saved 值還原並清空 state', () => {
    const { state, grid, mgr } = makeEnv();
    state._savedGridScrollTop = 300;
    mgr.restoreGridScroll();
    assert.equal(grid.scrollTop, 300);
    assert.equal(state._savedGridScrollTop, 0);
});

test('restoreGridScroll 無 saved 時沿用現有 grid scrollTop（刪除保留）', () => {
    const { state, grid, mgr } = makeEnv();
    grid.scrollTop = 250;
    mgr.restoreGridScroll();
    assert.equal(grid.scrollTop, 250);
    assert.equal(state._savedGridScrollTop, 0);
});

test('restoreGridScroll 無影像時不寫入 scrollTop', () => {
    const { state, grid, mgr } = makeEnv({ images: 0 });
    state._savedGridScrollTop = 300;
    mgr.restoreGridScroll();
    assert.equal(grid.scrollTop, 0);
    assert.equal(state._savedGridScrollTop, 0);
});

test('restoreGridScroll saved 為 0 且現有 scrollTop 為 0 時不寫入', () => {
    const { state, grid, mgr } = makeEnv();
    mgr.restoreGridScroll();
    assert.equal(grid.scrollTop, 0);
    assert.equal(state._savedGridScrollTop, 0);
});

test('restoreGridScroll 容器不存在時早退、不清空 state（原契約）', () => {
    const state = { _savedGridScrollTop: 300 };
    const mgr = createGridScrollManager({
        state,
        getContainer: () => null,
        hasImages: () => true
    });
    mgr.restoreGridScroll();
    assert.equal(state._savedGridScrollTop, 300);
});

test('save→restore round-trip（UI4-3 契約：返回後 scrollTop 一致）', () => {
    const { state, grid, mgr } = makeEnv();
    grid.scrollTop = 777;
    mgr.saveGridScroll();
    grid.scrollTop = 0; // 模擬重新 render 後歸零
    mgr.restoreGridScroll();
    assert.equal(grid.scrollTop, 777);
    assert.equal(state._savedGridScrollTop, 0);
    assert.doesNotThrow(() => mgr.dispose());
});
