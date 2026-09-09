"""
Pybricks 部署器。
支援 Lego SPIKE Prime、Technic Hub、BOOST 等 Pybricks 相容 Hub。
使用 Pybricks 專屬協定上傳程式碼。
"""

import serial
import sys
import time
import os
from .base import BaseDeployer, get_msg

# Pybricks USB VID/PID 對照表
PYBRICKS_VIDS = {
    "0x0694": "LEGO SPIKE Prime",
    "0x0695": "LEGO SPIKE Essential",
    "0x0696": "LEGO MINDSTORMS Robot Inventor",
    "0x0693": "LEGO Technic Hub",
    "0x0697": "LEGO BOOST Move Hub",
    "0x0698": "LEGO City Hub",
}


class PybricksDeployer(BaseDeployer):
    """Pybricks SPIKE 部署器"""

    def __init__(self):
        super().__init__(name="pybricks")

    def deploy(self, port, code_file, lang="en", use_mon=True, is_tauri=False):
        """透過 Pybricks 協定部署程式碼到 SPIKE Hub"""
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

            print(get_msg("uploading", lang))

            # Pybricks 使用 Ctrl-C 中斷 + Ctrl-D 軟重啟來執行程式
            # 這與標準 MicroPython Raw REPL 不同
            for _ in range(3):
                ser.write(b"\x03"); time.sleep(0.1)

            # 確認進入 Pybricks REPL（讀回 banner，避免把官方韌體誤當 Pybricks）
            time.sleep(0.3)
            echo = ser.read_all().decode("utf-8", errors="ignore")
            if "pybricks" not in echo.lower() and ">>>" not in echo:
                print(">>> [Warning] no REPL echo (device may be busy), retrying once...")
                for _ in range(3):
                    ser.write(b"\x03"); time.sleep(0.1)
                time.sleep(0.3)
                echo = ser.read_all().decode("utf-8", errors="ignore")
                if ">>>" not in echo:
                    print(">>> [Error] cannot reach device REPL. Is this Pybricks firmware?")
                    ser.close(); sys.exit(1)

            # 等待就緒
            time.sleep(0.3)
            ser.reset_input_buffer()

            # Pybricks 支援透過 Serial 直接送出程式碼並執行
            # 使用 print + exec 模式
            code_bytes = code.encode("utf-8")

            # 分段送出（Pybricks buffer 較大，用 512 bytes）
            chunk_size = 512
            for i in range(0, len(code_bytes), chunk_size):
                ser.write(code_bytes[i:i+chunk_size])
                time.sleep(0.05)

            # 送出換行觸發執行
            ser.write(b"\n")
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
        """Pybricks Hub 檔案清除"""
        print(f"\n>>> [Deep Repair] Targeting Pybricks Hub on port: {port}")
        ser = None
        try:
            ser = serial.Serial(port, 115200, timeout=1.0)
            ser.dtr = True; ser.rts = True; time.sleep(0.1); ser.reset_input_buffer()
            print(">>> [Deep Repair] Interrupting running program...")
            for _ in range(3):
                ser.write(b"\x03"); time.sleep(0.1)
            time.sleep(0.3)

            # Pybricks 使用 os 模組清除
            erase_cmd = "import os\\nfor f in os.listdir(\'\'): os.remove(f)\\nprint(\'ERASE_OK\')\\n"
            ser.write(erase_cmd.encode("utf-8"))

            start_time = time.time(); success = False
            while time.time() - start_time < 10:
                res = ser.read_all().decode("utf-8", errors="ignore")
                if "ERASE_OK" in res:
                    success = True; break
                time.sleep(0.5)
            if success:
                print("\n[Done] Pybricks Hub repair successful.")
            else:
                print("Error: Pybricks repair timed out."); sys.exit(1)
        except Exception as e:
            print(f"Error during Pybricks repair: {e}"); sys.exit(1)
        finally:
            if ser: ser.close()

    def setup_stable_mode(self, port, lang="en"):
        print("\n[Notice] Pybricks firmware is already optimized. No additional setup needed.")
