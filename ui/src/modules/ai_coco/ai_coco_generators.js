// AI COCO Generators: ai_coco_generators.js
// 對應範例 examples/AI_03_coco_detector/coco_detector.py 的高階封裝：
// init 包掉 BaseOptions/ObjectDetectorOptions；detect 包掉 BGR→RGB、mp.Image、
// timestamp 遞增、detect_for_video；for_each_target 包掉 categories/bounding_box
// 物件圖走訪＋TARGET_OBJECTS 雙層 threshold 過濾。

Blockly.Python.forBlock['py_ai_coco_init'] = function(block) {
  var modelPath = block.getFieldValue('MODEL_PATH') || 'model/efficientdet_lite0.tflite';
  var scoreThreshold = block.getFieldValue('SCORE_THRESHOLD');
  var maxResults = block.getFieldValue('MAX_RESULTS');
  if (scoreThreshold === null || scoreThreshold === undefined || scoreThreshold === '') scoreThreshold = '0.2';
  if (maxResults === null || maxResults === undefined || maxResults === '') maxResults = '10';

  // 路徑統一正斜線（產生器開發規範：專案內路徑一律正斜線）
  modelPath = String(modelPath).replace(/\\/g, '/');

  var code = 'import cv2\n' +
             'import mediapipe as mp\n' +
             '_coco_base_options = mp.tasks.BaseOptions\n' +
             '_coco_object_detector = mp.tasks.vision.ObjectDetector\n' +
             '_coco_object_detector_options = mp.tasks.vision.ObjectDetectorOptions\n' +
             '_coco_running_mode = mp.tasks.vision.RunningMode\n' +
             '_coco_options = _coco_object_detector_options(\n' +
             '    base_options=_coco_base_options(\n' +
             '        model_asset_path="' + modelPath + '"\n' +
             '    ),\n' +
             '    running_mode=_coco_running_mode.VIDEO,\n' +
             '    max_results=' + maxResults + ',\n' +
             '    score_threshold=' + scoreThreshold + '\n' +
             ')\n' +
             'coco_detector = _coco_object_detector.create_from_options(_coco_options)\n' +
             '_coco_timestamp_ms = 0\n';

  return code;
};

Blockly.Python.forBlock['py_ai_coco_detect'] = function(block, generator) {
  var frame = generator.valueToCode(block, 'FRAME', Blockly.Python.ORDER_ATOMIC) || 'frame';
  var varName = generator.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);

  var code = '_coco_rgb_frame = cv2.cvtColor(' + frame + ', cv2.COLOR_BGR2RGB)\n' +
             '_coco_mp_image = mp.Image(\n' +
             '    image_format=mp.ImageFormat.SRGB,\n' +
             '    data=_coco_rgb_frame\n' +
             ')\n' +
             '_coco_timestamp_ms += 1\n' +
             varName + ' = coco_detector.detect_for_video(\n' +
             '    _coco_mp_image,\n' +
             '    _coco_timestamp_ms\n' +
             ')\n';

  return code;
};

Blockly.Python.forBlock['py_ai_coco_for_each_target'] = function(block, generator) {
  var resultVar = generator.nameDB_.getName(block.getFieldValue('RESULT'), Blockly.VARIABLE_CATEGORY_NAME);
  var targets = generator.valueToCode(block, 'TARGETS', Blockly.Python.ORDER_ATOMIC) || '{}';
  var branch = generator.statementToCode(block, 'DO');
  var indent = generator.INDENT;

  // 迴圈變數固定命名（教學可讀性優先；巢狀此積木會覆寫，屬已知限制，見 help）。
  var code = 'for _coco_detection in ' + resultVar + '.detections:\n' +
             indent + 'if len(_coco_detection.categories) == 0:\n' +
             indent + indent + 'continue\n' +
             indent + '_coco_category = _coco_detection.categories[0]\n' +
             indent + '_coco_label = _coco_category.category_name\n' +
             indent + '_coco_score = _coco_category.score\n' +
             indent + 'if _coco_label is None:\n' +
             indent + indent + 'continue\n' +
             indent + 'if _coco_label not in ' + targets + ':\n' +
             indent + indent + 'continue\n' +
             indent + '_coco_threshold = ' + targets + '[_coco_label]\n' +
             indent + 'if _coco_score < _coco_threshold:\n' +
             indent + indent + 'continue\n' +
             indent + '_coco_bbox = _coco_detection.bounding_box\n' +
             indent + '_coco_x = _coco_bbox.origin_x\n' +
             indent + '_coco_y = _coco_bbox.origin_y\n' +
             indent + '_coco_w = _coco_bbox.width\n' +
             indent + '_coco_h = _coco_bbox.height\n' +
             (branch ? branch : indent + 'pass\n');

  return code;
};

Blockly.Python.forBlock['py_ai_coco_target_field'] = function(block) {
  var field = block.getFieldValue('FIELD');
  var codeMap = {
    'label': '_coco_label',
    'score': '_coco_score',
    'x': '_coco_x',
    'y': '_coco_y',
    'w': '_coco_w',
    'h': '_coco_h'
  };
  var code = codeMap[field] || '_coco_label';
  if (!block.outputConnection) {
    return code + '\n';
  }
  return [code, Blockly.Python.ORDER_ATOMIC];
};

Blockly.Python.forBlock['py_ai_coco_close'] = function() {
  return 'coco_detector.close()\n';
};
