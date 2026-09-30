import test from 'node:test';
import assert from 'node:assert/strict';
import { createFormPresenter } from './form.js';
import { makeTreeEl as el } from '../../../../test/fixtures.js';

function makeModal() {
    const modal = el({ tag: 'div' });
    const addInput = (name, value) => modal.children.push(el({ name, value }));
    const addRow = (name, type, role) => {
        const row = el({ attrs: { class: 'dataset-column-row' } });
        row.children.push(el({ attrs: { 'data-field': 'name' }, value: name }));
        row.children.push(el({ attrs: { 'data-field': 'type' }, value: type }));
        row.children.push(el({ attrs: { 'data-field': 'role' }, value: role }));
        modal.children.push(row);
    };
    return { modal, addInput, addRow };
}

test('getFormValue 讀取指定 name 欄位', () => {
    const { modal, addInput } = makeModal();
    addInput('projectName', 'my-dataset');
    const p = createFormPresenter({ getModalRoot: () => modal });
    assert.equal(p.getFormValue('projectName'), 'my-dataset');
});

test('getFormValue 欄位不存在回傳空字串', () => {
    const { modal } = makeModal();
    const p = createFormPresenter({ getModalRoot: () => modal });
    assert.equal(p.getFormValue('nope'), '');
});

test('getFormValue modal 為 null 時安全回傳空字串', () => {
    const p = createFormPresenter({ getModalRoot: () => null });
    assert.equal(p.getFormValue('projectName'), '');
});

test('getColumnsFromUI 解析欄位列並過濾空名稱', () => {
    const { modal, addRow } = makeModal();
    addRow('x', 'number', 'feature');
    addRow('', 'string', 'label'); // 應被過濾
    addRow('y', 'string', 'label');
    const p = createFormPresenter({ getModalRoot: () => modal });
    assert.deepEqual(p.getColumnsFromUI(), [
        { name: 'x', type: 'number', role: 'feature' },
        { name: 'y', type: 'string', role: 'label' }
    ]);
});

test('getColumnsFromUI 缺 type/role 時使用預設值、名稱去空白', () => {
    const { modal } = makeModal();
    const row = el({ attrs: { class: 'dataset-column-row' } });
    row.children.push(el({ attrs: { 'data-field': 'name' }, value: '  a  ' }));
    modal.children.push(row);
    const p = createFormPresenter({ getModalRoot: () => modal });
    assert.deepEqual(p.getColumnsFromUI(), [{ name: 'a', type: 'string', role: 'feature' }]);
});

test('getColumnsFromUI modal 為 null 回傳空陣列；dispose 為 no-op', () => {
    const p = createFormPresenter({ getModalRoot: () => null });
    assert.deepEqual(p.getColumnsFromUI(), []);
    assert.doesNotThrow(() => p.dispose());
});

test('預設（未注入 getModalRoot）在無 document 環境下安全', () => {
    const p = createFormPresenter();
    assert.equal(p.getFormValue('x'), '');
    assert.deepEqual(p.getColumnsFromUI(), []);
});
