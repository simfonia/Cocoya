const SAFE_PROJECT_NAME = /^[a-zA-Z0-9_-]+$/;

export function normalizeProjectName(value, fallback = 'dataset') {
    const raw = String(value || '').trim();
    const normalized = raw
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .replace(/^_+|_+$/g, '');
    return normalized || fallback;
}

export function validateProjectName(value) {
    const name = String(value || '').trim();
    if (!name) return { ok: false, code: 'PROJECT_NAME_REQUIRED' };
    if (name === '.' || name === '..') return { ok: false, code: 'PROJECT_NAME_INVALID' };
    if (!SAFE_PROJECT_NAME.test(name)) return { ok: false, code: 'PROJECT_NAME_INVALID' };
    return { ok: true, value: name };
}

export function normalizePath(value) {
    return String(value || '').replace(/\\/g, '/');
}

export function isPathWithinRoot(root, candidate) {
    const normalizedRoot = normalizePath(root).replace(/\/+$/, '');
    const normalizedCandidate = normalizePath(candidate);
    if (!normalizedRoot || !normalizedCandidate) return false;
    if (normalizedCandidate === normalizedRoot) return true;
    return normalizedCandidate.indexOf(normalizedRoot + '/') === 0;
}

/**
 * Canonical dataset.json 路徑組裝（純函式，僅定義契約，尚未接入任何流程）。
 * 契約：<projectRoot>/dataset/<projectName>/dataset.json（見 DatasetManagerParityMatrix.md 4.2）。
 * 用詞：projectName = dataset/ 下的「資料集名稱」（表單欄位值），非 xml 積木專案。
 */
export function buildCanonicalDatasetDirectoryPath(projectRoot, projectName) {
    if (!projectRoot) return { ok: false, code: 'PROJECT_ROOT_REQUIRED' };
    const nameCheck = validateProjectName(projectName);
    if (!nameCheck.ok) return nameCheck;
    return {
        ok: true,
        value: normalizePath(projectRoot).replace(/\/+$/, '') + '/dataset/' + nameCheck.value
    };
}

export function buildCanonicalDatasetFilePath(projectRoot, projectName) {
    const dir = buildCanonicalDatasetDirectoryPath(projectRoot, projectName);
    if (!dir.ok) return dir;
    return { ok: true, value: dir.value + '/dataset.json' };
}

function hasTraversalSegment(relativePath) {
    const segments = String(relativePath || '').split(/[\\/]+/);
    return segments.some((segment) => segment === '..');
}

/**
 * 由來源資料夾 + 相對路徑解析實體影像檔路徑，並做 containment 驗證。
 * 拒絕：空值、絕對路徑、含 '..' traversal 的相對路徑、解析後越出來源資料夾者。
 */
export function resolveSourceImagePath(sourceFolderPath, relativePath) {
    if (!sourceFolderPath) return { ok: false, code: 'SOURCE_FOLDER_REQUIRED' };
    if (!relativePath) return { ok: false, code: 'IMAGE_PATH_REQUIRED' };

    const normalizedRelative = normalizePath(relativePath);
    if (/^[a-zA-Z]:/.test(normalizedRelative) || normalizedRelative.indexOf('/') === 0) {
        return { ok: false, code: 'IMAGE_PATH_ABSOLUTE' };
    }
    const cleanRelative = normalizedRelative.replace(/^\/+/, '');
    if (hasTraversalSegment(normalizedRelative)) {
        return { ok: false, code: 'IMAGE_PATH_TRAVERSAL' };
    }

    const root = normalizePath(sourceFolderPath).replace(/\/+$/, '');
    const fullPath = root + '/' + cleanRelative;
    if (!isPathWithinRoot(root, fullPath)) {
        return { ok: false, code: 'PATH_OUTSIDE_ROOT' };
    }
    return { ok: true, value: fullPath };
}

/**
 * 刪除影像前的安全驗證：必須落在來源資料夾內且無 traversal。
 */
export function validateDeletableImagePath(sourceFolderPath, relativePath) {
    return resolveSourceImagePath(sourceFolderPath, relativePath);
}

/**
 * 刪除「實體落盤檔」（live capture diskPath）前的安全驗證：
 * - 必須為絕對路徑且不含 '..' traversal 段
 * - 檔名必須與縮圖記錄的 path basename 一致（防竄改索引刪到無關檔案）
 * - 若有來源資料夾，必須落在其內
 */
export function validateDeletableDiskPath(diskPath, sourceFolderPath, expectedFilename) {
    const p = normalizePath(diskPath);
    if (!p) return { ok: false, code: 'IMAGE_PATH_REQUIRED' };
    if (!/^[a-zA-Z]:/.test(p) && p.indexOf('/') !== 0) {
        return { ok: false, code: 'IMAGE_PATH_ABSOLUTE' };
    }
    if (String(p).split('/').some((segment) => segment === '..')) {
        return { ok: false, code: 'IMAGE_PATH_TRAVERSAL' };
    }
    const base = p.split('/').pop();
    if (expectedFilename && base !== normalizePath(expectedFilename).split('/').pop()) {
        return { ok: false, code: 'PATH_OUTSIDE_ROOT' };
    }
    if (sourceFolderPath && !isPathWithinRoot(sourceFolderPath, p)) {
        return { ok: false, code: 'PATH_OUTSIDE_ROOT' };
    }
    return { ok: true, value: p };
}

/**
 * OD 對齊 P3（2026-09-22）：匯出產物（images/ 扁平佈局）再匯入的標籤回填。
 * scan 層只認「上一層資料夾名」→ images/ 下的圖會被誤標 label="images"。
 * 本函式以 dataset.json samples[].label 為真相回填（key=basename；碰撞時保守回 null）。
 * @param {Array<{path:string,label:string}>} images 後端掃描結果（原地改 label）
 * @param {Array<{image_path:string,label:string}>} samples dataset.json 樣本
 * @returns {{fixed:number, ambiguous:number}} 回填與碰撞統計
 */
export function relabelExportedImages(images, samples) {
    if (!Array.isArray(images) || !Array.isArray(samples) || samples.length === 0) {
        return { fixed: 0, ambiguous: 0 };
    }
    const byBase = new Map();
    const dup = new Set();
    samples.forEach((s) => {
        const base = normalizePath(s && s.image_path).split('/').pop();
        if (!base) return;
        if (byBase.has(base)) { dup.add(base); return; }
        byBase.set(base, (s && s.label != null) ? String(s.label) : null);
    });
    let fixed = 0;
    let ambiguous = 0;
    images.forEach((img) => {
        if (!img || img.label !== 'images') return;
        const base = normalizePath(img.path).split('/').pop();
        if (dup.has(base) || !byBase.has(base)) { ambiguous++; return; }
        const label = byBase.get(base);
        if (label != null && label !== img.label) { img.label = label; fixed++; }
    });
    return { fixed, ambiguous };
}

/**
 * OD 對齊 P3（2026-09-22）：image_path 比對鍵。
 * 全路徑一致優先；匯出→再匯入（<label>/a.jpg vs images/a.jpg）時退回 basename。
 * @returns {object|null} 命中的 sample，無則 null
 */
export function matchSampleForImage(loadedSamples, imgPath) {
    if (!Array.isArray(loadedSamples)) return null;
    const target = normalizePath(imgPath);
    let hit = loadedSamples.find((s) => normalizePath(s && s.image_path) === target);
    if (hit) return hit;
    const base = target.split('/').pop();
    if (!base) return null;
    const cands = loadedSamples.filter((s) => normalizePath(s && s.image_path).split('/').pop() === base);
    return cands.length === 1 ? cands[0] : null;
}
