/**
 * P2-15 i18n 呼叫端契約守門（掃描型）
 *
 * 背景（2026-10-04 實測發現的真實 bug）：
 *   i18n.js 的 t() 會自動補前綴（'DSM_' + key），但有 4 處呼叫端自己又寫了
 *   `t('DSM_ANNOTATION_CROSSHAIR', ...)` → 實際查 `DSM_DSM_ANNOTATION_CROSSHAIR`，
 *   永遠查不到翻譯。而這些鍵在 i18n/en.js **都有翻譯**（"Crosshair"），
 *   於是英文語系下這些 UI **永遠顯示中文 fallback**，且完全無報錯。
 *
 *   症狀（英文介面出現中文）與病因（多寫了 4 個字元）相隔極遠，
 *   不設守門必定復發 —— 這正是 AGENTS.md「守設計而非守形狀」的用途。
 *
 * 本檔兩項斷言：
 *   ① t() 的 key 不得含前綴（會變成雙重前綴）
 *   ② t() 的 key 必須在 zh-hant 與 en 都有定義（漏譯守門）
 *
 * ⚠️ 掃描前必須剝除註解 —— 說明本次修復的註解裡會引述舊碼
 *    `t('DSM_XXX', ...)`，不剝除會產生假陽性（本次實測踩到）。
 * ⚠️ 只認 `t('KEY'` 語法：字串內的 t('...') 與註解引用的舊碼都不是呼叫。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, '..', '..');     // ui/src  (here = modules/dataset_manager)

/** 走訪 ui/src 下所有產品碼（排除測試檔與 node_modules） */
function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (e.name.endsWith('.js') && !e.name.endsWith('.test.js')) out.push(p);
    }
    return out;
}

/**
 * 剔除非代碼註註與「不含 ${} 的樣板字串」。
 *
 * ⚠⚠ 本函數曾因為「先剔字串、後找呼叫」而欄掉全部掃描結果
 * （mutation 测試根接到的假綠灯）：剔字串會把 `t('KEY')` 裡的引號去掉，
 * 鍵碼名隨之消失 → 掃描結果恁為空，守門全綠却無作用。
 * 正確做法：先剔註註（匯率低、安全），字串留給 collectTCalls 另行處理。
 */

/**
 * 剔掉普通字串，但保留其中 t() 的呼叫。
 *
 * 判準：字串則面若提到 `t(` 弱說詞就可能是真的呼叫，不能確認为純字串；
 * 否則全部清掉。这比「一律刪掉引號内容」安全，
 * 因為不刪掉引號才不會把命名參數一起掉。
 */
/**
 * 剔掉「確實是字串字面量」的剩餘代碼。
 *
 * ⚠⚠ 本函數是本次最关鍵的地雦，曾因為「用字串分隔元為判斷」而欄掉全部掃描：
 *   例如 `t('KEY', '文字')` 的第一個引號從「`(` 後的紫點开始，匹配到 `'` 就停「
 *   于是把 `不含 t( 的引號內容」全部清掉 —— 連鍵碼一起不掉，
 *   掃描結果恁為空。
 *
 * 正確做法（順序不可交換）：
 *   1. 先把 t('KEY' 的 KEY 替換成安全占位字串（保護字串不会吃掉它）
 *   2. 再剔字串
 *   3. 最後把占位字串還原為 KEY。
 */
/**
 * 收集檔案中「真正執行」的 t('KEY' 呼叫。
 *
 * ⚠⚠ 本函數曾因為「先剔字串、後找呼叫」而欄掉全部掃描，
 * 守門全綠却完全無作用（mutation 才抓到的假綠灯）：
 *   `剔字串` 會把 t('KEY') 裡的引號去掉，鍵碼名隨之消失 → 掃描結果恁為空。
 *
 * 正確做法：**不剔字串**。直接在原始碼上找 t('…' 並用 inComment 剔除稻解——
 *   正規程式碼裡的 t('KEY') 不可能被误判，而稽解解準可從位置直接判斷。
 * 自檢 B/B2 屫监控「掃到的數量」以防欄掉。
 */
function collectTCalls(src) {
    const out = [];
    const lineOf = (idx) => src.slice(0, idx).split('\n').length;
    for (const m of src.matchAll(/(?<![\w$.])t\(\s*'([A-Z][A-Z0-9_]{3,})'/g)) {
        if (inComment(src, m.index)) continue;
        out.push({ key: m[1], index: m.index, line: lineOf(m.index) });
    }
    return out;
}

/**
 * 判定檔案使用的 t() 是否為「自動補前綴」的那一支。
 *
 * ⚠️ 不可用檔名猜：ui/base.js 也有一個同名的區域性 t，但它是
 *   `const t = (k, fb) => M[k] || fb`（M = Blockly.Msg）、**不補前綴**，
 *   它傳 `TLB_XXX` 是正確的。若不區分就會有 5 個假陽性（本次實測）。
 *
 * ⚠️ 也不可用「有沒有 import t」判斷：DM 的子模組（ui/annotation.js 等）
 *   走**依賴注入**（createAnnotationController({ t })），沒有 import。
 *
 * 判據：檔案位於 dataset_manager 模組內（該模組的 t 一律來自 i18n.js）。
 */
function usesPrefixedT(relPath) {
    return relPath.startsWith('modules/dataset_manager/');
}

/**
 * 收集檔案中「真正執行」的 t('KEY' 呼叫。
 * ⚠️ 本函式接收**原始碼**並自行完成全套剝除 —— 呼叫端不可再預先剝一次
 *    （重複剝除會讓模板字串內的 t() 消失，本次實測踩到）。
 */

/** 判斷某個位置是否落在註解內（以行首為單位啟發式判斷） */
function inComment(src, index) {
    const lineStart = src.lastIndexOf('\n', index) + 1;
    const line = src.slice(lineStart, index);
    if (/\/\//.test(line)) return true;          // 已有 // 在前
    const block = src.slice(0, lineStart);
    const open = (block.match(/\/\*/g) || []).length;
    const close = (block.match(/\*\//g) || []).length;
    return open > close;                          // 位於未閉合的 /* */ 內
}

/** 讀出 i18n 檔定義的鍵（去 DSM_ 前綴） */
function definedKeys(file) {
    const src = fs.readFileSync(file, 'utf8');
    const set = new Set();
    for (const m of src.matchAll(/["']?((?:DSM_|TLB_)?[A-Z][A-Z0-9_]{3,})["']?\s*:\s*"/g)) {
        set.add(m[1].replace(/^(?:DSM_|TLB_)/, ''));
    }
    return set;
}

const I18N_DIR = path.join(SRC, 'modules', 'dataset_manager', 'i18n');
const ZH = definedKeys(path.join(I18N_DIR, 'zh-hant.js'));
const EN = definedKeys(path.join(I18N_DIR, 'en.js'));

/**
 * 白名單：看似漏譯、實為設計事實的鍵。
 * 每項必須附原因 —— 否則這份清單會退化成「閉眼睛放行」。
 */
const DYNAMIC_KEYS = new Set([
    // 組鍵：'ENTRY_TYPE_' + type.toUpperCase()（image_classification/object_detection/...）
    // 各值為 ENTRY_TYPE_IMAGE_CLASSIFICATION 等，無法以字面掃描比對。
    // 這類組鍵是正確設計，硬要它對應字面鍵反而逼迫改成 4 個 if。
    'ENTRY_TYPE_',
    // 同型組鍵：'ENTRY_DESC_' + entry.id.toUpperCase()（ui/entryCards.js）
    // 合法設計，理由同上。
    'ENTRY_DESC_'
]);

/** 掃描全專案，回傳 { 前綴違規: [...], 缺譯: [...] } */
function scanAll() {
    const prefixed = [];
    const untranslated = [];
    let scanned = 0;
    for (const file of walk(SRC)) {
        const raw = fs.readFileSync(file, 'utf8');
        const rel = path.relative(SRC, file).replace(/\\/g, '/');
        // 只管自動補前綴的那一支 t()；ui/base.js 的區域性 t 不在此列（見 usesPrefixedT）
        if (!usesPrefixedT(rel)) continue;
        for (const { key, line } of collectTCalls(raw)) {
            // ① 前綴：t() 會自動補，呼叫端再寫就是雙重前綴
            if (/^(?:DSM|TLB)_/.test(key)) {
                prefixed.push({ rel, line, key });
                continue;
            }
            // ② 缺譯：鍵在任一語系沒定義，該語系就會退回中文 fallback
            scanned++;
            if (DYNAMIC_KEYS.has(key)) continue;
            if (!ZH.has(key) || !EN.has(key)) {
                untranslated.push({
                    rel, line, key,
                    inZh: ZH.has(key), inEn: EN.has(key)
                });
            }
        }
    }
    return { prefixed, untranslated, scanned };
}

const result = scanAll();

test('P2-15 守門 1：t() 的 key 不得自帶 DSM_/TLB_ 前綴（t() 會自動補，會變雙重前綴）', () => {
    assert.deepEqual(
        result.prefixed, [],
        '以下呼叫自帶前綴 → 實際查不到翻譯，該語系會永遠顯示 fallback：\n' +
        result.prefixed.map((p) => `  ${p.rel}:${p.line}  t('${p.key}')`).join('\n')
    );
});

test('P2-15 守門 2：t() 的 key 必須在 zh-hant 與 en 都有定義（雙語系完整）', () => {
    assert.deepEqual(
        result.untranslated, [],
        '以下鍵缺翻譯 → 該語系會退回中文 fallback：\n' +
        result.untranslated.map((p) => `  ${p.rel}:${p.line}  ${p.key}  (zh:${p.inZh ? '有' : '缺'} / en:${p.inEn ? '有' : '缺'})`).join('\n')
    );
});

test('P2-15 自檢 A：剝除註解確實必要（註解引述舊碼不該被當成違規）', () => {
    // 對照組用 ui_layout.js —— 該檔為了記錄本次修復，註解裡引述了舊碼
    // t('DSM_SIDECAR_START_FAILED', ...)。若不剝註解，這行會被當成真違規。
    const file = path.join(SRC, 'modules', 'dataset_manager', 'ui_layout.js');
    const raw = fs.readFileSync(file, 'utf8');
    // 對照組成立的前提：原始碼裡確實有 t('DSM_* 這段文字（無論在註解與否）
    assert.ok(
        /t\('DSM_[A-Z0-9_]+'/.test(raw),
        '對照組失效：ui_layout.js 已不含 t(\'DSM_* 舉例，無法證明剝註解的必要性'
    );
    // 但剝除註解後不得再被判違規 —— 這正是 ui_layout.js 沒被守門 1 報出的原因
    const violations = collectTCalls(raw).filter((c) => /^(?:DSM|TLB)_/.test(c.key));
    assert.deepEqual(violations, [], '剝註解後不應再有違規');
});

test('P2-15 自檢 B：剝除字串不可連帶刪掉呼叫的 key（否則掃描恆為空、守門成假綠燈）', () => {
    // 本次守門曾因「先剝字串、後找呼叫」而全程掃到 0 個 t()，守門全綈卻毫無作用。
    // 這個測試直接釘死剝除後仍能抓到 key —— mutation（改回先剝字串）時必紅。
    const file = path.join(SRC, 'modules', 'dataset_manager', 'ui', 'annotation.js');
    const code = collectTCalls(fs.readFileSync(file, 'utf8'));
    assert.ok(code.length >= 8, `剔除後只掃到 ${code.length} 個 t() 呼叫 → 守門已失效（本次踩陷複現）`);
    assert.ok(
        code.some((c) => c.key === 'ANNOTATION_CROSSHAIR_COLOR'),
        'annotation.js 的 ${t(...)} 在模板字串內，剝除後必須仍可見'
    );
});

test('P2-15 自檢 B2：掃描結果不得為空（空集合會讓所有違規靜默通過）', () => {
    // 比對 B 更嚴：B 只驗一個檔案；本測驗全掃描的總量。
    // 若日後有人改壞剔除邏輯導致全專案掃到 0 筆，守門會「全綠」——
    // 這正是本守門一度發生的假綠灯，必須有獨立判準擊截。
    const total = scanAll().scanned;
    assert.ok(total >= 150, `全專案只掃到 ${total} 個 t() 呼叫，明顯少於預期（守門可能已失效）`);
});

test('P2-15 自檢 C：範圍只涵蓋自動補前綴的 t()（ui/base.js 的區域性 t 應被排除）', () => {
    // ui/base.js 有同名但語意不同的 t：不補前綴，傳 TLB_ 是正確的。
    // 若日後有人放寬範圍，會多出 5 個假陽性；此測試先行攔截。
    assert.equal(usesPrefixedT('ui/base.js'), false, 'ui/base.js 不應被判定為使用自動補前綴的 t()');
    assert.equal(usesPrefixedT('modules/dataset_manager/ui/annotation.js'), true, 'dataset_manager 子模組應被納入掃描');
});