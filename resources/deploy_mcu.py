import serial
import sys
import time
import os
import argparse

# --- 語系字典 (MicroPython 專用) ---
MESSAGES = {
    "zh-hant": {
        "title": "--- Cocoya MicroPython 部署工具 ---",
        "connect_serial": "正在透過序列埠連接 %s...",
        "uploading": "\n>>> 正在透過序列埠推送程式碼... <<<",
        "repl_failed": "無法進入 Raw REPL 模式。請確認韌體為 MicroPython 並嘗試 Reset。",
        "deploy_err": "部署過程中發生錯誤: %s",
        "complete_banner": "\n" + "="*40 + "\n[上傳成功] 可以斷開 USB 線了！\n" + "="*40 + "\n",
        "monitor_title": "-"*40 + "\n--- 序列埠監控: %s ---\n" + "-"*40,
        "connected": "\n[已連接至 %s]",
        "disconnected": "\n[連線中斷: %s] 正在等待裝置重新插入...",
        "stopped": "\n--- 監控已停止 ---"
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
        "stopped": "\n--- Monitor Stopped ---"
    }
}

def get_msg(key, lang="en"):
    return MESSAGES.get(lang, MESSAGES["en"]).get(key, key)

def monitor(port, lang="en", baud=115200, welcome_msg=None, existing_ser=None, is_tauri=False):
    """進入序列埠監看模式，具備自動重連功能"""
    title = get_msg("monitor_title", lang) % port
    if not is_tauri:
        # VSIX 模式保留提示，Tauri 模式則隱藏
        hint = " (按 Ctrl+C 停止)" if lang == "zh-hant" else " (Press Ctrl+C to stop)"
        title = title.replace("---\n", hint + "\n---")
    print(title)
    
    ser = existing_ser
    banner_pending = True if welcome_msg else False
    banner_timer = time.time()

    while True:
        try:
            if ser is None or not ser.is_open:
                try:
                    # 加入 rts/dtr 支援，增加相容性
                    ser = serial.Serial(port, baud, timeout=0.1)
                    ser.dtr = True
                    ser.rts = True
                    print(get_msg("connected", lang) % port)
                    banner_timer = time.time()
                except:
                    # 實體斷線後的重連指示，不換行
                    sys.stdout.write("."); sys.stdout.flush()
                    time.sleep(1.0); continue

            if ser.in_waiting > 0:
                data_raw = ser.read(ser.in_waiting)
                data_str = data_raw.decode('utf-8', errors='ignore')
                
                if banner_pending:
                    if "soft reboot" in data_str:
                        parts = data_str.split("soft reboot", 1)
                        sys.stdout.write(parts[0] + "soft reboot")
                        sys.stdout.write(welcome_msg)
                        sys.stdout.write(parts[1])
                        banner_pending = False
                    elif (time.time() - banner_timer > 2.0):
                        sys.stdout.write(data_str)
                        print(welcome_msg)
                        banner_pending = False
                    else:
                        sys.stdout.write(data_str)
                else:
                    sys.stdout.write(data_str)
                sys.stdout.flush()

            time.sleep(0.01)

        except (serial.SerialException, PermissionError, OSError) as e:
            print(get_msg("disconnected", lang) % e)
            if ser:
                try: ser.close()
                except: pass
            ser = None; time.sleep(0.5)
        except KeyboardInterrupt:
            print(get_msg("stopped", lang))
            if ser:
                try: ser.close()
                except: pass
            break

def deploy(port, code_filename, lang="en", use_mon=True, is_tauri=False):
    """執行 MicroPython 全序列埠部署"""
    if not os.path.exists(code_filename):
        print(f"Error: {code_filename} not found"); sys.exit(1)
    with open(code_filename, 'r', encoding='utf-8') as f:
        code_content = f.read()

    print(get_msg("connect_serial", lang) % port)
    ser = None
    try:
        # 1. 建立連線並設定 DTR/RTS
        ser = serial.Serial(port, 115200, timeout=1.0)
        ser.dtr = True; ser.rts = True; ser.reset_input_buffer()
        
        # 2. 強力中斷並進入 Raw REPL
        for _ in range(3):
            ser.write(b'\x03'); time.sleep(0.1)
        ser.write(b'\x01'); time.sleep(0.2)
        
        res = ser.read_all().decode('utf-8', errors='ignore')
        if "raw REPL" not in res:
            ser.write(b'\x04'); time.sleep(1.0); ser.write(b'\x03\x03\x01'); time.sleep(0.3)
            res = ser.read_all().decode('utf-8', errors='ignore')

        if "raw REPL" not in res:
            print(get_msg("repl_failed", lang)); ser.close(); sys.exit(1)

        # 3. 執行檔案寫入
        print(get_msg("uploading", lang)); ser.read_all()
        write_cmd = f'f=open("main.py","w");f.write({repr(code_content)});f.close()\n'
        ser.write(write_cmd.encode('utf-8')); ser.write(b'\x04'); time.sleep(0.5)
        res_write = ser.read_all().decode('utf-8', errors='ignore')
        
        completion_msg = get_msg("complete_banner", lang)
        
        # 4. 退出 REPL 並軟重啟
        ser.write(b'\x02\x04'); ser.flush()
        
        if use_mon:
            monitor(port, lang, welcome_msg=completion_msg, existing_ser=ser, is_tauri=is_tauri)
        else:
            print(completion_msg); ser.close()

    except Exception as e:
        print(get_msg("deploy_err", lang) % e)
        if ser: ser.close()
        sys.exit(1)

def setup_stable_mode(port, lang="en"):
    print("\n[Notice] MicroPython does not need 'Stable Mode'. It's already stable by design!")

def erase_filesystem(port, lang="en"):
    """MicroPython 的 Flash 深度修復 (清空所有使用者檔案與目錄)"""
    print(f"\n>>> [Deep Repair] Targeting port: {port}")
    ser = None
    try:
        ser = serial.Serial(port, 115200, timeout=1.0)
        ser.dtr = True; ser.rts = True; time.sleep(0.1); ser.reset_input_buffer()
        print(">>> [Deep Repair] Interrupting running program...")
        for _ in range(5):
            ser.write(b'\x03'); time.sleep(0.1)
        ser.write(b'\x01'); time.sleep(0.5)
        res = ser.read_all().decode('utf-8', errors='ignore')
        if "raw REPL" not in res:
            print(">>> [Deep Repair] Retrying with Soft Reboot...")
            ser.write(b'\x04'); time.sleep(1.2); ser.write(b'\x03\x03\x01'); time.sleep(0.5)
            res = ser.read_all().decode('utf-8', errors='ignore')
        
        if "raw REPL" not in res:
            print("Error: Failed to enter Raw REPL. MCU might be busy."); sys.exit(1)

        print(">>> [Deep Repair] Deleting all files and directories in root...")
        erase_script = "import os\ndef wipe(path=''):\n  try:\n    for f in os.listdir(path):\n      p = path + '/' + f if path else f\n      try:\n        st = os.stat(p)\n        if st[0] & 0x4000:\n          wipe(p); os.rmdir(p)\n        else: os.remove(p)\n      except: pass\n  except: pass\nwipe()\nprint('ERASE_OK')\n"
        
        ser.write(erase_script.encode('utf-8')); ser.write(b'\x04')
        
        start_time = time.time()
        success = False
        while time.time() - start_time < 10:
            res_del = ser.read_all().decode('utf-8', errors='ignore')
            if "ERASE_OK" in res_del:
                success = True; break
            time.sleep(0.5)

        if success:
            print("\n[Done] Deep Repair successful. All user data removed.")
            print(">>> [Deep Repair] Rebooting system..."); ser.write(b'\x02\x04')
        else:
            print("Error: Deletion timed out or failed."); sys.exit(1)

    except Exception as e:
        print(f"Error during deep repair: {e}"); sys.exit(1)
    finally:
        if ser: ser.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("port")
    parser.add_argument("code_file", nargs='?')
    parser.add_argument("--no-monitor", action="store_true")
    parser.add_argument("--monitor-only", action="store_true")
    parser.add_argument("--serial-only", action="store_true")
    parser.add_argument("--setup-stable", action="store_true")
    parser.add_argument("--erase-filesystem", action="store_true")
    parser.add_argument("--tauri", action="store_true")
    parser.add_argument("--lang", default="en")
    args = parser.parse_args()

    if args.monitor_only:
        monitor(args.port, lang=args.lang, is_tauri=args.tauri)
    elif args.erase_filesystem:
        erase_filesystem(args.port, lang=args.lang)
    elif args.setup_stable:
        setup_stable_mode(args.port, lang=args.lang)
    else:
        if not args.code_file: sys.exit(1)
        deploy(args.port, args.code_file, lang=args.lang, use_mon=not args.no_monitor, is_tauri=args.tauri)
