/**
 * ui/statusMessage.test.mjs
 * Stage 4 切片 1 測試：集中式狀態訊息 Presenter 的行為契約。
 * 以 fake document 注入，驗證顯示/隱藏/計時器重置/dispose。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStatusMessageUI } from './statusMessage.js';

function makeFakeDocument() {
    const el = {
        textContent: '',
        style: { display: 'none' }
    };
    const documentRef = {
        getElementById(id) {
            return id === 'dataset-manager-message' ? el : null;
        }
    };
    return { el, documentRef };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('顯示訊息：設定 textContent 與 display flex', () => {
    const { el, documentRef } = makeFakeDocument();
    const { showStatusMessage } = createStatusMessageUI(documentRef);
    showStatusMessage('hello');
    assert.equal(el.textContent, 'hello');
    assert.equal(el.style.display, 'flex');
});

test('空訊息：立即隱藏並清空文字', () => {
    const { el, documentRef } = makeFakeDocument();
    const { showStatusMessage } = createStatusMessageUI(documentRef);
    showStatusMessage('hello');
    showStatusMessage('');
    assert.equal(el.textContent, '');
    assert.equal(el.style.display, 'none');
});

test('duration 0：不自動清除', async () => {
    const { el, documentRef } = makeFakeDocument();
    const { showStatusMessage } = createStatusMessageUI(documentRef);
    showStatusMessage('persist', { duration: 0 });
    await sleep(30);
    assert.equal(el.style.display, 'flex');
    assert.equal(el.textContent, 'persist');
});

test('預設 duration：時間到自動清除', async () => {
    const { el, documentRef } = makeFakeDocument();
    const { showStatusMessage } = createStatusMessageUI(documentRef);
    showStatusMessage('auto-clear', { duration: 20 });
    assert.equal(el.style.display, 'flex');
    await sleep(60);
    assert.equal(el.style.display, 'none');
    assert.equal(el.textContent, '');
});

test('新訊息取代舊計時器：舊計時器不會提前隱藏新訊息', async () => {
    const { el, documentRef } = makeFakeDocument();
    const { showStatusMessage } = createStatusMessageUI(documentRef);
    // 先顯示較短 duration 的訊息，隨即以較長 duration 取代
    showStatusMessage('first', { duration: 40 });
    showStatusMessage('second', { duration: 120 });

    // 第一筆的 duration 已過，但第二筆應仍顯示
    await sleep(70);
    assert.equal(el.textContent, 'second');
    assert.equal(el.style.display, 'flex');

    // 第二筆 duration 也過了之後才清除
    await sleep(80);
    assert.equal(el.style.display, 'none');
});

test('dispose：取消進行中的計時器（無殘留回呼）', async () => {
    const { el, documentRef } = makeFakeDocument();
    const { showStatusMessage, dispose } = createStatusMessageUI(documentRef);
    showStatusMessage('pending', { duration: 30 });
    dispose();
    await sleep(70);
    // dispose 已取消計時器，訊息不被自動清除（避免 DOM 銷毀後回呼）
    assert.equal(el.style.display, 'flex');
    assert.equal(el.textContent, 'pending');
});

test('元素不存在：no-op 不拋錯', () => {
    const documentRef = { getElementById: () => null };
    const { showStatusMessage } = createStatusMessageUI(documentRef);
    assert.doesNotThrow(() => showStatusMessage('x'));
    assert.doesNotThrow(() => showStatusMessage(''));
});