// mcu_huskylens_generators.js
// V1/V2 通用版（2026-09-19，V1 協定於同日依官方文件更正）
// - V1（HuskyLens 1）：I2C 裝置位址 0x32，幀 = 55 AA + ADDR(固定 0x11) + LEN + CMD + DATA + SUM，
//   SUM = 全幀（含 0x55 0xAA）和取低位元組；
//   REQUEST_BLOCKS=0x20 / REQUEST_ARROWS=0x21、RETURN INFO/BLOCK/ARROW=0x29/0x2A/0x2B；
//   BLOCK 與 ARROW 皆為 5×int16（RETURN_BLOCK: x,y,w,h,ID；RETURN_ARROW: xOrigin,yOrigin,xTarget,yTarget,ID）。
//   來源：官方 HuskyLens/HUSKYLENSArduino「HUSKYLENS Protocol.md」(v0.5.1)、HuskyLensProtocolCore.c、
//         HUSKYLENS.h（PROTOCOL_CREATE(ReturnBlock/ReturnArrow, FiveInt16, …)）。
// - V2（HuskyLens 2）：I2C 位址 0x50 或 UART，幀 = 55 AA + CMD + AlgoID + LEN + DATA + SUM
//   （SUM = 除 checksum 外全幀和 mod 256，依 DFRobot ProtocolV2.cpp）；
//   KNOCK=0x00 / GET_RESULT=0x01 / SET_ALGORITHM=0x0A、RETURN 0x1A/0x1B/0x1C/0x1D。
//   來源：DFRobot_HuskyLensV2 HuskyLens2_Protocol.md（V0.2, 2025-11-26）、Result.h/Result.cpp。
//   注意：ARROW 欄位為 ID(1) + level(1) + xTarget(2) + yTarget(2) + angle(2, 帶號) + length(2)，
//   總長 10；協定文件表格「angle offset 6 長 2、length offset 7」的 offset 7 為筆誤（官方 Result.cpp
//   的 union 佈局為 2/4/6/8，length 實為 offset 8）。
// V1 無原生 angle/length 欄位 → 由 Cocoya 以起點/終點換算（與 V2 語意對齊：0° = 正前方、順時針為正）。
// 鐵律：注入的 Python 輔助類以基準 4 空白縮排，交由全域縮放器處理。

Blockly.Python.forBlock['mcu_huskylens_init'] = function(block, generator) {
  generator.definitions_['import_machine'] = 'import machine';
  generator.definitions_['import_time'] = 'import time';
  generator.definitions_['import_math'] = 'import math';

  var version = block.getFieldValue('HL_VERSION'); // 'v1' | 'v2'
  var bus = block.getFieldValue('HL_BUS');         // 'i2c' | 'uart'
  var isV2 = version === 'v2';
  var addr = isV2 ? 0x50 : 0x32;

  var HL_CLASS = `
class HuskyLens:
    def __init__(self, version, bus, addr):
        self.version = version          # 1 或 2
        self.bus = bus                  # machine.I2C 或 machine.UART
        self.addr = addr                # V1=0x32, V2=0x50（僅 I2C 用）
        self.blocks = {}
        self.arrows = {}
        self.bad_frames = 0             # checksum 不符而丟棄的幀數（除錯用）
        if self.version == 2:
            self._send_v2(0x00, 0, bytes([0]) + bytes(9))  # KNOCK

    def _write(self, data):
        try:
            if isinstance(self.bus, machine.UART):
                self.bus.write(data)
            else:
                self.bus.writeto(self.addr, data)
            return True
        except Exception as e:
            print("HL write error:", e)
            return False

    def _read_some(self, wait_ms=60):
        try:
            if isinstance(self.bus, machine.UART):
                time.sleep_ms(wait_ms)
                n = self.bus.any()
                if n:
                    return self.bus.read(n)
                return b""
            time.sleep_ms(wait_ms)
            return self.bus.readfrom(self.addr, 128)
        except Exception as e:
            print("HL read error:", e)
            return b""

    def _send_v2(self, cmd, algo, data=b""):
        frame = bytes([0x55, 0xAA, cmd, algo, len(data)]) + bytes(data)
        frame += bytes([sum(frame) & 0xFF])
        return self._write(frame)

    def _send_v1(self, cmd, data=b""):
        # V1 幀：55 AA + ADDR(0x11) + LEN + CMD + DATA + SUM（SUM 含 0x55 0xAA 全幀和取低位元組）
        frame = bytes([0x55, 0xAA, 0x11, len(data), cmd]) + bytes(data)
        frame += bytes([sum(frame) & 0xFF])
        return self._write(frame)

    def _ck(self, buf, start, tail):
        # tail = checksum 所在索引；SUM 涵蓋 [start, tail) 所有位元組（含 0x55 0xAA）
        s = 0
        for i in range(start, tail):
            s += buf[i]
        return (s & 0xFF) == buf[tail]

    def _parse(self, buf):
        # 逐幀掃描並驗證 checksum；V2: 55 AA CMD ALGO LEN…、V1: 55 AA 11 LEN CMD…
        i = 0
        n = len(buf)
        while i + 6 <= n:
            if buf[i] == 0x55 and buf[i + 1] == 0xAA:
                if self.version == 2:
                    length = buf[i + 4]
                    cmd = buf[i + 2]
                else:
                    length = buf[i + 3]
                    cmd = buf[i + 4]
                dstart = i + 5
                tail = dstart + length          # checksum 索引
                if length > 120 or tail >= n:
                    i += 1
                    continue
                if not self._ck(buf, i, tail):
                    self.bad_frames += 1
                    i += 1
                    continue
                if self.version == 2:
                    self._on_v2(cmd, buf[dstart:tail])
                else:
                    self._on_v1(cmd, buf[dstart:tail])
                i = tail + 1
            else:
                i += 1

    def _u16(self, d, off):
        return d[off] | (d[off + 1] << 8)

    def _i16(self, d, off):
        v = d[off] | (d[off + 1] << 8)
        return v - 65536 if v > 32767 else v

    def _on_v2(self, cmd, data):
        if cmd == 0x1C and len(data) >= 10:  # RETURN_BLOCK
            oid = data[0]
            name = ""
            try:
                nl = data[10]
                name = bytes(data[11:11 + nl]).decode("utf-8")
            except Exception:
                name = ""
            self.blocks[oid] = {
                "x": self._u16(data, 2),
                "y": self._u16(data, 4),
                "width": self._u16(data, 6),
                "height": self._u16(data, 8),
                "name": name,
            }
        elif cmd == 0x1D and len(data) >= 10:  # RETURN_ARROW
            oid = data[0]
            self.arrows[oid] = {
                "level": data[1],
                "xOrigin": 320,                     # V2 向量起點固定為畫面下緣中點（640x480）
                "yOrigin": 480,
                "xTarget": self._u16(data, 2),
                "yTarget": self._u16(data, 4),
                "angle": self._i16(data, 6),
                "length": self._u16(data, 8),
            }

    def _on_v1(self, cmd, data):
        # V1 的 BLOCK/ARROW 皆為 5×int16（官方 HUSKYLENS.h：FiveInt16）
        if cmd == 0x2A and len(data) >= 10:  # RETURN_BLOCK: x, y, width, height, ID
            oid = self._u16(data, 8)
            self.blocks[oid] = {
                "x": self._u16(data, 0),
                "y": self._u16(data, 2),
                "width": self._u16(data, 4),
                "height": self._u16(data, 6),
                "name": "",
            }
        elif cmd == 0x2B and len(data) >= 10:  # RETURN_ARROW: xOrigin, yOrigin, xTarget, yTarget, ID
            oid = self._u16(data, 8)
            xo = self._u16(data, 0)
            yo = self._u16(data, 2)
            xt = self._u16(data, 4)
            yt = self._u16(data, 6)
            dx = xt - xo
            dy = yo - yt  # 畫面 y 向下遞增，換算為「向上為正」
            ang = 0
            ln = 0
            try:
                # 防禦：若運行環境缺 math（或未經 init 積木注入 import math），僅退為 0 而不中斷解析
                ang = int(math.degrees(math.atan2(dx, dy)))
                ln = int(math.sqrt(dx * dx + dy * dy))
            except Exception:
                ang = 0
                ln = 0
            self.arrows[oid] = {
                "level": 1,
                "xOrigin": xo,
                "yOrigin": yo,
                "xTarget": xt,
                "yTarget": yt,
                "angle": ang,
                "length": ln,
            }

    def set_algorithm(self, algo):
        # V1 官方協定亦有 REQUEST_ALGORITHM(0x2D)，但 Cocoya 目前僅實作 V2（列 backlog）；
        # V1 演算法編號與 V2 不同，混用會切錯演算法。
        if self.version == 2:
            self._send_v2(0x0A, algo, bytes(10))
            self._read_some(50)
        else:
            print("HL V1: Cocoya 尚未實作遠端切換，請在 HuskyLens 螢幕上切換演算法")

    def request_all(self):
        self.blocks = {}
        self.arrows = {}
        self.bad_frames = 0
        try:
            if self.version == 2:
                self._send_v2(0x01, 0)  # GET_RESULT
                self._parse(bytes(self._read_some(80)))
            else:
                self._send_v1(0x20)  # REQUEST_BLOCKS
                self._parse(bytes(self._read_some(60)))
                self._send_v1(0x21)  # REQUEST_ARROWS
                self._parse(bytes(self._read_some(60)))
        except Exception as e:
            print("HuskyLens Error:", e)

    def get_data(self, obj_id, field):
        b = self.blocks.get(obj_id)
        return b.get(field, 0) if b else 0

    def get_arrow(self, obj_id, field):
        a = self.arrows.get(obj_id)
        return a.get(field, 0) if a else 0

    def is_detected(self, obj_id):
        return obj_id in self.blocks

    def any_arrow(self):
        return len(self.arrows) > 0

    def count(self):
        return len(self.blocks)

    def get_id_at(self, index):
        keys = sorted(self.blocks.keys())
        if 0 <= index < len(keys):
            return keys[index]
        return 0

    def get_name(self, obj_id):
        b = self.blocks.get(obj_id)
        return b.get("name", "") if b else ""

    def learn(self, algo=0):
        # V2 only（LEARN 0x22，無 data）；回傳學到的 ID（RETURN_ARGS arg0_int）
        # V1 官方協定有 REQUEST_LEARN(0x36, 帶 ID)，但 Cocoya 目前僅實作 V2（backlog）。
        if self.version != 2:
            print("HL V1: Cocoya 尚未實作程式學習，請在 HuskyLens 螢幕上學習")
            return 0
        self._send_v2(0x22, algo)
        return self._args_id(bytes(self._read_some(400)))

    def forget(self, algo=0):
        # V2 only（FORGET 0x23，無 data；忘記目前演算法的所有學習結果）
        if self.version != 2:
            print("HL V1: Cocoya 尚未實作程式忘記，請在 HuskyLens 螢幕上操作")
            return
        self._send_v2(0x23, algo)
        self._read_some(200)

    def save_knowledge(self, kid, algo=0):
        # V2 only（SAVE_KNOWLEDGES 0x24，data=槽號+9 零值）；V1 無知識庫槽概念
        if self.version != 2:
            print("HL V1: 不支援知識庫槽（V1 無此協定）")
            return
        self._send_v2(0x24, algo, bytes([kid]) + bytes(9))
        self._read_some(300)

    def load_knowledge(self, kid, algo=0):
        # V2 only（LOAD_KNOWLEDGES 0x25）；V1 無知識庫槽概念
        if self.version != 2:
            print("HL V1: 不支援知識庫槽（V1 無此協定）")
            return
        self._send_v2(0x25, algo, bytes([kid]) + bytes(9))
        self._read_some(300)

    def set_name(self, obj_id, name, algo=0):
        # V2 only（SET_NAME_BY_ID 0x0B，data=ID+9 零值+名稱長度+名稱 UTF-8）
        if self.version != 2:
            print("HL V1: 不支援設定名稱")
            return
        nb = name.encode("utf-8")
        self._send_v2(0x0B, algo, bytes([obj_id]) + bytes(9) + bytes([len(nb)]) + nb)
        self._read_some(200)

    def _args_id(self, buf):
        # 從 RETURN_ARGS(0x1A) 幀取 arg0_int（data offset 2~3）
        i = 0
        n = len(buf)
        while i < n - 5:
            if buf[i] == 0x55 and buf[i + 1] == 0xAA:
                length = buf[i + 4]
                end = i + 5 + length
                if end >= n:
                    break
                if buf[i + 2] == 0x1A and end - (i + 5) >= 4:
                    return self._u16(buf, i + 7)
                i = end + 1
            else:
                i += 1
        return 0
`;
  generator.definitions_['class_huskylens'] = HL_CLASS;


  var setup = '# Initialize HuskyLens ' + (isV2 ? 'V2' : 'V1') + ' (' + bus + ')\n';
  setup += "if 'husky' not in globals():\n    try:\n";
  if (bus === 'i2c') {
    setup += '        husky_i2c = machine.I2C(0, scl=machine.Pin(5), sda=machine.Pin(4), freq=100000)\n';
    setup += "        globals()['husky'] = HuskyLens(" + (isV2 ? '2' : '1') + ', husky_i2c, ' + addr + ')\n';
  } else {
    // UART：預設 RP2040 UART0（GP0=TX / GP1=RX）；XIAO 請改 UART1（D6=TX / D7=RX）
    setup += '        husky_uart = machine.UART(0, baudrate=9600, tx=machine.Pin(0), rx=machine.Pin(1))\n';
    setup += "        globals()['husky'] = HuskyLens(" + (isV2 ? '2' : '1') + ', husky_uart, ' + addr + ')\n';
  }
  setup += '    except Exception as e:\n        print("HuskyLens Init Failed:", e)\n';
  setup += "if 'husky' in globals(): husky = globals()['husky']\n";
  return setup;
};

Blockly.Python.forBlock['mcu_huskylens_request'] = function(block, generator) {
  return 'if "husky" in globals(): husky.request_all()\n';
};

Blockly.Python.forBlock['mcu_huskylens_set_algorithm'] = function(block, generator) {
  var algo = block.getFieldValue('ALGO');
  return 'if "husky" in globals(): husky.set_algorithm(' + algo + ')\n';
};

Blockly.Python.forBlock['mcu_huskylens_get_box'] = function(block, generator) {
  var id = generator.valueToCode(block, 'ID', Blockly.Python.ORDER_ATOMIC) || '1';
  var field = block.getFieldValue('FIELD');
  return ['husky.get_data(' + id + ', "' + field + '")', Blockly.Python.ORDER_ATOMIC];
};

Blockly.Python.forBlock['mcu_huskylens_get_arrow'] = function(block, generator) {
  var id = generator.valueToCode(block, 'ID', Blockly.Python.ORDER_ATOMIC) || '1';
  var field = block.getFieldValue('FIELD');
  return ['husky.get_arrow(' + id + ', "' + field + '")', Blockly.Python.ORDER_ATOMIC];
};

Blockly.Python.forBlock['mcu_huskylens_is_detected'] = function(block, generator) {
  var id = generator.valueToCode(block, 'ID', Blockly.Python.ORDER_ATOMIC) || '1';
  return ['husky.is_detected(' + id + ')', Blockly.Python.ORDER_ATOMIC];
};

Blockly.Python.forBlock['mcu_huskylens_count'] = function(block, generator) {
  return ['husky.count()', Blockly.Python.ORDER_ATOMIC];
};

Blockly.Python.forBlock['mcu_huskylens_get_id_at'] = function(block, generator) {
  var n = generator.valueToCode(block, 'N', Blockly.Python.ORDER_ATOMIC) || '0';
  return ['husky.get_id_at(' + n + ')', Blockly.Python.ORDER_ATOMIC];
};

Blockly.Python.forBlock['mcu_huskylens_get_name'] = function(block, generator) {
  var id = generator.valueToCode(block, 'ID', Blockly.Python.ORDER_ATOMIC) || '1';
  return ['husky.get_name(' + id + ')', Blockly.Python.ORDER_ATOMIC];
};

Blockly.Python.forBlock['mcu_huskylens_any_arrow'] = function(block, generator) {
  return ['husky.any_arrow()', Blockly.Python.ORDER_ATOMIC];
};

Blockly.Python.forBlock['mcu_huskylens_learn'] = function(block, generator) {
  // learn 為 value 積木（output Number，回傳學到的 ID），故以三元運算式守門
  return ['(husky.learn() if "husky" in globals() else 0)', Blockly.Python.ORDER_ATOMIC];
};

Blockly.Python.forBlock['mcu_huskylens_forget'] = function(block, generator) {
  return 'if "husky" in globals(): husky.forget()\n';
};

Blockly.Python.forBlock['mcu_huskylens_save_knowledge'] = function(block, generator) {
  var kid = block.getFieldValue('KNOWLEDGE_ID');
  return 'if "husky" in globals(): husky.save_knowledge(' + kid + ')\n';
};

Blockly.Python.forBlock['mcu_huskylens_load_knowledge'] = function(block, generator) {
  var kid = block.getFieldValue('KNOWLEDGE_ID');
  return 'if "husky" in globals(): husky.load_knowledge(' + kid + ')\n';
};

Blockly.Python.forBlock['mcu_huskylens_set_name'] = function(block, generator) {
  var id = block.getFieldValue('ID');
  var name = block.getFieldValue('NAME');
  var esc = String(name).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return 'if "husky" in globals(): husky.set_name(' + id + ', "' + esc + '")\n';
};
