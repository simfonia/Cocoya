/**
 * platform_restore.test.mjs — 「平台切換 → 積木還原」順序契約測試（2026-09-22）
 *
 * 背景（本次 bug）：模組依平台載入（core_manifest.json 的 platforms，ai_inference 僅 PC）。
 *   還原 XML 時若未先切換平台，未註冊的積木會被 Blockly 建成「空積木」（無 input／field），
 *   之後 setPlatformUI 補上產生器再產碼，就爆
 *   `ReferenceError: Input "RESULT" doesn't exist on "py_ai_get_line_end"`。
 *   實測路徑：啟動備份還原（persistence.checkAutoBackup）先 domToWorkspace 才 setPlatformUI。
 *
 * 鎖住的契約：
 *   1. CocoyaApp.ensurePlatformForXml：平台不同才切換、相同不動、無 platform 屬性/傳 null 不炸。
 *   2. CocoyaApp.checkAutoBackup：setPlatformUI 必須排在 domToWorkspace 之前。
 *   3. CocoyaApp._describeCodegenError：未註冊積木（平台不符）→ 友善訊息；其餘 → null（交回原始錯誤）。
 *
 * 執行（cwd = ui/）：node --test "src/app/*.test.mjs"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const events = [];

globalThis.window = globalThis;
globalThis.Blockly = {
  Blocks: {},
  Msg: {},
  Events: { disable() {}, enable() {} },
  dialog: { confirm: (msg, cb) => { cb(true); } },
  utils: { xml: { textToDom: () => ({ getAttribute: (n) => (n === 'platform' ? 'PC' : null) }) } },
  Xml: { domToWorkspace: () => { events.push('domToWorkspace'); } }
};
globalThis.CocoyaBridge = { send: (cmd) => { events.push('send:' + cmd); } };

// 載入受測檔案（僅定義方法，不觸發初始化）
for (const rel of ['persistence.js', 'workspace.js']) {
  new Function(fs.readFileSync(path.join(here, rel), 'utf8'))();
}

const makeApp = () => Object.assign({}, globalThis.CocoyaApp, {
  currentPlatform: 'MicroPython',
  workspace: { clear() { events.push('clear'); } },
  minimap: null,
  setPlatformUI: async function (p) { events.push('setPlatformUI:' + p); this.currentPlatform = p; },
  triggerCodeUpdate: () => { events.push('triggerCodeUpdate'); },
  setDirty: () => { events.push('setDirty'); },
  refreshMinimap: () => { events.push('refreshMinimap'); }
});

test('ensurePlatformForXml：平台不同才切換、相同不動、無 platform／null 不炸', async () => {
  const app = makeApp();

  events.length = 0;
  await app.ensurePlatformForXml({ getAttribute: () => 'PC' });
  assert.deepEqual(events, ['setPlatformUI:PC'], '平台不同應切換');

  events.length = 0;
  await app.ensurePlatformForXml({ getAttribute: () => 'PC' });
  assert.deepEqual(events, [], '平台相同不應重切');

  await app.ensurePlatformForXml({ getAttribute: () => null });
  await app.ensurePlatformForXml(null);
  assert.deepEqual(events, [], '無 platform 屬性／null 應靜默略過');
});

test('checkAutoBackup：setPlatformUI 必須先於 domToWorkspace（順序契約）', async () => {
  const app = makeApp();
  events.length = 0;

  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => { fn(); return 0; };  // 略過 800ms 延遲
  try {
    await app.checkAutoBackup('<xml platform="PC"></xml>');
    await new Promise((resolve) => setImmediate(resolve));  // 等 dialog callback 的 await 鏈
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }

  assert.deepEqual(events, [
    'setPlatformUI:PC',   // ★ 先切平台（載入該平台模組與產生器）
    'clear',
    'domToWorkspace',     // 之後才載入積木
    'triggerCodeUpdate',
    'setDirty',
    'send:clearBackup'
  ]);

  // 空備份不做事
  events.length = 0;
  await app.checkAutoBackup('   ');
  assert.deepEqual(events, []);
});

test('_describeCodegenError：未註冊積木給友善訊息，其餘交回原始錯誤', () => {
  const app = makeApp();
  globalThis.Blockly.Blocks = { py_ai_model_predict: {}, py_main: {} };
  globalThis.Blockly.Msg = { MSG_CODEGEN_UNKNOWN_BLOCK: 'UNKNOWN:%1' };
  app.workspace = {
    getAllBlocks: () => [
      { type: 'py_ai_get_line_end' },
      { type: 'py_ai_get_line_end' },      // 重複型別只列一次
      { type: 'py_ai_get_line_offset' },
      { type: 'py_ai_model_predict' }      // 已註冊 → 不列入
    ]
  };

  const missingInput = new ReferenceError('Input "RESULT" doesn\'t exist on "py_ai_get_line_end"');
  assert.equal(app._describeCodegenError(missingInput), 'UNKNOWN:py_ai_get_line_end, py_ai_get_line_offset');

  const unknownGen = new ReferenceError('Python generator does not know how to generate code for block type "py_ai_get_line_end".');
  assert.ok(app._describeCodegenError(unknownGen).startsWith('UNKNOWN:'));

  // 已註冊型別（真正的產生器契約錯誤）→ 不降噪
  assert.equal(app._describeCodegenError(new ReferenceError('Input "RESULT" doesn\'t exist on "py_ai_model_predict"')), null);
  // 無關錯誤 → 不降噪
  assert.equal(app._describeCodegenError(new Error('boom')), null);
  assert.equal(app._describeCodegenError(null), null);
});
