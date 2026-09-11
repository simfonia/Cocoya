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
