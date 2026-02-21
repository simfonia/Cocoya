import serial



# PC 端序列埠讀取範例  # S_ID:c1  # S_ID:def_root
# 1. 請先執行 'pip install pyserial' 才能運行此程式。
# 2. 修改下面 'COM3' 為你偵測到的埠號。  # E_ID:c1
ser = serial.Serial('COM5', 9600, timeout=1)  # S_ID:ser_init  # E_ID:ser_init  # E_ID:def_root

if __name__ == "__main__":  # S_ID:main_root
    print('--- PC Serial Listener Started ---')  # S_ID:p1  # E_ID:p1
    while True:  # S_ID:w1
        if ser.in_waiting > 0:  # S_ID:if1
            received_data = ser.readline().decode('utf-8').strip()  # S_ID:s1  # E_ID:s1
            print(f"""> {received_data}""")  # S_ID:p2  # E_ID:p2  # E_ID:if1  # E_ID:w1  # E_ID:main_root