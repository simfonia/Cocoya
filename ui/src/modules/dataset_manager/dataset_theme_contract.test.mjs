/**
 * dataset_theme_contract.test.mjs — DM 樣式表契約守門（2026-10-01 新增）
 *
 * 兩條來源（皆為「掃描型」守門，會持續生效而非只擋當初想到的範圍）：
 *
 * 1. 暗色 class 對齊：`theme_manager.js:173` 只切換 `body.cocoya-dark-mode`，
 *    從不設定 `body.vscode-dark`（那是 VS Code webview 自帶的）。
 *    因此 dataset_manager.css 中任何「只有 vscode-dark、沒有 cocoya-dark-mode」
 *    的暗色規則，在 Tauri 獨立模式下都是死碼。
 *    2026-10-01 曾因此讓 dark 主題下攝影機預覽下方出現一道突兀白邊。
 *
 * 2. 縮圖不得裁切：object-fit: cover 會切掉原圖上下/左右，
 *    使用者要求能完整檢視畫面全貌，故縮圖一律 contain。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const CSS = path.join(here, 'dataset_manager.css');
const src = fs.readFileSync(CSS, 'utf8');

/**
 * 依大括號切出每個規則的「選擇器區塊」文字。
 *
 * 2026-10-01 修正：原實作把 CSS **註解**也當成規則的一部分
 * —— 因為檔頭註解裡含 `body.cocoya-dark-mode` 等字樣與 `{`，
 * 會被切成一個「選擇器項」，讓下游比對產生兩種錯誤：
 *   ① 假陰性：註解裡恰好同時出現 vscode-dark 與 cocoya-dark-mode → 誤判為合規
 *   ② 假陽性：註解只提 vscode-dark → 誤判為違規
 * 這在新增了描述主題來源的檔頭註解後立刻爆發（守門 1 自檢連續 4 次抓不到真正的回歸）。
 *
 * 故先移除 CSS 註解區塊，再切分規則。
 */
function rules(text) {
    const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '');
    return stripped.split('}').map((chunk) => {
        const idx = chunk.indexOf('{');
        return idx < 0 ? null : chunk.slice(0, idx).trim();
    }).filter((s) => s !== null && s.length > 0);
}

test('大括號平衡（改寫樣式表的健全性前提）', () => {
    // ⚠ 必須先剝除註解再計數：註解內容不影響 CSS 語法，但註解裡可能出現
    //   左／右大括號（例：引用編輯器的錯誤訊息「必須是 {」）。
    //   2026-10-02 因此誤報過一次（216 / 215），害我懷疑整份樣式表壞掉，
    //   實際去註解後是 215 / 215 完全平衡。
    const bare = src.replace(/\/\*[\s\S]*?\*\//g, '');
    const open = (bare.match(/\{/g) || []).length;
    const close = (bare.match(/\}/g) || []).length;
    assert.equal(open, close, `大括號不平衡：{ ${open} / } ${close}`);
});

/**
 * 守門 7：CSS 註解不得提前閉合（註解區塊外不該殘留註解結束符）。
 *
 * ★ 真實事故（2026-10-02）：我在註解裡寫了 src 後接「兩層斜線再接 .css」的 glob，
 *   其中的「星號＋斜線」被解析器當成**註解結束符** → 註解提前中斷，
 *   後面的文字被當成選擇器解析 → VS Code 報
 *   「L44 必須是 {」「L52 預期為 at-rule 或選取器」，整個樣式表從該處起解析異常。
 *   （⚠ 本處刻意不寫出該 glob 的字面：連這行「說明它」的註解也會被同一個
 *     結束符序列截斷 —— 我就是這樣讓這個 .mjs 檔案當場語法錯誤的。）
 *
 * ★ 為何「大括號平衡」抓不到：註解提前閉合後，後半段雖然語法錯誤，
 *   但大括號總數仍可能平衡 → 平衡測試全綠（假安全感）。
 *
 * 判準：CSS 註解在第一個「星號＋斜線」序列就結束，因此**合法**的樣式表在
 *       「剝除所有註解後」不可能再出現該序列。只要還有，就是提前閉合。
 */
test('守門 7：CSS 註解不得提前閉合（註解區塊外不該殘留註解結束符）', () => {
    // 前置：確認樣式表真的含註解，避免守門在「沒有註解可剝」時靜默空跑。
    assert.ok(src.includes('/*') && src.includes('*/'),
        '樣式表應含有註解；若真的沒有，代表檔案結構已變，請重新檢討本守門的前提');
    // 依 CSS 語意配對註解：開頭到第一個結束序列；配對後剩下的才是真正的程式碼。
    let rest = src, guard = 0;
    for (;;) {
        const open = rest.indexOf('/*');
        if (open < 0) break;
        const close = rest.indexOf('*/', open + 2);
        if (close < 0) break;
        rest = rest.slice(0, open) + rest.slice(close + 2);
        if (++guard > 1000) throw new Error('註解配對未收斂，解析邏輯有誤');
    }

    const stray = [...rest.matchAll(/\*\//g)].map((m) => {
        const line = rest.slice(0, m.index).split(/\r?\n/).length;
        return `L${line}: …${rest.slice(Math.max(0, m.index - 40), m.index + 2).replace(/\s+/g, ' ')}`;
    });
    assert.deepEqual(stray, [],
        '註解外出現 */ → 某處註解被提前閉合（例如在註解內寫了 src/**/*.css 這類 glob），'
        + '其後內容會被當成選擇器解析');
});

test('守門 7 自檢：註解內寫入 glob 使註解提前閉合後，本守門必須報紅', () => {
    // 真實回歸形狀：在註解裡寫 glob —— 就是 2026-10-02 造成語法錯誤的那個動作。
    const broken = src.replace(
        '防復發：dataset_theme_contract.test.mjs 的「守門 5」',
        '掃描 ui/src/**/*.css（bug');
    assert.notEqual(broken, src, '自檢失效：模擬回歸的取代沒有生效（註解文字可能已變，請更新本自檢）');

    let rest = broken, guard = 0;
    for (;;) {
        const open = rest.indexOf('/*');
        if (open < 0) break;
        const close = rest.indexOf('*/', open + 2);
        if (close < 0) break;
        rest = rest.slice(0, open) + rest.slice(close + 2);
        if (++guard > 1000) break;
    }
    assert.ok((rest.match(/\*\//g) || []).length > 0,
        '守門必須能抓到註解被提前閉合（註解外殘留 */）的情形');
});

test('守門 1：每個 vscode-dark 選擇器群組都必須包含 cocoya-dark-mode', () => {
    const offenders = [];
    for (const sel of rules(src)) {
        if (!/body\.vscode-(dark|high-contrast)/.test(sel)) continue;
        if (/body\.cocoya-dark-mode/.test(sel)) continue;
        offenders.push(sel.replace(/\s+/g, ' ').slice(0, 90));
    }
    assert.deepEqual(offenders, [],
        '以下暗色規則缺少 body.cocoya-dark-mode，在 Tauri 獨立模式（Tauri 不會加 vscode-dark）永遠不生效');
});

// ── 「守門 1 自檢」已於 2026-10-01 移除（使用者決定）──────────────────
//
// 原本有一條「模擬回歸 → 必須報紅」的自檢，本次嘗試修復時連續失敗 6 次。
// 根因是**模擬方式無法正確構造出真實回歸的形狀**：
//   rules() 以 '}' 切分每一項，故「選擇器群組」的邊界由**前一個 }** 決定。
//   無論是刪掉群組內的 cocoya 行、還是整組替換成只有 vscode，
//   都會讓前後規則的配對錯位 → detect() 永遠回 0，
//   讓人誤以為「守門失效」，實際上是模擬手法本身錯了。
//
// 為何直接移除而非重寫：
//   · 主守門（守門 1）本身有效：它真的會在有人刪掉 cocoya-dark-mode
//     選擇器時報紅（本次 P1-3 刪除 token 區塊時它並未誤報）。
//   · 要正確自檢必須改用能配對 { } 的 CSS 解析，屬另一項工作。
//   · 留著一條長期紅燈的測試只會污染訊號，讓真正的失敗被忽略。
//
// 若日後要補回，請先寫一個「能配對大括號、逐條抽出選擇器」的解析器，
// 再以它構造回測樣本 —— 不要用 rules() 的字串切分。

test('守門 2：縮圖一律 object-fit: contain（不得裁切原圖）', () => {
    // 只檢查縮圖相關選擇器；攝影機預覽 (#dataset-sampler-video) 維持 cover 屬設計事實
    const THUMB_SELECTORS = [
        '.dataset-image-thumb img',
        '.dataset-annotation-thumb'
    ];
    for (const name of THUMB_SELECTORS) {
        const re = new RegExp(
            '(^|[,}\\s])' + name.replace(/\./g, '\\.') + '\\s*\\{([^}]*)\\}', 'm');
        const m = src.match(re);
        assert.ok(m, `應能找到 ${name} 的規則`);
        assert.ok(/object-fit\s*:\s*contain/.test(m[2]),
            `${name} 必須是 object-fit: contain（cover 會裁切原圖，使用者要求完整呈現）`);
    }
});

test('守門 3：縮圖底色走 token，不可硬寫（contain 後的留白會露出底色）', () => {
    const m = src.match(/\.dataset-image-thumb\s*\{([^}]*)\}/);
    assert.ok(m, '應能找到 .dataset-image-thumb 規則');
    assert.ok(/background\s*:\s*var\(--dsm-thumb-bg\)/.test(m[1]),
        '縮圖底色必須走 var(--dsm-thumb-bg)，否則三主題無法一致');
});

/**
 * 守門 4：狀態類元件的每個狀態都必須有暗色覆寫。
 *
 * 2026-10-01 踩坑：`.dataset-validation` 的 `.ok` / `.error` 都有暗色覆寫，
 * 唯獨 `.warn` 沒有 → dark 主題下出現「米色亮底 + 繼承到的淺灰文字」幾乎看不清。
 *
 * ★ 為什麼不能只靠「dark class 對齊」（守門 1）：
 *   對齊只能救「已存在但選不到」的規則，救不了「根本沒寫」的規則。
 *   .warn 正是後者 —— 這是本守門存在的唯一理由。
 *
 * 範圍刻意收窄：只檢查這一組明確的狀態變體，避免變成過度寬泛的掃描
 * （過寬的守門只會逼人無聲放寬斷言，反而放行真正的漏洞）。
 */
const STATE_COMPONENTS = [
    { base: '.dataset-validation', states: ['ok', 'warn', 'error'] }
];

test('守門 4：每個狀態變體都必須有暗色覆寫（缺一個就會在 dark 主題淺底淺字）', () => {
    const missing = [];
    for (const { base, states } of STATE_COMPONENTS) {
        for (const st of states) {
            const selector = `${base}.${st}`;
            const darkRe = new RegExp(
                'body\\.cocoya-dark-mode\\s+' + selector.replace(/\./g, '\\.'));
            if (!darkRe.test(src)) missing.push(selector);
        }
    }
    assert.deepEqual(missing, [],
        '下列狀態缺少 body.cocoya-dark-mode 覆寫，dark 主題下會退回淺色定義');
});

/**
 * 守門 5：dark 區塊不得「重複宣告 light 已有的同一個 var()」。
 *
 * ★ 為什麼需要這道（P1-3 / 2026-10-02 的實測教訓）：
 *   var(--x) 的實際值由 theme_manager.js:179 寫在 body 行內樣式，
 *   主題切換時 light 與 dark **兩邊都會自動換值**。
 *   因此在 dark 區塊把同一個 var 再寫一次，是「同一件事寫兩次」，
 *   對任何一個主題的呈現結果都沒有影響 —— 純冗餘，卻會讓人以為
 *   「這裡有 dark 專屬的配色調整」，日後改主題時誤以為要同步維護兩處。
 *
 * ★ 為什麼前面的守門與「語法自檢」都抓不到它（別走我走過的弯路）：
 *   · 守門 1 只檢查「vscode-dark 有沒有配 cocoya-dark-mode」，與本條無關。
 *   · 「大括號平衡 / 選擇器是否以逗號結尾」等語法自檢**同樣抓不到**：
 *     本次實測時，刪 dark 規則漏刪選擇器首行會留下裸選擇器行，
 *     而該行會被「下一條規則的選擇器」接續起來 → 語法完全合法，
 *     只是讓那個元素在 dark 下多吃到一條不該有的規則（靜默視覺回歸）。
 *   → 判準只能落在「語意」上：dark 區塊有無重複宣告 light 已有的 var。
 *
 * 範圍收斂：只比對 var() 值（字面值是設計常數，本條不碰）。
 */
function parseRules(text) {
    const s = text.replace(/\/\*[\s\S]*?\*\//g, '');
    const out = [];
    let depth = 0, selStart = 0, openIdx = -1;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '{') {
            if (depth === 0) {
                // ⚠ 選擇器在 '{' **之前**。若把起點設在 '{' 之後，抽出來的
                //   「選擇器」會變成屬性內容 → light/dark 永遠配不上，
                //   守門靜默回傳空結果 = 假綠（本次實測踩過，見下方自檢）。
                let k = i - 1;
                while (k >= 0 && s[k] !== '}' && s[k] !== ';') k--;
                while (k + 1 < i && /\s/.test(s[k + 1])) k++;   // 跳過 '}' 之後的空白
                selStart = k + 1;
                openIdx = i;
            }
            depth++;
        } else if (c === '}') {
            depth--;
            if (depth === 0) {
                out.push({
                    // 終點是 openIdx（開啟 '{'），不是當前的 i（閉合 '}'）
                    sel: s.slice(selStart, openIdx).replace(/\s+/g, ' ').trim(),
                    body: s.slice(openIdx + 1, i)
                });
            }
        }
    }
    return out;
}

function declMap(body) {
    const m = new Map();
    body.split(';').forEach((d) => {
        const t = d.trim();
        const i = t.indexOf(':');
        if (i < 0) return;
        m.set(t.slice(0, i).trim(), t.slice(i + 1).trim());
    });
    return m;
}

const DARK_PREFIX = /^body\.cocoya-dark-mode\s+/;

function findRedundantDarkVars(text) {
    const rs = parseRules(text);
    const isDarkSel = (s) => s.split(',').some((x) => x.includes('body.cocoya-dark-mode'));
    const light = new Map();
    for (const r of rs) {
        if (isDarkSel(r.sel)) continue;
        for (const sel of r.sel.split(',').map((x) => x.trim())) {
            if (!light.has(sel)) light.set(sel, new Map());
            const m = light.get(sel);
            // ⚠ 必須「合併所有同名 light 規則」，不可只留第一條：
            //   同一個選擇器在本檔會出現在多條規則裡（如 .dataset-panel h3
            //   同時有排版規則與間距規則），只留第一條會漏掉後者才有的屬性
            //   → 守門誤判為「不重複」而漏放真正的冗餘（實測踩過）。
            //   同特異度下後者勝出，故直接覆寫即符合 cascade 結果。
            for (const [p, v] of declMap(r.body)) m.set(p, v);
        }
    }
    const offenders = [];
    for (const r of rs) {
        const plain = r.sel.split(',').map((x) => x.trim())
            .filter((x) => x.startsWith('body.cocoya-dark-mode'))
            .map((x) => x.replace(DARK_PREFIX, ''));
        if (!plain.length) continue;
        for (const [p, v] of declMap(r.body)) {
            if (!v.startsWith('var(')) continue;          // 字面值＝設計常數，本條不碰
            const dup = plain.every((ps) => {
                const m = light.get(ps);
                return m && m.get(p) === v;
            });
            if (dup) offenders.push(`${plain[0]} { ${p}: ${v}; }`);
        }
    }
    return offenders;
}

test('守門 5：dark 區塊不得重複宣告 light 已有的同一個 var()', () => {
    assert.deepEqual(findRedundantDarkVars(src), [],
        '以下 dark 屬性與 light 基礎規則寫著同一個 var()，刪掉後視覺不變，屬純冗餘');
});

test('守門 5 自檢：重複宣告一旦出現，本守門必須報紅', () => {
    // 真實回歸形狀：在檔尾補一條「把 light 已有 var 又寫一次」的 dark 規則
    // —— 這正是 P1-3 刪掉的那 6 條規則的形狀，不是憑空構造的變異。
    const regressed = src +
        '\nbody.cocoya-dark-mode .dataset-panel h3 { color: var(--dsm-text-secondary); }\n';
    assert.ok(findRedundantDarkVars(regressed).length > 0,
        '守門必須能抓到 dark 區塊重複宣告 light 已有 var 的情形');
});

test('守門 4 自檢：移除 .warn 的暗色覆寫後本測試必須紅', () => {
    const detect = (text) => {
        const out = [];
        for (const { base, states } of STATE_COMPONENTS) {
            for (const st of states) {
                const re = new RegExp('body\\.cocoya-dark-mode\\s+' +
                    `${base}.${st}`.replace(/\./g, '\\.'));
                if (!re.test(text)) out.push(`${base}.${st}`);
            }
        }
        return out;
    };
    assert.deepEqual(detect(src), []);
    // 模擬回歸：把 .warn 的暗色覆寫整段刪掉。
    // 2026-10-01 修：原寫法的 regex 以 `\n\}` 結尾，但 CSS 是 CRLF → 整段沒被刪掉，
    // broken 與 src 相同，detect(broken) 找不到缺項，這個「自檢」就永遠不會紅。
    // 同時原本還硬編碼了 `color: #e0c878;`，改個色值就會靜默失效。
    // 改為：找出所有 .warn 暗色規則的選擇器行並刪除該整段，不依賴行尾與色值。
    const broken = src.replace(
        /^body\.[^\n]*\.dataset-validation\.warn[^\n]*\n/gm, '').replace(
        /body\.cocoya-dark-mode \.dataset-validation\.warn\s*\{[^}]*\}/, '');
    assert.notEqual(broken, src, '自檢失效：模擬回歸的刪除沒有生效（多半是行尾不符）');
    assert.ok(detect(broken).includes('.dataset-validation.warn'),
        '守門必須能抓到缺少暗色覆寫的狀態');
});

