import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeProjectName,
    validateProjectName,
    normalizePath,
    isPathWithinRoot,
    buildCanonicalDatasetFilePath,
    buildCanonicalDatasetDirectoryPath,
    resolveSourceImagePath,
    validateDeletableImagePath
} from './pathPolicy.js';

test('normalizeProjectName cleans whitespace and illegal chars', () => {
    assert.equal(normalizeProjectName('  My Data!  '), 'My_Data');
    assert.equal(normalizeProjectName('***'), 'dataset');
    assert.equal(normalizeProjectName('', undefined), 'dataset');
});

test('validateProjectName rejects empty, dot and illegal names', () => {
    assert.equal(validateProjectName('').ok, false);
    assert.equal(validateProjectName('.').ok, false);
    assert.equal(validateProjectName('..').ok, false);
    assert.equal(validateProjectName('a/b').ok, false);
    const okResult = validateProjectName('my_set-1');
    assert.ok(okResult.ok);
    assert.equal(okResult.value, 'my_set-1');
});

test('normalizePath converts backslashes', () => {
    assert.equal(normalizePath('C:\\Workspace\\proj'), 'C:/Workspace/proj');
});

test('isPathWithinRoot containment semantics', () => {
    assert.ok(isPathWithinRoot('C:/proj', 'C:/proj'));
    assert.ok(isPathWithinRoot('C:/proj', 'C:/proj/sub/a.jpg'));
    assert.ok(!isPathWithinRoot('C:/proj', 'C:/project/a.jpg'));
    assert.ok(isPathWithinRoot('C:/proj/', 'C:/proj/sub/a.jpg'));
});

test('buildCanonicalDatasetFilePath follows <root>/dataset/<name>/dataset.json contract', () => {
    const result = buildCanonicalDatasetFilePath('C:/Workspace/proj', 'hand_data');
    assert.ok(result.ok);
    assert.equal(result.value, 'C:/Workspace/proj/dataset/hand_data/dataset.json');
});

test('buildCanonicalDatasetFilePath rejects missing root or invalid name', () => {
    assert.equal(buildCanonicalDatasetFilePath('', 'x').code, 'PROJECT_ROOT_REQUIRED');
    assert.equal(buildCanonicalDatasetFilePath('C:/p', '../evil').code, 'PROJECT_NAME_INVALID');
});

test('buildCanonicalDatasetDirectoryPath normalizes trailing slash of root', () => {
    const result = buildCanonicalDatasetDirectoryPath('C:/proj/', 'ds');
    assert.equal(result.value, 'C:/proj/dataset/ds');
});

test('resolveSourceImagePath accepts normal relative paths', () => {
    const result = resolveSourceImagePath('C:/data/source', 'cats/cat_01.jpg');
    assert.ok(result.ok);
    assert.equal(result.value, 'C:/data/source/cats/cat_01.jpg');
});

test('resolveSourceImagePath handles backslash input from legacy state', () => {
    const result = resolveSourceImagePath('C:\\data\\source', 'cats\\cat_01.jpg');
    assert.ok(result.ok);
    assert.equal(result.value, 'C:/data/source/cats/cat_01.jpg');
});

test('resolveSourceImagePath rejects absolute, traversal and empty inputs', () => {
    assert.equal(resolveSourceImagePath('C:/src', '').code, 'IMAGE_PATH_REQUIRED');
    assert.equal(resolveSourceImagePath('', 'a.jpg').code, 'SOURCE_FOLDER_REQUIRED');
    assert.equal(resolveSourceImagePath('C:/src', 'C:/evil/a.jpg').code, 'IMAGE_PATH_ABSOLUTE');
    assert.equal(resolveSourceImagePath('C:/src', '/evil/a.jpg').code, 'IMAGE_PATH_ABSOLUTE');
    assert.equal(resolveSourceImagePath('C:/src', '../evil/a.jpg').code, 'IMAGE_PATH_TRAVERSAL');
    assert.equal(resolveSourceImagePath('C:/src', '..\\evil\\a.jpg').code, 'IMAGE_PATH_TRAVERSAL');
    assert.equal(resolveSourceImagePath('C:/src', 'sub/../../out.jpg').code, 'IMAGE_PATH_TRAVERSAL');
});

test('validateDeletableImagePath mirrors resolveSourceImagePath', () => {
    assert.equal(
        validateDeletableImagePath('C:/src', 'a/b.jpg').value,
        resolveSourceImagePath('C:/src', 'a/b.jpg').value
    );
});

