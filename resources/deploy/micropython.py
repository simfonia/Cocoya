"""
MicroPython 部署器。
使用 Serial Raw REPL 協定上傳程式碼。
支援 Maker Pi RP2040、XIAO ESP32-S3 等開發板。
"""

import serial
import sys
import time
import os
from .base import BaseDeployer, get_msg


class MicroPythonDeployer(BaseDeployer):
    """MicroPython Raw REPL 部署器"""

    def __init__(self):
        super().__init__(name="micropython")

    def deploy(self, port, code_file, lang="en", use_mon=True, is_tauri=False):
        """透過 Serial Raw REPL 部署 MicroPython 程式碼"""
        if not os.path.exists(code_file):
            print(get_msg("deploy_err", lang) + f": File not found {code_file}")
            sys.exit(1)

        with open(code_file, "r", encoding="utf-8") as f:
            code = f.read()

        ser = None
        try:
            print(get_msg("connect_serial", lang) % port)
            ser = serial.Serial(port, 115200, timeout=1.0)
            ser.dtr = True; ser.rts = True; time.sleep(0.1)
            ser.reset_input_buffer()

            # 中斷目前程式
            print(get_msg("uploading", lang))
            for _ in range(5):
                ser.write(b"\x03"); time.sleep(0.1)

            # 進入 Raw REPL
            ser.write(b"\x01")
            time.sleep(0.5)
            res = ser.read_all().decode("utf-8", errors="ignore")

            if "raw REPL" not in res:
                print(">>> Retrying with Soft Reboot...")
                ser.write(b"\x04"); time.sleep(1.2)
                ser.write(b"\x03\x03\x01"); time.sleep(0.5)
                res = ser.read_all().decode("utf-8", errors="ignore")

            if "raw REPL" not in res:
                print(get_msg("repl_failed", lang))
                sys.exit(1)

            # 送出程式碼（分段傳輸避免 buffer overflow）
            code_bytes = code.encode("utf-8")
            chunk_size = 256
            for i in range(0, len(code_bytes), chunk_size):
                ser.write(code_bytes[i:i+chunk_size])
                time.sleep(0.05)

            # 結束 Raw REPL 並執行
            ser.write(b"\x04")
            time.sleep(0.5)

            completion_msg = get_msg("complete_banner", lang)
            if use_mon:
                self.monitor(port, lang, welcome_msg=completion_msg, existing_ser=ser, is_tauri=is_tauri)
            else:
                print(completion_msg); ser.close()

        except Exception as e:
            print(get_msg("deploy_err", lang) % e)
            if ser: ser.close()
            sys.exit(1)

    def erase_filesystem(self, port, lang="en"):
        """MicroPython Flash 深度修復"""
        print(f"\n>>> [Deep Repair] Targeting port: {port}")
        ser = None
        try:
            ser = serial.Serial(port, 115200, timeout=1.0)
            ser.dtr = True; ser.rts = True; time.sleep(0.1); ser.reset_input_buffer()
            print(">>> [Deep Repair] Interrupting running program...")
            for _ in range(5):
                ser.write(b"\x03"); time.sleep(0.1)
            ser.write(b"\x01"); time.sleep(0.5)
            res = ser.read_all().decode("utf-8", errors="ignore")
            if "raw REPL" not in res:
                print(">>> [Deep Repair] Retrying with Soft Reboot...")
                ser.write(b"\x04"); time.sleep(1.2); ser.write(b"\x03\x03\x01"); time.sleep(0.5)
                res = ser.read_all().decode("utf-8", errors="ignore")
            if "raw REPL" not in res:
                print("Error: Failed to enter Raw REPL. MCU might be busy."); sys.exit(1)
            print(">>> [Deep Repair] Deleting all files...")
            erase_script = "import os\ndef wipe(path=\'\'):\n  try:\n    for f in os.listdir(path):\n      p = path + \'/\' + f if path else f\n      try:\n        st = os.stat(p)\n        if st[0] & 0x4000:\n          wipe(p); os.rmdir(p)\n        else: os.remove(p)\n      except: pass\n  except: pass\nwipe()\nprint(\'ERASE_OK\')\n"
            ser.write(erase_script.encode("utf-8")); ser.write(b"\x04")
            start_time = time.time(); success = False
            while time.time() - start_time < 10:
                res_del = ser.read_all().decode("utf-8", errors="ignore")
                if "ERASE_OK" in res_del:
                    success = True; break
                time.sleep(0.5)
            if success:
                print("\n[Done] Deep Repair successful.")
                print(">>> [Deep Repair] Rebooting system..."); ser.write(b"\x02\x04")
            else:
                print("Error: Deletion timed out or failed."); sys.exit(1)
        except Exception as e:
            print(f"Error during deep repair: {e}"); sys.exit(1)
        finally:
            if ser: ser.close()

    def setup_stable_mode(self, port, lang="en"):
        print("\n[Notice] MicroPython does not need \'Stable Mode\'. It\'s already stable by design!")
