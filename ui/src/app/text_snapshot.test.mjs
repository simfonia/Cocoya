/**
 * text_snapshot.test.mjs — 文字模式 reload 快照還原（2026-10-10 C-3 / Q1）
 *
 * 背景：語系切換與主題切換共用同一條快照鏈
 *   _showReloadChoice → snapshotWorkspaceForReload → reload
 *   → consumeReloadSnapshot → _restoreReloadSnapshot
 * C-3 寫入端已分叉（產出 code/isTextMode、無 xml），但原 consume 只認 xml
 * → 文字快照必回 null → 語系切換必丟碼（Q1 查證的缺口）。
 *
 * 鎖住的契約：
 *  1. _restoreReloadSnapshot 對 isTextMode 快照分派到 _restoreTextModeSnapshot
 *     （不走 Blockly XML 還原）。
 *  2. 成功路徑順序：enterTextModeWithCode **先**成功，才 dispose workspace/minimap。
 *  3. 失敗路徑：enter 回 false / CocoyaTextMode 不存在 → 回 null，
 *     且 workspace **不得**被 dispose（呼叫端退回預設積木路徑，不可半切）。
 *  4. 成功後：workspace=null、currentPlatform 還原自快照、filename 交給 updateFileStatus。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

globalThis.window = globalThis;
globalThis.Blockly = { Msg: { MSG_READ_ONLY_HINT: 'ro-hint' } };

// lifecycle.js 僅一層 window.CocoyaApp = Object.assign(...)，無載入期副作用
new Function(fs.readFileSync(path.join(here, 'lifecycle.js'), 'utf8'))();

const makeEnv = (enterResult) => {
    const events = [];
    globalThis.CocoyaUI = {
        setSaveButtonState: (on) => events.push('saveBtn:' + on),
        updateFileStatus: (f) => events.push('file:' + f)
    };
    globalThis.CocoyaTextMode = {
        enterTextModeWithCode: (code) => { events.push('enter:' + code); return enterResult; }
    };
    const app = Object.assign({}, globalThis.CocoyaApp, {
        workspace: { dispose: () => events.push('ws.dispose') },
        minimap: { dispose: () => events.push('minimap.dispose') },
        currentPlatform: 'MicroPython',
        isReadOnly: false,
        updatePlatformLabel: () => events.push('label')
    });
    return { app, events };
};

const cleanup = () => {
    delete globalThis.CocoyaUI;
    delete globalThis.CocoyaTextMode;
};

test('_restoreReloadSnapshot：isTextMode 快照分派到文字還原（不走 Blockly XML）', async () => {
    const { app, events } = makeEnv(true);
    const snap = { isTextMode: true, code: 'print(1)', filename: 'a.py', platform: 'PC', isDirty: true };
    // 分派讀的是 window.CocoyaApp.consumeReloadSnapshot（非 this）→ 就地替身＋finally 還原
    const orig = globalThis.CocoyaApp.consumeReloadSnapshot;
    globalThis.CocoyaApp.consumeReloadSnapshot = () => snap;
    try {
        const got = await app._restoreReloadSnapshot();
        assert.equal(got, snap, '應回傳文字快照（呼叫端要忠實還原 isDirty）');
        assert.ok(events.includes('enter:print(1)'), '應走 enterTextModeWithCode');
        assert.equal(app.workspace, null, '成功後 workspace 必須為 null');
        assert.equal(app.minimap, null, '成功後 minimap 必須為 null');
        assert.equal(app.currentPlatform, 'PC', '快照平台必須還原（存/執行都吃 currentPlatform）');
        assert.ok(events.includes('file:a.py'), 'filename 交給 updateFileStatus');
        // 順序契約：enter 先於 dispose
        assert.ok(events.indexOf('enter:print(1)') < events.indexOf('ws.dispose'),
            '必須先 enter 成功才 dispose workspace');
    } finally {
        globalThis.CocoyaApp.consumeReloadSnapshot = orig;
        cleanup();
    }
});

test('_restoreTextModeSnapshot：enter 失敗 → 回 null 且不得 dispose workspace（防半切）', () => {
    const { app, events } = makeEnv(false);
    try {
        const got = app._restoreTextModeSnapshot({ isTextMode: true, code: 'x', platform: 'PC' });
        assert.equal(got, null, 'enter 失敗應回 null（呼叫端退回預設積木路徑）');
        assert.ok(!events.includes('ws.dispose'), '失敗時 workspace 必須保留');
        assert.notEqual(app.workspace, null);
    } finally {
        cleanup();
    }
});

test('_restoreTextModeSnapshot：CocoyaTextMode 不存在 → 回 null 且不得 dispose', () => {
    const { app, events } = makeEnv(true);
    delete globalThis.CocoyaTextMode;
    try {
        const got = app._restoreTextModeSnapshot({ isTextMode: true, code: 'x' });
        assert.equal(got, null);
        assert.ok(!events.includes('ws.dispose'));
        assert.notEqual(app.workspace, null);
    } finally {
        cleanup();
    }
});
