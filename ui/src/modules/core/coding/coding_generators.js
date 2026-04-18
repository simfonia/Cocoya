// Coding Generators: coding_generators.js

Blockly.Python.forBlock['py_coding_comment'] = function(block) {
  var text = block.getFieldValue('TEXT');
  var lines = text.split('\n');
  var code = lines.map(line => '# ' + line).join('\n') + '\n';
  return code;
};

Blockly.Python.forBlock['py_coding_raw_statement'] = function(block) {
  var code = block.getFieldValue('TEXT') + '\n';
  return code;
};

Blockly.Python.forBlock['py_coding_raw_expression'] = function(block) {
  var code = block.getFieldValue('TEXT');
  return [code, Blockly.Python.ORDER_ATOMIC];
};
