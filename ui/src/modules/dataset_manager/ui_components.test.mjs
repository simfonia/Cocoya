import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UIComponents } from './ui_components.js';

const here = path.dirname(fileURLToPath(import.meta.url));


// ---------------------------------------------------------------------------
// renderLabelStats：計數欄表頭契約（2026-10-01 P1-2／P2-6）
// ---------------------------------------------------------------------------
// 真值表（不得改動，除非同步 AGENTS.md 的 DM 契約）：
//   object_detection -> 標註框數；line_following -> 標註線段；其餘 -> 樣本數
// ⚠️「其餘」包含 table/feature/serial —— 表格系沒有標註框的概念。
function headerFor(projectType) {
    const container = { innerHTML: '' };
    UIComponents.renderLabelStats(container, { label_counts: { a: 1 } }, { projectType });
    const head = container.innerHTML.match(/<div class="dataset-label-head">([\s\S]*?)<\/div>/)[1];
    return head.replace(/<[^>]*>/g, '|').split('|').map((s) => s.trim()).filter(Boolean)[1];
}

test('計數欄表頭：object_detection=標註框數／line_following=標註線段／其餘=樣本數', () => {
    assert.equal(headerFor('object_detection'), '標註框數');
    assert.equal(headerFor('line_following'), '標註線段');
    assert.equal(headerFor('image_classification'), '樣本數');
    // 表格系若誤用 needsUnclassifiedCheck 的反面分支，會顯示「標註框數」——回歸鎖
    assert.equal(headerFor('table'), '樣本數');
    assert.equal(headerFor('feature'), '樣本數');
    assert.equal(headerFor('serial'), '樣本數');
    assert.equal(headerFor(''), '樣本數');
});

test('renderLabelStats：標籤名稱含 HTML 必須轉義（不可注入）', () => {
    const container = { innerHTML: '' };
    UIComponents.renderLabelStats(container, { label_counts: { '<script>x</script>': 1 } }, {});
    assert.ok(!container.innerHTML.includes('<script>'), '標籤名稱不得原樣進入 HTML');
    assert.ok(container.innerHTML.includes('&lt;script&gt;'));
});

// ---------------------------------------------------------------------------
// P2-6：innerHTML 呈現路徑的轉義不變式
// ---------------------------------------------------------------------------
// 只抓「裸識別字/屬性存取」插值——即後端或使用者可控字串直進屬性。
// 排除：escapeHtml(...)、t(...)、數字索引、三元（class/style 常量）、函式呼叫結果。
const BARE_IDENT = /^[A-Za-z_$][\w$]*(\.[\w$]+|\[\d+\])*$/;
// 白名單：純計數器。由 Array.prototype.map((img, index) => ...) 產生的 0,1,2…，
// 非使用者輸入，不可能承載 " 與 >。附原因以免日後被當成「放寬斷言」的藉口。
const SAFE_IDENTS = new Set(['index']);
function unescapedAttrInterpolations(src) {
    const bad = [];
    const attrRe = /="\$\{([^}]+)\}"/g;
    let m;
    while ((m = attrRe.exec(src)) !== null) {
        const expr = m[1].trim();
        if (/^escapeHTML?\(/i.test(expr) || /^t\(/.test(expr)) continue; // 已轉義 / i18n 常數
        if (expr.includes('?') || expr.includes(':')) continue;         // 三元：class/style 字面量
        if (SAFE_IDENTS.has(expr)) continue;                             // 純計數器（見上方原因）
        if (!BARE_IDENT.test(expr)) continue;                            // 非裸識別字
        bad.push(expr);
    }
    return bad;
}

test('呈現路徑不得有未轉義的屬性插值（掃描 ui_components.js 模板字串）', () => {
    // blobUrl／path 皆為後端或使用者提供的字串，直接插進 src="" 即可注入 "><script>。
    // 本守門鎖定「裸識別字」形狀：${img.blobUrl} 紅、${escapeHTML(img.blobUrl)} 綠。
    const src = fs.readFileSync(path.join(here, 'ui_components.js'), 'utf8');
    assert.deepEqual(unescapedAttrInterpolations(src), [], '屬性插值必須經 escapeHtml');
});

test('scan 守門有效：拔掉 escapeHtml 必須紅（守門自檢）', () => {
    const src = fs.readFileSync(path.join(here, 'ui_components.js'), 'utf8');
    assert.deepEqual(unescapedAttrInterpolations(src), []);
    const broken = src.replace('src="${escapeHTML(img.blobUrl)}"', 'src="${img.blobUrl}"');
    assert.ok(unescapedAttrInterpolations(broken).length > 0, '守門必須能抓到未轉義插值');
});

// ---------------------------------------------------------------------------
// P2-6：AGENTS.md「嚴禁覆寫 #dataset-structure-content innerHTML」紅線守門
// ---------------------------------------------------------------------------
test('紅線：renderLabelStats 不得以 #dataset-structure-content 為目標', () => {
    // 事故紀錄：P2（2026-09-16）與 addSampleFromSampler/handleDeleteImage（2026-09-17）
    // 三度因覆寫此容器的 innerHTML 而讓中欄統一標籤管理器消失。
    // 掃描 ui_layout.js／ui 下各檔案，出現 renderLabelStats(<...>#dataset-structure-content) 即紅。
    const root = here;
    const offenders = [];
    const walk = (dir) => {
        for (const name of fs.readdirSync(dir)) {
            const full = path.join(dir, name);
            if (fs.statSync(full).isDirectory()) { walk(full); continue; }
            if (!name.endsWith('.js') || name.endsWith('.test.mjs')) continue;
            const text = fs.readFileSync(full, 'utf8');
            text.split('\n').forEach((line, i) => {
                const code = line.replace(/^\s*(\*|\/\/).*$/, '');
                if (!/renderLabelStats\s*\(/.test(code)) return;
                // 同一敘述（可跨行）若指向 dataset-structure-content 即違規
                const idx = text.indexOf(line, 0);
                const stmt = text.slice(idx, idx + 200).split('\n').slice(0, 3).join(' ');
                if (/dataset-structure-content/.test(stmt) && !/^\s*(\*|\/\/)/.test(line)) {
                    offenders.push(`${name}:${i + 1}`);
                }
            });
        }
    };
    walk(root);
    assert.deepEqual(offenders, [], 'renderLabelStats 只能寫 #view-label-stats（見 AGENTS.md）');
});
