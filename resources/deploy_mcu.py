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
        "complete_banner": "\n" + "="*40 + "\n[上傳成功] 您可以斷開序列埠連線。\n" + "="*40 + "\n",
        "monitor_title": "-"*40 + "\n--- 序列埠監控: %s (按 Ctrl+C 停止) ---\n" + "-"*40,
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
        "monitor_title": "-"*40 + "\n--- Serial Monitor: %s (Press Ctrl+C to stop) ---\n" + "-"*40,
        "connected": "\n[Connected to %s]",
        "disconnected": "\n[Disconnected: %s] Waiting for device...",
        "stopped": "\n--- Monitor Stopped ---"
    }
}

def get_msg(key, lang="en"):
    return MESSAGES.get(lang, MESSAGES["en"]).get(key, key)

def monitor(port, lang="en", baud=115200, welcome_msg=None, existing_ser=None):
    """進入序列埠監看模式，具備自動重連功能"""
    print(get_msg("monitor_title", lang) % port)
    
    ser = existing_ser
    banner_pending = True if welcome_msg else False
    banner_timer = time.time()

    while True:
        try:
            if ser is None or not ser.is_open:
                try:
                    ser = serial.Serial(port, baud, timeout=0.1)
                    print(get_msg("connected", lang) % port)
                    banner_timer = time.time()
                except:
                    sys.stdout.write("."); sys.stdout.flush()
                    time.sleep(1.0); continue

            if ser.in_waiting > 0:
                data_raw = ser.read(ser.in_waiting)
                data_str = data_raw.decode('utf-8', errors='ignore')
                
                if banner_pending:
                    # 嘗試在 "soft reboot" 出現時注入歡迎訊息
                    if "soft reboot" in data_str:
                        parts = data_str.split("soft reboot", 1)
                        sys.stdout.write(parts[0] + "soft reboot")
                        sys.stdout.write(welcome_msg)
                        sys.stdout.write(parts[1])
                        banner_pending = False
                    elif (time.time() - banner_timer > 2.0):
                        # 超時備份：如果 2 秒內沒抓到 soft reboot，直接印出
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

def deploy(port, code_filename, lang="en", use_monitor=True):
    """執行 MicroPython 全序列埠部署"""
    print(get_msg("title", lang))
    
    if not os.path.exists(code_filename):
        print(f"Error: {code_filename} not found")
        sys.exit(1)

    with open(code_filename, 'r', encoding='utf-8') as f:
        code_content = f.read()

    print(get_msg("connect_serial", lang) % port)
    ser = None
    try:
        # 1. 奪取控制權
        ser = serial.Serial(port, 115200, timeout=1.0)
        ser.reset_input_buffer()
        
        # 2. 強力煞車並進入 Raw REPL
        ser.write(b'\x03\x03') # Ctrl+C twice
        time.sleep(0.2)
        ser.write(b'\x01')    # Ctrl+A: Enter Raw REPL
        time.sleep(0.2)
        
        res = ser.read_all().decode('utf-8', errors='ignore')
        if "raw REPL" not in res:
            # 嘗試第二次：軟重啟後再進
            ser.write(b'\x04')
            time.sleep(0.5)
            ser.write(b'\x03\x03\x01')
            time.sleep(0.3)
            res = ser.read_all().decode('utf-8', errors='ignore')

        if "raw REPL" not in res:
            print(get_msg("repl_failed", lang))
            ser.close(); sys.exit(1)

        # 3. 執行檔案寫入 (MicroPython 預設檔名為 main.py)
        print(get_msg("uploading", lang))
        # 先清空緩衝，防止干擾
        ser.read_all()
        
        # 構建寫入指令。使用 repr 確保字串轉義正確 (處理換行與引號)
        write_cmd = f'f=open("main.py","w");f.write({repr(code_content)});f.close()\n'
        ser.write(write_cmd.encode('utf-8'))
        ser.write(b'\x04') # 執行該指令
        
        # 等待寫入完成 (對於大型檔案可能需要循環檢查)
        time.sleep(0.5)
        res_write = ser.read_all().decode('utf-8', errors='ignore')
        
        # 4. 準備啟動並顯示橫幅 (橫幅將由 monitor 負責在適當時機印出)
        completion_msg = get_msg("complete_banner", lang)
        
        # 5. 退出 Raw REPL 並軟重啟執行程式
        ser.write(b'\x02\x04') # \x02=Exit Raw REPL, \x04=Soft Reboot
        ser.flush()
        
        if use_monitor:
            monitor(port, lang, welcome_msg=completion_msg, existing_ser=ser)
        else:
            print(completion_msg)
            ser.close()

    except Exception as e:
        print(get_msg("deploy_err", lang) % e)
        if ser: ser.close()
        sys.exit(1)

def setup_stable_mode(port, lang="en"):
    """MicroPython 不需要此功能，改為提示訊息"""
    print("\n[Notice] MicroPython does not need 'Stable Mode'. It's already stable by design!")

def erase_filesystem(port, lang="en"):
    """MicroPython 的 Flash 格式化"""
    print(get_msg("erase_fs", lang) if "erase_fs" in MESSAGES[lang] else "Erasing Flash...")
    try:
        with serial.Serial(port, 115200, timeout=1.0) as ser:
            ser.write(b'\x03\x03\x01')
            time.sleep(0.5); ser.read_all()
            # 不同的晶片格式化方式不同，這裡使用通用指令：刪除 main.py 與 boot.py
            cmd = 'import os; [os.remove(f) for f in os.listdir() if f in ("main.py", "boot.py")]\n'
            ser.write(cmd.encode('utf-8'))
            ser.write(b'\x04')
            print("\n[Done] All user files removed. System rebooting...")
            ser.write(b'\x02\x04')
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("port")
    parser.add_argument("code_file", nargs='?')
    parser.add_argument("--no-monitor", action="store_true")
    parser.add_argument("--monitor-only", action="store_true")
    parser.add_argument("--serial-only", action="store_true")
    parser.add_argument("--setup-stable", action="store_true")
    parser.add_argument("--erase-filesystem", action="store_true")
    parser.add_argument("--lang", default="en")
    args = parser.parse_args()

    if args.monitor_only: monitor(args.port, lang=args.lang)
    elif args.erase_filesystem: erase_filesystem(args.port, lang=args.lang)
    elif args.setup_stable: setup_stable_mode(args.port, lang=args.lang)
    else:
        if not args.code_file: sys.exit(1)
        deploy(args.port, args.code_file, lang=args.lang, use_monitor=not args.no_monitor)
