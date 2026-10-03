/**
 * ai_inference/task_type_contract.test.mjs — task type 三處一致性守門（G1，2026-10-03）
 *
 * 病根（為什麼需要這支）：G1 發現 feature 有完整訓練模板與 sidecar 映射，
 * 卻沒有積木入口；且 py_ai_train_run 與 py_ai_model_init 各自維護一份
 * 相同的 task type 下拉清單。改一處忘一處 = 使用者選得到卻跑不動，
 * 或反之「檔案都在但沒入口」的半殘狀態。
 *
 * 本測試鎖住三處必須一致（掃描型，不依賴當初想到的範圍）：
 *   ① TASK_TYPE_OPTIONS（SSOT 下拉清單，blocks.js）
 *   ② train_model 的 script_name 分派（generators.js）
 *   ③ predict 的 task_type 分派（generators.js）
 * 新增 task type 若漏任何一處 → 立即報紅。
 *
 * 執行（cwd = ui/）：node --test "src/modules/ai_inference/*.test.mjs"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
load('i18n/en.js');
load('ai_inference_blocks.js');
load('ai_inference_generators.js');

const genSrc = fs.readFileSync(path.join(here, 'ai_inference_generators.js'), 'utf8');
const blockSrc = fs.readFileSync(path.join(here, 'ai_inference_blocks.js'), 'utf8');

// ① 從 SSOT 下拉清單取出清單（讀 TASK_TYPE_OPTIONS 定義段）
function dropdownTaskTypes() {
  const m = blockSrc.match(/const TASK_TYPE_OPTIONS = \[([\s\S]*?)\n\];/);
  assert.ok(m, '找不到 TASK_TYPE_OPTIONS 定義（SSOT 下拉清單）');
  const body = m[1];
  const values = [];
  const re = /\["AI_TASK_[A-Z_]+"\]\s*,\s*"([a-z_]+)"/g;
  let hit;
  while ((hit = re.exec(body)) !== null) values.push(hit[1]);
  return values;
}

// ② 從 train_model 分派段取出 task_type（限 script_name 那段 if/elif）
// 抓取範圍：從 classifier 分派到「不支援的任務類型」這個 else 為止，
// 不可用「第一個 script_name」當終點——那會在 classifier 就停住，
// 抓不到後面的 detector/line_following/table/feature 分派（曾因此漏判）。
function trainDispatchTaskTypes() {
  const start = genSrc.indexOf('if task_type == "image_classifier":');
  assert.ok(start !== -1, '找不到 train_model 的 task_type 分派段');
  const end = genSrc.indexOf('不支援的任務類型', start);
  assert.ok(end !== -1, '找不到 train_model 分派段的 else 終點');
  const seg = genSrc.slice(start, end);
  const out = [];
  const re = /task_type == "([a-z_]+)"/g;
  let hit;
  while ((hit = re.exec(seg)) !== null) out.push(hit[1]);
  return out;
}

// ③ 從 predict 分派段取出 task_type（允許 tuple 形式 ("table", "feature")）
function predictDispatchTaskTypes() {
  const m = genSrc.match(/def predict\(self, frame\):[\s\S]*?return \{"type": "unknown"/);
  assert.ok(m, '找不到 predict 的 task_type 分派段');
  const out = [];
  const re = /self\.task_type == "([a-z_]+)"|self\.task_type in \(([^)]*)\)/g;
  let hit;
  while ((hit = re.exec(m[0])) !== null) {
    if (hit[1]) {
      out.push(hit[1]);
    } else {
      const re2 = /"([a-z_]+)"/g;
      let h2;
      while ((h2 = re2.exec(hit[2])) !== null) out.push(h2[1]);
    }
  }
  return out;
}

test('① SSOT 下拉清單含 feature，且無重複', () => {
  const types = dropdownTaskTypes();
  assert.ok(types.includes('feature'), '下拉清單應含 feature（缺＝G1 未修）');
  assert.deepEqual([...new Set(types)], types, '下拉清單不得有重複 task type');
  // 四個既有類型不得被回歸移除
  for (const t of ['image_classifier', 'object_detection', 'line_following', 'table']) {
    assert.ok(types.includes(t), `下拉清單應保留既有類型 ${t}`);
  }
});

test('② train_model 分派涵蓋下拉清單全部 task type', () => {
  const dropdown = dropdownTaskTypes();
  const dispatch = trainDispatchTaskTypes();
  for (const t of dropdown) {
    assert.ok(dispatch.includes(t),
      `task type "${t}" 在下拉可選但 train_model 無分派（訓練會印「不支援的任務類型」）`);
  }
});

test('③ predict 分派涵蓋下拉清單全部 task type（不會落入 unknown）', () => {
  const dropdown = dropdownTaskTypes();
  const dispatch = predictDispatchTaskTypes();
  for (const t of dropdown) {
    assert.ok(dispatch.includes(t),
      `task type "${t}" 在下拉可選但 predict 無分派（會回 unknown task type）`);
  }
});

test('④ 兩處積木共用同一份 SSOT 清單（不得各自硬編碼）', () => {
  // 只針對「TASK_TYPE 欄位的下拉」，不可掃全檔 FieldDropdown([...])：
  // BACKBONE／OPTIMIZER／MODEL_OUTPUT／MODEL_TYPE 等下拉本來就該是內聯陣列
  // （它們不屬 task type 三處一致性範圍），一併掃會逼人無聲放寬斷言。
  const inlineTaskType = (blockSrc.match(
    /AI_TRAIN_FIELD_TYPE"\]\s*\)\s*\n\s*\.appendField\(new Blockly\.FieldDropdown\(\[/g) || []).length;
  assert.equal(inlineTaskType, 0,
    'TASK_TYPE 下拉仍有內聯陣列——應一律引用 TASK_TYPE_OPTIONS');
  const uses = (blockSrc.match(/FieldDropdown\(TASK_TYPE_OPTIONS\)/g) || []).length;
  assert.equal(uses, 2, 'TASK_TYPE_OPTIONS 應被訓練與推論兩處積木各引用一次');
});

test('⑤ 表格型推論不得假回傳 0.0（須明確回報未支援）', () => {
  // 病根：舊 _table_predict 回傳 {"prediction": 0.0, "confidence": 0.0}
  // → 使用者以為模型壞掉。G1 改為明確 error 回報。
  //
  // 判準必須鎖定「_table_predict 的 return 敘述」，不可比對整段或全檔：
  //   · 整段比對 → 函式內的說明註解刻意引用舊字串 {"prediction": 0.0} 記錄病根，
  //     會被判成「仍在假回傳」而永遠報紅（假紅）。
  //   · 全檔比對 → 同理，且連其他函式都會誤判。
  // 這是 AGENTS.md「契約守門禁用代理指標」的同型：判準要落在真不變式上。
  const start = genSrc.indexOf('def _table_predict');
  assert.ok(start !== -1, '找不到 _table_predict 函式本體');
  // 函式範圍終點：下一個函式定義行。此檔為字串陣列拼接寫法，
  // 每行 JS 原始碼形如  '    def predict(self, frame):\n' +，
  // 故錨點必須含前導單引號（寫 '\n    def ' 會抓不到，因為換行後先遇到的是引號）。
  const rest = genSrc.slice(start);
  const nxt = rest.indexOf("'    def ");
  const body = nxt === -1 ? rest : rest.slice(0, nxt);

  // 只取 return 敘述行
  const returnLine = body.split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith("'        return {"));
  assert.ok(returnLine, '_table_predict 找不到 return 敘述');
  assert.ok(!/"prediction":\s*0\.0/.test(returnLine),
    `_table_predict 仍回傳硬編碼 prediction 0.0：${returnLine}`);
  assert.ok(/"error":/.test(returnLine),
    '_table_predict 應改為明確的 error 回報');
  assert.ok(/not implemented yet/.test(returnLine),
    '表格型推論應回傳明確的未支援訊息');
});

test('⑥ i18n 雙語系皆有 AI_TASK_FEATURE（parity）', () => {
  const zh = globalThis.Blockly.Msg; // zh-hant 先載入
  assert.ok(typeof zh.AI_TASK_FEATURE === 'string' && zh.AI_TASK_FEATURE.length > 0,
    'zh-hant 缺 AI_TASK_FEATURE');
  // en 重新載入到乾淨物件檢查
  const saved = globalThis.Blockly.Msg;
  globalThis.Blockly.Msg = {};
  load('i18n/en.js');
  const en = globalThis.Blockly.Msg;
  globalThis.Blockly.Msg = saved;
  assert.ok(typeof en.AI_TASK_FEATURE === 'string' && en.AI_TASK_FEATURE.length > 0,
    'en 缺 AI_TASK_FEATURE');
});
// === 命名統一守門（2026-10-03）=== 
// 命名統一（classifier→image_classifier、detector→object_detection、line_follower→line_following）
// 是一次跨 20+ 檔的破壞性改名。事後驗證：任一處漏改都會在執行期才爆，
// 故以下兩測把「改名後的一致性」變成可持續生效的守門。

test('⑦ 訓練對話框（dialogs.js）的 task type 不得含已淘汰的舊名', () => {
  // 病根：ui/src/ui/dialogs.js 的 showTrainingDialog 是**第四處**獨立的
  // task type 定義，與 TASK_TYPE_OPTIONS 無關 → 改名時極易漏改。
  // 它原本就只有 3 項（classifier/detector/line_follower），不含 table/feature。
  const dialogPath = path.join(here, '..', '..', 'ui', 'dialogs.js');
  const src = fs.readFileSync(dialogPath, 'utf8');
  // 只掃該對話框的 option value（避免誤傷其他文字）
  const seg = src.slice(src.indexOf('training-task-type'),
                        src.indexOf('training-task-type') + 2000);
  for (const old of ['"classifier"', '"detector"', '"line_follower"']) {
    assert.ok(!seg.includes(old),
      `dialogs.js 訓練對話框仍含舊 task type ${old}（改名遺漏）`);
  }
  for (const t of ['"image_classifier"', '"object_detection"', '"line_following"']) {
    assert.ok(seg.includes(t), `dialogs.js 訓練對話框應含新 task type ${t}`);
  }
});

test('⑧ 訓練模板目錄與 sidecar 兩處映射一致（改名後的核心不變式）', () => {
  // 訓練模板目錄名 == task type 名（image_classifier/、object_detection/、line_following/）
  // 且 sidecar 的 task_scripts 與 script_rel 兩處映射都指向存在的檔。
  const repo = path.join(here, '..', '..', '..', '..');
  const tmplRoot = path.join(repo, 'resources', 'train_templates');

  for (const t of dropdownTaskTypes()) {
    if (t === 'serial') continue; // G2：預留未實作
    assert.ok(fs.existsSync(path.join(tmplRoot, t)),
      `train_templates/${t}/ 目錄不存在（task type 與模板目錄名不一致）`);
    assert.ok(fs.existsSync(path.join(tmplRoot, t, `${t}_train.py`)),
      `train_templates/${t}/${t}_train.py 不存在`);
  }
  // 舊目錄不得殘留
  for (const old of ['classifier', 'detector', 'line_follower']) {
    assert.ok(!fs.existsSync(path.join(tmplRoot, old)),
      `舊模板目錄 train_templates/${old}/ 仍存在（改名遺漏）`);
  }

  const sidecar = fs.readFileSync(
    path.join(repo, 'resources', 'dataset_manager', 'dataset_sidecar.py'), 'utf8');
  for (const t of dropdownTaskTypes()) {
    if (t === 'serial') continue;
    assert.ok(sidecar.includes(`"${t}": "${t}_train.py"`),
      `sidecar task_scripts 缺 ${t} 映射`);
    assert.ok(sidecar.includes(`"${t}/${t}_train.py"`),
      `sidecar script_rel 缺 ${t} 映射（遠端訓練會找不到模板）`);
  }
  // Docker 映像名刻意不參與改名（改了遠端已建映像會失效）
  assert.ok(sidecar.includes('"cocoya-train-classifier"'),
    'Docker 映像名 cocoya-train-classifier 應保留（刻意不改名）');
});