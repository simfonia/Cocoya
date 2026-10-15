// AI COCO Blocks: ai_coco_blocks.js
// MediaPipe Tasks ObjectDetector（EfficientDet-Lite0 / COCO）高階教學積木。
// 設計：隱藏 mp.Image 包裝、timestamp 遞增、categories/bounding_box 物件圖操作；
// 學生只需 init → detect → for_each_target → 繪圖。

Blockly.Blocks['py_ai_coco_init'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_COCO_INIT"],
      "args0": [
        { "type": "field_input", "name": "MODEL_PATH", "text": "model/efficientdet_lite0.tflite" },
        { "type": "field_number", "name": "SCORE_THRESHOLD", "value": 0.2, "min": 0, "max": 1 },
        { "type": "field_number", "name": "MAX_RESULTS", "value": 10, "min": 1, "max": 50 }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI_COCO"],
      "tooltip": Blockly.Msg["AI_COCO_INIT_TOOLTIP"],
      "helpUrl": "py_ai_coco_init"
    });
  },
  onchange: function() {
    if (!this.workspace || this.workspace.isDragging || this.workspace.isFlyout) return;
    let parent = this.getSurroundParent();
    let inDefZone = false;
    while (parent) {
      if (parent.type === 'py_definition_zone') {
        inDefZone = true;
        break;
      }
      parent = parent.getSurroundParent();
    }
    if (!inDefZone) {
      this.setWarningText(Blockly.Msg["AI_COCO_INIT_WARNING"]);
      if (this.rendered && this.getSvgRoot) {
        const svg = this.getSvgRoot();
        if (svg) svg.classList.add('blockly-conflict-glow');
      }
    } else {
      this.setWarningText(null);
      if (this.rendered && this.getSvgRoot) {
        const svg = this.getSvgRoot();
        if (svg) svg.classList.remove('blockly-conflict-glow');
      }
    }
  }
};

Blockly.Blocks['py_ai_coco_detect'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_COCO_DETECT"],
      "args0": [
        { "type": "input_value", "name": "FRAME" },
        { "type": "field_variable", "name": "VAR", "variable": "coco_result" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI_COCO"],
      "tooltip": Blockly.Msg["AI_COCO_DETECT_TOOLTIP"],
      "helpUrl": "py_ai_coco_detect"
    });
  }
};

Blockly.Blocks['py_ai_coco_for_each_target'] = {
  init: function() {
    // appendField 不會展開 %1（只有 jsonInit 的 message0/args0 會），
    // 故執行期以 %1 切分，前段＋變數欄＋後段三段貼上。
    var parts = (Blockly.Msg["AI_COCO_FOR_EACH_TARGET"] || "走訪 %1 中符合目標字典的物件").split("%1");
    this.appendDummyInput()
        .appendField(parts[0] || "")
        .appendField(new Blockly.FieldVariable("coco_result"), "RESULT")
        .appendField(parts[1] || "");
    this.appendValueInput("TARGETS").setCheck("Dict");
    this.appendDummyInput().appendField(Blockly.Msg["PY_COLON"]);
    this.appendStatementInput("DO");
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_AI_COCO"]);
    this.setTooltip(Blockly.Msg["AI_COCO_FOR_EACH_TARGET_TOOLTIP"]);
    this.setHelpUrl("py_ai_coco_for_each_target");
  }
};

Blockly.Blocks['py_ai_coco_target_field'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_COCO_TARGET_FIELD"],
      "args0": [
        {
          "type": "field_dropdown",
          "name": "FIELD",
          "options": [
            [Blockly.Msg["AI_COCO_FIELD_LABEL"], "label"],
            [Blockly.Msg["AI_COCO_FIELD_SCORE"], "score"],
            [Blockly.Msg["AI_COCO_FIELD_X"], "x"],
            [Blockly.Msg["AI_COCO_FIELD_Y"], "y"],
            [Blockly.Msg["AI_COCO_FIELD_W"], "w"],
            [Blockly.Msg["AI_COCO_FIELD_H"], "h"]
          ]
        }
      ],
      "output": null,
      "colour": Blockly.Msg["COLOUR_AI_COCO"],
      "tooltip": Blockly.Msg["AI_COCO_TARGET_FIELD_TOOLTIP"],
      "helpUrl": "py_ai_coco_for_each_target"
    });
  }
};

Blockly.Blocks['py_ai_coco_close'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_COCO_CLOSE"],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI_COCO"],
      "tooltip": Blockly.Msg["AI_COCO_CLOSE_TOOLTIP"],
      "helpUrl": "py_ai_coco_close"
    });
  }
};
