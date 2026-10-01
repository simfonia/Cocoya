/**
 * sync_pristine_examples.cjs — 打包前把 examples/ 複製成 resources/examples_pristine/
 *
 * 為什麼需要（2026-10-01）：
 *   Tauri 會把 Resource examples 播種到 %AppData%，使用者可直接編輯，萬一改壞可重新播種。
 *   但 VSIX 的 examples 就在 extensionPath/examples，**全機只有這一份**，
 *   沒有第二份可以還原。打包時多帶一份 pristine 副本，VSIX 才有還原來源。
 *
 * 設計取捨：採「資料夾副本」而非 zip —— 零額外依賴（不需 adm-zip/yauzl），
 * 代價是 VSIX 體積 +examples 現有大小（約 1.5 MB）。
 *
 * 執行：node scripts/sync_pristine_examples.cjs
 *      （package.json 的 package / vsix:prepublish 會自動先跑）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'examples');
const DST = path.join(ROOT, 'resources', 'examples_pristine');

/**
 * 排除項目（對齊 .gitignore 的 examples dataset/model 與 .bak 規則）
 * 這些都是「使用者產生的資料」，不是內建範例的一部分。
 * 若一併打包進 pristine，使用者按「還原範例檔」時會把自己的測試資料
 * 當成官方範例還原回來 —— 既佔空間又語意錯誤。
 */
const SKIP_DIRS = new Set(['dataset', 'model']);
const SKIP_EXT = ['.bak'];

/** 遞迴複製（強制覆寫），回傳複製的檔案數 */
function copyDir(src, dst) {
    let count = 0;
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;   // dataset/ model/
            count += copyDir(path.join(src, entry.name), path.join(dst, entry.name));
            continue;
        }
        if (SKIP_EXT.some((ext) => entry.name.endsWith(ext))) continue; // *.bak
        fs.copyFileSync(path.join(src, entry.name), path.join(dst, entry.name));
        count += 1;
    }
    return count;
}

/** 遞迴刪除（用於清空舊副本，避免殘留已刪除的範例檔） */
function rimraf(target) {
    if (!fs.existsSync(target)) return;
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
        const p = path.join(target, entry.name);
        if (entry.isDirectory()) rimraf(p);
        else fs.unlinkSync(p);
    }
    fs.rmdirSync(target);
}

function main() {
    if (!fs.existsSync(SRC)) {
        console.error(`[pristine] 找不到來源目錄：${SRC}`);
        process.exit(1);
    }
    // 先清空再複製：否則 examples/ 裡已刪除的檔案會殘留在副本中，
    // 使用者還原後會看到不存在的範例。
    rimraf(DST);
    const n = copyDir(SRC, DST);
    console.log(`[pristine] examples -> resources/examples_pristine（${n} 個檔案）`);
}

main();
