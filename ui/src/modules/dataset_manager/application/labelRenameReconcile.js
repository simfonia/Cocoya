/**
 * Dataset Manager application/labelRenameReconcile.js — 標籤改名後的影像路徑對帳純函式（2026-09-17）
 *
 * 背景：label 改名時後端（Tauri `dataset_rename_label` / VSIX `handleDatasetRenameLabel`）會
 * 把 canonical 落盤區的 `<label>` 目錄與 `<label>_` 前綴檔整體改名，並回傳 `renames`
 * [{oldPath, newPath}]（後端已做「反斜線→正斜線」正規化）。前端需以該清單對帳
 * `img.diskPath / img.name / img.path`，否則：
 * - spec samples.image_path 只更新到目錄段、檔名停留舊值（比對 miss）；
 * - 縮圖 hover tooltip（title 吃 img.path）顯示舊檔名。
 *
 * 無 DOM / Bridge 依賴，可單元測試（原地修改 images，回傳更新筆數）。
 */
import { normalizePath } from '../core/pathPolicy.js';

function baseNameOf(value) {
    return normalizePath(value).split('/').pop();
}

/**
 * 以 rename 清單對帳影像路徑。
 * @param {Array} images state.images（原地修改）
 * @param {Array} renames [{oldPath, newPath}]（後端回傳；可為反斜線或正斜線）
 * @param {{oldLabel: string, newLabel: string}} labels 改名前後的標籤名稱
 * @returns {number} 更新筆數
 */
export function reconcileRenamedPaths(images, renames, { oldLabel, newLabel }) {
    const list = Array.isArray(images) ? images : [];
    const renamed = Array.isArray(renames) ? renames : [];
    if (!list.length || !renamed.length || !oldLabel || !newLabel) return 0;

    // 全路徑比對（兩端皆經 normalizePath，避免 Windows 反斜線 savePath 對正斜線回傳值 miss）
    const byPath = new Map(renamed.map((r) => [normalizePath(r.oldPath), normalizePath(r.newPath)]));
    // 兜底：檔名唯一時以 basename 比對（專案根變更/大小寫差異造成絕對路徑前綴不一致）
    const byName = new Map(renamed.map((r) => [baseNameOf(r.oldPath), normalizePath(r.newPath)]));
    // 2026-10-16 ③：相對路徑尾段比對（label/filename），供 diskPath 為 null 的影像（偵測模式）
    // 使用；old_path 已是「舊目錄/舊檔名」，尾段等於 img.path（'none/none_1782.jpg'），
    // 對應 new_path 即為「新目錄/新檔名」。
    const byRelPath = new Map();
    for (const r of renamed) {
        const parts = normalizePath(r.oldPath).split('/');
        if (parts.length >= 2) {
            byRelPath.set(parts.slice(-2).join('/'), normalizePath(r.newPath));
        }
    }

    const oldPrefix = oldLabel + '/';
    let changed = 0;

    list.forEach((img) => {
        if (!img) return;
        const disk = normalizePath(img.diskPath);
        let newPath = disk ? byPath.get(disk) : null;

        if (!newPath && disk) {
            const file = baseNameOf(disk);
            const sameName = file ? list.filter((i) => i && baseNameOf(i.diskPath) === file).length : 0;
            if (file && sameName === 1) newPath = byName.get(file);
        }

        // 2026-10-16 ③：diskPath 為 null（偵測模式）或全路徑比對 miss 時，以 img.path 的
        // 「label/filename」尾段與 rename entry 做相對路徑比對，取得包含新檔名的 newPath，
        // 避免只同步目錄段而檔名停留舊值。
        // ⚠ 只有檔名在清單中唯一時才兜底（與 byName fallback 同樣保護），避免重複檔名
        // 被錯誤套用完整的新檔名。
        if (!newPath && typeof img.path === 'string') {
            const file = baseNameOf(img.path);
            const sameName = file ? list.filter((i) => i && baseNameOf(i.path) === file).length : 0;
            if (file && sameName === 1) {
                const candidate = byRelPath.get(img.path);
                if (candidate) newPath = candidate;
            }
        }

        if (newPath) {
            const file = baseNameOf(newPath);
            if (!file) return;
            img.name = file;
            img.path = newLabel + '/' + file;
            // diskPath 原本為 null（偵測模式）時不憑空產生，僅更新 path/name
            if (disk) img.diskPath = newPath;
            changed++;
        } else if (img.label === newLabel && typeof img.path === 'string' && img.path.startsWith(oldPrefix)) {
            // 2026-10-16 ③：目錄已整體改名，但該檔未逐一回報（匯入圖 diskPath 為 null、
            // 或檔名無 <label>_ 前綴）→ 僅同步 path 的目錄段。
            // ⚠ 契約：呼叫端（labelManager 改名）必須先把 img.label 同步為新名，
            // 否則此分支無法區分「已改名目錄下的圖」與無關圖片；
            // 後端契約：目錄有改名即保證 renames 非空（含目錄改名、檔名不變的條目），
            // 故此處 renames 為空＝磁碟無改動，可安全 no-op。
            img.path = newLabel + '/' + img.path.slice(oldPrefix.length);
            changed++;
        }
    });

    return changed;
}
