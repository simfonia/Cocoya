import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(here, '..', '..');
const modulesRoot = path.join(srcRoot, 'modules');
const manifest = JSON.parse(fs.readFileSync(path.join(srcRoot, 'core_manifest.json'), 'utf8'));
const coreModules = manifest.modules.filter((module) => module.id.startsWith('core/'));

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
const toolboxIds = (id) => unique(idsFrom(toolboxOf(id), /<block\s+type="([^"]+)"/g));
const toolboxPlatforms = (id) => [...toolboxOf(id).matchAll(/<block\s+type="([^"]+)"[^>]*\splatform="([^"]+)"/g)];
const allCoreBlockIds = new Set(coreModules.flatMap((module) => blockIds(module.id)));

function messageKeys(source) {
  return unique([
    ...idsFrom(source, /["']([A-Z][A-Z0-9_]+)["']\s*:/g),
    ...idsFrom(source, /Msg\[['"]([A-Z][A-Z0-9_]+)['"]\]/g)
  ]);
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

test('核心積木契約：block、generator、toolbox 與 Variables 動態分類對帳', () => {
  const dynamicVariables = new Set(['py_variables_global', 'py_variables_set', 'py_variables_get', 'py_variables_del']);
  const problems = [];

  for (const module of coreModules) {
    const blocks = blockIds(module.id);
    const generators = new Set(generatorIds(module.id));
    const toolbox = new Set(toolboxIds(module.id));
    const exposed = new Set(toolbox);
    if (module.id === 'core/variables') dynamicVariables.forEach((id) => exposed.add(id));

    for (const id of blocks) {
      if (!generators.has(id)) problems.push(`${module.id}: block ${id} 缺 generator`);
      if (!exposed.has(id)) problems.push(`${module.id}: block ${id} 未公開於 toolbox 或 dynamic callback`);
    }
    for (const id of toolbox) {
      if (!allCoreBlockIds.has(id)) problems.push(`${module.id}: toolbox ${id} 未註冊 core block`);
    }
    for (const id of generators) {
      if (!blocks.includes(id)) problems.push(`${module.id}: generator ${id} 未註冊 block`);
    }

    const blocksSource = blocksOf(module.id);
    if (blocksSource.includes('itemCount_')) {
      if (!blocksSource.includes('mutationToDom')) problems.push(`${module.id}: 動態積木缺 mutationToDom`);
      if (!blocksSource.includes('domToMutation')) problems.push(`${module.id}: 動態積木缺 domToMutation`);
    }
  }

  assert.deepEqual(problems, []);
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

test('核心 toolbox 的中英文 placeholder 與顏色 key 完整', () => {
  const rootZh = messageKeys(read(path.join(srcRoot, 'zh-hant.js')));
  const rootEn = messageKeys(read(path.join(srcRoot, 'en.js')));
  const rootZhSet = new Set(rootZh);
  const rootEnSet = new Set(rootEn);
  const problems = [];

  for (const module of coreModules) {
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
