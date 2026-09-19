/**
 * hardware/board_defs.test.mjs — 開發板腳位表資料契約測試（2026-09-19）
 *
 * 不變式（新增／修改任何板子都必須通過）：
 *   1. 每塊板的 pins[].ref 都必須能被 CocoyaBoard.resolveGpio 解析。否則 mcu_pin_shadow
 *      下拉選出的腳位會在產生器端變成「無法解析腳位」——同類症狀歷史上出現兩次：
 *      2026-09-18 `scrub_` 不可見標記污染（valueToCode 字串被前置 U+0001ID:xxxU+0002）、
 *      2026-09-19 microbit pins[].ref=board.pinN 但 gpioMap 僅有 PN（大小寫不一致 → 全部 miss）。
 *   2. 同一塊板內 pins[].ref 不得重複（下拉選單會出現重複項）。
 *   3. pins[].label 必須非空、tags 必須是字串陣列。
 *   4. Maker Pi RP2040 的關鍵腳位對照（依 Cytron MAKER-PI-RP2040 Datasheet Rev 1.2 Table 1）。
 *
 * 執行（cwd = ui/）：node --test "src/modules/hardware/*.test.mjs"
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

globalThis.window = globalThis;
globalThis.Blockly = { Blocks: {}, Msg: {}, Python: { forBlock: {} } };
const load = (rel) => new Function(fs.readFileSync(path.join(here, rel), 'utf8'))();
load('board_defs.js');
load('hardware_blocks.js');

const CocoyaBoard = globalThis.CocoyaBoard;
const boards = () => globalThis.window.CocoyaBoardDefs.hardware.boards;

test('每塊板的 pins[].ref 都能被 resolveGpio 解析（不變式 1）', () => {
  const failures = [];
  for (const [boardId, board] of Object.entries(boards())) {
    for (const pin of board.pins) {
      const num = CocoyaBoard.resolveGpio(boardId, pin.ref);
      if (num === null || num === undefined) failures.push(boardId + ' ' + pin.ref + ' (' + pin.label + ')');
    }
  }
  assert.deepEqual(failures, [], '以下腳位無法解析：' + failures.join(', '));
});

test('同一塊板內 pins[].ref 不重複（不變式 2）', () => {
  for (const [boardId, board] of Object.entries(boards())) {
    const refs = board.pins.map((p) => p.ref);
    assert.equal(new Set(refs).size, refs.length, boardId + ' 有重複的 ref');
  }
});

test('pins[].label 非空、tags 為字串陣列（不變式 3）', () => {
  for (const [boardId, board] of Object.entries(boards())) {
    for (const pin of board.pins) {
      assert.ok(typeof pin.label === 'string' && pin.label.length > 0, boardId + ' ' + pin.ref + ' label 為空');
      assert.ok(Array.isArray(pin.tags), boardId + ' ' + pin.ref + ' tags 非陣列');
      for (const t of pin.tags) assert.equal(typeof t, 'string', boardId + ' ' + pin.ref + ' tag 非字串');
    }
  }
});

test('maker-pi：Datasheet Rev 1.2 關鍵腳位對照（不變式 4）', () => {
  const expect = {
    // 直流馬達 M1A/M1B/M2A/M2B
    GP8: 8, GP9: 9, GP10: 10, GP11: 11,
    // RC 伺服 GP12~GP15
    GP12: 12, GP13: 13, GP14: 14, GP15: 15,
    // WS2812B RGB LED
    GP18: 18,
    // 可程式按鈕
    GP20: 20, GP21: 21,
    // Piezo 蜂鳴器
    GP22: 22,
    // Grove 埠 1~7
    GP0: 0, GP1: 1, GP2: 2, GP3: 3, GP4: 4, GP5: 5, GP6: 6, GP7: 7,
    GP16: 16, GP17: 17, GP26: 26, GP27: 27, GP28: 28,
  };
  for (const [name, num] of Object.entries(expect)) {
    assert.equal(CocoyaBoard.resolveGpio('maker-pi', 'board.' + name), num, name + ' 對照錯誤');
  }
  assert.equal(CocoyaBoard.resolveGpio('maker-pi', 'board.GP26'), 26, 'GP26 應為 ADC0');
});

test('maker-pi：下拉選項涵蓋全部 25 個腳位且 label 帶功能提示', () => {
  const opts = CocoyaBoard.pinOptions('maker-pi');
  assert.equal(opts.length, 25);
  const labels = opts.map((o) => o[0]);
  assert.ok(labels.includes('GP8 (M1A)'), '缺少馬達 M1A 提示');
  assert.ok(labels.includes('GP12 (Servo)'), '缺少伺服提示');
  assert.ok(labels.includes('GP18 (RGB LED)'), '缺少 RGB LED 提示');
  assert.ok(labels.includes('GP20 (Button 1)'), '缺少按鈕 1 提示');
  assert.ok(labels.includes('GP22 (Buzzer)'), '缺少蜂鳴器提示');
  assert.ok(labels.includes('GP26 (Grove 5/6, ADC0)'), '缺少 Grove/ADC 提示');
});

test('maker-pi：ADC 腳位具 adc tag', () => {
  const adc = boards()['maker-pi'].pins.filter((p) => p.tags.includes('adc')).map((p) => p.ref);
  assert.deepEqual(adc, ['board.GP26', 'board.GP27', 'board.GP28']);
});

test('microbit：pins[].ref（board.pinN）可解析（2026-09-19 修正的鍵值一致性）', () => {
  assert.equal(CocoyaBoard.resolveGpio('microbit', 'board.pin0'), 0);
  assert.equal(CocoyaBoard.resolveGpio('microbit', 'board.pin5'), 5);
  assert.equal(CocoyaBoard.resolveGpio('microbit', 'board.pin20'), 20);
  // 舊專案 XML 可能寫 board.P0，仍須相容
  assert.equal(CocoyaBoard.resolveGpio('microbit', 'board.P0'), 0);
});