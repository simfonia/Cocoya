// Structure Generators: structure_generators.js

Blockly.Python.forBlock['py_main'] = function(block, generator) {
  var branch = generator.statementToCode(block, 'DO') || generator.INDENT + 'pass\n';
  return 'if __name__ == "__main__":\n' + branch;
};

Blockly.Python.forBlock['mcu_main'] = function(block, generator) {
  var branch = generator.statementToCode(block, 'DO') || generator.INDENT + 'pass\n';
  generator.definitions_['import_time'] = 'import time';
  
  // 核心修正：只移除開頭的一個縮排單位，保留內部的相對縮排
  var indent = generator.INDENT || '    ';
  var reg = new RegExp('^' + indent, 'mg');
  var cleanBranch = branch.replace(reg, '');
  
  // MicroPython 啟動優化：僅保留微小延遲確保 Serial 穩定，移除 CP 專用的 supervisor 邏輯
  var code = '# --- MicroPython Main Program ---\n';
  code += 'time.sleep(0.2)  # Short boot delay for serial stability\n';
  code += cleanBranch;
  return code;
};

Blockly.Python.forBlock['py_definition_zone'] = function(block, generator) {
  var defs = generator.statementToCode(block, 'DEFS') || '';
  // 核心修正：只移除開頭的一個縮排單位
  var indent = generator.INDENT || '    ';
  var reg = new RegExp('^' + indent, 'mg');
  var cleanDefs = defs.replace(reg, '');
  return cleanDefs;
};

Blockly.Python.forBlock['py_import'] = function(block) {
  return 'import ' + block.getFieldValue('LIB') + '\n';
};

Blockly.Python.forBlock['py_import_from'] = function(block) {
  return 'from ' + block.getFieldValue('LIB') + ' import ' + block.getFieldValue('TARGET') + '\n';
};
