import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

/**
 * plot-parse.js — 純函式測試（Plotter 移植 階段 D）
 *
 * 為何用 vm 而非 import：來源是 `<script>` 全域掛載（IIFE + window 指派），
 * 不是 ESM。vm 載入可保證測的就是**實際會被瀏覽器執行的同一份原始碼**，
 * 而不是某個重新包裝的版本（改成 import 會讓守門與實際載入路徑分叉）。
 */
const here = path.dirname(fileURLToPath(import.meta.url));
// 本測試與被測來源同目錄（modules/plot/）—— 故意不用 '..'：
// 那會指到 modules/ 而取不到檔案，且 ENOENT 訊息看起來像「檔案不存在」，
// 很容易誤判成「階段 A 搬移失敗」而重搬一次。
const moduleDir = here;

function loadParse() {
    // **必須在當前 realm 執行**（`runInThisContext`），不可用 `runInNewContext`：
    // 後者回傳的陣列／RegExp 屬於另一個 realm，原型不同 ——
    // `assert.deepStrictEqual` 會以 "Values have same structure but are not
    // reference-equal" 拒收，讓**正確的實作看起來全部失敗**。
    // 這裡只在載入期間掛上 `window`（來源檔用它做全域掛載），結束後還原。
    const previous = globalThis.window;
    globalThis.window = {};
    try {
        vm.runInThisContext(fs.readFileSync(path.join(moduleDir, 'plot-parse.js'), 'utf8'));
        return globalThis.window.CocoyaPlotParse;
    } finally {
        if (previous === undefined) delete globalThis.window;
        else globalThis.window = previous;
    }
}

const parse = loadParse();

test('模組掛載：window.CocoyaPlotParse 存在且具備對外 API', () => {
    assert.ok(parse, '應掛載於 window.CocoyaPlotParse');
    assert.equal(typeof parse.createParser, 'function');
    assert.equal(typeof parse.parseLine, 'function');
    assert.equal(typeof parse.BOOLEAN_VALUES, 'object');
    assert.ok(parse.NUMBER_PATTERN instanceof RegExp, 'NUMBER_PATTERN 應為 RegExp');
});

test('純數值：沿用上一個標籤', () => {
    const parser = parse.createParser();
    const first = parser.parseLine('temp:23.5');
    assert.deepEqual(first, [{ label: 'temp', value: 23.5, index: 0 }]);

    // 純數值不帶名稱 → 沿用上一次的 label（Arduino `Serial.print(x)` 慣例）
    const second = parser.parseLine('40.2');
    assert.deepEqual(second, [{ label: 'temp', value: 40.2, index: 0 }]);
});

test('label:value：以最後一個冒號切分', () => {
    const points = parse.parseLine('room:sensor:3.5');
    assert.equal(points.length, 1);
    assert.equal(points[0].label, 'room:sensor');
    assert.equal(points[0].value, 3.5);
});

test('CSV / TSV：無名欄位以序號當標籤', () => {
    const csv = parse.parseLine('23.5, 40.2');
    assert.deepEqual(csv, [
        { label: '1', value: 23.5, index: 0 },
        { label: '2', value: 40.2, index: 1 }
    ]);

    const tsv = parse.parseLine('23.5\t40.2');
    assert.equal(tsv.length, 2);
    assert.equal(tsv[1].label, '2');
});

test('混合命名／無名：具名者用自己的名字', () => {
    const points = parse.parseLine('temp:23.5, 40.2');
    assert.equal(points[0].label, 'temp');
    // 同一行已有具名欄位 → 無名欄位改用序號（不可套用「沿用上一個」的單欄規則）
    assert.equal(points[1].label, '2');
});

test('垃圾行安靜忽略：不回傳任何點（不拋例外）', () => {
    // 這是移植計畫 §1 明列「必須保留」的設計決策：序列監看器同時承載
    // `Serial.println("LED 已開啟")`，parser 首要責任是看不懂就跳過。
    assert.deepEqual(parse.parseLine('LED 已開啟'), []);
    assert.deepEqual(parse.parseLine(''), []);
    assert.deepEqual(parse.parseLine('   '), []);
    assert.deepEqual(parse.parseLine('OK'), []);
    assert.deepEqual(parse.parseLine(undefined), []);
    assert.deepEqual(parse.parseLine(null), []);
    assert.deepEqual(parse.parseLine(42), []);
});

test('冒號右邊不是數字 → 該欄視為垃圾', () => {
    // 原始碼註解舉的例子（`時間:12:30`）其實**不會**走到這條分支：
    // 它以「最後一個」冒號切分，右邊的 `30` 是有效數字，
    // 結果是 label='時間:12'、value=30 —— 這是設計上的合理行為
    // （冒號在時間戳類標籤裡比在數值裡更常見），故回傳一個點。
    // 真正觸發「整欄垃圾」的是右邊無法解析的情形。
    assert.equal(parse.parseLine('時間:12:30')[0].value, 30);

    assert.deepEqual(parse.parseLine('溫度:沒有資料'), []);
    assert.deepEqual(parse.parseLine('a:'), []);
});

test('混合行：只要有一欄有效就保留整行，無效欄位為 null', () => {
    // 若整行丟棄，使用者會看到曲線莫名少一段卻完全不知道原因。
    const points = parse.parseLine('23.5, 開啟了, 40.2');
    assert.equal(points.length, 3);
    assert.equal(points[0].value, 23.5);
    assert.equal(points[1].value, null, '無效欄位必須是 null（渲染時斷線）');
    assert.equal(points[2].value, 40.2);
});

test('布林關鍵字 → 1 / 0', () => {
    assert.equal(parse.parseLine('on')[0].value, 1);
    assert.equal(parse.parseLine('off')[0].value, 0);
    assert.equal(parse.parseLine('HIGH')[0].value, 1);
    assert.equal(parse.parseLine('true')[0].value, 1);
    assert.equal(parse.parseLine('false')[0].value, 0);
});

test('數值格式邊界：.5 / 5. / 指數皆可，偽裝成數值的垃圾不可', () => {
    assert.equal(parse.parseLine('.5')[0].value, 0.5);
    assert.equal(parse.parseLine('5.')[0].value, 5);
    assert.equal(parse.parseLine('-1.5e2')[0].value, -150);

    // 刻意不用 Number()：`Number('')`=0、`Number('  ')`=0、`Number('0x10')`=16
    // 這些都會把垃圾輸入偽裝成真實資料。
    assert.deepEqual(parse.parseLine('0x10'), [], '十六進位不可被當成 16');
    assert.deepEqual(parse.parseLine('Infinity'), []);
    assert.deepEqual(parse.parseLine('NaN'), []);
});

test('1e999 得到 Infinity → 必須擋掉（否則 Y 軸被拉爆）', () => {
    assert.deepEqual(parse.parseLine('1e999'), []);
});

test('reset：跨連線的標籤記憶必須清掉', () => {
    const parser = parse.createParser();
    parser.parseLine('temp:23.5');
    parser.reset();
    // reset 後純數值無標籤可沿用 → 退回序號
    const points = parser.parseLine('40.2');
    assert.equal(points[0].label, '1', 'reset 後不得沿用舊連線的 series 名稱');
});

test('無狀態 parseLine 不跨行記憶', () => {
    parse.parseLine('temp:23.5');
    const points = parse.parseLine('40.2');
    assert.equal(points[0].label, '1');
});

test('空格不是分隔符（`a b` 這類標籤必須能成立）', () => {
    const points = parse.parseLine('room temp:23.5');
    assert.equal(points.length, 1);
    assert.equal(points[0].label, 'room temp');
});

test('分號亦可當分隔符', () => {
    const points = parse.parseLine('23.5;40.2');
    assert.equal(points.length, 2);
});

// ---------------------------------------------------------------------------
// 契約守門（掃描型）
// ---------------------------------------------------------------------------

test('契約：載入順序與命名空間', () => {
    const html = fs.readFileSync(path.resolve(moduleDir, '../../../index.html'), 'utf8');
    const order = ['plot-parse.js', 'plot-store.js', 'plot-render.js', 'plot-panel.js']
        .map((name) => html.indexOf(`src/modules/plot/${name}`));
    assert.ok(order.every((idx) => idx !== -1),
        'index.html 必須載入全部 4 個 plot 檔案');
    // plot-panel 透過 window 讀取前三者，順序反了會取不到
    // （ensureCore 回 false → 繪圖按鈕按了完全沒反應，且無任何錯誤訊息）。
    for (let i = 1; i < order.length; i += 1) {
        assert.ok(order[i - 1] < order[i],
            `${['plot-parse.js', 'plot-store.js', 'plot-render.js', 'plot-panel.js'][i]} 必須晚於前一個載入`);
    }

    // 判據是**識別字層級的殘留**，不是「字串出現過 CodeBridge」：
    // 註解裡記錄來源專案（provenance）是有價值的，不該為了綠燈抹掉。
    // 真正會壞的是 `CodeBridgePlot*` 命名空間（ensureCore 取不到模組）
    // 與 `window.CodeBridge*` 全域參考（Cocoya 沒有那些物件 → 執行期 TypeError）。
    const sources = ['plot-parse.js', 'plot-store.js', 'plot-render.js', 'plot-panel.js'];
    for (const name of sources) {
        const src = fs.readFileSync(path.join(moduleDir, name), 'utf8');
        assert.ok(!src.includes('CodeBridgePlot'),
            `${name} 不得殘留 CodeBridgePlot 命名空間`);
        assert.ok(!src.includes('window.CodeBridge'),
            `${name} 不得參考 window.CodeBridge*（Cocoya 無此全域）`);
        assert.ok(src.includes('CocoyaPlot'),
            `${name} 必須使用 CocoyaPlot 命名空間`);
    }
});

// ---------------------------------------------------------------------------
// 開關按鈕 icon 契約（2026-10-11 追加：改用 wave-sine.png icon-only）
// ---------------------------------------------------------------------------

test('開關按鈕必須是 icon-only（內含 img，不可被 syncControls 清空）', () => {
    const html = fs.readFileSync(path.resolve(moduleDir, '../../../index.html'), 'utf8');
    // 取出 #btn-plotter 的開標籤內容（到第一個 > 為止）
    const start = html.indexOf('id="btn-plotter"');
    assert.notEqual(start, -1, 'index.html 必須有 #btn-plotter');
    const tagEnd = html.indexOf('>', start);
    // 判據是「佔位符不得出現在**子節點內容**裡」，不是「開標籤不得出現」：
    // title="%{BKY_...}" 是 icon-only 按鈕的正確用法（applyI18n 會填成 tooltip），
    // 只有把 %{BKY_} 寫在 >...< 之間才會殘留成按鈕上看得到的字。
    const children = html.slice(tagEnd, html.indexOf('</button>', tagEnd));
    assert.ok(!children.includes('%{BKY_'),
        '按鈕子節點不得有 %{BKY_} 佔位符（會殘留成按鈕上的字）；title 用佔位符是合法的');
    // 緊接著必須是 <img>（icon-only 的依據）
    // tagEnd 指向開標籤結尾的 >，故子節點要從 tagEnd + 1 起算
    // （含著 > 會讓 /^\s*<img/ 永遠不匹配，而那不是實作的錯）。
    const after = html.slice(tagEnd + 1, tagEnd + 201);
    assert.match(after, /^\s*<img\s/, '按鈕內第一個子節點必須是 <img>');
    assert.ok(after.includes('wave-sine.png'), '必須使用 wave-sine.png 圖示');
});

test('syncControls 不得寫 btn-plotter 的 textContent（會摧毀 img）', () => {
    const src = fs.readFileSync(path.join(moduleDir, 'plot-panel.js'), 'utf8');
    const fnStart = src.indexOf('function syncControls()');
    assert.notEqual(fnStart, -1, '應有 syncControls()');
    const body = src.slice(fnStart, src.indexOf('\n    }', fnStart));
    // 取 btn-plotter 那一段（到 pauseButton 之前）
    const toggleBlock = body.slice(body.indexOf('byId(\'btn-plotter\')'),
        body.indexOf('byId(\'btn-plot-pause\')'));
    // **必須先剝除行內註解**：說明「為什麼不可寫 textContent」的註解本身就含該字串，
    // 不剝就會被自己的文件觸發假紅（第一版即如此）。
    const code = toggleBlock.replace(/\/\/.*$/gm, '');
    assert.ok(!code.includes('textContent'),
        'btn-plotter 區段不得寫 textContent —— 該鈕是 icon-only，寫了會摧毀 <img> 且無任何錯誤訊息');
    assert.ok(toggleBlock.includes('is-active'), '狀態仍須由 .is-active class 表達');
    assert.ok(toggleBlock.includes('aria-pressed'), '狀態仍須由 aria-pressed 表達（螢幕閱讀器）');
});
