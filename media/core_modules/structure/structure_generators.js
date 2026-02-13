// Structure Generators: structure_generators.js

Blockly.Python.forBlock['py_main'] = function(block, generator) {
  var branch = generator.statementToCode(block, 'DO') || '  pass\n';
  return 'if __name__ == "__main__":\n' + branch;
};

Blockly.Python.forBlock['py_definition_zone'] = function(block, generator) {
  var defs = generator.statementToCode(block, 'DEFS') || '';
  // 移除每行開頭的兩個空格縮排，使其成為真正的全域代碼
  return defs.replace(/^  /mg, '');
};

Blockly.Python.forBlock['py_import'] = function(block) {
  return 'import ' + block.getFieldValue('LIB') + '\n';
};

Blockly.Python.forBlock['py_import_from'] = function(block) {
  return 'from ' + block.getFieldValue('LIB') + ' import ' + block.getFieldValue('TARGET') + '\n';
};
