(function (Blockly) {
  Object.assign(Blockly.Msg, {
  "IO_LBL_TERMINAL": "標準輸入/輸出",
  "IO_LBL_SERIAL": "序列埠通訊 (Serial)",
  "IO_SERIAL_INIT": "初始化序列埠 埠號 %1 波特率 %2",
  "IO_SERIAL_READ": "序列埠讀取一行",
  "IO_SERIAL_WRITE": "序列埠寫入 %1",
  "IO_SERIAL_AVAILABLE": "序列埠有新資料？",
  "IO_SERIAL_FLUSH": "清空序列埠舊資料 (Flush)",
  "IO_SERIAL_TOOLTIP": "處理與 Arduino 或其他硬體裝置的序列埠通訊。",
  "IO_SERIAL_READ_TOOLTIP": "讀取序列埠資料直到換行符。此積木會自動排空緩衝區，僅取得最新進入緩衝區的一行資料。",
  "IO_SLEEP": "等待 %1 秒",
  "IO_SLEEP_TOOLTIP": "暫停程式執行指定的秒數。"
});
})(Blockly);
