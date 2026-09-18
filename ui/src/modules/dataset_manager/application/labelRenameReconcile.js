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

        if (newPath) {
            const file = baseNameOf(newPath);
            if (!file) return;
            img.diskPath = newPath;
            img.name = file;
            img.path = newLabel + '/' + file;
            changed++;
        } else if (img.label === newLabel && typeof img.path === 'string' && img.path.startsWith(oldPrefix)) {
            // 目錄已整體改名，但逐一檔名未回報（非 <label>_ 前綴檔）——僅同步 path 的目錄段
            img.path = newLabel + '/' + img.path.slice(oldPrefix.length);
            changed++;
        }
    });

    return changed;
}
