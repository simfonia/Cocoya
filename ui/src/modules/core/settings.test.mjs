/**
 * ui/src/modules/core/settings.test.mjs
 * [2026-10-04] 使用者偏好 SSOT 行為測試 + 散落守門
 *
 * 【為何新增這個測試】
 * core/settings.js 是 12 個偏好 key 的單一存取入口。改版前是 38 處裸
 * localStorage 呼叫散落 11 個檔案，**拼錯 key 不會報錯**（localStorage 對未知
 * key 一律回 null）→ 設定靜默失效。本檔守門 1／2 即防止此情形復發。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSettings } from '../../core/settingsHarness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.join(here, '..', '..', '..');

const S = loadSettings();

test('SETTINGS_KEY：全部 key 都有預設值與型別規則（缺一即可能拋錯）', () => {
    const entries = Object.entries(S.SETTINGS_KEY);   // [屬性名, 實際 key 值]
    assert.ok(entries.length >= 11, `key 數應至少 11，實得 ${entries.length}`);
    for (const [name, key] of entries) {
        const rule = S.SCHEMA[key];                   // ⚠️ 用「值」查 SCHEMA，不是「屬性名」
        assert.ok(rule, `${name}（key="${key}"）缺 SCHEMA 規則`);
        assert.ok(['string', 'boolean'].includes(rule.type), `${name} 型別不合法`);
        assert.ok('default' in rule, `${name} 缺預設值`);
    }
});

test('get/set/remove/has 基本流程', () => {
    const K = S.SETTINGS_KEY.LANG;
    S.remove(K);
    assert.equal(S.has(K), false);
    assert.equal(S.get(K), '', '未設定時應回預設值');
    assert.equal(S.set(K, 'en'), true);
    assert.equal(S.get(K), 'en');
    assert.equal(S.has(K), true);
    S.remove(K);
    assert.equal(S.get(K), '');
});

test('boolean 偏好：序列化為 1/0 且讀回為真/假', () => {
    const K = S.SETTINGS_KEY.SERIAL_RAW_DUMP_ENABLED;
    S.set(K, true);
    assert.equal(S.get(K), true);
    assert.equal(S.raw(K), '1', '底層應存為字串 1');
    S.set(K, false);
    assert.equal(S.get(K), false);
    assert.equal(S.raw(K), '0');
});

test('型別不符時拒絕寫入（寧可不存，也不寫壞值）', () => {
    const bKey = S.SETTINGS_KEY.SERIAL_UPLOAD_ONLY;
    const sKey = S.SETTINGS_KEY.LANG;
    assert.equal(S.set(bKey, 'yes'), false, 'boolean 鍵不該接受字串');
    assert.equal(S.get(bKey), false, '被拒後應仍是預設值');
    assert.equal(S.set(sKey, 123), false, 'string 鍵不該接受數字');
    assert.equal(S.get(sKey), '');
});

test('未知 key：get 回 undefined、set 仍可寫入（不做過度限制）', () => {
    assert.equal(S.get('__unknown_key__'), undefined);
    assert.equal(S.set('__unknown_key__', 'x'), true);
    S.remove('__unknown_key__');
});

test('PYTHON_PATH 保留歷史 key 名稱（無前綴，改名會遺失使用者設定）', () => {
    assert.equal(S.SETTINGS_KEY.PYTHON_PATH, 'pythonPath');
    assert.equal(S.get(S.SETTINGS_KEY.PYTHON_PATH), 'python', '應有預設值');
});

test('守門 1：src 下不得再出現裸 localStorage 存取（新增須走 SSOT）', () => {
    const offenders = [];
    const ALLOW = new Set(['src/core/settings.js', 'src/core/settingsHarness.mjs']);
    (function walk(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { walk(full); continue; }
            if (!e.name.endsWith('.js')) continue;
            const rel = path.relative(uiDir, full).replace(/\\/g, '/');
            if (ALLOW.has(rel)) continue;
            const src = fs.readFileSync(full, 'utf8');
            src.split('\n').forEach((line, i) => {
                const code = line.replace(/\/\/.*$/, '');   // 去掉行註解避免誤判
                if (/localStorage\s*\.\s*(getItem|setItem|removeItem)\s*\(/.test(code)) {
                    offenders.push(`${rel}:${i + 1} ${line.trim()}`);
                }
            });
        }
    })(path.join(uiDir, 'src'));
    assert.deepEqual(offenders, [],
        '發現裸 localStorage 存取；請改用 CocoyaSettings（見 core/settings.js）：\n' + offenders.join('\n'));
});

test('守門 3：settings.js 內建 fallback 與 settingsKeys.js 必須完全一致（防白名單變漏洞）', async () => {
    const { SETTINGS_KEY: esmKeys } = await import('../../core/settingsKeys.js');
    const a = Object.entries(S.SETTINGS_KEY).sort((x, y) => x[0] < y[0] ? -1 : 1);
    const b = Object.entries(esmKeys).sort((x, y) => x[0] < y[0] ? -1 : 1);
    assert.deepEqual(a, b,
        'settings.js 與 settingsKeys.js 的 key 清單已分叉 —— 瀏覽器與 Node 會讀到不同 key。\n'
        + '請修正 settings.js 的內建 fallback（守門 2 白名單不得用於此檔的內容一致性）。');
});

test('守門 4：settingsApi.js adapter 與 settings.js 行為必須一致（不得改變語意）', async () => {
    // ⚠️ 判準落在「行為」而非原始碼字串比對：adapter 的 SCHEMA 未 export，
    //   以 regex 掃原始碼會因轉義層數而全數落空（實測踩到）。
    //
    // ⚠️ 必須在獨立 vm 沙箱內跑：node --test 以多 worker 跨檔並發，
    //   動 globalThis.localStorage / CocoyaSettings 會與其他測試互相污染
    //   （實測：此測試時紅時綠，難以重現與診斷）。
    const fsMod = await import('node:fs');
    const vmMod = await import('node:vm');
    const settingsJs = path.join(uiDir, 'src', 'core', 'settings.js');
    const sandbox = { console };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vmMod.createContext(sandbox);
    vmMod.runInContext(fsMod.readFileSync(settingsJs, 'utf8'), sandbox, { filename: settingsJs });

    const store = new Map();
    sandbox.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k)
    };
    const ssot = sandbox.CocoyaSettings;

    // adapter 於同一沙箱載入 → 兩條路徑共用同一 localStorage
    // ⚠️ 剝掉 import 後必須自行注入 SETTINGS_KEY，否則 adapter 內會 ReferenceError
    const keysJs = path.join(uiDir, 'src', 'core', 'settingsKeys.js');
    const keysCode = fsMod.readFileSync(keysJs, 'utf8').replace(/^export\s+/gm, '');
    const apiSrcCode = fsMod.readFileSync(path.join(uiDir, 'src', 'core', 'settingsApi.js'), 'utf8')
        .replace(/^import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?$/gm, '')
        .replace(/^export\s+/gm, '');
    vmMod.runInContext(keysCode, sandbox);
    vmMod.runInContext(apiSrcCode + '\nglobalThis.__api = { getSetting, setSetting };', sandbox);
    const api = sandbox.__api;

    const mismatches = [];
    for (const key of Object.values(ssot.SETTINGS_KEY)) {
        const isBool = ssot.SCHEMA[key].type === 'boolean';
        // 情境 A：SSOT 全域存在 → adapter 必須委派
        store.set(key, isBool ? '1' : 'probe_value');
        if (api.getSetting(key) !== ssot.get(key)) {
            mismatches.push(key + '(SSOT): ' + JSON.stringify(api.getSetting(key)) + ' vs ' + JSON.stringify(ssot.get(key)));
        }
        store.clear();
        // 情境 B：無 SSOT 全域（Node/ESM 實況）→ adapter 自行 coerce
        delete sandbox.CocoyaSettings;
        store.set(key, isBool ? '1' : 'probe_value');
        const expected = isBool ? true : 'probe_value';
        if (api.getSetting(key) !== expected) {
            mismatches.push(key + '(無全域): got ' + JSON.stringify(api.getSetting(key)) + ' want ' + JSON.stringify(expected));
        }
        store.clear();
    }
    assert.deepEqual(mismatches, [], 'adapter 與 SSOT 行為不一致：\n' + mismatches.join('\n'));
});

test('守門 5：bridge 層必須經 settingsApi adapter，不得直接碰 CocoyaSettings 全域', () => {
    // bridge/*.js 是 ESM，Node 測試無 globalThis → 直接用會 ReferenceError
    // （實測：resetFirmware 燒錄失敗提示分支曾因此靜默失效）
    const offenders = [];
    const bridgeDir = path.join(uiDir, 'src', 'bridge');
    (function walk(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { walk(full); continue; }
            if (!e.name.endsWith('.js')) continue;
            const src = fs.readFileSync(full, 'utf8');
            src.split('\n').forEach((line, i) => {
                const code = line.replace(/\/\/.*$/, '');
                if (/CocoyaSettings\s*\./.test(code)) {
                    offenders.push(`${path.relative(uiDir, full).replace(/\\/g, '/')}:${i + 1}`);
                }
            });
        }
    })(bridgeDir);
    assert.deepEqual(offenders, [],
        'bridge 層須 import { getSetting, setSetting } from core/settingsApi.js：\n' + offenders.join('\n'));
});

test('守門 6：settings.js 必須在 index.html 早於消費端載入（載入順序是契約）', () => {
    // ⚠️ settings.js 以 <script> 順序載入並掛全域；若晚於 config.js 等消費端，
    //   消費者讀到 undefined（實測：bridge 層曾因此 ReferenceError）。
    const html = fs.readFileSync(path.join(uiDir, 'index.html'), 'utf8');
    const settingsAt = html.indexOf('src/core/settings.js');
    assert.ok(settingsAt > 0, 'index.html 未載入 src/core/settings.js');
    // 找出所有在載入點之前就引用 CocoyaSettings 的 script
    const consumers = ['src/app/config.js', 'src/ui/hardware.js'];
    for (const c of consumers) {
        const at = html.indexOf(c);
        assert.ok(at > 0, `index.html 未載入 ${c}（守門已過時？）`);
        assert.ok(settingsAt < at,
            `${c} 在 settings.js 之前載入 → CocoyaSettings 尚未定義`);
    }
});

test('守門 2：已知偏好 key 不得以字面值散落（須用 SETTINGS_KEY 常數）', () => {
    const known = new Set(Object.values(S.SETTINGS_KEY));
    // 【白名單設計事實】
    // (1) 某些檔案同時被當 ESM 直接 import（Node 測試），該情境無 window 全域
    //     → 需 typeof 防護 + 字面值 fallback（如 ui_canvas.js）。
    // (2) core/settings.js 本身含一份內建 key 清單，作為 index.html 未載入
    //     settingsKeys.js 時的後備；settingsKeys.js 則是 key 的**原始定義處**。
    //     兩者都是 SSOT 的一部分，非散落複製 —— 且其一致性由守門 3 直接比對。
    // 豁免條件嚴格：白名單 + 同檔確實有 SETTINGS_KEY 常數引用，否則就是複製真實來源。
    const FALLBACK_OK = new Set([
        'src/modules/dataset_manager/ui_canvas.js',
        'src/ui/hardware.js',
        'src/core/settings.js',
        'src/core/settingsKeys.js'
    ]);
    const offenders = [];
    (function walk(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { walk(full); continue; }
            if (!e.name.endsWith('.js')) continue;
            const rel = path.relative(uiDir, full).replace(/\\/g, '/');
            if (rel === 'src/core/settingsHarness.mjs') continue;
            const src = fs.readFileSync(full, 'utf8');
            // 豁免判準：該檔「就是定義處或自帶後備清單」，而非複製到別處。
            // 兩種合法形態：(a) SETTINGS_KEY 定義語；(b) typeof 防護的三元 fallback
            //     （橋接層無 window 全域時必需，且與常數並存、內容需一致）。
            const isDefinitionSite = /SETTINGS_KEY\s*=\s*Object\.freeze\(\{/.test(src)
                || /\b(LANG|PLATFORM|ENV_SETUP_DONE)\s*:\s*'cocoya_/.test(src);
            const hasGuardedFallback = /typeof\s+CocoyaSettings\s*!==\s*'undefined'/.test(src)
                || /globalThis\.CocoyaSettings|\/\*\s*fallback/i.test(src);
            for (const k of known) {
                const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                if (new RegExp(`['"\`]${esc}['"\`]`).test(src)) {
                    // fallback 豁免僅限：白名單 + 確為定義處／自帶後備清單（否則就是複製真實來源）
                    if (FALLBACK_OK.has(rel) && (isDefinitionSite || hasGuardedFallback)) continue;
                    offenders.push(`${rel} 出現 key 字面值 "${k}"（應用 SETTINGS_KEY 常數）`);
                }
            }
        }
    })(path.join(uiDir, 'src'));
    assert.deepEqual(offenders, [],
        '偏好 key 以字面值散落，拼錯不會報錯；請改用 SETTINGS_KEY：\n' + offenders.join('\n'));
});