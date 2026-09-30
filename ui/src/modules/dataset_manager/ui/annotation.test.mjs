import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createAnnotationController } from './annotation.js';
import { makeEl, makeFakeDocument } from '../../../../test/fakeDom.js';
import { makeDeps as makeSharedDeps } from '../../../../test/depsBuilder.js';
import { makeSpecStub, OBJECT_DETECTION_LABELS } from '../../../../test/fixtures.js';

function makeDeps(docOverrides = {}) {
    const state = {
        images: [
            { blobUrl: 'blob:1', path: 'a.jpg', annotations: [] },
            { blobUrl: 'blob:2', path: 'b.jpg', annotations: [] }
        ],
        annotationMode: { isActive: false, currentIndex: -1, saveTimer: null },
        spec: makeSpecStub({ type: 'object_detection', labelMap: OBJECT_DETECTION_LABELS })
    };
    const { deps, events } = makeSharedDeps({
        state,
        modal: docOverrides.modal || null,
        document: docOverrides.document,
        record: true
    });
    return { deps, events };
}

describe('ui/annotation.js (Stage 4 切片 6)', () => {
    test('enterAnnotationMode：3 欄布局渲染 + 狀態機 + 編排順序（save → thumbs → headerActions）', () => {
        const modal = makeEl('modal');
        modal.querySelector = (sel) => {
            if (sel === '#dataset-preview-content') return makeEl('preview-content');
            if (sel === '.dataset-preview-panel .dataset-panel-title div') return makeEl('preview-header');
            if (sel === '#dataset-manager-subtitle') return makeEl('subtitle');
            if (sel === '.dataset-manager-body') {
                const b = makeEl('body');
                b.className = 'dataset-manager-body';
                return b;
            }
            if (sel === '.dataset-source-panel') return makeEl('source-panel');
            if (sel === '.dataset-schema-panel') return makeEl('schema-panel');
            if (sel === '#dataset-annotation-back') return makeEl('back-btn');
            return null;
        };
        const doc = makeFakeDocument(['annotation-thumbnails', 'annotation-export-btn', 'annotation-controls', 'annotation-container', 'annotation-target-img', 'annotation-progress']);
        const { deps, events } = makeDeps({ modal, document: doc });

        const c = createAnnotationController(deps);
        c.enterAnnotationMode(deps.state.images[0], 0);

        assert.equal(deps.state.annotationMode.isActive, true);
        assert.equal(deps.state.annotationMode.currentIndex, 0);
        assert.equal(modal.classes.has('dataset-annotation-fullscreen'), true);

        const order = events.map(e => e[0]);
        const iSave = order.indexOf('saveGridScroll');
        const iThumbs = order.indexOf('thumbs');
        const iHeader = order.indexOf('headerActions');
        assert.ok(iSave >= 0 && iThumbs > iSave && iHeader > iThumbs, `編排順序錯誤: ${order.join(',')}`);
        assert.deepEqual(events.find(e => e[0] === 'headerActions')?.[1], true);
    });

    test('enterAnnotationMode：缺 preview 面板早退，不污染狀態', () => {
        const doc = makeFakeDocument([]);
        const { deps } = makeDeps({ document: doc });
        const c = createAnnotationController(deps);
        c.enterAnnotationMode(deps.state.images[0], 0);
        assert.equal(deps.state.annotationMode.isActive, false);
        assert.equal(deps.state.annotationMode.currentIndex, -1);
    });

    test('loadAnnotationImage：UICanvas.init 以 line mode + labelMap 注入，onUpdate 觸發 debounce', async () => {
        const doc = makeFakeDocument(['annotation-container', 'annotation-target-img', 'annotation-controls', 'annotation-list-ui', 'annotation-progress', 'annotation-class-manager']);
        const { deps, events } = makeDeps({ document: doc });
        deps.getFormValue = (name) => (name === 'projectType' ? 'line_following' : '');

        const c = createAnnotationController(deps);
        c.loadAnnotationImage(1);

        assert.equal(deps.state.annotationMode.currentIndex, 1);
        const init = events.find(e => e[0] === 'init');
        assert.ok(init, 'UICanvas.init 未被呼叫');
        assert.equal(init[1].opts.mode, 'line');
        assert.deepEqual(init[1].opts.labelMap, { cat: 0, dog: 1 });

        const anns = [{ line: [0.1, 0.1, 0.5, 0.5] }];
        init[1].opts.onUpdate(anns);
        assert.equal(deps.state.images[1].annotations, anns);
        assert.ok(deps.state.annotationMode.saveTimer, 'debounce timer 未建立');

        await new Promise(r => setTimeout(r, 350));
        const order = events.map(e => e[0]);
        assert.ok(order.includes('stats') && order.includes('refresh'), 'debounce 未觸發 stats+refresh');
        // 原行為：debounce 觸發後不主動清空 saveTimer 參考（僅切圖/儲存時 clearTimeout）
    });

    test('bindCanvasKeyboardEvents：↑/↓ 導航、Delete 刪除、Esc 退出；重複 bind 不累積 handler', () => {
        const doc = makeFakeDocument(['annotation-container', 'annotation-controls', 'annotation-list-ui']);
        const { deps, events } = makeDeps({ document: doc });
        const container = doc.getElementById('annotation-container');
        const canvas = makeEl('canvas');
        canvas.tagName = 'CANVAS';
        container.querySelector = (sel) => (sel === 'canvas.dataset-annotation-canvas' ? canvas : null);

        const c = createAnnotationController(deps);
        c.bindCanvasKeyboardEvents();
        c.bindCanvasKeyboardEvents(); // 第二次 bind 應先移除舊 handler

        assert.equal(canvas.listeners.keydown.length, 1, 'keydown handler 累積');
        const handler = canvas.listeners.keydown[0];
        assert.equal(deps.UICanvas.state.handlers.keydown, handler);

        // 設定 currentIndex 後 ArrowUp 應導航至前一張
        deps.state.annotationMode.currentIndex = 1;
        handler({ key: 'ArrowUp', preventDefault() {} });
        assert.deepEqual(events.find(e => e[0] === 'nav')?.[1], 0);

        handler({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
        assert.ok(events.some(e => e[0] === 'exit'));

        deps.UICanvas.state.annotations = [{ bbox: [0, 0, 1, 1], class_id: 0 }, { bbox: [0, 0, 1, 1], class_id: 1 }];
        deps.UICanvas.state.selectedAnnotationIndex = 0;
        handler({ key: 'Delete', preventDefault() {} });
        assert.equal(deps.UICanvas.state.annotations.length, 1);
        assert.equal(deps.UICanvas.state.selectedAnnotationIndex, -1);
    });

    test('renderAnnotationControls：object_detection 顯示類別管理；無 controls 早退', () => {
        const doc = makeFakeDocument(['annotation-controls', 'annotation-class-manager']);
        const { deps, events } = makeDeps({ document: doc });
        const c = createAnnotationController(deps);
        c.renderAnnotationControls();
        assert.ok(events.some(e => e[0] === 'labelManager'), 'createLabelMapManager 未被呼叫');

        const emptyDoc = makeFakeDocument([]);
        const deps2 = makeDeps({ document: emptyDoc }).deps;
        createAnnotationController(deps2).renderAnnotationControls(); // 不拋錯
    });

    test('renderAnnotationListUI：bbox/line 項渲染；無 list 早退', () => {
        const doc = makeFakeDocument(['annotation-list-ui']);
        const { deps } = makeDeps({ document: doc });
        const list = doc.getElementById('annotation-list-ui');
        const c = createAnnotationController(deps);
        c.renderAnnotationListUI([
            { bbox: [0.1, 0.2, 0.3, 0.4], class_id: 1 },
            { line: [0.5, 0.5, 0.6, 0.6] }
        ]);
        assert.ok(list.innerHTML.includes('dataset-annotation-item'));
        assert.ok(list.innerHTML.includes('線段'));
        assert.ok(list.innerHTML.includes('dog'));

        const emptyDoc = makeFakeDocument([]);
        const deps2 = makeDeps({ document: emptyDoc }).deps;
        createAnnotationController(deps2).renderAnnotationListUI([]); // 不拋錯
    });

    test('saveCurrentAnnotations：寫回 images + 清 timer + 重算統計；dispose 清除未落 debounce', () => {
        const { deps, events } = makeDeps({});
        const c = createAnnotationController(deps);

        deps.UICanvas.state.annotations = [{ bbox: [0, 0, 1, 1], class_id: 0 }];
        deps.state.annotationMode.currentIndex = 0;
        deps.state.annotationMode.saveTimer = setTimeout(() => {}, 10000);
        c.saveCurrentAnnotations();
        assert.equal(deps.state.images[0].annotations.length, 1);
        assert.equal(deps.state.annotationMode.saveTimer, null);
        assert.ok(events.map(e => e[0]).includes('stats'));

        deps.state.annotationMode.saveTimer = setTimeout(() => {}, 10000);
        c.dispose();
        assert.equal(deps.state.annotationMode.saveTimer, null);
    });
});
