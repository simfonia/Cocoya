/**
 * ui/src/core/settingsApi.js — 偏好存取的 ESM adapter
 *
 * 【為何需要這層】偏好邏輯的單一真實來源在 settings.js（classic script，掛
 * globalThis.CocoyaSettings，供 index.html 以 <script> 順序載入）。但 bridge/
 * 下的模組是 **ESM**（由 tauri_send_dispatch.test.mjs 直接 import 測試），
 * 該情境不存在 globalThis → 直接寫 CocoyaSettings.get() 會 ReferenceError。
 *
 * 實測踩到：resetFirmware 的燒錄失敗提示分支因此失效，錯誤訊息被
 * "CocoyaSettings is not defined" 取代（測試 4 例紅燈）。
 *
 * 本 adapter 解決兩件事，且**不複製任何邏輯**：
 *   1. 瀏覽器：委派給 globalThis.CocoyaSettings（同一份實作）
 *   2. Node／無全域時：以 localStorage 直接讀寫，並套用相同的
 *      coerce（'1'/'true' → true）語意
 *
 * ⚠️ 改 settings.js 的 coerce 規則時，必須同步此處 fallback —— 已有守門
 *    settings.test.mjs 對兩條路徑斷言行為一致。
 */
import { SETTINGS_KEY } from './settingsKeys.js';

/** 取得瀏覽器端的單一真實來源；不存在則回 null。 */
function ssot() {
    try {
        return (typeof globalThis !== 'undefined' && globalThis.CocoyaSettings) || null;
    } catch (e) {
        return null;
    }
}

/** key → 型別規則（與 settings.js 的 SCHEMA 保持一致）。 */
const SCHEMA = {
    [SETTINGS_KEY.LANG]: 'string',
    [SETTINGS_KEY.PLATFORM]: 'string',
    [SETTINGS_KEY.ENV_SETUP_DONE]: 'boolean',
    [SETTINGS_KEY.HIGHLIGHT_COLOR]: 'string',
    [SETTINGS_KEY.SERIAL_PREFERRED_PORT]: 'string',
    [SETTINGS_KEY.SERIAL_RAW_DUMP_ENABLED]: 'boolean',
    [SETTINGS_KEY.SERIAL_UPLOAD_ONLY]: 'boolean',
    [SETTINGS_KEY.TRAINING_BACKEND]: 'string',
    [SETTINGS_KEY.TRAINING_PROJECT_NAME]: 'string',
    [SETTINGS_KEY.TRAINING_TASK_TYPE]: 'string',
    [SETTINGS_KEY.THEME_MODE]: 'string',
    [SETTINGS_KEY.DM_CROSSHAIR_COLOR]: 'string',
    [SETTINGS_KEY.PYTHON_PATH]: 'string'
};

function raw(key) {
    try {
        const ls = (typeof globalThis !== 'undefined' && globalThis.localStorage) || null;
        return ls ? ls.getItem(key) : null;
    } catch (e) {
        return null;   // 隱私模式等情境
    }
}

export { SETTINGS_KEY };

/** 讀取偏好；型別不符或不存在時回預設值。永不拋出。 */
export function getSetting(key) {
    const s = ssot();
    if (s) return s.get(key);
    const v = raw(key);
    if (v === null || v === undefined || v === '') return undefined;
    if (SCHEMA[key] === 'boolean') return v === '1' || v === 'true';
    return v;
}

/** 寫入偏好。回傳是否寫入成功。 */
export function setSetting(key, value) {
    const s = ssot();
    if (s) return s.set(key, value);
    try {
        const ls = (typeof globalThis !== 'undefined' && globalThis.localStorage) || null;
        if (!ls) return false;
        ls.setItem(key, SCHEMA[key] === 'boolean' ? (value ? '1' : '0') : String(value));
        return true;
    } catch (e) {
        return false;
    }
}