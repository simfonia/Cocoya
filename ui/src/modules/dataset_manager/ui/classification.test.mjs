import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassificationController } from './classification.js';

function makeFakeElement(id = '') {
    const el = {
        id, tabIndex: 0, textContent: '', innerHTML: '', src: '', className: '',
        style: {}, onclick: null, handlers: {}, insertAdjacentHTMLCalls: [],
        classList: {
            _set: new Set(),
            add(c) { this._set.add(c); },
            remove(c) { this._set.delete(c); },
            contains(c) { return this._set.has(c); }
        },
        addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); },
        removeEventListener(type, fn) {
            const list = this.handlers[type] || [];
            const i = list.indexOf(fn);
            if (i >= 0) list.splice(i, 1);
        },
        querySelector() { return null; },
        focus() { el.focused = true; },
        remove() { el.removed = true; },
        insertAdjacentHTML(pos, html) { el.insertAdjacentHTMLCalls.push({ pos, html }); }
    };
    return el;
}

function makeFakeDocument(elementsById) {
    return { getElementById: (id) => elementsById[id] || null };
}

function baseDeps(elementsById, overrides = {}) {
    const state = {
        annotationMode: { isActive: false, currentIndex: -1, mode: null, originalBodyClass: '' },
        images: [],
        spec: { toJSON: () => ({ schema: { label_map: {} } }) }
    };
    return {
        state,
        t: (key, fallback) => fallback || key,
        escapeHtml: (v) => String(v ?? ''),
        getModal: () => overrides.modal || null,
        UIComponents: { renderAnnotationThumbnails: () => {} },
        saveGridScroll: () => {},
        exitAnnotationMode: () => {},
        navigateToImage: () => {},
        setAnnotationHeaderActions: () => {},
        handleExportDataset: () => {},
        updateStatsFromImages: () => {},
        updateThumbnailHighlight: () => {},
        refreshPreview: () => {},
        createLabelMapManager: () => {},
        getDocument: () => makeFakeDocument(elementsById)
    };
}

test('進入分類模式：設定狀態機、套用 fullscreen/body class、隱藏面板', () => {
    const previewContent = makeFakeElement('dataset-preview-content');
    const previewHeader = makeFakeElement('preview-header');
    const backBtn = makeFakeElement('dataset-annotation-back');
    const subtitle = makeFakeElement('dataset-manager-subtitle');
    const body = makeFakeElement('dataset-manager-body');
    body.className = 'orig';
    const sourcePanel = makeFakeElement('source');
    const schemaPanel = makeFakeElement('schema');
    const modal = {
        querySelector(sel) {
            if (sel === '#dataset-preview-content') return previewContent;
            if (sel === '.dataset-preview-panel .dataset-panel-title div') return previewHeader;
            if (sel === '#dataset-manager-subtitle') return subtitle;
            if (sel === '.dataset-manager-body') return body;
            if (sel === '.dataset-source-panel') return sourcePanel;
            if (sel === '.dataset-schema-panel') return schemaPanel;
            if (sel === '#dataset-annotation-back') return backBtn;
            return null;
        },
        classList: {
            _set: new Set(),
            add(c) { this._set.add(c); },
            remove(c) { this._set.delete(c); },
            contains(c) { return this._set.has(c); }
        }
    };
    let saved = false;
    const deps = baseDeps({});
    deps.getModal = () => modal;
    deps.saveGridScroll = () => { saved = true; };
    const controller = createClassificationController(deps);
    controller.enterClassificationReviewMode({ blobUrl: 'blob:x' }, 3);

    assert.equal(saved, true);
    assert.equal(deps.state.annotationMode.isActive, true);
    assert.equal(deps.state.annotationMode.currentIndex, 3);
    assert.equal(deps.state.annotationMode.mode, 'classification');
    assert.equal(deps.state.annotationMode.originalBodyClass, 'orig');
    assert.ok(modal.classList.contains('dataset-annotation-fullscreen'));
    assert.equal(body.classList.contains('dataset-annotation-mode'), true);
    assert.equal(sourcePanel.style.display, 'none');
    assert.equal(schemaPanel.style.display, 'none');
    assert.equal(subtitle.textContent, '影像分類標籤校正');
    assert.ok(previewContent.innerHTML.includes('dataset-annotation-layout'));
    assert.ok(previewContent.innerHTML.includes('annotation-classify-img'));
    assert.ok(previewContent.innerHTML.includes('blob:x'));
});

test('缺關鍵元素時進入模式早退，不污染狀態', () => {
    const deps = baseDeps({});
    deps.getModal = () => ({ querySelector: () => null });
    const controller = createClassificationController(deps);
    controller.enterClassificationReviewMode({ blobUrl: 'blob:x' }, 0);
    assert.equal(deps.state.annotationMode.isActive, false);
    assert.equal(deps.state.annotationMode.mode, null);
});

test('loadClassificationImage：更新 currentIndex 與 img.src；索引不存在 no-op', () => {
    const img = makeFakeElement('annotation-classify-img');
    const deps = baseDeps({ 'annotation-classify-img': img });
    const controller = createClassificationController(deps);
    deps.state.images = [{ blobUrl: 'blob:a' }, { blobUrl: 'blob:b' }];
    controller.loadClassificationImage(1);
    assert.equal(deps.state.annotationMode.currentIndex, 1);
    assert.equal(img.src, 'blob:b');
    deps.state.images = [];
    controller.loadClassificationImage(5);
    assert.equal(deps.state.annotationMode.currentIndex, 1);
});

test('鍵盤事件：↑/↓/Esc 導航、重複 bind 不累積、unbind/dispose 移除 listener', () => {
    const container = makeFakeElement('annotation-classify-container');
    const deps = baseDeps({ 'annotation-classify-container': container });
    const nav = [];
    let exited = false;
    deps.navigateToImage = (i) => nav.push(i);
    deps.exitAnnotationMode = () => { exited = true; };
    deps.state.annotationMode.currentIndex = 1;
    const controller = createClassificationController(deps);

    controller.bindClassificationKeyboardEvents();
    assert.equal(container.focused, true);
    const handler = container.handlers['keydown'][0];
    handler({ key: 'ArrowUp', preventDefault() {} });
    handler({ key: 'ArrowDown', preventDefault() {} });
    handler({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
    assert.deepEqual(nav, [0, 2]);
    assert.equal(exited, true);

    controller.bindClassificationKeyboardEvents();
    assert.equal(container.handlers['keydown'].length, 1);

    controller.unbindClassificationKeyboardEvents();
    assert.equal(container.handlers['keydown'].length, 0);

    controller.bindClassificationKeyboardEvents();
    controller.dispose();
    assert.equal(container.handlers['keydown'].length, 0);
});

test('renderClassificationControls：渲染下拉、選中當前 label、onchange 更新 image.label', () => {
    const controls = makeFakeElement('annotation-controls');
    const manager = makeFakeElement('annotation-classify-manager');
    const elements = { 'annotation-controls': controls, 'annotation-classify-manager': manager };
    const deps = baseDeps(elements);
    let managerCalls = 0;
    deps.createLabelMapManager = () => { managerCalls++; };
    deps.state.images = [{ label: 'cat', path: 'a.png' }];
    deps.state.annotationMode.currentIndex = 0;
    deps.state.spec = { toJSON: () => ({ schema: { label_map: { cat: 0, dog: 1 } } }) };
    const controller = createClassificationController(deps);
    controller.renderClassificationControls();

    assert.ok(controls.innerHTML.includes('annotation-classify-select'));
    assert.ok(controls.innerHTML.includes('value="0" selected'));
    assert.ok(controls.innerHTML.includes('a.png'));
    assert.equal(managerCalls, 1);

    const select = makeFakeElement('annotation-classify-select');
    elements['annotation-classify-select'] = select;
    controller.renderClassificationControls();
    assert.equal(typeof select.onchange, 'function');
    select.value = '1';
    select.onchange();
    assert.equal(deps.state.images[0].label, 'dog');
});

test('renderClassificationControls：無 label_map 顯示未偵測提示；元素缺失 no-op', () => {
    const controls = makeFakeElement('annotation-controls');
    const elements = { 'annotation-controls': controls, 'annotation-classify-manager': makeFakeElement('m') };
    const deps = baseDeps(elements);
    deps.state.images = [{ label: null, name: 'b.png' }];
    deps.state.annotationMode.currentIndex = 0;
    const controller = createClassificationController(deps);
    controller.renderClassificationControls();
    assert.ok(controls.innerHTML.includes('尚未偵測到標籤'));

    const empty = baseDeps({});
    const c2 = createClassificationController(empty);
    assert.doesNotThrow(() => c2.renderClassificationControls());
});

test('updateClassifyProgress：顯示 目前/總數；元素缺失 no-op', () => {
    const progressEl = makeFakeElement('annotation-progress');
    const deps = baseDeps({ 'annotation-progress': progressEl });
    deps.state.images = [{}, {}, {}];
    deps.state.annotationMode.currentIndex = 1;
    const controller = createClassificationController(deps);
    controller.updateClassifyProgress();
    assert.equal(progressEl.textContent, '樣本: 2 / 3 張');

    const empty = baseDeps({});
    const c2 = createClassificationController(empty);
    assert.doesNotThrow(() => c2.updateClassifyProgress());
});
