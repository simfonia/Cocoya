/**
 * ai_coco/ai_coco_generators.test.mjs — COCO 偵測積木產生器契約測試
 *
 * 目的（鎖住契約）：
 *   1. 積木層：5 積木都有 tooltip、產生器、toolbox 條目。
 *   2. i18n：新增 key 在 zh-hant / en 兩邊都存在。
 *   3. 產生器：
 *      - init 產出 ObjectDetectorOptions（VIDEO 模式＋threshold＋max_results＋timestamp 計數器）。
 *      - detect 包掉 BGR→RGB、mp.Image、timestamp 遞增、detect_for_video。
 *      - for_each_target 含雙層過濾（空 categories／null label／非目標／信心不足）＋bbox 拆解。
 *      - target_field 六欄位映射正確。
 *      - close 釋放 detector。
 *   4. 行為：以 stub 實跑產出的 for_each_target 迴圈本體，驗證過濾語意。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import cp from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PY = 'C:\\WPy64-31160\\python-3.11.6.amd64\\python.exe';

globalThis.window = globalThis;
globalThis.Blockly = {
  Blocks: {}, Msg: {},
  // 供 for_each_target init 的 FieldVariable 佔位（文字化為變數名，appendField 收集器可斷言）。
  FieldVariable: function (name) { this.name_ = name; this.toString = () => String(name); },
  Python: {
    forBlock: {},
    ORDER_ATOMIC: 0, ORDER_MEMBER: 2, ORDER_FUNCTION_CALL: 3,
    ORDER_NONE: 4, ORDER_RELATIONAL: 5,
    valueToCode: (block, name) => (block && block.values && block.values[name]) || ''
  }
};
const load = (rel) => new Function(fs.readFileSync(path.join(here, rel), 'utf8'))();
load('i18n/zh-hant.js');
load('ai_coco_blocks.js');
load('ai_coco_generators.js');

const Msg = globalThis.Blockly.Msg;
const Py = globalThis.Blockly.Python.forBlock;
const ALL_BLOCKS = ['py_ai_coco_init', 'py_ai_coco_detect', 'py_ai_coco_for_each_target', 'py_ai_coco_target_field', 'py_ai_coco_close'];
const toolbox = fs.readFileSync(path.join(here, 'toolbox.xml'), 'utf8');

const configOf = (type) => {
  const holder = {
    jsonInit: (cfg) => { holder.cfg = cfg; },
    setOutput: () => {}, setColour: () => {}, setTooltip: () => {}, setHelpUrl: () => {},
    setPreviousStatement: () => {}, setNextStatement: () => {}, setInputsInline: () => {},
    appendDummyInput: () => holder, appendValueInput: () => holder, appendStatementInput: () => holder,
    appendField: () => holder, getField: () => null
  };
  globalThis.Blockly.Blocks[type].init.call(holder);
  return holder.cfg;
};

test('COCO 積木：tooltip / 產生器 / toolbox 齊備', () => {
  for (const type of ALL_BLOCKS) {
    // for_each_target 走手動附加路線（無 jsonInit cfg），改驗 init 可執行且產生器存在
    if (type === 'py_ai_coco_for_each_target') {
      assert.ok(typeof globalThis.Blockly.Blocks[type].init === 'function', type + ' 缺 init');
    } else {
      const cfg = configOf(type);
      assert.ok(cfg, type + ' 缺 jsonInit 組態');
      assert.ok(typeof cfg.tooltip === 'string' && cfg.tooltip.length > 0, type + ' 缺 tooltip');
    }
    assert.ok(typeof Py[type] === 'function', type + ' 缺 Python 產生器');
    assert.ok(toolbox.includes('block type="' + type + '"'), type + ' 未列於 toolbox.xml');
  }
});

test('COCO i18n：新增 key 雙語系齊備', () => {
  const zh = Object.keys(Msg);
  const enSrc = fs.readFileSync(path.join(here, 'i18n/en.js'), 'utf8');
  for (const key of ['AI_COCO_INIT', 'AI_COCO_INIT_TOOLTIP', 'AI_COCO_INIT_WARNING',
    'AI_COCO_DETECT', 'AI_COCO_DETECT_TOOLTIP',
    'AI_COCO_FOR_EACH_TARGET', 'AI_COCO_FOR_EACH_TARGET_TOOLTIP',
    'AI_COCO_TARGET_FIELD', 'AI_COCO_TARGET_FIELD_TOOLTIP',
    'AI_COCO_FIELD_LABEL', 'AI_COCO_FIELD_SCORE', 'AI_COCO_FIELD_X',
    'AI_COCO_FIELD_Y', 'AI_COCO_FIELD_W', 'AI_COCO_FIELD_H',
    'AI_COCO_CLOSE', 'AI_COCO_CLOSE_TOOLTIP']) {
    assert.ok(zh.includes(key), 'zh-hant 缺 key: ' + key);
    assert.ok(enSrc.includes('"' + key + '"'), 'en 缺 key: ' + key);
  }
});

test('COCO 文案：for_each_target init 不得殘留 %1（appendField 不展開佔位）', () => {
  // 2026-10-15：appendField 會原樣顯示 %1（只有 jsonInit message0/args0 會展開），
  // 故 init 須執行期 split('%1') 三段貼上。本測試以欄位收集器重跑 init，
  // 斷言任一文字欄皆無 %1，且前後段文案皆非空（語序正確）。
  const texts = [];
  const holder = {
    appendDummyInput: () => holder,
    appendValueInput: () => ({ setCheck: () => holder }),
    appendStatementInput: () => holder,
    appendField: (t) => { texts.push(String(t)); return holder; },
    setInputsInline: () => {}, setPreviousStatement: () => {},
    setNextStatement: () => {}, setColour: () => {},
    setTooltip: () => {}, setHelpUrl: () => {}
  };
  globalThis.Blockly.Blocks['py_ai_coco_for_each_target'].init.call(holder);
  assert.ok(texts.length > 0, 'init 未貼上任何欄位');
  for (const t of texts) assert.ok(!t.includes('%1'), '文案殘留 %1：' + t);
  const joined = texts.join('');
  const msg = Msg['AI_COCO_FOR_EACH_TARGET'] || '';
  const before = msg.split('%1')[0] || '';
  const after = msg.split('%1')[1] || '';
  assert.ok(before && joined.includes(before), '前段文案遺失：' + before);
  assert.ok(after && joined.includes(after), '後段文案遺失：' + after);
});

test('init 產生器：VIDEO 模式＋threshold＋max_results＋timestamp 計數器', () => {
  const block = { getFieldValue: (n) => ({ MODEL_PATH: 'model/efficientdet_lite0.tflite', SCORE_THRESHOLD: '0.2', MAX_RESULTS: '10' }[n]) };
  const code = Py['py_ai_coco_init'](block);
  assert.match(code, /import mediapipe as mp/);
  assert.match(code, /running_mode=_coco_running_mode\.VIDEO/);
  assert.match(code, /max_results=10/);
  assert.match(code, /score_threshold=0\.2/);
  assert.match(code, /model_asset_path="model\/efficientdet_lite0\.tflite"/);
  assert.match(code, /coco_detector = _coco_object_detector\.create_from_options/);
  assert.match(code, /_coco_timestamp_ms = 0/);
});

test('init 產生器：Windows 反斜線路徑轉正斜線', () => {
  const block = { getFieldValue: (n) => ({ MODEL_PATH: 'model\\efficientdet_lite0.tflite', SCORE_THRESHOLD: '0.2', MAX_RESULTS: '10' }[n]) };
  const code = Py['py_ai_coco_init'](block);
  assert.match(code, /model_asset_path="model\/efficientdet_lite0\.tflite"/);
  assert.doesNotMatch(code, /model\\\\efficientdet/);
});

test('detect 產生器：BGR→RGB＋mp.Image＋timestamp＋detect_for_video', () => {
  const block = {
    getFieldValue: () => 'coco_result',
    values: { FRAME: 'frame' }
  };
  const gen = {
    valueToCode: (b, n) => b.values[n] || 'frame',
    nameDB_: { getName: (n) => n }
  };
  const code = Py['py_ai_coco_detect'](block, gen);
  assert.match(code, /cv2\.cvtColor\(frame, cv2\.COLOR_BGR2RGB\)/);
  assert.match(code, /mp\.Image\(\s*image_format=mp\.ImageFormat\.SRGB/s);
  assert.match(code, /_coco_timestamp_ms \+= 1/);
  assert.match(code, /coco_result = coco_detector\.detect_for_video/);
});

test('for_each_target 產生器：雙層過濾＋bbox 拆解', () => {
  const block = { getFieldValue: () => 'coco_result', values: { TARGETS: 'TARGET_OBJECTS' } };
  const gen = {
    valueToCode: (b, n) => b.values[n] || '{}',
    statementToCode: () => '',
    nameDB_: { getName: (n) => n },
    INDENT: '    '
  };
  const code = Py['py_ai_coco_for_each_target'](block, gen);
  assert.match(code, /for _coco_detection in coco_result\.detections:/);
  assert.match(code, /if len\(_coco_detection\.categories\) == 0:/);
  assert.match(code, /_coco_label is None/);
  assert.match(code, /if _coco_label not in TARGET_OBJECTS:/);
  assert.match(code, /_coco_threshold = TARGET_OBJECTS\[_coco_label\]/);
  assert.match(code, /if _coco_score < _coco_threshold:/);
  assert.match(code, /_coco_x = _coco_bbox\.origin_x/);
  assert.match(code, /_coco_h = _coco_bbox\.height/);
});

test('target_field 產生器：六欄位映射正確＋close 釋放', () => {
  const gen = {};
  const mk = (field) => ({ getFieldValue: () => field, outputConnection: true });
  const ORD = globalThis.Blockly.Python.ORDER_ATOMIC;
  assert.deepEqual(Py['py_ai_coco_target_field'](mk('label'), gen), ['_coco_label', ORD]);
  assert.deepEqual(Py['py_ai_coco_target_field'](mk('score'), gen), ['_coco_score', ORD]);
  assert.deepEqual(Py['py_ai_coco_target_field'](mk('x'), gen), ['_coco_x', ORD]);
  assert.deepEqual(Py['py_ai_coco_target_field'](mk('y'), gen), ['_coco_y', ORD]);
  assert.deepEqual(Py['py_ai_coco_target_field'](mk('w'), gen), ['_coco_w', ORD]);
  assert.deepEqual(Py['py_ai_coco_target_field'](mk('h'), gen), ['_coco_h', ORD]);
  assert.equal(Py['py_ai_coco_close'](), 'coco_detector.close()\n');
});

test('行為：for_each_target 迴圈本體過濾語意正確（python 實跑 stub）', () => {
  // 產出迴圈本體 → 以 stub detection 實跑，驗證四種跳過＋一種通過。
  // 四種跳過：空 categories／null label／非目標／低信心；通過：person/0.9。
  const block = { getFieldValue: () => 'coco_result', values: { TARGETS: 'TARGET_OBJECTS' } };
  const gen = {
    valueToCode: (b, n) => b.values[n] || '{}',
    statementToCode: () => '    seen.append((_coco_label, _coco_score, _coco_x, _coco_y, _coco_w, _coco_h))\n',
    nameDB_: { getName: (n) => n },
    INDENT: '    '
  };
  const loopSrc = Py['py_ai_coco_for_each_target'](block, gen);
  const body = 'import types\n'
    + 'seen = []\n'
    + 'coco_result = types.SimpleNamespace(detections=[\n'
    + '    types.SimpleNamespace(categories=[], bounding_box=None),\n'
    + '    types.SimpleNamespace(categories=[types.SimpleNamespace(category_name=None, score=0.9)], bounding_box=types.SimpleNamespace(origin_x=1, origin_y=2, width=3, height=4)),\n'
    + '    types.SimpleNamespace(categories=[types.SimpleNamespace(category_name="dog", score=0.9)], bounding_box=types.SimpleNamespace(origin_x=5, origin_y=6, width=7, height=8)),\n'
    + '    types.SimpleNamespace(categories=[types.SimpleNamespace(category_name="person", score=0.1)], bounding_box=types.SimpleNamespace(origin_x=9, origin_y=10, width=11, height=12)),\n'
    + '    types.SimpleNamespace(categories=[types.SimpleNamespace(category_name="person", score=0.9)], bounding_box=types.SimpleNamespace(origin_x=13, origin_y=14, width=15, height=16)),\n'
    + '])\n'
    + 'TARGET_OBJECTS = {"person": 0.5}\n'
    + loopSrc
    + 'print(repr(seen))\n';
  const tmp = fs.mkdtempSync(os.tmpdir() + '/aicoco-');
  const py = path.join(tmp, 't.py');
  fs.writeFileSync(py, body.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'));
  const r = cp.spawnSync(PY, [py], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
  });
  assert.equal(r.status, 0, 'python 實跑失敗：' + (r.stderr || ''));
  assert.ok((r.stdout || '').includes("[('person', 0.9, 13, 14, 15, 16)]"),
    '只應通過 person/0.9，其餘四種皆跳過。實際：' + r.stdout);
});
