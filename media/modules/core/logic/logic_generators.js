// Logic Generators: logic_generators.js

Blockly.Python.forBlock['py_logic_if'] = function(block, generator) {
  var n = 0;
  var code = '';
  // IF
  var condition = generator.valueToCode(block, 'IF' + n, Blockly.Python.ORDER_NONE) || 'False';
  var branch = generator.statementToCode(block, 'DO' + n) || generator.INDENT + 'pass\n';
  code += 'if ' + condition + ':\n' + branch;
  
  // ELIF
  for (n = 1; n <= block.elifCount_; n++) {
    condition = generator.valueToCode(block, 'IF' + n, Blockly.Python.ORDER_NONE) || 'False';
    branch = generator.statementToCode(block, 'DO' + n) || generator.INDENT + 'pass\n';
    code += 'elif ' + condition + ':\n' + branch;
  }
  
  // ELSE
  if (block.elsePresent_) {
    branch = generator.statementToCode(block, 'ELSE') || generator.INDENT + 'pass\n';
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

Blockly.Python.forBlock['py_logic_ternary'] = function(block, generator) {
  var valueIf = generator.valueToCode(block, 'IF', Blockly.Python.ORDER_CONDITIONAL) || 'False';
  var valueThen = generator.valueToCode(block, 'THEN', Blockly.Python.ORDER_CONDITIONAL) || 'None';
  var valueElse = generator.valueToCode(block, 'ELSE', Blockly.Python.ORDER_CONDITIONAL) || 'None';
  var code = valueThen + ' if ' + valueIf + ' else ' + valueElse;
  return [code, Blockly.Python.ORDER_CONDITIONAL];
};
