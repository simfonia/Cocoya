/**
 * simulatorEngine.test.mjs -- 訓練模擬器引擎測試（V1）
 *
 * vm harness 載入傳統 script 版引擎（settingsHarness.mjs 先例）。
 * 守門三組：
 *   1. 確定性：同參數＋同 seed => 完全同曲線
 *   2. 九症狀真值表：每症狀一組參數 => 診斷器必含該碼（允許併發他碼）
 *   3. 正常參數 => 零診斷（診斷器不可過寬——過寬比沒有守門更糟）
 *
 * 病例參數（2026-10-18 探針校準定案；改引擎常數導致本檔變紅時，
 * 先懷疑引擎退化，不得直接放寬斷言）：
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = path.join(here, 'simulatorEngine.js');

function loadEngine() {
    const sandbox = { console, JSON, Math };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(ENGINE_PATH, 'utf8'), sandbox, { filename: ENGINE_PATH });
    const E = sandbox.CocoyaSimEngine;
    if (!E) throw new Error('simulatorEngine.js 未掛載 CocoyaSimEngine');
    return E;
}

const E = loadEngine();

/* 九症狀病例（seed 固定 7；S6 病例另見 seed 穩健性測試） */
const CASES = {
    NORMAL: { learningRate: 0.001, epochs: 20 },
    S1: { learningRate: 0.2, epochs: 30 },
    S2: { learningRate: 0.9, epochs: 30 },
    S3: { learningRate: 0.00005, epochs: 100, optimizer: 'adam' },
    S4: { learningRate: 0.003, epochs: 100, dropout: 0, augmentation: false, dnnLayers: '512,256,128' },
    S5: { learningRate: 0.01, epochs: 100, dropout: 0, augmentation: false, dnnLayers: '256,128' },
    S6: { learningRate: 0.001, epochs: 60, validationSplit: 0.1 },
    S7: { learningRate: 0.001, epochs: 30, batchSize: 1 },
    S8: { learningRate: 0.002, epochs: 80, dropout: 0.5, augmentation: true },
    S9: { learningRate: 0.00002, epochs: 20, optimizer: 'sgd' }
};
const SEED = 7;

function codesFor(key) {
    const h = E.generateCurves(CASES[key], SEED);
    return E.diagnose(h, CASES[key]).map(function (d) { return d.code; });
}

test('守門 1：同參數＋同 seed => 完全同曲線（含 NaN 位置）', function () {
    const a = E.generateCurves(CASES.S4, SEED);
    const b = E.generateCurves(CASES.S4, SEED);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    /* 不同 seed 應不同曲線（否則 seed 形同虛設） */
    const c = E.generateCurves(CASES.S4, SEED + 1);
    assert.notEqual(JSON.stringify(a), JSON.stringify(c));
});

test('守門 1b：輸出與 training_report.py save_training_history 同構', function () {
    const h = E.generateCurves(CASES.NORMAL, SEED);
    for (const k of ['loss', 'val_loss', 'accuracy', 'val_accuracy']) {
        assert.ok(Array.isArray(h[k]), k + ' 應為陣列');
        assert.equal(h[k].length, CASES.NORMAL.epochs);
    }
    /* accuracy 由 loss 單調映射：loss 越小 acc 越大（抽查） */
    assert.ok(h.accuracy[0] < h.accuracy[h.accuracy.length - 1]);
});

test('守門 2：九症狀真值表——每症狀病例必含其碼', function () {
    for (const s of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9']) {
        const got = codesFor(s);
        assert.ok(got.indexOf(s) >= 0, s + ' 病例應診出 ' + s + '，實得 [' + got.join(',') + ']');
    }
});

test('守門 2b：九症狀皆可經 classifyCurveFeatures 特徵判出（非僅參數規則）', function () {
    /* S9 與 S6 含參數輔助門（見引擎註解）；其餘七症須純曲線可判。
     * 此測試以「未知參數」（undefined）呼叫 classify，確認特徵層獨立有效。 */
    const curveOnly = ['S1', 'S2', 'S3', 'S4', 'S5', 'S7', 'S8'];
    const expect = {
        S1: function (f) { return f.oscillating; },
        S2: function (f) { return f.diverged; },
        S3: function (f) { return f.underfit; },
        S4: function (f) { return f.uTurnEpoch !== null; },
        S5: function (f) { return f.accGapFinal > E.THRESH.accGap; },
        S7: function (f) { return f.trainNoise > E.THRESH.trainNoiseMin; },
        S8: function (f) {
            return Math.abs(f.gapFinal) < E.THRESH.s8GapMax && f.uTurnEpoch === null;
        }
    };
    for (const s of curveOnly) {
        const h = E.generateCurves(CASES[s], SEED);
        const f = E.classifyCurveFeatures(h, undefined);
        assert.ok(expect[s](f), s + ' 應可由純曲線特徵判出，實得 ' + JSON.stringify(f));
    }
});

test('守門 3：正常參數 => 零診斷（不可過寬）', function () {
    const got = codesFor('NORMAL');
    /* ⚠️ vm 沙箱陣列與本 realm 陣列 deepEqual 永遠不等（不同 realm，
     * settingsHarness.mjs 同坑）。比 JSON 字串。 */
    assert.equal(JSON.stringify(got), '[]');
});

test('守門 3b：seed 穩健性——換 seed 正常參數仍零誤報、S2/S9 仍命中', function () {
    for (const seed of [1, 42, 99]) {
        const normalCodes = E.diagnose(E.generateCurves(CASES.NORMAL, seed), CASES.NORMAL)
            .map(function (d) { return d.code; });
        assert.equal(JSON.stringify(normalCodes), '[]',
            'seed=' + seed + ' 正常參數誤報 [' + normalCodes.join(',') + ']');
        for (const s of ['S2', 'S9']) {
            const got = E.diagnose(E.generateCurves(CASES[s], seed), CASES[s])
                .map(function (d) { return d.code; });
            assert.ok(got.indexOf(s) >= 0, 'seed=' + seed + ' ' + s + ' 未命中，實得 [' + got.join(',') + ']');
        }
    }
});

test('守門 4：參數正規化——非法輸入不炸、夾回範圍', function () {
    const p = E.normalizeParams({ learningRate: -5, epochs: 99999, optimizer: 'nope', dnnLayers: 'abc' });
    assert.equal(p.learningRate, 0.00001);
    assert.equal(p.epochs, 1000);
    assert.equal(p.optimizer, 'adam');
    assert.deepEqual(JSON.parse(JSON.stringify(E.parseDnnLayers('abc'))), [128, 64]);
    assert.deepEqual(JSON.parse(JSON.stringify(E.parseDnnLayers(''))), [128, 64]);
});
