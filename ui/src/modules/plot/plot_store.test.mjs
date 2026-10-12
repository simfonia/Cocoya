import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

/**
 * plot-store.js - 純資料結構測試（Plotter 移植 階段 D）
 *
 * 與 plot_parse.test.mjs 同樣用 vm 在當前 realm 載入（跨 realm 會讓
 * deepStrictEqual 因原型不同而拒收，見該檔 loadParse 註解）。
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const moduleDir = here;

function loadStore() {
    const previous = globalThis.window;
    globalThis.window = {};
    try {
        vm.runInThisContext(fs.readFileSync(path.join(moduleDir, 'plot-store.js'), 'utf8'));
        return globalThis.window.CocoyaPlotStore;
    } finally {
        if (previous === undefined) delete globalThis.window;
        else globalThis.window = previous;
    }
}

const storeModule = loadStore();

test('模組掛載與常數', () => {
    assert.ok(storeModule, '應掛載於 window.CocoyaPlotStore');
    assert.equal(typeof storeModule.createStore, 'function');
    assert.ok(storeModule.DEFAULT_MAX_POINTS > 0);
    assert.ok(storeModule.DEFAULT_WINDOW > 0);
    // 預設視窗必須是選項之一，否則頁面一載入 select 顯示的就不是任何有效值
    assert.ok(storeModule.WINDOW_CHOICES.includes(storeModule.DEFAULT_WINDOW),
        'DEFAULT_WINDOW 必須在 WINDOW_CHOICES 內');
});

test('push：多 series 同時寫入，回傳實際存入筆數', () => {
    const store = storeModule.createStore();
    const stored = store.push([
        { label: 'temp', value: 23.5, index: 0 },
        { label: 'hum', value: 60, index: 1 }
    ], 1000);
    assert.equal(stored, 2);
    assert.equal(store.getState().seriesCount, 2);
    // sampleCount 數的是**行數**（push 呼叫次數）而非點數：
    // 一批兩點是「同一時刻的兩個 series」，只算一次取樣。
    // 這也讓 UI 上的樣本數對應 MCU 的 print 次數，與使用者心智模型一致。
    assert.equal(store.getState().sampleCount, 1);
});

test('push：缺 label 的點被跳過（不產生無名 series）', () => {
    const store = storeModule.createStore();
    const stored = store.push([
        { label: null, value: 23.5, index: 0 },
        { label: 'temp', value: 24.5, index: 1 }
    ], 1000);
    assert.equal(stored, 1);
    assert.equal(store.getState().seriesCount, 1);
});

test('push：非有限值變成 null（斷線點），不得污染 Y 軸', () => {
    // 一個 NaN 進入 ring buffer 會讓 Y 軸 min/max 變 NaN，
    // 整張圖（含格線與座標軸）都會消失，且使用者無法救回來。
    const store = storeModule.createStore();
    store.push([{ label: 'temp', value: 10, index: 0 }], 1000);
    store.push([{ label: 'temp', value: NaN, index: 0 }], 2000);
    store.push([{ label: 'temp', value: Infinity, index: 0 }], 3000);
    store.push([{ label: 'temp', value: 20, index: 0 }], 4000);

    const series = store.seriesList();
    assert.equal(series.length, 1);
    assert.equal(series[0].points.length, 4);
    assert.equal(series[0].points[1].value, null, 'NaN 必須變 null');
    assert.equal(series[0].points[2].value, null, 'Infinity 必須變 null');
});

test('ring buffer：超過容量丟棄最舊的點', () => {
    const store = storeModule.createStore({ maxPoints: 3 });
    for (let i = 1; i <= 5; i += 1) {
        store.push([{ label: 'x', value: i, index: 0 }], i * 1000);
    }
    const points = store.seriesList()[0].points;
    assert.equal(points.length, 3, '必須維持在容量上限');
    assert.deepEqual(points.map((p) => p.value), [3, 4, 5], '保留最新的三筆');
});

test('push：空陣列／非陣列回傳 0（不建 series）', () => {
    const store = storeModule.createStore();
    assert.equal(store.push([], 1000), 0);
    assert.equal(store.push(null, 1000), 0);
    assert.equal(store.push(undefined, 1000), 0);
    assert.equal(store.getState().seriesCount, 0);
});

test('push：未給 timestamp 時用 Date.now()', () => {
    const store = storeModule.createStore();
    const before = Date.now();
    store.push([{ label: 'x', value: 1, index: 0 }]);
    const at = store.seriesList()[0].points[0].t;
    assert.ok(at >= before, '時間戳不可早於呼叫前');
});

test('seriesList 依登錄順序（不可依賴物件鍵順序）', () => {
    const store = storeModule.createStore();
    // 刻意用會擾亂鍵序的名稱（純數字鍵在物件裡會被重新排序）
    store.push([{ label: '2', value: 1, index: 0 }], 1000);
    store.push([{ label: '1', value: 2, index: 0 }], 2000);
    store.push([{ label: 'alpha', value: 3, index: 0 }], 3000);
    assert.deepEqual(store.seriesList().map((s) => s.label), ['2', '1', 'alpha']);
});

test('toggleVisible / setVisible 切換顯示狀態', () => {
    const store = storeModule.createStore();
    store.push([{ label: 'temp', value: 1, index: 0 }], 1000);
    assert.equal(store.toggleVisible('temp'), false, '預設可見 → 切後為 false');
    assert.equal(store.toggleVisible('temp'), true);
    assert.equal(store.setVisible('temp', false), false);
    assert.equal(store.setVisible('temp', true), true);
    assert.equal(store.toggleVisible('不存在'), false, '未註冊 label 回 false');
});

test('window：隱藏的 series 不出現在切片中', () => {
    const store = storeModule.createStore();
    store.push([{ label: 'a', value: 1, index: 0 }, { label: 'b', value: 2, index: 0 }], 1000);
    store.setVisible('b', false);
    const slice = store.window(storeModule.DEFAULT_WINDOW, 500);
    assert.deepEqual(slice.series.map((s) => s.label), ['a']);
});

test('window：全部隱藏時回傳退化範圍 0..1（不可 0..0）', () => {
    // 全零範圍會讓 render 除以零而畫出 NaN 座標。
    const store = storeModule.createStore();
    store.push([{ label: 'a', value: 1, index: 0 }], 1000);
    store.setVisible('a', false);
    const slice = store.window(storeModule.DEFAULT_WINDOW, 500);
    assert.deepEqual(slice.series, []);
    assert.deepEqual(slice.range, { min: 0, max: 1 });
    assert.deepEqual(slice.points, []);
});

test('range：無資料時用 FALLBACK_RANGE', () => {
    const store = storeModule.createStore();
    const slice = store.window(storeModule.DEFAULT_WINDOW, 500);
    assert.deepEqual(slice.range, { min: 0, max: 1 });
});

test('range：全為同值時放寬一格（避免除以零）', () => {
    const store = storeModule.createStore();
    for (let i = 1; i <= 3; i += 1) store.push([{ label: 'a', value: 0, index: 0 }], i * 1000);
    const slice = store.window(storeModule.DEFAULT_WINDOW, 500);
    assert.deepEqual(slice.range, { min: 0, max: 1 });
});

test('range：下限恆含 0，斷線點不參與計算', () => {
    const store = storeModule.createStore();
    store.push([{ label: 'a', value: 10, index: 0 }], 1000);
    store.push([{ label: 'a', value: null, index: 0 }], 2000);
    store.push([{ label: 'a', value: 20, index: 0 }], 3000);
    const slice = store.window(storeModule.DEFAULT_WINDOW, 500);
    // **下限刻意包含 0**（computeRange 的 min 初始為 0 且只單向擴張）：
    // 感測資料的 0 通常是物理基準（距離 0cm、亮度 0），把 0 排除會讓
    // 使用者誤判訊號的絕對大小。斷線點（null）不參與計算，否則會被當成 0。
    assert.deepEqual(slice.range, { min: 0, max: 20 });

    // 反向驗證：負值同樣能把下限拉下去（不是只會 clamp 到 0）
    store.push([{ label: 'a', value: -5, index: 0 }], 4000);
    const negative = store.window(storeModule.DEFAULT_WINDOW, 500);
    assert.deepEqual(negative.range, { min: -5, max: 20 });
});

test('下抽樣：min/max 對包絡保住尖峰（抽稀會讓峰值消失）', () => {
    const store = storeModule.createStore();
    // 一個尖峰夾在平原裡：若「每 N 點取 1 點」會整顆漏掉。
    for (let i = 1; i <= 40; i += 1) {
        const value = i === 20 ? 1000 : i;
        store.push([{ label: 'a', value: value, index: 0 }], i * 1000);
    }
    // pixelWidth=5 遠小於點數 40 → 必定觸發下抽樣
    const slice = store.window(storeModule.DEFAULT_WINDOW, 5);
    assert.equal(slice.downsampled, true);
    const values = slice.series[0].points.map((p) => p.value).filter((v) => v !== null);
    assert.ok(values.includes(1000), '尖峰必須保留下來');
});

test('下抽樣：點數未超過像素寬度時不動資料', () => {
    const store = storeModule.createStore();
    store.push([{ label: 'a', value: 1, index: 0 }], 1000);
    store.push([{ label: 'a', value: 2, index: 0 }], 2000);
    const slice = store.window(storeModule.DEFAULT_WINDOW, 500);
    assert.equal(slice.downsampled, false);
    assert.equal(slice.series[0].points.length, 2);
});

test('window：整格全為斷線點時保留一個 null（不被當成 0）', () => {
    const store = storeModule.createStore();
    for (let i = 1; i <= 20; i += 1) {
        store.push([{ label: 'a', value: i === 10 ? null : i, index: 0 }], i * 1000);
    }
    // width=20 讓每格剛好 1 點 → 第 10 格整格都是 null（orphan 路徑）
    const slice = store.window(storeModule.DEFAULT_WINDOW, 20);
    assert.ok(slice.series[0].points.some((p) => p.value === null),
        '整格斷線必須保留一個 null 供 renderer 斷線');

    // 混合格（有數值也有 null）只輸出 min/max：null 不補點。
    // 這是**已知行為**：斷線只保證「整格沒資料」時才留痕跡，
    // 一格內的短暫缺樣會被壓掉 —— 尖峰與整體輪廓優先（見 downsample 註解）。
    const mixed = store.window(storeModule.DEFAULT_WINDOW, 4);
    assert.equal(mixed.series[0].points.every((p) => p.value !== null), true,
        '混合格不輸出 null（只保留 min/max 包絡）');
});

test('window：長度不同的 series 依同一時間軸對齊（缺資料補 null）', () => {
    const store = storeModule.createStore();
    store.push([{ label: 'a', value: 1, index: 0 }], 1000);
    store.push([{ label: 'a', value: 2, index: 0 }], 2000);
    store.push([{ label: 'b', value: 9, index: 0 }], 2000); // b 只有一筆

    const slice = store.window(storeModule.DEFAULT_WINDOW, 500);
    // 軸基準是點數最多的可見 series（a，兩筆）
    const a = slice.series.find((s) => s.label === 'a');
    const b = slice.series.find((s) => s.label === 'b');
    assert.equal(a.points.length, 2);
    assert.equal(b.points.length, 2, 'b 必須對齊到同一時間軸長度');
    assert.equal(b.points[0].value, null, 'b 在 t=1000 無資料 → null');
    assert.equal(b.points[1].value, 9);
});

test('setWindow：有效值生效，無效值退回預設', () => {
    const store = storeModule.createStore();
    assert.equal(store.setWindow(storeModule.WINDOW_CHOICES[1]), storeModule.WINDOW_CHOICES[1]);
    // 不可讓視窗變成 NaN 或 0
    assert.equal(store.setWindow(0), storeModule.DEFAULT_WINDOW);
    assert.equal(store.setWindow(-5), storeModule.DEFAULT_WINDOW);
    assert.equal(store.setWindow('abc'), storeModule.DEFAULT_WINDOW);
    assert.equal(store.setWindow(undefined), storeModule.DEFAULT_WINDOW);
});

test('clear：清空 series、計數與丟棄行數', () => {
    const store = storeModule.createStore();
    store.push([{ label: 'a', value: 1, index: 0 }], 1000);
    store.setWindow(storeModule.WINDOW_CHOICES[2]);
    store.clear();
    const state = store.getState();
    assert.equal(state.seriesCount, 0);
    assert.equal(state.sampleCount, 0);
    assert.equal(state.droppedLines, 0);
    // clear 不可重置使用者選的時間窗（那是偏好，不是資料）
    assert.equal(state.windowSize, storeModule.WINDOW_CHOICES[2]);
});

test('getState：回傳診斷所需的全部計數', () => {
    const store = storeModule.createStore({ maxPoints: 5 });
    const state = store.getState();
    assert.equal(state.seriesCount, 0);
    assert.equal(state.sampleCount, 0);
    assert.equal(state.droppedLines, 0);
    assert.equal(state.windowSize, storeModule.DEFAULT_WINDOW);
    assert.equal(state.maxPoints, 5);
});
