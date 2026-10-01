/**
 * ui_canvas.test.mjs — UICanvas 標註畫布呈現守門（2026-10-01 新增）
 *
 * 涵蓋三個曾被回歸的行為：
 *  1. 跨畫面十字尺規（bbox 模式，游標離開即收起）
 *  2. 標註文字放大 + 深色底板（原本 10px 無底板，高解析截圖上不可讀）
 *  3. labelMap 改名後必須重繪（syncLabelMap 原本只改 state 不 render）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UICanvas } from './ui_canvas.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** 記錄所有 2D 繪圖呼叫的假 ctx */
function makeFakeCtx() {
    const calls = [];
    const rec = (name) => (...args) => { calls.push({ name, args }); };
    return {
        calls,
        canvas: { width: 800, height: 600 },
        clearRect: rec('clearRect'), save: rec('save'), restore: rec('restore'),
        beginPath: rec('beginPath'), moveTo: rec('moveTo'), lineTo: rec('lineTo'),
        stroke: rec('stroke'), fill: rec('fill'), fillRect: rec('fillRect'),
        strokeRect: rec('strokeRect'), arc: rec('arc'), closePath: rec('closePath'),
        fillText: rec('fillText'), setLineDash: rec('setLineDash'),
        measureText: (t) => ({ width: t.length * 8 }),
        // 可被測試觀察的可變狀態
        font: '', fillStyle: '', strokeStyle: '', lineWidth: 0, textBaseline: ''
    };
}

function setupCanvas(mode = 'bbox') {
    const ctx = makeFakeCtx();
    Object.assign(UICanvas.state, {
        ctx, canvas: ctx.canvas, mode, annotations: [], currentBbox: null,
        selectedAnnotationIndex: -1, labelMap: {}, pointerX: null, pointerY: null
    });
    return ctx;
}

// ---------------------------------------------------------------------------
// 1. 跨畫面十字尺規
// ---------------------------------------------------------------------------

test('十字尺規：游標在畫布內時，繪製貫穿全寬與全高的兩條線', () => {
    const ctx = setupCanvas('bbox');
    UICanvas.state.pointerX = 320;
    UICanvas.state.pointerY = 240;
    UICanvas.render();

    const moves = ctx.calls.filter((c) => c.name === 'moveTo');
    const lines = ctx.calls.filter((c) => c.name === 'lineTo');
    assert.equal(moves.length, 2, '應有兩條尺規線（水平 + 垂直）');
    // 實作對整數座標 +0.5，讓 1px 線落在像素中心不糊邊（crisp line）
    assert.deepEqual(moves[0].args, [0, 240.5], '水平線從左邊界起');
    assert.deepEqual(lines[0].args, [ctx.canvas.width, 240.5], '水平線貫穿到右邊界');
    assert.deepEqual(moves[1].args, [320.5, 0], '垂直線從上邊界起');
    assert.deepEqual(lines[1].args, [320.5, ctx.canvas.height], '垂直線貫穿到下邊界');
});

test('十字尺規：游標離開畫布（null）時不繪製', () => {
    const ctx = setupCanvas('bbox');
    UICanvas.state.pointerX = null;
    UICanvas.state.pointerY = null;
    UICanvas.render();
    assert.equal(ctx.calls.filter((c) => c.name === 'setLineDash').length, 0,
        '無游標位置時不應呼叫 setLineDash');
});

test('十字尺規：line 模式不繪製（線段模式已有橡皮筋預覽）', () => {
    const ctx = setupCanvas('line');
    UICanvas.state.pointerX = 100;
    UICanvas.state.pointerY = 100;
    UICanvas.render();
    assert.equal(ctx.calls.filter((c) => c.name === 'setLineDash').length, 0,
        'line 模式不應繪製 bbox 尺規');
});

test('十字尺規：尺規疊在標註框之後（最後繪製，便於對齊邊界）', () => {
    const ctx = setupCanvas('bbox');
    UICanvas.state.pointerX = 100;
    UICanvas.state.pointerY = 100;
    UICanvas.state.annotations = [{ class_id: 0, bbox: [0.1, 0.1, 0.2, 0.2] }];
    UICanvas.render();
// ---------------------------------------------------------------------------
// 2. 標註文字放大 + 深色底板
// ---------------------------------------------------------------------------

test('標註文字：字體 >= 15px（原本 10px 在高解析截圖上不可讀）', () => {
    const ctx = setupCanvas('bbox');
    UICanvas.state.annotations = [{ class_id: 0, bbox: [0.1, 0.1, 0.2, 0.2] }];
    UICanvas.render();

    const textCalls = ctx.calls.filter((c) => c.name === 'fillText');
    assert.ok(textCalls.length >= 1, '應至少繪製一個標註文字');
    const size = parseInt(ctx.font.match(/(\d+)px/)[1], 10);
    assert.ok(size >= 15, `標註文字應 >= 15px，實際 ${size}px`);
});

test('標註文字：需有深色底板且先於文字繪製（任何背景都可讀）', () => {
    const ctx = setupCanvas('bbox');
    UICanvas.state.annotations = [{ class_id: 0, bbox: [0.1, 0.1, 0.2, 0.2] }];
    UICanvas.render();

    const names = ctx.calls.map((c) => c.name);
    assert.ok(names.indexOf('fillRect') < names.indexOf('fillText'),
        '底板必須先於文字繪製，否則文字會被蓋住');
});

test('標註文字：線段標註同樣放大（原為 bold 11px）', () => {
    const ctx = setupCanvas('line');
    UICanvas.state.annotations = [{ class_id: 0, line: [0.1, 0.1, 0.5, 0.5] }];
    UICanvas.render();
    const size = parseInt(ctx.font.match(/(\d+)px/)[1], 10);
    assert.ok(size >= 15, `線段標註文字應 >= 15px，實際 ${size}px`);
});

// ---------------------------------------------------------------------------
// 3. 改名後即時重繪（回歸鎖）
// ---------------------------------------------------------------------------

test('labelMap 改名後 render 立即使用新名稱（不需切換影像）', () => {
    const ctx = setupCanvas('bbox');
    UICanvas.state.labelMap = { cat: 0 };
    UICanvas.state.annotations = [{ class_id: 0, bbox: [0.1, 0.1, 0.2, 0.2] }];
    UICanvas.render();
    assert.deepEqual(ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]), ['cat']);

    // 模擬標籤管理器改名：更新 labelMap 後重繪（ui_layout::syncLabelMap 的行為）
    ctx.calls.length = 0;
    UICanvas.state.labelMap = { feline: 0 };
    UICanvas.render();
    assert.deepEqual(ctx.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]),
        ['feline'], '改名後必須立即顯示新名稱');
});

test('getAnnotationLabel：class_id -1 為 Unclassified；未知 id 回退 Obj N', () => {
    setupCanvas('bbox');
    UICanvas.state.labelMap = { cat: 3 };
    assert.equal(UICanvas.getAnnotationLabel(-1, 0), 'Unclassified');
    assert.equal(UICanvas.getAnnotationLabel(3, 0), 'cat');
// ---------------------------------------------------------------------------
// 4. 掃描型守門：syncLabelMap 必須重繪畫布
//    為何需要掃描而非行為測試：syncLabelMap 是 ui_layout.js 的內部函式（非 export），
//    行為測試只能「模擬」它的效果而無法真正驗證它有呼叫 render()。
//    實測證據：把 UICanvas.render() 移除後，所有既有測試仍全綠（10px 與尺規測試都抓不到）。
//    這正是「只驗綠燈無法區分有效守門與假安全感」的實例。
// ---------------------------------------------------------------------------

test('掃描守門：syncLabelMap 必須呼叫 UICanvas.render()（改名後即時重繪）', () => {
    const src = fs.readFileSync(path.join(here, 'ui_layout.js'), 'utf8');
    const start = src.indexOf('function syncLabelMap(');
    assert.notEqual(start, -1, '應能找到 syncLabelMap 函式');
    // 取函式本體（到下一個 "function " 或檔尾）
    const rest = src.slice(start);
    const next = rest.indexOf('\nfunction ', 1);
    const body = next > 0 ? rest.slice(0, next) : rest;

    assert.ok(/UICanvas\.state\.labelMap\s*=/.test(body), '應先同步 labelMap');
    assert.ok(/UICanvas\.render\(\)/.test(body),
        'syncLabelMap 必須呼叫 UICanvas.render()，否則標籤改名不會即時反映到畫布');
});

test('掃描守門自檢：拿掉 render() 的版本必須被判紅', () => {
    const src = fs.readFileSync(path.join(here, 'ui_layout.js'), 'utf8');
    const hasRender = (text) => {
        const start = text.indexOf('function syncLabelMap(');
        if (start < 0) return false;
        const rest = text.slice(start);
        const next = rest.indexOf('\nfunction ', 1);
        const body = next > 0 ? rest.slice(0, next) : rest;
        return /UICanvas\.render\(\)/.test(body);
    };
    assert.equal(hasRender(src), true, '現行實作應有 render()');
    const broken = src.replace(/^\s*UICanvas\.render\(\);/m, '');
    assert.equal(hasRender(broken), false, '守門必須能抓到拿掉 render() 的回歸');
});
    assert.equal(UICanvas.getAnnotationLabel(99, 2), 'Obj 2');
});

test('render：ctx 未初始化時 no-op（syncLabelMap 在畫布未建立時會呼叫）', () => {
    UICanvas.state.ctx = null;
    assert.doesNotThrow(() => UICanvas.render(),
        'syncLabelMap 無條件呼叫 render()，故 render 必須容忍 ctx 為 null');
});

    const names = ctx.calls.map((c) => c.name);
    const ruler = names.indexOf('setLineDash');
    assert.ok(ruler > names.lastIndexOf('strokeRect'), '尺規必須在標註框之後繪製');
});

test('十字尺規：unbindEvents 必須解綁 mouseleave（避免重複累積 handler）', () => {
    const removed = [];
    // unbindEvents 會觸及 window（mousemove/mouseup 掛在 window 上），Node 環境需 stub
    const hadWindow = typeof globalThis.window !== 'undefined';
    const fakeWindow = { removeEventListener: () => {} };
    if (!hadWindow) globalThis.window = fakeWindow;

    try {
        UICanvas.state.canvas = { removeEventListener: (type) => removed.push(type) };
        UICanvas.state.handlers = {
            mousedown: () => {}, mouseleave: () => {},
            mousemove: () => {}, mouseup: () => {}, keydown: () => {}
        };
        UICanvas.unbindEvents();
        assert.ok(removed.includes('mouseleave'), 'mouseleave 必須被解綁');
    } finally {
        if (!hadWindow) delete globalThis.window;
    }
});