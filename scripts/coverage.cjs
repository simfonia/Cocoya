#!/usr/bin/env node
/**
 * scripts/coverage.cjs — 測試覆蓋率基準報告（T5，2026-10-03）
 *
 * 【定位：只產報告，不設門檻】
 * 依 todo「Batch 6 / T5」：先產出報告 → 連續兩週後依實際值收緊門檻。
 * 故預設 `--check` 關閉；`--check` 模式讀 `coverage/baseline.json` 比對，
 * 但在 `baseline.json` 的 `enforce: false` 期間只報告不失敗。
 *
 * 【為何不直接用 c8 CLI】
 * c8 需要指定 `--include` / `--exclude` 與輸出格式；本檔把「量哪些檔」
 * 這件事集中成單一 SSOT（下方 SCOPE），日後要擴大或縮小範圍只改這裡，
 * 不必在 package.json 與文件各寫一份 glob（兩份 glob 一定會漂移）。
 *
 * 【量測範圍的取捨（重要，勿隨意放寬）】
 * 本專案 `ui/src` 同時包含三種性質完全不同的檔案：
 *   1. **可測的純邏輯**（core／application／ui presenter）—— 這才是覆蓋率的重點
 *   2. **只在瀏覽器跑的膠水**（renderer.js、terminal.js 的 rAF/DOM 部分）
 *   3. **第三方 vendored**（blockly/*.min.js）—— 必須排除，否則數字完全失真
 *
 * 目前只量 `ui/src/modules/**` 與 `ui/src/app/**` 的 .js，
 * 排除測試檔與 vendored。這是**刻意保守**的起點，不是全專案覆蓋率。
 *
 * 【用法】
 *   npm run coverage          # 產報告（文字摘要 + coverage/coverage-summary.json）
 *   npm run coverage:check    # 與 baseline.json 比對（enforce=false 時僅輸出差異）
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const uiRoot = path.join(repoRoot, 'ui');
const coverageDir = path.join(repoRoot, 'coverage');
const summaryPath = path.join(coverageDir, 'coverage-summary.json');
const baselinePath = path.join(coverageDir, 'baseline.json');

/** 量測範圍 SSOT —— 日後要調整只改這裡。 */
const SCOPE = {
    include: ['src/modules/**/*.js', 'src/app/**/*.js', 'src/bridge/**/*.js', 'src/utils/**/*.js'],
    // 測試檔本身不是被測對象；vendored 第三方必須排除（否則數字失真）
    exclude: ['**/*.test.mjs', '**/*.min.js', 'node_modules/**', 'src/blockly/**']
};

function runTests() {
    console.log('[coverage] 執行測試（ui/）…\n');
    // 不用 shell:true —— glob 展開交給 node 自行處理（node --test 支援 glob 字串），
    // 開 shell 會觸發 DEP0190 且在 Windows 上引號處理脆弱。
    const result = spawnSync(process.execPath, ['--test', 'src/**/*.test.mjs'], {
        cwd: uiRoot,
        stdio: 'inherit'
    });
    if (result.status !== 0) {
        console.error('\n[coverage] 測試未全綠 —— 覆蓋率報告無意義（先修測試）。');
        process.exit(result.status || 1);
    }
}

function runC8() {
    console.log('[coverage] 產生覆蓋率…');
    const args = [
        'c8',
        '--reporter=text-summary',
        '--reporter=json-summary',
        '--reports-dir', path.relative(uiRoot, coverageDir),
    ];
    for (const inc of SCOPE.include) args.push('--include', inc);
    for (const exc of SCOPE.exclude) args.push('--exclude', exc);
    // 覆蓋率不設門檻（T5 階段一）
    args.push('--check-coverage=false');
    args.push('node', '--test', 'src/**/*.test.mjs');

    // 直接呼叫 c8 的 JS 進入點，不經 shell／npx（避免 DEP0190 與 Windows 引號脆弱性）
    const c8Bin = path.join(repoRoot, 'node_modules', 'c8', 'bin', 'c8.js');
    if (!fs.existsSync(c8Bin)) {
        console.error('[coverage] 找不到 c8，請先 npm install。');
        process.exit(1);
    }
    const result = spawnSync(process.execPath, [c8Bin, ...args], {
        cwd: uiRoot,
        stdio: 'inherit'
    });
    if (result.status !== 0) {
        console.error('[coverage] c8 執行失敗。');
        process.exit(result.status || 1);
    }
}

function readSummary() {
    if (!fs.existsSync(summaryPath)) {
        console.error(`[coverage] 找不到 ${summaryPath}，c8 可能未執行成功。`);
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
}

/** 依「總行數」排序取最差 N 檔 —— 覆蓋率報告的用途是找該補測的檔，不是炫數字。 */
function worstFiles(summary, n = 10) {
    return Object.entries(summary)
        .filter(([file]) => file !== 'total')
        .map(([file, v]) => ({
            file: path.relative(repoRoot, file),
            pct: v.lines.pct,
            total: v.lines.total
        }))
        .filter((f) => f.total > 20) // 太小檔的百分比雜訊大，先排除
        .sort((a, b) => a.pct - b.pct)
        .slice(0, n);
}

function saveBaseline(summary) {
    fs.mkdirSync(coverageDir, { recursive: true });
    const baseline = {
        // T5 階段一：只產報告，不因低於門檻而失敗。
        // 改為 enforce: true 前，請先讀 README 說明「依實際值收緊」。
        enforce: false,
        recordedAt: new Date().toISOString().slice(0, 10),
        scope: SCOPE,
        total: summary.total.lines,
        note: 'T5 階段一：基準值僅供趨勢對照，不代表品質目標。'
    };
    fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n');
    console.log(`\n[coverage] 基準已寫入 coverage/baseline.json（enforce: false）`);
}

function compare(summary) {
    if (!fs.existsSync(baselinePath)) {
        console.log('[coverage] --check：尚無 baseline.json，先跑一次 npm run coverage 產生。');
        return;
    }
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const now = summary.total.lines.pct;
    const was = baseline.total.pct;
    const delta = (now - was).toFixed(2);
    console.log(`\n[coverage] 對照基準（${baseline.recordedAt}）：${was.toFixed(2)}% → 現況 ${now.toFixed(2)}%（${delta >= 0 ? '+' : ''}${delta}）`);
    if (!baseline.enforce) {
        console.log('[coverage] baseline.enforce = false → 本次僅報告，不擋任何流程（T5 階段一設計）。');
        return;
    }
    const threshold = baseline.minLines ?? Infinity;
    if (now < threshold) {
        console.error(`[coverage] 未達門檻 ${threshold}%，失敗。`);
        process.exit(1);
    }
}

runTests();
runC8();
const summary = readSummary();

console.log('\n──────── 覆蓋率基準（ui/src，保守範圍）────────');
console.log(`總行覆蓋率：${summary.total.lines.pct.toFixed(2)}%  (${summary.total.lines.covered}/${summary.total.lines.total})`);
console.log('分支覆蓋率：' + (summary.total.branches ? summary.total.branches.pct.toFixed(2) + '%' : 'n/a'));
console.log('\n最需補測的檔案（依行覆蓋率排序，已排除 <20 行的小檔）：');
for (const f of worstFiles(summary)) {
    console.log(`  ${String(f.pct.toFixed(1)).padStart(6)}%  (${f.total} 行)  ${f.file}`);
}

saveBaseline(summary);
if (process.argv.includes('--check')) compare(summary);
