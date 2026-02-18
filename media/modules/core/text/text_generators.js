// Text Generators: text_generators.js

Blockly.Python.forBlock['py_text'] = function(block) {
  var code = Blockly.Python.quote_(block.getFieldValue('TEXT'));
  return [code, Blockly.Python.ORDER_ATOMIC];
};

Blockly.Python.forBlock['py_text_multiline'] = function(block) {
  var text = block.getFieldValue('TEXT');
  var lines = text.split('\n');
  var escapedLines = lines.map(line => Blockly.Python.quote_(line));
  var code = "'\\n'.join([" + escapedLines.join(', ') + "])";
  return [code, Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['py_text_length'] = function(block, generator) {
  var val = generator.valueToCode(block, 'VALUE', Blockly.Python.ORDER_NONE) || "''";
  return ['len(' + val + ')', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['py_text_zfill'] = function(block, generator) {
  var val = generator.valueToCode(block, 'VALUE', Blockly.Python.ORDER_MEMBER) || '0';
  var width = block.getFieldValue('WIDTH');
  return ['str(' + val + ').zfill(' + width + ')', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['py_text_join'] = function(block, generator) {
  var parts = [];
  for (var i = 0; i < block.itemCount_; i++) {
    var val = generator.valueToCode(block, 'ADD' + i, Blockly.Python.ORDER_NONE);
    if (val) {
        var cleanVal = window.CocoyaUtils.extractIds(val).cleanLine.trim();
        if ((cleanVal.startsWith("'") && cleanVal.endsWith("'")) || (cleanVal.startsWith('"') && cleanVal.endsWith('"'))) {
            parts.push(cleanVal.substring(1, cleanVal.length - 1));
        } else {
            parts.push('{' + val + '}');
        }
    }
  }
  return ["f'" + parts.join('') + "'", Blockly.Python.ORDER_ATOMIC];
};
