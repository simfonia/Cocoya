/**
 * tauri_anchor.test.mjs — BridgeTauri 錨定狀態與 capabilities 契約測試（2026-10-01，Audit P3-2）
 *
 * 背景：`bridge/tauri.js` 是全專案最大的前端檔（93KB）且長期 0 測試，
 * 而它承載兩條「踩過坑」的關鍵路徑：
 *   1. `_normalizeAnchor`：Rust → JS 的 serde 命名坑（AGENTS.md 鐵律）。
 *      若後端忘了加 `#[serde(rename_all = "camelCase")]` 而前端又只讀 camelCase，
 *      結果是「物件存在但 projectRoot 為 undefined」→ live 影像落盤拿不到專案根。
 *      前端的 snake_case 雙保險就是為此而設，這裡把它釘死。
 *   2. `capabilities` getter：回傳物件每次新建，且 isAnchored / projectRoot
 *      必須即時反映 _anchor 快照，不可回落到 _caps 的預設值。
 *
 * 本測試刻意不呼叫 `init()`（會動態 import @tauri-apps/*，Node 環境無此模組）；
 * 只驗純邏輯 getter 與 _refreshAnchor 的成功／錯誤兩條分支。
 *
 * 執行（cwd = ui/）：node --test "src/bridge/*.test.mjs"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BridgeTauri } from './tauri.js';
import { BridgeVSIX } from './vsix.js';
import { BaseBridge } from './base.js';

const makeBridge = () => new BridgeTauri();

// ---------------------------------------------------------------------------
// _normalizeAnchor：snake_case / camelCase 雙保險（serde 坑的防 regressions）
// ---------------------------------------------------------------------------

test('_normalizeAnchor：camelCase 原樣通過', () => {
    assert.deepEqual(
        makeBridge()._normalizeAnchor({ isAnchored: true, projectRoot: 'C:/proj' }),
        { isAnchored: true, projectRoot: 'C:/proj' }
    );
});

test('_normalizeAnchor：snake_case（Rust 未加 serde rename）也要能讀', () => {
    assert.deepEqual(
        makeBridge()._normalizeAnchor({ is_anchored: true, project_root: 'C:/proj' }),
        { isAnchored: true, projectRoot: 'C:/proj' }
    );
});

test('_normalizeAnchor：camelCase 優先於 snake_case（前端欄位不得被後端舊鍵蓋掉）', () => {
    assert.deepEqual(
        makeBridge()._normalizeAnchor({ isAnchored: false, is_anchored: true, projectRoot: 'C:/a', project_root: 'C:/b' }),
        { isAnchored: false, projectRoot: 'C:/a' }
    );
});

test('_normalizeAnchor：null／undefined／falsy 收斂為未錨定（不可回傳 undefined 讓呼叫端炸）', () => {
    const bridge = makeBridge();
    for (const input of [null, undefined, 0, '']) {
        assert.deepEqual(bridge._normalizeAnchor(input), { isAnchored: false, projectRoot: null });
    }
});

test('_normalizeAnchor：isAnchored 一律轉 boolean（0/1/""/null 不得殘留原值）', () => {
    const bridge = makeBridge();
    assert.equal(bridge._normalizeAnchor({ is_anchored: 1 }).isAnchored, true);
    assert.equal(bridge._normalizeAnchor({ is_anchored: 0 }).isAnchored, false);
    assert.equal(bridge._normalizeAnchor({ is_anchored: '' }).isAnchored, false);
    assert.equal(bridge._normalizeAnchor({ is_anchored: null }).isAnchored, false);
    assert.equal(bridge._normalizeAnchor({}).isAnchored, false);
});

test('_normalizeAnchor：空字串 projectRoot 收斂為 null（避免呼叫端拿到 falsy 字串當路徑）', () => {
    const bridge = makeBridge();
    assert.equal(bridge._normalizeAnchor({ projectRoot: '' }).projectRoot, null);
    assert.equal(bridge._normalizeAnchor({ project_root: '' }).projectRoot, null);
});

// ---------------------------------------------------------------------------
// capabilities getter：即時反映 _anchor，且回傳新物件
// ---------------------------------------------------------------------------

test('capabilities：未 init 前為未錨定，欄位齊全且 isTauri 為 true', () => {
    const caps = makeBridge().capabilities;
    assert.equal(caps.isTauri, true);
    assert.equal(caps.isAnchored, false);
    assert.equal(caps.projectRoot, null);
    // 契約欄位守門：新增／移除能力欄位時這裡會紅（刻意不放寬，改 getter 才是正確修法）
    assert.deepEqual(
        Object.keys(caps).sort(),
        [
            'canClose', 'hasTerminal', 'isAnchored', 'isRemoteAware', 'isRemoteConnected',
            'isTauri', 'projectRoot', 'supportsAutoUpdate', 'supportsEnvironmentCheck',
            'supportsEraseFS', 'supportsFirmwareReset'
        ].sort()
    );
});

test('capabilities 契約：Tauri 與 VSIX 必須回傳同一組鍵（值可不同）', () => {
    // 為什麼要這條：兩橋若各缺欄位，前端「Tauri vs VSIX 走不同分支」會在欄位缺失時
    // 靜默失效（讀到 undefined 而非 false），且不會有任何錯誤。
    // 2026-10-01（P2-6-b）修的 isRemoteConnected 缺漏就是這類問題。
    const vsix = new BridgeVSIX();
    const tauri = makeBridge();
    const tauriKeys = Object.keys(tauri.capabilities).sort();
    const vsixKeys = Object.keys(vsix.capabilities).sort();

    const missingInVsix = tauriKeys.filter((key) => !vsixKeys.includes(key));
    const missingInTauri = vsixKeys.filter((key) => !tauriKeys.includes(key));
    assert.deepEqual(
        { missingInVsix, missingInTauri },
        { missingInVsix: [], missingInTauri: [] }
    );
    // VSIX 的 _caps 由基類預設 + 覆寫組成，Tauri getter 為寫死物件；
    // 兩者都必須涵蓋 base.js 宣告的全部鍵（否則 updateCapabilities 會寫進不存在的欄位）
    const baseKeys = Object.keys(new BaseBridge().capabilities).sort();
    assert.deepEqual(
        {
            baseMissingInVsix: baseKeys.filter((k) => !vsixKeys.includes(k)),
            baseMissingInTauri: baseKeys.filter((k) => !tauriKeys.includes(k))
        },
        { baseMissingInVsix: [], baseMissingInTauri: [] }
    );
});

test('capabilities 契約：supportsStableMode 不得再回傳（Stable Mode 死鏈已移除）', () => {
    // 2026-09-30 Stable Mode 整條移除後，此欄位三端皆無讀取點；
    // 2026-10-01（P2-6-b）刪除宣告，並以本測試鎖住「不會被無聲加回」。
    assert.equal('supportsStableMode' in makeBridge().capabilities, false);
    assert.equal('supportsStableMode' in new BridgeVSIX().capabilities, false);
    assert.equal('supportsStableMode' in new BaseBridge().capabilities, false);
});

test('capabilities 契約：isRemoteConnected 在 Tauri 固定 false（無 VS Code remote 環境）', () => {
    // VSIX 端由 cocoyaManager.ts 依 vscode.env.remoteName 注入 _caps；
    // Tauri 沒有對應概念，但**必須回傳此鍵**（false），不可省略 ——
    // 省略會讓前端讀到 undefined，與 false 在條件判斷中行為不同。
    assert.equal(makeBridge().capabilities.isRemoteConnected, false);
});

test('capabilities：_anchor 更新後即時反映（isAnchored / projectRoot 不得停留在預設值）', () => {
    const bridge = makeBridge();
    assert.equal(bridge.capabilities.isAnchored, false);

    bridge._anchor = bridge._normalizeAnchor({ isAnchored: true, projectRoot: 'C:/proj' });
    assert.equal(bridge.capabilities.isAnchored, true);
    assert.equal(bridge.capabilities.projectRoot, 'C:/proj');

    // 換專案（開檔／另存）後必須跟著變，且舊路徑不得殘留
    bridge._anchor = bridge._normalizeAnchor({ isAnchored: true, projectRoot: 'D:/other' });
    assert.equal(bridge.capabilities.projectRoot, 'D:/other');
});

test('capabilities：isAnchored=true 但 projectRoot 缺失時不得洩漏 undefined（回 null）', () => {
    const bridge = makeBridge();
    bridge._anchor = { isAnchored: true, projectRoot: undefined };

// ---------------------------------------------------------------------------
// _refreshAnchor：成功刷新／後端失敗時降級為未錨定（不可殘留過期快照）
// ---------------------------------------------------------------------------

test('_refreshAnchor：以 snake_case 回應也能刷新快照，並記一次 log', async () => {
    const bridge = makeBridge();
    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));
    try {
        bridge.tauriInvoke = async (cmd) => {
            assert.equal(cmd, 'get_project_anchor');
            return { is_anchored: true, project_root: 'C:/proj' };
        };
        await bridge._refreshAnchor();
    } finally {
        console.log = originalLog;
    }
    assert.deepEqual(bridge._anchor, { isAnchored: true, projectRoot: 'C:/proj' });
    assert.equal(bridge.capabilities.projectRoot, 'C:/proj');
    assert.equal(logs.length, 1, '應輸出一次刷新後的錨定狀態');
});

test('_refreshAnchor：後端拋錯時 _anchor 設為 null（過期快照比未錨定更危險）', async () => {
    const bridge = makeBridge();
    bridge._anchor = { isAnchored: true, projectRoot: 'C:/stale' };
    const errors = [];
    const originalError = console.error;
    console.error = (...args) => errors.push(args.join(' '));
    try {
        bridge.tauriInvoke = async () => { throw new Error('backend down'); };
        await bridge._refreshAnchor();
    } finally {
        console.error = originalError;
    }
    assert.equal(bridge._anchor, null);
    assert.equal(bridge.capabilities.isAnchored, false);
    assert.equal(bridge.capabilities.projectRoot, null);
    assert.equal(errors.length, 1);
});

test('_refreshAnchor：回傳 null（後端未錨定而非拋錯）也收斂為未錨定', async () => {
    const bridge = makeBridge();
    bridge._anchor = { isAnchored: true, projectRoot: 'C:/stale' };
    bridge.tauriInvoke = async () => null;
    // 成功路徑會 console.log 一行錨定狀態；此處只想驗收斂結果，壓掉以免污染測試輸出
    const originalLog = console.log;
    console.log = () => {};
    try {
        await bridge._refreshAnchor();
    } finally {
        console.log = originalLog;
    }
    assert.deepEqual(bridge._anchor, { isAnchored: false, projectRoot: null });
    assert.equal(bridge.capabilities.projectRoot, null);
});

    assert.equal(bridge.capabilities.projectRoot, null);
});

test('capabilities：每次取值回傳新物件（呼叫端誤改不會污染 bridge 內部狀態）', () => {
    const bridge = makeBridge();
    const first = bridge.capabilities;
    first.projectRoot = 'C:/tampered';
    first.isAnchored = true;
    const second = bridge.capabilities;
    assert.equal(second.projectRoot, null);
    assert.equal(second.isAnchored, false);
});
