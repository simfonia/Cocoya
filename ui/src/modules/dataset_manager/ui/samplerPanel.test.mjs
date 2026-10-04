/**
 * ui/samplerPanel.test.mjs — 採集面板編排契約測試（M2，R6）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSamplerPanel } from './samplerPanel.js';
import { makeSpecStub } from '../../../../test/fixtures.js';
// [T4 2026-10-03] 斷言直接對齊 SSOT，避免測試內複製排序語意
import { sortedLabelNames } from '../core/labelMap.js';

function makeHarness({ labelMap = {}, targetLabel = '' } = {}) {
    // 單一 spec 假身：specData 與 state.spec 共用 backing 物件（斷言讀 h.specData）。
    const specStub = makeSpecStub({ labelMap, live: true });
    const specData = specStub.specData;
    const state = {
        spec: specStub
    };
    const calls = { stats: 0, preview: 0, captured: 0, listed: 0 };
    const Sampler = {
        state: { targetLabel, cameraList: [], selectedDeviceId: 0 },
        setTargetLabel: (l) => { Sampler.state.targetLabel = l; },
        listCameras: () => {
            calls.listed++;
            Sampler.state.cameraList = [{ id: 0, name: 'Camera 0 (640x480)' }];
            Sampler.state.selectedDeviceId = 0;
            return Promise.resolve(Sampler.state.cameraList);
        }
    };
    const rendered = [];
    const UIComponents = {
        renderSamplerView: (view, opts) => {
            const html = opts.cameraScanning ? '掃描攝影機中' : 'cams';
            view.innerHTML = html;
            rendered.push({ view, opts });
        },
        renderLabelStats: () => { calls.statsRendered = (calls.statsRendered || 0) + 1; }
    };
    const panel = createSamplerPanel({
        state, Sampler, UIComponents,
        updateStatsFromImages: () => { calls.stats++; },
        refreshPreview: () => { calls.preview++; },
        refreshStructurePanel: () => { calls.structure = (calls.structure || 0) + 1; },
        onSnapshot: () => {}, onBurstToggle: () => {},
        onStartCamera: () => {}, onStopCamera: () => {},
        onSampleCaptured: () => { calls.captured++; },
        nextLabelId: (map) => Object.keys(map).length,
        // [T4 2026-10-03] 標籤下拉排序 SSOT。
        //   ⚠️ 測試替身必須反映真實介面契約（AGENTS.md）：此處不可只回傳空陣列當擋箭牌，
        //   否則「下拉清單是否有值」的所有斷言都會失效。
        //   刻意沿用 production 的 localeCompare 語意，讓排序行為可被驗證。
        sortedLabelNames: (map) => Object.keys(map || {}).sort((a, b) => String(a).localeCompare(String(b)))
    });
    return { state, specData, calls, Sampler, rendered, panel };
}

function makeView() {
    const selects = {};
    return {
        style: {}, _html: '',
        querySelector: (sel) => {
            if (sel === '#dataset-sampler-camera-select') {
                if (!selects.cam) selects.cam = { innerHTML: '', disabled: true };
                return selects.cam;
            }
            return null;
        },
        getSelect: (k) => selects[k],
        set innerHTML(v) { this._html = v; }
    };
}

test('背景列舉完成後只補下拉選單（渲染時為掃描中佔位）', async () => {
    const h = makeHarness({ labelMap: {} });
    const modal = { querySelector: () => null };
    const view = makeView();
    h.panel.setupLiveSamplerView(modal, view);
    assert.match(view._html, /掃描攝影機中/);
    assert.equal(h.calls.listed, 1);
    assert.equal(h.rendered.length, 1);
    await Promise.resolve();
    await Promise.resolve();
    const sel = view.getSelect('cam');
    assert.ok(sel.innerHTML.includes('Camera 0'));
    assert.equal(sel.disabled, false);
});

test('有標籤時預選首標籤（[T4] 字母序第一個，非鍵插入順序）', () => {
    // ⚠️ 行為變更（2026-10-03）：預選項由「label_map 鍵插入順序第一個」
    //   改為「**字母序第一個**」以對齊其他面板的下拉排序。
    //   刻意用 dog:0 / cat:1（dog 先建立）區分兩種語意 —— 若實作退回
    //   Object.keys 直出，本測試會紅（dog ≠ cat）。
    const h = makeHarness({ labelMap: { dog: 0, cat: 1 } });
    const modal = { querySelector: () => null };
    const view = makeView();
    h.panel.setupLiveSamplerView(modal, view);
    assert.equal(h.Sampler.state.targetLabel, 'cat');
    assert.equal(h.Sampler.state.targetLabel,
        sortedLabelNames({ dog: 0, cat: 1 })[0], '預選項必須等於字母序第一個');
});

test('onLabelChange 新標籤補 label_map 並以 refreshStructurePanel 重建中欄面板（不覆寫 innerHTML）', () => {
    const h = makeHarness({ labelMap: {} });
    const modal = { querySelector: () => null };
    const view = makeView();
    h.panel.handleSamplerLabelChange(modal, view, 'bird');
    assert.equal(h.specData.schema.label_map.bird, 0);
    assert.equal(h.calls.stats, 1);
    assert.equal(h.calls.structure, 1);
    assert.equal(h.calls.preview, 1);
});

test('onLabelChange 既有標籤：僅選取，不重建結構面板', () => {
    const h = makeHarness({ labelMap: { dog: 0 } });
    const modal = { querySelector: () => null };
    const view = makeView();
    h.panel.handleSamplerLabelChange(modal, view, 'dog');
    assert.equal(h.Sampler.state.targetLabel, 'dog');
    assert.equal(h.calls.stats || 0, 0);
    assert.equal(h.calls.structure || 0, 0);
    assert.equal(h.calls.preview, 1);
});
