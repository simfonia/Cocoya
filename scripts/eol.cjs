#!/usr/bin/env node
/**
 * scripts/eol.cjs — 行尾（CRLF/LF）檢查與修復工具
 *
 * 為什麼需要（2026-10-03）：
 *   .gitattributes 的 `* text=auto eol=crlf` 只在「經過 git 的路徑」生效
 *   （checkout / add / diff）。編輯器、Python 腳本、PowerShell 直接寫檔時
 *   不經過 git，工作區就會變成 LF —— 而 git 會把「工作區 LF + 轉換後 LF」
 *   視為無差異，**問題不會自己浮現**，會靜態累積。
 *
 *   實測當時 646 個文字檔中有 126 個工作區是 LF，含 tauri.js、
 *   dataset_sidecar.py、package.json 等核心檔案。
 *
 *   本工具提供三層防護：
 *     node scripts/eol.cjs          # 檢查（不符則 exit 1）
 *     node scripts/eol.cjs --fix    # 修復（就地轉為 CRLF）
 *     node scripts/eol.cjs --list   # 只列出檔案（診斷用）
 *
 * 分工：.editorconfig → 預防；.gitattributes → 保險；本工具 → 驗證與補救。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// 掃描範圍：只掃「本專案維護的原始碼/文件」
// ⚠️ 必須包含 SCAN_ROOT_FILES 之外的點開頭檔案：`ui/.eslintrc.json` 的 basename
//    是「.eslintrc.json」，若只靠 SCAN_ROOT_FILES 列举會漏掉（踩坑紀錄）。
const SCAN_DIRS = [
  'ui/src', 'ui/test', 'src', 'src-tauri/src', 'resources', 'docs',
  'scripts', 'examples', 'test', 'log', '.vscode',
  'ui',                        // 掃 ui/ 根（ui/.eslintrc.json 等點開頭設定檔）
  'src-tauri',                 // 掃 src-tauri/ 根（src-tauri/Cargo.toml）
];
const SCAN_ROOT_FILES = [
  'package.json', 'tsconfig.json', 'package-lock.json',
  '.clinerules.md', '.antigravity.md',
  'FILE_STRUCTURE.md', 'AGENTS.md', 'README.md',
  '.gitignore', '.gitattributes', '.editorconfig', '.vscodeignore',
];

// 完全跳過（自動產物 / vendored / 建置輸出）
const SKIP_DIR_PARTS = new Set([
  'node_modules', 'target', 'dist', 'out', 'build', '__pycache__',
  '.git', 'gen',              // gen：Tauri 自動產生的 schema
  'backup',                   // 歷史備份，依專案規範不得改寫
   // coverage：產物（HTML / per-file JSON）可重新生成。baseline.json 已进版控，
   //   但其行尾由 scripts/coverage.cjs 自身保è­（它已改為寫入 CRLF）
]);

// 明確以 -text 或 eol=lf 標示、刻意不強制 CRLF 的檔案（與 .gitattributes 對應）
// Cargo.toml：cargo / tauri build 每次以 LF 重寫（2026-10-06 使用者確認），
//   統一 LF 與工具行為一致；強制 CRLF 會讓檢查在每次 build 後永遠紅。
//   ⚠️ verifyAgainstGit 亦以本清單排除，避免交叉比對把它當漏掃。
const SKIP_FILES = new Set(['highlight.min.js', 'python.min.js', 'Cargo.toml']);

const TEXT_EXT = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.md', '.xml', '.html',
  '.css', '.py', '.rs', '.toml', '.yml', '.yaml', '.txt',
  '.lock',                       // Cargo.lock
  '.svg',                        // 素材（純文字 XML）
  '.gitignore', '.gitattributes', '.editorconfig', '.vscodeignore',
]);

/** 判斷某路徑是否應跳過 */
function shouldSkip(absPath) {
  const parts = path.relative(ROOT, absPath).split(path.sep);
  for (const p of parts.slice(0, -1)) {
    if (SKIP_DIR_PARTS.has(p)) return true;
  }
  return SKIP_FILES.has(parts[parts.length - 1]);
}

/**
 * 無副檔名但為文字腳本的檔案（依內容判斷）。
 * 實例：resources/firmware/.../esp32s3_flash（esptool 燒錄 shell 腳本，無副檔名）。
 * 教訓：交叉比對機制抓到的漏網檔，不是誤報。
 */
const SCRIPT_BASENAMES = new Set([
  'esp32s3_flash', 'flash', 'build', 'install',
]);

/**
 * 判斷是否為文字檔。
 * ⚠️ 不可用「basename 以 . 開頭且無副檔名」來判斷 —— `.eslintrc.json` 有副檔名，
 *    basename 以 . 開頭但副檔名是 .json，必須依副檔名判定（踩坑紀錄）。
 */
function isTextFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext) return TEXT_EXT.has(ext);
  const base = path.basename(file).toLowerCase();
  if (SCRIPT_BASENAMES.has(base)) return true;
  // 無副檔名者：點開頭設定檔（.gitignore 等已含在 TEXT_EXT）或 package.json
  return file.startsWith('.') || file === 'package.json';
}
/**
 * 分析檔案行尾。
 * @returns {{style:'crlf'|'lf'|'mixed'|'empty', crlf:number, loneLf:number, size:number}}
 */
function analyze(filePath) {
  const buf = fs.readFileSync(filePath);
  const size = buf.length;
  if (size === 0) return { style: 'empty', crlf: 0, loneLf: 0, size };

  // 逐位元組掃描：\r(0x0D) 後接 \n(0x0A) 為 CRLF；單獨 \n 為 lone LF。
  // 以位元組判斷而非字串 regex，避免 utf-8 多位元組干擾（>=0x80 不會誤判為 \r）。
  let crlf = 0;
  let loneLf = 0;
  for (let i = 0; i < size; i++) {
    if (buf[i] === 0x0d) {
      if (buf[i + 1] === 0x0a) { crlf++; i++; }
    } else if (buf[i] === 0x0a) {
      loneLf++;
    }
  }
  let style = 'empty';
  if (crlf > 0 && loneLf > 0) style = 'mixed';
  else if (crlf > 0) style = 'crlf';
  else if (loneLf > 0) style = 'lf';
  return { style, crlf, loneLf, size };
}

/** 收集所有待檢查檔案（以 Set 去重：SCAN_DIRS 與 SCAN_ROOT_FILES 可能重疊，
 *  例如 ui/src/media/sprites.svg 會被 'ui' 與 'ui/src' 兩層都掃到） */
function collect() {
  const out = new Set();
  const push = (absPath) => {
    if (!fs.existsSync(absPath)) return;
    if (!fs.statSync(absPath).isFile()) return;
    if (!isTextFile(absPath)) return;
    if (shouldSkip(absPath)) return;
    out.add(absPath);
  };

  for (const dir of SCAN_DIRS) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    const walk = (cur) => {
      for (const name of fs.readdirSync(cur)) {
        const p = path.join(cur, name);
        if (fs.statSync(p).isDirectory()) {
          if (SKIP_DIR_PARTS.has(name)) continue;
          walk(p);
        } else {
          push(p);
        }
      }
    };
    walk(abs);
  }
  for (const f of SCAN_ROOT_FILES) push(path.join(ROOT, f));
  return [...out];
}

/**
 * 將檔案統一為 CRLF。
 * 用 binary（latin1）字串處理：utf-8 每個位元組都對應一個字元，
 * 往返轉換不會破壞多位元組序列 —— 若用 utf-8 + regex 可能改變位元組。
 */
function toCrlf(filePath) {
  const buf = fs.readFileSync(filePath);
  const s = buf.toString('binary')
    .replace(/\r\n/g, '\n')   // 先統一成 LF
    .replace(/\n/g, '\r\n');  // 再統一成 CRLF（避免重複加 \r）
  fs.writeFileSync(filePath, Buffer.from(s, 'binary'));
}

function main() {
  const args = process.argv.slice(2);
  const doFix = args.includes('--fix');
  const doList = args.includes('--list');

  const files = collect();
  const problems = [];   // 純 LF
  const mixed = [];     // 混合行尾（同一檔案內 CRLF/LF 並存，危害最大）

  for (const f of files) {
    const a = analyze(f);
    if (a.style === 'empty') continue;
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    if (a.style === 'mixed') mixed.push({ file: f, rel, ...a });
    else if (a.style === 'lf') problems.push({ file: f, rel, ...a });
  }

  const totalBad = problems.length + mixed.length;

  if (doList) {
    console.log(`掃描 ${files.length} 個文字檔`);
    // 依危害分級輸出：混合行尾 > 純 LF 不一致
    // （見 AGENTS.md「行尾規範」：危害排序為 混合行尾 > 不一致 > 選哪一種；
    //   純 LF 檔對「程式執行」無影響，但混合行尾會讓同檔內各行行為不一致）
    if (mixed.length) {
      console.log(`  ⚠ 混合行尾（同一檔案內 CRLF/LF 並存，危害最大）：${mixed.length}`);
      mixed.forEach((p) => console.log(`      ${p.rel}  (CRLF ${p.crlf} / LF ${p.loneLf})`));
    }
    console.log(`  LF（與 CRLF 不一致；對程式執行無影響，屬一致性偏好）：${problems.length}`);
    problems.forEach((p) => console.log(`      ${p.rel}  (${p.loneLf} 行)`));
    return 0;
  }

  if (doFix) {
    let fixed = 0;
    for (const p of [...problems, ...mixed]) { toCrlf(p.file); fixed++; }
    console.log(`已修復 ${fixed} 個檔案（統一為 CRLF）`);
    if (fixed === 0) console.log('所有檔案行尾已符合規範（CRLF）。');
    return 0;
  }

  if (totalBad === 0) {
    console.log(`✓ 行尾檢查通過：${files.length} 個文字檔全部為 CRLF。`);
    // 自我驗證：與 git 交叉比對，抓出本工具漏抓的檔案（避免假安全感）。
    verifyAgainstGit(files);
    return 0;
  }

  console.error(`✗ 行尾檢查失敗：${files.length} 個文字檔中有 ${totalBad} 個不符規範。`);
  console.error("");
  // 依危害分級輸出（與 --list 模式一致）
  if (mixed.length) {
    console.error("  [混合行尾：同一檔案內 CRLF/LF 並存 —— 危害最大，各行行為不一致]");
    mixed.forEach((p) => console.error(`    ${p.rel}  (CRLF ${p.crlf} / LF ${p.loneLf})`));
  }
  if (problems.length) {
    console.error("");
    console.error("  [純 LF：對程式執行無影響（解析器會正規化），屬一致性問題]");
    problems.forEach((p) => console.error(`    ${p.rel}  (${p.loneLf} 行)`));
  }
  console.error('');
  console.error('  修復方式：node scripts/eol.cjs --fix');
  console.error('  預防方式：.editorconfig 已設定 end_of_line = crlf（編輯器存檔時自動套用）');
  return 1;
}

/**
 * 自我驗證：以 `git ls-files --eol` 交叉比對，找出本工具漏抓的檔案。
 *
 * 為什麼需要：git 的判定（w/lf vs w/crlf）是獨立於本工具的權威來源。
 * 若兩者不一致 → 本工具的掃描範圍或副檔名清單有漏洞。
 * 實作此工具時正是靠這道比對，才發現漏了 ui/.eslintrc.json 與
 * src-tauri/Cargo.toml —— 沒有交叉比對就會自以為全綠（假安全感）。
 *
 * 排除：vendored（highlight.min.js / python.min.js，.gitattributes 已標 -text）
 * 與無副檔名的純文字資產。
 */
function verifyAgainstGit(checkedFiles) {
  let raw;
  try {
    raw = require('node:child_process').execSync(
      'git ls-files --eol', { cwd: ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
    );
  } catch (e) {
    return; // 非 git 環境（例如打包後），靜默略過
  }

  const mine = new Set(checkedFiles.map((f) => path.relative(ROOT, f).replace(/\\/g, '/')));

  const missed = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    // 格式：<i/eol> <w/eol> <attr...>\t<path>
    const m = line.match(/^(\S+)\s+(\S+)\s+(.*?)\t(.+)$/);
    if (!m) continue;
    const [, , wEol, , p] = m;
    if (wEol !== 'w/lf') continue;                       // 只找工作區仍是 LF 的
    if (SKIP_FILES.has(path.basename(p))) continue;       // vendored 刻意排除
    if (!mine.has(p)) missed.push(p);                     // 本工具沒掃到
  }

  if (missed.length) {
    console.log('');
    console.log('⚠️ 交叉比對：git 認定以下檔案工作區為 LF，但本工具未掃到（掃描範圍有漏洞）：');
    missed.forEach((p) => console.log(`    ${p}`));
    console.log('   → 請更新 scripts/eol.cjs 的 SCAN_DIRS / TEXT_EXT / SKIP 設定。');
  }
}

process.exit(main());
