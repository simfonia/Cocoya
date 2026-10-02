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
    const open = (src.match(/\{/g) || []).length;
    const close = (src.match(/\}/g) || []).length;
    assert.equal(open, close, `大括號不平衡：{ ${open} / } ${close}`);
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

