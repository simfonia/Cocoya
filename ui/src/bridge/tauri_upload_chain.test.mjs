/**
 * bridge_upload_chain.test.mjs — T7：_datasetUploadChain 併發上傳鏈契約測試
 *
 * 【為何這條路徑風險最高】
 * `_datasetUploadChain` 是**整個 bridge 層唯一帶可變實例狀態**的地方：
 *   - `tauri.js:20`    初始化為 `Promise.resolve()`
 *   - `transfer.js:96` 串接 `this._datasetUploadChain.then(uploadTask, uploadTask)`
 *
 * 三個特性讓它極易在重構時改壞，而且**改壞不會報錯、只會靜默劣化**：
 *
 * 1. **雙參數 then 是刻意的**：`then(uploadTask, uploadTask)` —— 同一函式同時
 *    充當 onFulfilled 與 onRejected，意圖是「前一棒失敗也要繼續跑下一棒」。
 *    改成單參數 `.then(uploadTask)` 會讓首次失敗後整條鏈永久 rejected，
 *    之後所有上傳被跳過，且 UI 無任何錯誤提示。
 *
 * 2. **序列化是唯一正確性保證**：Dataset Manager 對同一 zip 分塊並行呼叫
 *    `datasetUploadArchive`。若兩個 chunk 同時進 `dataset_upload_chunk`，
 *    後端暫存檔互相覆蓋 → 資料損毀。
 *
 * 3. **失敗必須回報前端**：uploadTask 內 catch 後 dispatch
 *    `datasetUploadResult`，漏掉會讓進度條永遠轉圈。
 *
 * 執行（cwd = ui/）：node --test 加引號包住 bridge 目錄下的測試檔樣式
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BridgeTauri } from './tauri.js';
import { getSendHandler } from './tauri/sendHandlers.js';

/**
 * 建立帶可控替身的 bridge。
 *
 * ⚠️ 刻意**不經 `bridge.send()`**，而是直接取 handler 並 `.call(this, …)`：
 *   `send()` 開頭有 `await this.ready`，而 `ready` 只在 `init()`（會動態 import
 *   Tauri api 套件，Node 無此模組）中 resolve。直接走 send() 會永久 await。
 *   這與 send() 內部 dispatch handler 的路徑完全相同（handler.call(this, command, data)），
 *   仍覆蓋到真正的實作碼。
 */
function makeHarness() {
    const bridge = new BridgeTauri();
    const dispatched = [];
    const invokes = [];
    let uploadChunkImpl = async (args) => `C:/tmp/${args.fileId}.zip`;
    let uploadDatasetImpl = async () => ({ success: true });

    bridge._dispatchToFrontend = (msg) => { dispatched.push(msg); };
    bridge.tauriInvoke = async (cmd, args) => {
        invokes.push({ cmd, args });
        if (cmd === 'dataset_upload_chunk') return uploadChunkImpl(args);
        throw new Error(`未預期的 invoke: ${cmd}`);
    };
    // _handleDatasetCommand 的最小替身（真實實作會 ping/start sidecar，與本測試無關）
    bridge._handleDatasetCommand = async (sidecarCmd, data, callback) => {
        invokes.push({ cmd: 'uploadDataset', args: data });
        const response = await uploadDatasetImpl(data);
        if (callback) callback(response);
        return response;
    };

    return {
        bridge,
        dispatched,
        invokes,
        /** 等同 send() 內部的 dispatch 路徑。 */
        send: (cmd, data) => getSendHandler(cmd).call(bridge, cmd, data),
        setUploadChunk: (fn) => { uploadChunkImpl = fn; },
        setUploadDataset: (fn) => { uploadDatasetImpl = fn; },
        of: (cmd) => invokes.filter((i) => i.cmd === cmd)
    };
}

const chunk = (over = {}) => ({
    fileId: 'f1', chunkIndex: 0, totalChunks: 2,
    zipDataChunk: 'AAA', projectName: 'demo', ...over
});

// ---------------------------------------------------------------------------
// 不變式 1：序列化（核心正確性）
// ---------------------------------------------------------------------------

test('上傳鏈：三次呼叫必須完全序列化，不得並行（並行會讓後端暫存檔互相覆蓋）', async () => {
    const h = makeHarness();
    const running = [];
    let maxConcurrent = 0;
    h.setUploadChunk(async () => {
        running.push(1);
        maxConcurrent = Math.max(maxConcurrent, running.length);
        await new Promise((r) => setTimeout(r, 5));
        running.pop();
        return 'C:/tmp/x.zip';
    });

    await Promise.all([
        h.send('datasetUploadArchive', chunk({ chunkIndex: 0 })),
        h.send('datasetUploadArchive', chunk({ chunkIndex: 1 })),
        h.send('datasetUploadArchive', chunk({ chunkIndex: 2, isLast: true }))
    ]);

    assert.equal(maxConcurrent, 1,
        `實際最大並行數 ${maxConcurrent}，應為 1（分塊上傳必須序列化）`);
    assert.equal(h.of('dataset_upload_chunk').length, 3, '三個 chunk 都應被送出');
});

test('上傳鏈：執行順序等於呼叫順序（FIFO，不可重排）', async () => {
    const h = makeHarness();
    await Promise.all([0, 1, 2].map((i) =>
        h.send('datasetUploadArchive', chunk({ chunkIndex: i }))));
    assert.deepEqual(
        h.of('dataset_upload_chunk').map((i) => i.args.chunkIndex),
        [0, 1, 2]
    );
});

// ---------------------------------------------------------------------------
// 不變式 2：失敗不得中斷後續（雙參數 then 的存在理由）
// ---------------------------------------------------------------------------

test('上傳鏈：前一棒失敗後，後續上傳仍須執行（串接不得中斷）', async () => {
    const h = makeHarness();
    let call = 0;
    h.setUploadChunk(async () => {
        call += 1;
        if (call === 1) throw new Error('第一棒失敗');
        return 'C:/tmp/x.zip';
    });

    await Promise.all([
        h.send('datasetUploadArchive', chunk({ chunkIndex: 0 })),
        h.send('datasetUploadArchive', chunk({ chunkIndex: 1 })),
        h.send('datasetUploadArchive', chunk({ chunkIndex: 2 }))
    ]);

    assert.equal(call, 3, '第一棒失敗後，第二、三棒仍必須執行');
});

/*
 * ⚠️ 上面那支測試**抓不到**雙參數 then 被改寫成單參數 —— 這是實測確認的，
 *   不是推測：uploadTask 內部有完整 try/catch，永不 reject，故鏈永遠處於
 *   fulfilled 狀態，`.then(t)` 與 `.then(t, t)` 行為完全一致。
 *   （首次嘗試時曾把它當作雙參數的保護證據，mutation 後才發現是假安全感。）
 *
 * 雙參數 then 真正防護的是**連鎖失效**場景：catch 區塊內的 _dispatchToFrontend
 * 一旦拋錯（如前端訊號線已斷），uploadTask 就會 reject。單參數 then 會讓整條鏈
 * 從此永久 rejected，之後**所有**上傳都被靜默跳過。下一支測試才是真正的守門。
 */
test('上傳鏈：失敗回報本身拋錯時，後續上傳仍須執行（雙參數 then 的真實防護場景）', async () => {
    const h = makeHarness();
    let call = 0;
    let firstErrorReported = false;
    h.bridge._dispatchToFrontend = (msg) => {
        if (msg.command === 'datasetUploadResult' && !firstErrorReported) {
            firstErrorReported = true;
            throw new Error('前端訊號線已斷');   // 模擬 catch 區塊內拋錯
        }
    };
    h.setUploadChunk(async () => {
        call += 1;
        if (call === 1) throw new Error('第一棒失敗');
        return 'C:/tmp/x.zip';
    });

    // 錯誤會冒泡到呼叫端 —— 真實 send() 有 try/catch 承接（記 error 後不外炸）。
    // 這裡用 allSettled 收集，模擬該承接行為。
    const results = await Promise.allSettled([
        h.send('datasetUploadArchive', chunk({ chunkIndex: 0 })),
        h.send('datasetUploadArchive', chunk({ chunkIndex: 1 })),
        h.send('datasetUploadArchive', chunk({ chunkIndex: 2 }))
    ]);

    assert.equal(call, 3,
        'catch 內拋錯後，後續上傳仍必須執行 —— 單參數 then 會讓整條鏈永久 rejected，'
        + '之後所有上傳被靜默跳過且 UI 無任何錯誤提示');
    // 第一棒的呼叫端會收到 rejection（由 send() 的 try/catch 承接）
    assert.equal(results[0].status, 'rejected', '第一棒的錯誤應回報給呼叫端');
    assert.ok(results[1].status === 'fulfilled' || results[1].status === 'rejected',
        '後續棒不應因鏈失效而被跳過');
});

test('上傳鏈：鏈本身永不 rejected（send 不得因上傳失敗而拋出）', async () => {
    const h = makeHarness();
    h.setUploadChunk(async () => { throw new Error('boom'); });
    // 若鏈會 rejected，這裡會拋出並讓測試失敗
    await h.send('datasetUploadArchive', chunk());
    assert.ok(true);
});

// ---------------------------------------------------------------------------
// 不變式 3：失敗必須回報前端（否則進度條永遠轉圈）
// ---------------------------------------------------------------------------

test('上傳鏈：失敗時必須 dispatch datasetUploadResult success=false', async () => {
    const h = makeHarness();
    h.setUploadChunk(async () => { throw new Error('network down'); });

    await h.send('datasetUploadArchive', chunk());

    const results = h.dispatched.filter((d) => d.command === 'datasetUploadResult');
    assert.equal(results.length, 1, '失敗必須回報一次結果');
    assert.equal(results[0].success, false);
    assert.match(results[0].error, /network down/);
});

test('上傳鏈：成功時 dispatch success=true 且帶 errorCode 欄位', async () => {
    const h = makeHarness();
    h.setUploadDataset(async () => ({ success: true, errorCode: null, error: null }));

    await h.send('datasetUploadArchive', chunk({ isLast: true }));

    const results = h.dispatched.filter((d) => d.command === 'datasetUploadResult');
    assert.equal(results.length, 1);
    assert.equal(results[0].success, true);
    // errorCode 必須存在（前端以 errorCode 分流文案，undefined 與 null 語意不同）
    assert.ok('errorCode' in results[0], 'result 必須含 errorCode 欄位');
});

// ---------------------------------------------------------------------------
// 不變式 4：分塊語意與 payload 清洗
// ---------------------------------------------------------------------------

test('上傳鏈：isLast 必須轉 boolean 送給後端（不可送 truthy 原值）', async () => {
    const h = makeHarness();
    await h.send('datasetUploadArchive', chunk({ isLast: 1 }));
    assert.equal(h.of('dataset_upload_chunk')[0].args.isLast, true);

    const h2 = makeHarness();
    await h2.send('datasetUploadArchive', chunk({ isLast: undefined }));
    assert.equal(h2.of('dataset_upload_chunk')[0].args.isLast, false);
});

test('上傳鏈：projectName 缺漏時降級為 dataset（後端不可收到 undefined）', async () => {
    const h = makeHarness();
    await h.send('datasetUploadArchive', { fileId: 'f', zipDataChunk: 'x' });
    assert.equal(h.of('dataset_upload_chunk')[0].args.projectName, 'dataset');
});

test('上傳鏈：uploadDataset payload 必須洗掉分塊專用欄位', async () => {
    const h = makeHarness();
    await h.send('datasetUploadArchive', chunk({ isLast: true }));

    const payload = h.of('uploadDataset')[0].args;
    assert.ok(payload.localZipPath, '必須帶上後端回傳的 localZipPath');
    for (const k of ['zipDataChunk', 'chunkIndex', 'totalChunks', 'isLast']) {
        assert.ok(!(k in payload), `payload 不得殘留分塊欄位 ${k}（會被誤送到上傳端）`);
    }
    assert.equal(payload.fileId, 'f1', '非分塊欄位必須保留');
});

test('上傳鏈：後端未回傳 localZipPath 時不得續傳（直接結束該棒）', async () => {
    const h = makeHarness();
    h.setUploadChunk(async () => null);   // 空回應
    await h.send('datasetUploadArchive', chunk());
    assert.equal(h.of('uploadDataset').length, 0, '無 localZipPath 時不得呼叫 uploadDataset');
    assert.equal(h.dispatched.length, 0, '也不得產生偽結果');
});

// ---------------------------------------------------------------------------
// 不變式 5：datasetExport 的 Canceled 分支
// ---------------------------------------------------------------------------

test('datasetExport：使用者取消（Canceled）必須回 CANCELED 而非空轉（否則進度條不消失）', async () => {
    const h = makeHarness();
    h.bridge.tauriInvoke = async () => { throw 'Canceled'; };

    await h.send('datasetExport', { spec: {}, sourceFolderPath: '' });

    const r = h.dispatched.find((d) => d.command === 'datasetExportResult');
    assert.ok(r, '取消也必須回結果');
    assert.equal(r.success, false);
    assert.equal(r.errorCode, 'CANCELED');
});

test('datasetExport：非取消錯誤不得誤標為 CANCELED', async () => {
    const h = makeHarness();
    h.bridge.tauriInvoke = async () => { throw new Error('disk full'); };
    await h.send('datasetExport', { spec: {} });
    const r = h.dispatched.find((d) => d.command === 'datasetExportResult');
    assert.equal(r.success, false);
    assert.notEqual(r.errorCode, 'CANCELED');
    assert.match(r.error, /disk full/);
});