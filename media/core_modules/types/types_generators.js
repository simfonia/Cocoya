// Types Generators: types_generators.js

Blockly.Python.forBlock['py_type_list'] = function(block, generator) {
  var elements = [];
  for (var i = 0; i < block.itemCount_; i++) {
    var val = generator.valueToCode(block, 'ADD' + i, Blockly.Python.ORDER_NONE);
    if (val) elements.push(val);
  }
  return ['[' + elements.join(', ') + ']', Blockly.Python.ORDER_ATOMIC];
};

Blockly.Python.forBlock['py_type_dict'] = function(block, generator) {
  var elements = [];
  for (var i = 0; i < block.itemCount_; i++) {
    var key = generator.valueToCode(block, 'KEY' + i, Blockly.Python.ORDER_NONE) || "''";
    var val = generator.valueToCode(block, 'VAL' + i, Blockly.Python.ORDER_NONE) || "None";
    elements.push(key + ': ' + val);
  }
  // 如果項次大於 1，可以考慮加上換行，但目前維持單行以符合 Engineer Mode 簡潔感
  return ['{' + elements.join(', ') + '}', Blockly.Python.ORDER_ATOMIC];
};

Blockly.Python.forBlock['py_type_tuple'] = function(block, generator) {
  var elements = [];
  for (var i = 0; i < block.itemCount_; i++) {
    var val = generator.valueToCode(block, 'ADD' + i, Blockly.Python.ORDER_NONE);
    if (val) elements.push(val);
  }
  return ['(' + elements.join(', ') + ')', Blockly.Python.ORDER_ATOMIC];
};
