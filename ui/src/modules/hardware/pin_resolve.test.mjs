/**
 * hardware/pin_resolve.test.mjs — 腳位解析契約測試（2026-09-18）
 *
 * 背景（Bug 鎖，症狀：產生碼出現「# [Cocoya] 無法解析腳位: board.GP0」）：
 *   ui/src/utils/generators.js 的 Blockly.Python.scrub_ 會為「所有具有 output 連線的積木」
 *   前置不可見標記 \u0001ID:<blockId>\u0002；mcu_pin_shadow 正是 output 積木，因此
 *   generator.valueToCode(block,'PIN') 取出的腳位字串會被污染成
 *   '\u0001ID:xxxx\u0002"board.GP0"'。此污染在最終輸出會被 workspace.js 清掉（肉眼不可見），
 *   但產生期間的「語意查表」（gpioMap → GPIO 號碼）會 miss → 產生錯誤註解。
 *
 * 硬化位置：hardware_blocks.js 的 CocoyaBoard.normalizePinRef（resolveGpio 統一入口）。
 *
 * 執行（cwd = ui/）：node --test "src/modules/hardware/*.test.mjs"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const TAG_START = String.fromCharCode(1);
const TAG_END = String.fromCharCode(2);
/** 模擬 utils/generators.js scrub_ 對 output 積木的注入格式 */
const scrub = (id, code) => TAG_START + 'ID:' + id + TAG_END + code;
const hasControlTag = (s) => String(s).indexOf(TAG_START) >= 0 || String(s).indexOf(TAG_END) >= 0;

// --- 以瀏覽器同等環境載入真實模組（globalThis 當 window，Blockly 以 stub 供註冊）---
globalThis.window = globalThis;
globalThis.Blockly = { Blocks: {}, Msg: {}, Python: { forBlock: {} } };
const load = (rel) => new Function(fs.readFileSync(path.join(here, rel), 'utf8'))();
load('board_defs.js');
load('hardware_blocks.js');
load('hardware_generators.js');
load('../mcu_car/mcu_car_generators.js');

const CocoyaBoard = globalThis.CocoyaBoard;
const Py = globalThis.Blockly.Python.forBlock;

/** 產生器 stub：valueToCode 直接回傳測試注入的 values */
const makeGen = () => ({
  INDENT: '  ',
  definitions_: {},
  valueToCode: (block, name) => block.values[name],
  blockToCode: () => '',
});

test('resolveGpio：乾淨輸入（既有行為不回歸）', () => {
  assert.equal(CocoyaBoard.resolveGpio('maker-pi', '"board.GP0"'), 0);
  assert.equal(CocoyaBoard.resolveGpio('maker-pi', 'board.GP26'), 26);
  assert.equal(CocoyaBoard.resolveGpio('picow', '"board.GP28"'), 28);
});

test('resolveGpio：含不可見 ID 標記仍可解析（本 bug 的鎖）', () => {
  assert.equal(CocoyaBoard.resolveGpio('maker-pi', scrub('c8xkBtn9', '"board.GP0"')), 0);
  assert.equal(CocoyaBoard.resolveGpio('maker-pi', scrub('zz1', '"board.GP26"')), 26);
  // 未選板 → 全板兜底掃描也要能命中（D10 屬 xiao-s3）
  assert.equal(CocoyaBoard.resolveGpio('', scrub('zz2', '"board.D10"')), 10);
});

test('resolveGpio：真正未知的腳位仍回 null', () => {
  assert.equal(CocoyaBoard.resolveGpio('maker-pi', '"board.XX9"'), null);
  assert.equal(CocoyaBoard.resolveGpio('maker-pi', scrub('zz3', '"board.XX9"')), null);
});

test('normalizePinRef：除標記／引號／前綴，且對乾淨輸入冪等', () => {
  assert.equal(CocoyaBoard.normalizePinRef(scrub('abc', '"board.GP0"')), 'GP0');
  assert.equal(CocoyaBoard.normalizePinRef('board.GP0'), 'GP0');
  assert.equal(CocoyaBoard.normalizePinRef('"LED"'), 'LED');
  assert.equal(CocoyaBoard.normalizePinRef(scrub('abc', 'GP0')), 'GP0');
});

test('generator mcu_digital_write：污染輸入仍產生正確硬體碼', () => {
  CocoyaBoard.setCurrent('maker-pi', 'workspace');
  const gen = makeGen();
  const out = Py['mcu_digital_write'](
    { type: 'mcu_digital_write', values: { PIN: scrub('pinBlk', '"board.GP0"') }, getFieldValue: () => 'True' },
    gen
  );
  assert.match(out, /^pin_0\.value\(/);
  assert.doesNotMatch(out, /無法解析腳位/);
  assert.equal(gen.definitions_['init_pin_0'], 'pin_0 = machine.Pin(0, machine.Pin.OUT)');
});

test('generator mcu_analog_read：污染輸入解析為 adc_26', () => {
  CocoyaBoard.setCurrent('maker-pi', 'workspace');
  const gen = makeGen();
  const out = Py['mcu_analog_read'](
    { type: 'mcu_analog_read', values: { PIN: scrub('adcBlk', '"board.GP26"') } },
    gen
  );
  assert.deepEqual(out, ['adc_26.read_u16()', out[1]]);
  assert.equal(gen.definitions_['init_adc_26'], 'adc_26 = machine.ADC(machine.Pin(26))');
});

test('generator mcu_pwm_write：污染輸入解析為 pwm_0', () => {
  CocoyaBoard.setCurrent('maker-pi', 'workspace');
  const gen = makeGen();
  const out = Py['mcu_pwm_write'](
    { type: 'mcu_pwm_write', values: { PIN: scrub('pwmBlk', '"board.GP0"'), VALUE: '50' }, getFieldValue: () => 'True' },
    gen
  );
  assert.match(out, /^pwm_0\.duty_u16\(/);
  assert.equal(gen.definitions_['init_pwm_0'], 'pwm_0 = machine.PWM(machine.Pin(0), freq=5000)');
});

test('錯誤註解：不含不可見標記，且帶出目前開發板名稱', () => {
  CocoyaBoard.setCurrent('maker-pi', 'workspace');
  const gen = makeGen();
  const out = Py['mcu_digital_write'](
    { type: 'mcu_digital_write', values: { PIN: scrub('bad', '"board.XX9"') }, getFieldValue: () => 'False' },
    gen
  );
  assert.match(out, /無法解析腳位: XX9/);
  assert.match(out, /目前開發板: Maker Pi RP2040/);
  assert.equal(hasControlTag(out), false, '錯誤訊息不應殘留 U+0001/U+0002 標記');
});

test('mcu_car：錯誤註解同樣去污並帶出開發板名稱', () => {
  CocoyaBoard.setCurrent('maker-pi', 'workspace');
  const gen = makeGen();
  const out = Py['mcu_car_button_pressed'](
    { type: 'mcu_car_button_pressed', getFieldValue: () => scrub('badCar', 'board.XX9') },
    gen
  );
  assert.match(out, /無法解析腳位: XX9/);
  assert.match(out, /目前開發板: Maker Pi RP2040/);
  assert.equal(hasControlTag(out), false, 'mcu_car 錯誤訊息不應殘留標記');
});