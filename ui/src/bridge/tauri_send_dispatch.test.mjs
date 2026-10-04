/**
 * ui/src/bridge/tauri_send_dispatch.test.mjs — send() 分派機制行為測試（P2-1）
 *
 * 【這份測試守什麼】
 * `scripts/verify-tauri-split.cjs` 只證明「沒有漏搬」（靜態比對），
 * 本檔證明「搬過去的東西**跑起來一樣**」（行為）。兩者缺一不可。
 *
 * 【為何先測 backup 群】
 * backup 是 P0 先鋒（4 command / 19 行 / 依賴只有 tauriInvoke），
 * 風險最低、適合作為分派機制的第一道驗證。
 *
 * 【守的不變式】
 *  1. 已遷移的 command 由 handler 表攔截，且 `this` 綁定正確
 *  2. handler 內的 invoke 命令名與參數與原 switch 完全相同
 *  3. **send() 恆回傳 undefined**（原 `let result` 從未 return —— 這是搬遷時最容易
 *     無意間改掉的行為：若改成 `return handler(...)`，呼叫端就可能拿到別的值。
 *     `base.js` 的 alert() 明確依賴「只 await、不取值」）
 *  4. 未遷移的 command 仍走 switch，行為不變
 *  5. 未登錄的 command 觸發同一則 console.warn（原 default 分支）
 *  6. 例外被同一個 try/catch 捕捉，且 resetFirmware 的 alert 分支保留
 *
 * 執行（cwd = ui/）：node --test "src/bridge/*.test.mjs"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BridgeTauri } from './tauri.js';
import { sendHandlers, getSendHandler } from './tauri/sendHandlers.js';

/**
 * 建立一個已 ready、tauriInvoke 可注入的 bridge。
 * 刻意不呼叫 init()（會動態 import @tauri-apps/*，Node 環境無此模組）。
 */
function makeBridge(invoke) {
    const bridge = new BridgeTauri();
    bridge.tauriInvoke = invoke;
    bridge.ready = Promise.resolve();
    const dispatched = [];
    bridge._dispatchToFrontend = (msg) => dispatched.push(msg);
    bridge.dispatched = dispatched;
    return bridge;
}

/** 攔截 console.warn/error，避免污染輸出並讓斷言可檢查。 */
async function captureConsole(fn) {
    const warns = [], errors = [];
    const ow = console.warn, oe = console.error;
    console.warn = (...a) => warns.push(a.join(' '));
    console.error = (...a) => errors.push(a.join(' '));
    try { await fn(); } finally { console.warn = ow; console.error = oe; }
    return { warns, errors };
}

// ---------------------------------------------------------------------------
// 1. handler 表結構
// ---------------------------------------------------------------------------

/**
 * 已遷移至子模組的 command 完整清單（本檔即為其 SSOT 的對照基準）。
 *
 * ⚠️ 這份清單會隨每一階段的遷移而增長；新增群組時**必須同步更新這裡**，
 *   否則本測試會紅 —— 這是刻意的：讓「搬了但沒更新清單」無法通過。
 *
 * 對應關係見 log/plan/BridgeTauri_Split.md §3；實作進度見 log/todo.md Batch 3。
 */
const MIGRATED_COMMANDS = [
    // backup（P0）
    'autoBackup', 'checkStartupBackup', 'clearBackup', 'rejectRecovery',
    // manifest
    'getManifest', 'getModuleToolbox', 'openHelp', 'openExternal', 'openFolder',
    'reloadWebview', 'setLocale',
    // window（alert/confirm/prompt 為原 switch 的 fallthrough 三連）
    'backToHome', 'closeEditor', 'closeWindow', 'setDirty', 'setWindowTitle',
    'alert', 'confirm', 'prompt',
    // firmware
    'deployMcu', 'eraseFilesystem', 'resetFirmware',
    // serial（refreshSerialPorts 與 getSerialPorts 為原 switch 的 fallthrough）
    'openSerialMonitor', 'toggleSerialMonitor', 'getSerialPorts', 'refreshSerialPorts',
    // codeRun
    'runCode', 'stopCode',
    // pythonEnv
    'setPythonPath', 'getPythonPath', 'checkEnvironment', 'installModule', 'abortInstall',
    // fileOps (saveFile/saveFileAs and newFile/createWindow were fallthrough groups)
    'saveFile', 'saveFileAs', 'openFile', 'checkUpdate', 'openExamples', 'openDatasetManager',
    'pickFolder', 'pickDataFile', 'newFile', 'createWindow',
    // training
    'startRemoteTraining', 'stopRemoteTraining', 'openTrainingReport', 'openLatestTrainingReport',
    // camera（全部經 _handleDatasetCommand 派給 sidecar）
    'datasetListCameras', 'datasetStartCamera', 'datasetGetCameraStatus',
    'datasetStopCamera', 'datasetCaptureImage', 'datasetCollectFeature',
    // transfer（含 _datasetUploadChain 併發上傳鏈）
    'datasetExport', 'datasetUploadArchive', 'datasetImportFromFolder',
    // progress（save/load 進度 + getProjectAnchor 錨定查詢）
    'datasetSaveProgress', 'datasetLoadProgress', 'getProjectAnchor',
    // annotation（唯一直接 tauriInvoke、不走 sidecar 的兩個 dataset case）
    'datasetDeleteImage', 'datasetRenameLabel'
];

test('sendHandlers：鍵集合即已遷移 command 的 SSOT（與 MIGRATED_COMMANDS 逐字相符）', () => {
    assert.deepEqual(Object.keys(sendHandlers).sort(), [...MIGRATED_COMMANDS].sort());
});

test('sendHandlers：每個鍵對應的都是函式（漏寫 function 會在 dispatch 時才炸）', () => {
    for (const [name, fn] of Object.entries(sendHandlers)) {
        assert.equal(typeof fn, 'function', `${name} 不是函式`);
    }
});

test('sendHandlers：不得有重複匯出（後者靜默覆蓋前者，會讓某個 command 指向錯的實作）', () => {
    assert.equal(Object.keys(sendHandlers).length, new Set(Object.keys(sendHandlers)).size);
    assert.equal(MIGRATED_COMMANDS.length, new Set(MIGRATED_COMMANDS).size, '清單本身有重複');
});

test('getSendHandler：命中回函式、未命中回 undefined（不可回傳 falsy 讓 if 誤判）', () => {
    assert.equal(typeof getSendHandler('autoBackup'), 'function');
    // [P2-1 P3] 遷移已全部完成，switch 內不再有任何 case —— 原先硬寫的
    // 'saveFile' / 'datasetCaptureImage' 會隨遷移進行而失效（兩次實測踩到）。
    // 改為**從原始碼動態取出 switch 殘留的 case**作為未命中範例：
    // 這樣不論未來新增 case 或再次回遷守門都不會失效。
    //
    // ⚠️ 正則刻意不錨定縮排：實測若寫死 /^\s{16}case/，別人用不同縮排新增 case
    //    就會完全抓不到（守門靜默失效）。改用寬鬆比對再過濾 default 分支。
    const tauriSrc = fs.readFileSync(
        path.join(path.dirname(fileURLToPath(import.meta.url)), 'tauri.js'), 'utf8');
    const residual = [...tauriSrc.matchAll(/case\s+'([^']+)'\s*:/g)]
        .map((m) => m[1])
        .filter((c) => c !== 'default');
    if (residual.length > 0) {
        for (const c of residual) {
            assert.equal(getSendHandler(c), undefined,
                `switch 殘留的 ${c} 不該同時出現在 handler 表（會走不到 switch 分支）`);
        }
    } else {
        // switch 已清空（P3 完成）：用一個保證不存在的名稱驗證未命中語意
        assert.equal(getSendHandler('__commandNotInTable__'), undefined);
    }
    assert.equal(getSendHandler('__proto__'), undefined, '原型鏈上的鍵不得被當成 handler');
});

// ---------------------------------------------------------------------------
// 2. 已遷移 command 的實際行為（逐項比對原 switch 的 invoke 與副作用）
// ---------------------------------------------------------------------------

test('checkStartupBackup：有備份時派發 recoveryData，xml 原樣帶回', async () => {
    let called = null;
    const bridge = makeBridge(async (cmd) => { called = cmd; return '<xml>backup</xml>'; });
    const ret = await bridge.send('checkStartupBackup');
    assert.equal(called, 'check_startup_backup');
    assert.deepEqual(bridge.dispatched, [{ command: 'recoveryData', xml: '<xml>backup</xml>' }]);
    assert.equal(ret, undefined, 'send() 必須回傳 undefined');
});

test('checkStartupBackup：無備份（後端回 falsy）時不派發任何訊息', async () => {
    const bridge = makeBridge(async () => null);
    await bridge.send('checkStartupBackup');
    assert.deepEqual(bridge.dispatched, []);
});

test('autoBackup：把 data.xml 傳給 auto_backup（參數名不可改動）', async () => {
    let captured = null;
    const bridge = makeBridge(async (cmd, args) => { captured = { cmd, args }; return null; });
    await bridge.send('autoBackup', { xml: '<xml/>' });
    assert.deepEqual(captured, { cmd: 'auto_backup', args: { xml: '<xml/>' } });
});


// ---------------------------------------------------------------------------
// 3. this 綁定（handler 必須拿到真正的 bridge 實例）
// ---------------------------------------------------------------------------

test('handler 的 this 指向 bridge 實例（不是 undefined 也不是模組物件）', async () => {
    const bridge = makeBridge(async () => '<xml/>');
    await bridge.send('checkStartupBackup');
    assert.equal(bridge.dispatched.length, 1, '經 this._dispatchToFrontend 才會有紀錄');
});

// ---------------------------------------------------------------------------
// 4. 未遷移的 command 仍走 switch（本階段的核心回歸鎖）
// ---------------------------------------------------------------------------

test('未遷移的 command 仍由 switch 處理（例：getManifest）', async () => {
    let called = null;
    const bridge = makeBridge(async (cmd) => { called = cmd; return { modules: [] }; });
    await bridge.send('getManifest');
    assert.equal(called, 'get_manifest', 'switch 路徑失效 → 會靜默少一個後端指令');
    assert.deepEqual(bridge.dispatched, [{ command: 'manifestData', data: { modules: [] }, mediaUri: 'src', lang: 'zh-hant' }]);
});

test('未遷移的 switch 指令同樣回傳 undefined（漸進遷移不得改變對外行為）', async () => {
    const bridge = makeBridge(async () => true);
    assert.equal(await bridge.send('setDirty', { isDirty: false }), undefined);
});

// ---------------------------------------------------------------------------
// 5. 未登錄的 command → 同一則 warn（原 default 分支）
// ---------------------------------------------------------------------------

test('未登錄的 command 觸發 console.warn 且文案與原 default 分支一致', async () => {
    const bridge = makeBridge(async () => null);
    const { warns } = await captureConsole(() => bridge.send('__no_such_command__'));
    assert.equal(warns.length, 1);
    assert.match(warns[0], /Command "__no_such_command__" not handled in Tauri mode/);
});

// ---------------------------------------------------------------------------
// 6. 例外處理（try/catch 與 resetFirmware 專屬分支必須保留）
// ---------------------------------------------------------------------------

test('handler 拋例外時被 send() 的 try/catch 捕捉並記 error（不向上炸）', async () => {
    const bridge = makeBridge(async () => { throw new Error('backend down'); });
    const { errors } = await captureConsole(() => bridge.send('clearBackup'));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /Error processing command "clearBackup"/);
});

test('resetFirmware 拋例外時額外觸發 alert（此分支在 send() 內，不可隨遷移遺失）', async () => {
    // resetFirmware case 內會用到 window.CocoyaUI.showLoadingModal／hideLoadingModal
    // 與 localStorage.getItem('pythonPath')，Node 環境兩者皆無，故給最小 stub
    //（只補用到的成員，不模擬整個 DOM／完整 storage）。
    const hadWindow = 'window' in globalThis;
    const hadStorage = 'localStorage' in globalThis;
    globalThis.window = globalThis.window || {};
    globalThis.window.CocoyaUI = { showLoadingModal() {}, hideLoadingModal() {} };
    globalThis.localStorage = globalThis.localStorage || { getItem: () => null };
    const bridge = makeBridge(async () => { throw new Error('burn failed'); });
    const alerts = [];
    bridge.alert = (m) => alerts.push(m);
    try {
        await captureConsole(() => bridge.send('resetFirmware'));
    } finally {
        if (!hadWindow) delete globalThis.window;
        if (!hadStorage) delete globalThis.localStorage;
    }
    assert.equal(alerts.length, 1);
    assert.match(alerts[0], /burn failed/);
});

test('非 resetFirmware 的例外不得觸發 alert（避免每個錯誤都跳對話框）', async () => {
    const bridge = makeBridge(async () => { throw new Error('x'); });
    const alerts = [];
    bridge.alert = (m) => alerts.push(m);
    await captureConsole(() => bridge.send('autoBackup', { xml: '<a/>' }));
    assert.deepEqual(alerts, []);
});

// ---------------------------------------------------------------------------
// 7. 前置條件：tauriInvoke 未就緒時整段跳過（init 失敗的情境）
// ---------------------------------------------------------------------------

test('tauriInvoke 為 null 時 send() 直接返回、不 dispatch 也不 warn', async () => {
    const bridge = new BridgeTauri();
    bridge.tauriInvoke = null;
    bridge.ready = Promise.resolve();
    bridge._dispatchToFrontend = () => { throw new Error('不應被呼叫'); };
    const ret = await bridge.send('checkStartupBackup');
    assert.equal(ret, undefined);
});

// ---------------------------------------------------------------------------
// 8. 回傳值不得傳播（此測試由「變異測試沒報紅」逼出來）
//
//    背景：原 switch 從不 `return result`，send() 恆回傳 undefined。
//    變異測試把 `await handler.call(...)` 改成 `return await handler.call(...)`
//    後，**既有的 16 個測試全綠** —— 因為目前的 backup handlers 本身也沒回傳值。
//    這個缺口在未來某個 handler 真的 `return` 了什麼時才會爆，且爆在很遠的地方。
//    故本測試直接注入一個「必定回傳 sentinel」的 handler，把不變式釘死。
// ---------------------------------------------------------------------------

test('即使 handler 有回傳值，send() 也不得把它傳播出去（恆回傳 undefined）', async () => {
    const sentinel = { leaked: true };
    const had = Object.prototype.hasOwnProperty.call(sendHandlers, '__probe__');
    const prev = sendHandlers.__probe__;
    sendHandlers.__probe__ = async () => sentinel;
    try {
        const bridge = makeBridge(async () => null);
        const ret = await bridge.send('__probe__');
        assert.equal(ret, undefined, 'send() 傳出了 handler 的回傳值 → 對外行為已改變');
    } finally {
        if (had) sendHandlers.__probe__ = prev;
        else delete sendHandlers.__probe__;
    }
});

test('autoBackup：xml 為 undefined 時仍照傳（後端自行判斷，不可擅自加預設值）', async () => {
    let captured = null;
    const bridge = makeBridge(async (cmd, args) => { captured = args; return null; });
    await bridge.send('autoBackup', {});
    assert.deepEqual(captured, { xml: undefined });
});

test('clearBackup：呼叫 clear_backup 且不帶參數', async () => {
    let called = null, argc = -1;
    const bridge = makeBridge(async (cmd, args) => { called = cmd; argc = args === undefined ? 0 : 1; return null; });
    await bridge.send('clearBackup');
    assert.equal(called, 'clear_backup');
    assert.equal(argc, 0);
});

test('rejectRecovery：呼叫 reject_recovery 且不帶參數', async () => {
    let called = null;
    const bridge = makeBridge(async (cmd) => { called = cmd; return null; });
    await bridge.send('rejectRecovery');
    assert.equal(called, 'reject_recovery');
});
