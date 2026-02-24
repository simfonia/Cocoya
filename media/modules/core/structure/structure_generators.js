// Structure Generators: structure_generators.js

Blockly.Python.forBlock['py_main'] = function(block, generator) {
  var branch = generator.statementToCode(block, 'DO') || generator.INDENT + 'pass\n';
  if (generator.PLATFORM === 'CircuitPython') {
    return '# --- MCU Main Loop ---\n' + branch;
  }
  return 'if __name__ == "__main__":\n' + branch;
};

Blockly.Python.forBlock['py_definition_zone'] = function(block, generator) {
  var defs = generator.statementToCode(block, 'DEFS') || '';
  // 動態移除縮排 (根據當前設定的 INDENT)
  var indent = generator.INDENT || '  ';
  var reg = new RegExp('^' + indent, 'mg');
  return defs.replace(reg, '');
};

Blockly.Python.forBlock['py_import'] = function(block) {
  return 'import ' + block.getFieldValue('LIB') + '\n';
};

Blockly.Python.forBlock['py_import_from'] = function(block) {
  return 'from ' + block.getFieldValue('LIB') + ' import ' + block.getFieldValue('TARGET') + '\n';
};
