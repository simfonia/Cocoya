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
