/**
 * ui/featurePanel.test.mjs — feature live 特徵採集面板契約測試（M4，Phase 4）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFeaturePanel } from './featurePanel.js';
import { buildFeatureSchema, landmarksToRow, FEATURE_MEDIAPIPE_MISSING } from '../core/featureSchema.js';

function makeElement(id, overrides = {}) {
    const el = {
        id, value: '', checked: false, disabled: false,
        className: '', textContent: '', _html: '',
        style: {}, onclick: null, onchange: null,
        parentElement: { insertAdjacentHTML: () => {} },
        set innerHTML(v) { this._html = v; },
        get innerHTML() { return this._html; },
        ...overrides
    };
    return el;
}

function makeView(initial = {}) {
    const els = {};
    return {
        style: { display: '' },
        _html: '',
        set innerHTML(v) { this._html = v; },
        querySelector(sel) {
            const id = String(sel).replace(/^#/, '');
            if (!els[id]) els[id] = makeElement(id, initial[id]);
            return els[id];
        },
        getElement(id) { return els[id]; }
    };
}

function makeHarness({ labelMap = {} } = {}) {
    const specData = { schema: { label_map: { ...labelMap } } };
    const state = {
        tableRows: [],
        spec: {
            toJSON: () => JSON.parse(JSON.stringify(specData)),
            updateSchema: (patch) => { Object.assign(specData.schema, patch); }
        }
    };
    const calls = { listed: 0, collected: [], status: [] };
    const Sampler = {
        state: { isCamRunning: false, cameraList: [], selectedDeviceId: 0 },
        setCameraDevice: () => {}, listCameras: () => { calls.listed++; },
        startCamera: async () => true, stopCamera: () => {}
    };
    const panel = createFeaturePanel({
        state,
        datasetBridge: {
            request: (opts) => {
                const msg = {
                    success: true, label: 'up', useZ: false,
                    hand: null, pose: null, handDetected: false, poseDetected: false
                };
                return { promise: Promise.resolve(msg) };
            },
            prompt: async () => 'newlabel'
        },
        t: (k, f) => f || k,
        Sampler, UIComponents: { renderLabelStats: () => {} },
        escapeHtml: (v) => String(v),
        FEATURE_MEDIAPIPE_MISSING,
        buildFeatureSchema, landmarksToRow,
        nextLabelId: (map) => Object.keys(map).length,
        onFeatureCollected: (data) => { calls.collected.push(data); },
        renderTablePreview: () => {}
    });
    return { state, specData, calls, Sampler, panel };
}

test('setupFeatureLiveView：顯示採集視圖、空相機清單時列舉、渲染 controls', () => {
    const h = makeHarness({ labelMap: { up: 0 } });
    const modal = {};
    const view = makeView();
    h.panel.setupFeatureLiveView(modal, view);
    assert.equal(view.style.display, 'block');
    assert.equal(h.calls.listed, 1);
    assert.ok(view._html.includes('feature-use-z'));
    assert.ok(view._html.includes('🧬 擷取特徵點'));
});

test('擷取特徵點：成功時組 row（不含 z＝108 特徵欄）並回調 onFeatureCollected', async () => {
    const h = makeHarness({ labelMap: { up: 0 } });
    const view = makeView();
    h.panel.setupFeatureLiveView({}, view);
    const labelSelect = view.getElement('feature-label-select');
    labelSelect.value = 'up';
    const collectBtn = view.getElement('feature-collect');
    assert.ok(collectBtn.onclick, 'collect 按鈕應已綁定');
    await collectBtn.onclick();
    assert.equal(h.calls.collected.length, 1);
    const { row, useZ, schema } = h.calls.collected[0];
    assert.equal(row.label, 'up');
    const featureKeys = Object.keys(row).filter((k) => k !== 'label');
    assert.equal(featureKeys.length, 108); // 不含 z：42+66
    assert.equal(useZ, false);
    assert.equal(schema.columns.length, 109);
});

test('缺 MediaPipe：回傳 errorCode 顯示降級訊息，不累計樣本', async () => {
    const h = makeHarness({ labelMap: { up: 0 } });
    // 覆寫 request 回缺裝錯誤
    h.panel = null;
    const specData = { schema: { label_map: { up: 0 } } };
    const state = {
        tableRows: [],
        spec: {
            toJSON: () => JSON.parse(JSON.stringify(specData)),
            updateSchema: () => {}
        }
    };
    const calls = { collected: [], statusText: '' };
    const Sampler = {
        state: { isCamRunning: false, cameraList: [], selectedDeviceId: 0 },
        setCameraDevice: () => {}, listCameras: () => {},
        startCamera: async () => true, stopCamera: () => {}
    };
    const panel = createFeaturePanel({
        state,
        datasetBridge: {
            request: () => ({ promise: Promise.resolve({
                success: false, errorCode: FEATURE_MEDIAPIPE_MISSING, error: 'x' }) }),
            prompt: async () => 'x'
        },
        t: (k, f) => f || k,
        Sampler, UIComponents: { renderLabelStats: () => {} },
        escapeHtml: (v) => String(v),
        FEATURE_MEDIAPIPE_MISSING,
        buildFeatureSchema, landmarksToRow,
        nextLabelId: () => 0,
        onFeatureCollected: (d) => { calls.collected.push(d); },
        renderTablePreview: () => {}
    });
    const view = makeView();
    panel.setupFeatureLiveView({}, view);
    view.getElement('feature-label-select').value = 'up';
    const collectBtn = view.getElement('feature-collect');
    await collectBtn.onclick();
    assert.equal(calls.collected.length, 0);
    assert.ok(state.tableRows.length === 0);
    assert.ok(view.getElement('feature-status').className.includes('is-err'));
});