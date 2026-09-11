/**
 * application/exportUseCases.test.mjs — 匯出 use-case 契約測試（R8：開發中類型擋下）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExportUseCases } from './exportUseCases.js';

function makeUC({ type = 'image' } = {}) {
    const calls = { status: [], progress: [], sync: 0, confirm: 0, request: 0 };
    const state = {
        images: [{ path: 'a.jpg', annotations: [{ class_id: 0 }] }],
        sourceFolderPath: '/root',
        spec: { toJSON: () => ({ project: { name: 'd', type } }) }
    };
    const uc = createExportUseCases({
        state,
        getFormValue: (name) => (name === 'projectType' ? type : 'x'),
        syncSpecFromUI: () => { calls.sync++; },
        showStatusMessage: (m) => { calls.status.push(m); },
        showExportProgress: (a) => { calls.progress.push(a); },
        t: (key, fallback) => fallback || key
    });
    return { uc, calls };
}

test('feature/serial 開發中類型擋下，不呼叫 request', async () => {
    for (const type of ['feature', 'serial']) {
        const { uc, calls } = makeUC({ type });
        await uc.exportDataset();
        assert.ok(calls.status.some((m) => m.includes(type)), `${type} 應顯示開發中訊息`);
        assert.deepEqual(calls.progress, [true, false]);
        assert.equal(calls.sync, 0);
    }
});

test('table（非開發中硬擋）不會在擋下段早退', async () => {
    // table 非 dev 類型：不會在 isDevType 早退，而會前進到 syncSpecFromUI（fake state 缺 validate 會於後續 throw 被捕，無關 R8）
    const { uc, calls } = makeUC({ type: 'table' });
    await uc.exportDataset();
    assert.equal(calls.sync, 1);
    // 且未顯示 dev 阻擋訊息
    assert.ok(!calls.status.some((m) => m.includes('table')));
});
