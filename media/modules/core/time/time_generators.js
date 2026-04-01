/**
 * Time Generators: time_generators.js
 * Python code generation for time-related functions.
 */

// Ensure 'time' module is imported.
// The generator will automatically add 'import time' if it's not already present.

Blockly.Python.forBlock['py_time_sleep'] = function(block, generator) {
  generator.definitions_['import_time'] = 'import time';
  var sec = generator.valueToCode(block, 'SECONDS', Blockly.Python.ORDER_NONE) || "1";
  return 'time.sleep(' + sec + ')\n';
};

Blockly.Python.forBlock['py_time_now'] = function(block, generator) {
  generator.definitions_['import_time'] = 'import time';
  return ['time.time()', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['py_time_monotonic'] = function(block, generator) {
  generator.definitions_['import_time'] = 'import time';
  return ['time.monotonic()', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['py_time_localtime'] = function(block, generator) {
  generator.definitions_['import_time'] = 'import time';
  var sec = generator.valueToCode(block, 'SECONDS', Blockly.Python.ORDER_NONE) || 'time.time()';
  return ['time.localtime(' + sec + ')', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['py_time_strftime'] = function(block, generator) {
  generator.definitions_['import_time'] = 'import time';
  var format_str = generator.valueToCode(block, 'FORMAT', Blockly.Python.ORDER_NONE) || "'%Y-%m-%d %H:%M:%S'";
  var time_obj = generator.valueToCode(block, 'TIME', Blockly.Python.ORDER_NONE) || 'time.localtime()';

  if (generator.PLATFORM === 'CircuitPython') {
    // CircuitPython's time module doesn't have strftime.
    // We inject a small helper that handles the most common format.
    generator.definitions_['func_cocoya_strftime'] = `
def cocoya_strftime(fmt, t):
    # Basic strftime fallback for CircuitPython (only %Y, %m, %d, %H, %M, %S)
    res = fmt.replace('%Y', '{:04d}').replace('%m', '{:02d}').replace('%d', '{:02d}')
    res = res.replace('%H', '{:02d}').replace('%M', '{:02d}').replace('%S', '{:02d}')
    # t is a struct_time or a tuple
    try:
        return res.format(t[0], t[1], t[2], t[3], t[4], t[5])
    except:
        return str(t)
`;
    return ['cocoya_strftime(' + format_str + ', ' + time_obj + ')', Blockly.Python.ORDER_FUNCTION_CALL];
  }
  
  return ['time.strftime(' + format_str + ', ' + time_obj + ')', Blockly.Python.ORDER_FUNCTION_CALL];
};
