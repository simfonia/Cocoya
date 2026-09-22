/**
 * mcu_huskylens/huskylens_protocol.test.mjs — HuskyLens V1/V2 協定契約測試（2026-09-19）
 *
 * 目的（鎖住契約，防未來回歸）：
 *   1. 積木層：每個積木都有 tooltip、都有產生器、都在 toolbox 內；statement/value 形式與產生器回傳型別一致。
 *   2. 協定層：以假幀餵入注入的 Python `HuskyLens` 類，驗證 V2 RETURN_BLOCKS(0x1C)/RETURN_ARROWS(0x1D)/
 *      RETURN_ARGS(0x1A) 與 V1 RETURN_BLOCK(0x2A)/RETURN_ARROW(0x2B) 的欄位偏移解析（含 name、帶號 angle）。
 *   3. 指令層：V2 LEARN(0x22)/FORGET(0x23)/SAVE(0x24)/LOAD(0x25)/SET_NAME(0x0B) 的幀內容；V1 走守門分支回 0/無動作。
 *
 * 執行（cwd = ui/）：node --test "src/modules/mcu_huskylens/*.test.mjs"
 * Python 來源：COCOYA_PYTHON env → C:\WPy64-31160\...\python.exe → PATH 上的 python；皆無則 skip（不誤報失敗）。
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
globalThis.Blockly = { Blocks: {}, Msg: {}, Python: { forBlock: {} } };
const load = (rel) => new Function(fs.readFileSync(path.join(here, rel), 'utf8'))();
load('i18n/zh-hant.js');
load('mcu_huskylens_blocks.js');
load('mcu_huskylens_generators.js');

const Msg = globalThis.Blockly.Msg;
const Py = globalThis.Blockly.Python.forBlock;
const blockTypes = Object.keys(globalThis.Blockly.Blocks);
const toolbox = fs.readFileSync(path.join(here, 'toolbox.xml'), 'utf8');

/** 執行積木 init 並攔截 jsonInit 組態 */
const configOf = (type) => {
  const holder = { jsonInit: (cfg) => { holder.cfg = cfg; } };
  globalThis.Blockly.Blocks[type].init.call(holder);
  return holder.cfg;
};

const mkBlock = (fields, values) => ({ getFieldValue: (n) => fields[n], values: values || {} });
const mkGen = () => ({ definitions_: {}, valueToCode: (b, n) => b.values[n] || '', INDENT: '    ' });

test('每個積木都有 tooltip、產生器與 toolbox 條目', () => {
  assert.ok(blockTypes.length >= 15, 'Tier1 後應有 15 個積木，實際 ' + blockTypes.length);
  for (const type of blockTypes) {
    const cfg = configOf(type);
    assert.ok(cfg, type + ' 缺 jsonInit 組態');
    assert.ok(typeof cfg.tooltip === 'string' && cfg.tooltip.length > 0, type + ' 缺 tooltip');
    assert.ok(typeof Py[type] === 'function', type + ' 缺 Python 產生器');
    assert.ok(toolbox.includes('block type="' + type + '"'), type + ' 未列於 toolbox.xml');
  }
});

test('statement/value 形式與產生器回傳型別一致，且 V2-only 積木文案有標示', () => {
  for (const type of blockTypes) {
    const cfg = configOf(type);
    const out = Py[type](mkBlock({ ALGO: '12', FIELD: 'x', KNOWLEDGE_ID: 0, ID: 1, NAME: 'cat', HL_VERSION: 'v2', HL_BUS: 'i2c' }), mkGen());
    if (cfg.output) {
      assert.ok(Array.isArray(out), type + ' 為 value 積木，產生器須回傳 [code, order]');
    } else {
      assert.equal(typeof out, 'string', type + ' 為 statement 積木，產生器須回傳字串');
    }
  }
  const v2only = ['mcu_huskylens_set_algorithm', 'mcu_huskylens_get_name', 'mcu_huskylens_learn',
    'mcu_huskylens_forget', 'mcu_huskylens_save_knowledge', 'mcu_huskylens_load_knowledge', 'mcu_huskylens_set_name'];
  for (const type of v2only) {
    assert.ok(configOf(type).message0.includes('V2'), type + ' 文案未標示 (V2)');
    assert.ok(configOf(type).tooltip.includes('V2'), type + ' tooltip 未標示 V2');
  }
  for (const type of ['mcu_huskylens_get_box', 'mcu_huskylens_get_arrow', 'mcu_huskylens_is_detected',
    'mcu_huskylens_count', 'mcu_huskylens_get_id_at', 'mcu_huskylens_any_arrow']) {
    assert.ok(configOf(type).tooltip.includes('V1'), type + ' tooltip 未標示 V1 相容性');
  }
});

test('i18n zh-hant / en key 完全對等', () => {
  assert.ok(Object.keys(Msg).length > 0, 'i18n 未載入');
  const zh = Object.keys(Msg).sort();
  const enSrc = fs.readFileSync(path.join(here, 'i18n/en.js'), 'utf8');
  const en = [...enSrc.matchAll(/Blockly\.Msg\["([^"]+)"\]/g)].map((m) => m[1]).sort();
  assert.deepEqual(zh, en, 'zh-hant 與 en 的 key 不一致');
  for (const key of zh) assert.ok(Msg[key] !== '', key + ' 文案為空');
});

// --- 協定層行為測試：抽出注入的 Python 類，以假幀實跑 V1/V2 解析 ---

const findPython = () => {
  const cands = [process.env.COCOYA_PYTHON, 'C:\\WPy64-31160\\python-3.11.6.amd64\\python.exe', 'python', 'python3'];
  for (const exe of cands) {
    if (!exe) continue;
    const r = spawnSync(exe, ['-c', 'import sys;print(sys.version_info[0])'], { encoding: 'utf8' });
    if (r.status === 0 && String(r.stdout).trim() === '3') return exe;
  }
  return null;
};

const PY_HEAD = `
import sys, json, types, time, math
time.sleep_ms = lambda ms: None
machine = types.ModuleType('machine')
class I2C:
    def __init__(self, *a, **k): self.out = []; self.queue = []; self.idx = 0
    def writeto(self, addr, data): self.out.append(bytes(data))
    def readfrom(self, addr, n):
        if self.idx < len(self.queue):
            b = self.queue[self.idx]; self.idx += 1; return b
        return b''
class UART(I2C):
    def __init__(self, *a, **k): I2C.__init__(self, *a, **k); self.buf = b''
    def write(self, data): I2C.writeto(self, 0, data)
    def any(self): return len(self.buf)
    def read(self, n):
        b = self.buf[:n]; self.buf = self.buf[n:]; return b
machine.I2C = I2C; machine.UART = UART; machine.Pin = lambda *a, **k: None
sys.modules['machine'] = machine

def f2(cmd, algo, data):
    f = bytes([0x55, 0xAA, cmd, algo, len(data)]) + bytes(data)
    return f + bytes([sum(f) & 0xFF])

def f1(cmd, data):
    f = bytes([0x55, 0xAA, 0x11, len(data), cmd]) + bytes(data)
    return f + bytes([sum(f) & 0xFF])

def u16(v): return bytes([v & 0xFF, (v >> 8) & 0xFF])

def i16(v): return bytes([v & 0xFF, (v >> 8) & 0xFF])

r = {}
bus = I2C(); hl = HuskyLens(2, bus, 0x50)
r['v2_knock'] = list(bus.out[0])
bdata = bytes([7, 5]) + u16(123) + u16(234) + u16(50) + u16(60) + bytes([3]) + b'cat' + bytes([0])
adata = bytes([9, 2]) + u16(111) + u16(222) + i16(-30) + u16(150)
bus.queue = [f2(0x1B, 5, bytes(10)) + f2(0x1C, 5, bdata) + f2(0x1D, 12, adata)]; bus.idx = 0
hl.request_all()
r['v2_req_frame'] = list(bus.out[1])
r['v2_count'] = hl.count()
r['v2_x'] = hl.get_data(7, 'x'); r['v2_w'] = hl.get_data(7, 'width')
r['v2_name'] = hl.get_name(7); r['v2_any'] = hl.any_arrow(); r['v2_angle'] = hl.get_arrow(9, 'angle')
r['v2_length'] = hl.get_arrow(9, 'length'); r['v2_xorigin'] = hl.get_arrow(9, 'xOrigin')
r['v2_yorigin'] = hl.get_arrow(9, 'yOrigin'); r['v2_xtarget'] = hl.get_arrow(9, 'xTarget')
r['v2_level'] = hl.arrows[9]['level']
r['v2_idat0'] = hl.get_id_at(0); r['v2_idat9'] = hl.get_id_at(9); r['v2_detected'] = hl.is_detected(7)
r['v2_absent'] = hl.get_data(99, 'x'); r['v2_name_absent'] = hl.get_name(99)
bus.queue = [f2(0x1A, 0, bytes([1, 0]) + u16(12) + bytes(6))]; bus.idx = 0
r['v2_learn'] = hl.learn(); r['v2_learn_frame'] = list(bus.out[-1])
hl.forget(); r['v2_forget_frame'] = list(bus.out[-1])
hl.save_knowledge(3); r['v2_save_frame'] = list(bus.out[-1])
hl.load_knowledge(4); r['v2_load_frame'] = list(bus.out[-1])
hl.set_name(7, '\\u8c93'); r['v2_name_frame'] = list(bus.out[-1])
hl.set_algorithm(12); r['v2_algo_frame'] = list(bus.out[-1])
ub = UART(); hl2 = HuskyLens(2, ub, 0x50)
ub.buf = f2(0x1C, 5, bdata)
hl2.request_all()
r['uart_count'] = hl2.count(); r['uart_x'] = hl2.get_data(7, 'x'); r['uart_req_frame'] = list(ub.out[1])
bus1 = I2C(); hl1 = HuskyLens(1, bus1, 0x32)
b1 = u16(100) + u16(200) + u16(30) + u16(40) + u16(4)
a1 = u16(160) + u16(240) + u16(200) + u16(200) + u16(6)
bus1.queue = [f1(0x2A, b1), f1(0x2B, a1)]; bus1.idx = 0
hl1.request_all()
r['v1_count'] = hl1.count(); r['v1_x'] = hl1.get_data(4, 'x'); r['v1_h'] = hl1.get_data(4, 'height')
r['v1_name'] = hl1.get_name(4); r['v1_angle'] = hl1.get_arrow(6, 'angle'); r['v1_any'] = hl1.any_arrow()
r['v1_xorigin'] = hl1.get_arrow(6, 'xOrigin'); r['v1_yorigin'] = hl1.get_arrow(6, 'yOrigin')
r['v1_xtarget'] = hl1.get_arrow(6, 'xTarget'); r['v1_ytarget'] = hl1.get_arrow(6, 'yTarget')
r['v1_length'] = hl1.get_arrow(6, 'length'); r['v1_detected'] = hl1.is_detected(4)
r['v1_req_blocks_frame'] = list(bus1.out[0]); r['v1_req_arrows_frame'] = list(bus1.out[1])
r['v1_learn'] = hl1.learn()
# 官方協定文件範例幀（HUSKYLENS Protocol.md，RETURN_BLOCK：x=300,y=200,w=10,h=20,ID=1）
bus2 = I2C(); hl2v1 = HuskyLens(1, bus2, 0x32)
bus2.queue = [bytes([0x55, 0xAA, 0x11, 0x0A, 0x2A, 0x2C, 0x01, 0xC8, 0x00, 0x0A, 0x00, 0x14, 0x00, 0x01, 0x00, 0x58])]; bus2.idx = 0
hl2v1.request_all()
r['doc_x'] = hl2v1.get_data(1, 'x'); r['doc_y'] = hl2v1.get_data(1, 'y')
r['doc_w'] = hl2v1.get_data(1, 'width'); r['doc_h'] = hl2v1.get_data(1, 'height')
r['doc_count'] = hl2v1.count()
# checksum 損壞的幀須被丟棄
bus3 = I2C(); hl3 = HuskyLens(1, bus3, 0x32)
bad = bytearray([0x55, 0xAA, 0x11, 0x0A, 0x2A]) + b1
ck = sum(bad) & 0xFF
bad[5] = (bad[5] + 1) & 0xFF   # 破壞 data[0] 使 checksum 不符
bad.append(ck)
bus3.queue = [bytes(bad)]; bus3.idx = 0
hl3.request_all()
r['bad_count'] = hl3.count(); r['bad_frames'] = hl3.bad_frames
print('__JSON__' + json.dumps(r))
`;

test('協定層：V1/V2 假解析與指令內容', (t) => {
  const py = findPython();
  if (!py) { t.skip('找不到 Python 3 直譯器，略過協定行為測試'); return; }

  const gen = mkGen();
  Py['mcu_huskylens_init'](mkBlock({ HL_VERSION: 'v2', HL_BUS: 'i2c' }), gen);
  const hlClass = gen.definitions_['class_huskylens'];
  assert.ok(hlClass && hlClass.includes('class HuskyLens'), 'init 產生器未注入 HuskyLens 類');

  const tmp = path.join(os.tmpdir(), 'cocoya_hl_proto_' + Date.now() + '.py');
  fs.writeFileSync(tmp, hlClass + PY_HEAD, 'utf8');
  const res = spawnSync(py, [tmp], { encoding: 'utf8' });
  fs.unlinkSync(tmp);
  assert.equal(res.status, 0, 'Python harness 執行失敗：' + res.stderr);
  // 類別內部的 V1 守門訊息會混入 stdout，僅取哨兵行
  const line = String(res.stdout).split(/\r?\n/).find((l) => l.startsWith('__JSON__'));
  assert.ok(line, 'Python harness 未輸出結果：' + res.stdout);
  const r = JSON.parse(line.slice('__JSON__'.length));

  const sumOk = (f) => f.slice(0, -1).reduce((a, b) => a + b, 0) % 256 === f[f.length - 1];
  // V1 與 V2 的 checksum 皆涵蓋頭（V1: 55 AA 11 …；V2: 55 AA …）
  // V2 解析（RETURN_INFO + RETURN_BLOCKS + RETURN_ARROWS 串流）
  assert.equal(r.v2_count, 1);
  assert.equal(r.v2_x, 123);
  assert.equal(r.v2_w, 50);
  assert.equal(r.v2_name, 'cat');
  assert.equal(r.v2_any, true);
  assert.equal(r.v2_angle, -30, 'angle 須為帶號 int16（offset 6）');
  assert.equal(r.v2_length, 150, 'length 為 int16（offset 8）');
  assert.equal(r.v2_xorigin, 320, 'V2 向量起點固定 320');
  assert.equal(r.v2_yorigin, 480, 'V2 向量起點固定 480');
  assert.equal(r.v2_xtarget, 111);
  assert.equal(r.v2_level, 2, 'level 欄（offset 1）須保留');
  assert.equal(r.v2_idat0, 7);
  assert.equal(r.v2_idat9, 0);
  assert.equal(r.v2_detected, true);
  assert.equal(r.v2_absent, 0);
  assert.equal(r.v2_name_absent, '');
  // V2 指令幀：[55 AA CMD ALGO LEN ... SUM]
  assert.deepEqual(r.v2_knock.slice(0, 5), [0x55, 0xAA, 0x00, 0x00, 10]);
  assert.ok(sumOk(r.v2_knock), 'KNOCK checksum 錯誤');
  assert.deepEqual(r.v2_req_frame.slice(0, 5), [0x55, 0xAA, 0x01, 0x00, 0]);
  assert.deepEqual(r.v2_learn_frame.slice(0, 4), [0x55, 0xAA, 0x22, 0x00], 'LEARN CMD/ALGO 錯誤');
  assert.equal(r.v2_learn, 12, 'learn 須由 RETURN_ARGS arg0_int 取得學到的 ID');
  assert.equal(r.v2_forget_frame[2], 0x23);
  assert.equal(r.v2_save_frame[2], 0x24);
  assert.equal(r.v2_save_frame[5], 3, 'SAVE data[0] 須為知識庫槽號');
  assert.equal(r.v2_load_frame[2], 0x25);
  assert.equal(r.v2_load_frame[5], 4);
  assert.equal(r.v2_name_frame[2], 0x0B);
  assert.equal(r.v2_name_frame[5], 7);
  assert.deepEqual(r.v2_name_frame.slice(16, 19), [0xE8, 0xB2, 0x93], 'SET_NAME 須以 UTF-8 編碼名稱');
  assert.deepEqual(r.v2_algo_frame.slice(0, 4), [0x55, 0xAA, 0x0A, 12]);
  // V2 over UART
  assert.equal(r.uart_count, 1);
  assert.equal(r.uart_x, 123);
  assert.equal(r.uart_req_frame[2], 0x01);
  // V1 解析（55 AA 11 LEN CMD DATA SUM；BLOCK/ARROW 皆 5×int16）
  assert.equal(r.v1_count, 1);
  assert.equal(r.v1_x, 100);
  assert.equal(r.v1_h, 40);
  assert.equal(r.v1_name, '', 'V1 不支援名稱');
  assert.equal(r.v1_any, true);
  assert.equal(r.v1_detected, true, 'V1 BLOCK 的 ID 為 int16（offset 8）');
  assert.equal(r.v1_xorigin, 160);
  assert.equal(r.v1_yorigin, 240);
  assert.equal(r.v1_xtarget, 200);
  assert.equal(r.v1_ytarget, 200);
  assert.equal(r.v1_angle, 45, 'V1 無原生角度，由起點→終點換算（dx=40, dy=40 → 45°）');
  assert.equal(r.v1_length, 56, 'V1 無原生長度，由起點→終點換算（sqrt(3200)≈56）');
  assert.equal(r.v1_req_blocks_frame[4], 0x20, 'V1 幀：CMD 位於索引 4');
  assert.equal(r.v1_req_blocks_frame[2], 0x11, 'V1 幀：ADDR 固定 0x11');
  assert.equal(r.v1_req_arrows_frame[4], 0x21);
  assert.equal(r.v1_learn, 0, 'V1 learn 須走守門分支回 0');
  assert.ok(sumOk(r.v1_req_blocks_frame), 'V1 checksum 錯誤');
  // 官方文件範例幀（x=300,y=200,w=10,h=20,ID=1，checksum 0x58）
  assert.equal(r.doc_count, 1);
  assert.equal(r.doc_x, 300);
  assert.equal(r.doc_y, 200);
  assert.equal(r.doc_w, 10);
  assert.equal(r.doc_h, 20);
  // checksum 不符的幀必須被丟棄
  assert.equal(r.bad_count, 0, 'checksum 不符的幀不得寫入 blocks');
  assert.equal(r.bad_frames, 1, 'checksum 不符須累計 bad_frames');
});