#!/usr/bin/env node
/**
 * scripts/pytest-layers.cjs — 依 git diff 自動決定 pytest 執行層級
 *
 * 【為何需要分層】
 *
 * 實測（2026-10-04）：11 個 pytest 中有 3 個慢測試，合計約 59 秒
 *（`test_task_type_rename` 40.6s、`test_line_following_rename` 11.8s、`test_feature_train` 6.8s），
 * 其餘 8 個合計僅 3.6 秒。
 *
 * 慢測試慢的原因**不是訓練本身**（epochs 已是最小化的 1、batch 4），
 * 而是每個都用 subprocess 跑真實訓練 → 每次重複付出 Python 啟動 +
 * TensorFlow import 的成本。
 *
 * ⚠️ **關鍵限制**：全量 63 秒已超出一般工具的 30 秒逾時門檻。
 *   實測中 AI 多次嘗試直接跑全量都撞上逾時，必須改用背景執行。
 *   **若守門慢到跑不動，它對 AI 就等於不存在** —— 這比死碼更實務地架空了守門。
 *   故本腳本讓預設路徑維持在數秒級。
 *
 * 【實測依據：風險其實很小】
 * 近 60 天 2495 次檔案變更中，僅 51 次（**2%**）會影響慢測試 ——
 * 因為它們只驗證 `resources/train_templates/` 與 `dataset_sidecar.py`，
 * 而絕大多數開發動作發生在前端（700+ 檔）。
 *
 * 【分層策略】
 *   Tier 1（預設，約 4 秒）：8 個非訓練測試。覆蓋資料集匯出、佈局契約、
 *                            分層切分、偵測曲線、dataloader。
 *   Tier 2（條件觸發，約 63 秒）：3 個真實訓練測試。
 *
 *   Tier 2 觸發條件（任一成立）：
 *     - 本次變更動到 resources/train_templates/**、resources/dataset_manager/**、
 *       tests/conftest.py、pytest.ini
 *     - 顯式指定 --full
 *
 * 【為何用 marker 而非檔名】
 * 檔名會漂移（新增訓練測試時容易忘記排除）；marker 是測試作者對
 * 「我這個測試很慢」的自我宣告，語意正確。
 */
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

/**
 * 會影響慢測試的檔案（任一命中即跑 Tier 2）。
 *
 * ⚠️ 新增訓練測試時，若它需要真實訓練，請務必確認其 import 的模組
 *    落在本清單內 —— 否則改了那些模組也不會觸發全量，會形成盲點。
 */
const SLOW_TRIGGERS = [
    /^resources\/train_templates\//,
    /^resources\/dataset_manager\//,
    /^tests\/conftest\.py$/,
    /^pytest\.ini$/,
    // sidecar 若被搬移或重構，訓練整合路徑會變
    /^src-tauri\/src\/commands\/python\.rs$/,
];

/** 取本次變更檔案（未 commit 的工作樹變更 + 未 push 的 commit）。 */
function collectChangedFiles() {
    const files = new Set();
    const run = (args) => {
        try {
            return execFileSync('git', args, {
                cwd: repoRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
            });
        } catch (e) {
            return '';
        }
    };
    // 已 staged / 未 staged
    for (const line of run(['diff', '--name-only', 'HEAD']).split('\n')) {
        if (line.trim()) files.add(line.trim());
    }
    // 未 push 的 commit
    for (const args of [['diff', '--name-only', '@{upstream}'], ['diff', '--name-only', 'HEAD~5']]) {
        for (const line of run(args).split('\n')) {
            if (line.trim()) files.add(line.trim());
        }
    }
    return [...files];
}

function needsSlowLayer(argv) {
    if (argv.includes('--full')) return { run: true, why: '顯式指定 --full' };

    // 無 git 歷史（如 CI 的淺層 clone 或 tarball）→ 保守跑全量
    try {
        execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, stdio: 'ignore' });
    } catch (e) {
        return { run: true, why: '無法讀取 git 歷史（淺層 clone？），保守起見跑全量' };
    }

    const files = collectChangedFiles();
    if (files.length === 0) {
        return { run: true, why: '偵測不到變更檔案（乾淨工作樹且無未 push commit），保守跑全量' };
    }
    const hits = files.filter((f) => SLOW_TRIGGERS.some((re) => re.test(f.replace(/\\/g, '/'))));
    return hits.length
        ? { run: true, why: `變更觸及訓練路徑：${hits.slice(0, 3).join(', ')}${hits.length > 3 ? ' …' : ''}` }
        : { run: false, why: `${files.length} 個變更檔皆不涉及訓練路徑` };
}

function resolvePython() {
    // ⚠️ 專案慣用 Python 不在 PATH（AGENTS.md）。實測：本機 PATH 的 `python`
    //    指向 miniconda 且未安裝 pytest，會報「No module named pytest」。
    //    優先序：環境變數 COCOYA_PYTHON -> 專案慣用路徑 -> PATH 的 python。
    if (process.env.COCOYA_PYTHON) return process.env.COCOYA_PYTHON;
    const preferred = 'C:/WPy64-31160/python-3.11.6.amd64/python.exe';
    if (fs.existsSync(preferred)) return preferred;
    return 'python';
}

function main() {
    const argv = process.argv.slice(2);
    const { run, why } = needsSlowLayer(argv);
    // ⚠️ 引號必須包在整個 marker 表達式外面（含空格者會被拆成多個 argv）。
    //    實測踩坑：`-m "not slow"` 若不加引號，PowerShell/cmd 會把 not 與 slow
    //    拆成兩參 -> pytest 報「file or directory not found: slow」。
    const args = run ? ['-m', 'pytest', '-q'] : ['-m', 'pytest', '-q', '-m', '"not slow"'];

    const py = resolvePython();
    console.log(`[pytest] ${run ? 'Tier 2（全量，約 63 秒）' : 'Tier 1（快速，約 9 秒）'}`);
    console.log(`[pytest] 判斷依據：${why}`);
    console.log(`[pytest] 執行：${py} ${args.join(' ')}\n`);

    const t0 = Date.now();
    const r = spawnSync(py, args, { cwd: repoRoot, stdio: 'inherit' });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n[pytest] 耗時 ${secs}s（${run ? 'Tier 2' : 'Tier 1'}）`);
    process.exit(r.status === null ? 1 : r.status);
}

main();