/// Cocoya 序列繪圖 — 資料解析器
/// 職責：把序列埠送來的**文字行**轉成繪圖用的資料點。
/// 位置：ui/src/modules/plot/plot-parse.js
///
/// 這是**純函式**，不含任何 DOM 或 Tauri 相依，可直接單元測試。
///
/// # 支援的格式（對齊 Arduino IDE 慣例）
///
/// | 輸入            | 解析結果                          |
/// |-----------------|-----------------------------------|
/// | `23.5`          | 純數值，沿用上一個標籤              |
/// | `temp:23.5`     | `label:value`，決定 series 名稱     |
/// | `23.5, 40.2`    | CSV，序號為標籤 `1` `2`            |
/// | `23.5\t40.2`    | TSV，同上                          |
/// | `on` / `off`    | 布林 → 1 / 0                       |
/// | `LED 已開啟`    | 垃圾行 → **忽略**（不回傳任何點）    |
///
/// # 為什麼垃圾行必須安靜忽略
///
/// 序列監看器**同時**承載 `Serial.println("LED 已開啟")` 這類文字輸出。
/// 使用者不會為了畫圖而先把程式改成只印數字 —— 文字與數值混在同一條流上
/// 是必然的。因此 parser 的首要責任是「**看不懂的就跳過**」，
/// 而不是拋例外或畫出一條 y=NaN 的線把整張圖毀掉。
///
/// # 混合行的取捨
///
/// `23.5, 開啟了, 40.2` 這種行：**只要有一欄有效就保留整行**，
/// 無效欄位以 `null` 表示（渲染時斷線）。理由是若整行丟棄，
/// 使用者會看到曲線莫名少了一段，卻完全不知道原因。

var CocoyaPlotParse = (function() {
    'use strict';

    /// 布林關鍵字 → 數值。Arduino 常見輸出（`on` / `off`）也支援。
    var BOOLEAN_VALUES = {
        'on': 1, 'true': 1, 'high': 1, '1': 1,
        'off': 0, 'false': 0, 'low': 0, '0': 0
    };

    /// 數值格式：允許前導正負號、`.5`、`5.`、以及指數。
    ///
    /// 刻意**不用** `Number()` 直接轉：`Number('')` 是 0、`Number('  ')` 是 0、
    /// `Number('0x10')` 是 16 —— 這些都會把垃圾輸入偽裝成真實資料。
    var NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

    /// 判斷字串是否為可用的數值。
    function toNumber(raw) {
        var text = String(raw === undefined || raw === null ? '' : raw).trim();
        if (text === '') return null;
        if (!NUMBER_PATTERN.test(text)) return null;
        var value = Number(text);
        // 有限性檢查：`1e999` 會得到 Infinity，必須擋掉否則 Y 軸會被拉爆。
        return isFinite(value) ? value : null;
    }

    /// 解析單一欄位（已去除空白）。
    ///
    /// 回傳 `{label, value}`；`label` 為 null 表示這欄沒有自己的名稱
    /// （呼叫端需依位置或上一個標籤補上），`value` 為 null 表示不可解析。
    function parseField(field) {
        // 以**最後一個**冒號切分：`a:b:3.5` 的標籤應該是 `a:b`，
        // 因為冒號在時間戳之類的標籤名稱裡比在數值裡更常見。
        var colon = field.lastIndexOf(':');
        if (colon > 0) {
            var label = field.slice(0, colon).trim();
            var value = toNumber(field.slice(colon + 1));
            if (label !== '' && value !== null) {
                return { label: label, value: value };
            }
            // 有冒號但右邊不是數字（例如 `時間:12:30`）→ 整欄視為垃圾。
            return { label: null, value: null };
        }
        var plain = toNumber(field);
        if (plain !== null) return { label: null, value: plain };
        var keyword = BOOLEAN_VALUES[field.toLowerCase()];
        if (keyword !== undefined) return { label: null, value: keyword };
        return { label: null, value: null };
    }

    /// 建立一個有狀態的 parser（需記住「上一個標籤」）。
    ///
    /// 為什麼要有狀態：Arduino IDE 的純數值語法（`Serial.print(x)`）
    /// 本身不含名稱，只能靠「沿用上一次出現的標籤」才畫得出有意義的圖例。
    function createParser() {
        /// 上一次解析出的標籤；null 代表尚未見過任何標籤。
        var lastLabel = null;

        function parseLine(line) {
            if (typeof line !== 'string') return [];
            var text = line.trim();
            if (text === '') return [];

            // 分隔符：tab 優先（Arduino IDE 的慣例），其次逗號、分號。
            // 空格**不**作為分隔符 —— `Serial.print(x, " ")` 會印出
            // `23.5 40.2`，但拆開它會讓 `a b` 這類標籤永遠無法成立。
            var fields;
            if (text.indexOf('\t') !== -1) {
                fields = text.split('\t');
            } else if (text.indexOf(',') !== -1) {
                fields = text.split(',');
            } else if (text.indexOf(';') !== -1) {
                fields = text.split(';');
            } else {
                fields = [text];
            }

            var points = [];
            var usable = 0;
            for (var i = 0; i < fields.length; i += 1) {
                var parsed = parseField(fields[i].trim());
                if (parsed.value !== null) usable += 1;
                points.push({ label: parsed.label, value: parsed.value, index: i });
            }
            // 整行都看不懂 → 回傳空陣列。**這是垃圾行的判定點。**
            if (usable === 0) return [];

            // 補標籤：具名者用自己的名字；無名者用序號（多欄）或上一個標籤（單欄）。
            var named = false;
            for (var j = 0; j < points.length; j += 1) {
                if (points[j].label) {
                    named = true;
                    break;
                }
            }
            for (var k = 0; k < points.length; k += 1) {
                if (points[k].label) {
                    lastLabel = points[k].label;
                } else if (!named && points.length === 1 && lastLabel) {
                    points[k].label = lastLabel;
                } else {
                    points[k].label = String(k + 1);
                }
            }
            return points;
        }

        function reset() {
            // 重置是必要的：不清掉會讓**上一次連線**的 series 名稱污染新連線。
            lastLabel = null;
        }

        return { parseLine: parseLine, reset: reset };
    }

    /// 無狀態的單次解析（供不需要跨行記憶的呼叫端使用）。
    function parseLine(line) {
        return createParser().parseLine(line);
    }

    return {
        createParser: createParser,
        parseLine: parseLine,
        BOOLEAN_VALUES: BOOLEAN_VALUES,
        NUMBER_PATTERN: NUMBER_PATTERN
    };
})();

if (typeof window !== 'undefined') {
    window.CocoyaPlotParse = CocoyaPlotParse;
}
