/**
 * ai_inference/spatial_detector_inference.test.mjs
 * 測試 S3 步驟：Spatial Head 物件偵測即時推論解碼器
 * 驗證熱圖峰值解碼、尺寸還原、空場景置信度過濾、int8 反量化與解析積木連動。
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
    valueToCode: (block, name) => (block && block.values && block.values[name]) || 'res'
  }
};
const load = (rel) => new Function(fs.readFileSync(path.join(here, rel), 'utf8'))();
load('i18n/zh-hant.js');
load('ai_inference_blocks.js');
load('ai_inference_generators.js');

const Py = globalThis.Blockly.Python.forBlock;

const findPython = () => {
  const cands = [process.env.COCOYA_PYTHON, 'C:\\WPy64-31160\\python-3.11.6.amd64\\python.exe', 'python', 'python3'];
  for (const exe of cands) {
    if (!exe) continue;
    const r = spawnSync(exe, ['-c', 'import sys,numpy;print(sys.version_info[0])'], {
      encoding: 'utf8',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
    });
    if (r.status === 0 && String(r.stdout).trim() === '3') return exe;
  }
  return null;
};

const PY_HARNESS = `
import sys, json, types
import numpy as np

# stub cv2
cv2 = types.ModuleType("cv2")
cv2.resize = lambda img, size: np.zeros((size[1], size[0], 3), dtype=np.uint8)
cv2.cvtColor = lambda img, code: img
cv2.COLOR_BGR2RGB = 4
sys.modules["cv2"] = cv2

class FakeSpatialInterp:
    def __init__(self, hm, sz):
        self.hm = hm
        self.sz = sz
    def set_tensor(self, idx, data): pass
    def invoke(self): pass
    def get_tensor(self, idx):
        if idx == 10: return self.hm
        if idx == 20: return self.sz
        raise ValueError("Unknown idx")

def mk_spatial(hm_val, sz_val, isf=True):
    obj = object.__new__(_ModelInference)
    obj.it = FakeSpatialInterp(hm_val, sz_val)
    obj.i = [{"index": 0, "shape": [1, 224, 224, 3], "dtype": np.float32 if isf else np.uint8}]
    obj.o = [
        {"index": 10, "shape": [1, 28, 28, 1]},
        {"index": 20, "shape": [1, 28, 28, 2]}
    ]
    obj.hm_idx = 10
    obj.sz_idx = 20
    obj.isf = isf
    obj.ls = ["ball"]
    obj.task_type = "object_detection"
    return obj

frame = np.zeros((480, 640, 3), dtype=np.uint8)
r = {}

# 1. 浮點模型正樣本推論：中心在 grid (14, 14)，conf=0.95，尺寸 [0.2, 0.4]
hm = np.zeros((1, 28, 28, 1), dtype=np.float32)
hm[0, 14, 14, 0] = 0.95
sz = np.zeros((1, 28, 28, 2), dtype=np.float32)
sz[0, 14, 14, :] = [0.2, 0.4]

det = mk_spatial(hm, sz, isf=True)
res = det._detect(frame)
r["f_type"] = res["type"]
r["f_conf"] = res["confidence"]
r["f_obj_count"] = len(res["objects"])
r["f_label"] = res["objects"][0]["label"]
r["f_bbox"] = list(res["objects"][0]["bbox"])

# 2. 空場景 (負樣本)：最大 conf=0.15 < 0.3，需被抑制為空目標
hm_neg = np.full((1, 28, 28, 1), 0.15, dtype=np.float32)
sz_neg = np.full((1, 28, 28, 2), 0.2, dtype=np.float32)
res_neg = mk_spatial(hm_neg, sz_neg, isf=True)._detect(frame)
r["neg_count"] = len(res_neg["objects"])
r["neg_conf"] = res_neg["confidence"]

# 3. int8 模型：uint8 需經 /255.0 還原
hm_uint = np.zeros((1, 28, 28, 1), dtype=np.uint8)
hm_uint[0, 14, 14, 0] = 230  # 230/255 ≈ 0.902
sz_uint = np.zeros((1, 28, 28, 2), dtype=np.uint8)
sz_uint[0, 14, 14, :] = [51, 102]  # 51/255 = 0.2, 102/255 = 0.4
res_uint = mk_spatial(hm_uint, sz_uint, isf=False)._detect(frame)
r["u_conf"] = res_uint["confidence"]
r["u_bbox"] = list(res_uint["objects"][0]["bbox"])

print("__JSON__" + json.dumps(r))
`;

test('Spatial Head 物件偵測解碼器推論測試', (t) => {
  const py = findPython();
  if (!py) { t.skip('找不到 Python 3，略過'); return; }

  const gen = { valueToCode: () => 'frame', definitions_: {} };
  Py['py_ai_model_init']({
    getFieldValue: (n) => ({ MODEL_PATH: 'm.tflite', TASK_TYPE: 'object_detection', MODEL_TYPE: 'f32' }[n])
  }, gen);
  const cls = gen.definitions_['module_ai_inference'];
  assert.ok(cls.includes('Spatial Head 空間特徵解碼'), '未包含 Spatial Head 解碼代碼');

  const tmp = path.join(os.tmpdir(), 'cocoya_spatial_det_' + Date.now() + '.py');
  fs.writeFileSync(tmp, cls + PY_HARNESS, 'utf8');
  const res = spawnSync(py, [tmp], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
  });
  fs.unlinkSync(tmp);
  assert.equal(res.status, 0, 'Python harness 執行失敗：' + res.stderr);

  const line = String(res.stdout).split(/\r?\n/).find((l) => l.startsWith('__JSON__'));
  assert.ok(line, 'Python harness 未輸出結果：' + res.stdout);
  const r = JSON.parse(line.slice('__JSON__'.length));
  const near = (a, b, eps = 1e-4) => Math.abs(a - b) <= eps;

  // 1. 浮點模型正樣本
  assert.equal(r.f_type, 'object_detection');
  assert.ok(near(r.f_conf, 0.95));
  assert.equal(r.f_obj_count, 1);
  assert.equal(r.f_label, 'ball');
  // 中心 (14.5 / 28) ≈ 0.517857
  // x1 = 0.517857 - 0.2/2 = 0.417857
  // y1 = 0.517857 - 0.4/2 = 0.317857
  // x2 = 0.517857 + 0.2/2 = 0.617857
  // y2 = 0.517857 + 0.4/2 = 0.717857
  assert.ok(near(r.f_bbox[0], 0.417857));
  assert.ok(near(r.f_bbox[1], 0.317857));
  assert.ok(near(r.f_bbox[2], 0.617857));
  assert.ok(near(r.f_bbox[3], 0.717857));

  // 2. 空場景過濾
  assert.equal(r.neg_count, 0, '低於 0.3 的空場景應被過濾');
  assert.ok(near(r.neg_conf, 0.15));

  // 3. uint8 模型反量化
  assert.ok(near(r.u_conf, 230 / 255.0));
  assert.ok(near(r.u_bbox[0], 0.517857 - 0.1));
  assert.ok(near(r.u_bbox[2], 0.517857 + 0.1));
});

test('解析積木代碼生成契約', () => {
  // py_ai_get_bbox
  const blockBbox = { values: { RESULT: 'my_res' }, outputConnection: {} };
  const [bboxCode] = Py['py_ai_get_bbox'](blockBbox);
  assert.ok(bboxCode.includes('my_res.get("objects", [{}])[0].get("bbox"'), 'py_ai_get_bbox 生成錯誤');

  // py_ai_get_bbox_center
  const [centerCode] = Py['py_ai_get_bbox_center'](blockBbox);
  assert.ok(centerCode.includes('((b[0]+b[2])/2, (b[1]+b[3])/2)'), 'py_ai_get_bbox_center 生成錯誤');

  // py_ai_get_confidence
  const [confCode] = Py['py_ai_get_confidence'](blockBbox);
  assert.ok(confCode.includes('my_res.get("confidence", 0.0)'), 'py_ai_get_confidence 生成錯誤');
});
