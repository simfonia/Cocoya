/**
 * [P2-13] validate() 問題清單的文案翻譯層。
 *
 * 為何獨立成檔：
 *   spec.js 是**純函式層**，不該知道 Blockly / 語系存在。validate() 現在只回傳
 *   { code, params }，由本檔負責查表並呼叫 t()。好處：
 *     - spec.test.mjs 斷言 code 而非文案 → 文案改寫不會誤報測試失敗
 *     - 測試不需要掛 Blockly / Blockly.Msg
 *     - code → params 順序的對應集中在 MESSAGES 宣告處，一眼可對照翻譯
 *
 * 這與 AGENTS.md「錯誤碼在後端定義、人類可讀文案由前端 i18n 負責」是同一慣例，
 * 只是把後端 → 前端的邊界換成 core → ui。
 *
 * ⚠️ MESSAGES 的 fallback 一律用**英文**：fallback 是「翻譯系統失效時的最後防線」，
 *    對非中文語系用戶而言中文 fallback 反而更糟（P2-15 實測踩過）。
 */
import { t } from '../i18n.js';

/** code → 英文 fallback（含 %1/%2 佔位，順序須與 spec.js 的 issue(code, ...params) 一致） */
export const VALIDATION_MESSAGES = {
    VALIDATE_VERSION_UNSUPPORTED: 'Unsupported spec version "%1". Expected "%2".',
    VALIDATE_PROJECT_NAME_REQUIRED: 'Project name is required.',
    VALIDATE_PROJECT_TYPE_INVALID: 'Project type must be one of: %1.',
    VALIDATE_SOURCE_MODE_INVALID: 'Data source mode must be one of: %1.',
    VALIDATE_NO_SAMPLES: 'No images imported yet. Select an image folder or capture photos with the camera.',
    VALIDATE_NO_SAMPLES_FEATURE: 'No feature samples captured yet. Start the camera and click "Capture Feature" to collect samples.',
    VALIDATE_COLUMN_REQUIRED: 'No columns defined yet. Import a CSV/JSON file, or click "Add Feature / Add Label" to create one.',
    VALIDATE_COLUMN_MISSING_NAME: 'Column %1 is missing a name.',
    VALIDATE_COLUMN_DUPLICATE: 'Duplicate column name: %1.',
    VALIDATE_COLUMN_INVALID_TYPE: 'Column "%1" has invalid type "%2".',
    VALIDATE_COLUMN_INVALID_ROLE: 'Column "%1" has invalid role "%2".',
    VALIDATE_FEATURE_NOT_FOUND: 'Feature column "%1" does not exist in schema.columns.',
    VALIDATE_LABEL_NOT_FOUND: 'Label column "%1" does not exist in schema.columns.',
    VALIDATE_UNLABELED_SAMPLES: 'Captured %1 photos, %2 of them have no label yet.',
    VALIDATE_NO_LABEL: 'No label column is assigned yet.',
    VALIDATE_NO_FEATURES: 'No feature columns are assigned yet.'
};

/** 未知 code 的 fallback（不靜默吞掉：新 code 忘了加文案時必須看得出來） */
const UNKNOWN = (code) => `[未定義的驗證代碼：${code}]`;

/**
 * 把單一問題物件翻譯成字串。
 * @param {{code: string, params: any[]}} issue validate() 的元素
 * @param {Function} [translator] i18n 函式，預設用模組內的 t
 */
export function localizeValidationIssue(issue, translator = t) {
    if (!issue || typeof issue.code !== 'string') return UNKNOWN(String(issue));
    const fallback = VALIDATION_MESSAGES[issue.code] ?? UNKNOWN(issue.code);
    return translator(issue.code, fallback, ...(issue.params || []));
}

/**
 * 把整份 validate() 結果翻譯成 { ok, errors: string[], warnings: string[] }，
 * 供既有 UI 呼叫端（renderValidation / 狀態訊息）直接使用。
 *
 * 保留 ok 欄位，呼叫端不必同時持有兩份結果。
 * @param {{ok: boolean, errors: Array, warnings: Array}} result validate() 的回傳
 */
export function localizeValidationResult(result, translator = t) {
    return {
        ok: result.ok,
        errors: (result.errors || []).map((i) => localizeValidationIssue(i, translator)),
        warnings: (result.warnings || []).map((i) => localizeValidationIssue(i, translator))
    };
}