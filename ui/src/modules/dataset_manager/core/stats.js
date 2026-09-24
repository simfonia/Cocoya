import { cleanLabelMap, nextLabelId } from './labelMap.js';

export function calculateStats(projectType, images, existingLabelMap) {
    const sourceImages = Array.isArray(images) ? images : [];
    const labelMap = cleanLabelMap(existingLabelMap);
    const labelCounts = {};

    if (projectType === 'image') {
        sourceImages.forEach((image) => {
            const key = String((image && image.label) || 'unlabeled').trim() || 'unlabeled';
            labelCounts[key] = (labelCounts[key] || 0) + 1;
            if (labelMap[key] === undefined) {
                labelMap[key] = nextLabelId(labelMap);
            }
        });
    } else {
        const idToName = {};
        Object.keys(labelMap).forEach((name) => {
            idToName[labelMap[name]] = name;
        });
        sourceImages.forEach((image) => {
            const annotations = image && Array.isArray(image.annotations) ? image.annotations : [];
            annotations.forEach((annotation) => {
                const name = idToName[annotation.class_id];
                if (name !== undefined) {
                    labelCounts[name] = (labelCounts[name] || 0) + 1;
                }
            });
        });
    }

    Object.keys(labelMap).forEach((label) => {
        if (labelCounts[label] === undefined) labelCounts[label] = 0;
    });

    return {
        labelMap,
        labelCounts,
        sampleCount: sourceImages.length
    };
}

/**
 * 2026-09-22 統計欄補強：計算「已標註影像張數」。
 * 偵測/循跡的 label_counts 是「框數/線段數」——採集後未標註時全為 0，
 * 初學者會誤以為沒拍到圖；故中欄統計面板另顯示張數（採集量）與已標註張數。
 * 分類（image）模式：label 即標註，全部視為已標註。
 * 表格系（table/feature/serial，無 state.images）回 0。
 * @param {string} projectType 專案類型
 * @param {Array<{annotations?: Array}>} images state.images
 * @returns {number} 已標註張數
 */
export function countAnnotatedImages(projectType, images) {
    const list = Array.isArray(images) ? images : [];
    if (projectType === 'image') return list.length;
    return list.filter((img) => Array.isArray(img && img.annotations) && img.annotations.length > 0).length;
}
