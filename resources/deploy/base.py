"""
Base Deployer 基底類別與共用工具。
定義所有 Deployer 的共通介面與序列埠監控功能。
"""

import serial
import sys
import time
import os
import re
import argparse
import threading
import platform

# --- 語系字典 ---
MESSAGES = {
    "zh-hant": {
        "title": "--- Cocoya 部署工具 ---",
        "connect_serial": "正在透過序列埠連接 %s...",
        "uploading": "\n>>> 正在透過序列埠推送程式碼... <<<",
        "repl_failed": "無法進入 Raw REPL 模式。請確認韌體為 MicroPython 並嘗試 Reset。",
        "deploy_err": "部署過程中發生錯誤: %s",
        "complete_banner": "\n" + "="*40 + "\n[上傳成功] 程式已存入 Flash 並開始執行！\n" + "="*40 + "\n",
        "monitor_title": "-"*40 + "\n--- 序列埠監控: %s ---\n" + "-"*40,
        "connected": "\n[已連接至 %s]",
        "disconnected": "\n[連線中斷: %s] 正在等待裝置重新插入...",
        "stopped": "\n--- 監控已停止 ---",
        "program_done": "\n--- 程式執行完畢 ---",
    },
    "en": {
        "title": "--- Cocoya Deployer ---",
        "connect_serial": "Connecting to %s via Serial...",
        "uploading": "\n>>> Pushing code via Raw REPL... <<<",
        "repl_failed": "Failed to enter Raw REPL. Please ensure MicroPython is running.",
        "deploy_err": "Error during deployment: %s",
        "complete_banner": "\n" + "="*40 + "\n[SUCCESS] Code saved to Flash and Running!\n" + "="*40 + "\n",
        "monitor_title": "-"*40 + "\n--- Serial Monitor: %s ---\n" + "-"*40,
        "connected": "\n[Connected to %s]",
        "disconnected": "\n[Disconnected: %s] Waiting for device...",
        "stopped": "\n--- Monitor Stopped ---",
        "program_done": "\n--- Program finished ---",
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
        """部署程式碼到目標裝置"""
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
        # 「收到 OK 之後補一行空白行」只處理一次；用執行個體旗標跨讀取區塊保持
        if not hasattr(self, "_ok_seen"):
            self._ok_seen = False
        # 程式執行完畢提示（program_done）每次監看會話只顯示一次
        self._done_shown = False
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
                        # 重連（如使用者按 MCU reset）＝新一輪執行：重置一次性旗標，
                        # 讓 OK 空行與「程式執行完畢」提示在新一輪重新生效。
                        self._ok_seen = False
                        self._done_shown = False
                        # 注意：這裡「不送」任何控制字元（Ctrl-C/Ctrl-D）。
                        # reset 後 MCU 會自動執行 main.py，此時可能正在播音樂/跑馬燈等；
                        # 若送 Ctrl-C 會中斷使用者的程式、送 Ctrl-D 會造成程式重跑兩次。
                        # 開機最初段的輸出因 USB 尚未列舉完成而遺失（物理限制），
                        # 但程式後續的 print 會在連線建立後正常顯示。
                    except Exception:
                        sys.stdout.write("."); sys.stdout.flush()
                        time.sleep(1.0); continue
                if ser.in_waiting > 0:
                    data_raw = ser.read(ser.in_waiting)
                    data_str = data_raw.decode("utf-8", errors="ignore")
                    # 診斷（暫存）：把每批原始 bytes repr 寫到 temp_scripts/raw_dump.log，不影響終端輸出
                    try:
                        with open(r"c:/Workspace/cocoya/temp_scripts/raw_dump.log", "a", encoding="utf-8") as _f:
                            _f.write(repr(data_raw) + "\n")
                    except Exception:
                        pass
                    # --- 生資料最小正規化 ---
                    # Raw REPL 以 \x04 分隔輸出段落；把 \x04 視作換行語意、統一 \r。
                    data_str = data_str.replace("\r", "")
                    data_str = data_str.replace("\x04", "\n")
                    # Raw REPL 執行成功的 "OK" 可能單獨一批到達且「無尾換行」，
                    # 也可能與程式第一個 print **合併在同一批**（如 piCar：b'OK請按開始鍵繼纐…'）
                    # → 統一在「尚未見過 OK」且批次以 OK 開頭時，把 OK 切出補尾換行，
                    #   供下方「OK 後補空行」判斷命中，並避免與後續輸出黏行。
                    if not getattr(self, "_ok_seen", False) and data_str.startswith("OK"):
                        data_str = "OK\n" + data_str[2:]
                    # 壓平重複換行：Raw REPL 每筆 print 之間常帶 \r\n\r\n（轉 \n\n），
                    # 不壓平就會讓每筆資料之間出現空白行。壓平後每筆輸出各佔一行。
                    data_str = re.sub(r"\n{2,}", "\n", data_str)
                    # 收到 OK 之後補一行空白（只補一次）。必須在「壓平之後」執行，
                    # 否則補上的空行會立刻被壓平規則吃掉。讓後續 Serial 與 OK 明顯分開。
                    if not getattr(self, "_ok_seen", False) and "OK\n" in data_str:
                        self._ok_seen = True
                        data_str = re.sub(r"(?m)^OK\n", "OK\n\n", data_str, count=1)
                    # 跨段收斂：序列埠分批到達，每批開頭常帶 Raw REPL 的 \x04（已轉 \n），
                    # 若上一批以 \n 結尾、本批又以 \n 開頭，跨批就會多出空行。
                    # 數位壓平只作用段內，無法跨段，故在此額外消掉「上段結尾 \n + 本段開頭 \n」。
                    if getattr(self, "_prev_ended_nl", False) and data_str.startswith("\n"):
                        data_str = data_str[1:]
                    self._prev_ended_nl = bool(data_str) and data_str.endswith("\n")
                    # 確保本段以 \n 結尾：Raw REPL 執行完的 prompt（">"）無尾隨換行，
                    # 若不補，Rust emit_line_buffered 會把尾段卡在 pending 直到 EOF，導致 prompt 不出現。
                    if data_str and not data_str.endswith("\n"):
                        data_str += "\n"

                    if banner_pending:
                        # 有 welcome_msg（SPIKE/Pybricks 走此分支）：pending 期間仍寫出資料，
                        # 待見到 soft reboot/>>> 或逾時 2 秒才補印 welcome，避免吃掉開頭輸出。
                        sys.stdout.write(data_str); sys.stdout.flush()
                        if "soft reboot" in data_str or ">>>" in data_str:
                            if welcome_msg:
                                print(welcome_msg)
                            banner_pending = False
                    else:
                        # 過濾「純換行」批：序列埠常把 \r\n 當一筆單獨送達，剝 \r 後只剩 \n。
                        # 資料本身的換行已由資料行自帶（每行已補 \n），這個純 \n 批會在前端
                        # pre-wrap 渲染成一個多餘空行 → 略過不輸出。
                        # 另過濾 soft reboot 開機橫幅與 REPL prompt：Cocoya 虛擬終端無法與
                        # REPL 互動，這些訊息（MicroPython 版本橫幅、help 提示、MPY: soft reboot、
                        # raw REPL 提示、>>> prompt）只會誤導使用者 → 顯示層逐行剔除。
                        _QUIET = (
                            "MPY: soft reboot", "soft reboot", "raw REPL; CTRL-B to exit",
                            'Type "help()" for more information.', ">>>", ">",
                        )
                        if data_str.strip():
                            _out = ""
                            for _line in data_str.split("\n"):
                                _s = _line.strip()
                                if _s in _QUIET or _s.startswith("MicroPython v") or _s.startswith("; "):
                                    continue
                                _out += (_line + "\n") if _line else ""
                            if _out.strip():
                                sys.stdout.write(_out); sys.stdout.flush()
                        # 程式執行完畢提示（一次性）：MicroPython 程式結束回到 normal REPL 時
                        # 會送出 ">>>"，此時顯示 done 提示取代被過濾掉的 prompt，讓使用者知道
                        # 程式已正常結束。僅在非 banner_pending 分支（micropython 上傳流程）觸發。
                        if ">>>" in data_str and not getattr(self, "_done_shown", False):
                            self._done_shown = True
                            print(get_msg("program_done", lang)); sys.stdout.flush()
                # 上傳成功 banner 兜底：逾時 2 秒仍未偵測到結束訊號（例如 Raw REPL 執行完
                # 停在 raw prompt、不再主動送資料），強制補印 complete_banner，避免畫面只停在 "OK"。
                if banner_pending and (time.time() - banner_timer > 2.0):
                    if welcome_msg:
                        print(welcome_msg)
                    banner_pending = False
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
    """自動偵測連線的韌體類型。
    回傳 "micropython" / "pybricks" / "spike-official" / "unknown"。
    順序關鍵：先排除 Pybricks（其 MicroPython banner 含 "MicroPython" 字樣，
    不可先走一般 micropython 分支）；再排除官方 SPIKE（互動 REPL 含 SPIKE/prime
    banner，需再探 Raw REPL：官方行式 REPL 無 raw；Pybricks 韌體有 raw 但已在上一步排除）。"""
    try:
        ser = serial.Serial(port, baud, timeout=timeout)
        ser.dtr = True; ser.rts = True; time.sleep(0.1)
        ser.reset_input_buffer()
        ser.write(b"\x03"); time.sleep(0.3)
        response = ser.read_all().decode("utf-8", errors="ignore")
        lowered = response.lower()
        # 1. Pybricks 韌體：banner 含 "Pybricks"（雖基於 MicroPython，必須先判）
        if "pybricks" in lowered:
            ser.close(); return "pybricks"
        # 2. 官方 SPIKE 韌體：互動 REPL 有 SPIKE/prime banner；再探 Raw REPL 確認
        if "spike" in lowered or "prime" in lowered:
            has_raw = False
            try:
                ser.reset_input_buffer()
                ser.write(b"\x01"); time.sleep(0.5)
                res_raw = ser.read_all().decode("utf-8", errors="ignore")
                has_raw = "raw REPL" in res_raw
                ser.write(b"\x02"); time.sleep(0.2)
            except Exception:
                has_raw = False
            ser.close()
            return "micropython" if has_raw else "spike-official"
        # 3. 標準 MicroPython（Pico / XIAO / micro:bit 等）
        if ">>>" in response or "MicroPython" in response:
            ser.close(); return "micropython"
        ser.write(b"\x03\x03"); time.sleep(0.3)
        response = ser.read_all().decode("utf-8", errors="ignore")
        if "pybricks" in response.lower() or "prime" in response.lower():
            ser.close(); return "pybricks"
        ser.close(); return "unknown"
    except Exception:
        return "unknown"
