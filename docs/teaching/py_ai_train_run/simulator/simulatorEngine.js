/**
 * simulatorEngine.js -- 訓練模擬器純函式引擎（V1）
 *
 * 契約：無 DOM、無 fetch、seeded PRNG（mulberry32）。
 * 同參數 + 同 seed => 完全同曲線（測試與 V2 挑戰公平性基礎）。
 *
 * 輸出與 resources/train_templates/common/training_report.py::save_training_history 同構：
 *   { loss[], val_loss[], accuracy[], val_accuracy[] }（Epoch 從 1 起算，長度 = epochs）。
 *
 * 參數約束鏡射 ui/src/modules/ai_inference/ai_inference_blocks.js（2026-10-18 對照）：
 *   LR: 預設 0.001, 範圍 1e-5~1 ｜ Epochs: 預設 20, 1~1000 ｜ Batch: 預設 32, 1~512
 *   Dropout: 預設 0.2, 0.0~0.9 ｜ ValSplit: 預設 0.2, 0.1~0.5
 *   優化器 adam/sgd/rmsprop ｜ DNN_LAYERS 文字欄（逗號分隔，空字串=預設架構）
 *
 * 傳統 script（非 ESM）：掛 globalThis.CocoyaSimEngine，供 simulator.html 與 vm 測試載入。
 * 測試走 vm 沙箱讀 globalThis 掛載點（settingsHarness.mjs 同模式）。
 */
(function (root) {
'use strict';

/* ---------- 預設值（鏡射積木預設） ---------- */
var DEFAULTS = {
    learningRate: 0.001,
    epochs: 20,
    batchSize: 32,
    dropout: 0.2,
    validationSplit: 0.2,
    augmentation: true,
    optimizer: 'adam',
    dnnLayers: '128,64'
};

/* 優化器速度係數：tau 由 LR x 係數決定（Adam 1.0 / RMSprop 0.8 / SGD 0.4） */
var OPTIMIZER_SPEED = { adam: 1.0, rmsprop: 0.8, sgd: 0.4 };

/* ---------- 診斷閾值（與生成器同檔，防兩邊漂移） ---------- */
var THRESH = {
    underfitSlope: -0.012,   /* S3：尾段斜率比此更負 => 還在緩降（須配總降幅門，防毛刺） */
    underfitDropMin: 0.15,  /* S3：後半段總降幅須超此值（斜率 x 半程；毛刺斜率雖負但總降小） */
    s3EpochsMin: 50,        /* S3：投入維度——跑夠久還在降（NORMAL 預設 20 輪在降屬健康早訓，不判） */
    s3LrMax: 0.0002,        /* S3：或 LR 小到學不動（短輪數＋極小 LR 亦判） */
    s6ValSplitMax: 0.12,    /* S6 參數輔助門：驗證比已知過小（S9 先例：參數規則＋曲線確認混合判） */
    s6ValNoiseMin: 0.06,    /* S6 參數輔助門的 val 噪音下限（低於純曲線門 0.08） */
    s9LrMax: 0.0005,        /* S9：SGD 且 LR <= 此值 */
    s9SlopeMax: -0.02,      /* S9：尾段斜率大於此（平坦或慢爬） */
    s9AccMax: 0.85,         /* S9：終點準確率仍低（排除已收斂的 SGD） */
    accGap: 0.18,           /* S5：train-val 準確率缺口 */
    uTurnRise: 0.05,        /* S4：val 回揚最小幅度（＋相對項，見 uTurn） */
    valNoiseMin: 0.08,      /* S6：val 噪音下限 */
    valNoiseRatio: 2.5,     /* S6：val 噪音 >= train 噪音 x 此倍 */
    trainNoiseMin: 0.12,    /* S7：train 噪音下限 */
    trainNoiseRatio: 2.0,   /* S7：train 噪音 >= val 噪音 x 此倍 */
    s8RegMin: 0.4,          /* S8：正則強度下限（dropout＋aug 加權） */
    s8FloorMin: 0.4,        /* S8：train 終點 loss 高於此（正則墊高） */
    s8GapMax: 0.3,          /* S8：兩線貼近（loss 缺口小於此） */
    divergeLoss: 6,         /* S2：loss 超此值或非有限 => 發散 */
    divergeLr: 0.5,         /* S2：LR >= 此值進入發散 regime */
    nanLr: 0.8,             /* LR >= 此值後段出 NaN（圖上斷裂） */
    oscThreshold: 0.65,     /* S1：後段差分變號率超此值 => 震盪（基線噪音翻號率已 ~0.5） */
    oscRangeMin: 0.15       /* S1：後段 train 全距須超此值（排除小毛刺翻號） */
};

/* ---------- seeded PRNG（mulberry32） ---------- */
function mulberry32(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* Box-Muller：由均勻 PRNG 產生標準常態 */
function randn(rand) {
    var u = Math.max(rand(), 1e-12);
    var v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ---------- 參數正規化（補預設＋夾範圍；未知優化器回到 adam） ---------- */
function normalizeParams(raw) {
    var p = raw || {};
    function num(v, dflt, lo, hi) {
        var x = (v === undefined || v === null || v === '') ? dflt : Number(v);
        if (!isFinite(x)) x = dflt;
        return Math.min(hi, Math.max(lo, x));
    }
    var opt = String(p.optimizer || DEFAULTS.optimizer).toLowerCase();
    if (!OPTIMIZER_SPEED.hasOwnProperty(opt)) opt = 'adam';
    return {
        learningRate: num(p.learningRate, DEFAULTS.learningRate, 0.00001, 1),
        epochs: Math.round(num(p.epochs, DEFAULTS.epochs, 1, 1000)),
        batchSize: Math.round(num(p.batchSize, DEFAULTS.batchSize, 1, 512)),
        dropout: num(p.dropout, DEFAULTS.dropout, 0, 0.9),
        validationSplit: num(p.validationSplit, DEFAULTS.validationSplit, 0.1, 0.5),
        augmentation: (p.augmentation === undefined) ? DEFAULTS.augmentation : !!p.augmentation,
        optimizer: opt,
        dnnLayers: (p.dnnLayers === undefined || p.dnnLayers === null)
            ? DEFAULTS.dnnLayers : String(p.dnnLayers)
    };
}

/* DNN 文字欄 -> 神經元寬度陣列（空字串＝預設架構；非法段捨去，全非法回預設） */
function parseDnnLayers(s) {
    var widths = String(s === undefined || s === null ? DEFAULTS.dnnLayers : s)
        .split(',')
        .map(function (x) { return parseInt(String(x).trim(), 10); })
        .filter(function (x) { return isFinite(x) && x > 0; });
    if (widths.length === 0) widths = [128, 64];
    return widths;
}

/* 容量分數（預設 128+64=192 => 1.0） */
function capacityScore(widths) {
    var total = widths.reduce(function (a, b) { return a + b; }, 0);
    return total / 192;
}

/* Accuracy 由 Loss 單調映射（兩面板講同一個故事）：acc = 1/(1+loss) */
function accFromLoss(loss) {
    if (!isFinite(loss)) return NaN;
    var a = 1 / (1 + loss);
    return Math.min(1, Math.max(0, a));
}

/* ---------- 曲線生成 ---------- */
function generateCurves(rawParams, seed) {
    var p = normalizeParams(rawParams);
    var rand = mulberry32((seed === undefined || seed === null) ? 7 : seed);
    var n = p.epochs;
    var speed = OPTIMIZER_SPEED[p.optimizer];
    var widths = parseDnnLayers(p.dnnLayers);
    var cap = capacityScore(widths);

    /* 主體指數衰減：tau 由 LR x 優化器速度決定（LR 大收斂快；SGD 慢）。
     * 小 LR 長尾修正：純指數在尾段減速過快（S3 在 100 epochs 下斜率剩一半，
     * SNR 門判不出）。加線性殘項，保證小 LR 全程有感下降。 */
    var tau = 30 / (1 + 300 * p.learningRate * speed);
    tau = Math.min(200, Math.max(0.6, tau));
    var linRate = (p.learningRate < 0.0002)
        ? (0.004 * speed * (1 - p.learningRate / 0.0002)) : 0;

    /* 起點／終點：dropout 越高地板越高（Linf 上浮）；augmentation 輕微墊高。
     * L0 隨 tau 浮動：收斂快（tau 小）起點高、慢者起點低，避免 S3/S9 開局即穿透地板 */
    var reg = p.dropout * 0.9 + (p.augmentation ? 0.15 : 0);
    var linf = 0.25 + reg * 0.9;
    var l0 = linf + 1.2 + 1.3 * Math.exp(-tau / 8);

    /* 過擬合壓力：容量大、dropout 低、無 augmentation => t_opt 提早、缺口大。
     * 預設參數（cap=1, dropout=0.2, aug=on）壓力 ~0.2 => 不觸 U 形下限；
     * 關 aug＋dropout=0＋大 DNN => 壓力破 1 => 中段即回揚。
     * 注意：tOpt 須早於「收斂完成」（tau*3），否則 train 貼地板後 gap 才長，
     * 回揚埋在地板裡看不見（S4c/d 教訓：gap=2.5 照樣無 U 形）。 */
    var overfit = cap * (1 - p.dropout) * (p.augmentation ? 0.25 : 1.0);
    var tOpt = 2 + 60 * (1 - Math.min(1, overfit * 1.1)) +
        (n * 0.25) * (p.augmentation ? 1 : 0);
    tOpt = Math.min(n + 5, Math.max(1.5, tOpt));
    /* 過擬合缺口：高壓時提前（與收斂競爭），低壓封零 */
    var gapMax = Math.min(2.5, Math.max(0, overfit - 0.35) * 3.2);
    var gapW = Math.max(1.5, n / 8);
    if (overfit > 0.9) {
        /* 高壓：gap 與收斂同步賽跑，tOpt 取早者。
         * 但不可早於收斂走完（tau*2.5），否則 val 最小點落在前 1/4，
         * 被 uTurn「下降未走完」排除擋掉（S4c 教訓：minIdx=1 永無 U 形）。 */
        tOpt = Math.min(tOpt, tau * 1.2 + 2);
        tOpt = Math.max(tOpt, tau * 2.5);
    } else if (overfit < 0.45) {
        gapMax = 0;
    }
    /* S8 保護：dropout >= 0.4 時強制無缺口（重正則下不該長 gap，
     * 否則 S8 病例自帶 U 形教出反效果：S8e 教訓 uT=95）。 */
    if (p.dropout >= 0.4) gapMax = 0;

    /* 雙源噪音：train ~ 1/sqrt(batch)；val ~ sqrt(1/valSplit)
     * 預設參數下 val 噪音須明顯小於 S6 門檻（0.08），否則正常曲線也被判 S6。
     * 實測 noiseLevel（去均值 std）約為振幅 x 0.9，故係數取 0.02：
     * 預設（valSplit=0.2）vn≈0.06 零誤報；S6 病例（0.1）vn≈0.09 觸門。 */
    var trainNoiseAmp = 0.25 / Math.sqrt(p.batchSize);
    var valNoiseAmp = 0.02 * Math.sqrt(1 / p.validationSplit);

    /* LR 過大 regime：震盪加劇（0.05 起）→ 發散（0.5 起）→ NaN（0.8 起） */
    var diverged = p.learningRate >= THRESH.divergeLr;

    var loss = [], valLoss = [], acc = [], valAcc = [];
    for (var t = 1; t <= n; t++) {
        var base = linf + (l0 - linf) * Math.exp(-t / tau) + linRate * Math.max(0, n - t);
        var tn = trainNoiseAmp * randn(rand);
        var vn = valNoiseAmp * randn(rand);
        var gap = gapMax * Math.max(0, 1 - Math.exp(-(t - tOpt) / gapW));

        var lTrain, lVal;
        if (diverged) {
            /* 發散：指數噴飛＋大幅震盪 */
            var blow = Math.exp((t - 1) * (0.25 + p.learningRate * 0.6)) - 1;
            var oscAmp = 0.4 + p.learningRate * 1.5;
            lTrain = base + blow * 3 + oscAmp * randn(rand);
            lVal = lTrain + gap + valNoiseAmp * randn(rand);
            if (p.learningRate >= THRESH.nanLr && t > Math.ceil(n * 0.55)) {
                lTrain = NaN; lVal = NaN;
            }
        } else {
            /* LR 偏大（未達發散）：震盪幅度隨 LR 放大。
             * 0.05 以下幾乎無震盪（正常參數不誤報 S1）；0.15 起明顯。
             * 上限夾 6：LR=0.2 時 scale 達 10，會把 U 形區也震成 S1 併發（S1 病例教訓）。 */
            var over = Math.max(0, (p.learningRate - 0.05));
            var oscScale = Math.min(6, 1 + over * over * 400);
            lTrain = base + tn * oscScale;
            lVal = base + gap + vn * Math.min(oscScale, 3);
        }
        loss.push(lTrain);
        valLoss.push(lVal);
        acc.push(accFromLoss(lTrain));
        valAcc.push(accFromLoss(lVal));
    }
    return { loss: loss, val_loss: valLoss, accuracy: acc, val_accuracy: valAcc };
}

/* ---------- 特徵分類（一個引擎三處用：V1 診斷、V2 裁判、V3 出題） ---------- */
function finiteOnly(arr) {
    return arr.filter(function (x) { return isFinite(x); });
}
function meanTail(arr, k) {
    var f = finiteOnly(arr);
    if (f.length === 0) return NaN;
    k = Math.min(k, f.length);
    var s = 0;
    for (var i = f.length - k; i < f.length; i++) s += f[i];
    return s / k;
}
/* 尾段斜率（每 epoch 平均變化，線性回歸簡化：(尾均-首均)/跨度） */
function endSlope(arr) {
    var f = finiteOnly(arr);
    if (f.length < 4) return 0;
    var k = Math.max(2, Math.floor(f.length / 5));
    return (meanTail(f, k) - meanHead(f, k)) / Math.max(1, f.length - k);
    function meanHead(a, kk) {
        kk = Math.min(kk, a.length);
        var s = 0;
        for (var i = 0; i < kk; i++) s += a[i];
        return s / kk;
    }
}
/* 噪音強度：去趨勢後殘差 std（尾段） */
function noiseLevel(arr) {
    var f = finiteOnly(arr);
    if (f.length < 6) return 0;
    var k = Math.max(4, Math.floor(f.length / 3));
    var tail = f.slice(f.length - k);
    var m = tail.reduce(function (a, b) { return a + b; }, 0) / tail.length;
    var v = tail.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / tail.length;
    return Math.sqrt(v);
}
/* 後段差分變號率（震盪指標） */
function signFlipRate(arr) {
    var f = finiteOnly(arr);
    if (f.length < 6) return 0;
    var start = Math.floor(f.length / 2);
    var flips = 0, total = 0, prev = 0;
    for (var i = start + 1; i < f.length; i++) {
        var d = f[i] - f[i - 1];
        if (prev !== 0 && d !== 0) {
            total++;
            if ((prev > 0) !== (d > 0)) flips++;
        }
        if (d !== 0) prev = d;
    }
    return total === 0 ? 0 : flips / total;
}
/* val 最小點之後最大回揚（U 形指標）：回傳 { epoch(1-based), rise }。
 * noiseRef：val 噪音強度（呼叫端傳 noiseLevel），用於排除毛刺型 U 形。 */
function uTurn(arr, noiseRef) {
    var f = finiteOnly(arr);
    if (f.length < 6) return { epoch: null, rise: 0 };
    var minI = 0;
    for (var i = 1; i < f.length; i++) if (f[i] < f[minI]) minI = i;
    /* 最小點在尾段 => 無「之後」可回揚 */
    if (minI >= f.length - 2) return { epoch: null, rise: 0 };
    /* 最小點太早（前 1/4）=> 下降主體未走完，後段皆高於它屬正常收斂，非 U 形 */
    if (minI < f.length / 4) return { epoch: null, rise: 0 };
    var after = f.slice(minI + 1);
    if (after.length === 0) return { epoch: null, rise: 0 };
    var maxV = Math.max.apply(null, after);
    var span = Math.max(0.001, Math.abs(f[minI]));
    /* 相對＋絕對雙門檻：深谷小回揚不算，淺谷需更大回揚 */
    var rise = maxV - f[minI];
    var rel = rise / span;
    if (rise < THRESH.uTurnRise && rel < 0.3) return { epoch: null, rise: 0 };
    /* 回揚後需「站穩」（最後值仍高於谷底＋七成幅），排除尾段單點毛刺。
     * 另排除「毛刺型 U 形」：回揚幅度須大於 val 噪音 x 3，否則只是噪音谷
     * （S6b 教訓：rise=0.13 但 vn=0.06，毛刺被當 U 形）。噪音由呼叫端傳入。 */
    var lastV = f[f.length - 1];
    if (lastV - f[minI] < rise * 0.7) return { epoch: null, rise: 0 };
    if (noiseRef && rise < noiseRef * 3) return { epoch: null, rise: 0 };
    return { epoch: minI + 1, rise: rise };
}
/* 後段全距（震盪幅度門用） */
function tailRange(arr) {
    var f = finiteOnly(arr);
    if (f.length < 6) return 0;
    var tail = f.slice(Math.floor(f.length / 2));
    return Math.max.apply(null, tail) - Math.min.apply(null, tail);
}

function classifyCurveFeatures(history, params) {
    var p = params ? normalizeParams(params) : null;
    var loss = history.loss || [], valLoss = history.val_loss || [];
    var acc = history.accuracy || [], valAcc = history.val_accuracy || [];
    var fLoss = finiteOnly(loss), fVal = finiteOnly(valLoss);

    /* S2：發散（任一非有限，或尾值爆炸） */
    var hasNonFinite = (fLoss.length < loss.length) || (fVal.length < valLoss.length);
    var tailMax = Math.max(meanTail(loss, 3), meanTail(valLoss, 3));
    var diverged = hasNonFinite || tailMax > THRESH.divergeLoss;

    /* 震盪：後段 train 變號率高「且」幅度夠大（小毛刺翻號不算） */
    var flip = signFlipRate(loss);
    var oscillating = !diverged && flip > THRESH.oscThreshold &&
        tailRange(loss) > THRESH.oscRangeMin;

    /* 噪音（先算，供 U 形毛刺排除用） */
    var tn = noiseLevel(loss), vn = noiseLevel(valLoss);

    /* U 形：val 最小後回揚（發散時不判；回揚須蓋過噪音） */
    var ut = diverged ? { epoch: null, rise: 0 } : uTurn(valLoss, vn);

    /* 終點缺口（loss 與 acc 雙視角） */
    var gapFinal = meanTail(valLoss, 3) - meanTail(loss, 3);
    var accGapFinal = meanTail(acc, 3) - meanTail(valAcc, 3);

    /* 尾段斜率（train loss） */
    var slope = endSlope(loss);

    /* S3：兩線平坦但還在緩降（欠擬合／訓練不足；發散與 SGD 慢案已先判）。
     * 斜率門＋總降幅門雙判：毛刺的斜率雖可為負，但後半總降小（S3c 反例教訓：
     * SNR 門概念錯誤——斜率是每輪變化、噪音是單點抖動，量級不可比，
     * 0.0138/0.072=0.19x 把所有真 S3 擋掉）。S8 互斥見 diagnose 的 s3present 門。 */
    var halfDrop = (function () {
        var f = finiteOnly(loss);
        if (f.length < 6) return 0;
        var h = Math.floor(f.length / 2);
        return meanTail(f.slice(0, h), 3) - meanTail(f.slice(h), 3);
    })();
    /* 三維門：斜率負＋總降幅夠＋降幅蓋過噪音（毛刺總降小，此門擋 NORMAL 緩降） */
    var underfit = !diverged && slope < THRESH.underfitSlope &&
        halfDrop > THRESH.underfitDropMin && halfDrop > tn * 3;

    return {
        diverged: diverged,
        oscillating: oscillating,
        signFlipRate: round2(flip),
        uTurnEpoch: ut.epoch,
        uTurnRise: round2(ut.rise),
        gapFinal: round2(gapFinal),
        accGapFinal: round2(accGapFinal),
        endSlope: round4(slope),
        trainNoise: round3(tn),
        valNoise: round3(vn),
        underfit: underfit
    };
}
function round2(x) { return isFinite(x) ? Math.round(x * 100) / 100 : x; }
function round3(x) { return isFinite(x) ? Math.round(x * 1000) / 1000 : x; }
function round4(x) { return isFinite(x) ? Math.round(x * 10000) / 10000 : x; }

/* ---------- 診斷建議（九症狀真值表 → 症狀 → 成因 → 處置） ---------- */
function diagnose(history, params) {
    var f = classifyCurveFeatures(history, params);
    var p = params ? normalizeParams(params) : normalizeParams({});
    var out = [];
    function push(code, symptom, cause, advice) {
        out.push({ code: code, symptom: symptom, cause: cause, advice: advice });
    }

    /* 優先序：發散 > 震盪 > U 形 > 缺口 > 噪音 > 收斂狀態 > 正則好事 */

    /* S2：loss 噴飛/NaN */
    if (f.diverged) {
        push('S2', 'loss 噴飛／出現 NaN（曲線斷裂）', '學習率 Learning Rate 極大',
            '大幅調降學習率（例如除以 10），再重新訓練');
    }
    /* S1：loss 震盪加劇不收斂（未發散但變號率高；小 LR 慢爬雖翻號率高但幅度小，
     * 已被 oscillating 的全距門擋下。此處再加 LR 門：LR <= 0.05 不判 S1，
     * 防 S3（小 LR）被翻號率誤傷） */
    else if (f.oscillating && p.learningRate > 0.05) {
        push('S1', 'loss 大幅震盪、無法收斂', '學習率 Learning Rate 偏大',
            '調降學習率（例如減半），觀察震盪是否收斂');
    }

    /* S4：train 降、val 中段回揚（U 形）。S1 震盪存在時抑制（大震盪的 val 谷
     * 是震盪副產物，不是過擬合；S1b 教訓：LR=0.2 的 uT=17 乃震盪所致）。 */
    var s1present = f.oscillating && p.learningRate > 0.05;
    /* S3 慢爬確認：還在緩降＋（跑夠久 or LR 極小）。
     * NORMAL（預設 20 輪、LR 0.001）在降屬健康早訓，不判；
     * 跑 50＋ 輪還在降＝LR 太小該調大，短輪數＋極小 LR＝學不動。
     * S8 互斥：S3 是「還在學」（斜率陡），S8 是「學完了但地板高」（斜率平）。 */
    var s3slow = f.underfit &&
        (p.epochs >= THRESH.s3EpochsMin || p.learningRate <= THRESH.s3LrMax);
    /* S3 判出時抑制 S8（同高地板僅斜率可分；S3c 教訓） */
    var s3present = s3slow && !(p.optimizer === 'sgd' && p.learningRate <= THRESH.s9LrMax);
    if (!f.diverged && !s1present && f.uTurnEpoch !== null) {
        push('S4', '訓練集下降、驗證集在第 ' + f.uTurnEpoch + ' 輪後回升（U 形）',
            '過擬合：模型記住訓練資料，驗證集表現變差',
            '開啟資料增強 Augmentation，或調高 Dropout');
    }
    /* S5：train acc 高、val acc 低（終點缺口大；無 U 形時仍可判） */
    if (!f.diverged && f.uTurnEpoch === null && f.accGapFinal > THRESH.accGap) {
        push('S5', '訓練準確率明顯高於驗證準確率（缺口約 ' + Math.round(f.accGapFinal * 100) + '%）',
            '過擬合：泛化能力不足',
            '開啟資料增強 Augmentation，或調高 Dropout，或增加訓練資料');
    }

    /* S6：val 毛刺極大（val 噪音主導）。雙判據：
     * ① 純曲線門（無參數時用，V2 出題只看曲線亦可判）；
     * ② 參數輔助門：驗證比已知過小＋val 噪音主導即判（S6g 教訓：
     *    vn=0.072 卡在純曲線門 0.08 之下，但 valSplit=0.1 已自白）。 */
    var s6curve = !f.diverged && f.valNoise > THRESH.valNoiseMin &&
            f.valNoise > f.trainNoise * THRESH.valNoiseRatio;
    var s6param = !f.diverged && p.validationSplit <= THRESH.s6ValSplitMax &&
            f.valNoise > THRESH.s6ValNoiseMin && f.valNoise > f.trainNoise;
    if (s6curve || s6param) {
        push('S6', '驗證曲線毛刺極大、趨勢難辨', '驗證集比例 Validation Split 太小，驗證樣本太少',
            '調高驗證集比例（例如 0.2 → 0.3），讓驗證曲線更穩定');
    }
    /* S1 存在時不判 S7（大震盪下 train 噪音必然大，S7 是震盪副產物；
     * S1b 教訓：LR=0.2 的 S7 乃震盪所致，處置應是降 LR 而非調 batch）。
     * S6 存在時不判 S7（val 抖已立案，train 抖多半同源）。 */
    var s6present = s6curve || s6param;
    if (!f.diverged && !s1present && !s6present &&
            f.trainNoise > THRESH.trainNoiseMin &&
            f.trainNoise > f.valNoise * THRESH.trainNoiseRatio) {
        push('S7', '訓練曲線毛刺大、驗證曲線相對平穩', '批次大小 Batch Size 太小，每步梯度方向不穩',
            '調大批次大小（例如 32 → 64 或 128）');
    }

    /* S9：SGD 收斂極慢。
     * 注意：小 LR 下 SGD 與 Adam 的曲線形狀幾乎無差異（皆慢爬），純曲線判準
     * 無法區分。故 S9 為「參數規則＋曲線確認」混合判：SGD＋小 LR＋未收斂
     * （終點準確率仍低）即判，不要求斜率平坦（慢爬亦算）。 */
    if (!f.diverged && p.optimizer === 'sgd' && p.learningRate <= THRESH.s9LrMax) {
        /* 終點準確率門檻：用 val_acc（有）或 acc（無 val 時退化） */
        var endAcc = meanTail((history.val_accuracy || []).length ?
            history.val_accuracy : history.accuracy || [], 3);
        if (endAcc < THRESH.s9AccMax) {
            push('S9', '收斂極慢、曲線近乎平坦', '優化器用 SGD 又配了很小的學習率',
                '換用 Adam，或把 SGD 的學習率調高（SGD 通常需要比 Adam 大 10 倍左右）');
        }
    }

    /* S3：兩線平坦但還在緩慢下降（欠擬合／訓練不足；SGD 慢案由 s3present 豁免，
     * 短輪數預設參數由投入門豁免——那是健康早訓） */
    if (s3present) {
        push('S3', '兩條曲線平坦、但仍在緩慢下降', '學習率過小或訓練輪數 Epochs 不足',
            '調高學習率或增加訓練輪數，讓模型有機會收斂');
    }

    /* S8：正則化生效（好事；需強正則前置＋train 被墊高＋兩線貼近＋無 U 形
     * ＋val 以收斂為主（斜率不陡；陡降代表還在學，不是「穩定貼近」）
     * ＋train 亦收斂（斜率平；S3c 教訓：小 LR 緩降＋高地板被誤判 S8）） */
    if (!f.diverged && f.uTurnEpoch === null && !s3present) {
        var regStrength = p.dropout + (p.augmentation ? 0.3 : 0);
        var trainEnd = meanTail(history.loss || [], 3);
        var valSlope = endSlope(history.val_loss || []);
        if (regStrength >= THRESH.s8RegMin && trainEnd > THRESH.s8FloorMin &&
                Math.abs(f.gapFinal) < THRESH.s8GapMax &&
                !(valSlope < -0.015) && !(f.endSlope < -0.015)) {
            push('S8', '訓練準確率變差、但兩條線貼得很近（這是好事）',
                '正則化（Dropout／資料增強）正在發揮作用：用訓練集表現換泛化能力',
                '教學重點：不要關掉它！可對比關閉正則的曲線，觀察驗證集是否反而變差');
        }
    }

    return out;
}

/* ---------- 匯出 ---------- */
var api = {
    VERSION: '1.0.0-v1',
    DEFAULTS: DEFAULTS,
    THRESH: THRESH,
    OPTIMIZER_SPEED: OPTIMIZER_SPEED,
    normalizeParams: normalizeParams,
    parseDnnLayers: parseDnnLayers,
    generateCurves: generateCurves,
    classifyCurveFeatures: classifyCurveFeatures,
    diagnose: diagnose
};
root.CocoyaSimEngine = api;
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }

})(typeof window !== 'undefined' ? window : globalThis);
