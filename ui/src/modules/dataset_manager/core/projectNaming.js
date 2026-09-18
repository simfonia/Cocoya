import { normalizePath } from './pathPolicy.js';

export function sanitizeProjectName(value) {
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

export function isProjectNameEqual(left, right) {
    return sanitizeProjectName(left) === sanitizeProjectName(right);
}

/** canonical 命名空間錨點段：<專案根>/dataset/<資料集名稱>/<標籤>/<檔名> */
const DATASET_NAMESPACE_SEGMENT = 'dataset';

function segmentsOf(value) {
    return normalizePath(value).split('/').filter((segment) => segment !== '');
}

/**
 * 由 live 落盤絕對路徑取「資料集名稱」。三段式判定（保守：取不到就回 ''＝無證據，不誤報）：
 * 1. 首選（最精確）：以該影像自身的 `<標籤>/<檔名>` 尾段反推 → 倒數第三段即資料集名稱
 *    （真實 live 路徑必含標籤目錄；此規則不受「專案根內恰好也有 dataset 目錄」影響）。
 * 2. 次選：以第一個 `dataset` 命名空間段為錨點（兼容資料集名稱本身就叫 `dataset`），
 *    且其後至少還需 `<標籤>/<檔名>` 兩段，否則視為無證據。
 * 3. 皆不符 → ''。
 * @param {string} diskPath 影像落盤絕對路徑（可為反斜線）
 * @param {{name?: string, label?: string}} [image] 對應的 state.images 項目（尾段比對用）
 */
export function datasetNameFromImagePath(diskPath, image = {}) {
    const segments = segmentsOf(diskPath);
    if (segments.length < 3) return '';

    const fileName = segments[segments.length - 1];
    const labelSegment = segments[segments.length - 2];
    const expectName = String(image.name || '').trim();
    const expectLabel = String(image.label || '').trim();
    const suffixMatched = segments.length >= 5 && expectName !== '' && fileName === expectName
        && (expectLabel === '' || labelSegment === expectLabel);
    if (suffixMatched) return segments[segments.length - 3];

    const anchor = segments.indexOf(DATASET_NAMESPACE_SEGMENT);
    if (anchor >= 0 && anchor + 3 < segments.length) return segments[anchor + 1];
    return '';
}

/** 由 folder 路徑取資料集名稱（僅接受 canonical 形狀：取 `dataset` 段之後一段；非 canonical → ''） */
export function datasetNameFromFolderPath(folderPath) {
    const segments = segmentsOf(folderPath);
    const anchor = segments.lastIndexOf(DATASET_NAMESPACE_SEGMENT);
    if (anchor >= 0 && anchor + 1 < segments.length) return segments[anchor + 1];
    return '';
}

/**
 * 方案 A（2026-09-17）：偵測「資料集名稱」與磁碟既有落盤資料夾名稱是否已漂移。
 *
 * 只用既有 state 的兩項穩定證據（**無 IO、無後端指令**）：
 * 1. `img.diskPath`：live 拍照落盤的絕對路徑（= `dataset/<名稱>/<標籤>/<檔>`），改名不會改寫它。
 * 2. `state.sourceFolderPath`：file 匯入時設定的 canonical 目錄（= `dataset/<名稱>`），改名不會更新它。
 *
 * 未落盤（兩者皆無／取不到名稱）→ 回報未漂移，代表名稱可自由變更（設計契約，不是偵測失敗）。
 * 已知限制：feature/table 的 live 僅落盤 dataset.json，無上述證據 → 不提示（影響僅多一份 dataset.json）。
 *
 * @param {{images?: Array, sourceFolderPath?: string|null}} state
 * @param {string} newName 目前表單上的資料集名稱（空值視為 fallback 'dataset'）
 * @returns {{drifted: boolean, diskName: string|null, source: ('live'|'import'|null)}}
 */
export function detectDatasetNameDrift(state, newName) {
    const source = state || {};
    const target = sanitizeProjectName(newName) || 'dataset';
    const list = Array.isArray(source.images) ? source.images : [];

    let diskName = '';
    let evidence = null;

    for (const img of list) {
        if (!img || !img.diskPath) continue;
        const name = datasetNameFromImagePath(img.diskPath, img);
        if (name) {
            diskName = name;
            evidence = 'live';
            break;
        }
    }
    if (!diskName && source.sourceFolderPath) {
        const name = datasetNameFromFolderPath(source.sourceFolderPath);
        if (name) {
            diskName = name;
            evidence = 'import';
        }
    }

    return {
        drifted: Boolean(diskName) && diskName !== target,
        diskName: diskName || null,
        source: evidence
    };
}
