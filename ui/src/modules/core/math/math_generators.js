// Math Generators: math_generators.js

Blockly.Python.forBlock['py_math_number'] = function(block) {
  var code = String(block.getFieldValue('NUM'));
  return [code, Blockly.Python.ORDER_ATOMIC];
};

Blockly.Python.forBlock['py_math_arithmetic'] = function(block, generator) {
  var operator = block.getFieldValue('OP');
  var order;
  switch (operator) {
    case '+': case '-': order = Blockly.Python.ORDER_ADDITIVE; break;
    case '*': case '/': case '%': order = Blockly.Python.ORDER_MULTIPLICATIVE; break;
    case '**': order = Blockly.Python.ORDER_EXPONENTIATION; break;
  }
  var argument0 = generator.valueToCode(block, 'A', order) || '0';
  var argument1 = generator.valueToCode(block, 'B', order) || '0';
  return [argument0 + ' ' + operator + ' ' + argument1, order];
};

Blockly.Python.forBlock['py_math_single'] = function(block, generator) {
  var op = block.getFieldValue('OP');
  var num = generator.valueToCode(block, 'NUM', Blockly.Python.ORDER_NONE) || '0';
  
  if (op === 'math.atan2') {
    return [op + '(*' + num + ')', Blockly.Python.ORDER_FUNCTION_CALL];
  }
  return [op + '(' + num + ')', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['py_math_round'] = function(block, generator) {
  var num = generator.valueToCode(block, 'NUM', Blockly.Python.ORDER_NONE) || '0';
  return ['round(' + num + ')', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['py_math_random'] = function(block, generator) {
  var from = generator.valueToCode(block, 'FROM', Blockly.Python.ORDER_NONE) || '1';
  var to = generator.valueToCode(block, 'TO', Blockly.Python.ORDER_NONE) || '10';
  return ['random.randint(' + from + ', ' + to + ')', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['py_math_atan2'] = function(block, generator) {
  var y = generator.valueToCode(block, 'Y', Blockly.Python.ORDER_NONE) || '0';
  var x = generator.valueToCode(block, 'X', Blockly.Python.ORDER_NONE) || '1';
  return ['math.atan2(' + y + ', ' + x + ')', Blockly.Python.ORDER_FUNCTION_CALL];
};
