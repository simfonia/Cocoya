import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createPanelsPresenter } from './panels.js';
import { makeEl } from '../../../../test/fakeDom.js';
import { fallbackT, angleEscapeHtml, optionListPanels } from '../../../../test/depsStubs.js';

/* [T3 殘項 2026-10-03] 極簡 fake element 改用共用 makeEl。
   本檔斷言讀 `c._appended`（insertAdjacentHTML 累積），已由 fakeDom 的
   insertAdjacentHTML 同步累積提供，故此處不需再覆寫 —— 斷言逐字未動。 */
function el(id) {
    return makeEl(id);
}

function makeDeps(modalOverrides = {}) {
    const events = [];
    const modal = {
        querySelector: (sel) => modalOverrides[sel] || null
    };
    return {
        deps: {
            state: {
                spec: {
                    toJSON: () => ({ schema: { columns: [
                        { name: 'x', type: 'number', role: 'feature' },
                        { name: 'y', type: 'text', role: 'label' }
                    ] } })
                }
            },
            t: fallbackT,
            escapeHtml: angleEscapeHtml,
            optionList: optionListPanels,
            getModal: () => modal,
            refreshPreview: () => events.push('refresh'),
            DatasetSpec: { normalizeColumn: (c) => ({ name: c.name || '', type: c.type || 'text', role: c.role || 'feature' }) },
            DatasetSpecConstants: { COLUMN_TYPES: ['number', 'text'], COLUMN_ROLES: ['feature', 'label'] },
            getDocument: () => ({ getElementById: () => null })
        },
        events, modal
    };
}

describe('ui/panels.js (Stage 4 切片 7)', () => {
    test('renderColumnRow：欄位列模板含 name/type/role 與移除鈕', () => {
        const { deps } = makeDeps();
        const p = createPanelsPresenter(deps);
        const html = p.renderColumnRow({ name: 'a<b', type: 'number', role: 'label' });
        assert.ok(html.includes('dataset-column-row'));
        assert.ok(html.includes('a&lt;b'), 'escapeHtml 未生效');
        assert.ok(html.includes('selected'), 'optionList 選取未注入');
        assert.ok(html.includes('dataset-remove-column'));
    });

    test('renderValidation：ok/error class 與 errors/warnings 清單', () => {
        const { deps } = makeDeps();
        const p = createPanelsPresenter(deps);
        // 2026-09-16：ok+warnings 新語意 → warn class 與「可用，尚有提醒」；純 ok → ok class
        const ok = p.renderValidation({ ok: true, errors: [], warnings: ['w1'] });
        assert.ok(ok.includes('dataset-validation warn'), 'ok+warnings 應為 warn class');
        assert.ok(ok.includes('可用，尚有提醒'));
        assert.ok(ok.includes('w1'));
        assert.ok(ok.includes('dataset-warnings'));
        const clean = p.renderValidation({ ok: true, errors: [], warnings: [] });
        assert.ok(clean.includes('dataset-validation ok'));
        assert.ok(clean.includes('Spec 可用'));
        const bad = p.renderValidation({ ok: false, errors: ['e<1'], warnings: [] });
        assert.ok(bad.includes('dataset-validation error'));
        assert.ok(bad.includes('e&lt;1'));
    });

    test('renderPreviewTable：前 10 筆表格；缺 container/rows 早退', () => {
        const { deps } = makeDeps();
        const p = createPanelsPresenter(deps);
        const c = el('preview');
        const rows = Array.from({ length: 15 }, (_, i) => ({ a: i, b: 'x' + i }));
        p.renderPreviewTable(c, rows);
        assert.ok(c.innerHTML.includes('dataset-preview-table'));
        assert.ok(c.innerHTML.includes('<th>a</th>'));
        assert.ok(!c.innerHTML.includes('x14'), '應僅顯示前 10 筆');
        assert.ok(c.innerHTML.includes('x9'));

        p.renderPreviewTable(null, rows); // 不拋錯
        p.renderPreviewTable(c, []); // 不拋錯
    });

    test('addColumn：插入欄位列 + refreshPreview；缺 list 早退', () => {
        const list = el('dataset-column-list');
        const { deps, events } = makeDeps({ '#dataset-column-list': list });
        const p = createPanelsPresenter(deps);
        p.addColumn({ name: 'z' });
        assert.ok(list._appended.includes('dataset-column-row'));
        assert.deepEqual(events, ['refresh']);

        const deps2 = makeDeps({}).deps;
        createPanelsPresenter(deps2).addColumn({}); // 缺 list：不拋錯、不 refresh
        assert.deepEqual(events, ['refresh']);
    });

    test('renderAllColumns：依 spec 全量重繪 + refreshPreview', () => {
        const list = el('dataset-column-list');
        const { deps, events } = makeDeps({ '#dataset-column-list': list });
        const p = createPanelsPresenter(deps);
        p.renderAllColumns();
        assert.ok(list.innerHTML.includes('value="x"'));
        assert.ok(list.innerHTML.includes('value="y"'));
        assert.deepEqual(events, ['refresh']);
    });

    test('dispose：no-op 不拋錯', () => {
        const { deps } = makeDeps();
        assert.doesNotThrow(() => createPanelsPresenter(deps).dispose());
    });
});
