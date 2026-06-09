if __name__ == "__main__":  # S_ID:*f}*2vL|~Z9Kkyi6F28g
    import machine  # S_ID:kGt.S#2#!d}gw85XzG`8
    import time
    import camera
    # 1. 測試 LED (XIAO S3 的橙色 LED 在 Pin 21，低電位亮)
    led = machine.Pin(21, machine.Pin.OUT)
    def blink(times):
        for _ in range(times):
            led.value(0) # 亮
            time.sleep(0.2)
            led.value(1) # 滅
            time.sleep(0.2)
    print(">>> LED 閃爍測試中...")
    blink(3)
    # 2. 測試相機初始化
    print(">>> 正在初始化相機...")
    try:
        # 初始化相機 (預設參數)
        cam = camera.init()
        print("相機初始化結果:", cam)
        if cam:
            # 設定解析度 (10 代表 800x600, 或是試試更小的 5 代表 400x296)
            camera.framesize(5)
            print(">>> 正在拍攝照片...")
            img = camera.capture() # 拍照
            if img:
                print("📸 拍照成功！圖片大小:", len(img), "bytes")
            else:
                print("❌ 拍照失敗，圖片為空")
            # 釋放相機 (很重要，避免下次初始化失敗)
            camera.deinit()
        else:
            print("❌ 相機硬體初始化失敗，請檢查擴展板是否插好")
    except Exception as e:
        print("❌ 執行過程發生錯誤:", str(e))
    print(">>> 測試結束")
      # E_ID:kGt.S#2#!d}gw85XzG`8  # E_ID:*f}*2vL|~Z9Kkyi6F28g