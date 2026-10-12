/// Cocoya 序列繪圖 — 資料儲存（ring buffer）
/// 職責：保存各 series 的歷史資料點、提供時間窗切片、Y 軸範圍與下抽樣。
/// 位置：ui/src/modules/plot/plot-store.js
///
/// 這是**純資料結構**，不含任何 DOM 或 Tauri 相依，可直接單元測試。
///
/// # 為什麼需要 ring buffer
///
/// 序列埠可以在一秒內送出數百筆資料。若無上限，長時間執行會讓 webview
/// 記憶體無限成長，最後整個應用程式被拖慢甚至崩潰。Arduino IDE 的做法是
/// 只保留最近 N 筆 —— 這裡採同樣策略，並額外設一個更高的**硬上限**，
/// 確保即使使用者把視窗設到最大，記憶體仍有天花板。
///
/// # 為什麼下抽樣要用 min/max 對包絡而不是抽稀
///
/// 常見的「每 N 點取 1 點」抽稀會讓**尖峰直接消失**。對感測器資料來說，
/// 峰值往往正是使用者要找的東西（「剛才那一下尖峰是什麼？」）。
/// 因此這裡把每個像素欄位（bucket）拆成 min 與 max 兩點輸出：
/// 畫面縮小時仍能看見訊號的完整輪廓，峰值不會被藏起來。

var CocoyaPlotStore = (function() {
    'use strict';

    /// 每個 series 的預設容量（≈10 秒 @60Hz）。
    var DEFAULT_MAX_POINTS = 3600;

    /// 預設時間窗長度（3 秒 @ 60Hz）。
    ///
    /// 2026-09-28 由 600（10 秒）改為 200（3 秒）：
    /// 序列繪圖的資料速率通常只有每秒數筆到數十筆，10 秒視窗會讓
    /// 「上一輪」與「這一輪」擠在一起，看不出波形正在變化。
    /// 3 秒對齊 `WINDOW_CHOICES` 的最短選項，學習者一開啟就看到有意義的波形。
    var DEFAULT_WINDOW = 200;

    /// 可選的時間窗長度（3 / 10 / 30 秒 @60Hz）。
    var WINDOW_CHOICES = [200, 600, 1800];

    /// 沒有可見資料時的退化 Y 軸範圍。
    /// 用 0..1 而非 0..0：全零的範圍會讓 render 除以零而畫出 NaN 座標。
    var FALLBACK_RANGE = { min: 0, max: 1 };

    /// 建立一個儲存實例。
    ///
    /// `options.maxPoints` 覆寫容量（測試用小值觀察丟棄行為）。
    function createStore(options) {
        var settings = options || {};
        var maxPoints = normalizePositive(settings.maxPoints, DEFAULT_MAX_POINTS);
        var windowSize = DEFAULT_WINDOW;

        /// label → series。
        var seriesMap = {};
        /// 登錄順序（決定圖例順序與顏色），不可依賴物件鍵順序。
        var order = [];
        /// 累計樣本數。
        var sampleCount = 0;
        /// 不可解析而被丟棄的行數（診斷用：大量垃圾行代表格式不對）。
        var droppedLines = 0;

        function normalizePositive(value, fallback) {
            var number = Number(value);
            if (!isFinite(number) || number <= 0) return fallback;
            return Math.floor(number);
        }

        function findSeries(label) {
            return Object.prototype.hasOwnProperty.call(seriesMap, label)
                ? seriesMap[label]
                : null;
        }

        function ensureSeries(label) {
            var existing = findSeries(label);
            if (existing) return existing;
            var created = { label: label, points: [], visible: true };
            seriesMap[label] = created;
            order.push(label);
            return created;
        }

        /// 把單一欄位轉為可存放的數值。
        ///
        /// `null` 與 `NaN`／`Infinity` 都變成 `null`（斷線點）。
        /// **為什麼要擋掉非有限值**：一個 `NaN` 進入 ring buffer 後，
        /// Y 軸的 min/max 會變成 NaN，整張圖（含格線與座標軸）都會消失，
        /// 而且使用者沒有任何方法把它救回來。
        function normalizeValue(value) {
            if (value === null || value === undefined || value === '') return null;
            var number = typeof value === 'number' ? value : Number(value);
            if (!isFinite(number)) return null;
            return number;
        }

        /// 寫入一批資料點（同一時間軸的多個 series）。
        function push(points, timestamp) {
            if (!Array.isArray(points) || points.length === 0) return 0;
            var at = typeof timestamp === 'number' && isFinite(timestamp)
                ? timestamp
                : Date.now();
            var stored = 0;
            for (var i = 0; i < points.length; i += 1) {
                var point = points[i];
                if (!point || point.label === undefined || point.label === null) continue;
                var value = normalizeValue(point.value);
                // 全為 null 且尚未見過的 series 不建立 ——
                // 否則圖例會留下一個永遠沒資料的空項目。
                if (value === null && !findSeries(point.label)) continue;
                var series = ensureSeries(String(point.label));
                series.points.push({
                    t: at,
                    value: value,
                    index: point.index === undefined ? i : point.index
                });
                stored += 1;
            }
            if (stored === 0) {
                droppedLines += 1;
                return 0;
            }
            sampleCount += 1;
            trimAll();
            return stored;
        }

        /// 對每個 series 套用容量上限（ring buffer 的「丟最舊」步驟）。
        function trimAll() {
            for (var i = 0; i < order.length; i += 1) {
                var points = seriesMap[order[i]].points;
                if (points.length > maxPoints) {
                    points.splice(0, points.length - maxPoints);
                }
            }
        }

        /// 取某個 series 最近 `size` 筆的點。
        function tailPoints(label, size) {
            var series = findSeries(label);
            if (!series) return [];
            var limit = normalizePositive(size, windowSize);
            if (series.points.length <= limit) return series.points.slice();
            return series.points.slice(series.points.length - limit);
        }

        /// 決定 Y 軸範圍：涵蓋所有**可見** series，且下限包含 0。
        function computeRange(size) {
            var min = 0;
            var max = 0;
            var found = false;
            for (var i = 0; i < order.length; i += 1) {
                var series = seriesMap[order[i]];
                if (!series.visible) continue;
                var points = tailPoints(series.label, size);
                for (var j = 0; j < points.length; j += 1) {
                    var value = points[j].value;
                    // null 是斷線點，不參與範圍計算（否則會被當成 0 拉平曲線）。
                    if (value === null) continue;
                    if (value < min) min = value;
                    if (value > max) max = value;
                    found = true;
                }
            }
            if (!found) return { min: FALLBACK_RANGE.min, max: FALLBACK_RANGE.max };
            if (min === max) {
                // 全為同值（例如只有 0）時放寬一格，避免除以零。
                return { min: min, max: max + 1 };
            }
            return { min: min, max: max };
        }

        /// min/max 對包絡下抽樣。
        ///
        /// 每個 bucket 輸出「先 min 後 max」兩點，確保尖峰與谷底都留得住。
        /// 輸出點數因此最多是 `bucketCount * 2`。
        function downsample(points, pixelWidth) {
            var width = normalizePositive(pixelWidth, 0);
            if (width <= 0 || points.length <= width) {
                return { points: points, downsampled: false };
            }
            var bucketSize = points.length / width;
            var output = [];
            for (var b = 0; b < width; b += 1) {
                var start = Math.floor(b * bucketSize);
                var end = Math.min(
                    points.length,
                    Math.max(start + 1, Math.floor((b + 1) * bucketSize))
                );
                var minPoint = null;
                var maxPoint = null;
                var orphan = null;
                for (var i = start; i < end; i += 1) {
                    var point = points[i];
                    // 斷線點直接輸出為 null，並跳過 min/max 統計 ——
                    // 否則 null 會被當成 0 造成假的「掉到 0」軌跡。
                    if (point.value === null) {
                        if (!minPoint && !maxPoint && !orphan) orphan = point;
                        continue;
                    }
                    if (!minPoint || point.value < minPoint.value) minPoint = point;
                    if (!maxPoint || point.value > maxPoint.value) maxPoint = point;
                }
                if (minPoint) output.push(minPoint);
                if (maxPoint && maxPoint !== minPoint) output.push(maxPoint);
                if (orphan) output.push(orphan);
            }
            return { points: output, downsampled: true };
        }

        /// 取繪圖所需的完整切片。
        ///
        /// 對**所有可見** series 依同一時間軸對齊：以點數最多的可見 series
        /// 為基準，缺資料者補 `null`，避免長度不同的序列在
        /// 同一條 x 座標上互相錯位。
        function window(size, pixelWidth) {
            var limit = normalizePositive(size, windowSize);
            var visible = [];
            for (var i = 0; i < order.length; i += 1) {
                if (seriesMap[order[i]].visible) visible.push(seriesMap[order[i]]);
            }
            var range = computeRange(limit);
            if (visible.length === 0) {
                return {
                    points: [],
                    series: [],
                    range: { min: FALLBACK_RANGE.min, max: FALLBACK_RANGE.max },
                    downsampled: false,
                    sampleCount: sampleCount
                };
            }

            // 以**點數最多的可見 series** 作為時間軸基準：
            // 若用第一個 series 當基準而它比別人短，別人的資料會被截掉。
            var axis = [];
            for (var s = 0; s < visible.length; s += 1) {
                var candidate = tailPoints(visible[s].label, limit);
                if (candidate.length > axis.length) axis = candidate;
            }
            var axisTimes = axis.map(function(point) { return point.t; });

            var prepared = [];
            var longest = [];
            for (var k = 0; k < visible.length; k += 1) {
                var series = visible[k];
                var raw = tailPoints(series.label, limit);
                // 建立 t → point 的索引，讓對齊是 O(n) 而非 O(n²)。
                var byTime = {};
                for (var r = 0; r < raw.length; r += 1) byTime[raw[r].t] = raw[r];
                var aligned = axisTimes.map(function(time) {
                    var hit = byTime[time];
                    return hit
                        ? { t: time, value: hit.value, index: hit.index }
                        : { t: time, value: null };
                });
                var sampled = downsample(aligned, pixelWidth);
                prepared.push({
                    label: series.label,
                    visible: series.visible,
                    points: sampled.points,
                    downsampled: sampled.downsampled
                });
                if (sampled.points.length > longest.length) longest = sampled.points;
            }

            return {
                // `points` 取最長的那條，方便呼叫端快速取得時間軸長度。
                points: longest,
                series: prepared,
                range: range,
                downsampled: prepared.some(function(entry) { return entry.downsampled; }),
                sampleCount: sampleCount
            };
        }

        function seriesList() {
            return order.map(function(label) {
                var series = seriesMap[label];
                return {
                    label: series.label,
                    visible: series.visible,
                    points: series.points.slice()
                };
            });
        }

        /// 切換某個 series 的顯示狀態（點圖例時呼叫）。
        function toggleVisible(label) {
            var series = findSeries(String(label));
            if (!series) return false;
            series.visible = !series.visible;
            return series.visible;
        }

        function setVisible(label, value) {
            var series = findSeries(String(label));
            if (!series) return false;
            series.visible = Boolean(value);
            return series.visible;
        }

        function setWindow(size) {
            var number = normalizePositive(size, 0);
            // 無效值退回預設，不可讓視窗變成 NaN 或 0。
            windowSize = number || DEFAULT_WINDOW;
            return windowSize;
        }

        function clear() {
            seriesMap = {};
            order = [];
            sampleCount = 0;
            droppedLines = 0;
        }

        function getState() {
            return {
                seriesCount: order.length,
                sampleCount: sampleCount,
                droppedLines: droppedLines,
                windowSize: windowSize,
                maxPoints: maxPoints
            };
        }

        return {
            push: push,
            seriesList: seriesList,
            window: window,
            clear: clear,
            reset: clear,
            toggleVisible: toggleVisible,
            setVisible: setVisible,
            setWindow: setWindow,
            getState: getState
        };
    }

    return {
        createStore: createStore,
        DEFAULT_MAX_POINTS: DEFAULT_MAX_POINTS,
        DEFAULT_WINDOW: DEFAULT_WINDOW,
        WINDOW_CHOICES: WINDOW_CHOICES
    };
})();

if (typeof window !== 'undefined') {
    window.CocoyaPlotStore = CocoyaPlotStore;
}
