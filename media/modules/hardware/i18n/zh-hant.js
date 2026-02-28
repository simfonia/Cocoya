(function (Blockly) {
  Object.assign(Blockly.Msg, {
    "HW_SET_LED": "設定內建 LED %1",
    "HW_SET_LED_ON": "開啟",
    "HW_SET_LED_OFF": "關閉",
    "HW_SET_LED_TOOLTIP": "控制開發板上的內建 LED 燈。",
    "HW_STOP_PROGRAM": "sys.exit() (結束程式)",
    "HW_STOP_PROGRAM_TOOLTIP": "立即停止目前的 CircuitPython 程式執行，並進入 REPL 直譯環境（可與硬體互動）。",
    "HW_RESET": "microcontroller.reset() (重新啟動)",
    "HW_RESET_TOOLTIP": "立即重新啟動硬體裝置，程式將會從頭開始執行。"
  });
})(Blockly);
