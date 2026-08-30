/**
 * Dataset Manager application/annotationMutations.js — 標註/分類 mutation 純函式（Stage 3 切片 4）
 *
 * 無 DOM / Bridge 依賴，可單元測試。語意與 ui_layout.js 原實作一致：
 * 「已標註」= annotations 存在且長度 > 0；「未分類框」= class_id === -1。
 */

/** 已標註影像數（annotations 非空陣列） */
export function countAnnotated(images) {
    return images.filter((img) => img.annotations && img.annotations.length > 0).length;
}

/** 未標註影像數 */
export function countUnannotated(images) {
    return images.length - countAnnotated(images);
}

/** 未分類標註框總數（class_id === -1，僅物件偵測） */
export function countUnclassifiedBoxes(images) {
    return images.reduce((sum, img) =>
        sum + (img.annotations?.filter((a) => a.class_id === -1).length || 0), 0);
}

/** 指定 class_id 的標註框總數 */
export function countBoxesWithClassId(images, classId) {
    return images.reduce((s, img) => s + (img.annotations?.filter((a) => a.class_id === classId).length || 0), 0);
}

/** 使用指定 label 名稱的影像數（image 分類類型） */
export function countImagesWithLabel(images, labelName) {
    return images.filter((img) => img.label === labelName).length;
}

/**
 * 刪除所有影像中指定 class_id 的標註框（原地修改，回傳刪除總數）
 */
export function removeAnnotationsByClassId(images, classId) {
    let removed = 0;
    images.forEach((img) => {
        if (img.annotations) {
            const before = img.annotations.length;
            img.annotations = img.annotations.filter((a) => a.class_id !== classId);
            removed += before - img.annotations.length;
        }
    });
    return removed;
}

/**
 * 分類刪除類別：把使用該 label 的影像改為 unlabeled（原地修改，回傳改動數）
 * 避免載入時又被回填進 label_map。
 */
export function reassignLabelsToUnlabeled(images, labelName) {
    let changed = 0;
    images.forEach((img) => {
        if (img.label === labelName) {
            img.label = 'unlabeled';
            changed++;
        }
    });
    return changed;
}

/**
 * 計算「刪除目前高亮標註」的目標索引：選擇無效時退回最後一個；空陣列回 -1。
 */
export function resolveDeleteIndex(annotations, selectedIndex) {
    const anns = annotations || [];
    if (anns.length === 0) return -1;
    if (selectedIndex < 0 || selectedIndex >= anns.length) return anns.length - 1;
    return selectedIndex;
}

/** 指定索引設定 class_id（回傳是否成功） */
export function setAnnotationClassId(annotations, index, classId) {
    if (!annotations || index < 0 || index >= annotations.length) return false;
    annotations[index].class_id = classId;
    return true;
}

/** 指定索引刪除標註（回傳是否成功） */
export function removeAnnotationAt(annotations, index) {
    if (!annotations || index < 0 || index >= annotations.length) return false;
    annotations.splice(index, 1);
    return true;
}
