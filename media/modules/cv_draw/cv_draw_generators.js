// OpenCV Drawing Generators: cv_draw_generators.js

Blockly.Python.forBlock['py_ai_draw_rect'] = function(block, generator) {
  var varName = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  var start = generator.valueToCode(block, 'START', Blockly.Python.ORDER_ATOMIC) || '(0, 0)';
  var end = generator.valueToCode(block, 'END', Blockly.Python.ORDER_ATOMIC) || '(100, 100)';
  var color = generator.valueToCode(block, 'COLOR', Blockly.Python.ORDER_ATOMIC) || '(255, 0, 0)';
  var thickness = generator.valueToCode(block, 'THICKNESS', Blockly.Python.ORDER_ATOMIC) || '2';
  
  return 'cv2.rectangle(' + varName + ', ' + start + ', ' + end + ', ' + color + ', ' + thickness + ')\n';
};

Blockly.Python.forBlock['py_ai_draw_circle'] = function(block, generator) {
  var varName = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  var center = generator.valueToCode(block, 'CENTER', Blockly.Python.ORDER_ATOMIC) || '(50, 50)';
  var radius = generator.valueToCode(block, 'RADIUS', Blockly.Python.ORDER_ATOMIC) || '20';
  var color = generator.valueToCode(block, 'COLOR', Blockly.Python.ORDER_ATOMIC) || '(0, 255, 0)';
  var thickness = generator.valueToCode(block, 'THICKNESS', Blockly.Python.ORDER_ATOMIC) || '2';
  
  return 'cv2.circle(' + varName + ', ' + center + ', ' + radius + ', ' + color + ', ' + thickness + ')\n';
};

Blockly.Python.forBlock['py_ai_draw_line'] = function(block, generator) {
  var varName = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  var start = generator.valueToCode(block, 'START', Blockly.Python.ORDER_ATOMIC) || '(0, 0)';
  var end = generator.valueToCode(block, 'END', Blockly.Python.ORDER_ATOMIC) || '(100, 100)';
  var color = generator.valueToCode(block, 'COLOR', Blockly.Python.ORDER_ATOMIC) || '(0, 0, 255)';
  var thickness = generator.valueToCode(block, 'THICKNESS', Blockly.Python.ORDER_ATOMIC) || '2';
  
  return 'cv2.line(' + varName + ', ' + start + ', ' + end + ', ' + color + ', ' + thickness + ')\n';
};

Blockly.Python.forBlock['py_ai_draw_text'] = function(block, generator) {
  var varName = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  var text = generator.valueToCode(block, 'TEXT', Blockly.Python.ORDER_ATOMIC) || "''";
  var pos = generator.valueToCode(block, 'POS', Blockly.Python.ORDER_ATOMIC) || '(10, 30)';
  var color = generator.valueToCode(block, 'COLOR', Blockly.Python.ORDER_ATOMIC) || '(255, 255, 255)';
  var scale = generator.valueToCode(block, 'SCALE', Blockly.Python.ORDER_ATOMIC) || '1';
  
  return 'cv2.putText(' + varName + ', str(' + text + '), ' + pos + ', cv2.FONT_HERSHEY_SIMPLEX, ' + scale + ', ' + color + ', 2)\n';
};

Blockly.Python.forBlock['py_ai_point'] = function(block, generator) {
  var x = block.getFieldValue('X');
  var y = block.getFieldValue('Y');
  return ['(' + x + ', ' + y + ')', Blockly.Python.ORDER_ATOMIC];
};

Blockly.Python.forBlock['py_ai_color'] = function(block, generator) {
  var b = block.getFieldValue('B');
  var g = block.getFieldValue('G');
  var r = block.getFieldValue('R');
  return ['(' + b + ', ' + g + ', ' + r + ')', Blockly.Python.ORDER_ATOMIC];
};
