// Logic Generators: logic_generators.js

Blockly.Python.forBlock['py_logic_if'] = function(block, generator) {
  var n = 0;
  var code = '';
  // IF
  var condition = generator.valueToCode(block, 'IF' + n, Blockly.Python.ORDER_NONE) || 'False';
  var branch = generator.statementToCode(block, 'DO' + n) || '  pass\n';
  code += 'if ' + condition + ':\n' + branch;
  
  // ELIF
  for (n = 1; n <= block.elifCount_; n++) {
    condition = generator.valueToCode(block, 'IF' + n, Blockly.Python.ORDER_NONE) || 'False';
    branch = generator.statementToCode(block, 'DO' + n) || '  pass\n';
    code += 'elif ' + condition + ':\n' + branch;
  }
  
  // ELSE
  if (block.elsePresent_) {
    branch = generator.statementToCode(block, 'ELSE') || '  pass\n';
    code += 'else:\n' + branch;
  }
  return code;
};

Blockly.Python.forBlock['py_logic_compare'] = function(block, generator) {
  var operator = block.getFieldValue('OP');
  var order = Blockly.Python.ORDER_RELATIONAL;
  var argument0 = generator.valueToCode(block, 'A', order) || '0';
  var argument1 = generator.valueToCode(block, 'B', order) || '0';
  return [argument0 + ' ' + operator + ' ' + argument1, order];
};

Blockly.Python.forBlock['py_logic_operation'] = function(block, generator) {
  var operator = block.getFieldValue('OP');
  var order = (operator == 'and') ? Blockly.Python.ORDER_LOGICAL_AND : Blockly.Python.ORDER_LOGICAL_OR;
  var argument0 = generator.valueToCode(block, 'A', order) || 'False';
  var argument1 = generator.valueToCode(block, 'B', order) || 'False';
  return [argument0 + ' ' + operator + ' ' + argument1, order];
};

Blockly.Python.forBlock['py_logic_negate'] = function(block, generator) {
  var argument0 = generator.valueToCode(block, 'BOOL', Blockly.Python.ORDER_LOGICAL_NOT) || 'False';
  return ['not ' + argument0, Blockly.Python.ORDER_LOGICAL_NOT];
};

Blockly.Python.forBlock['py_logic_boolean'] = function(block) {
  return [block.getFieldValue('BOOL'), Blockly.Python.ORDER_ATOMIC];
};
