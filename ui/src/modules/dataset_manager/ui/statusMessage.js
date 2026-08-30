/**
 * ui/statusMessage.js
 *
 * 集中式狀態訊息 Presenter（Dataset Manager modal 頂部中央，所有模式皆可見）。
 * Stage 4 切片 1：自 `ui_layout.js` 抽出的純呈現邏輯，無商業邏輯與通訊依賴。
 *
 * 行為契約（與重構前完全一致，不變）：
 * - 顯示於 `#dataset-manager-message` 元素。
 * - 預設 8 秒後自動清除；可用 `{ duration }` 覆寫（`0` = 不自動清除）。
 * - 顯示前會重置計時器，避免多筆訊息交錯時被舊計時器提前隱藏。
 * - 傳入空字串 / `undefined` 立即隱藏。
 * - `dispose()` 取消進行中的計時器，供 modal 關閉 / i18n reload 時釋放，防止 DOM 銷毀後殘留回呼。
 *
 * `documentRef` 可注入（測試用）；未提供時使用 global document。
 */

const MESSAGE_ELEMENT_ID = 'dataset-manager-message';
const STATUS_MESSAGE_DURATION = 8000;

export function createStatusMessageUI(documentRef) {
    const doc = documentRef
        || (typeof globalThis !== 'undefined' ? globalThis.document : null);

    let statusMessageTimer = null;

    /**
     * 顯示集中式狀態訊息（modal 頂部中央，所有模式皆可見）。
     * @param {string} message 欲顯示的訊息文字；空字串/undefined 立即隱藏。
     * @param {object} [options]
     * @param {number} [options.duration=8000] 顯示毫秒數（0 = 不自動清除）。
     */
    function showStatusMessage(message, options = {}) {
        const el = doc && doc.getElementById ? doc.getElementById(MESSAGE_ELEMENT_ID) : null;
        if (!el) return;
        if (statusMessageTimer) {
            clearTimeout(statusMessageTimer);
            statusMessageTimer = null;
        }
        if (!message) {
            el.style.display = 'none';
            el.textContent = '';
            return;
        }
        el.textContent = message;
        el.style.display = 'flex';
        const duration = options.duration === undefined ? STATUS_MESSAGE_DURATION : options.duration;
        if (duration > 0) {
            statusMessageTimer = setTimeout(() => {
                el.style.display = 'none';
                el.textContent = '';
                statusMessageTimer = null;
            }, duration);
        }
    }

    /**
     * 取消進行中的自動清除計時器（modal 關閉 / 重建時呼叫，防止 DOM 銷毀後回呼）。
     */
    function dispose() {
        if (statusMessageTimer) {
            clearTimeout(statusMessageTimer);
            statusMessageTimer = null;
        }
    }

    return { showStatusMessage, dispose };
}