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
  generator.definitions_['import_serial'] = 'import serial';
  var port = generator.valueToCode(block, 'PORT', Blockly.Python.ORDER_NONE) || "'COM1'";
  var baud = block.getFieldValue('BAUD');
  // 使用 0.01s 超時以防止無 sleep 迴圈時 CPU 過載，同時維持高反應度
  return 'ser = serial.Serial(' + port + ', ' + baud + ', timeout=0.01, write_timeout=0)\n';
};

Blockly.Python.forBlock['py_io_serial_read'] = function(block, generator) {
  // 注入「讀取最新一筆」的輔助函式
  generator.definitions_['func_get_latest_serial'] = `
def cocoya_get_latest_serial(s):
    # 讀取目前緩衝區所有資料，僅保留最後一行
    line = s.readline()
    while s.in_waiting > 0:
        line = s.readline()
    return line.decode('utf-8', errors='ignore').strip()
`;
  return ["cocoya_get_latest_serial(ser)", Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['py_io_serial_write'] = function(block, generator) {
  var data = generator.valueToCode(block, 'DATA', Blockly.Python.ORDER_NONE) || "''";
  // Python 寫入序列埠需要先轉為 bytes，通常加上換行符以便對方讀取
  return 'ser.write((str(' + data + ') + "\\n").encode(\'utf-8\'))\n';
};

Blockly.Python.forBlock['py_io_serial_available'] = function(block, generator) {
  // 加入微型 sleep (1ms) 以保護 CPU 不會在 if 判斷失敗時瘋狂空轉
  generator.definitions_['import_time'] = 'import time';
  return ["(time.sleep(0.001) or ser.in_waiting > 0)", Blockly.Python.ORDER_RELATIONAL];
};

Blockly.Python.forBlock['py_io_sleep'] = function(block, generator) {
  generator.definitions_['import_time'] = 'import time';
  var sec = generator.valueToCode(block, 'SECONDS', Blockly.Python.ORDER_NONE) || "1";
  return 'time.sleep(' + sec + ')\n';
};

Blockly.Python.forBlock['py_io_serial_flush'] = function(block, generator) {
  return 'ser.reset_input_buffer()\n';
};
