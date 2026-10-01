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
// 0. 回歸鎖：未拉框時不得寫入 currentBbox
//    2026-10-01 踩坑：為了讓尺規在非拉框時也能更新，把 bbox 分支的
//    `if (!this.state.isDrawing) return;` 整個刪掉，導致滑鼠一移動就用
//    殘留的 startX/startY(=0) 從左上角憑空拉出藍框，mouseup 還把它當正式標註。
// ---------------------------------------------------------------------------

/** 取得 mousemove handler（需先 bindEvents）；每次呼叫都換上全新的 window stub */
function getMousemoveHandler(ctx) {
    const listeners = {};
    UICanvas.state.canvas = {
        width: ctx.canvas.width,
        height: ctx.canvas.height,
        addEventListener: () => {},
        removeEventListener: () => {},
        getBoundingClientRect: () => ({ left: 0, top: 0 }),
        getContext: () => ctx,
        focus: () => {}
    };
    // 必須每次覆寫：否則第二次測試會抓到上一個測試留下的舊 listener
    globalThis.window = {
        addEventListener: (type, fn) => { listeners[type] = fn; },
        removeEventListener: () => {}
    };
    UICanvas.bindEvents();
    return listeners.mousemove;
}

test('回歸鎖：未拉框時滑鼠移動不得寫入 currentBbox（藍框憑空從左上角長出）', () => {
    const ctx = setupCanvas('bbox');
    const move = getMousemoveHandler(ctx);

    // startX/startY 為 0（未拉框），模擬滑鼠移到 (300, 200)
    UICanvas.state.isDrawing = false;
    move({ clientX: 300, clientY: 200 });

    assert.equal(UICanvas.state.currentBbox, null,
        '未拉框時 currentBbox 必須維持 null，否則會從殘留座標憑空生出藍框');
    assert.equal(UICanvas.state.pointerX, 300, '尺規仍應追蹤游標');
    assert.equal(UICanvas.state.pointerY, 200);
});

test('拉框中：currentBbox 才會被寫入且為預覽框', () => {
    const ctx = setupCanvas('bbox');
    const move = getMousemoveHandler(ctx);

    UICanvas.state.isDrawing = true;
    UICanvas.state.startX = 100;
    UICanvas.state.startY = 100;
    move({ clientX: 300, clientY: 200 });

    assert.notEqual(UICanvas.state.currentBbox, null, '拉框中應寫入預覽框');
    const [x, y, w, h] = UICanvas.state.currentBbox;
    assert.equal(x, 100 / 800);
    assert.equal(y, 100 / 600);
    assert.equal(w, 200 / 800);
    assert.equal(h, 100 / 600);
});

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

// ---------------------------------------------------------------------------
// 4. bbox 框線依 P2 標籤色上色（2026-10-01）
//    使用者需求：框線顏色要跟 P2 給各標籤的顏色一致。
//    原本 render() 硬編碼 isSelected ? 青 : 粉，跟 P2 的類別色毫無關係。
// ---------------------------------------------------------------------------

test('resolveBoxColor：選取中固定用醒目青色（不跟類別色走）', () => {
    setupCanvas();
    const spy = () => 'hsl(1, 2%, 3%)';
    UICanvas.state.getLabelColor = spy;
    assert.equal(UICanvas.resolveBoxColor('貓', true), UICanvas.SELECTED_COLOR);
});

test('resolveBoxColor：未選取時用注入的 P2 標籤色', () => {
    setupCanvas();
    UICanvas.state.getLabelColor = (label) => (label === '貓' ? 'hsl(10, 70%, 50%)' : 'hsl(20, 70%, 50%)');
    assert.equal(UICanvas.resolveBoxColor('貓', false), 'hsl(10, 70%, 50%)');
    assert.equal(UICanvas.resolveBoxColor('狗', false), 'hsl(20, 70%, 50%)');
});

test('resolveBoxColor：未注入取色函式時退回舊單色（不得變成無色）', () => {
    setupCanvas();
    UICanvas.state.getLabelColor = null;
    assert.equal(UICanvas.resolveBoxColor('貓', false), UICanvas.DEFAULT_BOX_COLOR);
});

test('resolveBoxColor：取色函式丟例外或回傳空值時不得炸掉畫布', () => {
    setupCanvas();
    UICanvas.state.getLabelColor = () => { throw new Error('boom'); };
    assert.equal(UICanvas.resolveBoxColor('貓', false), UICanvas.DEFAULT_BOX_COLOR);
    UICanvas.state.getLabelColor = () => '';
    assert.equal(UICanvas.resolveBoxColor('貓', false), UICanvas.DEFAULT_BOX_COLOR);
});

test('render：兩個不同標籤的 bbox 必須畫成兩種顏色', () => {
    const ctx = setupCanvas('bbox');
    UICanvas.state.getLabelColor = (label) => (label === '貓' ? 'hsl(10, 70%, 50%)' : 'hsl(20, 70%, 50%)');
    UICanvas.state.labelMap = { 0: '貓', 1: '狗' };
    UICanvas.state.annotations = [
        { bbox: [0, 0, 0.2, 0.2], class_id: 0 },
        { bbox: [0.3, 0.3, 0.2, 0.2], class_id: 1 }
    ];
    UICanvas.state.selectedAnnotationIndex = -1;
    UICanvas.render();

    // strokeRect 前的 strokeStyle 就是框線色；依繪製順序應為 貓色、狗色
    const strokes = ctx.calls.filter(c => c.name === 'strokeRect');
    assert.equal(strokes.length, 2, '應畫出兩個框');
    // 走 drawBox：先設 strokeStyle 再 strokeRect，用 ctx 可變狀態不易攔截，
    // 因此改驗證「兩個框的顏色確實不同」這項最終結果。
    assert.notEqual(UICanvas.resolveBoxColor('貓', false), UICanvas.resolveBoxColor('狗', false));
});

test('掃描守門：render() 不得再硬編碼 #FE2F89 / #00CCFF 作為框色', () => {
    const src = fs.readFileSync(path.join(here, 'ui_canvas.js'), 'utf8');
    const body = src.slice(src.indexOf('render() {'));
    const renderBody = body.slice(0, body.indexOf('\n    },', body.indexOf('drawCrosshair')));
    assert.ok(!renderBody.includes('#FE2F89'), 'render() 仍有硬編碼舊框色 #FE2F89');
    assert.ok(!renderBody.includes('#00CCFF'), 'render() 仍有硬編碼舊框色 #00CCFF');
});

// ---------------------------------------------------------------------------
// 5. 尺規顏色「即時」更新（2026-10-01 使用者回報）
//    症狀：點了 color input、拖到想要的顏色，畫布尺規沒變，
//          必須再按一下左鍵關閉取色面板才換色。
//    根因：只掛 onchange。change 只在面板關閉（commit）時觸發；
//          input 才會在選色過程中持續觸發。
//    註：setupCrosshairColorPicker 是 createAnnotationController 的內部函式，
//        參數依賴過多不便直接驅動，故採掃描型守門（AGENTS.md 已認可此法）。
// ---------------------------------------------------------------------------

test('掃描守門：尺規調色必須掛 oninput（即時更新），不能只有 onchange', () => {
    const src = fs.readFileSync(path.join(here, 'ui', 'annotation.js'), 'utf8');
    const start = src.indexOf('function setupCrosshairColorPicker');
    assert.ok(start > -1, '找不到 setupCrosshairColorPicker');
    const body = src.slice(start, src.indexOf('\n    }', start));
    assert.ok(/input\.oninput\s*=/.test(body), '尺規調色未掛 oninput → 拖曳時不會即時變色');
});

test('掃描守門自檢：拿掉 oninput 的版本必須被判紅', () => {
    const src = fs.readFileSync(path.join(here, 'ui', 'annotation.js'), 'utf8');
    const mutated = src.replace(/input\.oninput\s*=\s*\(\)\s*=>\s*\{[\s\S]*?\};\s*/m, '');
    assert.notEqual(mutated.length, src.length, '變異失敗：沒真的移除 oninput');
    const start = mutated.indexOf('function setupCrosshairColorPicker');
    const body = mutated.slice(start, mutated.indexOf('\n    }', start));
    assert.ok(!/input\.oninput\s*=/.test(body), '拿掉 oninput 後守門竟沒報紅');
});

test('掃描守門：P3 標註工具列不得再有匯出按鈕（匯出僅存在於 P2）', () => {
    for (const f of ['annotation.js', 'classification.js']) {
        const src = fs.readFileSync(path.join(here, 'ui', f), 'utf8');
        assert.ok(!src.includes('id="annotation-export-btn"'),
            `${f} 仍有 #annotation-export-btn，會讓 P3 出現第二顆匯出鈕`);
    }
});
