/**
 * core/typePolicy.js — 專案類型政策 SSOT（M1，R3）
 * 收斂散落各處的類型判斷：spec.js PROJECT_TYPES／IMAGE_TYPES /
 * ui_layout.js TYPE_TO_MODES_MAP / exportUseCases 的 bbox 檢查 / 各處 `projectType === 'image'`。
 * 純邏輯，禁文案（i18n 由呼叫端負責）。
 *
 * 2026-10-01（P1-1）：補 ALL_TYPES 與 isFeatureType，讓 spec.js 的
 * PROJECT_TYPES／IMAGE_TYPES 改為 import 本模組，消除「同一份類型清單兩處維護」。
 */

const IMAGE_TYPES = ['image', 'object_detection', 'line_following'];
const DEV_TYPES = ['serial'];
const STABLE_TYPES = ['image', 'object_detection', 'line_following', 'table', 'feature'];
// 全部合法類型（spec.js validate() 的 PROJECT_TYPES 單一來源）
const ALL_TYPES = ['image', 'object_detection', 'feature', 'serial', 'table', 'line_following'];

const TYPE_TO_MODES_MAP = {
    table: ['file'],
    feature: ['live', 'file'],
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

export function isFeatureType(projectType) {
    return projectType === 'feature';
}

export function isDevType(projectType) {
    return DEV_TYPES.indexOf(projectType) !== -1;
}

export function isKnownType(projectType) {
    return ALL_TYPES.indexOf(projectType) !== -1;
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

/** 全部合法專案類型；順序即 validate() 錯誤訊息中的列舉順序，改動會影響文案 */
export function projectTypes() {
    return ALL_TYPES.slice();
}
