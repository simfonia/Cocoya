/**
 * core/typePolicy.js — 專案類型政策 SSOT（M1，R3）
 * 收斂散落各處的類型判斷：spec.js IMAGE_TYPES / ui_layout.js TYPE_TO_MODES_MAP /
 * exportUseCases 的 bbox 檢查 / 各處 `projectType === 'image'`。
 * 純邏輯，禁文案（i18n 由呼叫端負責）。
 */

const IMAGE_TYPES = ['image', 'object_detection', 'line_following'];
const DEV_TYPES = ['feature', 'serial'];
const STABLE_TYPES = ['image', 'object_detection', 'line_following', 'table'];

const TYPE_TO_MODES_MAP = {
    table: ['file'],
    feature: ['file'],
    serial: ['file'],
    image: ['live', 'file'],
    object_detection: ['live', 'file'],
    line_following: ['live', 'file']
};

export function isImageType(projectType) {
    return IMAGE_TYPES.indexOf(projectType) !== -1;
}

export function needsAnnotationCheck(projectType) {
    return projectType === 'object_detection' || projectType === 'line_following';
}

export function needsUnclassifiedCheck(projectType) {
    return projectType === 'object_detection';
}

export function isClassificationType(projectType) {
    return projectType === 'image';
}

export function isDevType(projectType) {
    return DEV_TYPES.indexOf(projectType) !== -1;
}

export function allowedModes(projectType) {
    return (TYPE_TO_MODES_MAP[projectType] || ['file']).slice();
}

export function imageTypes() {
    return IMAGE_TYPES.slice();
}

export function devTypes() {
    return DEV_TYPES.slice();
}

export function stableTypes() {
    return STABLE_TYPES.slice();
}
