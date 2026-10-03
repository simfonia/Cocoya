/**
 * ui/test/depsStubs.js — 共用 deps 假身零碎（T3 殘項，2026-10-03）
 *
 * 【本檔解決什麼】
 * T3 首輪（2026-09-30）只收了 annotation/classification/form/featurePanel/samplerPanel
 * 五檔的 fake DOM。實查後仍散落各處的自造依賴：
 *
 *   1. `t: (key, fallback) => fallback || key`      —— 多檔重複
 *   2. `escapeHtml: (v) => String(v)`              —— featurePanel/labelManager 重複
 *   3. `t: (key, fallback) => \`[${key}:${fallback}]\`` —— modal.test.mjs 特有格式
 *   4. `optionList(values, selected)`               —— modal.test.mjs 與 panels.test.mjs
 *                                                       各寫一份且**輸出格式不同**
 *
 * 【為何不直接把 depsBuilder.js 的真實 t()／escapeHtml() 灌進所有檔】
 * 刻意保留「消除重複的**定義**、保留每檔的**選擇**」，理由：
 *
 *   - 真 `t()` 會查 `Blockly.Msg`。若某測試同時載入了 Blockly 全域
 *     （core_contract.test.mjs 就會），輸出會變成翻譯文案而非 fallback，
 *     斷言就依賴全域載入順序 → 隱性相依，正是 T3 要消除的東西。
 *   - 真 `escapeHtml()` 轉義 `& < > " '`；`panels.test.mjs` 的斷言
 *     （`assert.ok(html.includes('a&lt;b'))`）真假皆成立，
 *     但 `labelManager.test.mjs` 的舊假身**不轉義**，改成真實會改變輸出。
 *
 * 【若日後要統一改用真實 t()／escapeHtml()】
 * 請**逐檔**確認斷言仍成立後再換，並更新本檔說明；不要一次全換。
 */

/**
 * fallback 優先的假 t()：回傳 fallback，無 fallback 才回 key。
 * 與 production 的 t() 差異：不查 Blockly.Msg、不做 %N 佔位符替換。
 * @param {string} key
 * @param {string} [fallback]
 * @returns {string}
 */
export const fallbackT = (key, fallback) => fallback || key;

/**
 * `t()` 的「帶標記」變體：輸出 `[KEY:fallback]`。
 * 供 modal.test.mjs 使用 —— 該檔以 requireAllIds() 逐一比對字串，
 * 需要可辨識的固定前綴來確保每處 t() 都有對應 key。
 * @param {string} key
 * @param {string} [fallback]
 * @returns {string}
 */
export const taggedT = (key, fallback) => `[${key}:${fallback}]`;

/**
 * 不轉義的假 escapeHtml：僅做 null/undefined → ''，其餘原樣字串化。
 * ⚠️ 這**不是**安全的 HTML 轉義，只用於「測試資料本來就無特殊字元」，
 * 或「測試明確要驗未轉義輸出」的場合。
 * @param {*} v
 * @returns {string}
 */
export const rawEscapeHtml = (v) => String(v ?? '');

/**
 * 只轉義 `<` 的假 escapeHtml（panels.test.mjs 舊用法）。
 * 該檔斷言 `assert.ok(html.includes('a&lt;b'))` 只依賴 `<` 的轉換。
 * @param {*} v
 * @returns {string}
 */
export const angleEscapeHtml = (v) => String(v ?? '').replace(/</g, '&lt;');

/**
 * optionList 產生器 —— modal 版。
 * 輸出：`<option value="X" selected>X</option>`
 * ⚠️ 未選中時仍留一個空格（modal.test.mjs 的斷言依賴此形）。
 * @param {string[]} values
 * @param {string} selected
 * @returns {string}
 */
export function optionListModal(values, selected) {
    return values
        .map((value) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${value}</option>`)
        .join('');
}

/**
 * optionList 產生器 —— panels 版。
 * 輸出：`<option selected>X</option>`（**無 value 屬性**）
 * ⚠️ 與 modal 版輸出不同，故分為兩個函式而非合併 —— 這正是 T3 要消除的
 * 「各自寫一份、格式悄悄不同」的現象：命名後差異變得明確可查。
 * @param {string[]} values
 * @param {string} selected
 * @returns {string}
 */
export function optionListPanels(values, selected) {
    return values
        .map((value) => `<option ${value === selected ? 'selected' : ''}>${value}</option>`)
        .join('');
}
