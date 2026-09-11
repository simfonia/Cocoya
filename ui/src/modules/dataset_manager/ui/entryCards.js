/**
 * ui/entryCards.js — DM 卡片入口（M1，R2）
 * 純模板＋目錄 SSOT，無 DOM 副作用、可單元測試。
 * TYPE_CATALOG：6 類型 id／標題key／描述key／範例key／狀態 stable|dev／允許 modes。
 * i18n 由呼叫端注入 t()；模板僅輸出 key 對應的譯文。
 */
import { escapeHtml as esc } from '../core/html.js';

export const TYPE_CATALOG = [
    { id: 'image', status: 'stable', modes: ['live', 'file'] },
    { id: 'object_detection', status: 'stable', modes: ['live', 'file'] },
    { id: 'line_following', status: 'stable', modes: ['live', 'file'] },
    { id: 'table', status: 'stable', modes: ['file'] },
    { id: 'feature', status: 'dev', modes: ['file'] },
    { id: 'serial', status: 'dev', modes: ['file'] }
];

export function getTypeEntry(typeId) {
    return TYPE_CATALOG.find((entry) => entry.id === typeId) || null;
}

export function isDevEntry(typeId) {
    const entry = getTypeEntry(typeId);
    return entry ? entry.status === 'dev' : false;
}

/**
 * 建構卡片入口 innerHTML（純函式）。
 * @param {object} deps
 * @param {Function} deps.t i18n（t('KEY', fallback)）
 */
export function buildEntryTemplate({ t }) {
    const cards = TYPE_CATALOG.map((entry) => {
        const title = t('ENTRY_TYPE_' + entry.id.toUpperCase(), entry.id);
        const desc = t('ENTRY_DESC_' + entry.id.toUpperCase(), '');
        const badge = entry.status === 'dev'
            ? '<span class="dataset-entry-dev-badge">' + esc(t('ENTRY_DEV_BADGE', '開發中，功能未完善')) + '</span>'
            : '';
        return '<button type="button" class="dataset-entry-card dataset-entry-' + entry.id
            + (entry.status === 'dev' ? ' is-dev' : '')
            + '" data-type="' + entry.id + '">'
            + '<span class="dataset-entry-card-title">' + esc(title) + '</span>'
            + badge
            + '<span class="dataset-entry-card-desc">' + esc(desc) + '</span>'
            + '</button>';
    }).join('');
    return '<div class="dataset-entry">'
        + '<h3 class="dataset-entry-title">' + esc(t('ENTRY_TITLE', '選擇資料集類型')) + '</h3>'
        + '<p class="dataset-entry-subtitle">' + esc(t('ENTRY_SUBTITLE', '選定後將鎖定類型；換類型請回此頁另開新資料集')) + '</p>'
        + '<div class="dataset-entry-grid">' + cards + '</div>'
        + '</div>';
}
