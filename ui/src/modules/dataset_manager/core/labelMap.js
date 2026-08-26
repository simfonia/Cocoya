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
