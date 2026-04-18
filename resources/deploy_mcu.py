import serial
import sys
import time
import os
import ctypes
from ctypes import windll

def get_drives():
    """獲取 Windows 上的所有磁碟機路徑"""
    drives = []
    bitmask = windll.kernel32.GetLogicalDrives()
    for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        if bitmask & 1:
            drives.append(letter + ":\\")
        bitmask >>= 1
    return drives

def monitor(port, baud=115200):
    """進入序列埠監看模式，具備自動重連功能"""
    print("-" * 40)
    print(f"--- Serial Monitor on {port} (Press Ctrl+C to stop) ---")
    print("-" * 40)
    
    ser = None
    while True:
        try:
            if ser is None:
                try:
                    ser = serial.Serial(port, baud, timeout=0.1)
                    print(f"\n[Connected to {port}]")
                except:
                    # 埠號不存在或被佔用 (可能正在拔插)，等待插回
                    sys.stdout.write(".")
                    sys.stdout.flush()
                    time.sleep(1.0)
                    continue

            if ser.in_waiting > 0:
                data = ser.read(ser.in_waiting).decode('utf-8', errors='ignore')
                sys.stdout.write(data)
                sys.stdout.flush()
            time.sleep(0.05)

        except (serial.SerialException, PermissionError, OSError) as e:
            print(f"\n[Disconnected: {e}] Waiting for device...")
            if ser:
                try: ser.close()
                except: pass
            ser = None
            time.sleep(0.2)
        except KeyboardInterrupt:
            print("\n--- Monitor Stopped ---")
            if ser:
                try: ser.close()
                except: pass
            break

def deploy(port, code_filename, use_monitor=True):
    """執行 MCU 部署邏輯"""
    print("--- Cocoya MCU Deployer ---")
    
    if not os.path.exists(code_filename):
        print(f"Error: Source code file not found: {code_filename}")
        sys.exit(1)

    with open(code_filename, 'r', encoding='utf-8') as f:
        code_content = f.read()

    # --- 方案 A: 嘗試尋找 CIRCUITPY 磁碟 (Windows 優先) ---
    print("Checking for CIRCUITPY drive...")
    target_drive = None
    try:
        for drive in get_drives():
            try:
                label = ctypes.create_unicode_buffer(1024)
                windll.kernel32.GetVolumeInformationW(drive, label, 1024, None, None, None, None, 0)
                if label.value == "CIRCUITPY":
                    target_drive = drive
                    break
            except:
                continue
    except Exception as e:
        print(f"Drive scan error: {e}")

    if target_drive:
        target_path = os.path.normpath(os.path.join(target_drive, "code.py"))
        
        print("\n>>> 上傳中，請勿斷開 USB 連線 <<<")
        success = False
        import subprocess
        for attempt in range(3):
            try:
                # 方案 A: 呼叫 Windows 系統原生的 copy 指令
                temp_file = os.path.normpath(code_filename + ".tmp")
                with open(temp_file, "wb") as f:
                    f.write(code_content.encode("utf-8"))
                
                cmd = f'copy /Y "{temp_file}" "{target_path}"'
                result = subprocess.run(cmd, capture_output=True, text=True, shell=True)
                
                if result.returncode == 0:
                    time.sleep(0.2)
                    with open(target_path, "rb") as f_check:
                        written_content = f_check.read().decode('utf-8', errors='ignore')
                        if written_content.strip() == code_content.strip():
                            success = True
                            if os.path.exists(temp_file): os.remove(temp_file)
                            break
                
                if os.path.exists(temp_file): os.remove(temp_file)
                time.sleep(0.5)
            except Exception as e:
                time.sleep(0.5)

        if success:
            print("\n" + "="*40)
            print("上傳完畢，可斷開 USB 連線")
            print("="*40 + "\n")
            
            # 透過 Serial 觸發重啟 (Ctrl-D)
            try:
                temp_ser = serial.Serial(port, 115200, timeout=0.1)
                temp_ser.write(b'\x03\x03\x04') 
                temp_ser.close()
            except:
                pass
            
            if use_monitor:
                monitor(port)
            return
        else:
            print(f"Drive write failed after retries. Falling back to Serial REPL...")

    # --- 方案 B: 透過 Serial REPL 寫入 ---
    try:
        print(f"Connecting to {port} via Serial...")
        ser = serial.Serial(port, 115200, timeout=0.1)
        
        print("\n>>> 上傳中，請勿斷開 USB 連線 <<<")
        
        # 強制中斷並進入 Raw REPL
        ser.write(b'\r\n\x03\x03\x03') 
        time.sleep(0.5)
        ser.write(b'\x04') 
        time.sleep(1.0) 
        ser.write(b'\x03\x03') 
        time.sleep(0.2)
        
        ser.write(b'\x01') 
        time.sleep(0.5)
        
        response = ser.read_all().decode('utf-8', errors='ignore')
        if "raw REPL" not in response:
            print("Failed to enter Raw REPL.")
            sys.exit(1)

        print("Uploading code via REPL...")
        write_cmd = f'f = open("code.py", "w"); f.write({repr(code_content)}); f.close()\n'
        ser.write(write_cmd.encode('utf-8'))
        ser.write(b'\x04') 
        
        time.sleep(0.5)
        result = ser.read_all().decode('utf-8', errors='ignore')
        
        if "OSError" in result:
            print("\n[ERROR] MCU 磁碟目前為唯讀狀態。")
            ser.close()
            sys.exit(1)
            
        print("\n" + "="*40)
        print("上傳完畢，可斷開 USB 連線")
        print("="*40 + "\n")
        
        ser.close() 
        if use_monitor:
            monitor(port)
    except Exception as e:
        print(f"Error during Serial REPL deployment: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python deploy_mcu.py <PORT> <CODE_FILE> [--no-monitor]")
        sys.exit(1)
    
    _port = sys.argv[1]
    _code_file = sys.argv[2]
    _use_monitor = True
    if len(sys.argv) > 3 and sys.argv[3] == "--no-monitor":
        _use_monitor = False

    deploy(_port, _code_file, _use_monitor)
