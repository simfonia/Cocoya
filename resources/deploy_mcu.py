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

def monitor(ser):
    """進入序列埠監看模式"""
    print("-" * 40)
    print("--- Serial Monitor (Press Ctrl+C to stop) ---")
    print("-" * 40)
    try:
        while True:
            if ser.in_waiting > 0:
                data = ser.read(ser.in_waiting).decode('utf-8', errors='ignore')
                sys.stdout.write(data)
                sys.stdout.flush()
            time.sleep(0.01)
    except KeyboardInterrupt:
        print("\n--- Monitor Stopped ---")
    finally:
        ser.close()

def deploy(port, code_filename):
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
        print(f"Found CIRCUITPY at {target_drive}. Writing directly...")
        try:
            target_path = os.path.join(target_drive, "code.py")
            with open(target_path, "w", encoding="utf-8") as f:
                f.write(code_content)
            print("Direct drive write successful! Triggering reboot...")
            
            # 透過 Serial 觸發重啟並進入監看
            try:
                ser = serial.Serial(port, 115200, timeout=0.1)
                ser.write(b'\x03\x03\x04') # 中斷並重啟
                monitor(ser)
            except Exception as e:
                print(f"Reboot/Monitor failed: {e}")
            return
        except Exception as e:
            print(f"Drive write failed: {e}. Falling back to Serial REPL...")

    # --- 方案 B: 透過 Serial REPL 寫入 ---
    try:
        print(f"Connecting to {port} via Serial...")
        ser = serial.Serial(port, 115200, timeout=0.1)
        
        # 中斷執行並進入 Raw REPL
        ser.write(b'\x03\x03') 
        time.sleep(0.5)
        ser.write(b'\x01') # Ctrl-A
        time.sleep(0.5)
        
        response = ser.read_all().decode('utf-8', errors='ignore')
        if "raw REPL" not in response:
            print("Failed to enter Raw REPL. Make sure the device is not in another mode.")
            sys.exit(1)

        print("Uploading code via REPL...")
        # 建立寫入指令並發送到 REPL
        write_cmd = f'f = open("code.py", "w"); f.write({repr(code_content)}); f.close()\n'
        ser.write(write_cmd.encode('utf-8'))
        ser.write(b'\x04') # Ctrl-D 執行
        
        time.sleep(0.5)
        result = ser.read_all().decode('utf-8', errors='ignore')
        
        if "OSError" in result:
            print("\n[ERROR] MCU 磁碟目前為唯讀狀態。")
            print("請嘗試直接存入 CIRCUITPY 磁碟，或在 boot.py 中開放寫入權限。")
            sys.exit(1)
            
        print("Serial deployment completed! Entering monitor...")
        monitor(ser)
    except Exception as e:
        print(f"Error during Serial REPL deployment: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python deploy_mcu.py <PORT> <CODE_FILE>")
        sys.exit(1)
    deploy(sys.argv[1], sys.argv[2])
