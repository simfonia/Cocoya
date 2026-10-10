/**
 * persistence_snapshot.test.mjs — 自動備份／reload 快照／髒狀態橋接契約測試
 * （2026-10-01，Audit P3-2）
 *
 * 背景：`app/persistence.js` 承載三條「資料會不見」的關鍵路徑，且長期無獨立測試：
 *   1. `snapshotWorkspaceForReload` / `consumeReloadSnapshot`：主題切換與語系切換會
 *      location.reload()／由 Host 重建 HTML，會銷毀 JS 記憶體（dirty 的未存修改只在記憶體）。
 *      快照走 sessionStorage（同 origin reload 後仍在），且必須「取出即刪除」（一次性），
 *      否則使用者按「捨棄」後，下次 reload 會被殘留快照復活。
 *   2. `triggerAutoBackup` 的 debounce：連續竄改只能送出一份備份；唯讀時不排程。
 *   3. `setDirty` 與後端的原子化同步（AGENTS.md 多視窗完整性規範）：
 *      必須 await 完成才呼叫 close_window，因此回傳值必須是真 Promise。
 *
 * 與既有 `platform_restore.test.mjs`（守「切平台先於 domToWorkspace」的順序）互補：
 * 那支守順序，這支守狀態與一次性語意。
 *
 * 執行（cwd = ui/）：node --test "src/app/*.test.mjs"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const events = [];

// --- 全域替身（僅提供 persistence.js 在載入期會觸及的最小介面）---
const storage = new Map();
globalThis.window = globalThis;
globalThis.sessionStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, v),
    removeItem: (k) => storage.delete(k)
};
globalThis.Blockly = {
    Msg: {},
    Xml: {
        workspaceToDom: () => ({ setAttribute: (_n, v) => events.push('dom.setAttribute:' + v) }),
        domToPrettyText: () => '<xml id="BlocklyWorkspace"><block type="py_variables_get"/></xml>'
    }
};
// 橋接替身：send 必須回傳 Promise（真實 CocoyaBridge.send 是 async，
// persistence.setDirty 直接回傳它的結果 → 這正是「原子化同步」契約的依賴）
globalThis.CocoyaBridge = { send: (cmd) => { events.push('send:' + cmd); return Promise.resolve(); } };
globalThis.CocoyaUI = { currentFilename: 'demo.xml', setDirty: () => { events.push('ui.setDirty'); } };

// persistence.js 以 IIFE 掛在 window 上（非 ES module），用 new Function 載入
new Function(fs.readFileSync(path.join(here, 'persistence.js'), 'utf8'))();

const SNAPSHOT_KEY = globalThis.CocoyaApp.SNAPSHOT_KEY;

/** 乾淨的 app 實例（每個測試獨立，避免 isDirty 互相污染） */
const makeApp = (overrides = {}) => {
    storage.clear();
    events.length = 0;
    return Object.assign({}, globalThis.CocoyaApp, {
        currentPlatform: 'PC',
        currentFilename: 'demo.xml',
        workspace: { clear: () => { events.push('clear'); } },
        minimap: null,
        isDirty: false,
        isReadOnly: false,
        isInitializing: false,
        autoBackupTimer: null
    }, overrides);
};

// ---------------------------------------------------------------------------
// reload 快照：存 → 取 → 自動刪除（一次性語意）
// ---------------------------------------------------------------------------

test('snapshotWorkspaceForReload：寫入 sessionStorage 含 xml／platform／isDirty', () => {
    const app = makeApp({ workspace: { clear() {} }, isDirty: true });
    app.snapshotWorkspaceForReload();
    const snap = JSON.parse(storage.get(SNAPSHOT_KEY));
    assert.equal(snap.platform, 'PC');
    assert.equal(snap.filename, 'demo.xml');
    assert.equal(snap.isDirty, true, '髒狀態必須忠實記錄，否則還原後狀態錯誤');
    assert.equal(snap.isReadOnly, false);
    assert.match(snap.xml, /py_variables_get/);
});

test('consumeReloadSnapshot：取出後即刪除（第二次必須為 null）', () => {
    const app = makeApp({ workspace: { clear() {} } });
    app.snapshotWorkspaceForReload();
    const first = app.consumeReloadSnapshot();
    assert.ok(first && typeof first.xml === 'string' && first.xml.length > 0);
    assert.equal(storage.has(SNAPSHOT_KEY), false, '快照必須一次性消耗');
    assert.equal(app.consumeReloadSnapshot(), null);
});

test('consumeReloadSnapshot：無快照回 null；xml 缺漏／空字串／壞 JSON 皆安全回 null', () => {
    const app = makeApp();
    assert.equal(app.consumeReloadSnapshot(), null);

    storage.set(SNAPSHOT_KEY, JSON.stringify({ platform: 'PC' }));
    assert.equal(app.consumeReloadSnapshot(), null, '缺 xml 應回 null');

    storage.set(SNAPSHOT_KEY, JSON.stringify({ xml: '   ' }));
    assert.equal(app.consumeReloadSnapshot(), null, '空白 xml 應回 null');

    storage.set(SNAPSHOT_KEY, 'not-json{');
    assert.equal(app.consumeReloadSnapshot(), null, '壞 JSON 應安全回 null');
    assert.equal(storage.has(SNAPSHOT_KEY), false, '壞 JSON 也必須清掉殘留，否則每次 reload 都試一次');
});

test('snapshotWorkspaceForReload：無 workspace 時不寫入（不產生空快照誤覆蓋）', () => {
    const app = makeApp({ workspace: null });
    app.snapshotWorkspaceForReload();
    assert.equal(storage.has(SNAPSHOT_KEY), false);
});

// ---------------------------------------------------------------------------
// 自動備份 debounce
//
// 這裡刻意用 node:test 的 mock.timers 而非真等 2 秒：
// 真等待會讓本檔的執行時間被 3 個 debounce 測試綁死（全量守門的耗時紅線），
// 且 mock.timers 能在同一個 tick 內驗「連續三次觸發只送一份」這個 debounce 本質。
// ---------------------------------------------------------------------------

test('triggerAutoBackup：debounce 連續竄改只送出一份備份', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const app = makeApp();
    app.triggerAutoBackup();
    app.triggerAutoBackup();
    app.triggerAutoBackup();
    assert.deepEqual(events, [], 'debounce 期間不應送出');

    t.mock.timers.tick(1999);
    assert.deepEqual(events.filter((e) => e === 'send:autoBackup'), [], '未滿 debounce 窗口不應送出');

    t.mock.timers.tick(1);
    assert.equal(events.filter((e) => e === 'send:autoBackup').length, 1);
    assert.ok(events.includes('dom.setAttribute:PC'), '備份須帶 platform 屬性');
});

test('triggerAutoBackup：唯讀模式不排程也不送出備份', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const app = makeApp({ isReadOnly: true });
    app.triggerAutoBackup();
    assert.equal(app.autoBackupTimer, null);
    t.mock.timers.tick(3000);
    assert.deepEqual(events.filter((e) => e === 'send:autoBackup'), []);
});

test('triggerAutoBackup：無 workspace 時不送出空備份', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const app = makeApp({ workspace: null });
    app.triggerAutoBackup();
    t.mock.timers.tick(3000);
    assert.deepEqual(events.filter((e) => e === 'send:autoBackup'), []);
});

// ---------------------------------------------------------------------------
// setDirty 與後端的原子化同步（AGENTS.md 多視窗完整性規範）
// ---------------------------------------------------------------------------

test('setDirty：狀態變化時送 setDirty 並回傳 Promise（原子化同步前提）', async () => {
    const app = makeApp();
    const ret = app.setDirty(true);
    assert.ok(ret instanceof Promise, '必須回傳 Promise，否則 close_window 會競態');
    await ret;
    assert.equal(app.isDirty, true);
    assert.ok(events.includes('send:setDirty'));
});

test('setDirty：值未變動時不重複通知（避免後端狀態抖動）', async () => {
    const app = makeApp();
    await app.setDirty(true);
    events.length = 0;
    await app.setDirty(true);
    assert.deepEqual(events.filter((e) => e.startsWith('send:')), []);
});

test('setDirty：轉為 false 一律通知後端（多視窗殘留 stale dirty 的防護）', async () => {
    const app = makeApp();
    await app.setDirty(false);
    assert.equal(events.filter((e) => e === 'send:setDirty').length, 1,
        '髒狀態歸零必須通知後端');
});

test('setDirty：初始化期間不標髒（避免載入中誤觸發另存提示）', async () => {
    const app = makeApp({ isInitializing: true });
    await app.setDirty(true);
    assert.equal(app.isDirty, false);
    assert.deepEqual(events.filter((e) => e === 'send:setDirty'), []);
});

test('snapshotWorkspaceForReload：序列化拋錯時清除殘留快照（不可留半壞資料）', () => {
    const originalToDom = globalThis.Blockly.Xml.workspaceToDom;
    globalThis.Blockly.Xml.workspaceToDom = () => { throw new Error('serialize fail'); };
    try {
        const app = makeApp({ workspace: { clear() {} } });
        storage.set(SNAPSHOT_KEY, 'stale');
        app.snapshotWorkspaceForReload();
        assert.equal(storage.has(SNAPSHOT_KEY), false);
    } finally {
        globalThis.Blockly.Xml.workspaceToDom = originalToDom;
    }
});

test('clearReloadSnapshot：可主動清除殘留（discard／clean 換主題時用）', () => {
    const app = makeApp({ workspace: { clear() {} } });
    app.snapshotWorkspaceForReload();
    assert.equal(storage.has(SNAPSHOT_KEY), true);
    app.clearReloadSnapshot();
    assert.equal(storage.has(SNAPSHOT_KEY), false);
    assert.equal(app.consumeReloadSnapshot(), null);
});

// ---------------------------------------------------------------------------
// 文字模式快照（2026-10-10 C-3）：寫入 → consume 一次性
//
// 語系/主題切換共用同一條快照鏈（_showReloadChoice → snapshot → consume → restore）。
// 文字快照無 xml、以 code 承載；consume 端（原只認 xml）同日補文字分支，
// 否則切語系必丟碼 —— Q1 查證出的缺口，還原端見 text_snapshot.test.mjs。
// ---------------------------------------------------------------------------

test('snapshotWorkspaceForReload：文字模式改存 code＋isTextMode（workspace 已 dispose 也不炸）', () => {
    globalThis.CocoyaTextMode = {
        isTextMode: () => true,
        getEditor: () => ({ getValue: () => 'print("hi")\n' })
    };
    try {
        const app = makeApp({ workspace: null, isDirty: true });
        app.snapshotWorkspaceForReload();
        const snap = JSON.parse(storage.get(SNAPSHOT_KEY));
        assert.equal(snap.isTextMode, true);
        assert.equal(snap.code, 'print("hi")\n');
        assert.equal(snap.platform, 'PC');
        assert.equal(snap.isDirty, true);
        assert.equal(snap.xml, undefined, '文字快照不應有 xml');
    } finally {
        delete globalThis.CocoyaTextMode;
    }
});

test('consumeReloadSnapshot：文字快照（含空 code）可還原；缺 code 回 null', () => {
    const app = makeApp();
    // 空字串是合法內容（編輯器被清空）→ 只驗型別、不可驗空白
    storage.set(SNAPSHOT_KEY, JSON.stringify({ isTextMode: true, code: '', platform: 'PC' }));
    const snap = app.consumeReloadSnapshot();
    assert.ok(snap, '空 code 的文字快照應可還原');
    assert.equal(snap.isTextMode, true);
    assert.equal(snap.code, '');
    assert.equal(storage.has(SNAPSHOT_KEY), false, '文字快照同樣一次性消耗');

    storage.set(SNAPSHOT_KEY, JSON.stringify({ isTextMode: true, platform: 'PC' }));
    assert.equal(app.consumeReloadSnapshot(), null, '缺 code 應回 null');
});
