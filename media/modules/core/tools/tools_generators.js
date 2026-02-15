// Tools Generators: tools_generators.js

Blockly.Python.forBlock['py_tools_print'] = function(block, generator) {
  var text = generator.valueToCode(block, 'TEXT', Blockly.Python.ORDER_NONE) || "''";
  return 'print(' + text + ')\n';
};

Blockly.Python.forBlock['py_tools_input'] = function(block, generator) {
  var prompt = generator.valueToCode(block, 'PROMPT', Blockly.Python.ORDER_NONE) || "''";
  return ['input(' + prompt + ')', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['py_tools_comment'] = function(block) {
  var text = block.getFieldValue('TEXT');
  var lines = text.split('\n');
  var code = lines.map(line => '# ' + line).join('\n') + '\n';
  return code;
};

Blockly.Python.forBlock['py_tools_raw_statement'] = function(block) {
  var code = block.getFieldValue('TEXT') + '\n';
  return code;
};

Blockly.Python.forBlock['py_tools_raw_expression'] = function(block) {
  var code = block.getFieldValue('TEXT');
  return [code, Blockly.Python.ORDER_ATOMIC];
};
