"""
SPIKE Prime 官方韌體部署器。

官方 LEGO 韌體的 REPL 是「行式互動 REPL」（沒有 MicroPython Raw REPL \x01 模式，
或部分版本雖回應 raw REPL 卻無法正確執行）：收到 \n 就逐行執行整包送入會黏成一行。
本部署器採「探測優先」策略：
  1. 先嘗試 Raw REPL（\x01 → 回應含 "raw REPL"）：走 Raw 整包上傳（同 micropython 流程）
  2. 否則走官方逐行送入：每行寫入後等待 ">>> "（或縮排延續 "... "）回聲再送下一行
"""

import serial
import sys
import time
import os
from .base import BaseDeployer, get_msg


class OfficialSpikeDeployer(BaseDeployer):
    """LEGO SPIKE Prime 官方韌體部署器"""

    def __init__(self):
        super().__init__(name="official_spike")

    # ---------- 探測 ----------
    def probe_repl(self, ser, timeout=1.5):
        """回傳 'raw' / 'interactive' / 'none'"""
        try:
            ser.reset_input_buffer()
            ser.write(b"\x01")
            time.sleep(0.5)
            res = ser.read_all().decode("utf-8", errors="ignore")
            if "raw REPL" in res:
                return "raw"
            # 退出可能的 raw 模式，回到互動 REPL
            ser.write(b"\x02")
            time.sleep(0.2)
            ser.reset_input_buffer()
            ser.write(b"\n")
            time.sleep(0.3)
            echo = ser.read_all().decode("utf-8", errors="ignore")
            if ">>>" in echo:
                return "interactive"
            return "none"
        except Exception:
            return "none"


    # ---------- Raw REPL 整包上傳（hub 若支援） ----------
    def _deploy_raw(self, ser, code, lang):
        print(">>> Entering Raw REPL...")
        ser.write(b"\x01")
        time.sleep(0.5)
        res = ser.read_all().decode("utf-8", errors="ignore")
        if "raw REPL" not in res:
            return False
        code_bytes = code.encode("utf-8")
        for i in range(0, len(code_bytes), 256):
            ser.write(code_bytes[i:i + 256])
            time.sleep(0.05)
        ser.write(b"\x04")
        time.sleep(0.5)
        return True

    # ---------- 官方逐行送入 ----------
    def _read_until_prompt(self, ser, markers=(">>> ",), timeout=3.0):
        """等待任一 prompt 標記出現；回傳 (命中標記, 累積輸出)，逾時回 (None, 輸出)"""
        buf = ""
        end = time.time() + timeout
        while time.time() < end:
            chunk = ser.read_all().decode("utf-8", errors="ignore")
            if chunk:
                buf += chunk
                for m in markers:
                    if m in buf:
                        return m, buf
            time.sleep(0.05)
        return None, buf

    def _deploy_linewise(self, ser, code, lang):
        print(get_msg("uploading", lang))
        lines = code.split("\n")
        for line in lines:
            if line.strip() == "":
                continue
            ser.reset_input_buffer()
            ser.write((line + "\n").encode("utf-8"))
            mark, _ = self._read_until_prompt(ser, (">>> ", "... "))
            if mark is None:
                print(">>> [Warning] line got no prompt echo, continuing...")
        # 以空白行結束縮排區塊，回到主 prompt
        ser.write(b"\n")
        self._read_until_prompt(ser, (">>> ",))
        return True

    def deploy(self, port, code_file, lang="en", use_mon=True, is_tauri=False):
        """官方韌體部署：探測優先（Raw → 逐行）"""
        if not os.path.exists(code_file):
            print(get_msg("deploy_err", lang) + f": File not found {code_file}")
            sys.exit(1)

        with open(code_file, "r", encoding="utf-8") as f:
            code = f.read()

        ser = None
        try:
            print(get_msg("connect_serial", lang) % port)
            ser = serial.Serial(port, 115200, timeout=1.0)
            ser.dtr = True
            ser.rts = True
            time.sleep(0.1)
            ser.reset_input_buffer()

            # 中斷目前程式
            for _ in range(5):
                ser.write(b"\x03")
                time.sleep(0.1)
            ser.reset_input_buffer()

            kind = self.probe_repl(ser)
            ok = False
            if kind == "raw":
                print(">>> [SPIKE] Raw REPL supported, bulk upload...")
                ok = self._deploy_raw(ser, code, lang)
            if not ok:
                print(">>> [SPIKE] Using line-by-line upload...")
                ok = self._deploy_linewise(ser, code, lang)

            if not ok:
                print(get_msg("repl_failed", lang))
                ser.close()
                sys.exit(1)

            completion_msg = get_msg("complete_banner", lang)
            if use_mon:
                self.monitor(port, lang, welcome_msg=completion_msg, existing_ser=ser, is_tauri=is_tauri)
            else:
                print(completion_msg)
                ser.close()

        except Exception as e:
            print(get_msg("deploy_err", lang) % e)
            if ser:
                ser.close()
            sys.exit(1)

    def erase_filesystem(self, port, lang="en"):
        """官方韌體：不提供破壞性清除（官方 App 負責韌體/檔案管理）"""
        print("\n[Notice] Official SPIKE firmware files are managed by the LEGO SPIKE App. Skipping erase.")
