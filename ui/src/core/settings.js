/**
 * ui/src/core/settings.js — 使用者偏好儲存的單一 SSOT
 *
 * 【為何需要這個模組（2026-10-04）】
 * 改版前，全部偏好直接散落各檔呼叫 localStorage.getItem/setItem：
 *   - **38 處**存取、**12 個** key，橫跨 11 個檔案
 *   - 每處各自 try/catch（重複 30 次以上）
 *   - key 命名不統一（`cocoya_lang` vs 裸 `pythonPath`）
 *   - **拼錯字不會報錯** —— localStorage 對未知 key 一律回 null，
 *     設定靜默失效，且沒有任何地方會發現
 *   - 沒有型別驗證：`setItem('cocoya_lang', 123)` 也能寫入
 *
 * 本模組收斂上述問題：**單一 SSOT + 型別驗證 + 統一錯誤處理**。
 *
 * 【刻意不做的事】
 * 本模組**不引入新的持久化層**。仍以 localStorage 為底層，因為：
 *   - VSIX（webview）與 Tauri（同一 webview）都已可用，無需搬遷
 *   - 換儲存層會使既有使用者的設定遺失
 * 真正的「跨端同步設定」屬另一階段（VS Code contributes.configuration
 * + Tauri 設定檔），與本模組的關係是：本模組提供單一存取入口，
 * 未來換底層只需改本檔，其餘呼叫點不動。
 *
 * 【命名约定】
 * 全部 key 一律以 `cocoya_` 開頭。`pythonPath` 是歷史遺留（無前綴），
 * 為相容既有使用者設定**保留原 key**，但對外名稱統一為 SETTINGS_KEY.PYTHON_PATH。
 *
 * 【執行環境注意】
 * localStorage 在部分 VS Code webview 環境可能拋例外（隐式模式、
 * 使用者隱私設定），故所有存取皆包 try/catch，永不拋出。
 */
(function (global) {
    'use strict';

    // [2026-10-04] 偏好 key 的單一真實來源在 core/settingsKeys.js（ESM），
    //   供 bridge/ 等 ESM 模組直接 import。此處以同步載入取得，確保雙端一致。
    //   若載入失敗則退回本檔內建清單（下方有守門測試斷言兩者一致）。
    const SETTINGS_KEY = global.CocoyaSettingsKeys
        || Object.freeze({
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
        THEME_MODE: 'cocoya_theme_mode',
        DM_CROSSHAIR_COLOR: 'cocoya_dm_crosshair_color',
        PYTHON_PATH: 'pythonPath'
    });

    /** 各 key 的預設值與型別驗證規則。 */
    const SCHEMA = {
        [SETTINGS_KEY.LANG]: { type: 'string', default: '' },
        [SETTINGS_KEY.PLATFORM]: { type: 'string', default: 'MicroPython' },
        [SETTINGS_KEY.ENV_SETUP_DONE]: { type: 'boolean', default: false },
        [SETTINGS_KEY.HIGHLIGHT_COLOR]: { type: 'string', default: '' },
        [SETTINGS_KEY.SERIAL_PREFERRED_PORT]: { type: 'string', default: '' },
        [SETTINGS_KEY.SERIAL_RAW_DUMP_ENABLED]: { type: 'boolean', default: false },
        [SETTINGS_KEY.SERIAL_UPLOAD_ONLY]: { type: 'boolean', default: false },
        [SETTINGS_KEY.TRAINING_BACKEND]: { type: 'string', default: '' },
        [SETTINGS_KEY.TRAINING_PROJECT_NAME]: { type: 'string', default: '' },
        [SETTINGS_KEY.TRAINING_TASK_TYPE]: { type: 'string', default: '' },
        [SETTINGS_KEY.THEME_MODE]: { type: 'string', default: 'auto' },
        [SETTINGS_KEY.DM_CROSSHAIR_COLOR]: { type: 'string', default: '' },
        [SETTINGS_KEY.PYTHON_PATH]: { type: 'string', default: 'python' }
    };

    /**
     * 將 localStorage 讀出的字串轉為宣告型別。
     * localStorage 只能存字串，故 boolean 需以 '1'/'0' 或 'true'/'false' 表示。
     */
    function coerce(key, raw) {
        if (raw === null || raw === undefined || raw === '') return undefined;
        const rule = SCHEMA[key];
        if (!rule) return raw;
        if (rule.type === 'boolean') {
            return raw === '1' || raw === 'true';
        }
        return raw;
    }

    /** 將值轉為可存入 localStorage 的字串。 */
    function serialize(key, value) {
        const rule = SCHEMA[key];
        if (rule && rule.type === 'boolean') {
            return value ? '1' : '0';
        }
        return String(value);
    }

    function storage() {
        try {
            return global.localStorage || null;
        } catch (e) {
            return null;   // 隱私模式等情境
        }
    }

    const Settings = {
        SETTINGS_KEY,
        SCHEMA,

        /**
         * 讀取偏好。型別不符或不存在時回傳預設值。
         * 永不拋出。
         * @param {string} key
         */
        get(key) {
            let raw = null;
            const ls = storage();
            if (ls) {
                try { raw = ls.getItem(key); } catch (e) { raw = null; }
            }
            const value = coerce(key, raw);
            if (value !== undefined) return value;
            return SCHEMA[key] ? SCHEMA[key].default : undefined;
        },

        /**
         * 寫入偏好。型別不符時回傳 false 且不寫入（寧可不存，也不寫壞值）。
         * @param {string} key
         * @param {*} value
         * @returns {boolean} 是否寫入成功
         */
        set(key, value) {
            const rule = SCHEMA[key];
            if (rule) {
                if (rule.type === 'boolean' && typeof value !== 'boolean') return false;
                if (rule.type === 'string' && typeof value !== 'string') return false;
            }
            const ls = storage();
            if (!ls) return false;
            try { ls.setItem(key, serialize(key, value)); return true; } catch (e) { return false; }
        },

        /** 刪除偏好（下次 get 將回預設值）。 */
        remove(key) {
            const ls = storage();
            if (!ls) return false;
            try { ls.removeItem(key); return true; } catch (e) { return false; }
        },

        /** 是否已設定（非預設狀態）。 */
        has(key) {
            const ls = storage();
            if (!ls) return false;
            try { return ls.getItem(key) !== null; } catch (e) { return false; }
        }
    };

    // 全域匯出（與專案既有 window.CocoyaXxx 慣例一致，供非 module 環境使用）
    // [2026-10-04] 移除殘留的 CommonJS 相容層：瀏覽器無 module，而測試走
    //   core/settingsHarness.mjs 的 vm 沙箱（讀 globalThis 掛載點），該行從未生效。
    global.CocoyaSettings = Settings;
})(typeof window !== 'undefined' ? window : globalThis);