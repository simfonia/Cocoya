/**
 * ui/labelManager.test.mjs — 標籤管理器契約測試（M2，R5）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLabelManager } from './labelManager.js';

function makeHarness({ type = 'image', labelMap = {}, images = [] } = {}) {
    const specData = {
        project: { type },
        schema: { label_map: { ...labelMap } }
    };
    const state = {
        spec: {
            toJSON: () => JSON.parse(JSON.stringify(specData)),
            updateSchema: (patch) => { Object.assign(specData.schema, patch); }
        },
        images,
        annotationMode: { isActive: false }
    };
    const calls = { synced: 0, stats: 0, saved: 0, preview: 0, rendered: 0 };
    const prompts = [];
    const confirms = [];
    const bridge = {
        prompt: async (msg, def) => (prompts.length ? prompts.shift() : def),
        confirm: async () => (confirms.length ? confirms.shift() : true)
    };
    const UICanvas = { state: {}, render: () => { calls.rendered++; } };
    const UIComponents = { renderLabelStats: () => {} };
    const t = (key, fallback) => fallback || key;
    const mgr = createLabelManager({
        state, t, escapeHtml: (v) => String(v ?? ''),
        UIComponents, UICanvas,
        getFormValue: () => type,
        syncLabelMap: () => { calls.synced++; },
        updateStatsFromImages: () => { calls.stats++; },
        scheduleAutoSave: () => { calls.saved++; },
        refreshPreview: () => { calls.preview++; },
        renderClassificationControls: () => {},
        renderAnnotationControls: () => {},
        updateThumbnailHighlight: () => {},
        bridge
    });
    return { state, specData, calls, prompts, confirms, bridge, UICanvas, mgr };
}

test('空容器早退', () => {
    const h = makeHarness();
    h.mgr.createLabelMapManager(null);
    assert.equal(h.calls.synced, 0);
});

test('新增類別寫入 label_map', async () => {
    const h = makeHarness({ type: 'image' });
    // 以最小 fake DOM 驗證新增流程的 spec 寫入
    const box = {
        id: '', innerHTML: '', _handlers: {},
        querySelector: (sel) => {
            if (sel === '.dataset-label-manager-select') return { value: '-1' };
            return { onclick: null, set onclick(fn) { box._handlers[sel] = fn; } };
        }
    };
    h.prompts.push('cat');
    h.mgr.createLabelMapManager(box);
    await box._handlers['[data-action="add"]']();
    assert.equal(h.specData.schema.label_map.cat, 0);
    assert.equal(h.calls.synced, 1);
});
