/// Cocoya 序列繪圖 — Canvas 繪圖器
/// 職責：把 plot-store 的切片畫到 canvas 上（格線、座標軸、折線、單點）。
/// 位置：ui/src/modules/plot/plot-render.js
///
/// # 為什麼自繪而不引入圖表函式庫
///
/// 需求只有「一張折線圖」，引入 Chart.js 會帶進約 200KB 的相依，
/// 而本專案的規範是「零新增 dependency」。自繪的成本約 250 行，
/// 卻能完全控制效能細節（見下）與配色一致性。
///
/// # 效能：為什麼用 rAF 合併重繪
///
/// 序列埠最高可達數百 Hz。每次資料事件都重畫會讓主執行緒被 canvas
/// 填補操作塞滿，導致 Blockly 工作區操作變得卡頓。因此呼叫端以
/// `requestAnimationFrame` 合併，本模組只負責「畫得對、畫得快」。
///
/// # 為什麼要自己處理 devicePixelRatio
///
/// 高 DPI 螢幕上，canvas 的後備緩衝若不放大，線條會呈現明顯鋸齒。
/// 標準做法是把 `canvas.width/height` 乘上 DPR，再用 `setTransform`
/// 把繪圖座標系縮回 CSS 像素 —— 這樣所有繪圖邏輯仍用邏輯座標寫。

var CocoyaPlotRender = (function() {
    'use strict';

    /// Series 配色序。
    ///
    /// 挑選原則：在終端機深色底（`#1e1e1e`）上都要有足夠對比，
    /// 且相鄰兩色在色覺異常下仍可區分（明度交錯排列）。
    var SERIES_COLORS = [
        '#35c7d4', // 青
        '#ff8a8a', // 桃紅
        '#ffcb6b', // 琥珀
        '#7ddc7d', // 綠
        '#c792ea', // 紫
        '#82aaff'  // 藍
    ];

    /// 繪圖區四周留白（CSS px）。下方留比較多是為了放 Y 軸刻度文字。
    var PADDING = { top: 8, right: 10, bottom: 20, left: 44 };

    /// 格線數量（Y 方向）。
    var GRID_LINES = 4;

    /// 讀取裝置像素比。
    ///
    /// **刻意不命名為 `devicePixelRatio`**：同名函式在此 IIFE 內會因
    /// 函式宣告提升而**遮蔽同一個名稱的全域值**，`typeof devicePixelRatio`
    /// 永遠拿到函式本身（不是 number），於是比例恆為 1 ——
    /// 高 DPI 螢幕上線條會糊掉，而症狀極難從畫面回推成因。
    /// 改用 `globalThis` 明確取值，並容許測試注入。
    function readPixelRatio() {
        var host = (typeof globalThis !== 'undefined' && globalThis) || null;
        var value = host ? host.devicePixelRatio : undefined;
        if (typeof value !== 'number' || !(value > 0)) return 1;
        return value;
    }

    /// 刻度文字格式化：數字過大或過小時用科學記號，避免文字重疊。
    function formatTick(value) {
        if (!isFinite(value)) return '0';
        if (value === 0) return '0';
        var magnitude = Math.abs(value);
        if (magnitude >= 10000 || magnitude < 0.01) return value.toExponential(1);
        if (magnitude >= 100) return value.toFixed(0);
        if (magnitude >= 10) return value.toFixed(1);
        return value.toFixed(2);
    }

    /// 建立一個綁定到 canvas 的繪圖器。
    function createRenderer(canvas) {
        var context = canvas && canvas.getContext ? canvas.getContext('2d') : null;
        var ratio = readPixelRatio();
        /// 邏輯（CSS px）尺寸。
        var size = { width: 0, height: 0 };
        /// label → 顏色，確保同一個 series 的顏色跨重繪穩定。
        var colorMap = {};
        var colorCursor = 0;
        var destroyed = false;

        /// 量測並同步後備緩衝尺寸。
        function resize() {
            if (!canvas) return size;
            var rect = canvas.getBoundingClientRect
                ? canvas.getBoundingClientRect()
                : { width: canvas.width, height: canvas.height };
            var width = Number(rect.width) || 0;
            var height = Number(rect.height) || 0;
            if (width <= 0 || height <= 0) {
                // 面板還沒被撐開（display:none）時量到 0 是正常的。
                // 直接返回而不是寫入 0，避免下一幀的判斷基準被污染。
                return size;
            }
            size = { width: width, height: height };
            canvas.width = Math.round(width * ratio);
            canvas.height = Math.round(height * ratio);
            if (context) {
                context.setTransform(ratio, 0, 0, ratio, 0, 0);
            }
            return size;
        }

        /// 依登錄順序取得顏色。
        function colorFor(label) {
            var key = String(label);
            if (!colorMap[key]) {
                colorMap[key] = SERIES_COLORS[colorCursor % SERIES_COLORS.length];
                colorCursor += 1;
            }
            return colorMap[key];
        }

        function clear() {
            if (!context) return;
            context.clearRect(0, 0, size.width, size.height);
        }

        /// 繪製背景、格線與 Y 軸刻度。
        function drawGrid(range) {
            var plotWidth = size.width - PADDING.left - PADDING.right;
            var plotHeight = size.height - PADDING.top - PADDING.bottom;
            if (plotWidth <= 0 || plotHeight <= 0) return;

            context.strokeStyle = 'rgba(255, 255, 255, 0.10)';
            context.fillStyle = '#b8b8b8';
            context.font = '10px Consolas, Monaco, monospace';
            context.textAlign = 'right';
            context.textBaseline = 'middle';

            var span = range.max - range.min;
            if (!isFinite(span) || span <= 0) span = 1;
            for (var i = 0; i <= GRID_LINES; i += 1) {
                var y = PADDING.top + (plotHeight * i) / GRID_LINES;
                context.beginPath();
                context.moveTo(PADDING.left, y);
                context.lineTo(PADDING.left + plotWidth, y);
                // 格線固定 1px；折線用更粗的線寬（測試據此區分兩者）。
                context.lineWidth = 1;
                context.stroke();
                context.fillText(
                    formatTick(range.max - (span * i) / GRID_LINES),
                    PADDING.left - 6,
                    y
                );
            }
        }

        /// 繪製單一 series 的折線。
        ///
        /// **斷線處理是本函式的重點**：`null` 代表該時刻沒有資料。
        /// 若直接連線會畫出一條掉到 y=0 的 V 字形，讓使用者誤以為
        /// 感測器真的歸零了。因此遇到 null 就 `moveTo` 重新起筆。
        function drawSeries(series, range) {
            var points = Array.isArray(series.points) ? series.points : [];
            if (points.length === 0) return;

            var plotWidth = size.width - PADDING.left - PADDING.right;
            var plotHeight = size.height - PADDING.top - PADDING.bottom;
            var span = range.max - range.min;
            if (!isFinite(span) || span <= 0) span = 1;

            // x 座標依**索引**平均分配，而非時間戳差值。
            // 序列埠的取樣間隔並不均勻（有時 loop 慢一輪），
            // 用時間戳會讓慢速區段被壓扁成看不出變化的一小段。
            var stepX = points.length > 1 ? plotWidth / (points.length - 1) : 0;
            var color = colorFor(series.label);

            function yOf(value) {
                var ratio = (value - range.min) / span;
                if (!isFinite(ratio)) return PADDING.top + plotHeight / 2;
                // 夾在繪圖區內：超出時夾住，避免畫到框外。
                if (ratio < 0) ratio = 0;
                if (ratio > 1) ratio = 1;
                return PADDING.top + plotHeight * (1 - ratio);
            }

            context.strokeStyle = color;
            context.lineWidth = 1.6;
            context.lineJoin = 'round';

            // 單點：沒有線段可畫，用一個圓點表示「確實有收到資料」。
            if (points.length === 1 && points[0].value !== null) {
                context.fillStyle = color;
                context.beginPath();
                context.arc(PADDING.left, yOf(points[0].value), 2.5, 0, Math.PI * 2);
                context.fill();
                return;
            }

            var penDown = false;
            context.beginPath();
            for (var i = 0; i < points.length; i += 1) {
                var point = points[i];
                if (!point || point.value === null) {
                    // 斷線：收起筆，下次從新的一點重新開始。
                    penDown = false;
                    continue;
                }
                var x = PADDING.left + stepX * i;
                var y = yOf(point.value);
                if (penDown) {
                    context.lineTo(x, y);
                } else {
                    context.moveTo(x, y);
                    penDown = true;
                }
            }
            if (penDown) context.stroke();
        }

        /// 繪製整張圖。
        function draw(slice) {
            if (destroyed || !context) return false;
            var view = slice || {};
            var range = view.range && isFinite(view.range.min) && isFinite(view.range.max)
                ? view.range
                : { min: 0, max: 1 };
            // 尺寸尚未量到（面板收合中）就跳過，寧可這幀不畫，
            // 也不要畫出一張 0×0 的圖把狀態弄髒。
            if (size.width <= 0 || size.height <= 0) resize();
            if (size.width <= 0 || size.height <= 0) return false;

            context.clearRect(0, 0, size.width, size.height);
            drawGrid(range);

            var series = Array.isArray(view.series) ? view.series : [];
            for (var i = 0; i < series.length; i += 1) {
                if (series[i].visible === false) continue;
                drawSeries(series[i], range);
            }
            return true;
        }

        function destroy() {
            destroyed = true;
            colorMap = {};
            colorCursor = 0;
        }

        return {
            draw: draw,
            resize: resize,
            clear: clear,
            colorFor: colorFor,
            destroy: destroy,
            getSize: function() { return { width: size.width, height: size.height }; }
        };
    }

    return {
        createRenderer: createRenderer,
        SERIES_COLORS: SERIES_COLORS,
        PADDING: PADDING
    };
})();

if (typeof window !== 'undefined') {
    window.CocoyaPlotRender = CocoyaPlotRender;
}
