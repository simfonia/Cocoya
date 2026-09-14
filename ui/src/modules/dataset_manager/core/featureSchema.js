/**
 * core/featureSchema.js — feature 類型動態特徵 schema SSOT（M4）
 *
 * feature 類型＝MediaPipe 提取關鍵點（Hand 21 + Pose 33）→ 組表格樣本。
 * 本模組為「前端唯一」的欄位/row 組裝契約（純函式、禁文案、Node 可測）：
 *  - buildFeatureColumns({ useZ })：依是否含 z 產出完整 schema（columns/features/label）
 *  - landmarksToRow({ hand, pose, label, useZ })：手/姿勢 landmark → 一列樣本 object
 *  - errorCode 常數：FEATURE_MEDIAPIPE_MISSING（供 sidecar 回傳、前端 i18n 對譯）
 *
 * 欄位命名契約：hand_<i>_x/y(/z)（i=0..20）、pose_<i>_x/y(/z)（i=0..32）＋ label。
 * 含 z → 維度 63+99+label=163 欄；不含 z → 42+66+label=109 欄。
 */

export const HAND_POINTS = 21;
export const POSE_POINTS = 33;

/** 與 sidecar（dataset_sidecar.py）共用的缺裝錯誤代碼（後端不出展示文案，前端 i18n） */
export const FEATURE_MEDIAPIPE_MISSING = 'FEATURE_MEDIAPIPE_MISSING';

/** 依是否含 z 產生特徵欄位名稱清單（不含 label） */
export function featureColumnNames({ useZ = false } = {}) {
    const names = [];
    const axes = useZ ? ['x', 'y', 'z'] : ['x', 'y'];
    for (let i = 0; i < HAND_POINTS; i++) {
        axes.forEach((a) => names.push(`hand_${i}_${a}`));
    }
    for (let i = 0; i < POSE_POINTS; i++) {
        axes.forEach((a) => names.push(`pose_${i}_${a}`));
    }
    return names;
}

/** 依是否含 z 建構完整 schema（陣列版，供 syncSpecFromUI / live panel 使用） */
export function buildFeatureSchema({ useZ = false } = {}) {
    const featureNames = featureColumnNames({ useZ });
    const columns = featureNames.map((name) => ({ name, type: 'float', role: 'feature' }));
    const label = 'label';
    columns.push({ name: label, type: 'string', role: 'label' });
    return {
        columns,
        features: featureNames,
        label
    };
}

/**
 * 將 sidecar collectFeature 回傳的 landmark 結構轉成單一表格樣本 row。
 * @param {object} input
 * @param {Array<Array<number>>} [input.hand] 21×3（或 21×2）歸一化座標；缺/未偵測為 null
 * @param {Array<Array<number>>} [input.pose] 33×3（或 33×2）歸一化座標；缺/未偵測為 null
 * @param {string} [input.label]
 * @param {boolean} [input.useZ] 是否含 z（必須與採集時一致，避免欄位錯位）
 * @returns {object} row 樣本（欄位數=axes×54＋label）
 */
export function landmarksToRow({ hand = null, pose = null, label = '', useZ = false } = {}) {
    // 預填所有特徵欄位為 0，確保未偵測（null）時該列欄位仍完整（CSV 一致性）
    const axes = useZ ? ['x', 'y', 'z'] : ['x', 'y'];
    const row = {};
    featureColumnNames({ useZ }).forEach((name) => { row[name] = 0; });

    const writePoints = (prefix, points) => {
        if (!Array.isArray(points)) return;
        points.forEach((p, i) => {
            if (!Array.isArray(p)) return;
            axes.forEach((a, ai) => {
                row[`${prefix}_${i}_${a}`] = Number.isFinite(p[ai]) ? p[ai] : 0;
            });
        });
    };
    writePoints('hand', hand);
    writePoints('pose', pose);
    row.label = label;
    return row;
}

/**
 * 由 row 反推維度（含/不含 z）供 feature_train 等下游判定 schema。
 * 回傳 null 表示無法判定（無特徵欄位）。
 */
export function detectUseZ(rawRow) {
    if (!rawRow || typeof rawRow !== 'object') return null;
    return typeof rawRow['hand_0_z'] === 'number' ? true
        : (typeof rawRow['hand_0_x'] === 'number' ? false : null);
}