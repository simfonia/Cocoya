/**
 * ui/statusMessage.js
 *
 * 集中式狀態訊息 Presenter（Dataset Manager modal 頂部中央，所有模式皆可見）。
 * Stage 4 切片 1：自 `ui_layout.js` 抽出的純呈現邏輯，無商業邏輯與通訊依賴。
 *
 * 行為契約（2026-09-18 更新：隱藏時底色/邊框透明，視覺連貫）：
 * - 顯示於 `#dataset-manager-message` 元素（常駐，寬度同 modal 內容列）。
 * - 預設 5 秒後自動隱藏；可用 `{ duration }` 覆寫（`0` = 不自動清除）。
 * - 顯示/隱藏以 `visibility` 切換（保留排版空間），避免版面上下伸縮造成誤觸。
 * - 隱藏時另移除 `is-visible` class，讓粉底/邊框轉為透明——空著時只呈現原背景色，
 *   與「初始無訊息」狀態一致，不再出現「一開始有粉條、第一次訊息後才消失」的不連貫。
 * - 顯示前會重置計時器，避免多筆訊息交錯時被舊計時器提前隱藏。
 * - 傳入空字串 / `undefined` 立即隱藏。
 * - `dispose()` 取消進行中的計時器，供 modal 關閉 / i18n reload 時釋放，防止 DOM 銷毀後殘留回呼。
 *
 * `documentRef` 可注入（測試用）；未提供時使用 global document。
 */

const MESSAGE_ELEMENT_ID = 'dataset-manager-message';
const STATUS_MESSAGE_DURATION = 5000;

export function createStatusMessageUI(documentRef) {
    const doc = documentRef
        || (typeof globalThis !== 'undefined' ? globalThis.document : null);

    let statusMessageTimer = null;

    function setVisible(el, visible) {
        el.style.visibility = visible ? 'visible' : 'hidden';
        if (el.classList) {
            el.classList.toggle('is-visible', visible);
        }
    }

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
            // 常駐列：隱藏僅切 visibility + 移除 is-visible（保留排版空間，底色透明）
            setVisible(el, false);
            el.textContent = '';
            return;
        }
        el.textContent = message;
        setVisible(el, true);
        const duration = options.duration === undefined ? STATUS_MESSAGE_DURATION : options.duration;
        if (duration > 0) {
            statusMessageTimer = setTimeout(() => {
                setVisible(el, false);
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