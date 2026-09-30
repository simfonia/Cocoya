/**
 * ui/test/fakeDom.js — 共用極簡 fake DOM（T3）
 *
 * 來源：ui/annotation.test.mjs 與 ui/classification.test.mjs 各自複製的
 *       makeEl / makeFakeDocument。兩者的元素形狀幾乎相同，差異只在於
 *       「副作用記錄欄位」的命名慣例（listeners vs handlers、_focused vs focused）。
 *       本檔以「同一物件參考」同時提供兩組名稱，確保既有斷言逐字不變。
 *
 * 設計約束（T3 為純搬移，見 log/plan/ComprehensiveAudit_2026-09-27.md §9.6）：
 *   - 不得改變任何測試斷言；本檔只提供原本就存在的欄位與方法。
 *   - 新增欄位一律採「多寫一份、不刪既有」，確保兩種舊慣例同時成立。
 *
 * 最小介面（§11 T3 前置盤點）：
 *   getElementById / querySelector / classList / style / listeners /
 *   innerHTML / insertAdjacentHTML
 */

/**
 * 建立極簡 fake element。
 * @param {string} [id=''] 元素 id
 * @param {object} [overrides] 覆寫／追加欄位
 */
export function makeEl(id = '', overrides = {}) {
    const classes = new Set();

    // listeners 與 handlers 為「同一個物件參考」：
    //   annotation.test.mjs 斷言 el.listeners.keydown
    //   classification.test.mjs 斷言 el.handlers['keydown']
    // 兩者必須指向同一份資料，故不可各自獨立建立。
    const listeners = {};
    const handlers = listeners;

    const el = {
        id,
        tagName: 'DIV',
        className: '',
        value: '',
        checked: false,
        disabled: false,
        tabIndex: 0,
        dataset: {},
        style: {},
        innerHTML: '',
        textContent: '',
        src: '',
        onclick: null,
        onchange: null,
        // classList 兩種存取風格並存：elements 與 _set 各指向同一個 Set
        classes,
        classList: {
            _set: classes,
            add: (...c) => c.forEach(x => classes.add(x)),
            remove: (...c) => c.forEach(x => classes.delete(x)),
            contains: (c) => classes.has(c)
        },
        listeners,
        handlers,
        // insertAdjacentHTML 的兩種記錄風格並存
        insertAdjacentHTMLCalls: [],
        addEventListener(type, fn) {
            (listeners[type] = listeners[type] || []).push(fn);
        },
        removeEventListener(type, fn) {
            const arr = listeners[type] || [];
            const i = arr.indexOf(fn);
            if (i >= 0) arr.splice(i, 1);
        },
        insertAdjacentHTML(pos, html) {
            el._insertedHTML = (el._insertedHTML || '') + html;
            el.insertAdjacentHTMLCalls.push({ pos, html });
        },
        focus() { el._focused = true; el.focused = true; },
        remove() { el._removed = true; el.removed = true; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        ...overrides
    };

    return el;
}

/**
 * 建立 fake document。
 * 支援兩種入參：
 *   - 字串陣列：為每個 id 建立一個新元素（annotation.test.mjs 舊用法）
 *   - 物件：id → 既有元素（classification.test.mjs 舊用法）
 * @param {string[]|Record<string, object>} idsOrMap
 */
export function makeFakeDocument(idsOrMap = []) {
    if (Array.isArray(idsOrMap)) {
        const registry = new Map();
        for (const id of idsOrMap) registry.set(id, makeEl(id));
        return {
            getElementById: (id) => registry.get(id) || null,
            querySelector: () => null,
            querySelectorAll: () => []
        };
    }
    return {
        getElementById: (id) => idsOrMap[id] || null,
        querySelector: () => null,
        querySelectorAll: () => []
    };
}
