/**
 * invoke_params_contract.test.mjs — Rust command 參數 ↔ 前端 invoke 契約守門
 *
 * 【為什麼需要這個（取代 tauri-codegen）】
 * tauri-codegen 依賴「單行簽名」正則解析，但本專案 20 個 command 中有 **10 個是跨行簽名**
 * （rustfmt 換行，見 start_sidecar / sidecar_send / export_dataset 等），
 * 且參數含 `State<'_, T>` 生命週期與 `Window` / `AppHandle`（Tauri 自動注入）。
 * → tauri-codegen 的前提在此專案直接失效，故改寫能處理跨行 + 自動注入排除的守門。
 *
 * 【解決的真實問題】
 * Rust `#[tauri::command]` 與前端 `tauriInvoke('cmd', {...})` 的參數名靠人工同步。
 * 不同步時 Tauri 在**執行期**拋 `invalid args '<name>' for command '<cmd>'`（AGENTS.md 已蒸餾此坑）。
 * 本守門把該問題提前到**測試期**，且不需改動任何 Rust/TS 公開 API。
 *
 * 【判準：真正的契約，而非代理指標】
 * 只比對「前端 invoke 實際傳的 key」vs「Rust 簽名實際宣告的參數名」，
 * 不比對文件、不比對數量 —— 這是 Tauri 在執行期真正強制的不變式。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// 檔案位於 ui/src/bridge/ → 往上三層才是專案根
const ROOT = path.resolve(import.meta.dirname, '../../..');
const BRIDGE_DIR = path.join(ROOT, 'ui/src/bridge');

/** Tauri 自動注入的參數：前端不需也不應傳。 */
const AUTO_INJECTED = new Set([
  'window', 'app', 'handle', 'state', 'webview',
  'WebviewWindow', 'AppHandle', 'Window', 'State', 'Manager'
]);

/**
 * ⚠️ 關鍵：Tauri 自動做 snake_case ↔ camelCase 轉換。
 *   Rust `python_path` ←→ JS `pythonPath`
 *   Rust `should_clear` ←→ JS `shouldClear`
 *   Rust `old_label`   ←→ JS `oldLabel`
 * 因此守門不可直接比字串，必須比「正規化後」的名稱（見 snakeToCamel / normalizeKey）。
 * 【AGENTS.md 蒸餾事實】此轉換已實際用於 reset_firmware / erase_filesystem 等 command。
 */
function snakeToCamel(s) {
  return s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/** 產生比對用的正規化鍵集合：snake 與 camel 兩種形式都接受。 */
function acceptableKeys(params) {
  const set = new Set();
  for (const p of params) {
    set.add(p);
    set.add(snakeToCamel(p));
  }
  return set;
}

/** 括號配對：從 src[open] 起找到對應的閉合括號索引。 */
function matchBracket(src, open, openCh, closeCh) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === openCh) depth++;
    else if (src[i] === closeCh) { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/**
 * 解析 Rust command 簽名 → Map<commandName, {params: string[], file}>
 * 處理跨行簽名：從 `pub fn name(` 起做括號配對，跨行收集參數。
 */
function parseRustCommands() {
  // command 定義分散於 src-tauri/src 各層（commands/ 及其子目錄、commands/../ 之外的模組），
  // 故遞迴掃描整個 src/ —— 只掃 commands/ 頂層會漏掉 backup.rs / file.rs 等，
  // 造成「Rust 無同名 command」假陽性。
  const SRC_DIR = path.join(ROOT, 'src-tauri/src');
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.rs')) files.push(p);
    }
  };
  walk(SRC_DIR);

  const map = new Map();
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    // 允許 #[tauri::command] 與 pub fn 之間有換行/註解/其他屬性（實測間距可達 200+ 字元）
    const re = /#\[tauri::command\][\s\S]{0,400}?pub\s+(?:async\s+)?fn\s+(\w+)\s*\(/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const open = re.lastIndex - 1;
      const end = matchBracket(src, open, '(', ')');
      if (end < 0) continue;
      const argText = src.slice(open + 1, end);
      const params = [];
      for (const raw of argText.split(',')) {
        const p = raw.trim();
        if (!p) continue;
        const mm = p.match(/^(\w+)\s*:\s*/);
        if (mm) params.push(mm[1]);
      }
      map.set(m[1], { params, file: rel });
      re.lastIndex = end;
    }
  }
  return map;
}
/** 收集前端 tauriInvoke('cmd', { key: ... }) 的實際傳遞 key（僅物件頂層）。 */
function parseFrontendInvokes() {
  const out = new Map(); // cmd -> Set<key>
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) files.push(p);
    }
  };
  walk(BRIDGE_DIR);

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const re = /tauriInvoke\(\s*'(\w+)'\s*,\s*\{/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const open = m.index + m[0].length - 1;
      const end = matchBracket(src, open, '{', '}');
      if (end < 0) continue;
      const objText = src.slice(open + 1, end);
      const keys = new Set();
      let depth = 0;
      let token = '';
      const flush = () => {
        const km = token.trim().match(/^([A-Za-z_$][\w$]*)\s*[:,]/);
        if (km) keys.add(km[1]);
        token = '';
      };
      for (const ch of objText) {
        if (ch === '{' || ch === '(' || ch === '[') { depth++; continue; }
        if (ch === '}' || ch === ')' || ch === ']') { depth--; if (depth === 0) { flush(); break; } }
        if (depth === 0 && ch === ',') { flush(); continue; }
        if (depth === 0) token += ch;
      }
      if (!out.has(m[1])) out.set(m[1], new Set());
      for (const k of keys) out.get(m[1]).add(k);
      re.lastIndex = end;
    }
  }
  return out;
}

const rustCommands = parseRustCommands();
test('Rust 解析器自身有效：能處理跨行簽名（自檢，防假綠燈）', () => {
  assert.ok(rustCommands.size >= 20,
    `應至少解析出 20 個 command，實得 ${rustCommands.size}`);
  const ss = rustCommands.get('start_sidecar');
  assert.ok(ss, 'start_sidecar（跨行簽名）應被解析到');
  assert.ok(ss.params.includes('python_path'),
    `start_sidecar 應含 python_path，實得 ${JSON.stringify(ss.params)}`);
  const sd = rustCommands.get('sidecar_send');
  assert.ok(sd.params.some(p => AUTO_INJECTED.has(p)),
    'sidecar_send 應含 window/state 等自動注入參數');
});

test('前端解析器自身有效：抓得到傳遞 key（自檢，防假綠燈）', () => {
  assert.ok(frontendInvokes.size >= 20,
    `應至少解析出 20 個 invoke 指令，實得 ${frontendInvokes.size}`);
});

test('核心契約：前端 invoke 的參數名都存在於 Rust 簽名', () => {
  const errors = [];
  for (const [cmd, keys] of frontendInvokes) {
    const rc = rustCommands.get(cmd);
    if (!rc) {
      errors.push(`前端 invoke '${cmd}' 但 Rust 無同名 command`);
      continue;
    }
    for (const k of keys) {
      const ok = acceptableKeys(rc.params);
      if (!ok.has(k)) {
        errors.push(`'${cmd}' 前端傳 '${k}'，Rust 簽名只有 [${rc.params.join(', ')}]（${rc.file}）`);
      }
    }
  }
  assert.equal(errors.length, 0,
    '\n前端/Rust 參數名不同步（執行期會拋 invalid args）：\n' +
    errors.map(e => '  - ' + e).join('\n'));
});

test('前端不應傳遞 Tauri 自動注入的參數', () => {
  const errors = [];
  for (const [cmd, keys] of frontendInvokes) {
    for (const k of keys) {
      if (AUTO_INJECTED.has(k)) errors.push(`'${cmd}' 前端傳了自動注入參數 '${k}'`);
    }
  }
  assert.equal(errors.length, 0,
    '\n前端不應傳遞自動注入參數：\n' + errors.map(e => '  - ' + e).join('\n'));
});

test('比對量下限（防止解析器退化成空集合假綠燈）', () => {
  let compared = 0;
  for (const [cmd, keys] of frontendInvokes) {
    if (rustCommands.has(cmd)) compared += keys.size;
  }
  // 實測基數（2026-10-05）：bridge 層 40 處帶參數 tauriInvoke，展開後比對 38 組 key。
  // 下限取 30（留緩衝但仍足以抓解析器失效 —— 若解析器壞掉會掉到個位數）。
  assert.ok(compared >= 30,
    `實際比對的參數組數應 >= 30（實測基數 38），實得 ${compared}；過低代表解析器可能失效`);
});

test('snake↔camel 轉換規則確實被使用（非空轉換）', () => {
  // 自檢：確認 snakeToCamel 真的產生了不同字串，且 Rust 端確有 snake_case 參數。
  assert.equal(snakeToCamel('python_path'), 'pythonPath');
  assert.equal(snakeToCamel('should_clear'), 'shouldClear');
  const hasSnake = [...rustCommands.values()].some(r => r.params.some(p => p.includes('_')));
  assert.ok(hasSnake, 'Rust 端應存在 snake_case 參數，否則轉換規則無從驗證');
});
const frontendInvokes = parseFrontendInvokes();