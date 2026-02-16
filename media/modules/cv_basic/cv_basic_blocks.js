// OpenCV Basic Blocks: cv_basic_blocks.js

Blockly.Blocks['py_ai_open_camera'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_OPEN_CAMERA"],
      "args0": [
        { "type": "field_input", "name": "INDEX", "text": "0" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI"],
      "tooltip": Blockly.Msg["AI_OPEN_CAMERA_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_read_frame'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_READ_FRAME"],
      "args0": [
        { "type": "field_variable", "name": "VAR", "variable": "frame" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI"],
      "tooltip": Blockly.Msg["AI_READ_FRAME_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_flip_image'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_FLIP_IMAGE"],
      "args0": [
        { "type": "field_variable", "name": "VAR", "variable": "frame" },
        { 
          "type": "field_dropdown", 
          "name": "CODE",
          "options": [
            [Blockly.Msg["AI_FLIP_HORIZONTALLY"], "1"],
            [Blockly.Msg["AI_FLIP_VERTICALLY"], "0"],
            [Blockly.Msg["AI_FLIP_BOTH"], "-1"]
          ]
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI"],
      "tooltip": Blockly.Msg["AI_FLIP_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_show_image'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_SHOW_IMAGE"],
      "args0": [
        { "type": "input_value", "name": "IMAGE" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI"],
      "tooltip": Blockly.Msg["AI_SHOW_IMAGE_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_wait_key_break'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_WAIT_KEY_BREAK"],
      "args0": [
        { "type": "field_input", "name": "KEY", "text": "q" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI"],
      "tooltip": Blockly.Msg["AI_WAIT_KEY_BREAK_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_release_all'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_RELEASE_ALL"],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI"],
      "tooltip": Blockly.Msg["AI_RELEASE_ALL_TOOLTIP"]
    });
  }
};
