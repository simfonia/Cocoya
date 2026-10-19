/**
 * simulatorRenderer.test.mjs -- 訓練模擬器 renderer 純函式測試（V1）
 *
 * render() 本體需 canvas（瀏覽器），Node 只測純函式：
 * 極值（NaN/空）、刻度、版面、顏色契約（藍/紅/線寬 2 對齊報告）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function loadRenderer() {
    const sandbox = { console, JSON, Math };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    const p = path.join(here, 'simulatorRenderer.js');
    vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: p });
    const R = sandbox.CocoyaSimRenderer;
    if (!R) throw new Error('simulatorRenderer.js 未掛載 CocoyaSimRenderer');
    return R;
}

const R = loadRenderer();

test('顏色契約：訓練藍／驗證紅／線寬 2（對齊報告 b-/r-/linewidth=2）', function () {
    const c = JSON.parse(JSON.stringify(R.COLORS));
    assert.deepEqual(c, { train: '#1f77b4', val: '#d62728', lineWidth: 2 });
});

test('極值：略過 NaN；全空回 fallback', function () {
    assert.deepEqual(JSON.parse(JSON.stringify(R._finiteExtent([[1, NaN, 3], [2]], [0, 1]))), [0.84, 3.16]);
    assert.deepEqual(JSON.parse(JSON.stringify(R._finiteExtent([[], []], [0, 1]))), [0, 1]);
});

test('刻度：nice 化且不超過 6 檔', function () {
    const t = JSON.parse(JSON.stringify(R._ticks(0.2, 2.4)));
    assert.ok(t.length <= 6 && t.length >= 2);
    for (let i = 1; i < t.length; i++) assert.ok(t[i] > t[i - 1]);
});

test('版面：雙面板等高、上下不重疊', function () {
    const L = JSON.parse(JSON.stringify(R._layout(800, 600)));
    assert.equal(L.top.h, L.bot.h);
    assert.ok(L.top.y + L.top.h <= L.bot.y);
    assert.ok(L.top.w > 0 && L.top.h > 0);
});
