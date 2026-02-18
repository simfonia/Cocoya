// OpenCV Drawing Blocks: cv_draw_blocks.js

Blockly.Blocks['py_ai_draw_rect'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_DRAW_RECT"],
      "args0": [
        { "type": "field_variable", "name": "VAR", "variable": "frame" },
        { "type": "input_value", "name": "START" },
        { "type": "input_value", "name": "END" },
        { "type": "input_value", "name": "COLOR" },
        { "type": "input_value", "name": "THICKNESS" }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI"],
      "tooltip": Blockly.Msg["AI_DRAW_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_draw_rect_alpha'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_DRAW_RECT_ALPHA"],
      "args0": [
        { "type": "field_variable", "name": "VAR", "variable": "frame" },
        { "type": "input_value", "name": "START" },
        { "type": "input_value", "name": "END" },
        { "type": "input_value", "name": "COLOR" },
        { "type": "input_value", "name": "ALPHA" }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI"],
      "tooltip": Blockly.Msg["AI_DRAW_RECT_ALPHA_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_draw_circle'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_DRAW_CIRCLE"],
      "args0": [
        { "type": "field_variable", "name": "VAR", "variable": "frame" },
        { "type": "input_value", "name": "CENTER" },
        { "type": "input_value", "name": "RADIUS" },
        { "type": "input_value", "name": "COLOR" },
        { "type": "input_value", "name": "THICKNESS" }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI"],
      "tooltip": Blockly.Msg["AI_DRAW_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_draw_line'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_DRAW_LINE"],
      "args0": [
        { "type": "field_variable", "name": "VAR", "variable": "frame" },
        { "type": "input_value", "name": "START" },
        { "type": "input_value", "name": "END" },
        { "type": "input_value", "name": "COLOR" },
        { "type": "input_value", "name": "THICKNESS" }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI"],
      "tooltip": Blockly.Msg["AI_DRAW_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_draw_text'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_DRAW_TEXT"],
      "args0": [
        { "type": "field_variable", "name": "VAR", "variable": "frame" },
        { "type": "input_value", "name": "TEXT" },
        { "type": "input_value", "name": "POS" },
        { "type": "input_value", "name": "COLOR" },
        { "type": "input_value", "name": "SCALE" }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI"],
      "tooltip": Blockly.Msg["AI_DRAW_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_draw_text_zh'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_DRAW_TEXT_ZH"],
      "args0": [
        { "type": "field_variable", "name": "VAR", "variable": "frame" },
        { "type": "input_value", "name": "TEXT" },
        { "type": "input_value", "name": "POS" },
        { "type": "input_value", "name": "COLOR" },
        { "type": "input_value", "name": "SIZE" }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI"],
      "tooltip": Blockly.Msg["AI_DRAW_TEXT_ZH_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_draw_angle_arc'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_DRAW_ANGLE_ARC"],
      "args0": [
        { "type": "field_variable", "name": "VAR", "variable": "frame" },
        { "type": "input_value", "name": "CENTER" },
        { "type": "input_value", "name": "START" },
        { "type": "input_value", "name": "END" },
        { "type": "input_value", "name": "RADIUS" },
        { "type": "input_value", "name": "COLOR" },
        { "type": "input_value", "name": "THICKNESS" }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI"],
      "tooltip": Blockly.Msg["AI_DRAW_ANGLE_ARC_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_draw_overlay_image'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_DRAW_OVERLAY_IMAGE"],
      "args0": [
        { "type": "field_variable", "name": "VAR", "variable": "frame" },
        { "type": "input_value", "name": "PATH", "check": "String" },
        { "type": "input_value", "name": "CENTER", "check": "Tuple" },
        { "type": "input_value", "name": "WIDTH", "check": "Number" },
        { "type": "input_value", "name": "ANGLE", "check": "Number" }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI"],
      "tooltip": Blockly.Msg["AI_DRAW_OVERLAY_IMAGE_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_point'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_POINT"],
      "args0": [
        { "type": "field_number", "name": "X", "value": 0 },
        { "type": "field_number", "name": "Y", "value": 0 }
      ],
      "output": "Tuple",
      "inputsInline": true,
      "colour": Blockly.Msg["COLOUR_TYPES"],
      "tooltip": Blockly.Msg["AI_POINT_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_color'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_COLOR"],
      "args0": [
        { "type": "field_number", "name": "B", "value": 0, "min": 0, "max": 255 },
        { "type": "field_number", "name": "G", "value": 0, "min": 0, "max": 255 },
        { "type": "field_number", "name": "R", "value": 0, "min": 0, "max": 255 }
      ],
      "output": "Tuple",
      "inputsInline": true,
      "colour": Blockly.Msg["COLOUR_TYPES"],
      "tooltip": Blockly.Msg["AI_COLOR_TOOLTIP"]
    });
  }
};
