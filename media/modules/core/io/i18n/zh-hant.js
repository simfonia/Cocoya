(function (Blockly) {
  Object.assign(Blockly.Msg, {
  "IO_LBL_TERMINAL": "Standard I/O (標準輸入/輸出)",
  "IO_LBL_SERIAL": "Serial Communication (序列埠通訊)",
  "IO_PRINT": "print( %1 )",
  "IO_INPUT": "input( %1 )",
  "IO_SERIAL_INIT": "ser = Serial( %1, baudrate=%2 )",
  "IO_SERIAL_INIT_TOOLTIP": "建立序列埠通訊。請指定正確的埠號 (如 'COM3') 與波特率 (通常為 9600)。這是與外部硬體通訊的第一步。",
  "IO_SERIAL_READ": "ser.readline()",
  "IO_SERIAL_WRITE": "ser.write( %1 )",
  "IO_SERIAL_WRITE_TOOLTIP": "將資料發送到已連接的序列埠裝置（如傳送指令給 Arduino）。資料通常為字串或數值。",
  "IO_SERIAL_AVAILABLE": "ser.in_waiting > 0",
  "IO_SERIAL_FLUSH": "ser.flushInput()",
  "IO_SERIAL_TOOLTIP": "處理與 Arduino 或其他硬體裝置的序列埠通訊。",
  "IO_SERIAL_AVAILABLE_TOOLTIP": "判斷目前序列埠是否有新資料傳入。如果有資料正在「緩衝區」排隊等候讀取，則傳回 True；否則傳回 False。常用於配合 if 判斷式使用。",
  "IO_SERIAL_READ_TOOLTIP": "讀取序列埠資料直到換行符。此積木會自動排空緩衝區，僅取得最新進入緩衝區的一行資料。",
  "IO_SLEEP": "time.sleep( %1 )",
  "IO_SLEEP_TOOLTIP": "暫停程式執行指定的秒數 (s)。"
});
})(Blockly);
