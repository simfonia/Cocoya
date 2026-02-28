(function (Blockly) {
  Object.assign(Blockly.Msg, {
  "IO_LBL_TERMINAL": "Standard I/O",
  "IO_LBL_SERIAL": "Serial Communication",
  "IO_PRINT": "print( %1 )",
  "IO_INPUT": "input( %1 )",
  "IO_SERIAL_INIT": "ser = Serial( %1, baudrate=%2 )",
  "IO_SERIAL_INIT_TOOLTIP": "Establish a serial connection. Specify the port (e.g., 'COM3') and baud rate (e.g., 9600).",
  "IO_SERIAL_READ": "ser.readline()",
  "IO_SERIAL_WRITE": "ser.write( %1 )",
  "IO_SERIAL_WRITE_TOOLTIP": "Send data to the connected serial device (e.g., sending commands to Arduino).",
  "IO_SERIAL_AVAILABLE": "ser.in_waiting > 0",
  "IO_SERIAL_FLUSH": "ser.flushInput()",
  "IO_SERIAL_TOOLTIP": "Handle serial communication with Arduino or other hardware devices.",
  "IO_SERIAL_AVAILABLE_TOOLTIP": "Check if there is incoming data waiting in the serial buffer. Returns True if data exists, False otherwise.",
  "IO_SERIAL_READ_TOOLTIP": "Read data from the serial port until a newline character.",
  "IO_SLEEP": "time.sleep( %1 )",
  "IO_SLEEP_TOOLTIP": "Pause the program for a specified number of seconds."
});
})(Blockly);
