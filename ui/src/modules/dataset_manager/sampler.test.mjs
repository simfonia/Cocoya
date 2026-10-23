/**
 * sampler.test.mjs — Dataset Manager Sampler 資源釋放守門
 *
 * 對應 2026-10-21 修正：
 *  1. dispose() 必須解除訂閱、停連拍、revoke 預覽 object URL。
 *  2. init() 冪等：重複呼叫不得產生第二組訂閱（否則事件會被處理多次）。
 *  3. 連拍熔斷：相機未執行時中止；連續失敗達門檻時停止。
 *  4. takeSnapshot() 失敗路徑必須釋放剛建立的 object URL。
 *
 * 執行：cd ui; node --test "src/modules/dataset_manager/sampler.test.mjs"
 */
import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * 建立假的 window.CocoyaBridge（datasetBridge 預設 transport 會讀取它）
 * 回傳 { bridge, sent, listenerCount, emit }
 */
function installFakeBridge() {
    const listeners = new Set();
    const sent = [];
    const bridge = {
        onMessage(cb) { listeners.add(cb); },
        offMessage(cb) { listeners.delete(cb); },
        send(command, payload) { sent.push({ command, payload }); },
        capabilities: {}
    };
    globalThis.window = { CocoyaBridge: bridge };
    return {
        bridge,
        sent,
        listenerCount() { return listeners.size; },
        emit(message) { for (const cb of Array.from(listeners)) cb(message); }
    };
}

/** 攔截 URL.revokeObjectURL / createObjectURL（Node 內建 URL 無 revoke） */
function installUrlStub() {
    const revoked = [];
    const created = [];
    const originalRevoke = globalThis.URL.revokeObjectURL;
    const originalCreate = globalThis.URL.createObjectURL;
    globalThis.URL.revokeObjectURL = (url) => { revoked.push(url); };
    globalThis.URL.createObjectURL = (blob) => {
        created.push(blob);
        return 'blob:stub/' + created.length;
    };
    return {
        revoked,
        created,
        restore() {
            if (originalRevoke) globalThis.URL.revokeObjectURL = originalRevoke;
            else delete globalThis.URL.revokeObjectURL;
            if (originalCreate) globalThis.URL.createObjectURL = originalCreate;
            else delete globalThis.URL.createObjectURL;
        }
    };
}

/** Node 環境無 document；提供最小 stub（找不到預覽元素 → 只印警告，不中斷流程） */
function installDocumentStub() {
    const original = globalThis.document;
    globalThis.document = { getElementById: () => null };
    return () => {
        if (original === undefined) delete globalThis.document;
        else globalThis.document = original;
    };
}

const { Sampler } = await import('./sampler.js');
const { datasetBridge } = await import('./io/bridge.js');

/**
 * 每個測試前重置單例狀態（sampler.js 是跨 DM 開關存活的單例）
 * datasetBridge 單例的內部 dispatcher 會綁定「當下的」window.CocoyaBridge；
 * 換 fake bridge 前必須 dispose，否則訊息會送到舊 fake 而 timeout。
 */
function resetSampler() {
    Sampler.dispose();
    datasetBridge.dispose();
    Sampler.state.isCapturing = false;
    Sampler.state.isCamRunning = false;
    Sampler.state.lastPreviewUrl = null;
    Sampler.state.burstTimer = null;
    Sampler.state.burstFailCount = 0;
    Sampler.state.burstAborted = false;
    Sampler.state.cameraList = [];
    Sampler.state.selectedDeviceId = 0;
    Sampler.state.onSampleCaptured = null;
    Sampler.state.onStatusChanged = null;
}


// ==== 測試 ====

test('dispose(): 解除訂閱、停連拍、revoke 預覽 object URL', () => {
    const fake = installFakeBridge();
    const urlStub = installUrlStub();
    try {
        resetSampler();
        Sampler.init();
        assert.equal(fake.listenerCount(), 2, 'init() 應訂閱狀態與同步兩通道');

        Sampler.state.lastPreviewUrl = 'blob:preview-1';
        Sampler.state.burstTimer = setInterval(() => {}, 1000);
        Sampler.state.isCapturing = true;

        Sampler.dispose();

        assert.equal(fake.listenerCount(), 0, 'dispose() 應解除所有訂閱');
        assert.equal(Sampler.state.burstTimer, null, 'dispose() 應清除連拍計時器');
        assert.equal(Sampler.state.isCapturing, false, 'dispose() 應結束連拍狀態');
        assert.deepEqual(urlStub.revoked, ['blob:preview-1'], 'dispose() 應 revoke 預覽 URL');
        assert.equal(Sampler.state.lastPreviewUrl, null, 'revoke 後應清空 lastPreviewUrl');
    } finally {
        urlStub.restore();
        delete globalThis.window;
    }
});

test('init(): 重複呼叫為冪等，不產生第二組訂閱', () => {
    const fake = installFakeBridge();
    try {
        resetSampler();
        Sampler.init();
        Sampler.init();
        Sampler.init();
        assert.equal(fake.listenerCount(), 2, '重複 init() 後仍只應有 2 個訂閱');

        // 事件只應被處理一次
        let changed = 0;
        Sampler.state.onStatusChanged = () => { changed += 1; };
        fake.emit({ command: 'datasetCameraStatus', success: true });
        assert.equal(changed, 1, '同一事件不應因重複訂閱而觸發多次');
    } finally {
        resetSampler();
        delete globalThis.window;
    }

test('startBurst(): 相機未執行時中止連拍，不送任何快照', async (t) => {
    installFakeBridge();
    t.mock.timers.enable({ apis: ['setInterval'] });
    try {
        resetSampler();
        let captured = 0;
        const original = Sampler.takeSnapshot;
        Sampler.takeSnapshot = async () => { captured += 1; return null; };
        try {
            Sampler.state.isCamRunning = false;
            Sampler.startBurst(10, 'proj');
            assert.ok(Sampler.state.burstTimer, '應已建立連拍計時器');

            t.mock.timers.tick(20);
            await new Promise((r) => setImmediate(r));

            assert.equal(captured, 0, '相機未執行時不應送快照');
            assert.equal(Sampler.state.burstTimer, null, '應中止連拍');
            assert.equal(Sampler.state.isCapturing, false);
        } finally {
            Sampler.takeSnapshot = original;
        }
    } finally {
        resetSampler();
        delete globalThis.window;
        t.mock.timers.reset();
    }
});

test('startBurst(): 連續失敗達門檻即熔斷停止', async (t) => {
    installFakeBridge();
    t.mock.timers.enable({ apis: ['setInterval'] });
    try {
        resetSampler();
        let attempts = 0;
        const original = Sampler.takeSnapshot;
        Sampler.takeSnapshot = async () => {
            attempts += 1;
            throw new Error('snapshot failed');
        };
        try {
            Sampler.state.isCamRunning = true;
            Sampler.startBurst(10, 'proj');

            for (let i = 0; i < Sampler.BURST_MAX_FAILURES; i += 1) {
                t.mock.timers.tick(10);
                await new Promise((r) => setImmediate(r));
            }

            assert.equal(attempts, Sampler.BURST_MAX_FAILURES, '失敗次數應等於熔斷門檻');
            assert.equal(Sampler.state.burstTimer, null, '熔斷後應停止連拍');
            assert.equal(Sampler.state.isCapturing, false);

            // 熔斷後不再送快照
            t.mock.timers.tick(50);
            await new Promise((r) => setImmediate(r));
            assert.equal(attempts, Sampler.BURST_MAX_FAILURES, '熔斷後不應再送快照');
        } finally {
            Sampler.takeSnapshot = original;
        }
    } finally {
        resetSampler();
        delete globalThis.window;
        t.mock.timers.reset();
    }
});


test('stopCamera(): 守衛早退時仍清除連拍計時器', () => {
    installFakeBridge();
    try {
        resetSampler();
        Sampler.state.isCamRunning = false;
        Sampler.state.burstTimer = setInterval(() => {}, 1000);
        Sampler.state.isCapturing = true;

        Sampler.stopCamera(); // 未 force，且 isCamRunning=false → 早退

        assert.equal(Sampler.state.burstTimer, null, '守衛早退仍應清除連拍計時器');
        assert.equal(Sampler.state.isCapturing, false);
    } finally {
        resetSampler();
        delete globalThis.window;
    }
});

test('takeSnapshot(): 快照處理失敗時釋放剛建立的 object URL', async () => {
    const fake = installFakeBridge();
    const urlStub = installUrlStub();
    const restoreDocument = installDocumentStub();
    try {
        resetSampler();
        // 讓 onSampleCaptured 拋錯 → 進入 catch 路徑（此時 object URL 已建立）
        Sampler.state.onSampleCaptured = () => { throw new Error('consumer failed'); };
        Sampler.state.targetLabel = 'cat';

        fake.bridge.send = (command, payload) => {
            if (command === 'datasetCaptureImage') {
                const base64 = Buffer.from('fake-jpeg-bytes').toString('base64');
                setImmediate(() => fake.emit({
                    command: 'datasetCaptureResult',
                    requestId: payload.requestId,
                    success: true,
                    base64,
                    savePath: 'C:/tmp/x.jpg'
                }));
            }
        };

        await assert.rejects(() => Sampler.takeSnapshot('proj'));

        assert.equal(urlStub.created.length, 1, '應已建立一個預覽 object URL');
        assert.deepEqual(urlStub.revoked, ['blob:stub/1'], '失敗路徑應釋放剛建立的 object URL');
        assert.equal(Sampler.state.lastPreviewUrl, null, '失敗後不應殘留預覽 URL');
    } finally {
        urlStub.restore();
        restoreDocument();
        resetSampler();
        delete globalThis.window;
    }
});

});
