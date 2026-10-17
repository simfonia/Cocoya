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
// ---------------------------------------------------------------------------
// 2026-10-13：HTML 註解不得出現在標籤的「屬性列」之內
// ---------------------------------------------------------------------------
// 事故：annotation.js 的 <label ...> 與 title="..." 之間夾了一個 HTML 註解
// （原本是要說明 i18n key 不可加 DSM_ 前綴）。HTML 語法上標籤屬性之間不可出現
// `<!--`，瀏覽器會把註解後半連同 title="..."> 當成內容輸出 →
// P3 工具列上方出現一行詭異可見文字 `title="十字尺規顏色">尺規`。
// 判據落在真不變式上：任何「含 <!-- 的行」不得同時是標籤屬性的延續行。
// 掃描 ui/ 下所有 .js 的模板字串，抓「同一行同時出現 <!-- 與屬性樣式」的形狀。

test('紅線：HTML 註解不得夾在標籤屬性列之間（會洩漏成可見文字）', () => {
    const root = path.join(here, 'ui');
    const offenders = [];
    const walk = (dir) => {
        for (const name of fs.readdirSync(dir)) {
            const full = path.join(dir, name);
            if (fs.statSync(full).isDirectory()) { walk(full); continue; }
            if (!name.endsWith('.js') || name.endsWith('.test.mjs')) continue;
            const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
            lines.forEach((line, i) => {
                // 註解起始行本身合法；違規的是「註解出現在開頭是屬性的行」
                // 形狀：行首（去空白）不是 < 而是屬性/續行，卻含 <!-- →
                //   <label id="x"\r\n   <!-- ... -->\r\n   title="y">   就是這種
                const trimmed = line.trim();
                if (!trimmed.startsWith('<!--')) return;
                // 往前看一行：若它是「未閉合的標籤起始」（以 = 或 " 結尾而非 > 或 -->），即違規
                const prev = (lines[i - 1] || '').trim();
                if (prev === '') return;
                if (!prev.includes('<')) return;               // 不是標籤起始行
                if (prev.endsWith('>')) return;                // 標籤已正常閉合
                if (prev.endsWith('-->')) return;              // 前一個註解已閉合
                offenders.push(`${name}:${i + 1} 前一行為未閉合的標籤起始`);
            });
        }
    };
    walk(root);
    assert.deepEqual(offenders, [],
        'HTML 註解不可夾在標籤屬性之間（見 annotation.js 2026-10-13 事故）');
});

test('守門自檢：把註解插回 <label> 屬性列必須報紅', () => {
    // 變異＝真實退化形狀：註解回到 label 起始行與 title 之間
    const bad = [
        '<label class="x" id="annotation-crosshair-picker"',
        '   <!-- 註解放錯位置 -->',
        '    title="y">'
    ].join('\r\n');
    const offenders = [];
    bad.split(/\r?\n/).forEach((line, i) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith('<!--')) return;
        const prev = (bad.split(/\r?\n/)[i - 1] || '').trim();
        if (prev === '' || !prev.includes('<') || prev.endsWith('>') || prev.endsWith('-->')) return;
        offenders.push(`${i + 1}`);
    });
    assert.ok(offenders.length > 0, '守門必須能抓到註解夾在標籤屬性之間的形狀');
});

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

// ---------------------------------------------------------------------------
// 2026-10-13：頂部統計列的「單一更新入口」契約
// ---------------------------------------------------------------------------
// 為何是掃描型守門而非行為測試：renderStatsPanels 是 ui_layout.js 的內部函式
// （非 export），行為測試碰不到它。而真正的迴歸形狀正是「有人新增一條統計更新
// 路徑卻只寫中欄」——那種寫法在 P3 完全不會更新頂部列，且沒有任何現有測試會紅。
// 判據落在真不變式上：renderStatsPanels 函式本體必須呼叫 renderGlobalStatsBar()。

/**
 * 取出 renderStatsPanels 的函式本體（純文字切片）。
 * ⚠ 邊界必須是「行首的 }」而不是字串 '\n}\n'：本專案全檔為 CRLF，
 * 後者在 utf8 讀入後永遠匹配不到（indexOf 回 -1 → 負長度 → 守門本身壞掉
 * 卻表現為 assertion 失敗，極難察覺）。
 */
function renderStatsPanelsBody() {
    const src = fs.readFileSync(path.join(here, 'ui_layout.js'), 'utf8');
    const start = src.indexOf('function renderStatsPanels()');
    assert.ok(start > 0, '應能找到 renderStatsPanels');
    const rest = src.slice(start);
    const m = rest.match(/^function renderStatsPanels\(\)[\s\S]*?\n\}/m);
    assert.ok(m, '應能截出 renderStatsPanels 函式本體');
    return m[0];
}

test('契約：renderStatsPanels 必須更新頂部統計列（P3 也不得漏）', () => {
    const body = renderStatsPanelsBody();
    assert.ok(/renderGlobalStatsBar\s*\(\s*\)/.test(body),
        'renderStatsPanels 必須呼叫 renderGlobalStatsBar()——否則 P3 標註模式看不到統計');
});

test('契約：頂部統計列的更新必須在 view-label-stats 早退分支「之前」（P3 才會更新）', () => {
    // P3 時 #view-label-stats 的 DOM 仍存在（面板只是 display:none），
    // 第一個分支會 return。若把統計列更新寫在該 return 之後，P3 就永遠靜止。
    const body = renderStatsPanelsBody();
    const barIdx = body.indexOf('renderGlobalStatsBar');
    const earlyReturnIdx = body.indexOf("getElementById('view-label-stats')");
    assert.ok(barIdx > 0 && earlyReturnIdx > 0, '兩處都應存在');
    assert.ok(barIdx < earlyReturnIdx,
        '頂部統計列更新必須在 view-label-stats 早退之前，否則 P3 不會更新');
});

test('守門自檢：把統計列更新搬到早退之後必須報紅', () => {
    const body = renderStatsPanelsBody();
    // 變異＝真實退化形狀：刪掉原本在前面的呼叫，改放到早退分支之後
    const moved = body
        .replace(/    renderGlobalStatsBar\(\);\r?\n\r?\n/, '')
        .replace("        UIComponents.renderLabelStats(viewStats, stats, buildStatsViewOptions());",
            "        renderGlobalStatsBar();\r\n        UIComponents.renderLabelStats(viewStats, stats, buildStatsViewOptions());");
    assert.notEqual(moved, body, '自檢失效：變異沒有生效');
    const barIdx = moved.indexOf('renderGlobalStatsBar');
    const earlyReturnIdx = moved.indexOf("getElementById('view-label-stats')");
    assert.ok(barIdx > earlyReturnIdx, '變異後統計列更新應落在早退之後（= 真實退化）');
});

// ---------------------------------------------------------------------------
// 2026-10-13：dataset.json 的 project.type 不得推翻「已鎖定的類型」
// ---------------------------------------------------------------------------
// 事故：P1 選「影像分類」進 P2 → 匯入影像資料夾 → 中欄卻以 table 模式開啟，
// 且頂部統計列的 chips 變成不可點（因為 isClassificationType(table) === false）。
// 根因：applyLoadedProgress 原本無條件用 dataset.json 的 project.type 覆蓋 UI。
// 這與 M1「類型已鎖定」鐵律直接矛盾（log/work/2026-08-17.md:122 早已記載此問題但未修）。
// 判據落在真不變式上：applyLoadedProgress 內對 type 的決策必須是
// 「lockedType || savedType」這個優先序，不可出現把 savedType 直接餵給下拉/spec 的寫法。

test('契約：applyLoadedProgress 的類型優先序必須是 lockedType > dataset.json', () => {
    const src = fs.readFileSync(path.join(here, 'ui_layout.js'), 'utf8');
    const m = src.match(/^function applyLoadedProgress\(spec\) \{[\s\S]*?\n\}/m);
    assert.ok(m, '應能截出 applyLoadedProgress 函式本體');
    const body = m[0];
    assert.ok(/const lockedType = sessionManager\.snapshot\(\)\.lockedType/.test(body),
        'applyLoadedProgress 必須讀取 sessionManager 的 lockedType');
    assert.ok(/const effectiveType = lockedType \|\| savedType/.test(body),
        '類型優先序必須是 lockedType || savedType（鎖定型別優先）');
});

test('契約：applyLoadedProgress 不得把 savedType 直接用於下拉或 spec（否則鎖定型別被推翻）', () => {
    const src = fs.readFileSync(path.join(here, 'ui_layout.js'), 'utf8');
    const m = src.match(/^function applyLoadedProgress\(spec\) \{[\s\S]*?\n\}/m);
    const body = m[0];
    // 只檢查「會寫入 UI/spec 的兩處」：typeSelect.value 與 spec.project.type
    assert.ok(!/typeSelect\.value = savedType/.test(body),
        '下拉不得直接用 savedType（會被 dataset.json 推翻鎖定型別）');
    assert.ok(!/type: savedType/.test(body),
        'spec.project.type 不得直接用 savedType（統計/篩選/匯出會依錯的類型運作）');
    // 反向確認：這兩處都改用 effectiveType
    assert.ok(/typeSelect\.value = effectiveType/.test(body), '下拉應使用 effectiveType');
    assert.ok(/type: effectiveType/.test(body), 'spec 應使用 effectiveType');
});

test('守門自檢：把 effectiveType 換回 savedType 必須報紅', () => {
    const src = fs.readFileSync(path.join(here, 'ui_layout.js'), 'utf8');
    const m = src.match(/^function applyLoadedProgress\(spec\) \{[\s\S]*?\n\}/m);
    // 變異＝真實退化形狀（2026-10-13 之前的寫法）
    const regressed = m[0]
        .replace('typeSelect.value = effectiveType', 'typeSelect.value = savedType')
        .replace('type: effectiveType', 'type: savedType');
    assert.notEqual(regressed, m[0], '自檢失效：變異沒有生效');
    assert.ok(/typeSelect\.value = savedType/.test(regressed) && /type: savedType/.test(regressed),
        '變異後應出現 savedType 直接使用的形狀（= 真實退化）');
});

// ---------------------------------------------------------------------------
// 2026-10-13：refreshDynamicPanels 必須一併重繪頂部統計列
// ---------------------------------------------------------------------------
// 事故（使用者實機回報，問題 2）：按「清除資料」或關閉 DM 重開後，
// 縮圖不見了、中欄統計也清了，但頂部統計列仍是舊數字且沒有歸零。
// 根因：頂部統計列不在 #dataset-structure-content 之內，renderStructurePanel() 碰不到它；
// 而 renderGlobalStatsBar() 原本只由 renderStatsPanels() 呼叫，
// 於是所有「只走 refreshDynamicPanels」的路徑都會漏掉它。
// 同一根因也是問題 3「進 P3 點了 chip 之後回 P2 全部失效」的原因
// （P3 版 chips 渲染成 span、未綁 click，DOM 沒重繪就一直留著）。

test('契約：refreshDynamicPanels 必須重繪頂部統計列（否則清除/進出 P3 會留舊數字）', () => {
    const src = fs.readFileSync(path.join(here, 'ui_layout.js'), 'utf8');
    const m = src.match(/^function refreshDynamicPanels\(\) \{[\s\S]*?\n\}/m);
    assert.ok(m, '應能截出 refreshDynamicPanels 函式本體');
    // 判據必須排除註解：說明註解裡也提到這個函式名，
    // 若用裸 includes 檢查，光有註解就會永遠綠（假安全感）。
    const hasRealCall = m[0].split(/\r?\n/)
        .filter((line) => !/^\s*(\/\/|\*)/.test(line))
        .some((line) => /renderGlobalStatsBar\s*\(\s*\)/.test(line));
    assert.ok(hasRealCall,
        'refreshDynamicPanels 必須呼叫 renderGlobalStatsBar()——它不在中欄容器內，不會被 renderStructurePanel 碰到');
});

test('守門自檢：移除 refreshDynamicPanels 裡的統計列重繪必須報紅', () => {
    const src = fs.readFileSync(path.join(here, 'ui_layout.js'), 'utf8');
    const m = src.match(/^function refreshDynamicPanels\(\) \{[\s\S]*?\n\}/m);
    // 只移除「行首縮排的呼叫陳述句」。上方的說明註解裡也出現這個名字，
    // 不可整串 replace —— 否則變異沒生效，自檢會變成永遠綠的假安全感。
    const regressed = m[0].replace(/\n    renderGlobalStatsBar\(\);\r?\n/, '\n');
    assert.notEqual(regressed, m[0], '自檢失效：變異沒有生效');
    // 剩下的字樣只能出現在註解裡（行首是 //），不得再有實際呼叫
    const realCalls = regressed.split(/\r?\n/)
        .filter((line) => !/^\s*(\/\/|\*)/.test(line))
        .some((line) => /renderGlobalStatsBar\s*\(\s*\)/.test(line));
    assert.ok(!realCalls, '變異後不應再有實際的統計列重繪呼叫（= 真實退化）');
});

// ---------------------------------------------------------------------------
// 2026-10-13：P3 刪除 bbox 必須即時更新統計
// ---------------------------------------------------------------------------
// 事故：P3 按 Delete 刪框，頂部統計列的「已標註／標註框數」沒有即時更新。
// 根因：標註變更走 onUpdate 的 300ms debounce（那是為「拉框／拖曳」這類連續操作設計的），
// 而 Delete 是離散動作，使用者預期當下就變。

test('契約：deleteSelectedAnnotation 必須即時重算統計（不可只靠 300ms debounce）', () => {
    const src = fs.readFileSync(path.join(here, 'ui', 'annotation.js'), 'utf8');
    const m = src.match(/^    function deleteSelectedAnnotation\(\) \{[\s\S]*?\n    \}/m);
    assert.ok(m, '應能截出 deleteSelectedAnnotation 函式本體');
    assert.ok(/clearTimeout\(state\.annotationMode\.saveTimer\)/.test(m[0]),
        '必須先結清 onUpdate 建立的 debounce timer（否則 300ms 後會用舊資料再算一次）');
    assert.ok(/updateStatsFromImages\s*\(\s*\)/.test(m[0]),
        'deleteSelectedAnnotation 必須直接呼叫 updateStatsFromImages()（Delete 是離散動作，不可等 debounce）');
});

test('守門自檢：移除 deleteSelectedAnnotation 的即時統計更新必須報紅', () => {
    const src = fs.readFileSync(path.join(here, 'ui', 'annotation.js'), 'utf8');
    const m = src.match(/^    function deleteSelectedAnnotation\(\) \{[\s\S]*?\n    \}/m);
    const regressed = m[0].replace(/\n        updateStatsFromImages\(\);/, '');
    assert.notEqual(regressed, m[0], '自檢失效：變異沒有生效');
    assert.ok(!/updateStatsFromImages\s*\(\s*\)/.test(regressed),
        '變異後不應再有即時統計更新（= 真實退化）');
});

// ---------------------------------------------------------------------------
// 2026-10-13：關閉 DM 必須歸零（方案 A）
// ---------------------------------------------------------------------------
// 決策（使用者拍板）：直接關閉 DM 再開啟＝歸零並釋放記憶體，不保留狀態。
// 理由：① DM 每次開啟都停在 P1 卡片入口，保留的 state 沒有任何介面能看見；
//       ② 已 autosave 落盤，資料不會丟；③ 不 revoke 的話 blob 會隨 webview 一直累積。

test('契約：closeDatasetManager 必須歸零（關閉即清場，不等下次開啟）', () => {
    const src = fs.readFileSync(path.join(here, 'ui_layout.js'), 'utf8');
    const m = src.match(/^export async function closeDatasetManager\(\) \{[\s\S]*?\n\}/m);
    assert.ok(m, '應能截出 closeDatasetManager 函式本體');
    // 落盤必須在歸零之前（先 flush 再清場，否則最後異動會被丟掉）
    const flushIdx = m[0].indexOf('scheduleAutoSave(true)');
    const resetIdx = m[0].indexOf('resetSessionData(');
    assert.ok(flushIdx > 0, '關閉前必須先立即落盤');
    assert.ok(resetIdx > 0, '關閉時必須歸零（方案 A）');
    assert.ok(flushIdx < resetIdx, '必須先落盤再歸零，否則最後異動會遺失');
});

test('契約：歸零時必須釋放前端自建的 blob URL（不可無腦 revoke 全部）', () => {
    const src = fs.readFileSync(path.join(here, 'ui_layout.js'), 'utf8');
    // 旗標：live 拍照建的 blob 必須標記，匯入資料夾的平台 URI 不標
    assert.ok(/_blobOwned: true/.test(src),
        'live 拍照建立的 blobUrl 必須標記 _blobOwned（否則無法與平台 URI 區分）');
    const m = src.match(/^function releaseOwnedBlobUrls\(\) \{[\s\S]*?\n\}/m);
    assert.ok(m, '應有 releaseOwnedBlobUrls 函式');
    assert.ok(/_blobOwned/.test(m[0]), '只能 revoke 帶 _blobOwned 旗標的');
    assert.ok(/revokeObjectURL/.test(m[0]), '必須真的 revoke');
    // resetSessionData 必須在清空 state.images 之前釋放（否則遍歷不到）
    const rm = src.match(/^function resetSessionData\(options = \{\}\) \{[\s\S]*?\n\}/m);
    assert.ok(rm, '應能截出 resetSessionData 函式本體');
    const relIdx = rm[0].indexOf('releaseOwnedBlobUrls()');
    const clearIdx = rm[0].indexOf('state.images = []');
    assert.ok(relIdx > 0 && clearIdx > 0, '兩者都應存在');
    assert.ok(relIdx < clearIdx, '必須先釋放 blob 再清空 state.images，否則就遍歷不到 URL');
});

test('守門自檢：歸零改成無腦 revoke 必須報紅', () => {
    const src = fs.readFileSync(path.join(here, 'ui_layout.js'), 'utf8');
    const m = src.match(/^function releaseOwnedBlobUrls\(\) \{[\s\S]*?\n\}/m);
    // 變異＝真實退化形狀：不看旗標，見 URL 就 revoke（會動到平台 URI）
    const regressed = m[0].replace(/if \(img && img\._blobOwned && img\.blobUrl\)/, 'if (img && img.blobUrl)');
    assert.notEqual(regressed, m[0], '自檢失效：變異沒有生效');
    assert.ok(!/_blobOwned/.test(regressed), '變異後不應再檢查旗標（= 真實退化）');
});

// ---------------------------------------------------------------------------
// renderGlobalStats：頂部常駐統計列（2026-10-13）
// ---------------------------------------------------------------------------

/**
 * 可綁定事件的假容器。
 * 必須提供 querySelectorAll + forEach：renderGlobalStats 在 filterable 時會真的
 * 走這條路去綁 onclick，替身缺它就等於沒測到綁定那一段（假綠）。
 * 每個 chip 紀錄自己的 data-label，供斷言「點下去回呼的是哪個分類」。
 */
function makeStatsContainer() {
    const chips = [];
    const container = {
        innerHTML: '',
        querySelectorAll(sel) {
            if (sel !== '.dataset-global-stats-chip') return [];
            return chips;
        },
        forEach(cb) { chips.forEach(cb); }
    };
    // 以 innerHTML setter 攔截：寫入 HTML 後依 data-label 重建假 chip 節點
    let html = '';
    Object.defineProperty(container, 'innerHTML', {
        get() { return html; },
        set(v) {
            html = v;
            chips.length = 0;
            const re = /<button[^>]*data-label="([^"]*)"[^>]*>/g;
            let m;
            while ((m = re.exec(v)) !== null) {
                const label = m[1];
                chips.push({
                    label,
                    getAttribute(name) { return name === 'data-label' ? label : null; },
                    onclick: null
                });
            }
        }
    });
    return { container, chips };
}

test('renderGlobalStats：摘要列去重＋無符號前綴（2026-10-13 使用者回報張數與分母重複）', () => {
    const render = (projectType, stats, opts) => {
        const c = { innerHTML: '' };
        UIComponents.renderGlobalStats(c, stats, Object.assign({ projectType }, opts));
        const m = c.innerHTML.match(/<div class="dataset-global-stats-summary">([\s\S]*?)<\/div>/);
        return m ? m[1] : '';
    };

    // 分類：每張必有一類 ⇒ 只顯示張數（不可再出現已標註，那是 100% 冗餘）
    const cls = render('image_classification', { label_counts: { a: 135 } }, { imageCount: 135, annotatedCount: 135 });
    assert.ok(/>135 張</.test(cls), '分類應顯示「135 張」');
    assert.ok(!cls.includes('已標註'), '分類型別的已標註恆等於張數，屬純冗餘，不應顯示');

    // 物件偵測：張數已含在「已標註 X/N」分母裡，不可再單獨一項（這正是回報的重複來源）
    const od = render('object_detection', { label_counts: { a: 3, b: 2 } }, { imageCount: 135, annotatedCount: 135 });
    assert.ok(/已標註 <b>135<\/b>\/135 張/.test(od), '偵測應顯示「已標註 135/135 張」');
    assert.ok(/標註框數 <b>5<\/b>/.test(od), '偵測應顯示框數總和');
    // 張數只准出現一次（在分母），不可另有獨立的「135 張」
    assert.equal((od.match(/>135 張</g) || []).length, 0, '張數不可再單獨一項（與分母重複）');
    assert.equal((od.match(/135/g) || []).length, 2, '135 只應出現在分子與分母');

    // 循跡：同上，單位改為線段
    const lf = render('line_following', { label_counts: { a: 9 } }, { imageCount: 20, annotatedCount: 7 });
    assert.ok(/已標註 <b>7<\/b>\/20 張/.test(lf), '循跡應顯示「已標註 7/20 張」');
    assert.ok(/標註線段 <b>9<\/b>/.test(lf), '循跡應顯示線段總和');

    // 三個符號前綴一律不得出現
    for (const s of ['📷', '✅', 'Σ']) {
        assert.ok(!cls.includes(s) && !od.includes(s) && !lf.includes(s), `不應含符號 ${s}`);
    }

    // 表格系：無「張」的概念
    const tb = render('table', { label_counts: { a: 7 } }, {});
    assert.ok(/樣本數 <b>7<\/b>/.test(tb), '表格系顯示樣本數總和');
    assert.ok(!tb.includes('張'), '表格系沒有「張」的概念');
});

test('renderGlobalStats：總數＋每個分類都有獨立計數（缺點 1）', () => {
    const container = { innerHTML: '' };
    UIComponents.renderGlobalStats(container, {
        sample_count: 12,
        label_counts: { paper: 8, rock: 4 }
    }, { projectType: 'image_classification', imageCount: 12, annotatedCount: 12 });
    // 每個分類的計數都要各自出現，不可只有總數
    assert.ok(container.innerHTML.includes('paper'), '應含分類名 paper');
    assert.ok(container.innerHTML.includes('rock'), '應含分類名 rock');
    assert.ok(/>8</.test(container.innerHTML), 'paper 應顯示 8');
    assert.ok(/>4</.test(container.innerHTML), 'rock 應顯示 4');
    // 摘要（影像張數 12）
    assert.ok(container.innerHTML.includes('>12<'), '應顯示總數 12');
});

test('renderGlobalStats：計數單位沿用中欄統計語意（偵測=框數、循跡=線段、分類=樣本數）', () => {
    const unitFor = (projectType) => {
        const container = { innerHTML: '' };
        UIComponents.renderGlobalStats(container, { label_counts: { a: 3 } }, { projectType });
        return container.innerHTML.includes('標註框數') ? '框數'
            : (container.innerHTML.includes('標註線段') ? '線段' : '樣本數');
    };
    // 與 renderLabelStats 的 headerFor 真值表一致——兩處單位不可分歧
    assert.equal(unitFor('object_detection'), '框數');
    assert.equal(unitFor('line_following'), '線段');
    assert.equal(unitFor('image_classification'), '樣本數');
    assert.equal(unitFor('table'), '樣本數');
    assert.equal(unitFor('feature'), '樣本數');
});

test('renderGlobalStats：標籤名含 HTML 必須轉義（不可注入）', () => {
    const container = { innerHTML: '' };
    UIComponents.renderGlobalStats(container, { label_counts: { '<script>x</script>': 1 } }, { projectType: 'image_classification' });
    assert.ok(!container.innerHTML.includes('<script>'), '標籤名不得原樣進入 HTML');
    assert.ok(container.innerHTML.includes('&lt;script&gt;'));
});

test('renderGlobalStats：未傳 options 時不崩（向後相容，僅渲染計數）', () => {
    const container = { innerHTML: '' };
    assert.doesNotThrow(() => UIComponents.renderGlobalStats(container, { label_counts: { a: 1 } }));
    assert.ok(container.innerHTML.length > 0);
});

test('renderGlobalStats：container 為 null 時 no-op', () => {
    assert.doesNotThrow(() => UIComponents.renderGlobalStats(null, {}, {}));
});

test('renderGlobalStats：空 label_counts 時仍顯示總數（不可整列空白）', () => {
    const container = { innerHTML: '' };
    UIComponents.renderGlobalStats(container, { label_counts: {} }, { projectType: 'image_classification', imageCount: 0 });
    assert.ok(container.innerHTML.includes('全部'), '仍應有「全部」chip');
    assert.ok(container.innerHTML.includes('dataset-global-stats-summary'), '仍應有摘要列');
});

// --- 可篩選性：button/span 的選擇是「看起來能點就必須真的有反應」的判據 ---

test('renderGlobalStats：無 onChipClick 時 chips 是 span（不可點卻有按鈕外觀＝誤導）', () => {
    const container = { innerHTML: '' };
    UIComponents.renderGlobalStats(container, { label_counts: { a: 1 } }, { projectType: 'image_classification' });
    assert.ok(!/<button/.test(container.innerHTML), '不可篩選時不應渲染 button');
});

test('renderGlobalStats：filterable 但缺 onChipClick 時仍不可點（兩條件都需成立）', () => {
    const container = { innerHTML: '' };
    UIComponents.renderGlobalStats(container, { label_counts: { a: 1 } },
        { projectType: 'image_classification', filterable: true });
    assert.ok(!/<button/.test(container.innerHTML), '缺 onChipClick 時不得渲染可點 chips');
});

test('renderGlobalStats：可篩選時 chips 帶 data-label（含全部＝空字串）', () => {
    const { container } = makeStatsContainer();
    UIComponents.renderGlobalStats(container, { label_counts: { paper: 2 } },
        { projectType: 'image_classification', filterable: true, onChipClick: () => {} });
    assert.ok(/<button[^>]*data-label="paper"/.test(container.innerHTML), 'paper chip 應帶 data-label');
    assert.ok(/data-label=""/.test(container.innerHTML), '全部 chip 應帶空 data-label');
});

test('renderGlobalStats：activeLabel 對應的 chip 標記 is-active（視覺回饋）', () => {
    const render = (activeLabel) => {
        const { container } = makeStatsContainer();
        UIComponents.renderGlobalStats(container, { label_counts: { paper: 2, rock: 1 } },
            { projectType: 'image_classification', filterable: true, onChipClick: () => {}, activeLabel });
        return container.innerHTML;
    };
    assert.ok(/data-label="rock"[^>]*dataset-global-stats-chip is-active/.test(render('rock')),
        '篩選 rock 時 rock chip 應為 is-active');
    assert.ok(/data-label="paper"[^>]*dataset-global-stats-chip"/.test(render('rock')),
        '未篩選的 paper chip 不應帶 is-active');
    assert.ok(/dataset-global-stats-chip-all is-active/.test(render(null)),
        '未篩選時「全部」應為 is-active');
});

// ---------------------------------------------------------------------------
// 2026-10-13：偵測/循跡的「未標註」chip（使用者需求）
// ---------------------------------------------------------------------------

test('renderGlobalStats：偵測類型顯示「未標註」chip，數量＝張數 − 已標註張數', () => {
    const { container } = makeStatsContainer();
    UIComponents.renderGlobalStats(container, { label_counts: { paper: 3, rock: 1 } }, {
        projectType: 'object_detection',
        imageCount: 10,
        annotatedCount: 4,
        filterable: true,
        onChipClick: () => {}
    });
    const m = container.innerHTML.match(
        new RegExp(`<button[^>]*data-label="${UIComponents.UNANNOTATED_FILTER}"[^>]*>.*?<b>(\\d+)</b>`)
    );
    assert.ok(m, '偵測類型應渲染「未標註」button chip');
    assert.equal(m[1], '6', '未標註張數＝10 − 4');
    assert.ok(container.innerHTML.includes('dataset-global-stats-chip-unannotated'), '應帶未標註專屬 class');
});

test('renderGlobalStats：分類類型不得出現「未標註」chip（label_counts 已有 unlabeled，會重複）', () => {
    const { container } = makeStatsContainer();
    UIComponents.renderGlobalStats(container, { label_counts: { paper: 3, unlabeled: 2 } }, {
        projectType: 'image_classification',
        imageCount: 5,
        filterable: true,
        onChipClick: () => {}
    });
    assert.ok(!container.innerHTML.includes(UIComponents.UNANNOTATED_FILTER),
        '分類類型不應渲染未標註哨兵 chip');
});

test('renderGlobalStats：無 annotatedCount 時不出未標註 chip（無從推算，不可顯示 0 誤導）', () => {
    const { container } = makeStatsContainer();
    UIComponents.renderGlobalStats(container, { label_counts: { paper: 3 } }, {
        projectType: 'object_detection',
        imageCount: 10,
        filterable: true,
        onChipClick: () => {}
    });
    assert.ok(!container.innerHTML.includes(UIComponents.UNANNOTATED_FILTER),
        '缺 annotatedCount 時不得顯示未標註 chip');
});

test('renderGlobalStats：annotatedCount > imageCount 時未標註數不可為負', () => {
    const { container } = makeStatsContainer();
    UIComponents.renderGlobalStats(container, { label_counts: {} }, {
        projectType: 'line_following',
        imageCount: 3,
        annotatedCount: 5,
        filterable: true,
        onChipClick: () => {}
    });
    const m = container.innerHTML.match(
        new RegExp(`data-label="${UIComponents.UNANNOTATED_FILTER}"[^>]*>.*?<b>(\\d+)</b>`)
    );
    assert.ok(m, '仍應渲染未標註 chip');
    assert.equal(m[1], '0', '負值必須收斂為 0');
});

test('契約：未標註哨兵不得與一般類別名稱相同（否則會被 label_map 查表誤判）', () => {
    const sentinel = UIComponents.UNANNOTATED_FILTER;
    assert.equal(typeof sentinel, 'string');
    assert.ok(sentinel.startsWith('__') && sentinel.endsWith('__'),
        '哨兵應以前後綴包覆，降低與使用者自訂類別撞名的機率');
    assert.notEqual(sentinel, 'unlabeled', "與分類的 'unlabeled' 必須不同");
    assert.notEqual(sentinel, '', '空字串是「全部」的語意，不可複用');
});

// ---------------------------------------------------------------------------
// 2026-10-13：P3 縮圖條也必須套用分類篩選（不可直接餵 state.images）
// ---------------------------------------------------------------------------
// 三個渲染目標原本都直接呼叫 renderAnnotationThumbnails(..., state.images, ...)，
// 篩選後序號與 state.images 錯位 → 點擊會跳到別張圖、刪除會刪到別張圖（磁碟檔案，不可逆）。

test('紅線：P3 縮圖條不得以 state.images 直接餵給 renderAnnotationThumbnails', () => {
    const files = [
        path.join(here, 'ui', 'annotation.js'),
        path.join(here, 'ui', 'classification.js'),
        path.join(here, 'ui_layout.js')
    ];
    const offenders = [];
    for (const f of files) {
        const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
        lines.forEach((line, i) => {
            if (/^\s*(\/\/|\*)/.test(line)) return;
            if (/renderAnnotationThumbnails\([^)]*state\.images/.test(line)) {
                offenders.push(`${path.basename(f)}:${i + 1}`);
            }
        });
    }
    assert.deepEqual(offenders, [],
        '縮圖條必須走 visibleImageEntries／renderAnnotationStrip（含索引映射），不可直接用 state.images');
});

test('契約：P2/P3 縮圖牆與縮圖條都必須把篩選後位置映射回 state.images 原始索引', () => {
    const src = fs.readFileSync(path.join(here, 'ui_layout.js'), 'utf8');
    // 縮圖牆（P2）
    assert.ok(/onImageClick: \(img, idx\) => enterAnnotationMode\(img, entries\[idx\]\.index\)/.test(src),
        'P2 縮圖牆點擊必須映射回原始索引');
    assert.ok(/onDeleteImage: \(idx\) => handleDeleteImage\(entries\[idx\]\.index\)/.test(src),
        'P2 縮圖牆刪除必須映射回原始索引');
    // 縮圖條（P3）
    assert.ok(/onThumbnailClick: \(i\) => navigateToImage\(entries\[i\]\.index\)/.test(src),
        'P3 縮圖條點擊必須映射回原始索引');
    assert.ok(/onDeleteImage: \(i\) => handleDeleteImage\(entries\[i\]\.index\)/.test(src),
        'P3 縮圖條刪除必須映射回原始索引');
});

test('renderGlobalStats：點 chip 觸發 onChipClick（分類名）；點全部觸發 null', () => {    const clicks = [];
    const { container, chips } = makeStatsContainer();
    UIComponents.renderGlobalStats(container, { label_counts: { paper: 2, rock: 1 } }, {
        projectType: 'image_classification',
        filterable: true,
        onChipClick: (label) => clicks.push(label)
    });
    // 真的綁上了：未綁定時 onclick 為 null，呼叫會 TypeError
    const byLabel = (label) => chips.find((c) => c.label === label);
    assert.ok(byLabel('paper').onclick, 'paper chip 應已綁定 onclick');
    byLabel('paper').onclick();
    byLabel('rock').onclick();
    byLabel('').onclick();   // 「全部」的 data-label 是空字串
    assert.deepEqual(clicks, ['paper', 'rock', null],
        '分類 chip 回傳分類名；「全部」回傳 null（空字串不得變成篩選條件）');
});

// ---------------------------------------------------------------------------
// 2026-10-13：P3 縮圖焦點框／鍵盤導航必須走「篩選後位置」，不可再用絕對索引
// ---------------------------------------------------------------------------
// 病根：縮圖條改成 state.images 的子集後，DOM 序號與 currentIndex（絕對索引）脫勾。
// 實機回報「按第二個分類 chip 後綠框消失、篩全部或第一分類卻正常」——
// 後兩種情況下位置恰好等於絕對索引，屬於巧合而非正確。

function readSource(relPath) {
    return fs.readFileSync(path.join(here, relPath), 'utf8');
}

function extractFunction(src, signature) {
    const start = src.indexOf(signature);
    if (start < 0) return null;
    let depth = 0;
    let i = src.indexOf('{', start);
    if (i < 0) return null;
    const bodyStart = i;
    for (; i < src.length; i += 1) {
        if (src[i] === '{') depth += 1;
        else if (src[i] === '}') {
            depth -= 1;
            if (depth === 0) return src.slice(bodyStart, i + 1);
        }
    }
    return null;
}

/**
 * 剝除 // 註解（本檔掃描的函式不含字串內的 // ，故可安全用行處理）。
 * 為何必要：守門的「不得出現 X」若連註解一起掃，會被說明用的文字誤判成紅燈
 * （實作時就踩到 —— 註解寫了「不可用 state.images[idx]」反而讓守門變紅）。
 */
function stripLineComments(text) {
    return text.split(/\r?\n/).filter((line) => !/^\s*\/\//.test(line)).join('\n');
}

test('契約：updateThumbnailHighlight 必須用 statsVisiblePositionOf 換算，不得比對絕對索引', () => {
    const src = readSource('ui_layout.js');
    const body = stripLineComments(extractFunction(src, 'function updateThumbnailHighlight()'));
    assert.ok(body, '應能擷取函式本體');
    assert.ok(/const pos = statsVisiblePositionOf\(state\.annotationMode\.currentIndex\)/.test(body),
        '必須先換算成篩選後位置');
    assert.ok(/item\.classList\.toggle\('current', idx === pos\)/.test(body),
        'class 比對必須用 pos');
    assert.ok(!/idx === state\.annotationMode\.currentIndex/.test(body),
        '不得再以 DOM 序號直接比對絕對索引（這正是焦點框消失的病根）');
});

test('契約：updateThumbnailHighlight 的勾號必須讀 entries[idx]，不得用 state.images[idx]', () => {
    const body = stripLineComments(extractFunction(readSource('ui_layout.js'), 'function updateThumbnailHighlight()'));
    assert.ok(/const entry = entries\[idx\]/.test(body), '必須取「這張縮圖對應的那張圖」');
    assert.ok(!/state\.images\[idx\]/.test(body), '篩選後 state.images[idx] 指到別張圖，會誤判勾號');
});

test('紅線：兩個 controller 的 ↑/↓ 必須走 navigateFiltered，不得 currentIndex ± 1', () => {
    for (const f of ['ui/annotation.js', 'ui/classification.js']) {
        const src = readSource(f);
        assert.ok(/navigateFiltered\(-1\)/.test(src) && /navigateFiltered\(1\)/.test(src),
            `${f} 應把位移量交給 navigateFiltered`);
        assert.ok(!/navigateToImage\(state\.annotationMode\.currentIndex - 1\)/.test(src),
            `${f} 不得以絕對索引 -1 導航（會跳到篩選外的照片）`);
        assert.ok(!/navigateToImage\(state\.annotationMode\.currentIndex \+ 1\)/.test(src),
            `${f} 不得以絕對索引 +1 導航`);
    }
});

test('契約：navigateFiltered 必須存在、邊界不做循環、且映射回原始索引', () => {
    const body = stripLineComments(extractFunction(readSource('ui_layout.js'), 'function navigateFiltered(delta)'));
    assert.ok(body, 'navigateFiltered 應存在');
    assert.ok(/if \(nextPos < 0 \|\| nextPos >= entries\.length\) return;/.test(body),
        '邊界應直接 return（不做循環）');
    assert.ok(/navigateToImage\(entries\[nextPos\]\.index\)/.test(body),
        '必須映射回 state.images 原始索引');
});

test('契約：navigateFiltered 必須注入兩個 controller', () => {
    const src = readSource('ui_layout.js');
    const injected = (src.match(/navigateFiltered: \(delta\) => navigateFiltered\(delta\)/g) || []).length;
    assert.ok(injected >= 2, `兩個 controller 都要注入，實際 ${injected} 處`);
});

// ---------------------------------------------------------------------------
// 2026-10-13：「未標註」哨兵的三處豁免（漏任何一處都會讓 chip 選了就消失或行為錯亂）
// ---------------------------------------------------------------------------

test('契約：哨兵必須豁免「篩選目標不存在則自動解除」', () => {
    const src = readSource('ui_layout.js');
    assert.ok(/statsFilterLabel !== UIComponents\.UNANNOTATED_FILTER[\s\S]{0,120}hasOwnProperty\.call\(counts, statsFilterLabel\)/.test(src),
        'renderStatsPanels 的自動解除必須豁免哨兵（label_counts 永遠查不到它）');
});

test('契約：哨兵必須豁免「拍到非篩選分類則解除」（新圖本來就沒標註，本來就可見）', () => {
    const src = readSource('ui_layout.js');
    assert.ok(/statsFilterLabel !== UIComponents\.UNANNOTATED_FILTER[\s\S]{0,80}statsFilterLabel !== newImage\.label/.test(src),
        '新增影像路徑必須豁免哨兵');
});

test('契約：statsFilteredEntries 必須在 label_map 查表之前處理哨兵', () => {
    const body = stripLineComments(extractFunction(readSource('ui_layout.js'), 'function statsFilteredEntries()'));
    assert.ok(body, '應能擷取函式本體');
    const idxSentinel = body.indexOf('UIComponents.UNANNOTATED_FILTER');
    const idxLabelMap = body.indexOf('const labelMap =');
    assert.ok(idxSentinel >= 0, '必須處理哨兵');
    assert.ok(idxLabelMap >= 0, '應有 label_map 查表分支');
    assert.ok(idxSentinel < idxLabelMap,
        '哨兵分支必須在 label_map 查表之前 —— 哨兵不是真實類別，查表會直接 return []');
    assert.ok(/anns\.length === 0/.test(body), '未標註判準＝完全沒有任何標註');
});

// ---------------------------------------------------------------------------
// 2026-10-14：P3 縮圖「同張二次點擊」必須把鍵盤焦點還給畫布
// ---------------------------------------------------------------------------
// 病根：縮圖 div 非可聚焦元素，點它會讓 activeElement 脫離 canvas／classify-container；
// 切到別張圖時 loadAnnotationImage／loadClassificationImage 會順手 focus，
// 唯獨同張二次點擊走 navigateToImage 的早退分支、焦點永遠回不來 ——
// 之後 ↑/↓ 不再進 keydown handler 而是捲動縮圖欄，直到點別張圖才恢復。
// 判準落在真不變式上（早退分支內必須呼叫 refocus；refocus 必須分模式 focus 對的目標），
// 而非「有沒有 focus() 字串」這類代理指標。

test('契約：navigateToImage 同張早退必須呼叫 refocusAnnotationKeyboard', () => {
    const body = stripLineComments(extractFunction(readSource('ui_layout.js'), 'function navigateToImage(newIndex)'));
    assert.ok(body, '應能擷取函式本體');
    assert.ok(/if \(newIndex === state\.annotationMode\.currentIndex\) \{[^}]*refocusAnnotationKeyboard\(\);[^}]*return;/.test(body),
        '同張二次點擊必須先 refocus 再 return，否則 ↑/↓ 只會捲動縮圖欄');
});

test('契約：refocusAnnotationKeyboard 必須分模式 focus 對的鍵盤目標', () => {
    const body = stripLineComments(extractFunction(readSource('ui_layout.js'), 'function refocusAnnotationKeyboard()'));
    assert.ok(body, 'refocus helper 應存在');
    assert.ok(/mode === 'classification'/.test(body), '必須分流分類模式');
    assert.ok(/#annotation-classify-container/.test(body), '分類模式應 focus classify-container');
    assert.ok(/canvas\.dataset-annotation-canvas/.test(body), 'bbox/line 模式應 focus 標註 canvas');
});
test('契約：印出篩選名稱必須走 statsFilterDisplayLabel，不得直接印哨兵值', () => {
    const src = readSource('ui_layout.js');
    assert.ok(/function statsFilterDisplayLabel\(\)/.test(src), 'helper 應存在');
    assert.ok(/\.replace\('%1', statsFilterDisplayLabel\(\)\)/.test(src),
        '空結果訊息必須印顯示名，否則會出現哨兵字串');
    assert.ok(!/\.replace\('%1', statsFilterLabel\)/.test(src),
        '不得直接印哨兵值');
});

// ---------------------------------------------------------------------------
// 2026-10-16：P3 切圖必須自動捲動縮圖條到可見區（backlog 結案：查證已修而 todo 未更新）
// ---------------------------------------------------------------------------
// backlog 原文：「P3 縮圖列大量影像（>200）下 navigateFiltered 未捲動到可見區」。
// 查證：navigateFiltered → navigateToImage → loadAnnotationImage／loadClassificationImage
// 兩條路徑結尾皆呼叫 updateThumbnailHighlight()，該函式尾端含
// scrollIntoView({block:'center', ...}) —— 自 bbox 面板重構（79a2d9c）起即存在，
// 比 P3 篩選（10-13）還早。故缺口從未存在，屬 todo 過時，非新 bug。
// 本守門釘住該鏈不斷：任一 load 路徑漏調 highlight、或 highlight 刪掉捲動，即報紅。
test('契約：兩條切圖路徑必須經 updateThumbnailHighlight 捲動縮圖條', () => {
    const layoutSrc = readSource('ui_layout.js');
    const hlBody = stripLineComments(extractFunction(layoutSrc, 'function updateThumbnailHighlight()'));
    assert.ok(hlBody, '應能擷取 updateThumbnailHighlight 本體');
    assert.ok(/scrollIntoView\(\{[^}]*block:\s*'center'/.test(hlBody),
        'highlight 尾端必須把當前縮圖捲到可見區，否則 >200 張時 ↑/↓ 切圖會迷路');
    for (const f of ['ui/annotation.js', 'ui/classification.js']) {
        const loader = f === 'ui/annotation.js' ? 'loadAnnotationImage' : 'loadClassificationImage';
        const body = stripLineComments(extractFunction(readSource(f), 'function ' + loader + '(index)'));
        assert.ok(body, `應能擷取 ${f} 的 ${loader} 本體`);
        assert.ok(/updateThumbnailHighlight\(\)/.test(body),
            `${loader} 切圖後必須呼叫 updateThumbnailHighlight（高亮＋捲動），否則縮圖條停在原地`);
    }
});

