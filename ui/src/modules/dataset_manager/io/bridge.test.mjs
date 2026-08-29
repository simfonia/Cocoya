/**
 * io/bridge.test.mjs — DatasetBridge port 自動化測試（fake transport）
 * 對應施工指引 A2-2（非同步 response correlation）可自動化部分。
 * 執行：node --test ui/src/modules/dataset_manager/io/bridge.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatasetBridge } from './bridge.js';

/** Fake transport：手動 emit、可亂序、可記錄 send */
function createFakeTransport() {
    const listeners = new Set();
    const sent = [];
    return {
        sent,
        send(command, payload) { sent.push({ command, payload }); },
        onMessage(cb) { listeners.add(cb); },
        offMessage(cb) { listeners.delete(cb); },
        emit(message) { for (const cb of Array.from(listeners)) cb(message); },
        listenerCount() { return listeners.size; }
    };
}

const TICK = () => new Promise((r) => setTimeout(r, 5));

test('request: 回應正確 resolve，payload 帶入 send', async () => {
    const t = createFakeTransport();
    const b = createDatasetBridge(t);
    const { promise } = b.request({ command: 'saveX', payload: { a: 1 }, resultCommand: 'saveXResult', timeoutMs: 500 });
    assert.equal(t.sent.length, 1);
    assert.equal(t.sent[0].command, 'saveX');
    assert.deepEqual(t.sent[0].payload, { a: 1 });
    await TICK();
    t.emit({ command: 'saveXResult', success: true, path: 'p' });
    const msg = await promise;
    assert.equal(msg.path, 'p');
    assert.equal(t.listenerCount(), 1); // 內部 dispatcher 仍在
    b.dispose();
    assert.equal(t.listenerCount(), 0);
});

test('request: 兩個同 resultCommand 請求，FIFO 依序配對不交叉', async () => {
    const t = createFakeTransport();
    const b = createDatasetBridge(t);
    const r1 = b.request({ command: 'load', resultCommand: 'loadResult', timeoutMs: 1000 });
    const r2 = b.request({ command: 'load', resultCommand: 'loadResult', timeoutMs: 1000 });
    await TICK();
    t.emit({ command: 'loadResult', seq: 1 });
    t.emit({ command: 'loadResult', seq: 2 });
    assert.equal((await r1.promise).seq, 1);
    assert.equal((await r2.promise).seq, 2);
    b.dispose();
});

test('request: requestId 精準 correlation，亂序與他人回應不誤配', async () => {
    const t = createFakeTransport();
    const b = createDatasetBridge(t);
    const rA = b.request({ command: 'cap', resultCommand: 'capResult', requestId: 'A', timeoutMs: 1000 });
    const rB = b.request({ command: 'cap', resultCommand: 'capResult', requestId: 'B', timeoutMs: 1000 });
    await TICK();
    t.emit({ command: 'capResult', requestId: 'B', ok: 'B' }); // B 先回
    t.emit({ command: 'capResult', requestId: 'OTHER', ok: 'X' }); // 無人認領
    t.emit({ command: 'capResult', requestId: 'A', ok: 'A' }); // A 後回
    assert.equal((await rB.promise).ok, 'B');
    assert.equal((await rA.promise).ok, 'A');
    b.dispose();
});

test('request: timeout reject 並清理 pending，遲到回應被丟棄', async () => {
    const t = createFakeTransport();
    const b = createDatasetBridge(t);
    const { promise } = b.request({ command: 'slow', resultCommand: 'slowResult', timeoutMs: 20 });
    await assert.rejects(promise, (e) => e.code === 'TIMEOUT');
    t.emit({ command: 'slowResult', late: true }); // 不得造成未捕捉錯誤或 resolve
    b.dispose();
});

test('request: cancel reject CANCELED，遲到回應被丟棄', async () => {
    const t = createFakeTransport();
    const b = createDatasetBridge(t);
    const { promise, cancel } = b.request({ command: 'x', resultCommand: 'xResult', timeoutMs: 5000 });
    cancel();
    await assert.rejects(promise, (e) => e.code === 'CANCELED');
    t.emit({ command: 'xResult', late: true });
    b.dispose();
});

test('subscribe/unsubscribe: unsubscribe 後不再收到事件', async () => {
    const t = createFakeTransport();
    const b = createDatasetBridge(t);
    const seen = [];
    const off = b.subscribe('evt', (m) => seen.push(m));
    t.emit({ command: 'evt', n: 1 });
    off();
    t.emit({ command: 'evt', n: 2 });
    assert.deepEqual(seen.map((m) => m.n), [1]);
    b.dispose();
});

test('once: 第一筆匹配即解除；不匹配的 command 不觸發', async () => {
    const t = createFakeTransport();
    const b = createDatasetBridge(t);
    const p = b.once('status', { timeoutMs: 500 });
    t.emit({ command: 'other' });
    t.emit({ command: 'status', ok: true });
    assert.equal((await p).ok, true);
    assert.equal(t.listenerCount(), 1); // 只剩內部 dispatcher
    b.dispose();
});

test('dispose: pending 全部 reject DISPOSED 且 dispatcher 解除', async () => {
    const t = createFakeTransport();
    const b = createDatasetBridge(t);
    const { promise } = b.request({ command: 'y', resultCommand: 'yResult', timeoutMs: 0 });
    const assertion = assert.rejects(promise, (e) => e.code === 'DISPOSED');
    b.dispose();
    await assertion;
    assert.equal(t.listenerCount(), 0);
    t.emit({ command: 'yResult' }); // dispose 後不應觸發任何事
});
