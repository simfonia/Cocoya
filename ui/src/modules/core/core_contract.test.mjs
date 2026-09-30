import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(here, '..', '..');
const modulesRoot = path.join(srcRoot, 'modules');
const manifest = JSON.parse(fs.readFileSync(path.join(srcRoot, 'core_manifest.json'), 'utf8'));
// 2026-09-30 T2：守門範圍由「只查 core/」擴大到 manifest 全部模組。
// 原始動機是 P0-1（英文版缺 4 個 SPIKE 色碼鍵）與 P0-2（zh-hant 缺 Stable Mode 三鍵）
// 長期無法被攔截 —— 因為 spike／hardware／mcu_* 完全不在當時的檢查範圍內。
const targetModules = manifest.modules;
const coreModules = targetModules.filter((module) => module.id.startsWith('core/'));

const read = (file) => fs.readFileSync(file, 'utf8');
const moduleDir = (id) => path.join(modulesRoot, id);
const pureId = (id) => id.split('/').pop();
const idsFrom = (source, pattern) => [...source.matchAll(pattern)].map((match) => match[1]);
const unique = (items) => [...new Set(items)];

const sourceOf = (id, suffix) => read(path.join(moduleDir(id), pureId(id) + suffix));
const blocksOf = (id) => sourceOf(id, '_blocks.js');
const generatorsOf = (id) => sourceOf(id, '_generators.js');
const toolboxOf = (id) => read(path.join(moduleDir(id), 'toolbox.xml'));
const i18nOf = (id, lang) => read(path.join(moduleDir(id), 'i18n', lang + '.js'));

const blockIds = (id) => unique(idsFrom(blocksOf(id), /Blockly\.Blocks\[['"]([^'"]+)['"]\]/g));
const generatorIds = (id) => unique(idsFrom(generatorsOf(id), /forBlock\[['"]([^'"]+)['"]\]/g));
// toolbox 公開的積木類型。除了頂層 <block type="...">，也包含 <shadow type="...">
// ——影子積木（py_ai_point、py_ai_color、mcu_pin_shadow 等）刻意不放進 toolbox 頂層，
// 而是作為欄位的預設值出現，屬正常設計。
// 2026-09-30 補：先前只抓 <block>，導致所有影子積木被誤判為「未公開」。
const toolboxIds = (id) => unique(idsFrom(toolboxOf(id), /<(?:block|shadow)\s+type="([^"]+)"/g));
const toolboxBlockIds = (id) => unique(idsFrom(toolboxOf(id), /<block\s+type="([^"]+)"/g));
const toolboxPlatforms = (id) => [...toolboxOf(id).matchAll(/<block\s+type="([^"]+)"[^>]*\splatform="([^"]+)"/g)];
const allTargetBlockIds = new Set(targetModules.flatMap((module) => blockIds(module.id)));

function messageKeys(source) {
  return unique([
    ...idsFrom(source, /["']([A-Z][A-Z0-9_]+)["']\s*:/g),
    ...idsFrom(source, /Msg\[['"]([A-Z][A-Z0-9_]+)['"]\]/g)
  ]);
}

// 只抓「明確引用 i18n 鍵」的語法 Blockly.Msg['KEY']。
// 不可直接用 messageKeys()：它還會抓任何物件字串鍵（例如 mcu_car 的
// `self.note_map = {"C":0, "CS":1, ...}` 音符表、huskylens 產生 Python 的 'V2'），
// 套用在 blocks／generators 上會產生假陽性，把守門的可信度浪費掉。
function referencedMsgKeys(source) {
  return unique(idsFrom(source, /Msg\[['"]([A-Z][A-Z0-9_]+)['"]\]/g));
}

function toolboxMessageKeys(source) {
  return unique(idsFrom(source, /%\{BKY_([A-Z0-9_]+)\}/g));
}

function colourKeys(id) {
  return unique(idsFrom(blocksOf(id), /COLOUR_([A-Z0-9_]+)/g));
}

function themeColourKeys() {
  const themeDir = path.join(modulesRoot, 'theme_manager', 'themes');
  const keys = [];
  for (const file of fs.readdirSync(themeDir)) {
    if (!file.endsWith('.js')) continue;
    const source = read(path.join(themeDir, file));
    const match = source.match(/msgColours\s*:\s*\{([\s\S]*?)\n\s*\}/);
    if (match) keys.push(...idsFrom(match[1], /['"]([A-Z0-9_]+)['"]\s*:/g));
  }
  return unique(keys);
}

test('積木契約：block、generator、toolbox 與 Variables 動態分類對帳（全部模組）', () => {
  const dynamicVariables = new Set(['py_variables_global', 'py_variables_set', 'py_variables_get', 'py_variables_del']);
  const problems = [];

  // 2026-09-30 T2 全面化後浮現的既有情況。刻意用「列名 + 原因」的白名單，
  // 而不是放寬斷言 —— 這樣未來新增的未公開積木仍會被擋下。
  // 2026-09-30 處理結果：
  //   py_ai_draw_rect_alpha／py_ai_get_bbox_center → 已上架 toolbox，白名單清空
  //   py_ai_train_init（死碼 generator）→ 已刪除，白名單清空
  // 兩個白名單目前皆為空；保留結構供未來有已查證的設計事實時使用。
  const UNPUBLISHED_BLOCKS = new Map([]);
  const ORPHAN_GENERATORS = new Map([]);

  for (const module of targetModules) {
    const blocks = blockIds(module.id);
    const generators = new Set(generatorIds(module.id));
    const toolbox = new Set(toolboxIds(module.id));
    const exposed = new Set(toolbox);
    if (module.id === 'core/variables') dynamicVariables.forEach((id) => exposed.add(id));

    for (const id of blocks) {
      if (!generators.has(id)) problems.push(`${module.id}: block ${id} 缺 generator`);
      if (!exposed.has(id) && !UNPUBLISHED_BLOCKS.has(id)) {
        problems.push(`${module.id}: block ${id} 未公開於 toolbox 或 dynamic callback`);
      }
    }
    for (const id of toolboxBlockIds(module.id)) {
      if (!allTargetBlockIds.has(id)) problems.push(`${module.id}: toolbox ${id} 未註冊 block`);
    }
    for (const id of generators) {
      if (!blocks.includes(id) && !ORPHAN_GENERATORS.has(id)) {
        problems.push(`${module.id}: generator ${id} 未註冊 block`);
      }
    }

    const blocksSource = blocksOf(module.id);
    if (blocksSource.includes('itemCount_')) {
      if (!blocksSource.includes('mutationToDom')) problems.push(`${module.id}: 動態積木缺 mutationToDom`);
      if (!blocksSource.includes('domToMutation')) problems.push(`${module.id}: 動態積木缺 domToMutation`);
    }
  }

  assert.deepEqual(problems, []);
});
test('types 資料結構積木都有中英文 tooltip', () => {
  const source = blocksOf('core/types');
  const definitions = [
    ['py_type_list', 'TYPES_LIST_TOOLTIP'],
    ['py_type_dict', 'TYPES_DICT_TOOLTIP'],
    ['py_type_tuple', 'TYPES_TUPLE_TOOLTIP'],
    ['py_type_set', 'TYPES_SET_TOOLTIP']
  ];
  for (const [id, key] of definitions) {
    const start = source.indexOf(`Blockly.Blocks['${id}']`);
    const end = source.indexOf('\n};', start);
    assert.notEqual(start, -1, `${id} 應有 block 定義`);
    assert.notEqual(end, -1, `${id} block 定義應完整`);
    const blockSource = source.slice(start, end);
    assert.match(blockSource, /tooltip|setTooltip/, `${id} 應設定 tooltip`);
    assert.match(i18nOf('core/types', 'zh-hant'), new RegExp(`"${key}"`));
    assert.match(i18nOf('core/types', 'en'), new RegExp(`"${key}"`));
  }
});

test('核心 toolbox 平台標記只使用有效平台', () => {
  const validPlatforms = new Set(['PC', 'MicroPython']);
  const problems = [];
  for (const module of coreModules) {
    for (const match of toolboxPlatforms(module.id)) {
      if (!validPlatforms.has(match[2])) problems.push(`${module.id}: ${match[1]} 使用未知平台 ${match[2]}`);
      if (!manifest.modules.find((item) => item.id === module.id).platforms.includes(match[2])) {
        problems.push(`${module.id}: ${match[1]} 標記 ${match[2]} 超出模組平台`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('積木契約：各模組 toolbox 的中英文 placeholder 與顏色 key 完整（全部模組）', () => {
  const rootZh = messageKeys(read(path.join(srcRoot, 'zh-hant.js')));
  const rootEn = messageKeys(read(path.join(srcRoot, 'en.js')));
  const rootZhSet = new Set(rootZh);
  const rootEnSet = new Set(rootEn);
  const problems = [];

  for (const module of targetModules) {
    const zh = new Set([...rootZh, ...messageKeys(i18nOf(module.id, 'zh-hant'))]);
    const en = new Set([...rootEn, ...messageKeys(i18nOf(module.id, 'en'))]);
    for (const key of toolboxMessageKeys(toolboxOf(module.id))) {
      if (!zh.has(key)) problems.push(`${module.id}: zh-hant 缺 toolbox key ${key}`);
      if (!en.has(key)) problems.push(`${module.id}: en 缺 toolbox key ${key}`);
    }
    for (const key of colourKeys(module.id)) {
      if (!rootZhSet.has('COLOUR_' + key)) problems.push(`${module.id}: zh-hant 缺 COLOUR_${key}`);
      if (!rootEnSet.has('COLOUR_' + key)) problems.push(`${module.id}: en 缺 COLOUR_${key}`);
    }
  }

  assert.deepEqual(problems, []);
});

test('三個主題的 msgColours key 都對應核心或已註冊模組顏色', () => {
  const rootColours = messageKeys(read(path.join(srcRoot, 'zh-hant.js')))
    .filter((key) => key.startsWith('COLOUR_'))
    .map((key) => key.slice('COLOUR_'.length));
  const validKeys = new Set(rootColours);
  for (const module of manifest.modules) {
    const source = path.join(modulesRoot, module.id, pureId(module.id) + '_blocks.js');
    if (fs.existsSync(source)) colourKeys(module.id).forEach((key) => validKeys.add(key));
  }
  const unknown = themeColourKeys().filter((key) => !validKeys.has(key));
  assert.deepEqual(unknown, []);
});

// ---------------------------------------------------------------------------
// 2026-09-30 T2 新增：i18n 層級守門
//
// 這三項會攔截的缺陷都是「執行期才發現、且極難察覺」型別：
//   - 積木欄位顯示 undefined（PY_COLON／PY_EQUAL 兩個語系都沒定義）
//   - 英文介面漏字（AI_DRAW_ANGLE_ARC_TOOLTIP 英文缺、CAR_HAND_BOTH 英文缺）
//   - 切換語系後某處文案變空字串（P0-2 的 Stable Mode 三鍵只有英文有）
// ---------------------------------------------------------------------------

test('積木契約：blocks／generators 引用的 Blockly.Msg 鍵在雙語系皆有定義（全部模組）', () => {
  const rootZh = messageKeys(read(path.join(srcRoot, 'zh-hant.js')));
  const rootEn = messageKeys(read(path.join(srcRoot, 'en.js')));
  const problems = [];

  for (const module of targetModules) {
    const zh = new Set([...rootZh, ...messageKeys(i18nOf(module.id, 'zh-hant'))]);
    const en = new Set([...rootEn, ...messageKeys(i18nOf(module.id, 'en'))]);
    const sources = [blocksOf(module.id), read(path.join(moduleDir(module.id), pureId(module.id) + '_generators.js'))];
    for (const source of sources) {
      for (const key of referencedMsgKeys(source)) {
        if (!zh.has(key)) problems.push(`${module.id}: zh-hant 缺 ${key}`);
        if (!en.has(key)) problems.push(`${module.id}: en 缺 ${key}`);
      }
    }
  }

  assert.deepEqual(problems, []);
});

test('i18n 契約：根 zh-hant 與 en 的鍵集合完全相同', () => {
  // P0-3：zh-hant 獨有的 6 個 Blockly 內建鍵（由 Blockly 本體提供，非本專案文案）。
  // 實測確認 Blockly 會自行提供，因此不補進 en.js，改以白名單豁免。
  const BLOCKLY_BUILTIN = new Set([
    'BKY_NEW_VARIABLE', 'BKY_RENAME_VARIABLE', 'BKY_RENAME_VARIABLE_TITLE',
    'BKY_DELETE_VARIABLE', 'BKY_DELETE_VARIABLE_CONFIRMATION', 'BKY_VARIABLE_ALREADY_EXISTS'
  ]);
  const zh = new Set(messageKeys(read(path.join(srcRoot, 'zh-hant.js'))));
  const en = new Set(messageKeys(read(path.join(srcRoot, 'en.js'))));
  const zhOnly = [...zh].filter((key) => !en.has(key) && !BLOCKLY_BUILTIN.has(key));
  const enOnly = [...en].filter((key) => !zh.has(key));
  assert.deepEqual({ zhOnly, enOnly }, { zhOnly: [], enOnly: [] });
});

test('i18n 契約：各模組 i18n 兩語系鍵集合相同（全部模組）', () => {
  const problems = [];
  for (const module of targetModules) {
    const zh = new Set(messageKeys(i18nOf(module.id, 'zh-hant')));
    const en = new Set(messageKeys(i18nOf(module.id, 'en')));
    for (const key of zh) if (!en.has(key)) problems.push(`${module.id}: en 缺 ${key}`);
    for (const key of en) if (!zh.has(key)) problems.push(`${module.id}: zh-hant 缺 ${key}`);
  }
  assert.deepEqual(problems, []);
});
