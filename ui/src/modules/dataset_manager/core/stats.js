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
