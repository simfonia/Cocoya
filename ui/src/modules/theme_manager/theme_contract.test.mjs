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

test('msgColours 覆寫：dark 與 candy 必須宣告；light 沿用預設色（2026-10-01 P2-16 決策）', () => {
    // ⚠️ 本測試在 2026-10-01 被**推翻重寫**，理由如下（AGENTS.md 要求記錄）：
    //
    // 原斷言是「light／dark 不宣告 msgColours 為合法」，那是 Batch 0 時我
    // **替使用者做的判斷** —— 依 AGENTS.md「根 COLOUR_* 是預設色 SSOT、
    // 主題 msgColours 只是選配覆寫」推論而得。但計畫 §12 原本把這列為
    // 「待使用者決策事項」，我不應自行判定並寫成契約。
    //
    // 使用者目視後拍板：**深色底上預設色偏亮刺眼**（預設色為淺底設計），
    // 決定選 B：dark 也要有專屬 msgColours。故推翻原判斷。
    //
    // ★ 教訓：把「待使用者決策」轉成技術契約，會讓選項在無人察覺下被鎖死。
    //   遇到待決策項，應回報給使用者，不要自行寫成守門。

    // dark 必須有覆寫（2026-10-01 新增，38 鍵）
    const dark = msgColourKeys(themes.cocoya_dark);
    assert.ok(Array.isArray(dark), 'cocoya_dark 必須宣告 msgColours（深色底需要專屬積木色）');
    assert.ok(dark.length > 0, 'cocoya_dark 的 msgColours 不得為空');

    // candy 維持既有覆寫
    const candy = msgColourKeys(themes.cocoya_candy);
    assert.ok(Array.isArray(candy) && candy.length > 0, 'cocoya_candy 應有 msgColours 覆寫');

    // light 仍沿用預設色 —— 淺底本來就是預設色的設計環境
    assert.equal(msgColourKeys(themes.cocoya_light), null,
        'cocoya_light 不宣告 msgColours（淺底直接用預設色即可）');

    // dark 與 candy 的覆寫不得出現「預設色清單以外」的鍵 —— 那通常是拼字錯誤，
    // 會導致該分類永遠吃不到覆寫色（在深色底上又變回刺眼的淺色預設色）。
    // 基準取自根 zh-hant.js 的 COLOUR_*（真正的預設色 SSOT）。
    const src = fs.readFileSync(
        path.join(here, '..', '..', 'zh-hant.js'), 'utf8');
    const defaults = [...src.matchAll(/"(COLOUR_[A-Z0-9_]+)"\s*:/g)].map((m) => m[1]);
    assert.ok(defaults.length > 0, '應能從根 zh-hant.js 讀到 COLOUR_* 預設色');

    for (const name of ['cocoya_dark', 'cocoya_candy']) {
        const keys = msgColourKeys(themes[name]);
        if (!keys) continue;

        // (a) 不得出現預設色清單以外的鍵 —— 通常是拼字錯誤
        assert.deepEqual(
            keys.filter((k) => !defaults.includes('COLOUR_' + k)), [],
            `${name} 出現預設色清單沒有的 msgColours 鍵（拼字錯誤？）`
        );

        // (b) ★ 必須覆蓋每一個預設色鍵。
        //     缺任何一個，該分類就會落回淺色預設色 —— 在深色底上又變成刺眼色，
        //     正是 P2-16 要修的問題。少了 (b) 這條時，實測刪掉整個
        //     SPIKE_MUSIC 覆寫，守門仍然全綠（假安全感）。
        assert.deepEqual(
            defaults.filter((d) => !keys.includes(d.replace('COLOUR_', ''))), [],
            `${name} 缺少 msgColours 覆寫，該鍵會落回淺色預設色`
        );
    }
});
