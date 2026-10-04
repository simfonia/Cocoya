/**
 * ui/src/core/settingsKeys.js — 偏好 key 的單一真實來源（ESM）
 *
 * 【為何獨立成檔】偏好存取有兩種載入情境：
 *   1. 瀏覽器：index.html 以 <script> 載 settings.js → 掛 globalThis.CocoyaSettings
 *   2. Node 測試：bridge/*.js 以 ESM `import` 載入 → **無 globalThis**
 * 若 key 只存在 settings.js 裡，(2) 會 ReferenceError（實測：resetFirmware 測試
 * 整條燒錄失敗提示分支因此失效，錯誤訊息被「CocoyaSettings is not defined」取代）。
 *
 * 故 key 清單獨立於此模組，settings.js 與各呼叫端皆引用本檔 —— 仍是單一真實來源。
 * 守門：settings.test.mjs 斷言 settings.js 掛出的 SETTINGS_KEY 與本檔完全一致。
 */

/** 偏好 key 名稱 → localStorage 實際鍵值。 */
export const SETTINGS_KEY = Object.freeze({
    LANG: 'cocoya_lang',
    PLATFORM: 'cocoya_platform',
    ENV_SETUP_DONE: 'cocoya_env_setup_done',
    HIGHLIGHT_COLOR: 'cocoya_highlight_color',
    SERIAL_PREFERRED_PORT: 'cocoya_serial_preferred_port',
    SERIAL_RAW_DUMP_ENABLED: 'cocoya_serial_raw_dump_enabled',
    SERIAL_UPLOAD_ONLY: 'cocoya_serial_upload_only',
    TRAINING_BACKEND: 'cocoya_training_backend',
    TRAINING_PROJECT_NAME: 'cocoya_training_project_name',
    TRAINING_TASK_TYPE: 'cocoya_training_task_type',
    // [2026-10-04 遷移] 原先以區域常數宣告（MODE_KEY / CROSSHAIR_STORAGE_KEY），
    // 收斂至此以免再產生第二份真實來源。
    THEME_MODE: 'cocoya_theme_mode',
    DM_CROSSHAIR_COLOR: 'cocoya_dm_crosshair_color',
    // 歷史遺留：無 cocoya_ 前綴，改名會使既有使用者設定遺失
    PYTHON_PATH: 'pythonPath'
});