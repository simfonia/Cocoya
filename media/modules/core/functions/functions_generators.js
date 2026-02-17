// Functions Generators: functions_generators.js

Blockly.Python.forBlock['py_function_def'] = function(block, generator) {
  var name = generator.nameDB_.getName(block.getFieldValue('NAME'), Blockly.PROCEDURE_CATEGORY_NAME);
  
  // 遍歷所有參數名
  var params = [];
  for (var i = 0; i < block.paramCount_; i++) {
    params.push(block.getFieldValue('PRM' + i));
  }
  
  var branch = generator.statementToCode(block, 'DO') || generator.INDENT + 'pass\n';
  return 'def ' + name + '(' + params.join(', ') + '):\n' + branch;
};

Blockly.Python.forBlock['py_function_return'] = function(block, generator) {
  var value = generator.valueToCode(block, 'VALUE', Blockly.Python.ORDER_NONE) || '';
  return 'return ' + value + '\n';
};

Blockly.Python.forBlock['py_function_call'] = function(block, generator) {
  var name = block.getFieldValue('NAME');
  
  // 遍歷所有傳入值
  var args = [];
  for (var i = 0; i < block.argCount_; i++) {
    args.push(generator.valueToCode(block, 'ARG' + i, Blockly.Python.ORDER_NONE) || 'None');
  }
  
  return name + '(' + args.join(', ') + ')\n';
};

Blockly.Python.forBlock['py_function_call_expr'] = function(block, generator) {
  var name = block.getFieldValue('NAME');
  var args = [];
  for (var i = 0; i < block.argCount_; i++) {
    args.push(generator.valueToCode(block, 'ARG' + i, Blockly.Python.ORDER_NONE) || 'None');
  }
  return [name + '(' + args.join(', ') + ')', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['py_function_local_set'] = function(block, generator) {
  var varName = block.getFieldValue('VAR');
  var value = generator.valueToCode(block, 'VALUE', Blockly.Python.ORDER_NONE) || 'None';
  return varName + ' = ' + value + '\n';
};

Blockly.Python.forBlock['py_function_local_get'] = function(block) {
  var varName = block.getFieldValue('VAR');
  return [varName, Blockly.Python.ORDER_ATOMIC];
};
