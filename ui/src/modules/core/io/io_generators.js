/**
 * IO Generators: io_generators.js
 * Python code generation for standard input and output.
 */

Blockly.Python.forBlock['py_io_print'] = function(block, generator) {
  var text = generator.valueToCode(block, 'TEXT', Blockly.Python.ORDER_NONE) || "''";
  return 'print(' + text + ')\n';
};

Blockly.Python.forBlock['py_io_input'] = function(block, generator) {
  var prompt = generator.valueToCode(block, 'PROMPT', Blockly.Python.ORDER_NONE) || "''";
  return ['input(' + prompt + ')', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['py_io_serial_init'] = function(block, generator) {
  if (generator.PLATFORM === 'MicroPython') {
    // MicroPython 預設透過 USB REPL (sys.stdin/stdout) 通訊，無須初始化
    return '# Serial initialized via REPL (default)\n';
  }
  generator.definitions_['import_serial'] = 'import serial';
  var port = generator.valueToCode(block, 'PORT', Blockly.Python.ORDER_NONE) || "'COM1'";
  var baud = block.getFieldValue('BAUD');
  return 'ser = serial.Serial(' + port + ', ' + baud + ', timeout=0.01, write_timeout=0)\n';
};

Blockly.Python.forBlock['py_io_serial_read'] = function(block, generator) {
  if (generator.PLATFORM === 'MicroPython') {
    generator.definitions_['import_sys'] = 'import sys';
    generator.definitions_['func_get_latest_serial_mcu'] = `
def cocoya_get_latest_serial():
    import sys
    # MicroPython 讀取 stdin，排空至最新一筆
    line = ""
    while True:
        # 這裡需要非阻塞讀取，通常透過 select 或 poll 實作，
        # 為求教學簡單，暫以基本 read 取代或建議改用 print()
        # 注意：MP 的 stdin.read() 會阻塞
        break 
    return line
`;
    return ["sys.stdin.readline().strip()", Blockly.Python.ORDER_FUNCTION_CALL];
  }
  // ... rest of method ...
  generator.definitions_['func_get_latest_serial'] = `
def cocoya_get_latest_serial(s):
    line = s.readline()
    while s.in_waiting > 0:
        line = s.readline()
    return line.decode('utf-8', errors='ignore').strip()
`;
  return ["cocoya_get_latest_serial(ser)", Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['py_io_serial_write'] = function(block, generator) {
  var data = generator.valueToCode(block, 'DATA', Blockly.Python.ORDER_NONE) || "''";
  if (generator.PLATFORM === 'MicroPython') {
     return 'print(str(' + data + '))\n';
  }
  return 'ser.write((str(' + data + ') + "\\n").encode(\'utf-8\'))\n';
};

Blockly.Python.forBlock['py_io_serial_available'] = function(block, generator) {
  if (generator.PLATFORM === 'MicroPython') {
    generator.definitions_['import_uselect'] = 'import uselect';
    generator.definitions_['import_sys'] = 'import sys';
    return ["uselect.select([sys.stdin], [], [], 0)[0]", Blockly.Python.ORDER_RELATIONAL];
  }
  generator.definitions_['import_time'] = 'import time';
  return ["(time.sleep(0.001) or ser.in_waiting > 0)", Blockly.Python.ORDER_RELATIONAL];
};

Blockly.Python.forBlock['py_io_serial_flush'] = function(block, generator) {
  return 'ser.reset_input_buffer()\n';
};
