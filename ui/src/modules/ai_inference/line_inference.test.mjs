/**
 * ai_inference/line_inference.test.mjs — 循線推論結果契約測試（2026-09-19 H5）
 *
 * 目的（鎖住契約）：
 *   1. 積木層：4 個循線解析積木都有 tooltip、產生器、toolbox 條目，且 statement/value 型別一致。
 *   2. i18n：新增 key 在 zh-hant / en 兩邊都存在。
 *   3. 產生器：py_ai_model_init 注入的 _ModelInference 類可通過 Python 編譯。
 *   4. 行為：以 stub interpreter 實跑 _follow_line，驗證
 *      line/offset/angle/direction/confidence 的計算，含 int8(uint8) 輸出的 /255 還原；
 *      並驗證 _detect 的同一還原路徑（原本缺漏導致 int8 模型輸出被當成 0~1 使用）。
 *
 * 執行（cwd = ui/）：node --test "src/modules/ai_inference/*.test.mjs"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

globalThis.window = globalThis;
globalThis.Blockly = {
  Blocks: {}, Msg: {},
  Python: {
    forBlock: {},
    ORDER_ATOMIC: 0, ORDER_MEMBER: 2, ORDER_FUNCTION_CALL: 3,
    valueToCode: (block, name) => (block && block.values && block.values[name]) || 'R'
  }
};
const load = (rel) => new Function(fs.readFileSync(path.join(here, rel), 'utf8'))();
load('i18n/zh-hant.js');
load('ai_inference_blocks.js');
load('ai_inference_generators.js');

const Msg = globalThis.Blockly.Msg;
const Py = globalThis.Blockly.Python.forBlock;
const NEW_BLOCKS = ['py_ai_get_line', 'py_ai_get_line_end', 'py_ai_get_line_offset', 'py_ai_get_line_angle'];
const toolbox = fs.readFileSync(path.join(here, 'toolbox.xml'), 'utf8');

const configOf = (type) => {
  const holder = {
    jsonInit: (cfg) => { holder.cfg = cfg; },
    setOutput: () => {}, setColour: () => {}, setTooltip: () => {}, setHelpUrl: () => {},
    setPreviousStatement: () => {}, setNextStatement: () => {},
    appendDummyInput: () => holder, appendValueInput: () => holder, appendStatementInput: () => holder,
    appendField: () => holder
  };
  globalThis.Blockly.Blocks[type].init.call(holder);
  return holder.cfg;
};

test('循線解析積木：tooltip / 產生器 / toolbox / i18n 齊備', () => {
  for (const type of NEW_BLOCKS) {
    const cfg = configOf(type);
    assert.ok(cfg, type + ' 缺 jsonInit 組態');
    assert.ok(typeof cfg.tooltip === 'string' && cfg.tooltip.length > 0, type + ' 缺 tooltip');
    assert.ok(typeof Py[type] === 'function', type + ' 缺 Python 產生器');
    assert.ok(toolbox.includes('block type="' + type + '"'), type + ' 未列於 toolbox.xml');
  }
  const zh = Object.keys(Msg);
  const enSrc = fs.readFileSync(path.join(here, 'i18n/en.js'), 'utf8');
  for (const key of ['AI_GET_LINE', 'AI_GET_LINE_TOOLTIP', 'AI_GET_LINE_END', 'AI_GET_LINE_END_TOOLTIP',
    'AI_LINE_END_X1', 'AI_LINE_END_Y1', 'AI_LINE_END_X2', 'AI_LINE_END_Y2',
    'AI_GET_LINE_OFFSET', 'AI_GET_LINE_OFFSET_TOOLTIP', 'AI_GET_LINE_ANGLE', 'AI_GET_LINE_ANGLE_TOOLTIP']) {
    assert.ok(zh.includes(key), 'zh-hant 缺 key: ' + key);
    assert.ok(enSrc.includes('"' + key + '"'), 'en 缺 key: ' + key);
  }
});

test('產生器輸出：value/statement 形式與欄位索引正確', () => {
  const mk = (fields, values) => ({ getFieldValue: (n) => fields[n], values: values || {}, outputConnection: true });
  const gen = { valueToCode: () => 'R', INDENT: '  ' };
  assert.deepEqual(Py['py_ai_get_line'](mk({}, {}), gen), ['R.get("line", (0.0, 0.0, 0.0, 0.0))', globalThis.Blockly.Python.ORDER_FUNCTION_CALL]);
  assert.equal(Py['py_ai_get_line_end'](mk({ END: 'x1' }), gen)[0], 'R.get("line", (0.0, 0.0, 0.0, 0.0))[0]');
  assert.equal(Py['py_ai_get_line_end'](mk({ END: 'y1' }), gen)[0], 'R.get("line", (0.0, 0.0, 0.0, 0.0))[1]');
  assert.equal(Py['py_ai_get_line_end'](mk({ END: 'x2' }), gen)[0], 'R.get("line", (0.0, 0.0, 0.0, 0.0))[2]');
  assert.equal(Py['py_ai_get_line_end'](mk({ END: 'y2' }), gen)[0], 'R.get("line", (0.0, 0.0, 0.0, 0.0))[3]');
  assert.equal(Py['py_ai_get_line_offset'](mk({}, {}), gen)[0], 'R.get("offset", 0.0)');
  assert.equal(Py['py_ai_get_line_angle'](mk({}, {}), gen)[0], 'R.get("angle", 0.0)');
});

const findPython = () => {
  const cands = [process.env.COCOYA_PYTHON, 'C:\\WPy64-31160\\python-3.11.6.amd64\\python.exe', 'python', 'python3'];
  for (const exe of cands) {
    if (!exe) continue;
    const r = spawnSync(exe, ['-c', 'import sys;print(sys.version_info[0])'], { encoding: 'utf8' });
    if (r.status === 0 && String(r.stdout).trim() === '3') return exe;
  }
  return null;
};

const PY_HARNESS = `
import sys, json, types
import numpy as np

# stub cv2：只需 resize 回傳同尺寸陣列
cv2 = types.ModuleType("cv2")
def _resize(img, size):
    return np.zeros((size[1], size[0], 3), dtype=np.uint8)
cv2.resize = _resize
sys.modules["cv2"] = cv2

class FakeInterp:
    def __init__(self, out): self.out = np.array([out])
    def set_tensor(self, idx, data): self.data = data
    def invoke(self): pass
    def get_tensor(self, idx): return self.out

def mk(out, isf=True):
    obj = object.__new__(_ModelInference)
    obj.it = FakeInterp(out)
    obj.i = [{"index": 0, "shape": [1, 224, 224, 3]}]
    obj.o = [{"index": 0}]
    obj.isf = isf
    obj.ls = ["line"]
    obj.task_type = "line_follower"
    return obj

frame = np.zeros((480, 640, 3), dtype=np.uint8)
r = {}

# 1) 浮點模型：線偏左（近端 y 較大）
res = mk([0.4, 0.9, 0.6, 0.2])._follow_line(frame)
r["f_line"] = list(res["line"])
r["f_offset"] = res["offset"]
r["f_angle"] = res["angle"]
r["f_dir"] = res["direction"]
r["f_conf"] = res["confidence"]
r["f_type"] = res["type"]

# 2) 置中直線
res = mk([0.5, 0.9, 0.5, 0.2])._follow_line(frame)
r["c_offset"] = res["offset"]; r["c_angle"] = res["angle"]; r["c_dir"] = res["direction"]

# 3) 線偏右
res = mk([0.7, 0.9, 0.5, 0.2])._follow_line(frame)
r["r_offset"] = res["offset"]; r["r_angle"] = res["angle"]; r["r_dir"] = res["direction"]

# 4) 超出範圍需裁切到 0~1
res = mk([1.2, 0.9, -0.3, 0.2])._follow_line(frame)
r["clamp_line"] = list(res["line"]); r["clamp_offset"] = res["offset"]

# 5) 無影像
res = mk([0.4, 0.9, 0.6, 0.2])._follow_line(None)
r["none_dir"] = res["direction"]; r["none_conf"] = res["confidence"]; r["none_line"] = list(res["line"])

# 6) int8(uint8) 模型：輸出需 /255 還原
res = mk([102, 230, 153, 51], isf=False)._follow_line(frame)
r["u_offset"] = res["offset"]; r["u_dir"] = res["direction"]

# 7) _detect：同一 /255 還原路徑（原缺漏）
det = mk([128, 128, 64, 64], isf=False)
det.task_type = "detector"
r["det_bbox_q"] = list(det._detect(frame)["objects"][0]["bbox"])
det2 = mk([0.5, 0.5, 0.2, 0.2], isf=True)
r["det_bbox_f"] = list(det2._detect(frame)["objects"][0]["bbox"])

print("__JSON__" + json.dumps(r))
`;

test('推論行為：_follow_line 端點/橫向偏移/角度/方向（含 int8 還原）', (t) => {
  const py = findPython();
  if (!py) { t.skip('找不到 Python 3 直譯器，略過推論行為測試'); return; }

  const gen = { valueToCode: () => 'frame', definitions_: {} };
  Py['py_ai_model_init']({
    getFieldValue: (n) => ({ MODEL_PATH: 'm.tflite', TASK_TYPE: 'line_follower', MODEL_TYPE: 'int8' }[n])
  }, gen);
  const cls = gen.definitions_['module_ai_inference'];
  assert.ok(cls && cls.includes('class _ModelInference'), 'py_ai_model_init 未注入 _ModelInference 類');
  assert.ok(cls.includes('"line"') && cls.includes('"offset"') && cls.includes('"angle"'), '_follow_line 未輸出 line/offset/angle');

  const tmp = path.join(os.tmpdir(), 'cocoya_ai_line_' + Date.now() + '.py');
  fs.writeFileSync(tmp, cls + PY_HARNESS, 'utf8');
  const res = spawnSync(py, [tmp], { encoding: 'utf8' });
  fs.unlinkSync(tmp);
  assert.equal(res.status, 0, 'Python harness 執行失敗：' + res.stderr);

  const line = String(res.stdout).split(/\r?\n/).find((l) => l.startsWith('__JSON__'));
  assert.ok(line, 'Python harness 未輸出結果：' + res.stdout);
  const r = JSON.parse(line.slice('__JSON__'.length));
  const near = (a, b, eps) => Math.abs(a - b) <= (eps === undefined ? 1e-6 : eps);

  // 1) 浮點：近端 = 端點1（y=0.9 > 0.2）
  assert.deepEqual(r.f_line, [0.4, 0.9, 0.6, 0.2]);
  assert.ok(near(r.f_offset, -0.1), 'offset 應為 -0.1，實際 ' + r.f_offset);
  assert.ok(near(r.f_angle, 15.95, 0.1), 'angle 應約 15.9 度，實際 ' + r.f_angle);
  assert.equal(r.f_dir, 'left');
  assert.equal(r.f_conf, 1.0);
  assert.equal(r.f_type, 'line_follower');
  // 2) 置中
  assert.ok(near(r.c_offset, 0.0) && near(r.c_angle, 0.0), '置中線應 offset/angle = 0');
  assert.equal(r.c_dir, 'forward');
  // 3) 偏右
  assert.ok(r.r_offset > 0.05, '偏右 offset 應 > 0.05');
  assert.ok(r.r_angle < 0, '偏右 angle 應為負（逆時針）');
  assert.equal(r.r_dir, 'right');
  // 4) 裁切
  assert.deepEqual(r.clamp_line, [1.0, 0.9, 0.0, 0.2]);
  assert.ok(near(r.clamp_offset, 0.5));
  // 5) 無影像
  assert.equal(r.none_dir, 'none');
  assert.equal(r.none_conf, 0.0);
  assert.deepEqual(r.none_line, [0.0, 0.0, 0.0, 0.0]);
  // 6) int8 還原（102/255 約 0.4 → offset 約 -0.1）
  assert.ok(near(r.u_offset, -0.1, 0.01), 'int8 輸出需 /255，實際 offset = ' + r.u_offset);
  assert.equal(r.u_dir, 'left');
  // 7) detector 同一還原路徑
  assert.ok(near(r.det_bbox_q[0], (128 - 32) / 255, 0.01), 'detector int8 需 /255，實際 x1 = ' + r.det_bbox_q[0]);
  assert.ok(near(r.det_bbox_f[0], 0.4, 1e-5), 'detector f32 x1 應為 0.4，實際 ' + r.det_bbox_f[0]);
});