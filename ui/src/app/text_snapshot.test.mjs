/**
 * text_snapshot.test.mjs — 實驗室 reload 快照還原（2026-10-10 實驗室模型）
 *
 * 背景：語系切換與主題切換共用同一條快照鏈
 *   _showReloadChoice → snapshotWorkspaceForReload → reload
 *   → consumeReloadSnapshot → _restoreReloadSnapshot
 *
 * 實驗室模型（workspace 永不 dispose）：快照恆含 xml（積木）＋選擇性 inLab/code。
 * _restoreReloadSnapshot 一律先載積木 xml，還原完成後「若 inLab」再以草稿碼進實驗室層。
 *
 * 鎖住的契約：
 *  1. 還原順序：先載積木 xml（clear＋domToWorkspace），再進草稿層（enterTextModeWithCode）。
 *  2. workspace **不得**被 dispose（實驗室核心不變式）—— 還原後仍活著。
 *  3. inLab 快照 → 走 enterTextModeWithCode（草稿層）；非 inLab → 只載積木、不進草稿。
 *  4. 成功後：filename 交給 updateFileStatus、minimap 刷新。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

globalThis.window = globalThis;
// 還原路徑需要的最小 Blockly 介面（textToDom/domToWorkspace/Events）
globalThis.Blockly = {
    Msg: { MSG_READ_ONLY_HINT: 'ro-hint' },
    Events: { disable() {}, enable() {} },
    utils: { xml: { textToDom: (xml) => ({ __xml: xml }) } },
    Xml: { domToWorkspace: (dom, _ws) => { globalThis.__domLoaded = dom; } }
};

// lifecycle.js 僅一層 window.CocoyaApp = Object.assign(...)，無載入期副作用
new Function(fs.readFileSync(path.join(here, 'lifecycle.js'), 'utf8'))();

const makeEnv = (snap) => {
    const events = [];
    globalThis.CocoyaUI = {
        setSaveButtonState: (on) => events.push('saveBtn:' + on),
        updateFileStatus: (f) => events.push('file:' + f)
    };
    globalThis.CocoyaTextMode = {
        enterTextModeWithCode: (code) => { events.push('enter:' + code); return true; }
    };
    const app = Object.assign({}, globalThis.CocoyaApp, {
        workspace: {
            clear: () => events.push('ws.clear'),
            dispose: () => events.push('ws.dispose')
        },
        minimap: null,
        currentPlatform: 'PC',
        isReadOnly: false,
        updatePlatformLabel: () => events.push('label'),
        refreshMinimap: () => events.push('minimap.refresh'),
        ensurePlatformForXml: async () => events.push('ensurePlatform')
    });
    // _restoreReloadSnapshot 內部讀的是 window.CocoyaApp.consumeReloadSnapshot（非 this）
    // → 就地替身全域版本，還原快照來源
    globalThis.CocoyaApp.consumeReloadSnapshot = () => snap;
    return { app, events };
};

const cleanup = () => {
    delete globalThis.CocoyaUI;
    delete globalThis.CocoyaTextMode;
};

test('_restoreReloadSnapshot：inLab 快照 → 先載積木 xml、再進草稿層（workspace 保留不 dispose）', async () => {
    const { app, events } = makeEnv({
        xml: '<xml platform="PC"><block type="py_main"/></xml>',
        inLab: true, code: 'print(1)', filename: 'a.xml', platform: 'PC', isReadOnly: false, isDirty: true
    });
    try {
        const got = await app._restoreReloadSnapshot();
        assert.equal(got.inLab, true, '應回傳快照（呼叫端要忠實還原 isDirty）');
        assert.ok(events.includes('ws.clear'), '應先 clear 積木');
        assert.ok(events.includes('enter:print(1)'), '應進草稿層');
        assert.ok(events.includes('file:a.xml'), 'filename 交給 updateFileStatus');
        // 不變式：實驗室永不 dispose workspace
        assert.ok(!events.includes('ws.dispose'), '實驗室模型不得 dispose workspace');
        assert.notEqual(app.workspace, null, '還原後 workspace 必須仍活著');
        // 順序契約：先載積木、後進草稿
        assert.ok(events.indexOf('ws.clear') < events.indexOf('enter:print(1)'),
            '必須先載積木再進草稿層');
    } finally {
        cleanup();
    }
});

test('_restoreReloadSnapshot：非 inLab 快照 → 只載積木、不進草稿層', async () => {
    const { app, events } = makeEnv({
        xml: '<xml platform="PC"><block type="py_main"/></xml>',
        filename: 'b.xml', platform: 'PC', isReadOnly: false, isDirty: false
    });
    try {
        const got = await app._restoreReloadSnapshot();
        assert.ok(got, '應回傳快照');
        assert.ok(events.includes('ws.clear'), '應載入積木');
        assert.ok(!events.some(e => e.startsWith('enter:')), '非 inLab 不應進草稿層');
        assert.notEqual(app.workspace, null, 'workspace 必須仍活著');
    } finally {
        cleanup();
    }
});
