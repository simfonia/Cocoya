/**
 * core/typePolicy.test.mjs — 類型政策 SSOT 契約測試（M1，R3）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    isImageType, needsAnnotationCheck, needsUnclassifiedCheck,
    isClassificationType, isFeatureType, isDevType, isKnownType,
    allowedModes, projectTypes, imageTypes, devTypes, stableTypes
} from './typePolicy.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dmRoot = path.join(here, '..');

test('影像系判定：image_classification/object_detection/line_following', () => {
    assert.equal(isImageType('image_classification'), true);
    assert.equal(isImageType('object_detection'), true);
    assert.equal(isImageType('line_following'), true);
    assert.equal(isImageType('table'), false);
    assert.equal(isImageType('feature'), false);
    assert.equal(isImageType('serial'), false);
});

test('標註檢查：僅 object_detection/line_following；未分類僅 object_detection', () => {
    assert.equal(needsAnnotationCheck('object_detection'), true);
    assert.equal(needsAnnotationCheck('line_following'), true);
    assert.equal(needsAnnotationCheck('image_classification'), false);
    assert.equal(needsUnclassifiedCheck('object_detection'), true);
    assert.equal(needsUnclassifiedCheck('line_following'), false);
});

test('分類校正：僅 image_classification；開發中：serial（feature 已轉正式）', () => {
    assert.equal(isClassificationType('image_classification'), true);
    assert.equal(isClassificationType('object_detection'), false);
    assert.equal(isDevType('feature'), false);
    assert.equal(isDevType('serial'), true);
    assert.equal(isDevType('table'), false);
});

test('allowedModes：影像系 live+file，feature live+file，表格系 file；未知 fallback file', () => {
    assert.deepEqual(allowedModes('image_classification'), ['live', 'file']);
    assert.deepEqual(allowedModes('table'), ['file']);
    assert.deepEqual(allowedModes('feature'), ['live', 'file']);
    assert.deepEqual(allowedModes('serial'), ['file']);
    assert.deepEqual(allowedModes('unknown'), ['file']);
});

// ---------------------------------------------------------------------------
// 2026-10-01（P1-1）新增：單一來源不變式
// ---------------------------------------------------------------------------

test('projectTypes：為全部合法類型，且與 imageTypes ∪ devTypes ∪ {table} 吻合', () => {
    assert.deepEqual(projectTypes(),
        ['image_classification', 'object_detection', 'feature', 'serial', 'table', 'line_following']);
    assert.deepEqual(projectTypes().sort(),
        [...new Set([...imageTypes(), ...devTypes(), ...stableTypes(), 'table', 'serial'])].sort());
    for (const type of projectTypes()) assert.equal(isKnownType(type), true, `${type} 應為合法類型`);
    assert.equal(isKnownType('unknown'), false);
    assert.equal(isKnownType(''), false);
    assert.equal(isKnownType(undefined), false);
});

test('isFeatureType：僅 feature（P1-1 新增，供 spec.js feature live 豁免與 ui_layout 分流）', () => {
    assert.equal(isFeatureType('feature'), true);
    for (const other of ['image_classification', 'object_detection', 'line_following', 'table', 'serial', undefined]) {
        assert.equal(isFeatureType(other), false, `${other} 不應被視為 feature`);
    }
});

test('回傳的陣列一律是複本（呼叫端改動不得污染 SSOT）', () => {
    const a = projectTypes();
    a.push('injected');
    assert.equal(isKnownType('injected'), false, 'projectTypes() 必須回傳複本');
    const b = allowedModes('image_classification');
    b.push('injected');
    assert.deepEqual(allowedModes('image_classification'), ['live', 'file'], 'allowedModes() 必須回傳複本');
});

test('單一來源不變式：object_detection 字面量只允許出現在 typePolicy.js', () => {
    // 這是 P1-1 的驗收條件（稽核計畫 §2 P1-1）。
    // 硬編碼 `projectType === 'object_detection'` 散落各處時，新增類型或改語意必然漏改；
    // 收斂到 typePolicy 後，改類型只需動一個檔案。
    const offenders = [];
    const walk = (dir) => {
        for (const name of fs.readdirSync(dir)) {
            const full = path.join(dir, name);
            if (fs.statSync(full).isDirectory()) { walk(full); continue; }
            if (!name.endsWith('.js') || name.endsWith('.test.mjs')) continue;
            if (name === 'typePolicy.js') continue;
            fs.readFileSync(full, 'utf8').split('\n').forEach((line, i) => {
                // 先去掉行尾 \r（CRLF 檔案），否則 /^\s*(\*|\/\/).*$/ 會因結尾 \r 失配，
                // 導致純註解行沒被略過，誤報硬編碼。
                const code = line.replace(/\r$/, '').replace(/^\s*(\*|\/\/).*$/, '');
                if (/projectType\s*[!=]==?\s*'object_detection'/.test(code)
                    || /projectType\s*[!=]==?\s*'image_classification'/.test(code)
                    || /projectType\s*[!=]==?\s*'feature'/.test(code)) {
                    offenders.push(`${path.relative(dmRoot, full)}:${i + 1}`);
                }
            });
        }
    };
    walk(dmRoot);
    assert.deepEqual(offenders, [], '類型判斷須走 core/typePolicy.js，不得硬編碼');
});

test('單一來源不變式：MODE_TO_TYPES 對應表不得在他檔重複定義', () => {
    // ui_layout.js 曾自持一份 TYPE_TO_MODES_MAP（與 typePolicy 重複），已於 P1-1 移除。
    const offenders = [];
    const walk = (dir) => {
        for (const name of fs.readdirSync(dir)) {
            const full = path.join(dir, name);
            if (fs.statSync(full).isDirectory()) { walk(full); continue; }
            if (!name.endsWith('.js') || name.endsWith('.test.mjs')) continue;
            if (name === 'typePolicy.js') continue;
            if (/TYPE_TO_MODES_MAP/.test(fs.readFileSync(full, 'utf8'))) {
                offenders.push(path.relative(dmRoot, full));
            }
        }
    };
    walk(dmRoot);
    assert.deepEqual(offenders, [], 'allowed modes 對應表只允許存在於 typePolicy.js');
});
