(function (Blockly) {
  Object.assign(Blockly.Msg, {
  "IO_LBL_TERMINAL": "Terminal I/O",
  "IO_LBL_SERIAL": "Serial Communication",
  "IO_SERIAL_INIT": "Init Serial Port %1 Baud %2",
  "IO_SERIAL_READ": "Serial Read Line",
  "IO_SERIAL_WRITE": "Serial Write %1",
  "IO_SERIAL_AVAILABLE": "Serial Data Available?",
  "IO_SERIAL_TOOLTIP": "Handles serial communication with Arduino or other hardware devices.",
  "IO_SERIAL_READ_TOOLTIP": "Reads data until a newline. Automatically flushes older data to retrieve only the latest line in the buffer.",
  "IO_SLEEP": "wait %1 seconds",
  "IO_SLEEP_TOOLTIP": "Pause program execution for a given number of seconds."
});
})(Blockly);
