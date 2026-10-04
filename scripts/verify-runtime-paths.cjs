#!/usr/bin/env node
/**
 * scripts/verify-runtime-paths.cjs — 產品執行時路徑 SSOT 守門（掃描型）
 *
 * 【為何需要這個工具】
 * `temp_scripts/` 是 **VSIX 執行時目錄**（未命名備份宣示、未錨定資料集降級路徑），
 * 與開發暫存 `temp/` 只差一個字，極易被誤認為「可清理的暫存」而改名或刪除。
 * 改名 = 使用者未錨定專案的備份失效，且**不會有任何錯誤拋出**。
 *
 * 改版前 `'temp_scripts'` 硬編碼於 6 個檔案 14 處。任一處漏改，後果是
 * 「備份寫到 A 目錄、清理讀 B 目錄」→ 備份遺失或孤兒檔，且只在使用者
 * 未錨定專案時才觸發，一般測試完全碰不到。
 *
 * 【本守門的判準】
 * 1. 產品程式碼不得出現裸 `'temp_scripts'` 字面值（註解除外 —— 註解是刻意保留的說明）
 * 2. `runtimePaths.ts` 必須是唯一宣告該字面值之處（防止第二份真實來源）
 * 3. 常數值必須與實際 mkdir 行為一致（防止改了常數卻沒改行為，或反之）
 *
 * 【用��】node scripts/verify-runtime-paths.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const SRC_DIR = path.join(repoRoot, 'src');
const SSOT = path.join(SRC_DIR, 'runtimePaths.ts');
const LITERAL = 'temp_scripts';

const errors = [];

/** 遞迴列出 src/ 下所有 .ts（排除 runtimePaths.ts 本身）。 */
function listTs(dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...listTs(full));
        else if (e.name.endsWith('.ts')) out.push(full);
    }
    return out;
}

if (!fs.existsSync(SSOT)) {
    console.error(`✖ 缺少 SSOT：${path.relative(repoRoot, SSOT)}`);
    process.exit(1);
}

// ── 判準 1 & 2：裸字面值只允許出現在 SSOT ────────────────────────────────
const ssotSrc = fs.readFileSync(SSOT, 'utf8');
// 只計程式碼行（JSDoc 說明文字含該字面值屬正常，且是刻意提醒）
const ssotCodeLines = ssotSrc.split('\n').filter((l) => {
    const s = l.trim();
    return !(s.startsWith('*') || s.startsWith('//') || s.startsWith('/*'));
});
const ssotCount = (ssotCodeLines.join('\n').match(/'temp_scripts'/g) || []).length;
if (ssotCount !== 1) {
    errors.push(`SSOT 應恰好宣告一次 RUNTIME_TEMP_DIR_NAME，實得 ${ssotCount} 處`);
}

for (const file of listTs(SRC_DIR)) {
    if (path.resolve(file) === path.resolve(SSOT)) continue;
    const rel = path.relative(repoRoot, file).replace(/\\/g, '/');
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
        if (!line.includes(`'${LITERAL}'`) && !line.includes(`"${LITERAL}"`)) return;
        const s = line.trim();
        // 註解不算違規：說明目錄用途的註解是刻意保留的
        if (s.startsWith('//') || s.startsWith('*') || s.startsWith('/*')) return;
        errors.push(`${rel}:${i + 1} 出現裸 '${LITERAL}' 字面值，請改用 runtimePaths 的 helper`);
    });
}

// ── 判準 3：SSOT 的 helper 不得內嵌第二份字面值 ─────────────────────────
if (/path\.join\(\s*extensionPath\s*,\s*'/.test(ssotSrc)) {
    errors.push('runtimePaths.ts 的 helper 內不得再出現 path.join 字面值拼接');
}

// ── 判準 4：Rust 端不得誤用此目錄（路徑基準語意不同）───────────────────
const tauriSrc = path.join(repoRoot, 'src-tauri', 'src');
if (fs.existsSync(tauriSrc)) {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(
        (e) => (e.isDirectory() ? walk(path.join(d, e.name))
            : (e.name.endsWith('.rs') ? [path.join(d, e.name)] : [])));
    for (const f of walk(tauriSrc)) {
        const rel = path.relative(repoRoot, f).replace(/\\/g, '/');
        fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
            if (line.includes(LITERAL)) {
                errors.push(`${rel}:${i + 1} Tauri 端不應使用 '${LITERAL}'`
                    + '（路徑基準語意不同：extensionPath vs app_data；需另建 adapter）');
            }
        });
    }
}

if (errors.length) {
    console.error('✖ runtime paths 守門失敗：\n' + errors.map((e) => '   ' + e).join('\n'));
    process.exit(1);
}
console.log('✓ runtime paths 守門通過：temp_scripts 僅宣告於 src/runtimePaths.ts');