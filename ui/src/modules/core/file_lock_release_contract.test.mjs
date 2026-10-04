/**
 * ui/modules/core/file_lock_release_contract.test.mjs
 * [2026-10-03] 多視窗檔案鎖釋放契約守門（掃描型）
 *
 * 【原始缺陷 —— 使用者實機回報】
 *   視窗1 開 A → 視窗1 開新檔 B → 新視窗開 A
 *   → 跳出「A 已被開啟並唯讀」
 *
 * 根因：`file_locks` 只在「關窗」與「回首頁」釋放，**開新檔從不釋放舊檔的鎖**。
 * 開 B 時只 `insert(locks[B])`，A 的鎖仍指向視窗1 —— 但視窗1 早已不持有 A。
 * 這是 stale lock（鎖洩漏）。連續開檔會無限累積鎖，直到關窗或重啟 App。
 * 該缺陷**早於 P2-1 拆檔**存在（Rust 端為 P2-5 純搬移，前端為 P2 原樣搬移）。
 *
 * 【為何是掃描型守門】
 * 真正的不變式是「**任何寫入 file_locks 的 command，都必須在寫入前釋放本視窗的舊鎖**」。
 * 用清單式只會漏掉未來新增的 command；本測試掃描整個 `src-tauri/src`，
 * 凡出現 `locks.insert(` 的 command 一律納入，毋須再改測試。
 *
 * 【為何是掃描 Rust 原始碼而非跑 Rust 測試】
 * Tauri command 依賴 `Window`／`AppHandle`，無法在 `cargo test` 中建構。
 * 本專案現有 Rust `#[test]` 僅 5 處（dataset.rs / raw_dump.rs），不足以涵蓋 command 層
 * —— 故沿用本專案既有慣例（process_spawn_contract / sidecar_module_split 等）
 * 以 Node 掃描原始碼做契約斷言。
 *
 * 【驗收標準：真實回歸會不會變紅】見檔末「變異測試」說明。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '..', '..', '..', '..');
const SRC = path.join(repoRoot, 'src-tauri', 'src');

/** 遞迴列出所有 .rs（必須遞迴：commands/ 之下還有 file/、mcu/ 子目錄）。 */
function rustFiles(dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...rustFiles(full));
        else if (e.name.endsWith('.rs')) out.push(full);
    }
    return out;
}

const files = rustFiles(SRC);

/**
 * 切出某個 `pub fn/async fn NAME(...)` 的函式本體。
 * 以 `fn NAME` 行為起點，直到下一個 `#[tauri::command]` 或行首 `}` 為止。
 */
function fnBody(src, name) {
    const lines = src.replace(/\r\n/g, '\n').split('\n');
    const start = lines.findIndex((l) => new RegExp(`\\bfn\\s+${name}\\s*\\(`).test(l));
    if (start < 0) return null;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        if (/^\s*#\[tauri::command\]/.test(lines[i]) || /^\}/.test(lines[i])) {
            end = i;
            break;
        }
    }
    return { startLine: start + 1, body: lines.slice(start, end).join('\n') };
}

/** 所有會寫入 file_locks 的 command（動態掃描，非清單）。 */
const lockWriters = [];
for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/pub\s+(?:async\s+)?fn\s+(\w+)\s*\(/g)) {
        const b = fnBody(src, m[1]);
        if (b && /locks\.insert\(/.test(b.body)) {
            lockWriters.push({ name: m[1], file: path.relative(repoRoot, f), ...b });
        }
    }
}

test('前置：確實掃到寫入 file_locks 的 command（掃描型守門不能掃到 0 個就變綠）', () => {
    const names = lockWriters.map((c) => c.name).sort();
    assert.ok(names.length >= 2,
        `應至少掃到 open_file 與 save_file，實得 ${names.length}：${names.join(', ')}`);
    for (const must of ['open_file', 'save_file', 'open_examples']) {
        assert.ok(names.includes(must), `未掃到 ${must} —— 掃描邏輯可能失效`);
    }
});

test('守門 1：寫入 file_locks 的 command 必須先釋放本視窗的舊鎖', () => {
    const bad = [];
    for (const c of lockWriters) {
        const release = c.body.indexOf('release_file_locks_for');
        const insert = c.body.indexOf('locks.insert(');
        if (release < 0) {
            bad.push(`${c.file}:${c.startLine} ${c.name} 從未釋放舊鎖（stale lock）`);
        } else if (release > insert) {
            bad.push(`${c.file}:${c.startLine} ${c.name} 在取得新鎖之後才釋放（順序錯誤）`);
        }
    }
    assert.deepEqual(bad, [], '以下 command 未正確釋放舊檔鎖：\n' + bad.join('\n'));
});

test('守門 2：釋放點必須在「使用者確定選檔」之後（不可無條件釋放）', () => {
    /*
     * ⚠️ 判準是「**判斷是否取消的那一行**」，不是「開啟對話框的那一行」。
     * 變異測試踩坑（2026-10-03）：初版用 blocking_pick_file 的位置當判準，
     * 結果把釋放移到「開啟對話框之後、判斷取消之前」竟未報紅 —— 但那段程式碼正是
     * `let file_path = ....blocking_pick_file();` 與 `if let Some(p) = file_path` 之間，
     * 使用者按取消時已經釋放了鎖。**判準寫錯會讓守門靜默失效。**
     */
    const bad = [];
    for (const c of lockWriters) {
        // 「確定選檔」的錨點：if let Some(p) = ...（開檔為 file_path、另存為 picked）
        const confirm = Math.max(
            ...['file_path', 'picked'].map((v) => c.body.search(new RegExp(`if let Some\\(p\\) = ${v}`))));
        if (confirm < 0 || confirm === -1) continue;   // 無選檔流程的命令不適用
        const release = c.body.indexOf('release_file_locks_for');
        if (release < 0 || release < confirm) {
            bad.push(`${c.file}:${c.startLine} ${c.name} 在確認選檔之前釋放（取消時會誤釋放）`);
        }
    }
    assert.deepEqual(bad, [], '以下 command 的釋放時機錯誤：\n' + bad.join('\n'));
});

test('守門 3：釋放邏輯只有一個實作（不得散落 retain）', () => {
    /*
     * 本專案踩坑紀錄：同一語意散落多處 → 日後只改到其中一處。
     *
     * ⚠️ 正則**不可寫死 `locks.retain(`**（2026-10-03 變異測試踩坑）：
     * 初版只抓 `locks.retain(`，於是「let mut _l = ...; _l.retain(...)」這種
     * 換了變數名的寫法完全抓不到 —— **守門靜默失效，卻看起來有在掃。**
     * 改為比對 `.retain(` 並排除 state.rs（唯一合法實作所在）。
     */
    const offenders = [];
    for (const f of files) {
        if (path.basename(f) === 'state.rs') continue;   // 唯一合法實作所在
        const src = fs.readFileSync(f, 'utf8');
        src.replace(/\r\n/g, '\n').split('\n').forEach((l, i) => {
            const code = l.replace(/^\s*\/\/.*$/, '').replace(/\/\/.*$/, '');
            if (/\.retain\(/.test(code)) {
                offenders.push(`${path.relative(repoRoot, f)}:${i + 1} ${l.trim()}`);
            }
        });
    }
    assert.deepEqual(offenders, [],
        'retain 散落多處，應統一走 state::release_file_locks_for：\n' + offenders.join('\n'));
});

test('守門 4：release_file_locks_for 只移除本視窗的鎖（不得清空全表）', () => {
    const st = fs.readFileSync(path.join(SRC, 'state.rs'), 'utf8');
    const fn = fnBody(st, 'release_file_locks_for');
    assert.ok(fn, 'state.rs 缺少 release_file_locks_for');
    assert.ok(/retain\(\|_, owner\| owner != label\)/.test(fn.body),
        '釋放條件必須是「owner 不是本視窗」；清空全表會讓其他視窗的鎖失效');
});

/*
 * 【變異測試記錄（2026-10-03）】
 * 五種真實回歸形狀皆已驗證會報紅，測試非假綠：
 *   1. 移除 open_file 的 release_file_locks_for       → 守門 1 報紅
 *   2. 把釋放移到 locks.insert 之後                   → 守門 1 報紅（順序錯誤）
 *   3. 把釋放移到 blocking_pick_file 之前             → 守門 2 報紅
 *   4. 在 dataset.rs 加第二處 locks.retain             → 守門 3 報紅
 *   5. 把 retain 條件改成清空全表（owner != ""）       → 守門 4 報紅
 */
