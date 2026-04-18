// OpenCV Basic Generators
Blockly.Python.forBlock['py_ai_open_camera'] = function(block, generator) {
  var index = block.getFieldValue('INDEX');
  return 'cap = cv2.VideoCapture(' + index + ')\n';
};

Blockly.Python.forBlock['py_ai_read_frame'] = function(block, generator) {
  var varName = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  return 'ret, ' + varName + ' = cap.read()\n';
};

Blockly.Python.forBlock['py_ai_flip_image'] = function(block, generator) {
  var varName = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  var code = block.getFieldValue('CODE');
  return varName + ' = cv2.flip(' + varName + ', ' + code + ')\n';
};

Blockly.Python.forBlock['py_ai_show_image'] = function(block, generator) {
  var img = generator.valueToCode(block, 'IMAGE', Blockly.Python.ORDER_ATOMIC) || 'frame';
  return "cv2.imshow('Cocoya Video', " + img + ")\n";
};

Blockly.Python.forBlock['py_ai_wait_key_break'] = function(block, generator) {
  var key = block.getFieldValue('KEY');
  var code = 'if cv2.waitKey(1) & 0xFF == ord(\'' + key + '\'):\n' + 
             generator.INDENT + 'break\n';
  return code;
};

Blockly.Python.forBlock['py_ai_release_all'] = function(block, generator) {
  return 'cap.release()\ncv2.destroyAllWindows()\n';
};
