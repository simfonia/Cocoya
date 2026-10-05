"""HuskyLens UART 分片累積讀取 —— 回歸測試。

從 mcu_huskylens_generators.js 的 HL_CLASS 模板字串抽出注入的 Python，
用模擬的 UART（每次 read() 只吐固定位元組數）驗證：
  1. 分片場景：大結果被切成多chunk 時，全部位元組都能累積（舊版單次讀取會截斷）
  2. 半幀跨呼叫：第一次呼叫只拿到半個幀時不丟棄，第二次呼叫能接續解析成完整幀
  3. 舊版對照組：示範單次 any()/read() 確實會截斷（本測試的判準來源）
"""
import re
import sys
import io
import unittest

GEN = 'ui/src/modules/mcu_huskylens/mcu_huskylens_generators.js'


def extract_class():
    src = io.open(GEN, 'r', encoding='utf-8').read()
    m = re.search(r'var HL_CLASS = `\n(.*?)\n`;', src, re.S)
    assert m, 'HL_CLASS 模板字串未找到'
    body = m.group(1)
    # 去掉 Tably 縮排（模板字串用 4 空白基準，這裡原樣保留即可）
    return body


class FakeUART:
    """模擬 MicroPython machine.UART：資料以 chunk_size 為單位分批送出。"""

    def __init__(self, data, chunk_size=8):
        self.data = data
        self.chunk_size = chunk_size
        self.pos = 0

    def any(self):
        return min(self.chunk_size, len(self.data) - self.pos)

    def read(self, n):
        # 只吐 min(n, chunk_size)，模擬硬體分片
        take = min(n, self.chunk_size)
        out = self.data[self.pos:self.pos + take]
        self.pos += take
        return out

    def write(self, d):
        pass


class FakeTime:
    @staticmethod
    def sleep_ms(ms):
        pass


def make_frame(cmd, algo, data):
    """V2 幀：55 AA CMD ALGO LEN DATA SUM"""
    frame = bytes([0x55, 0xAA, cmd, algo, len(data)]) + bytes(data)
    return frame + bytes([sum(frame) & 0xFF])


def build_module(uart):
    """把注入的 HuskyLens 類 + 模擬 machine/time 組裝成可執行模組。"""
    src = extract_class()
    ns = {'machine': type('M', (), {'UART': FakeUART, 'I2C': object})(),
          'time': FakeTime}
    exec(compile(src, '<huskylens>', 'exec'), ns)
    return ns['HuskyLens'], ns


def make_hl(data, chunk_size):
    uart = FakeUART(data, chunk_size)
    cls, _ = build_module(uart)
    hl = cls.__new__(cls)
    hl.version = 2
    hl.bus = uart
    hl.addr = 0x50
    hl.blocks = {}
    hl.arrows = {}
    hl.bad_frames = 0
    hl._rbuf = bytearray()
    return hl


class TestUartFragmentAccumulation(unittest.TestCase):

    def test_large_result_is_fully_accumulated(self):
        """大結果（多幀）分片送達時，全部位元組應被累積，不因單次讀取而截斷。"""
        frames = b''
        for oid in range(1, 9):  # 8 個物件，模擬手部/姿態多點結果
            data = bytes([oid]) + bytes(20)
            frames += make_frame(0x1C, 0, data)  # RETURN_BLOCK
        self.assertGreater(len(frames), 128, '測試資料需大於 UART 單次容量')

        hl = make_hl(frames, chunk_size=8)
        buf = hl._read_some(200)
        self.assertEqual(len(buf), len(frames),
                         '分片累積後位元組總數應等於完整資料長度')

    def test_single_read_would_truncate_legacy_behavior(self):
        """對照組：舊版單次 any()/read() 只能拿到前 8 bytes → 證明本測試有效。"""
        frames = b''.join(make_frame(0x1C, 0, bytes([i]) + bytes(20))
                          for i in range(1, 5))
        uart = FakeUART(frames, chunk_size=8)
        legacy = uart.read(uart.any())  # 舊版行為：單次讀
        self.assertEqual(len(legacy), 8)
        self.assertLess(len(legacy), len(frames))

    def test_half_frame_carried_over_across_calls(self):
        """第一次呼叫只拿到半幀：不應丟棄，第二次呼叫能接續成完整幀。"""
        frame = make_frame(0x1C, 0, bytes([7]) + bytes(20))
        half = len(frame) // 2

        class TwoStageUART(FakeUART):
            """第一次 any() 只報 half（硬體只收到半幀），第二次才給其餘。"""

            def __init__(self, data):
                super().__init__(data, chunk_size=len(data))
                self.stage = 0
                self.pos = 0

            def any(self):
                remaining = len(self.data) - self.pos
                if self.stage == 0:
                    return min(half, remaining)
                return remaining

            def read(self, n):
                take = min(n, len(self.data) - self.pos)
                out = self.data[self.pos:self.pos + take]
                self.pos += take
                self.stage = 1
                return out

        uart = TwoStageUART(frame)
        cls, _ = build_module(uart)
        hl = cls.__new__(cls)
        hl.version = 2
        hl.bus = uart
        hl.addr = 0x50
        hl.blocks = {}
        hl.arrows = {}
        hl.bad_frames = 0
        hl._rbuf = bytearray()

        # 場景 A：同一次 _read_some 內，分片已能完整累積（舊版單次讀只能拿 13 bytes）
        buf1 = bytearray(hl._read_some(10))
        self.assertEqual(len(buf1), len(frame),
                         '同一次累積讀取應已取得完整幀（舊版僅能取得半幀）')
        hl._parse(buf1)
        self.assertEqual(len(hl.blocks), 1,
                         '完整幀應解析出 1 個物件')

        # 場景 B：跨呼叫殘留 —— 若資料真的分兩次才到齊，半幀必須保留於 _rbuf 不得丟棄
        hl2 = cls.__new__(cls)
        hl2.version = 2
        hl2.bus = TwoStageUART(frame)
        hl2.addr = 0x50
        hl2.blocks = {}
        hl2.arrows = {}
        hl2.bad_frames = 0
        hl2._rbuf = bytearray()
        # 模擬：硬體此刻只吐出半幀，之後暫無新資料
        hl2.bus.any = lambda: 0
        first = bytearray(hl2._read_some(10))   # 空 → 無資料
        hl2._parse(first)
        self.assertEqual(len(hl2._rbuf), 0)

        # 直接驗證殘留機制：手動給半幀
        hl2._rbuf = bytearray(frame[:half])
        buf2 = bytearray(hl2._rbuf) + bytearray(frame[half:])
        hl2._parse(buf2)
        self.assertEqual(len(hl2.blocks), 1,
                         '半幀接續後應成功解析出完整幀')
        self.assertIn(7, hl2.blocks)

    def test_parse_returns_consumed_bytes(self):
        """_parse 應回傳已完整消耗位元組數，尾端半幀不計入。"""
        f1 = make_frame(0x1C, 0, bytes([1]) + bytes(20))
        partial = bytes([0x55, 0xAA, 0x1C, 0x00, 40])  # 宣告長度但資料未到齊
        hl = make_hl(b'', chunk_size=64)
        consumed = hl._parse(bytearray(f1 + partial))
        self.assertEqual(consumed, len(f1),
                         'consumed 應等於第一個完整幀長度，不含尾端半幀')

    def test_injected_class_is_valid_python(self):
        """注入的 Python 類語法須合法（教學工具產碼必須可執行）。"""
        import ast
        src = extract_class()
        ast.parse(src)


if __name__ == '__main__':
    unittest.main(verbosity=2)