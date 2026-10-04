/**
 * bridge_progress_anchor.test.mjs — T7 續：datasetSaveProgress / getProjectAnchor 契約測試
 *
 * 【為何這條路徑風險高】
 * 1. **三層專案根 fallback**：`_anchor` 快取 → `get_project_anchor` → 拒絕。
 *    每層判斷寫錯的症狀都是「存到錯的地方」或「靜默不存」，且不報錯。
 *    這直接對應 AGENTS.md 的「資料集名稱 = 落盤命名空間」政策。
 *
 * 2. **`CODE: message` 錯誤碼解析**：Rust 以字串回傳錯誤，前端拆前綴成
 *    errorCode 供 i18n 分流。正則寫錯 → 所有錯誤退化成 IO_ERROR，
 *    使用者看到的是無關訊息。
 *
 * 3. **serde 命名雙保險的實際整合**：`tauri_anchor.test.mjs` 已測
 *    `_normalizeAnchor` 函式本身；本檔測的是**呼叫端確實用了它**，
 *    且 snake_case 回應時仍能把專案根餵進後端 —— 這是先前 bug 的真實型態
 *    （物件存在但 projectRoot 為 undefined → 存進空路徑）。
 *
 * 執行（cwd = ui/）：node --test 加引號包住 bridge 目錄下的測試檔樣式
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BridgeTauri } from './tauri.js';
import { getSendHandler } from './tauri/sendHandlers.js';

/**
 * 建立帶可控替身的 bridge。
 * ⚠️ 不經 bridge.send()（其開頭 await this.ready 只在 init() 中 resolve，
 *   Node 無 Tauri api 模組會永久 await）；改走與 send() 相同的 dispatch 路徑。
 */
function makeHarness() {
    const bridge = new BridgeTauri();
    const dispatched = [];
    const invokes = [];
    let anchorResponse = { isAnchored: true, projectRoot: 'C:/proj' };
    // ⚠️ 替身必須反映真實契約：Rust 端 `Err(format!(...))` 經 Tauri invoke
    //   reject 的是**字串**，不是 Error 物件。這是關鍵差異 ——
    //   String(new Error('CODE: x')) 會變成 "Error: CODE: x"，使
    //   前綴正則 /^([A-Z][A-Z0-9_]*):/ 匹配不到，錯誤碼全退化成 IO_ERROR。
    //   （實測踩到：先寫成 throw new Error()，兩支前綴測試皆紅，誤以為程式有 bug。）
    let saveImpl = async () => 'C:/proj/dataset/progress.json';
    let loadImpl = async () => ({ hasProgress: true, spec: { a: 1 }, path: 'C:/p' });

    bridge._dispatchToFrontend = (m) => dispatched.push(m);
    bridge.tauriInvoke = async (cmd, args) => {
        invokes.push({ cmd, args });
        if (cmd === 'get_project_anchor') {
            if (anchorResponse instanceof Error) throw anchorResponse;
            return anchorResponse;
        }
        if (cmd === 'dataset_save_progress') return saveImpl(args);
        if (cmd === 'dataset_load_progress') return loadImpl(args);
        throw new Error(`未預期的 invoke: ${cmd}`);
    };

    const send = (cmd, data) => getSendHandler(cmd).call(bridge, cmd, data);
    const of = (c) => invokes.filter((i) => i.cmd === c);
    const result = (c) => dispatched.find((d) => d.command === c);

    return {
        bridge, dispatched, invokes, send, of, result,
        setAnchor: (v) => { anchorResponse = v; },
        setSave: (f) => { saveImpl = f; },
        setLoad: (f) => { loadImpl = f; }
    };
}

const spec = { images: [{ path: 'a.jpg', label: 'cat' }] };

// ---------------------------------------------------------------------------
// 不變式 1：三層專案根 fallback
// ---------------------------------------------------------------------------

test('saveProgress：已有 _anchor 快取時直接使用，不得重複 invoke（省一次 IPC）', async () => {
    const h = makeHarness();
    h.bridge._anchor = { isAnchored: true, projectRoot: 'C:/cached' };
    await h.send('datasetSaveProgress', { spec, projectName: 'demo' });
    assert.equal(h.of('get_project_anchor').length, 0, '已有快取時不得再問後端');
    assert.equal(h.of('dataset_save_progress')[0].args.folderPath, 'C:/cached');
});

test('saveProgress：_anchor 為 null 時必須向後端查詢並回填快照', async () => {
    const h = makeHarness();
    h.bridge._anchor = null;
    await h.send('datasetSaveProgress', { spec, projectName: 'demo' });
    assert.equal(h.of('get_project_anchor').length, 1, '無快取時必須查詢');
    assert.equal(h.bridge._anchor.projectRoot, 'C:/proj', '查詢結果必須回填快照供後續複用');
});

test('saveProgress：_anchor 存在但 projectRoot 為空時必須重新查詢（不可信空快照）', async () => {
    const h = makeHarness();
    // 半初始化快照：物件存在但無路徑 —— 這正是 serde 命名 bug 的真實型態
    h.bridge._anchor = { isAnchored: true, projectRoot: undefined };
    await h.send('datasetSaveProgress', { spec, projectName: 'demo' });
    assert.equal(h.of('get_project_anchor').length, 1,
        'projectRoot 缺漏的快照不可信任，必須重新查詢');
    assert.equal(h.of('dataset_save_progress')[0].args.folderPath, 'C:/proj');
});

test('saveProgress：snake_case 回應也必須取得專案根（serde 雙保險的實際整合）', async () => {
    const h = makeHarness();
    h.setAnchor({ is_anchored: true, project_root: 'C:/snake' });
    h.bridge._anchor = null;
    await h.send('datasetSaveProgress', { spec, projectName: 'demo' });
    const saved = h.of('dataset_save_progress');
    assert.equal(saved.length, 1, 'snake_case 回應下仍應成功存檔');
    assert.equal(saved[0].args.folderPath, 'C:/snake',
        'snake_case 未被正規化會存入 undefined 路徑');
});

// ---------------------------------------------------------------------------
// 不變式 2：未錨定必須明確拒絕，不可靜默不存
// ---------------------------------------------------------------------------

test('saveProgress：未錨定時回 PROJECT_ROOT_REQUIRED，且不得呼叫存檔', async () => {
    const h = makeHarness();
    h.setAnchor({ isAnchored: false, projectRoot: null });
    h.bridge._anchor = null;
    await h.send('datasetSaveProgress', { spec, projectName: 'demo' });
    assert.equal(h.of('dataset_save_progress').length, 0, '未錨定時不得呼叫後端存檔');
    const r = h.result('datasetSaveProgressResult');
    assert.equal(r.success, false);
    assert.equal(r.errorCode, 'PROJECT_ROOT_REQUIRED',
        '錯誤碼必須穩定，前端據此顯示 i18n 文案');
});

test('saveProgress：查詢錨定本身拋錯時視為未錨定，不得炸出', async () => {
    const h = makeHarness();
    h.setAnchor(new Error('後端掛掉'));
    h.bridge._anchor = null;
    await h.send('datasetSaveProgress', { spec, projectName: 'demo' });
// ---------------------------------------------------------------------------
// 不變式 3：成功路徑
// ---------------------------------------------------------------------------

test('saveProgress：成功時 folderPath 必須是專案根（不是 dataset 子目錄）', async () => {
    const h = makeHarness();
    h.bridge._anchor = { isAnchored: true, projectRoot: 'C:/proj' };
    await h.send('datasetSaveProgress', { spec, projectName: 'demo' });
    const args = h.of('dataset_save_progress')[0].args;
    assert.equal(args.folderPath, 'C:/proj');
    assert.equal(args.projectName, 'demo');
    assert.deepEqual(JSON.parse(args.specJson), spec, 'specJson 必須是合法 JSON');
});

test('saveProgress：projectName 缺漏時降級為 dataset（後端不可收到 undefined）', async () => {
    const h = makeHarness();
    h.bridge._anchor = { isAnchored: true, projectRoot: 'C:/proj' };
    await h.send('datasetSaveProgress', { spec });
    assert.equal(h.of('dataset_save_progress')[0].args.projectName, 'dataset');
});

// ---------------------------------------------------------------------------
// 不變式 4：CODE: message 錯誤碼解析
// ---------------------------------------------------------------------------

test('saveProgress：後端「CODE: msg」前綴須解析為 errorCode', async () => {
    const h = makeHarness();
    h.bridge._anchor = { isAnchored: true, projectRoot: 'C:/proj' };
    h.setSave(async () => { throw 'DISK_FULL: 磁碟空間不足'; });
    await h.send('datasetSaveProgress', { spec, projectName: 'demo' });
    const r = h.result('datasetSaveProgressResult');
    assert.equal(r.success, false);
    assert.equal(r.errorCode, 'DISK_FULL', '前綴必須被抽出成穩定錯誤碼');
    assert.match(r.error, /DISK_FULL/, 'error 保留原文供除錯');
});

test('saveProgress：無前綴的錯誤退化成 IO_ERROR（不得回 undefined）', async () => {
    const h = makeHarness();
    h.bridge._anchor = { isAnchored: true, projectRoot: 'C:/proj' };
    h.setSave(async () => { throw 'something odd'; });
    await h.send('datasetSaveProgress', { spec, projectName: 'demo' });
    const r = h.result('datasetSaveProgressResult');
    assert.equal(r.errorCode, 'IO_ERROR', '前端以 errorCode 分流文案，undefined 會讓 i18n 失效');
});

/*
 * ⚠️ 這支是「型別契約」的釘死，來源是實測踩坑：
 *   最初測試替身寫 `throw new Error('DISK_FULL: ...')`，結果 errorCode 退化成
 *   IO_ERROR，誤以為程式有 bug。實際原因是 **Rust Err(format!()) 經 Tauri
 *   invoke reject 的是字串**，而 String(new Error('X: y')) === "Error: X: y"，
 *   前綴正則 /^([A-Z][A-Z0-9_]*):/ 因此匹配不到。
 *
 *   這個差異有真實後果：若日後有人把後端改成回 Error 物件（或在前端加
 *   `new Error()` 包裝），所有結構化錯誤碼會**靜默退化**成 IO_ERROR，
 *   使用者看到「檔案存取失敗」而非「磁碟已滿」—— 而沒有任何報錯。
 */
test('saveProgress：若錯誤被包成 Error 物件，前綴會失效（記錄已知陷阱的邊界）', async () => {
    const h = makeHarness();
    h.bridge._anchor = { isAnchored: true, projectRoot: 'C:/proj' };
    h.setSave(async () => { throw new Error('DISK_FULL: 滿了'); });

    await h.send('datasetSaveProgress', { spec, projectName: 'demo' });

    const r = h.result('datasetSaveProgressResult');
    assert.equal(r.errorCode, 'IO_ERROR',
        'Error 物件的 toString 會加上 "Error: " 前綴，導致錯誤碼解析失敗 —— '
        + '這是已知陷阱，故明確記錄行為；若日後後端改回傳 Error 物件，'
        + '本測試會提醒須同步調整前綴正則');
});

// ---------------------------------------------------------------------------
// 不變式 5：getProjectAnchor
// ---------------------------------------------------------------------------

test('getProjectAnchor：snake_case 回應必須正規化後回前端（不可洩漏 undefined）', async () => {
    const h = makeHarness();
    h.setAnchor({ is_anchored: true, project_root: 'C:/snake' });
    await h.send('getProjectAnchor', { requestId: 'r1' });
    const r = h.result('projectAnchorResult');
    assert.equal(r.requestId, 'r1', 'requestId 必須原樣回傳（呼叫端靠它配對）');
    assert.equal(r.isAnchored, true);
    assert.equal(r.projectRoot, 'C:/snake');
});

test('getProjectAnchor：成功時順帶刷新 _anchor 快照（後續呼叫可省一次 IPC）', async () => {
    const h = makeHarness();
    h.setAnchor({ isAnchored: true, projectRoot: 'C:/fresh' });
    h.bridge._anchor = { isAnchored: false, projectRoot: null };
    await h.send('getProjectAnchor', { requestId: 'r1' });
    assert.equal(h.bridge._anchor.projectRoot, 'C:/fresh', '快照必須被更新');
});

test('getProjectAnchor：後端拋錯時回未錨定，不得洩漏 undefined 欄位', async () => {
    const h = makeHarness();
    h.setAnchor(new Error('boom'));
    await h.send('getProjectAnchor', { requestId: 'r1' });
    const r = h.result('projectAnchorResult');
    assert.equal(r.isAnchored, false);
    assert.equal(r.projectRoot, null, '必須是 null 而非 undefined（呼叫端會直接使用）');
    assert.equal(r.requestId, 'r1', '即使失敗也必須回 requestId，否則呼叫端永久等待');
});

// ---------------------------------------------------------------------------
// 不變式 6：datasetLoadProgress
// ---------------------------------------------------------------------------

test('loadProgress：無進度時 spec 為 null（不可回 undefined 讓前端 map 炸掉）', async () => {
    const h = makeHarness();
    h.setLoad(async () => ({ hasProgress: false, path: null }));
    await h.send('datasetLoadProgress', { folderPath: 'C:/proj' });
    const r = h.result('datasetLoadProgressResult');
    assert.equal(r.success, true);
    assert.equal(r.hasProgress, false);
    assert.equal(r.spec, null, 'spec 缺漏必須收斂為 null');
    assert.equal(r.errorCode, undefined, 'errorCode 缺漏應為 undefined（非 null，避免誤判為有錯）');
});

test('loadProgress：folderPath 必須原樣透傳（不得被正規化成反斜線）', async () => {
    const h = makeHarness();
    await h.send('datasetLoadProgress', { folderPath: 'C:/proj/sub' });
    assert.equal(h.of('dataset_load_progress')[0].args.folderPath, 'C:/proj/sub');
});

test('loadProgress：錯誤前綴同樣解析為 errorCode', async () => {
    const h = makeHarness();
    h.setLoad(async () => { throw 'PROGRESS_NOT_FOUND: 找不到進度'; });
    await h.send('datasetLoadProgress', { folderPath: 'C:/proj' });
    const r = h.result('datasetLoadProgressResult');
    assert.equal(r.success, false);
    assert.equal(r.errorCode, 'PROGRESS_NOT_FOUND');
});

    const r = h.result('datasetSaveProgressResult');
    assert.equal(r.success, false);
    assert.equal(r.errorCode, 'PROJECT_ROOT_REQUIRED');
});