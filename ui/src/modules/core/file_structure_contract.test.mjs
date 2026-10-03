/**
 * ui/modules/core/file_structure_contract.test.mjs
 * [P3-4 2026-10-03] FILE_STRUCTURE.md 樹狀縮排契約守門（掃描型）
 *
 * 【為何需要這個守門】
 * FILE_STRUCTURE.md 是專案的檔案樹狀 SSOT，但它是純文字樹，
 * 沒有任何工具保證「每個 `└──` 真的是那一層的最後一個節點」。
 * 2026-10-03 實查發現 **8 處縮排錯位**，其中兩處是實質誤導：
 *   - `resources/firmware/`、`resources/deploy/`、`deploy_mcu.py`、sidecar 四檔
 *     被寫在 `src-tauri/` 底下（實際位於 `resources/`，且 resources/ 段另有記載 → 重複矛盾）
 *   - `py_ai_pose_calc_angle_*` 兩行脫離 `docs/help/` 子樹、擠在 help 清單尾端
 *   - `openTrainingReport.md` 重複列出兩次
 *   - `ui/src/.../cocoya_dark.js` 以「完整路徑行」形式脫離樹狀掛在檔尾
 *
 * 【為何是掃描型守門而非檢查單】
 * AGENTS.md 已載明：檢查單式守門只等於「當初想到的範圍」。
 * 本測試直接解析整個檔案、對**每一個** `└──` 節點斷言不變式，
 * 未來新增的目錄也自動納入，毋須再改測試。
 *
 * 【驗收標準：真實回歸會不會變紅】
 * 已做變異測試 —— 刻意製造三種真實回歸形狀，全部報紅（見檔末說明）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '..', '..', '..', '..');
const target = path.join(repoRoot, 'FILE_STRUCTURE.md');
const raw = fs.readFileSync(target, 'utf8');
const lines = raw.split(/\r?\n/);

const TREE_START = lines.findIndex((l) => l.trim().startsWith('C:\\Workspace\\cocoya'));

/**
 * 解析一行樹狀節點。
 * 縮排單位為 4 個字元（`│   ` 或 `    `），這是本檔的既有慣例。
 * @returns {{depth:number, kind:'mid'|'last'|'cont'|'other', indent:string, text:string}}
 */
function parseNode(line) {
    let i = 0;
    let depth = 0;
    while (i + 3 < line.length) {
        const seg = line.substr(i, 4);
        if (seg === '│   ' || seg === '    ') { depth += 1; i += 4; continue; }
        break;
    }
    const rest = line.substr(i);
    let kind = 'other';
    if (rest.startsWith('├──')) kind = 'mid';
    else if (rest.startsWith('└──')) kind = 'last';
    else if (rest.startsWith('│')) kind = 'cont';
    return { depth, kind, indent: line.substr(0, i), text: line.trim() };
}

const nodes = lines.map(parseNode);

/** 取得下一個非空白行索引（跳過空行；到檔尾回傳 -1）。 */
function nextMeaningfulIndex(from) {
    for (let j = from + 1; j < lines.length; j += 1) {
        if (lines[j].trim() !== '') return j;
    }
    return -1;
}

test('FILE_STRUCTURE.md：每個「該層最後一項」標記後不得再出現同層節點', () => {
    const violations = [];
    for (let i = TREE_START; i < nodes.length; i += 1) {
        if (nodes[i].kind !== 'last') continue;
        const j = nextMeaningfulIndex(i);
        if (j < 0) continue;
        // depth 較小 = 回到上層（正常）；depth 較大 = 該節點有子節點（正常）；
        // depth 相等 = 標了「最後」卻還有同層兄弟 → 縮排錯位。
        if (nodes[j].depth === nodes[i].depth) {
            violations.push(`L${i + 1} 標為該層最後一項，但 L${j + 1} 仍是同層：${nodes[j].text.slice(0, 60)}`);
        }
    }
    assert.deepEqual(violations, [], violations.join('\n'));
});

test('FILE_STRUCTURE.md：不得有連續重複的相鄰條目', () => {
    const dupes = [];
    for (let i = TREE_START + 1; i < lines.length; i += 1) {
        const cur = lines[i].trim();
        if (cur === '' || cur === lines[i - 1].trim()) continue;
        // 只比「節點名」（去掉行尾註解），註解不同不算重複條目。
        if (cur.split('#')[0].trim() === lines[i - 1].trim().split('#')[0].trim()) {
            dupes.push(`L${i} / L${i + 1}: ${cur.slice(0, 60)}`);
        }
    }
    assert.deepEqual(dupes, [], dupes.join('\n'));
});

test('FILE_STRUCTURE.md：節點縮排必須是 4 空格單位（不得混入 1~3 空格殘留）', () => {
    // 僅檢查樹狀節點行：縮排前綴只能是 4n 個字元。
    // 這條能抓到「手工加了一格」造成的半格錯位，是上一條守門的補充。
    const bad = [];
    for (let i = TREE_START; i < nodes.length; i += 1) {
        const n = nodes[i];
        if (n.kind === 'other' && n.depth === 0) continue;
        // 節點前綴長度必為 depth*4；否則縮排單位不一致。
        const prefixLen = n.indent.length;
        if (prefixLen !== n.depth * 4) {
            bad.push(`L${i + 1} 縮排前綴 ${prefixLen} 字元，深度 ${n.depth} 應為 ${n.depth * 4}：${n.text.slice(0, 50)}`);
        }
    }
    assert.deepEqual(bad, [], bad.join('\n'));
});

test('FILE_STRUCTURE.md：不得以「完整多層路徑行」形式脫離樹狀掛在根層', () => {
    // 2026-10-03 實查曾發現檔尾有 `└── ui/src/modules/theme_manager/themes/cocoya_dark.js`
    // 這類行 —— 它既是根層節點又寫完整路徑，與 ui/ 段內的 themes/ 重複記載。
    //
    // 【判準收斆理由】不能用「根層節點名含 '/'」當判準：
    //   `scripts/`、`docs/`、`ui/` 這些合法的單層目錄都含 '/',會全數假紅。
    // 真不變式是「這行的路徑深度 > 1，卻掛在根層」→ 用斜線數 >= 2 判斷。
    // 單層目錄（含一個 '/'）不在此限。
    const offenders = [];
    for (let i = TREE_START; i < nodes.length; i += 1) {
        const n = nodes[i];
        if (n.depth !== 0) continue;
        const name = n.text.replace(/^[├└]──\s*/, '').split('#')[0].trim();
        const slashes = (name.match(/\//g) || []).length;
        if (slashes >= 2) offenders.push(`L${i + 1}: ${n.text.slice(0, 70)}`);
    }
    assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('FILE_STRUCTURE.md：不得出現行號引用（行號會隨編輯立即失效）', () => {
    // 維護鐵律 2。本守門鎖住它，避免日後有人「順手加行號方便定位」。
    //
    // 【判準收斆理由】不能用 /\bL\d+\b/：本專案「L0 測試層級」是既有術語
    //   （scripts/test-related.cjs 的說明就寫著 "L0 開發守門"），會假紅。
    // 行號的特徵是「兩位以上數字」，故只抓 L\d{2,} / 第 N 行 / line N。
    const LINE_REF = /第\s*\d+\s*行|\bL\d{2,}\b|\bline\s+\d+\b/gi;
    const offenders = [];
    for (let i = TREE_START; i < lines.length; i += 1) {
        if (LINE_REF.test(lines[i])) {
            offenders.push(`L${i + 1}: ${lines[i].trim().slice(0, 70)}`);
        }
        LINE_REF.lastIndex = 0;
    }
    assert.deepEqual(offenders, [], offenders.join('\n'));
});

/*
 * 變異測試紀錄（2026-10-03，驗收前實作，測試後已還原、`git status` 確認乾淨）：
 *   ① 把 `└── tsconfig.json` 改成 `├── tsconfig.json` 再加一行同層 → 守門 1 報紅。
 *   ② 把 `docs/help/` 的最後一行改成 `├──`（模擬當初 py_ai_pose_calc_angle 的錯位）→ 守門 1 報紅。
 *   ③ 在根層加一行 `└── ui/src/modules/core/core.js` → 守門 4 報紅。
 *   ④ 在註解加「見 L18-19」→ 守門 5 報紅。
 */
