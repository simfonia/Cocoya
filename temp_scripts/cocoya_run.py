import serial
import time


def cocoya_get_latest_serial(s):
    # 讀取目前緩衝區所有資料，僅保留最後一行
    line = s.readline()
    while s.in_waiting > 0:
        line = s.readline()
    return line.decode('utf-8', errors='ignore').strip()


# PC 端序列埠讀取範例 (自動讀取最新數據版)  # S_ID:c1  # S_ID:def_root
# 1. 請先執行 'pip install pyserial'。
# 2. 修改下面 'COM5' 為你的埠號。  # E_ID:c1
ser = serial.Serial('COM5', 9600, timeout=0.01, write_timeout=0)  # S_ID:ser_init  # E_ID:ser_init  # E_ID:def_root

if __name__ == "__main__":  # S_ID:main_root
    print('--- PC Serial Listener Started ---')  # S_ID:p1  # E_ID:p1
    while True:  # S_ID:w1
        if (time.sleep(0.001) or ser.in_waiting > 0):  # S_ID:if1
            received_data = cocoya_get_latest_serial(ser)  # S_ID:s1  # E_ID:s1
            print(f"""> {received_data}""")  # S_ID:p2  # E_ID:p2
            time.sleep(1)  # S_ID:N]D/t0?W}X|QO8SjM]cU  # E_ID:N]D/t0?W}X|QO8SjM]cU  # E_ID:if1  # E_ID:w1  # E_ID:main_root