// MediaPipe Pose Generators: ai_pose_generators.js

Blockly.Python.forBlock['py_ai_pose_init'] = function(block, generator) {
  var minConf = block.getFieldValue('MIN_CONF');
  
  var code = 'import cv2\n' +
             'import mediapipe as mp\n' +
             'mp_pose = mp.solutions.pose\n' +
             'mp_draw = mp.solutions.drawing_utils\n' +
             'mp_pose_model = mp_pose.Pose(min_detection_confidence=' + minConf + ', min_tracking_confidence=' + minConf + ')\n';
  
  return code;
};

Blockly.Python.forBlock['py_ai_pose_process'] = function(block, generator) {
  var frame = generator.valueToCode(block, 'FRAME', Blockly.Python.ORDER_ATOMIC) || 'frame';
  var varName = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  
  return varName + ' = mp_pose_model.process(cv2.cvtColor(' + frame + ', cv2.COLOR_BGR2RGB))\n';
};

Blockly.Python.forBlock['py_ai_pose_is_detected'] = function(block, generator) {
  var varName = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  return [varName + '.pose_landmarks is not None', Blockly.Python.ORDER_RELATIONAL];
};

Blockly.Python.forBlock['py_ai_pose_get_landmarks'] = function(block, generator) {
  var varName = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  
  var code = varName + '.pose_landmarks if ' + varName + '.pose_landmarks else None';
  return [code, Blockly.Python.ORDER_CONDITIONAL];
};

Blockly.Python.forBlock['py_ai_pose_get_landmark'] = function(block, generator) {
  var pose = generator.valueToCode(block, 'POSE', Blockly.Python.ORDER_ATOMIC) || 'None';
  var index = block.getFieldValue('INDEX');
  
  var code = pose + '.landmark[' + index + '] if ' + pose + ' else None';
  return [code, Blockly.Python.ORDER_CONDITIONAL];
};

Blockly.Python.forBlock['py_ai_pose_get_landmark_xy'] = function(block, generator) {
  var landmark = generator.valueToCode(block, 'LANDMARK', Blockly.Python.ORDER_ATOMIC) || 'None';
  var width = block.getFieldValue('WIDTH');
  var height = block.getFieldValue('HEIGHT');
  
  var code = '(int(' + landmark + '.x * ' + width + '), int(' + landmark + '.y * ' + height + ')) if ' + landmark + ' else (0, 0)';
  return [code, Blockly.Python.ORDER_CONDITIONAL];
};

Blockly.Python.forBlock['py_ai_pose_draw'] = function(block, generator) {
  var frame = generator.nameDB_.getName(block.getFieldValue('FRAME'), Blockly.VARIABLE_CATEGORY_NAME);
  var results = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  var landmarkColor = block.getFieldValue('LANDMARK_COLOR');
  var lineColor = block.getFieldValue('LINE_COLOR');
  var indent = generator.INDENT;

  // Helper to convert hex to (B, G, R)
  function hexToBgr(hex) {
    var r = parseInt(hex.substring(1, 3), 16);
    var g = parseInt(hex.substring(3, 5), 16);
    var b = parseInt(hex.substring(5, 7), 16);
    return '(' + b + ', ' + g + ', ' + r + ')';
  }

  var lColor = hexToBgr(landmarkColor);
  var sColor = hexToBgr(lineColor);
  
  var code = 'if ' + results + '.pose_landmarks:\n' +
             indent + 'mp_draw.draw_landmarks(' + frame + ', ' + results + '.pose_landmarks, mp_pose.POSE_CONNECTIONS, ' +
             'mp_draw.DrawingSpec(color=' + lColor + ', thickness=2, circle_radius=2), ' +
             'mp_draw.DrawingSpec(color=' + sColor + ', thickness=2))\n';
  return code;
};

Blockly.Python.forBlock['py_ai_pose_draw_indices'] = function(block, generator) {
  var frame = generator.nameDB_.getName(block.getFieldValue('FRAME'), Blockly.VARIABLE_CATEGORY_NAME);
  var results = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  var size = generator.valueToCode(block, 'SIZE', Blockly.Python.ORDER_ATOMIC) || '0.4';
  var color = generator.valueToCode(block, 'COLOR', Blockly.Python.ORDER_ATOMIC) || '(255, 255, 255)';
  var indent = generator.INDENT;
  
  var code = 'if ' + results + '.pose_landmarks:\n' +
             indent + 'for i, lm in enumerate(' + results + '.pose_landmarks.landmark):\n' +
             indent + indent + 'h, w, c = ' + frame + '.shape\n' +
             indent + indent + 'cx, cy = int(lm.x * w), int(lm.y * h)\n' +
             indent + indent + 'cv2.putText(' + frame + ', str(i), (cx, cy), cv2.FONT_HERSHEY_SIMPLEX, ' + size + ', ' + color + ', 2)\n';
  return code;
};
