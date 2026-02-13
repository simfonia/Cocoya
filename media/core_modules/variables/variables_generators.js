// Variables Generators: variables_generators.js

Blockly.Python.forBlock['py_variables_set'] = function(block, generator) {
  var variable = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  var value = generator.valueToCode(block, 'VALUE', Blockly.Python.ORDER_NONE) || 'None';
  return variable + ' = ' + value + '\n';
};

Blockly.Python.forBlock['py_variables_get'] = function(block, generator) {
  var variable = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  return [variable, Blockly.Python.ORDER_ATOMIC];
};

Blockly.Python.forBlock['py_variables_global'] = function(block, generator) {
  var vars = [];
  for (var i = 0; i < block.itemCount_; i++) {
    vars.push(generator.nameDB_.getName(block.getFieldValue('VAR' + i), Blockly.VARIABLE_CATEGORY_NAME));
  }
  return 'global ' + vars.join(', ') + '\n';
};
