/**
 * ui/statusMessage.test.mjs
 * Stage 4 切片 1 測試：集中式狀態訊息 Presenter 的行為契約。
 * 以 fake document 注入，驗證顯示/隱藏/計時器重置/dispose。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStatusMessageUI } from './statusMessage.js';
import { makeEl } from '../../../../test/fakeDom.js';

// [T3 殘項 2026-10-03] 原本自帶的 makeFakeDocument 已改用共用的 makeEl。
// 差異只有初始 classList/style 與元素 id，以 overrides 表達；
// 斷言（textContent / style.visibility / classList）逐字未動。
function makeFakeDocument() {
    const el = makeEl('dataset-manager-message', { style: { display: 'none' } });
    const documentRef = {
        getElementById(id) {
            return id === 'dataset-manager-message' ? el : null;
        }
    };
    return { el, documentRef };
}

// 2026-10-01（T-scan）：原本的 `sleep(ms)` 真等待輔助已移除。
// 所有計時相關測試改用 t.mock.timers（見各測試內註解）：
// 真等待既慢、又因 node --test 並發執行而疊在同一時間軸，無法驗精確邊界。

test('顯示訊息：設定 textContent 與 visibility visible', () => {
    const { el, documentRef } = makeFakeDocument();
    const { showStatusMessage } = createStatusMessageUI(documentRef);
    // duration:0 = 不自動清除。本測試只驗「顯示瞬間」，不需要計時器；
    // 若沿用預設 5000ms，未清除的 setTimeout 會吊住 event loop 讓整個測試檔多等 5 秒。
    showStatusMessage('hello', { duration: 0 });
    assert.equal(el.textContent, 'hello');
    assert.equal(el.style.visibility, 'visible');
});

test('空訊息：visibility hidden 清空文字（常駐列保留空間）', () => {
    const { el, documentRef } = makeFakeDocument();
    const { showStatusMessage } = createStatusMessageUI(documentRef);
    showStatusMessage('hello', { duration: 0 });
    showStatusMessage('');
    assert.equal(el.textContent, '');
    assert.equal(el.style.visibility, 'hidden');
});

test('duration 0：不自動清除', (t) => {
    // 2026-10-01（T-scan）：原為 await sleep(30) 真等待。
    // duration:0 語意就是「不自動清除」，mock 後 tick 一段時間即可驗證，無需真等待。
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { el, documentRef } = makeFakeDocument();
    const { showStatusMessage } = createStatusMessageUI(documentRef);
    showStatusMessage('persist', { duration: 0 });
    t.mock.timers.tick(999999); // 遠超任何合理時間，應仍不自動清除
    assert.equal(el.style.visibility, 'visible');
    assert.equal(el.textContent, 'persist');
});

test('預設 duration：時間到自動清除', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { el, documentRef } = makeFakeDocument();
    const { showStatusMessage } = createStatusMessageUI(documentRef);
    showStatusMessage('auto-clear', { duration: 20 });
    assert.equal(el.style.visibility, 'visible');
    // 邊界斷言：19ms 未到、20ms 剛好到 —— 真等待（原本 sleep(60)）只能驗到後者
    t.mock.timers.tick(19);
    assert.equal(el.style.visibility, 'visible', '19ms 時不應清除（邊界錯誤）');
    t.mock.timers.tick(1);
    assert.equal(el.style.visibility, 'hidden');
    assert.equal(el.textContent, '');
});

test('新訊息取代舊計時器：舊計時器不會提前隱藏新訊息', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { el, documentRef } = makeFakeDocument();
    const { showStatusMessage } = createStatusMessageUI(documentRef);
    // 先顯示較短 duration 的訊息，隨即以較長 duration 取代
    showStatusMessage('first', { duration: 40 });
    showStatusMessage('second', { duration: 120 });

    // 關鍵：跑到 40ms（舊計時器原本會在此隱藏）之後，新訊息必須仍顯示
    // —— 這正是 AGENTS.md 記載的「舊計時器提前隱藏新訊息」bug 的回歸鎖。
    t.mock.timers.tick(40);
    assert.equal(el.textContent, 'second');
    assert.equal(el.style.visibility, 'visible', '舊計時器提前隱藏了新訊息');

    // 第二筆 duration 也過了之後才清除
    t.mock.timers.tick(80); // 累計 120ms
    assert.equal(el.style.visibility, 'hidden');
});

test('dispose：取消進行中的計時器（無殘留回呼）', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { el, documentRef } = makeFakeDocument();
    const { showStatusMessage, dispose } = createStatusMessageUI(documentRef);
    showStatusMessage('pending', { duration: 30 });
    dispose();
    t.mock.timers.tick(999999); // dispose 已取消計時器，跑再久也不應有回呼
    // dispose 已取消計時器，訊息不被自動清除（避免 DOM 銷毀後回呼）
    assert.equal(el.style.visibility, 'visible');
    assert.equal(el.textContent, 'pending');
});

test('元素不存在：no-op 不拋錯', () => {
    const documentRef = { getElementById: () => null };
    const { showStatusMessage } = createStatusMessageUI(documentRef);
    assert.doesNotThrow(() => showStatusMessage('x'));
    assert.doesNotThrow(() => showStatusMessage(''));
});