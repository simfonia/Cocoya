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

Blockly.Python.forBlock['py_types_cast'] = function(block, generator) {
  var type = block.getFieldValue('TYPE');
  var val = generator.valueToCode(block, 'VALUE', Blockly.Python.ORDER_NONE) || "None";
  return [type + '(' + val + ')', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['py_types_type_of'] = function(block, generator) {
  var val = generator.valueToCode(block, 'VALUE', Blockly.Python.ORDER_NONE) || "None";
  return ['type(' + val + ')', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['py_types_map_int'] = function(block, generator) {
  var val = generator.valueToCode(block, 'VALUE', Blockly.Python.ORDER_NONE) || "[]";
  return ['tuple(map(int, ' + val + '))', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['py_types_len'] = function(block, generator) {
  var val = generator.valueToCode(block, 'VALUE', Blockly.Python.ORDER_NONE) || "[]";
  return ['len(' + val + ')', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['py_types_get_item'] = function(block, generator) {
  var obj = generator.valueToCode(block, 'OBJ', Blockly.Python.ORDER_MEMBER) || "[]";
  var idx = generator.valueToCode(block, 'INDEX', Blockly.Python.ORDER_NONE) || "0";
  return [obj + '[' + idx + ']', Blockly.Python.ORDER_MEMBER];
};

Blockly.Python.forBlock['py_types_set_item'] = function(block, generator) {
  var obj = generator.valueToCode(block, 'OBJ', Blockly.Python.ORDER_MEMBER) || "[]";
  var idx = generator.valueToCode(block, 'INDEX', Blockly.Python.ORDER_NONE) || "0";
  var val = generator.valueToCode(block, 'VALUE', Blockly.Python.ORDER_NONE) || "None";
  return obj + '[' + idx + '] = ' + val + '\n';
};

Blockly.Python.forBlock['py_types_list_append'] = function(block, generator) {
  var list = generator.valueToCode(block, 'LIST', Blockly.Python.ORDER_MEMBER) || "[]";
  var item = generator.valueToCode(block, 'ITEM', Blockly.Python.ORDER_NONE) || "None";
  return list + '.append(' + item + ')\n';
};

Blockly.Python.forBlock['py_types_pop'] = function(block, generator) {
  var obj = generator.valueToCode(block, 'OBJ', Blockly.Python.ORDER_MEMBER) || "[]";
  var idx = generator.valueToCode(block, 'INDEX', Blockly.Python.ORDER_NONE) || "0";
  return [obj + '.pop(' + idx + ')', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['py_types_in'] = function(block, generator) {
  var item = generator.valueToCode(block, 'ITEM', Blockly.Python.ORDER_NONE) || "None";
  var obj = generator.valueToCode(block, 'OBJ', Blockly.Python.ORDER_NONE) || "[]";
  return [item + ' in ' + obj, Blockly.Python.ORDER_RELATIONAL];
};

Blockly.Python.forBlock['py_types_dict_get_parts'] = function(block, generator) {
  var part = block.getFieldValue('PART');
  var dict = generator.valueToCode(block, 'DICT', Blockly.Python.ORDER_MEMBER) || "{}";
  return ['list(' + dict + '.' + part + '())', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['py_types_sorted'] = function(block, generator) {
  var val = generator.valueToCode(block, 'VALUE', Blockly.Python.ORDER_NONE) || "[]";
  var rev = block.getFieldValue('REVERSE');
  return ['sorted(' + val + ', reverse=' + rev + ')', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['py_types_sort_list'] = function(block, generator) {
  var list = generator.valueToCode(block, 'LIST', Blockly.Python.ORDER_MEMBER) || "[]";
  var rev = block.getFieldValue('REVERSE');
  return list + '.sort(reverse=' + rev + ')\n';
};
