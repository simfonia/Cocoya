(function (Blockly) {
  Object.assign(Blockly.Msg, {
    "HW_SET_LED": "內建 LED %1",
    "HW_SET_LED_ON": "開啟",
    "HW_SET_LED_OFF": "關閉",
    "HW_SET_LED_TOOLTIP": "控制開發板上的內建 LED 燈。",
    "HW_STOP_PROGRAM": "sys.exit() (結束程式)",
    "HW_STOP_PROGRAM_TOOLTIP": "停止程式執行。",
    "HW_RESET": "microcontroller.reset() (重新啟動)",
    "HW_RESET_TOOLTIP": "重新啟動硬體。",
    
    // --- 腳位控制文字優化 ---
    "HW_DIGITAL_WRITE": "數位輸出 腳位 %1 %2",
    "HW_DIGITAL_READ": "數位讀入 腳位 %1",
    "HW_ANALOG_READ": "類比讀入 腳位 %1",
    "HW_PWM_WRITE": "PWM 輸出 腳位 %1 %2",
    "HW_I2C_SCAN": "I2C 掃描",
    "HW_PIN_HIGH": "高電位",
    "HW_PIN_LOW": "低電位",
    
    // --- 精簡版 Tooltip ---
    "HW_DIGITAL_WRITE_TOOLTIP": "數位輸出: 高電位 (True) 或 低電位 (False)",
    "HW_DIGITAL_READ_TOOLTIP": "數位讀入: 回傳布林值 (True/False)",
    "HW_ANALOG_READ_TOOLTIP": "類比讀入: 回傳數值 (0-65535)",
    "HW_PWM_WRITE_TOOLTIP": "PWM 輸出: 設定佔空比 (0-100% 或 0-65535)",
    "HW_I2C_SCAN_TOOLTIP": "I2C 掃描: 回傳裝置地址清單"
  });
})(Blockly);
