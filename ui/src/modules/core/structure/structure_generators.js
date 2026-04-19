// Structure Generators: structure_generators.js

Blockly.Python.forBlock['py_main'] = function(block, generator) {
  var branch = generator.statementToCode(block, 'DO') || generator.INDENT + 'pass\n';
  return 'if __name__ == "__main__":\n' + branch;
};

Blockly.Python.forBlock['mcu_main'] = function(block, generator) {
  var branch = generator.statementToCode(block, 'DO') || generator.INDENT + 'pass\n';
  // 移除所有行首縮排，對齊到全域
  var cleanBranch = branch.split('\n').map(line => line.replace(/^\s+/, '')).join('\n');
  return '# --- MCU Main Program ---\n' + cleanBranch;
};

Blockly.Python.forBlock['py_definition_zone'] = function(block, generator) {
  var defs = generator.statementToCode(block, 'DEFS') || '';
  // 移除所有行首縮排，對齊到全域
  var cleanDefs = defs.split('\n').map(line => line.replace(/^\s+/, '')).join('\n');
  return cleanDefs;
};

Blockly.Python.forBlock['py_import'] = function(block) {
  return 'import ' + block.getFieldValue('LIB') + '\n';
};

Blockly.Python.forBlock['py_import_from'] = function(block) {
  return 'from ' + block.getFieldValue('LIB') + ' import ' + block.getFieldValue('TARGET') + '\n';
};
