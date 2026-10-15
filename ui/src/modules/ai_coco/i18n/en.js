Object.assign(Blockly.Msg, {
  "AI_COCO_INIT": "Init COCO detector Model %1 Global threshold %2 Max results %3",
  "AI_COCO_INIT_TOOLTIP": "Load the EfficientDet-Lite0 pretrained model (MediaPipe Tasks VIDEO mode). Keep the global threshold low (e.g. 0.2); per-object thresholds come from the target dict in the for-each block. Recommended to place in the 'Global Definition Zone'.",
  "AI_COCO_INIT_WARNING": "Tip: Init block should be placed inside 'Global Definition Zone'.",
  "AI_COCO_DETECT": "Run COCO detection on frame %1 save to %2",
  "AI_COCO_DETECT_TOOLTIP": "Handles BGR to RGB, mp.Image wrapping, timestamp increment and detect_for_video automatically. Returns: detection result.",
  "AI_COCO_FOR_EACH_TARGET": "for each target in %1 matching target dict",
  "AI_COCO_FOR_EACH_TARGET_TOOLTIP": "Checks each detection in order; skips empty categories, null labels, non-target labels and low-confidence results. Inside the loop, use the 'target field' block to read label, score, x, y, w, h.",
  "AI_COCO_TARGET_FIELD": "target %1",
  "AI_COCO_TARGET_FIELD_TOOLTIP": "Only valid inside the for-each-target loop. Returns the field of the detection that passed the filter.",
  "AI_COCO_FIELD_LABEL": "label",
  "AI_COCO_FIELD_SCORE": "score",
  "AI_COCO_FIELD_X": "box X",
  "AI_COCO_FIELD_Y": "box Y",
  "AI_COCO_FIELD_W": "box width",
  "AI_COCO_FIELD_H": "box height",
  "AI_COCO_CLOSE": "Release COCO detector",
  "AI_COCO_CLOSE_TOOLTIP": "Release detector resources before the program ends (detector.close())."
});
