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

Blockly.Python.forBlock['py_ai_pose_calc_dist'] = function(block, generator) {
  var lmA = generator.valueToCode(block, 'LM_A', Blockly.Python.ORDER_ATOMIC) || 'None';
  var lmB = generator.valueToCode(block, 'LM_B', Blockly.Python.ORDER_ATOMIC) || 'None';
  var w = block.getFieldValue('WIDTH');
  var h = block.getFieldValue('HEIGHT');

  generator.definitions_['func_calc_dist'] = `
def cocoya_calc_dist(a, b, w, h):
    if not a or not b: return 0
    return (( (a.x - b.x) * w )**2 + ( (a.y - b.y) * h )**2)**0.5
`;
  return ['cocoya_calc_dist(' + lmA + ', ' + lmB + ', ' + w + ', ' + h + ')', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['py_ai_pose_get_velocity'] = function(block, generator) {
  var curr = generator.valueToCode(block, 'CURR', Blockly.Python.ORDER_ATOMIC) || '(0, 0)';
  var prev = generator.valueToCode(block, 'PREV', Blockly.Python.ORDER_ATOMIC) || '(0, 0)';
  var code = '(( (' + curr + '[0] - ' + prev + '[0]) )**2 + ( (' + curr + '[1] - ' + prev + '[1]) )**2)**0.5';
  return [code, Blockly.Python.ORDER_EXPONENTIATION];
};

Blockly.Python.forBlock['py_ai_pose_detect_punch'] = function(block, generator) {
  var pose = generator.valueToCode(block, 'POSE', Blockly.Python.ORDER_ATOMIC) || 'None';
  var side = block.getFieldValue('SIDE');
  var sensitivity = block.getFieldValue('SENSITIVITY');
  var idxs = (side === 'LEFT') ? [11, 13, 15] : [12, 14, 16]; 
  
  generator.definitions_['import_math'] = 'import math';
  generator.definitions_['func_calc_angle'] = `
def cocoya_get_angle(a, b, c):
    if not a or not b or not c: return 0
    ang = math.degrees(math.atan2(c.y-b.y, c.x-b.x) - math.atan2(a.y-b.y, a.x-b.x))
    return abs(ang if ang <= 180 else 360 - ang)
`;
  var code = '(' + pose + ' and cocoya_get_angle(' + pose + '.landmark['+idxs[0]+'], ' + pose + '.landmark['+idxs[1]+'], ' + pose + '.landmark['+idxs[2]+']) > (180 - ' + sensitivity + '))';
  return [code, Blockly.Python.ORDER_RELATIONAL];
};

Blockly.Python.forBlock['py_ai_pose_is_in_frame'] = function(block, generator) {
  var pos = generator.valueToCode(block, 'POS', Blockly.Python.ORDER_ATOMIC) || '(0, 0)';
  var w = block.getFieldValue('WIDTH');
  var h = block.getFieldValue('HEIGHT');
  var code = '(0 < ' + pos + '[0] < ' + w + ' and 0 < ' + pos + '[1] < ' + h + ')';
  return [code, Blockly.Python.ORDER_RELATIONAL];
};
