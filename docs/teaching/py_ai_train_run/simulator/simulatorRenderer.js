/**
 * simulatorRenderer.js -- 訓練模擬器 canvas 繪圖（V1）
 *
 * 視覺契約（對齊 resources/train_templates/common/training_report.py::plot_training_curves）：
 *   上 Loss 下 Accuracy，共享 X 軸（Epoch 從 1 起算）；訓練藍實線／驗證紅實線、線寬 2；
 *   粗體置中標題 `{名稱} - Training Curves`；淡格線（alpha 0.3 感）；白底卡片；軸自動縮放。
 * 刻意差異：圖例固定左上（報告用 loc='best' 自動；教學一致性優先，見計畫 §2.3）。
 *
 * 傳統 script（非 ESM）：掛 globalThis.CocoyaSimRenderer。無依賴（純 canvas 2D），
 * DPR 高清＋resize 由呼叫端（simulator.html）觸發重繪。NaN 斷裂（S2）以斷線呈現。
 */
(function (root) {
'use strict';

var COLOR_TRAIN = '#1f77b4';  /* 訓練藍（對齊報告 'b-'） */
var COLOR_VAL = '#d62728';    /* 驗證紅（對齊報告 'r-'） */
var LINE_WIDTH = 2;
var GRID_COLOR = 'rgba(0,0,0,0.12)';  /* 淡格線（alpha 0.3 視覺感；canvas 上取 0.12 等效） */
var BG_CARD = '#ffffff';
var AXIS_COLOR = '#333333';
var FONT = '12px -apple-system, "Segoe UI", Roboto, sans-serif';
var TITLE_FONT = 'bold 14px -apple-system, "Segoe UI", Roboto, sans-serif';

/* 版面：左右留軸標籤，上下留標題/X 軸；兩面板等高 */
function layout(w, h) {
    var padL = 52, padR = 12, padT = 34, padB = 26, gapMid = 30;
    var plotW = Math.max(50, w - padL - padR);
    var plotH = Math.max(40, (h - padT - padB - gapMid) / 2);
    return {
        padL: padL, padR: padR, padT: padT, padB: padB, gapMid: gapMid,
        plotW: plotW, plotH: plotH,
        top: { x: padL, y: padT, w: plotW, h: plotH },
        bot: { x: padL, y: padT + plotH + gapMid, w: plotW, h: plotH }
    };
}

/* 序列極值（略 NaN；空則回預設域） */
function finiteExtent(seriesList, fallback) {
    var lo = Infinity, hi = -Infinity;
    for (var s = 0; s < seriesList.length; s++) {
        var a = seriesList[s];
        for (var i = 0; i < a.length; i++) {
            var v = a[i];
            if (!isFinite(v)) continue;
            if (v < lo) lo = v;
            if (v > hi) hi = v;
        }
    }
    if (!isFinite(lo) || !isFinite(hi)) return fallback.slice();
    if (hi - lo < 1e-9) { lo -= 0.5; hi += 0.5; }
    /* 留 8% 邊距 */
    var pad = (hi - lo) * 0.08;
    return [lo - pad, hi + pad];
}

/* 刻度（至多 5 檔，nice 化） */
function ticks(lo, hi, maxN) {
    maxN = maxN || 5;
    var span = hi - lo;
    if (!(span > 0)) return [lo];
    var raw = span / maxN;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var step = (norm >= 5) ? 10 * mag : (norm >= 2) ? 5 * mag : (norm >= 1) ? 2 * mag : mag;
    var out = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-12; v += step) {
        out.push(Math.round(v * 1e9) / 1e9);
    }
    /* 含 0 端點：下限為正時補 0（loss 從高處降下，0 基線有教學意義） */
    if (out.length && out[0] > 0 && lo <= 0.001) out.unshift(0);
    return out.length ? out : [lo];
}

function fmtTick(v) {
    if (Math.abs(v) >= 100) return String(Math.round(v));
    if (Math.abs(v) >= 10) return String(Math.round(v * 10) / 10);
    return String(Math.round(v * 100) / 100);
}

function drawPanel(ctx, box, yLabel, yExt, n, xTicks) {
    var i, v, px, py;
    /* 格線＋Y 刻度 */
    ctx.strokeStyle = GRID_COLOR;
    ctx.fillStyle = AXIS_COLOR;
    ctx.font = FONT;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 1;
    var yt = ticks(yExt[0], yExt[1], 5);
    for (i = 0; i < yt.length; i++) {
        v = yt[i];
        py = box.y + box.h - ((v - yExt[0]) / (yExt[1] - yExt[0])) * box.h;
        ctx.beginPath();
        ctx.moveTo(box.x, py);
        ctx.lineTo(box.x + box.w, py);
        ctx.stroke();
        ctx.fillText(fmtTick(v), box.x - 6, py);
    }
    /* X 格線（字只在下方面板畫，上方只畫線） */
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (i = 0; i < xTicks.length; i++) {
        var ep = xTicks[i];
        px = box.x + ((ep - 1) / Math.max(1, n - 1)) * box.w;
        ctx.beginPath();
        ctx.moveTo(px, box.y);
        ctx.lineTo(px, box.y + box.h);
        ctx.stroke();
    }
    /* 框 */
    ctx.strokeStyle = '#bbbbbb';
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    /* Y 軸標籤（旋轉） */
    ctx.save();
    ctx.translate(14, box.y + box.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
}

function drawSeries(ctx, box, yExt, data, color) {
    var n = data.length;
    if (n === 0) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    var pen = false;
    for (var i = 0; i < n; i++) {
        var v = data[i];
        if (!isFinite(v)) { pen = false; continue; }  /* NaN 斷裂（S2 發散） */
        var px = box.x + ((i) / Math.max(1, n - 1)) * box.w;
        var py = box.y + box.h - ((v - yExt[0]) / (yExt[1] - yExt[0])) * box.h;
        if (!pen) { ctx.moveTo(px, py); pen = true; }
        else ctx.lineTo(px, py);
    }
    ctx.stroke();
}

/**
 * 繪製雙面板。
 * @param {HTMLCanvasElement} canvas
 * @param {{loss:number[],val_loss:number[],accuracy:number[],val_accuracy:number[]}} history
 * @param {string} projectName 標題用（預設 'Training'）
 */
function render(canvas, history, projectName) {
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    var cssW = canvas.clientWidth || canvas.width;
    var cssH = canvas.clientHeight || canvas.height;
    if (cssW < 50 || cssH < 50) return;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    /* 白底卡片 */
    ctx.fillStyle = BG_CARD;
    ctx.fillRect(0, 0, cssW, cssH);

    var name = projectName || 'Training';
    var n = Math.max(
        (history.loss || []).length,
        (history.val_loss || []).length,
        1
    );
    var L = layout(cssW, cssH);

    /* 標題（粗體置中） */
    ctx.fillStyle = AXIS_COLOR;
    ctx.font = TITLE_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(name + ' - Training Curves', cssW / 2, 8);

    var lossExt = finiteExtent([history.loss || [], history.val_loss || []], [0, 1]);
    var accExt = finiteExtent([history.accuracy || [], history.val_accuracy || []], [0, 1]);
    /* Accuracy 鎖 0~1（映射定義域；loss 不鎖） */
    accExt[0] = Math.min(accExt[0], 0);
    accExt[1] = Math.max(accExt[1], 1);

    /* X 刻度：Epoch 從 1 起算，至多 6 檔 */
    var xStep = Math.max(1, Math.ceil(n / 6));
    var xTicks = [];
    for (var e = 1; e <= n; e += xStep) xTicks.push(e);
    if (xTicks[xTicks.length - 1] !== n) xTicks.push(n);

    drawPanel(ctx, L.top, 'Loss', lossExt, n, xTicks);
    drawSeries(ctx, L.top, lossExt, history.loss || [], COLOR_TRAIN);
    drawSeries(ctx, L.top, lossExt, history.val_loss || [], COLOR_VAL);

    drawPanel(ctx, L.bot, 'Accuracy', accExt, n, xTicks);
    drawSeries(ctx, L.bot, accExt, history.accuracy || [], COLOR_TRAIN);
    drawSeries(ctx, L.bot, accExt, history.val_accuracy || [], COLOR_VAL);

    /* X 軸字（僅下方） */
    ctx.fillStyle = AXIS_COLOR;
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (var xi = 0; xi < xTicks.length; xi++) {
        var qx = L.bot.x + ((xTicks[xi] - 1) / Math.max(1, n - 1)) * L.bot.w;
        ctx.fillText(String(xTicks[xi]), qx, L.bot.y + L.bot.h + 4);
    }
    ctx.fillText('Epoch', L.bot.x + L.bot.w / 2, L.bot.y + L.bot.h + 18);

    /* 圖例（固定左上，刻意異於報告 loc='best'） */
    var lx = L.top.x + 8, ly = L.top.y + 6;
    ctx.font = FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    function legendItem(y, color, label) {
        ctx.strokeStyle = color;
        ctx.lineWidth = LINE_WIDTH;
        ctx.beginPath();
        ctx.moveTo(lx, y);
        ctx.lineTo(lx + 22, y);
        ctx.stroke();
        ctx.fillStyle = AXIS_COLOR;
        ctx.fillText(label, lx + 27, y);
    }
    legendItem(ly, COLOR_TRAIN, 'Training');
    legendItem(ly + 16, COLOR_VAL, 'Validation');
}

var api = {
    VERSION: '1.0.0-v1',
    COLORS: { train: COLOR_TRAIN, val: COLOR_VAL, lineWidth: LINE_WIDTH },
    render: render,
    /* 測試用純函式（無 canvas 可測） */
    _finiteExtent: finiteExtent,
    _ticks: ticks,
    _layout: layout
};
root.CocoyaSimRenderer = api;
if (typeof module !== 'undefined' && module.exports) { module.exports = api; }

})(typeof window !== 'undefined' ? window : globalThis);
