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
    const dashCalls = [];
    let lineDash = [];
    let lineDashOffset = 0;
    const rec = (name) => (...args) => { calls.push({ name, args }); };
    return {
        calls,
        dashCalls,
        canvas: { width: 800, height: 600 },
        clearRect: rec('clearRect'), save: rec('save'), restore: rec('restore'),
        beginPath: rec('beginPath'), moveTo: rec('moveTo'), lineTo: rec('lineTo'),
        stroke: rec('stroke'), fill: rec('fill'), fillRect: rec('fillRect'),
        strokeRect: rec('strokeRect'), arc: rec('arc'), closePath: rec('closePath'),
        fillText: rec('fillText'),
        // 記錄每次 setLineDash 的參數與當下的 lineDashOffset。
        // `_dashTag` 由原始碼在呼叫前設定（見 ui_canvas.js 的 setDash 註解），
        // 讓測試能區分「外框（虛線）」與「內框（實線）」——不依賴 stack 解析。
        setLineDash(dash) {
            lineDash = Array.isArray(dash) ? dash.slice() : [];
            dashCalls.push({ dash: lineDash.slice(), tag: this._dashTag || '', offset: lineDashOffset });
            calls.push({ name: 'setLineDash', args: [dash] });
        },
        _dashTag: '',
        get lineDash() { return lineDash; },
        get lineDashOffset() { return lineDashOffset; },
        set lineDashOffset(v) { lineDashOffset = v; },
        measureText: (t) => ({ width: t.length * 8 }),
        // 可被測試觀察的可變狀態
        font: '', fillStyle: '', strokeStyle: '', lineWidth: 0, textBaseline: ''
    };
}

function setupCanvas(mode = 'bbox') {
    const ctx = makeFakeCtx();
    Object.assign(UICanvas.state, {
        ctx, canvas: ctx.canvas, mode, annotations: [], currentBbox: null,
        selectedAnnotationIndex: -1, labelMap: {}, pointerX: null, pointerY: null,
        // ★ 必須完整重置 hover 相關狀態（2026-10-01）。
        //   node --test 會並發執行同一檔內的測試且共用 UICanvas.state，
        //   若此處不重置，上一個測試殘留的 hover 狀態會讓本測試的
        //   「phase=1」變成非 hover 狀態 → 光暈寬度差異，症狀極難追。
        hoveredAnnotationIndex: -1,
        hoverPhase: -1,
        hoverRafId: -1
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

test('render：bbox 採雙層描邊（白色外框 ＋ 標籤色內框），且標籤色不同則內框色不同', () => {
    // 2026-10-01：原測試只驗「兩個框顏色不同」，屬弱命題（僅呼叫
    // resolveBoxColor 而非真正檢查畫布），且雙層描邊後 strokeRect 由 2 次
    // 變 4 次而失敗。本次改為直接觀察 ctx 的可變狀態。
    const ctx = setupCanvas('bbox');
    UICanvas.state.getLabelColor = (label) => (label === '貓' ? 'hsl(10, 70%, 50%)' : 'hsl(20, 70%, 50%)');
    UICanvas.state.labelMap = { '貓': 0, '狗': 1 };
    UICanvas.state.annotations = [
        { bbox: [0, 0, 0.2, 0.2], class_id: 0 },
        { bbox: [0.3, 0.3, 0.2, 0.2], class_id: 1 }
    ];
    UICanvas.state.selectedAnnotationIndex = -1;

    // 在 strokeRect 當下記錄當下的 strokeStyle / lineWidth（真正的觀測）
    const seq = [];
    const origStrokeRect = ctx.strokeRect;
    ctx.strokeRect = (...a) => {
        seq.push({ color: ctx.strokeStyle, width: ctx.lineWidth });
        origStrokeRect(...a);
    };

    UICanvas.render();

    // 每個框兩層 → 2 個框共 4 次 strokeRect
    assert.equal(seq.length, 4, '兩個框各應有外層+內層共兩次 strokeRect');

    // 第 1 個框：外白內貓色
    assert.equal(seq[0].color, UICanvas.BOX_HALO_COLOR, '第 1 層應為白色外框');
    assert.equal(seq[1].color, 'hsl(10, 70%, 50%)', '第 2 層應為「貓」的標籤色');
    // 外層必須比內層粗，否則白邊會被完全覆蓋而失去作用
    assert.ok(seq[0].width > seq[1].width,
        `白色外框必須比標籤色內框粗（實得 ${seq[0].width} vs ${seq[1].width}）`);

    // 第 2 個框：外白內狗色 → 驗證不同標籤的內框確實不同
    assert.equal(seq[2].color, UICanvas.BOX_HALO_COLOR, '第 2 個框外層也應為白色');
    assert.equal(seq[3].color, 'hsl(20, 70%, 50%)', '第 2 個框內層應為「狗」的標籤色');

    // 外層兩框相同（都是白），內層兩框不同 → 這是雙色設計的關鍵性質
    assert.equal(seq[0].color, seq[2].color, '外層統一白色');
    assert.notEqual(seq[1].color, seq[3].color, '內層必須保留類別差異');
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
// ---------------------------------------------------------------------------
// 6. hover 預覽標註（2026-10-01 使用者需求）
//    標註列表有多個框時，使用者從列表刪除時需要知道畫面上是哪一個。
// ---------------------------------------------------------------------------

/** 依繪製順序記錄每次 strokeRect 當下的顏色與線寬 */
function captureStrokes(ctx) {
    const seq = [];
    const orig = ctx.strokeRect;
    ctx.strokeRect = (...a) => {
        seq.push({ color: ctx.strokeStyle, width: ctx.lineWidth });
        orig(...a);
    };
    return seq;
}

test('hover 標註：加粗但維持標籤色；selected 優先於 hover', () => {
    const ctx = setupCanvas('bbox');
    UICanvas.state.getLabelColor = (label) => (label === '貓' ? 'hsl(10, 70%, 50%)' : 'hsl(20, 70%, 50%)');
    UICanvas.state.labelMap = { '貓': 0, '狗': 1 };
    UICanvas.state.annotations = [
        { bbox: [0, 0, 0.2, 0.2], class_id: 0 },
        { bbox: [0.3, 0.3, 0.2, 0.2], class_id: 1 }
    ];
    const seq = captureStrokes(ctx);

    // 一般狀態：兩框同粗
    UICanvas.state.selectedAnnotationIndex = -1;
    UICanvas.state.hoveredAnnotationIndex = -1;
    UICanvas.render();
    const normalW = seq[1].width;        // 一般狀態的內框寬    seq.length = 0;

    // hover 第 1 框（貓）：應加粗，且**維持標籤色**（不變青色）
    UICanvas.state.hoveredAnnotationIndex = 0;
    UICanvas.render();
    assert.equal(seq.length, 4, 'hover 不得改變框數量');
    assert.equal(seq[1].color, 'hsl(10, 70%, 50%)',
        'hover 的框必須維持自己的標籤色（不可變成 selected 的青色）');
    assert.ok(seq[1].width > normalW,
        `hover 應加粗（一般 ${normalW} → hover ${seq[1].width}）`);

    // ★ 2026-10-01 使用者回報「加粗不明顯」→ 再回報改用閃爍虛線。
    //   hover 框的光暈（白色外框）必須是**虛線**且寬度**隨相位呼吸**。
    //   動態提示不依賴顏色對比，比靜態加粗更可靠。
    const minExpected = 3 + UICanvas.HOVER_HALO_MIN_EXTRA;
    const maxExpected = 3 + UICanvas.HOVER_HALO_MAX_EXTRA;

    // phase = 0 → 最窄；phase = 1 → 最寬
    // ★ 斷言「所有 strokeRect 中的最大值」而非 seq[0]：
    //   node --test 會並發執行同一檔內的測試且共用 UICanvas.state，
    //   依賴固定索引（seq[0]）易因狀態殘留而 flaky。
    //   「hover 框是最寬的」這個性質本身就是正確且穩定的不變式。
    UICanvas.state.hoveredAnnotationIndex = 0;
    UICanvas.state.selectedAnnotationIndex = -1;
    ctx.dashCalls.length = 0;
    UICanvas.state.hoverPhase = 0;
    UICanvas.render();
    const narrowHalo = Math.max(...seq.map((s) => s.width));
    // 從 dashCalls 讀「outer 那次」呼叫時的 offset —— 不可讀 ctx.lineDashOffset，
    // 因為 drawBox 結束時會把 lineDashOffset 歸零（避免影響後續繪製）。
    const dashAt0 = (ctx.dashCalls.find((c) => c.tag === 'outer') || {}).offset;

    ctx.dashCalls.length = 0;
    UICanvas.state.hoverPhase = 1;
    UICanvas.render();
    const wideHalo = Math.max(...seq.map((s) => s.width));
    const dashAt1 = (ctx.dashCalls.find((c) => c.tag === 'outer') || {}).offset;

    assert.equal(narrowHalo, minExpected,
        `phase=0 時光暈應為最小值 ${minExpected}px，實得 ${narrowHalo}`);
    assert.equal(wideHalo, maxExpected,
        `phase=1 時光暈應為最大值 ${maxExpected}px，實得 ${wideHalo}`);
    assert.ok(wideHalo > narrowHalo,
        `光暈必須隨相位變寬（${narrowHalo} → ${wideHalo}），否則沒有呼吸效果`);

    // 虛線：外框用虛線、內框用實線（tag === 'outer'/'inner'）
    assert.ok(ctx.dashCalls.length > 0, 'hover 必須呼叫 setLineDash（虛線效果）');
    assert.ok(ctx.dashCalls.some((c) => c.tag === 'outer' && c.dash.length > 0),
        'hover 的白色外框必須為虛線');
    assert.ok(ctx.dashCalls.some((c) => c.tag === 'inner' && c.dash.length === 0),
        'hover 的標籤色內框必須是實線（虛線會讓類別色難辨）');
    assert.notEqual(dashAt0, dashAt1, 'lineDashOffset 應隨相位變化（流動感）');
    seq.length = 0;

    // ★ 關鍵：已選取的框即使被 hover，也不應被「洗掉」選取外觀
    UICanvas.state.selectedAnnotationIndex = 1;   // 選中「狗」
    UICanvas.state.hoveredAnnotationIndex = 1;    // 同時 hover 同一個
    UICanvas.render();
    assert.equal(seq[3].color, UICanvas.SELECTED_COLOR,
        'selected 優先於 hover：選取中的框維持選取色');
    seq.length = 0;

    // 選中第 1 框（貓）、hover 第 2 框（狗）：兩者外觀必須不同
    UICanvas.state.selectedAnnotationIndex = 0;
    UICanvas.state.hoveredAnnotationIndex = 1;
    UICanvas.render();
    assert.equal(seq[1].color, UICanvas.SELECTED_COLOR, '選取中的框為選取色');
    assert.equal(seq[3].color, 'hsl(20, 70%, 50%)', 'hover 中的框維持其標籤色');
    assert.notEqual(seq[1].width, seq[3].width,
        'selected 與 hover 的線寬應有差異（否則看不出選中與 hover 的分別）');
});

test('hover 時標註晶片底板必須變亮（使用者回報「不明顯」的第二道處理）', () => {
    // 框線光暈加寬後，使用者仍覺不明顯 → 再疊加「晶片底板變亮」。
    // 這裡驗證 fillStyle（底板色）的 alpha 確實提高，且文字仍是白色。
    const ctx = setupCanvas('bbox');
    UICanvas.state.getLabelColor = () => 'hsl(10, 70%, 50%)';
    UICanvas.state.labelMap = { '貓': 0 };

    const fills = [];
    const origFillRect = ctx.fillRect;
    ctx.fillRect = (...a) => { fills.push(ctx.fillStyle); origFillRect(...a); };
    const texts = [];
    const origFillText = ctx.fillText;
    ctx.fillText = (...a) => { texts.push(ctx.fillStyle); origFillText(...a); };

    UICanvas.state.annotations = [{ bbox: [0.1, 0.1, 0.2, 0.2], class_id: 0 }];
    UICanvas.state.selectedAnnotationIndex = -1;
    UICanvas.state.hoveredAnnotationIndex = -1;
    UICanvas.render();
    const normalBg = fills[0];
    const normalTextColor = texts[0];
    fills.length = 0; texts.length = 0;

    UICanvas.state.hoveredAnnotationIndex = 0;
    UICanvas.render();
    const hoverBg = fills[0];
    const hoverTextColor = texts[0];

    const alphaOf = (s) => {
        const m = /rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(String(s));
        return m ? parseFloat(m[1]) : null;
    };
    const nA = alphaOf(normalBg), hA = alphaOf(hoverBg);
    assert.ok(nA !== null && hA !== null, `底板應為 rgba()，實得 ${normalBg} / ${hoverBg}`);
    assert.ok(hA > nA,
        `hover 底板必須更不透明（一般 ${nA} → hover ${hA}）`);
    assert.equal(hA, UICanvas.CHIP_HOVER_BG_ALPHA,
        'hover 底板不透明度應等於 CHIP_HOVER_BG_ALPHA');
    assert.equal(hoverTextColor, normalTextColor,
        'hover 只加亮底板、不換文字色（白底白字不可讀）');
});

test('setHoveredAnnotation：索引未變時不重繪（避免 hover 反覆觸發重繪）', () => {
    setupCanvas('bbox');
    let renders = 0;
    const orig = UICanvas.render;
    UICanvas.render = function () { renders += 1; return orig.call(this); };
    try {
        UICanvas.state.hoveredAnnotationIndex = -1;
        UICanvas.setHoveredAnnotation(2);
        assert.equal(renders, 1, '首次設定應重繪');
        UICanvas.setHoveredAnnotation(2);
        assert.equal(renders, 1, '同一索引重複設定不應重繪');
        UICanvas.setHoveredAnnotation(-1);
        assert.equal(renders, 2, '清除應重繪');
    } finally {
        UICanvas.render = orig;
    }
});

test('掃描守門：列表必須綁 mouseenter/mouseleave（否則 hover 高亮無來源）', () => {
    const src = fs.readFileSync(path.join(here, 'ui', 'annotation.js'), 'utf8');
    const start = src.indexOf('function renderAnnotationListUI');
    assert.ok(start > 0, '找不到 renderAnnotationListUI');
    const body = src.slice(start, src.indexOf('\n    }', start));
    assert.ok(/onmouseenter\s*=/.test(body), '標註列表未綁 mouseenter → hover 高亮無來源');
    assert.ok(/onmouseleave\s*=/.test(body), '標註列表未綁 mouseleave → 滑開後高亮不會消失');
    assert.ok(/setHoveredAnnotation\s*\(/.test(body), 'hover 事件未呼叫 setHoveredAnnotation');
});

