/**
 * theme_contract.test.mjs — 三主題 CSS 變數契約測試（2026-10-01，Audit P3-1）
 *
 * 背景：P2-16 量測到 `cocoya_light`／`cocoya_dark`／`cocoya_candy` 各 46 個 cssVars 鍵，
 * 集合完全一致 —— 這是一條「目前成立但沒有任何機制守住」的不變式。
 * 一旦某個主題新增 token 忘了同步到另外兩個，結果是切到該主題時該變數
 * 落到樣式表 fallback（淺色值），深色主題出現「白底黑字」或反之，且不報任何錯。
 *
 * 這個測試把不變式變成守門：新增 token 必須三主題同步，缺一個就紅。
 *
 * 執行（cwd = ui/）：node --test "src/modules/theme_manager/*.test.mjs"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const themesDir = path.join(here, 'themes');

const read = (file) => fs.readFileSync(path.join(themesDir, file), 'utf8');

/**
 * 抽出某主題的 cssVars 鍵集合。
 * 只認 `cssVars: { ... }` 區塊內的 `--xxx` 字串鍵；
 * 必須區塊化解析（而非全文掃 `--`），因為同檔的 `componentStyles`／`css`
 * 也可能出現相似字樣。
 */
function cssVarKeys(source) {
    const block = source.match(/cssVars:\s*\{([\s\S]*?)\n\s{8}\}/);
    assert.ok(block, '找不到 cssVars 區塊（主題檔格式已變，請同步更新本測試的解析規則）');
    return [...block[1].matchAll(/['"](--[A-Za-z0-9_-]+)['"]\s*:/g)].map((m) => m[1]);
}

/** 抽出某主題的 msgColours 鍵集合（選配覆寫，無定義回 null 而非空集合） */
function msgColourKeys(source) {
    const block = source.match(/msgColours:\s*\{([\s\S]*?)\n\s{8}\}/);
    if (!block) return null;
    return [...block[1].matchAll(/['"]([A-Z0-9_]+)['"]\s*:/g)].map((m) => m[1]);
}

const THEME_FILES = {
    cocoya_light: 'cocoya_light.js',
    cocoya_dark: 'cocoya_dark.js',
    cocoya_candy: 'cocoya_candy.js'
};

const themes = Object.fromEntries(
    Object.entries(THEME_FILES).map(([id, file]) => [id, read(file)])
);

test('三個主題的 cssVars 鍵集合完全相同（新增 token 必須三主題同步）', () => {
    const keysByTheme = Object.fromEntries(
        Object.entries(themes).map(([id, source]) => [id, cssVarKeys(source)])
    );
    const reference = keysByTheme.cocoya_light;
    assert.ok(reference.length > 0, 'cocoya_light 不應為空，解析規則可能已失效');

    // 缺漏：某主題少宣告別人有、而樣式表未必有 fallback 的 token（深色主題最常見）
    const missing = Object.fromEntries(
        Object.keys(keysByTheme).map((id) => [
            id, reference.filter((key) => !keysByTheme[id].includes(key))
        ])
    );
    // 多餘：某主題多宣告別人沒有的 token（會造成該主題專屬、其他主題落回樣式表）
    const extra = Object.fromEntries(
        Object.keys(keysByTheme).map((id) => [
            id, keysByTheme[id].filter((key) => !reference.includes(key))
        ])
    );
    assert.deepEqual({ missing, extra }, { missing: { cocoya_light: [], cocoya_dark: [], cocoya_candy: [] }, extra: { cocoya_light: [], cocoya_dark: [], cocoya_candy: [] } });
});

test('三個主題的 cssVars 鍵無重複（重複宣告會靜默覆蓋前者）', () => {
    for (const [id, source] of Object.entries(themes)) {
        const keys = cssVarKeys(source);
        const duplicated = [...new Set(keys.filter((key, i) => keys.indexOf(key) !== i))];
        assert.deepEqual(duplicated, [], `${id} 有重複的 cssVars 鍵`);
    }
});

test('cssVars 鍵全部以 -- 開頭且不含空白（變數名契約）', () => {
    for (const [id, source] of Object.entries(themes)) {
        for (const key of cssVarKeys(source)) {
            assert.match(key, /^--[A-Za-z0-9_-]+$/, `${id} 的 cssVars 鍵格式不合法：${key}`);
        }
    }
});

test('msgColours 為選配覆寫：cocoya_light／cocoya_dark 不宣告時不得報錯（設計事實）', () => {
    // 依 AGENTS.md「新增積木模組檢查清單」第 2/3 點：
    //   根 zh-hant.js／en.js 的 COLOUR_* 是預設色 SSOT；主題 msgColours 只是選配覆寫。
    // 因此「某主題沒有 msgColours」是合法狀態（淺色主題預設 0 個、深色主題目前 0 個，
    // 僅 candy 有覆寫）。P2-16 待決策項就是「dark 缺 msgColours 是否刻意」——
    // 在使用者拍板前，這裡只鎖「不宣告時解析器必須回 null」，不強迫補齊。
    assert.equal(msgColourKeys(themes.cocoya_light), null);
    assert.equal(msgColourKeys(themes.cocoya_dark), null);
    const candy = msgColourKeys(themes.cocoya_candy);
    assert.ok(Array.isArray(candy) && candy.length > 0, 'cocoya_candy 應有 msgColours 覆寫');
});
