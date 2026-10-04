function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeLabelMap(labelMap) {
    if (!isPlainObject(labelMap)) return {};

    const normalized = {};
    Object.keys(labelMap).forEach((key) => {
        const cleanKey = String(key).trim();
        if (!cleanKey) return;

        const value = Number(labelMap[key]);
        normalized[cleanKey] = Number.isInteger(value) && value >= 0
            ? value
            : Object.keys(normalized).length;
    });
    return normalized;
}

export function cleanLabelMap(labelMap) {
    const cleaned = {};
    if (!isPlainObject(labelMap)) return cleaned;

    Object.keys(labelMap).forEach((key) => {
        const cleanKey = String(key).trim();
        const value = Number(labelMap[key]);
        if (!cleanKey) return;
        if (Number.isInteger(value) && value >= 0) {
            cleaned[cleanKey] = value;
        }
    });
    return cleaned;
}

export function buildLabelMap(columns, currentLabelMap) {
    const current = cleanLabelMap(currentLabelMap);
    const list = Array.isArray(columns) ? columns : [];
    const labelColumn = list.find((column) => column && column.role === 'label');

    if (!labelColumn && Object.keys(current).length > 0) return current;
    if (!labelColumn) return {};
    return current;
}

export function nextLabelId(labelMap) {
    const normalized = cleanLabelMap(labelMap);
    const ids = Object.keys(normalized).map((key) => normalized[key]);
    if (ids.length === 0) return 0;
    return Math.max.apply(null, ids) + 1;
}

/**
 * 依字母序取出標籤 [name, id] 配對清單。
 *
 * [T4 2026-10-03] 為何需要這個 SSOT：
 *   專案有 4 處渲染標籤下拉清單，排序一度不一致 ——
 *     classification.js  有排序（localeCompare）
 *     annotation.js       無排序（取鍵插入順序，使用者增刪標籤後順序會跳動）
 *     featurePanel.js     無排序（同上）
 *     samplerPanel.js     無排序（同上）
 *   同一份 label_map 在不同面板顯示不同順序，使用者會誤以為資料不一致。
 *
 * @param {object} labelMap
 * @returns {Array<[string, number]>}
 */
export function sortedLabelEntries(labelMap) {
    const current = cleanLabelMap(labelMap);
    return Object.entries(current).sort((a, b) => a[0].localeCompare(b[0]));
}

/**
 * 依字母序取出標籤名稱陣列（下拉清單用）。
 * @param {object} labelMap
 * @returns {string[]}
 */
export function sortedLabelNames(labelMap) {
    return sortedLabelEntries(labelMap).map(([name]) => name);
}
