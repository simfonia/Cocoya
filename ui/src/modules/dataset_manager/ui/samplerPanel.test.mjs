/**
 * ui/samplerPanel.test.mjs — 採集面板編排契約測試（M2，R6）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSamplerPanel } from './samplerPanel.js';

function makeHarness({ labelMap = {}, targetLabel = '' } = {}) {
    const specData = { schema: { label_map: { ...labelMap } } };
    const state = {
        spec: {
            toJSON: () => JSON.parse(JSON.stringify(specData)),
            updateSchema: (patch) => { Object.assign(specData.schema, patch); }
        }
    };
    const calls = { stats: 0, preview: 0, captured: 0, listed: 0 };
    const Sampler = {
        state: { targetLabel, cameraList: [] },
        setTargetLabel: (l) => { Sampler.state.targetLabel = l; },
        listCameras: () => { calls.listed++; }
    };
    const rendered = [];
    const UIComponents = {
        renderSamplerView: (view, opts) => { rendered.push({ view, opts }); },
        renderLabelStats: () => { calls.statsRendered = (calls.statsRendered || 0) + 1; }
    };
    const panel = createSamplerPanel({
        state, Sampler, UIComponents,
        updateStatsFromImages: () => { calls.stats++; },
        refreshPreview: () => { calls.preview++; },
        onSnapshot: () => {}, onBurstToggle: () => {},
        onStartCamera: () => {}, onStopCamera: () => {},
        onSampleCaptured: () => { calls.captured++; },
        nextLabelId: (map) => Object.keys(map).length
    });
    return { state, specData, calls, Sampler, rendered, panel };
}

function makeView() {
    return {
        style: {}, _html: '',
        querySelector: () => null,
        set innerHTML(v) { this._html = v; }
    };
}

test('無標籤時不預選、不列舉改為列舉（空清單觸發）', () => {
    const h = makeHarness({ labelMap: {} });
    const modal = { querySelector: () => null };
    const view = makeView();
    h.panel.setupLiveSamplerView(modal, view);
    assert.equal(view.style.display, 'block');
    assert.equal(h.calls.listed, 1);
    assert.equal(h.rendered.length, 1);
});

test('有標籤時預選首標籤', () => {
    const h = makeHarness({ labelMap: { dog: 0, cat: 1 } });
    const modal = { querySelector: () => null };
    const view = makeView();
    h.panel.setupLiveSamplerView(modal, view);
    assert.equal(h.Sampler.state.targetLabel, 'dog');
});

test('onLabelChange 新標籤補 label_map 並刷新', () => {
    const h = makeHarness({ labelMap: {} });
    const modal = { querySelector: () => null };
    const view = makeView();
    h.panel.handleSamplerLabelChange(modal, view, 'bird');
    assert.equal(h.specData.schema.label_map.bird, 0);
    assert.equal(h.calls.stats, 1);
    assert.equal(h.calls.preview, 1);
});
