/**
 * ui/src/core/settingsHarness.mjs — 測試用的 settings.js 載入器
 *
 * settings.js 以 IIFE 掛在 globalThis（非 ESM export），Node 無法直接 import。
 * 本 harness 以 vm 載入原始碼，並注入假的 localStorage，避免污染真實環境。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = path.join(here, 'settings.js');

/** 建立一個隔離的 CocoyaSettings 實例（每次呼叫都是全新沙箱）。 */
export function loadSettings() {
    const store = new Map();
    const fakeLocalStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
        clear: () => store.clear()
    };
    // ⚠️ JSON 必須顯式注入沙箱：vm.createContext 預設不帶入，且序列化需在沙箱內完成
    const sandbox = { localStorage: fakeLocalStorage, console, JSON };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(SETTINGS_PATH, 'utf8'), sandbox, { filename: SETTINGS_PATH });
    const S = sandbox.CocoyaSettings;
    if (!S) throw new Error('settings.js 未掛載 CocoyaSettings');
    /*
     * ⚠️ vm 沙箱有自己的 Object／Object.keys／Object.entries（不同 realm）。
     *   在本 realm 對沙箱物件呼叫，拿到的是「屬性名」而非「屬性值」
     *   （實測：S.SETTINGS_KEY.LANG 正確回 'cocoya_lang'，但 Object.keys 回 'LANG'），
     *   導致 SCHEMA 查詢全數落空。**正解：在沙箱內部完成序列化**。
     */
    const plain = sandbox.JSON.parse(sandbox.JSON.stringify({
        SETTINGS_KEY: S.SETTINGS_KEY,
        SCHEMA: S.SCHEMA
    }));
    const wrapped = {
        SETTINGS_KEY: Object.freeze(plain.SETTINGS_KEY),
        SCHEMA: plain.SCHEMA,
        get: S.get.bind(S),
        set: S.set.bind(S),
        remove: S.remove.bind(S),
        has: S.has.bind(S),
        // 供測試檢視底層序列化結果（boolean → '1'/'0'）
        raw: (k) => (store.has(k) ? store.get(k) : null)
    };
    return wrapped;
}