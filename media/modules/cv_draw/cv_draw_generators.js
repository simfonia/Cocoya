// OpenCV Drawing Generators: cv_draw_generators.js

Blockly.Python.forBlock['py_ai_draw_rect'] = function(block, generator) {
  var varName = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  var start = generator.valueToCode(block, 'START', Blockly.Python.ORDER_ATOMIC) || '(0, 0)';
  var end = generator.valueToCode(block, 'END', Blockly.Python.ORDER_ATOMIC) || '(100, 100)';
  var color = generator.valueToCode(block, 'COLOR', Blockly.Python.ORDER_ATOMIC) || '(255, 0, 0)';
  var thickness = generator.valueToCode(block, 'THICKNESS', Blockly.Python.ORDER_ATOMIC) || '2';
  
  return 'cv2.rectangle(' + varName + ', tuple(map(int, ' + start + ')), tuple(map(int, ' + end + ')), ' + color + ', ' + thickness + ')\n';
};

Blockly.Python.forBlock['py_ai_draw_circle'] = function(block, generator) {
  var varName = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  var center = generator.valueToCode(block, 'CENTER', Blockly.Python.ORDER_ATOMIC) || '(50, 50)';
  var radius = generator.valueToCode(block, 'RADIUS', Blockly.Python.ORDER_ATOMIC) || '20';
  var color = generator.valueToCode(block, 'COLOR', Blockly.Python.ORDER_ATOMIC) || '(0, 255, 0)';
  var thickness = generator.valueToCode(block, 'THICKNESS', Blockly.Python.ORDER_ATOMIC) || '2';
  
  return 'cv2.circle(' + varName + ', tuple(map(int, ' + center + ')), int(' + radius + '), ' + color + ', ' + thickness + ')\n';
};

Blockly.Python.forBlock['py_ai_draw_line'] = function(block, generator) {
  var varName = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  var start = generator.valueToCode(block, 'START', Blockly.Python.ORDER_ATOMIC) || '(0, 0)';
  var end = generator.valueToCode(block, 'END', Blockly.Python.ORDER_ATOMIC) || '(100, 100)';
  var color = generator.valueToCode(block, 'COLOR', Blockly.Python.ORDER_ATOMIC) || '(0, 0, 255)';
  var thickness = generator.valueToCode(block, 'THICKNESS', Blockly.Python.ORDER_ATOMIC) || '2';
  
  return 'cv2.line(' + varName + ', tuple(map(int, ' + start + ')), tuple(map(int, ' + end + ')), ' + color + ', ' + thickness + ')\n';
};

Blockly.Python.forBlock['py_ai_draw_text'] = function(block, generator) {
  var varName = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  var text = generator.valueToCode(block, 'TEXT', Blockly.Python.ORDER_ATOMIC) || "''";
  var pos = generator.valueToCode(block, 'POS', Blockly.Python.ORDER_ATOMIC) || '(10, 30)';
  var color = generator.valueToCode(block, 'COLOR', Blockly.Python.ORDER_ATOMIC) || '(255, 255, 255)';
  var scale = generator.valueToCode(block, 'SCALE', Blockly.Python.ORDER_ATOMIC) || '1';
  
  return 'cv2.putText(' + varName + ', str(' + text + '), tuple(map(int, ' + pos + ')), cv2.FONT_HERSHEY_SIMPLEX, ' + scale + ', ' + color + ', 2)\n';
};

Blockly.Python.forBlock['py_ai_draw_overlay_image'] = function(block, generator) {
  var varName = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  var path = generator.valueToCode(block, 'PATH', Blockly.Python.ORDER_ATOMIC) || "''";
  var center = generator.valueToCode(block, 'CENTER', Blockly.Python.ORDER_ATOMIC) || '(0, 0)';
  var width = generator.valueToCode(block, 'WIDTH', Blockly.Python.ORDER_ATOMIC) || '100';
  var angle = generator.valueToCode(block, 'ANGLE', Blockly.Python.ORDER_ATOMIC) || '0';

  generator.definitions_['import_numpy'] = 'import numpy as np';
  generator.definitions_['func_overlay_image'] = `
def cocoya_overlay_image(img, path, center, width, angle):
    overlay = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if overlay is None:
        print(f"Warning: Cannot load image at {path}")
        return
    h_orig, w_orig = overlay.shape[:2]
    width = max(1, int(width))
    height = max(1, int(h_orig * (width / w_orig)))
    overlay = cv2.resize(overlay, (width, height), interpolation=cv2.INTER_AREA)
    (h, w) = overlay.shape[:2]
    (cX, cY) = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D((cX, cY), angle, 1.0)
    cos, sin = np.abs(M[0, 0]), np.abs(M[0, 1])
    nW, nH = int((h * sin) + (w * cos)), int((h * cos) + (w * sin))
    M[0, 2] += (nW / 2) - cX
    M[1, 2] += (nH / 2) - cY
    overlay = cv2.warpAffine(overlay, M, (nW, nH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0,0,0,0))
    h, w = overlay.shape[:2]
    x, y = int(center[0] - w // 2), int(center[1] - h // 2)
    img_h, img_w = img.shape[:2]
    x1, y1 = max(x, 0), max(y, 0)
    x2, y2 = min(x + w, img_w), min(y + h, img_h)
    if x1 >= x2 or y1 >= y2: return
    overlay_crop = overlay[y1-y:y2-y, x1-x:x2-x]
    img_crop = img[y1:y2, x1:x2]
    if overlay_crop.shape[2] == 4:
        alpha = overlay_crop[:, :, 3:] / 255.0
        img_crop[:] = (alpha * overlay_crop[:, :, :3] + (1 - alpha) * img_crop).astype(np.uint8)
    else:
        img_crop[:] = overlay_crop[:, :, :3]
`;

  return 'cocoya_overlay_image(' + varName + ', ' + path + ', tuple(map(int, ' + center + ')), ' + width + ', ' + angle + ')\n';
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
