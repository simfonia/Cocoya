/**
 * core/html.js — HTML 轉義共用（M2，R4）
 * 收斂散落各處的 escape 實作：
 * ui_layout.js escapeHtml / ui_components.js escapeHTML（轉義體損壞）/
 * ui/entryCards.js esc() / ui/dialogs.js 區域 escapeHtml。
 * 純函式，無 DOM 依賴，可單元測試。呼叫端經依賴注入使用。
 */

/**
 * 轉義 HTML 文字內容（含屬性值通用）。
 * @param {*} value 任意值（null/undefined → ''）
 * @returns {string} 已轉義字串
 */
export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 轉義 HTML 屬性值（與 escapeHtml 同規則，語意別名）。
 * @param {*} value 任意值
 * @returns {string} 已轉義字串
 */
export function escapeAttr(value) {
    return escapeHtml(value);
}
