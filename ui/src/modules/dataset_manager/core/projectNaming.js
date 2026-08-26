export function sanitizeProjectName(value) {
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

export function isProjectNameEqual(left, right) {
    return sanitizeProjectName(left) === sanitizeProjectName(right);
}
