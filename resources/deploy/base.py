"""
Base Deployer 基底類別與共用工具。
定義所有 Deployer 的共通介面與序列埠監控功能。
"""

import serial
import sys
import time
import os
import argparse
import threading
import platform

# --- 語系字典 ---
MESSAGES = {
    "zh-hant": {
        "title": "--- Cocoya MicroPython 部署工具 ---",
        "connect_serial": "正在透過序列埠連接 %s...",
        "uploading": "\n>>> 正在透過序列埠推送程式碼... <<<",
        "repl_failed": "無法進入 Raw REPL 模式。請確認韌體為 MicroPython 並嘗試 Reset。",
        "deploy_err": "部署過程中發生錯誤: %s",
        "complete_banner": "\n" + "="*40 + "\n[上傳成功] 程式已存入 Flash 並開始執行！\n" + "="*40 + "\n",
        "monitor_title": "-"*40 + "\n--- 序列埠監控: %s ---\n" + "-"*40,
        "connected": "\n[已連接至 %s]",
        "disconnected": "\n[連線中斷: %s] 正在等待裝置重新插入...",
        "stopped": "\n--- 監控已停止 ---",
    },
    "en": {
        "title": "--- Cocoya MicroPython Deployer ---",
        "connect_serial": "Connecting to %s via Serial...",
        "uploading": "\n>>> Pushing code via Raw REPL... <<<",
        "repl_failed": "Failed to enter Raw REPL. Please ensure MicroPython is running.",
        "deploy_err": "Error during deployment: %s",
        "complete_banner": "\n" + "="*40 + "\n[SUCCESS] Code saved to Flash and Running!\n" + "="*40 + "\n",
        "monitor_title": "-"*40 + "\n--- Serial Monitor: %s ---\n" + "-"*40,
        "connected": "\n[Connected to %s]",
        "disconnected": "\n[Disconnected: %s] Waiting for device...",
        "stopped": "\n--- Monitor Stopped ---",
    },
}


def get_msg(key, lang="en"):
    """取得本地化訊息"""
    return MESSAGES.get(lang, MESSAGES["en"]).get(key, key)


class BaseDeployer:
    """部署器基底類別"""

    def __init__(self, name="base"):
        self.name = name

    def deploy(self, port, code_file, lang="en", use_mon=True, is_tauri=False):
        """部署程式碼到目标裝置"""
        raise NotImplementedError

    def monitor(self, port, lang="en", baud=115200, welcome_msg=None, existing_ser=None, is_tauri=False):
        """雙向序列埠監看模式"""
        title = get_msg("monitor_title", lang) % port
        if not is_tauri:
            hint = " (按 Ctrl+C 停止)" if lang == "zh-hant" else " (Press Ctrl+C to stop)"
            title = title.replace("---\n", hint + "\n---")
        print(title)
        ser = existing_ser
        banner_pending = True if welcome_msg else False
        banner_timer = time.time()
        stop_event = threading.Event()

        def handle_input():
            try:
                while not stop_event.is_set():
                    if ser and ser.is_open:
                        if platform.system() == "Windows":
                            import msvcrt
                            if msvcrt.kbhit():
                                ser.write(msvcrt.getch())
                        else:
                            char = sys.stdin.read(1)
                            if char:
                                ser.write(char.encode("utf-8"))
                    time.sleep(0.01)
            except Exception:
                pass

        if platform.system() == "Windows":
            threading.Thread(target=handle_input, daemon=True).start()

        while True:
            try:
                if ser is None or not ser.is_open:
                    try:
                        ser = serial.Serial(port, baud, timeout=0.1)
                        ser.dtr = True; ser.rts = True
                        print(get_msg("connected", lang) % port)
                        banner_timer = time.time()
                    except Exception:
                        sys.stdout.write("."); sys.stdout.flush()
                        time.sleep(1.0); continue
                if ser.in_waiting > 0:
                    data_raw = ser.read(ser.in_waiting)
                    data_str = data_raw.decode("utf-8", errors="ignore")
                    if banner_pending:
                        if time.time() - banner_timer > 2.0:
                            print(welcome_msg); banner_pending = False
                        continue
                    sys.stdout.write(data_str); sys.stdout.flush()
            except KeyboardInterrupt:
                print(get_msg("stopped", lang)); stop_event.set(); break
            except Exception as e:
                if not is_tauri:
                    print(get_msg("disconnected", lang) % str(e))
                try:
                    if ser: ser.close()
                except Exception: pass
                ser = None; time.sleep(1.0)

    def erase_filesystem(self, port, lang="en"):
        """抹除檔案系統"""
        raise NotImplementedError

    def setup_stable_mode(self, port, lang="en"):
        """設定穩定模式"""
        print("\n[Notice] Stable mode not required for this firmware.")


def detect_board(port, baud=115200, timeout=2.0):
    """自動偵測連線的韌體類型"""
    try:
        ser = serial.Serial(port, baud, timeout=timeout)
        ser.dtr = True; ser.rts = True; time.sleep(0.1)
        ser.reset_input_buffer()
        ser.write(b"\x03"); time.sleep(0.3)
        response = ser.read_all().decode("utf-8", errors="ignore")
        if ">>>" in response or "MicroPython" in response:
            ser.close(); return "micropython"
        ser.write(b"\x03\x03"); time.sleep(0.3)
        response = ser.read_all().decode("utf-8", errors="ignore")
        if "pybricks" in response.lower() or "prime" in response.lower():
            ser.close(); return "pybricks"
        ser.close(); return "unknown"
    except Exception:
        return "unknown"
