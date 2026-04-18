// MediaPipe Hand Generators: ai_hand_generators.js

Blockly.Python.forBlock['py_ai_hand_init'] = function(block, generator) {
  var maxHands = block.getFieldValue('MAX_HANDS');
  var minConf = block.getFieldValue('MIN_CONF');
  
  var code = 'import cv2\n' +
             'import mediapipe as mp\n' +
             'mp_hands = mp.solutions.hands\n' +
             'mp_draw = mp.solutions.drawing_utils\n' +
             'mp_hands_model = mp_hands.Hands(max_num_hands=' + maxHands + ', min_detection_confidence=' + minConf + ')\n';
  
  return code;
};

Blockly.Python.forBlock['py_ai_hand_process'] = function(block, generator) {
  var frame = generator.valueToCode(block, 'FRAME', Blockly.Python.ORDER_ATOMIC) || 'frame';
  var varName = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  
  return varName + ' = mp_hands_model.process(cv2.cvtColor(' + frame + ', cv2.COLOR_BGR2RGB))\n';
};

Blockly.Python.forBlock['py_ai_hand_is_detected'] = function(block, generator) {
  var varName = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  return [varName + '.multi_hand_landmarks is not None', Blockly.Python.ORDER_RELATIONAL];
};

Blockly.Python.forBlock['py_ai_hand_get_landmarks'] = function(block, generator) {
  var varName = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  var index = block.getFieldValue('INDEX');
  
  var code = varName + '.multi_hand_landmarks[' + index + '] if ' + varName + '.multi_hand_landmarks and len(' + varName + '.multi_hand_landmarks) > ' + index + ' else None';
  return [code, Blockly.Python.ORDER_CONDITIONAL];
};

Blockly.Python.forBlock['py_ai_hand_get_landmark'] = function(block, generator) {
  var hand = generator.valueToCode(block, 'HAND', Blockly.Python.ORDER_ATOMIC) || 'None';
  var index = block.getFieldValue('INDEX');
  
  var code = hand + '.landmark[' + index + '] if ' + hand + ' else None';
  return [code, Blockly.Python.ORDER_CONDITIONAL];
};

Blockly.Python.forBlock['py_ai_hand_get_landmark_xy'] = function(block, generator) {
  var landmark = generator.valueToCode(block, 'LANDMARK', Blockly.Python.ORDER_ATOMIC) || 'None';
  var width = block.getFieldValue('WIDTH');
  var height = block.getFieldValue('HEIGHT');
  
  var code = '(int(' + landmark + '.x * ' + width + '), int(' + landmark + '.y * ' + height + ')) if ' + landmark + ' else (0, 0)';
  return [code, Blockly.Python.ORDER_CONDITIONAL];
};

Blockly.Python.forBlock['py_ai_hand_is_finger_up'] = function(block, generator) {
  var varName = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  var index = block.getFieldValue('INDEX');
  var finger = block.getFieldValue('FINGER');
  
  // Finger tip indices: Thumb:4, Index:8, Middle:12, Ring:16, Pinky:20
  // Finger pip/mcp indices to compare: Thumb:2/3, others: tip vs pip
  var tipIdx, dipIdx;
  if (finger === 'THUMB') {
    tipIdx = 4; dipIdx = 3;
  } else if (finger === 'INDEX') {
    tipIdx = 8; dipIdx = 6;
  } else if (finger === 'MIDDLE') {
    tipIdx = 12; dipIdx = 10;
  } else if (finger === 'RING') {
    tipIdx = 16; dipIdx = 14;
  } else if (finger === 'PINKY') {
    tipIdx = 20; dipIdx = 18;
  }
  
  var code = varName + '.multi_hand_landmarks[' + index + '].landmark[' + tipIdx + '].y < ' +
             varName + '.multi_hand_landmarks[' + index + '].landmark[' + dipIdx + '].y ' +
             'if ' + varName + '.multi_hand_landmarks and len(' + varName + '.multi_hand_landmarks) > ' + index + ' else False';
             
  return [code, Blockly.Python.ORDER_RELATIONAL];
};

Blockly.Python.forBlock['py_ai_hand_draw'] = function(block, generator) {
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
  
  var code = 'if ' + results + '.multi_hand_landmarks:\n' +
             indent + 'for hand_landmarks in ' + results + '.multi_hand_landmarks:\n' +
             indent + indent + 'mp_draw.draw_landmarks(' + frame + ', hand_landmarks, mp_hands.HAND_CONNECTIONS, ' +
             'mp_draw.DrawingSpec(color=' + lColor + ', thickness=2, circle_radius=2), ' +
             'mp_draw.DrawingSpec(color=' + sColor + ', thickness=2))\n';
  return code;
};

Blockly.Python.forBlock['py_ai_hand_draw_indices'] = function(block, generator) {
  var frame = generator.nameDB_.getName(block.getFieldValue('FRAME'), Blockly.VARIABLE_CATEGORY_NAME);
  var results = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  var size = generator.valueToCode(block, 'SIZE', Blockly.Python.ORDER_ATOMIC) || '0.4';
  var color = generator.valueToCode(block, 'COLOR', Blockly.Python.ORDER_ATOMIC) || '(255, 255, 255)';
  var indent = generator.INDENT;
  
  var code = 'if ' + results + '.multi_hand_landmarks:\n' +
             indent + 'for hand_landmarks in ' + results + '.multi_hand_landmarks:\n' +
             indent + indent + 'for i, lm in enumerate(hand_landmarks.landmark):\n' +
             indent + indent + indent + 'h, w, c = ' + frame + '.shape\n' +
             indent + indent + indent + 'cx, cy = int(lm.x * w), int(lm.y * h)\n' +
             indent + indent + indent + 'cv2.putText(' + frame + ', str(i), (cx, cy), cv2.FONT_HERSHEY_SIMPLEX, ' + size + ', ' + color + ', 2)\n';
  return code;
};
