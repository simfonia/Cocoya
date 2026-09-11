/**
 * application/sessionManager.test.mjs — 會話鎖定契約測試（M1，R1）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionManager } from './sessionManager.js';

test('openSession 鎖定類型並進入 workspace；backToEntry 解鎖回入口', () => {
    const sm = createSessionManager();
    assert.deepEqual(sm.snapshot(), { lockedType: null, phase: 'entry' });
    sm.openSession('image');
    assert.deepEqual(sm.snapshot(), { lockedType: 'image', phase: 'workspace' });
    sm.backToEntry();
    assert.deepEqual(sm.snapshot(), { lockedType: null, phase: 'entry' });
});

test('有未存工作換類型需確認：拒絕則留在原會話', async () => {
    const sm = createSessionManager({ confirmFn: async () => false });
    sm.openSession('table');
    const r = await sm.requestSwitchType(true);
    assert.equal(r.switched, false);
    assert.equal(sm.snapshot().lockedType, 'table');
});

test('無未存工作換類型直接回入口並提示', async () => {
    let hint = '';
    const sm = createSessionManager({ notifyFn: (m) => { hint = m; } });
    sm.openSession('table');
    const r = await sm.requestSwitchType(false);
    assert.equal(r.switched, true);
    assert.equal(sm.snapshot().phase, 'entry');
    assert.equal(hint, 'SWITCH_TYPE_HINT');
});
