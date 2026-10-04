/**
 * ui/modules/dataset_manager/core/labelMap.test.mjs
 * [T4 2026-10-03] labelMap 行為測試（新增；此前本模組無任何測試檔）
 *
 * 【為何新增】`core/labelMap.js` 長期無測試覆蓋，卻是 4 處標籤下拉清單的
 * 排序與 id 指派來源。本檔同時含「行為測試」與「掃描型守門」兩層：
 *   行為：sortedLabelNames / sortedLabelEntries 的實際輸出
 *   掃描：所有渲染標籤下拉的檔案都必須排序（清單式守門會漏掉未來新增的檔案）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    normalizeLabelMap, cleanLabelMap, nextLabelId,
    sortedLabelEntries, sortedLabelNames
} from './labelMap.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.join(here, '..', '..', '..');

// ── 行為測試 ──

// ── 既有函式的回歸覆蓋（本模組此前無任何測試）──

test('normalizeLabelMap：字串鍵去空白、非法 id 依序補位', () => {
    assert.deepEqual(normalizeLabelMap({ '  a  ': 0, b: 1 }), { a: 0, b: 1 });
    // 非整數或負數 → 以目前已有數量為 id
    assert.deepEqual(normalizeLabelMap({ a: -1, b: 'x' }), { a: 0, b: 1 });
});

test('cleanLabelMap：僅保留合法非負整數 id，且不重新編號', () => {
    assert.deepEqual(cleanLabelMap({ a: 5, b: -1, c: 'x', d: 2 }), { a: 5, d: 2 });
});

test('nextLabelId：回傳目前最大 id + 1；空表回 0', () => {
    assert.equal(nextLabelId({}), 0);
    assert.equal(nextLabelId({ a: 0, b: 7 }), 8);
});

test('sortedLabelNames：依字母序輸出（中文以 localeCompare 排序）', () => {
    assert.deepEqual(sortedLabelNames({ paper: 0, ball: 1, apple: 2 }),
        ['apple', 'ball', 'paper']);
});

test('sortedLabelEntries：保留 [name, id] 配對且排序', () => {
    assert.deepEqual(sortedLabelEntries({ zebra: 3, apple: 1 }),
        [['apple', 1], ['zebra', 3]]);
});

test("sortedLabelNames：數字鍵名依 localeCompare（'10' 排在 '2' 前，非數值序）", () => {
    // 這是字串排序的既定語意 —— 目的是與 classification.js 行為一致，不是數值排序
    assert.deepEqual(sortedLabelNames({ 2: 0, 10: 1 }), ['10', '2']);
});

test('sortedLabelNames：空 / 非物件輸入回空陣列（不可拋錯）', () => {
    assert.deepEqual(sortedLabelNames({}), []);
    assert.deepEqual(sortedLabelNames(null), []);
    assert.deepEqual(sortedLabelNames(undefined), []);
    assert.deepEqual(sortedLabelNames([1, 2]), [], '陣列不是合法 labelMap');
});

test('sortedLabelNames：排序不得改動 id 指派（顯示順序 ≠ 資料語意）', () => {
    const map = { paper: 7, ball: 3 };
    const entries = sortedLabelEntries(map);
    assert.equal(entries.find(([n]) => n === 'paper')[1], 7);
    assert.equal(entries.find(([n]) => n === 'ball')[1], 3);
});

test('sortedLabel*：非法 id 的鍵應被 cleanLabelMap 濾除', () => {
    assert.deepEqual(sortedLabelNames({ good: 0, bad: -1, worse: 'x' }), ['good']);
});

// ── 掃描型守門 ──

test('守門：標籤下拉的排序不得直接餵 option（須先經排序或 SSOT）', () => {
    /*
     * [T4 2026-10-03 兩度修正紀錄 —— 判準寫錯的兩種形狀]
     *   v1 只抓「同一行有 Object.keys 但無 sort」→ 跨行的排序抓不到（ui_layout 誤紅）
     *   v2 改成「整檔有 localeCompare 就算過」→ 同檔內只要有一處排序就全放行，
     *      移除 samplerPanel 的其中一處排序仍全綠（變異測試抓到）。
     * 正確判準：**逐個「label_map → 陣列」的取值點**，斷言其結果在餵給
     * option / 決定預選之前必經過排序或 SSOT。實作上以「取值賦給的變數名」
     * 追蹤，該變數在檔內必須出現於 sortedXxx(...) 呼叫或 .sort(...) 鏈中。
     */
    const dmDir = path.join(uiDir, 'modules', 'dataset_manager');
    const offenders = [];
    const scanned = [];
    (function walk(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { walk(full); continue; }
            if (!e.name.endsWith('.js') || e.name.endsWith('.test.mjs')) continue;
            const rel = path.relative(uiDir, full).replace(/\\/g, '/');
            const src = fs.readFileSync(full, 'utf8');
            if (!/label_map/.test(src) || !/<option value=/.test(src)) continue;
            scanned.push(rel);

            // 找出所有「由 label_map 直接取出陣列」的賦值點
            const lines = src.split('\n');
            lines.forEach((line, i) => {
                const code = line.replace(/\/\/.*$/, '');
                const m = code.match(/const\s+(\w+)\s*=\s*(?:Object\.(keys|entries)\([^;]*label_map|sortedLabel\w*\([^;]*label_map)/);
                if (!m) return;
                const varName = m[1];
                const alreadySorted = /sortedLabel\w*\(/.test(code);
                // 該變數是否在檔內任何地方經過排序？
                const sortedLater = new RegExp(`${varName}\\s*\\)?\\s*\\.sort\\(`).test(src)
                    || new RegExp(`${varName}\\b[^;]*sortedLabel`).test(src);
                if (!alreadySorted && !sortedLater) {
                    offenders.push(`${rel}:${i + 1} ${varName} 由 label_map 取出後未排序`);
                }
            });
        }
    })(dmDir);

    assert.ok(scanned.length >= 4,
        `應至少掃到 4 個渲染標籤下拉的檔案，實得 ${scanned.length}：${scanned.join(', ')}`);
    assert.deepEqual(offenders, [],
        '以下取值點未排序，使用者增刪標籤後下拉順序會跳動：\n' + offenders.join('\n'));
});

/*
 * 【不做的守門與原因】
 * 初版另有一條「排序邏輯只准存在於 SSOT」的掃描，但實測會誤判：
 *   - featurePanel 收到的是「已取鍵的陣列」，SSOT 的 sortedLabelNames 只吃 labelMap 物件
 *   - 故該檔必須保留陣列版排序，形成無法消除的例外
 * 與其放寬白名單（等於無效），不如**刪掉這條判準**，只保留上方
 * 「渲染標籤下拉必須排序」——那才是真不變式，且已涵蓋全部渲染處。
 */
