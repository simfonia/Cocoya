// Loop Generators: loops_generators.js

Blockly.Python.forBlock['py_loop_while'] = function(block, generator) {
  var condition = generator.valueToCode(block, 'CONDITION', Blockly.Python.ORDER_NONE) || 'False';
  var branch = generator.statementToCode(block, 'DO') || '  pass\n';
  return 'while ' + condition + ':\n' + branch;
};

Blockly.Python.forBlock['py_loop_for_range'] = function(block, generator) {
  var variable = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  var start = generator.valueToCode(block, 'START', Blockly.Python.ORDER_NONE) || '0';
  var stop = generator.valueToCode(block, 'STOP', Blockly.Python.ORDER_NONE) || '10';
  var step = generator.valueToCode(block, 'STEP', Blockly.Python.ORDER_NONE) || '1';
  var branch = generator.statementToCode(block, 'DO') || '  pass\n';
  
  var rangeArgs = start + ', ' + stop;
  if (step !== '1') rangeArgs += ', ' + step;
  
  return 'for ' + variable + ' in range(' + rangeArgs + '):\n' + branch;
};

Blockly.Python.forBlock['py_loop_for_in'] = function(block, generator) {
  var variable = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  var iterable = generator.valueToCode(block, 'ITERABLE', Blockly.Python.ORDER_NONE) || '[]';
  var branch = generator.statementToCode(block, 'DO') || '  pass\n';
  return 'for ' + variable + ' in ' + iterable + ':\n' + branch;
};

Blockly.Python.forBlock['py_loop_flow_control'] = function(block) {
  return block.getFieldValue('FLOW') + '\n';
};

Blockly.Python.forBlock['py_loop_enumerate'] = function(block, generator) {
  var varI = generator.nameDB_.getName(block.getFieldValue('VAR_I'), Blockly.VARIABLE_CATEGORY_NAME);
  var varItem = generator.nameDB_.getName(block.getFieldValue('VAR_ITEM'), Blockly.VARIABLE_CATEGORY_NAME);
  var list = generator.valueToCode(block, 'LIST', Blockly.Python.ORDER_NONE) || '[]';
  var branch = generator.statementToCode(block, 'DO') || '  pass\n';
  return 'for ' + varI + ', ' + varItem + ' in enumerate(' + list + '):\n' + branch;
};

Blockly.Python.forBlock['py_loop_items'] = function(block, generator) {
  var varK = generator.nameDB_.getName(block.getFieldValue('VAR_K'), Blockly.VARIABLE_CATEGORY_NAME);
  var varV = generator.nameDB_.getName(block.getFieldValue('VAR_V'), Blockly.VARIABLE_CATEGORY_NAME);
  var dict = generator.valueToCode(block, 'DICT', Blockly.Python.ORDER_NONE) || '{}';
  var branch = generator.statementToCode(block, 'DO') || '  pass\n';
  return 'for ' + varK + ', ' + varV + ' in ' + dict + '.items():\n' + branch;
};
