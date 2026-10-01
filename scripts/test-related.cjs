/**
 * scripts/test-related.cjs
 * ---------------------------------------------------------------------------
 * L0 開發守門：依「本次改動的檔案」自動挑出最少的必要測試集並執行。
 *
 * 解決的問題（本專案量測基準 2026-09-30）：
 *   - 全量 node --test "src/任意深度/任意檔名.test.mjs" 每次約 0.6s / 輸出 12KB，
 *     輸出全進對話上下文，是日常迭代最大的 token 浪費來源。
 *   - 實務上改一個檔案只該驗一兩個測試檔，其餘 30+ 檔純屬噪音。
 *
 * 用法：
 *   npm run test:fast                      → 自動分析 git 變更
 *   npm run test:fast -- ui/src/modules/spike/spike_blocks.js
 *                                          → 指定檔案（可多個）
 *   node scripts/test-related.cjs --dry    → 只列出會跑哪些測試，不執行
 *
 * 設計原則：
 *   1. 用預設 spec reporter 執行，輸出於本腳本過濾成「摘要 + 失敗明細」；
 *      過濾在子行程輸出落地前完成，不讓冗餘內容進入 AI 對話上下文。
 *   2. 只挑必要的測試檔：同名優先，其次同目錄，最後才用模組 glob。
 *   3. 契约測試（core_contract.test.mjs）守的是「全專案架構不變」，
 *      只要動到任何積木／產生器／i18n／主題檔就必須納入。
 *      同理，theme_contract.test.mjs 守「三主題 cssVars 鍵集合一致」，
 *      動到任一 themes/*.js 都必須納入（2026-10-01 Audit P3-1）。
 *   4. 選不到任何測試時，明確提示該跑什麼，不猜測。
 * ---------------------------------------------------------------------------
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const UI = path.join(ROOT, 'ui');
const CONTRACT_TEST = 'src/modules/core/core_contract.test.mjs';
const THEME_CONTRACT_TEST = 'src/modules/theme_manager/theme_contract.test.mjs';
const DM_GLOB = 'src/modules/dataset_manager/**/*.test.mjs';

/** 取得本次需要關注的檔案清單（相對 repo 根、forward slash）。 */
function collectChangedFiles(argv) {
    const explicit = argv.filter((a) => !a.startsWith('--'));
    if (explicit.length) return explicit.map((p) => p.replace(/\\/g, '/'));

    const git = (args) => {
        const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
        return r.status === 0 ? r.stdout.trim().split(/\r?\n/).filter(Boolean) : [];
    };
    const tracked = git(['diff', '--name-only', 'HEAD']);
    const untracked = git(['ls-files', '--others', '--exclude-standard']);
    return [...new Set([...tracked, ...untracked])].map((p) => p.replace(/\\/g, '/'));
}

/**
 * 回傳需要執行的測試 glob 集合。
 * @param {string[]} files 變更檔案（相對 root）
 * @returns {{tests: Set<string>, reasons: Map<string,string>, hints: string[]}}
 */
function selectTests(files) {
    const tests = new Set();
    const reasons = new Map();
    const hints = [];
    const add = (t, why) => {
        if (!tests.has(t)) reasons.set(t, why);
        tests.add(t);
    };

    for (const file of files) {
        const inUi = file.startsWith('ui/');
        const rel = inUi ? file.slice(3) : file;

        // 非 ui/ 檔案（VSIX TS、Rust、Python、文件…）不參與 Node 測試挑選，只給提示
        if (!inUi) {
            if (/^src-tauri\/.*\.rs$/.test(file)) hints.push('Rust 變更 → 另跑 `npm run test:rust`（或 cargo check）');
            else if (/^src\/.*\.ts$/.test(file)) hints.push('VSIX TypeScript 變更 → 另跑 `npx tsc --noEmit -p tsconfig.json` 與 `npm run lint`');
            else if (/^resources\/.*\.py$/.test(file)) hints.push('Python 變更 → 另跑 `python -m py_compile` 該檔');
            continue;
        }

        const isContractSensitive =
            /_blocks\.js$|_generators\.js$|toolbox\.xml$/.test(rel) ||
            /(^|\/)i18n\/[^/]+\.js$/.test(rel) ||
            /^src\/(zh-hant|en)\.js$/.test(rel) ||
            /^src\/core_manifest\.json$/.test(rel) ||
            /^src\/modules\/theme_manager\/themes\/.+\.js$/.test(rel);

        if (isContractSensitive) add(CONTRACT_TEST, `契約對帳：${file}`);
        if (/^src\/modules\/theme_manager\/themes\/.+\.js$/.test(rel)) {
            add(THEME_CONTRACT_TEST, `三主題 token 一致性：${file}`);
        }

        // 測試挑選：同名優先（改 ui/xxx.js → ui/xxx.test.mjs），無同名測試才回退整個資料夾
        const dir = path.posix.dirname(rel);
        const absDir = path.join(UI, dir);
        const base = path.posix.basename(rel).replace(/\.test\.mjs$/, '').replace(/\.(js|xml|json)$/, '');
        if (fs.existsSync(absDir)) {
            const all = fs.readdirSync(absDir).filter((f) => f.endsWith('.test.mjs'));
            const sameName = all.find((f) => f === `${base}.test.mjs`);
            const picked = sameName ? [sameName] : all;
            const how = sameName ? '同名測試' : '同目錄測試（無同名，改跑該目錄全部）';
            for (const f of picked) add(path.posix.join(dir, f), `${how}：${file}`);
        }

        if (rel.startsWith('src/modules/dataset_manager/')) add(DM_GLOB, `DM 模組變更：${file}`);
    }
    return { tests, reasons, hints };
}

/**
 * 執行測試，只輸出摘要與失敗項。
 *
 * 這裡刻意「用預設 spec reporter 執行、再於本腳本過濾輸出」，而非 --test-reporter=dot：
 * dot reporter 沒有 tests/pass/fail 摘要行，會失去一眼判斷紅綠的能力。
 * 過濾發生在子行程輸出落地之前，所以不會有任何冗餘內容進入 AI 對話上下文。
 */
function run(tests) {
    const args = ['--test', ...tests];
    const r = spawnSync(process.execPath, args, { cwd: UI, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const out = `${r.stdout || ''}\n${r.stderr || ''}`;
    const lines = out.split(/\r?\n/);

    const summary = lines.filter((l) => /^ℹ (tests|suites|pass|fail|cancelled|skipped|duration_ms)/.test(l));
    const failIdx = lines.map((l, i) => (/^(✖|not ok)/.test(l) ? i : -1)).filter((i) => i >= 0);
    const failures = failIdx.length
        ? lines.filter((_, i) => failIdx.some((f) => i >= f && i <= f + 12))
        : [];

    console.log(`執行 ${tests.length} 個測試檔 →`);
    console.log(summary.join('\n') || '(無摘要輸出)');
    if (failures.length) {
        console.log('--- 失敗明細（已截斷）---');
        console.log(failures.slice(0, 40).join('\n'));
        console.log('完整明細：npm run test:ui');
    }
    return r.status === 0 ? 0 : 1;
}

function main() {
    const argv = process.argv.slice(2);
    const dry = argv.includes('--dry');
    const files = collectChangedFiles(argv);

    if (!files.length) {
        console.log('沒有偵測到任何變更檔（git 無未提交變更，也未指定檔案）。');
        console.log('全量守門請用：npm run test:ui');
        return 0;
    }

    const { tests, reasons, hints } = selectTests(files);
    console.log(`變更檔案 ${files.length} 個：${files.slice(0, 8).join(', ')}${files.length > 8 ? ' …' : ''}`);
    if (!tests.size) {
        console.log('未匹配到相關測試（此類變更可能不影響 Node 測試）。建議：');
        hints.forEach((h) => console.log('  - ' + h));
        console.log('若仍不確定：npm run test:ui');
        return 0;
    }
    for (const t of tests) console.log(`  + ${t}  ← ${reasons.get(t)}`);
    hints.forEach((h) => console.log('  ! ' + h));
    if (dry) return 0;
    return run([...tests]);
}

process.exit(main());
