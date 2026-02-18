// MediaPipe Face Mesh Generators: ai_face_generators.js

Blockly.Python.forBlock['py_ai_face_init'] = function(block, generator) {
  var maxFaces = block.getFieldValue('MAX_FACES');
  var minConf = block.getFieldValue('MIN_CONF');
  
  var code = 'import cv2\n' +
             'import mediapipe as mp\n' +
             'mp_face_mesh = mp.solutions.face_mesh\n' +
             'mp_draw = mp.solutions.drawing_utils\n' +
             'mp_face_model = mp_face_mesh.FaceMesh(max_num_faces=' + maxFaces + ', min_detection_confidence=' + minConf + ')\n';
  
  return code;
};

Blockly.Python.forBlock['py_ai_face_process'] = function(block, generator) {
  var frame = generator.valueToCode(block, 'FRAME', Blockly.Python.ORDER_ATOMIC) || 'frame';
  var varName = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  
  return varName + ' = mp_face_model.process(cv2.cvtColor(' + frame + ', cv2.COLOR_BGR2RGB))\n';
};

Blockly.Python.forBlock['py_ai_face_is_detected'] = function(block, generator) {
  var varName = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  return [varName + '.multi_face_landmarks is not None', Blockly.Python.ORDER_RELATIONAL];
};

Blockly.Python.forBlock['py_ai_face_get_landmarks'] = function(block, generator) {
  var varName = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  var index = block.getFieldValue('INDEX');
  
  var code = varName + '.multi_face_landmarks[' + index + '] if ' + varName + '.multi_face_landmarks and len(' + varName + '.multi_face_landmarks) > ' + index + ' else None';
  return [code, Blockly.Python.ORDER_CONDITIONAL];
};

Blockly.Python.forBlock['py_ai_face_get_landmark'] = function(block, generator) {
  var face = generator.valueToCode(block, 'FACE', Blockly.Python.ORDER_ATOMIC) || 'None';
  var index = block.getFieldValue('INDEX');
  
  var code = face + '.landmark[' + index + '] if ' + face + ' else None';
  return [code, Blockly.Python.ORDER_CONDITIONAL];
};

Blockly.Python.forBlock['py_ai_face_draw'] = function(block, generator) {
  var frame = generator.nameDB_.getName(block.getFieldValue('FRAME'), Blockly.VARIABLE_CATEGORY_NAME);
  var results = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  var meshColor = block.getFieldValue('MESH_COLOR');
  var contourColor = block.getFieldValue('CONTOUR_COLOR');
  var indent = generator.INDENT;

  function hexToBgr(hex) {
    var r = parseInt(hex.substring(1, 3), 16);
    var g = parseInt(hex.substring(3, 5), 16);
    var b = parseInt(hex.substring(5, 7), 16);
    return '(' + b + ', ' + g + ', ' + r + ')';
  }

  var mColor = hexToBgr(meshColor);
  var cColor = hexToBgr(contourColor);
  
  var code = 'if ' + results + '.multi_face_landmarks:\n' +
             indent + 'for face_landmarks in ' + results + '.multi_face_landmarks:\n' +
             indent + indent + 'mp_draw.draw_landmarks(' + frame + ', face_landmarks, mp_face_mesh.FACEMESH_TESSELATION, ' +
             'mp_draw.DrawingSpec(color=' + mColor + ', thickness=1, circle_radius=1), ' +
             'mp_draw.DrawingSpec(color=' + mColor + ', thickness=1))\n' +
             indent + indent + 'mp_draw.draw_landmarks(' + frame + ', face_landmarks, mp_face_mesh.FACEMESH_CONTOURS, ' +
             'None, mp_draw.DrawingSpec(color=' + cColor + ', thickness=1))\n';
  return code;
};

Blockly.Python.forBlock['py_ai_face_draw_indices'] = function(block, generator) {
  var frame = generator.nameDB_.getName(block.getFieldValue('FRAME'), Blockly.VARIABLE_CATEGORY_NAME);
  var results = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  var start = generator.valueToCode(block, 'START', Blockly.Python.ORDER_ATOMIC) || '0';
  var end = generator.valueToCode(block, 'END', Blockly.Python.ORDER_ATOMIC) || '467';
  var size = generator.valueToCode(block, 'SIZE', Blockly.Python.ORDER_ATOMIC) || '0.3';
  var color = generator.valueToCode(block, 'COLOR', Blockly.Python.ORDER_ATOMIC) || '(255, 255, 255)';
  var indent = generator.INDENT;
  
  var code = 'if ' + results + '.multi_face_landmarks:\n' +
             indent + 'for face_landmarks in ' + results + '.multi_face_landmarks:\n' +
             indent + indent + 'for i, lm in enumerate(face_landmarks.landmark):\n' +
             indent + indent + indent + 'if i >= int(' + start + ') and i <= int(' + end + '):\n' +
             indent + indent + indent + indent + 'h, w, c = ' + frame + '.shape\n' +
             indent + indent + indent + indent + 'cx, cy = int(lm.x * w), int(lm.y * h)\n' +
             indent + indent + indent + indent + 'cv2.circle(' + frame + ', (cx, cy), 2, ' + color + ', -1)\n' +
             indent + indent + indent + indent + 'cv2.putText(' + frame + ', str(i), (cx, cy), cv2.FONT_HERSHEY_SIMPLEX, ' + size + ', ' + color + ', 1)\n';
  return code;
};
