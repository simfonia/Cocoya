#!/usr/bin/env node
/**
 * scripts/verify-tauri-split.cjs — P2-1 tauri.js 拆檔完整性比對
 *
 * 【為何需要這個工具】
 * P2-5（Rust 拆檔）的教訓：**編譯通過 ≠ 搬對了**。
 * 當時 `#[tauri::command]` 留在段落尾端，編譯完全通過但 command 未註冊，
 * 靠逐字元比對才發現。前端同理：少搬一個 case、拆散一組 fallthrough，
 * 都不會報錯，只會靜默失效。
 *
 * 【比對基準】以 `git show HEAD:ui/src/bridge/tauri.js`（拆分前）為 ground truth，
 * 逐項比對拆分後「switch 殘留 case」＋「handler 表鍵」之聯集。
 *
 * 【用法】node scripts/verify-tauri-split.cjs [ref]
 */
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const TAURI = 'ui/src/bridge/tauri.js';
const HANDLER_DIR = path.join(repoRoot, 'ui/src/bridge/tauri');
const BASE_REF = process.argv[2] || 'HEAD';

const readRef = (ref) => execSync(`git show ${ref}:${TAURI}`, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const readNow = () => fs.readFileSync(path.join(repoRoot, TAURI), 'utf8');

/**
 * switch 內的 case 名。
 *
 * ⚠️ 必須涵蓋**兩種**寫法（2026-10-03 實測教訓）：
 *   case 'foo':            ← 一般式
 *   case 'toggleSerialMonitor': {   ← 區塊式（宣告 const/let 需要自己的作用域）
 * 初版正則只抓第一種，導致基準被低估為 58（真實 61）→ 3 個區塊式 case
 * 完全沒被比對覆蓋，等於守門有洞。
 */
function switchCases(src) {
    return [...src.matchAll(/^\s{16}case '([^']+)':/gm)].map((m) => m[1]);
}
/** 所有 tauriInvoke('xxx') 的命令名。 */
function invokes(src) {
    return [...src.matchAll(/tauriInvoke\(\s*'([^']+)'/g)].map((m) => m[1]);
}
/** this.<member>( 的成員名。 */
function thisRefs(src) {
    return [...src.matchAll(/this\.(_[A-Za-z0-9_]+|tauri[A-Za-z0-9_]*)\s*\(/g)].map((m) => m[1]);
}

/** 解析 handler 表的鍵：跟著 import * as X from './X.js' 找出各群組的**匯出名**。 */
function handlerKeys() {
    const registry = path.join(HANDLER_DIR, 'sendHandlers.js');
    const keys = new Set();
    if (!fs.existsSync(registry)) return [];
    const src = fs.readFileSync(registry, 'utf8');
    for (const g of src.matchAll(/import \* as (\w+) from '\.\/(\w+)\.js';/g)) {
        const f = path.join(HANDLER_DIR, g[2] + '.js');
        if (!fs.existsSync(f)) continue;
        const groupSrc = fs.readFileSync(f, 'utf8');
        // 形式一：export function foo / export async function foo
        for (const e of groupSrc.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) {
            keys.add(e[1]);
        }
        // 形式二：export { impl as bar }（fallthrough 組用同一實作掛多個 command）
        for (const e of groupSrc.matchAll(/export\s*\{[^}]*\bas\s+(\w+)\s*\}/g)) {
            keys.add(e[1]);
        }
    }
    return [...keys].sort();
}

/** handler 側（ui/src/bridge/tauri/*.js）的 invoke 與 this.* 統計。 */
function handlerSide() {
    let inv = [], ref = [];
    if (!fs.existsSync(HANDLER_DIR)) return { inv, ref };
    for (const f of fs.readdirSync(HANDLER_DIR)) {
        if (!f.endsWith('.js')) continue;
        const src = fs.readFileSync(path.join(HANDLER_DIR, f), 'utf8');
        inv = inv.concat(invokes(src));
        ref = ref.concat(thisRefs(src));
    }
    return { inv, ref };
}

const before = readRef(BASE_REF);
const after = readNow();
const handlers = handlerKeys();
const side = handlerSide();

const beforeCases = switchCases(before).sort();
const afterCases = switchCases(after).sort();
const union = [...new Set([...afterCases, ...handlers])].sort();
const missing = beforeCases.filter((c) => !union.includes(c));
const extra = union.filter((c) => !beforeCases.includes(c));

console.log(`基準 ref：${BASE_REF}`);
console.log(`拆分前 case：${beforeCases.length}　拆分後 switch 殘留：${afterCases.length}　handler 表：${handlers.length}　聯集：${union.length}\n`);

let failed = false;

// ── 1. command 集合完全一致 ──
if (missing.length || extra.length) {
    failed = true;
    console.error('✖ 檢查 1 失敗：command 集合不一致');
    if (missing.length) console.error(`  遺失：${missing.join(', ')}`);
    if (extra.length) console.error(`  多出：${extra.join(', ')}`);
} else {
    console.log(`✔ 檢查 1：command 集合完全一致（${union.length} 個）`);
}

// ── 2. tauriInvoke 呼叫字串集 ──
const beforeInv = invokes(before).sort();
const afterInv = [...invokes(after), ...side.inv].sort();
if (beforeInv.length !== afterInv.length || beforeInv.some((c) => !afterInv.includes(c))) {
    failed = true;
    console.error(`✖ 檢查 2 失敗：tauriInvoke 呼叫集不一致（基準 ${beforeInv.length} → 拆分後 ${afterInv.length}）`);
    const cnt = {};
    beforeInv.forEach((c) => { cnt[c] = (cnt[c] || 0) + 1; });
    afterInv.forEach((c) => { cnt[c] = (cnt[c] || 0) - 1; });
    const diff = Object.entries(cnt).filter(([, v]) => v !== 0)
        .map(([k, v]) => `${k}(${v > 0 ? '少' + v : '多' + -v})`);
    if (diff.length) console.error(`  差異：${diff.join(', ')}`);
} else {
    console.log(`✔ 檢查 2：tauriInvoke 呼叫集一致（${beforeInv.length} 處）`);
}

// ── 3. fallthrough 組成員齊全 ──
const FALLTHROUGH_GROUPS = [
    ['refreshSerialPorts', 'getSerialPorts'],
    ['saveFile', 'saveFileAs'],
    ['alert', 'confirm', 'prompt'],
    ['newFile', 'createWindow']
];
const all = new Set([...afterCases, ...handlers]);
const ftBad = FALLTHROUGH_GROUPS.flatMap((g) => g.filter((m) => !all.has(m)).map((m) => `${m}（${g.join('/')} 組不見）`));
if (ftBad.length) {
    failed = true;
    console.error(`✖ 檢查 3 失敗：fallthrough 組成員缺失 —— ${ftBad.join(', ')}`);
} else {
    console.log(`✔ 檢查 3：${FALLTHROUGH_GROUPS.length} 組 fallthrough 成員齊全`);
}

// ── 4. this.* 引用次數 ──
const beforeRef = thisRefs(before);
const afterRef = [...thisRefs(after), ...side.ref];
if (beforeRef.length !== afterRef.length) {
    failed = true;
    console.error(`✖ 檢查 4 失敗：this.* 引用次數不一致（基準 ${beforeRef.length} → 拆分後 ${afterRef.length}）`);
    const cnt = {};
    beforeRef.forEach((x) => { cnt[x] = (cnt[x] || 0) + 1; });
    afterRef.forEach((x) => { cnt[x] = (cnt[x] || 0) - 1; });
    const diff = Object.entries(cnt).filter(([, v]) => v !== 0)
        .map(([k, v]) => `${k}(${v > 0 ? '少' + v : '多' + -v})`);
    if (diff.length) console.error(`  差異：${diff.join(', ')}`);
} else {
    console.log(`✔ 檢查 4：this.* 引用次數一致（${beforeRef.length} 處）`);
}

console.log('');
if (failed) {
    console.error('=== 完整性比對失敗 ===');
    process.exit(1);
}
console.log('=== 完整性比對全部通過 ===');
