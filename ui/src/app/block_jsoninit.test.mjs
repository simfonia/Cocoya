/**
 * block_jsoninit.test.mjs — 全模組 jsonInit 佔位符契約測試（2026-09-22 除錯蒸餾）
 *
 * 契約（Blockly 12.3.1 validateTokens）：messageN 內的 %k 佔位符必須涵蓋 argsN
 * 的每一個 arg（k = 1..args.length）。缺任一 → init() 在附加任何 input 之前 throw
 * 「Message does not reference all N arg(s)」→ 該型別所有積木變成「半成品空積木」，
 * 之後產生器 valueToCode() 就爆 `Input "X" doesn't exist on "Y"`。
 *
 * 事故（2026-09-22）：ai_inference i18n 的 AI_GET_LINE_END 缺 %1（args0 有 RESULT＋END
 * 兩個 arg），py_ai_get_line_end 一律建成空積木 → 啟動還原即爆 RESULT。
 *
 * 做法：靜態抽取所有 *_blocks.js 的 this.jsonInit({...}) 字面值，以 stub Blockly
 * （含主 i18n + 模組 i18n 的 Msg）求值後逐 messageN 驗證（不執行 blocks 檔本身，
 * 避免 Blockly 其他 API stub 負擔）。
 *
 * 執行（cwd = ui/）：node --test "src/app/*.test.mjs"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..'); // ui/src

function loadMsg(file) {
  const src = fs.readFileSync(file, 'utf8');
  const Msg = {};
  new Function('Blockly', src)({ Msg });
  return Msg;
}

function extractJsonInitObjects(src) {
  const out = [];
  const re = /this\.jsonInit\(/g;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src[i] !== '{') continue;
    const start = i;
    let depth = 0, inStr = null, ok = false;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (inStr) { if (ch === '\\') { i++; continue; } if (ch === inStr) inStr = null; continue; }
      if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue; }
      if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { ok = true; break; } }
    }
    if (ok) out.push(src.slice(start, i + 1));
  }
  return out;
}

function findBlocksFiles(dir) {
  let out = [];
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) out = out.concat(findBlocksFiles(p));
    else if (f.name.endsWith('_blocks.js')) out.push(p);
  }
  return out;
}

function findI18nDir(fileDir) {
  let d = fileDir;
  while (d.startsWith(ROOT)) {
    if (fs.existsSync(path.join(d, 'i18n'))) return path.join(d, 'i18n');
    d = path.dirname(d);
  }
  return null;
}

test('所有模組積木的 jsonInit：messageN 佔位符必須涵蓋 argsN 每一個 arg（zh-hant + en）', () => {
  const rootMsgs = {
    'zh-hant': loadMsg(path.join(ROOT, 'zh-hant.js')),
    'en': loadMsg(path.join(ROOT, 'en.js'))
  };
  const problems = [];
  let totalChecked = 0;
  for (const file of findBlocksFiles(path.join(ROOT, 'modules'))) {
    for (const lang of ['zh-hant', 'en']) {
      const msgs = Object.assign({}, rootMsgs[lang]);
      const i18nDir = findI18nDir(file);
      const i18nFile = i18nDir ? path.join(i18nDir, lang + '.js') : null;
      if (i18nFile && fs.existsSync(i18nFile)) Object.assign(msgs, loadMsg(i18nFile));
      const B = { Msg: msgs };
      const src = fs.readFileSync(file, 'utf8');
      for (const text of extractJsonInitObjects(src)) {
        let json;
        try { json = new Function('Blockly', 'return (' + text + ')')(B); }
        catch (e) { continue; } // 含執行期運算的組態（如 Msg 以外的程式邏輯）不在靜態驗證範圍
        if (!json || typeof json !== 'object') continue;
        totalChecked++;
        for (let c = 0; json['message' + c] !== undefined; c++) {
          // 展開 Blockly 的 %{BKY_KEY} 轉引（實際含 %N 的文案在 Msg，可能再轉引一層）
          let msg = String(json['message' + c]);
          for (let depth = 0; depth < 3; depth++) {
            if (!/%\{BKY_[A-Z_0-9]+\}/.test(msg)) break;
            msg = msg.replace(/%\{BKY_([A-Z_0-9]+)\}/g, (all, key) =>
              msgs[key] !== undefined ? String(msgs[key]) : all);
          }
          const args = json['args' + c] || [];
          const idxs = new Set((msg.match(/%\d/g) || []).map((t) => +t.slice(1)));
          for (let k = 1; k <= args.length; k++) {
            if (!idxs.has(k)) {
              problems.push(path.relative(ROOT, file) + ' lang=' + lang +
                ' message' + c + ' 缺 %' + k + ' (args=' + args.length + ') msg="' + msg.slice(0, 50) + '"');
            }
          }
        }
      }
    }
  }
  assert.ok(totalChecked > 100, '掃描到的 jsonInit 組態過少(' + totalChecked + ')，抽取邏輯可能失效');
  assert.deepEqual(problems, []);
});
