// MediaPipe Hand Blocks: ai_hand_blocks.js

Blockly.Blocks['py_ai_hand_init'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_HAND_INIT"],
      "args0": [
        { "type": "field_number", "name": "MAX_HANDS", "value": 2, "min": 1, "max": 10 },
        { "type": "field_number", "name": "MIN_CONF", "value": 0.5, "min": 0, "max": 1 }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI"],
      "tooltip": Blockly.Msg["AI_HAND_INIT_TOOLTIP"]
    });
  },
  onchange: function(event) {
    if (!this.workspace || this.workspace.isDragging() || this.workspace.isFlyout) return;
    
    // 檢查祖先積木是否有 py_definition_zone
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
      this.setWarningText(Blockly.Msg["AI_HAND_INIT_WARNING"]);
      const svg = this.getSvgRoot();
      if (svg) svg.classList.add('blockly-conflict-glow');
    } else {
      this.setWarningText(null);
      const svg = this.getSvgRoot();
      if (svg) svg.classList.remove('blockly-conflict-glow');
    }
  }
};

Blockly.Blocks['py_ai_hand_process'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_HAND_PROCESS"],
      "args0": [
        { "type": "input_value", "name": "FRAME" },
        { "type": "field_variable", "name": "VAR", "variable": "results" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI"],
      "tooltip": Blockly.Msg["AI_HAND_PROCESS_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_hand_is_detected'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_HAND_IS_DETECTED"],
      "args0": [
        { "type": "field_variable", "name": "VAR", "variable": "results" }
      ],
      "output": "Boolean",
      "colour": Blockly.Msg["COLOUR_AI"],
      "tooltip": Blockly.Msg["AI_HAND_IS_DETECTED_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_hand_get_landmarks'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_HAND_GET_LANDMARKS"],
      "args0": [
        { "type": "field_variable", "name": "VAR", "variable": "results" },
        { "type": "field_number", "name": "INDEX", "value": 0, "min": 0 }
      ],
      "output": "HandLandmarks",
      "colour": Blockly.Msg["COLOUR_AI"],
      "tooltip": Blockly.Msg["AI_HAND_GET_LANDMARKS_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_hand_get_landmark'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_HAND_GET_LANDMARK"],
      "args0": [
        { "type": "input_value", "name": "HAND", "check": "HandLandmarks" },
        { "type": "field_number", "name": "INDEX", "value": 0, "min": 0, "max": 20 }
      ],
      "output": "Landmark",
      "colour": Blockly.Msg["COLOUR_AI"],
      "tooltip": Blockly.Msg["AI_HAND_GET_LANDMARK_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_hand_get_landmark_xy'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_HAND_GET_LANDMARK_XY"],
      "args0": [
        { "type": "input_value", "name": "LANDMARK", "check": "Landmark" },
        { "type": "field_number", "name": "WIDTH", "value": 640 },
        { "type": "field_number", "name": "HEIGHT", "value": 480 }
      ],
      "output": "Tuple",
      "inputsInline": true,
      "colour": Blockly.Msg["COLOUR_AI"],
      "tooltip": Blockly.Msg["AI_HAND_GET_LANDMARK_XY_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_hand_is_finger_up'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_HAND_IS_FINGER_UP"],
      "args0": [
        { "type": "field_variable", "name": "VAR", "variable": "results" },
        { "type": "field_number", "name": "INDEX", "value": 0, "min": 0 },
        {
          "type": "field_dropdown",
          "name": "FINGER",
          "options": [
            [Blockly.Msg["AI_HAND_THUMB"], "THUMB"],
            [Blockly.Msg["AI_HAND_INDEX"], "INDEX"],
            [Blockly.Msg["AI_HAND_MIDDLE"], "MIDDLE"],
            [Blockly.Msg["AI_HAND_RING"], "RING"],
            [Blockly.Msg["AI_HAND_PINKY"], "PINKY"]
          ]
        }
      ],
      "output": "Boolean",
      "colour": Blockly.Msg["COLOUR_AI"],
      "tooltip": Blockly.Msg["AI_HAND_IS_FINGER_UP_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_hand_draw'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_HAND_DRAW"],
      "args0": [
        { "type": "field_variable", "name": "FRAME", "variable": "frame" },
        { "type": "field_variable", "name": "VAR", "variable": "results" },
        { "type": "field_colour", "name": "LANDMARK_COLOR", "colour": "#ff0000" },
        { "type": "field_colour", "name": "LINE_COLOR", "colour": "#00ff00" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI"],
      "tooltip": Blockly.Msg["AI_HAND_DRAW_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_hand_draw_indices'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_HAND_DRAW_INDICES"],
      "args0": [
        { "type": "field_variable", "name": "FRAME", "variable": "frame" },
        { "type": "field_variable", "name": "VAR", "variable": "results" },
        { "type": "input_value", "name": "SIZE" },
        { "type": "input_value", "name": "COLOR" }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI"],
      "tooltip": Blockly.Msg["AI_HAND_DRAW_INDICES_TOOLTIP"]
    });
  }
};
