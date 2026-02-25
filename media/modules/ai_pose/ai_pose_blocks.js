// MediaPipe Pose Blocks: ai_pose_blocks.js

Blockly.Blocks['py_ai_pose_init'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_POSE_INIT"],
      "args0": [
        { "type": "field_number", "name": "MIN_CONF", "value": 0.5, "min": 0, "max": 1 }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI_POSE"],
      "tooltip": Blockly.Msg["AI_POSE_INIT_TOOLTIP"]
    });
  },
  onchange: function(event) {
    if (!this.workspace || this.workspace.isDragging() || this.workspace.isFlyout) return;
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
      this.setWarningText(Blockly.Msg["AI_POSE_INIT_WARNING"]);
      const svg = this.getSvgRoot();
      if (svg) svg.classList.add('blockly-conflict-glow');
    } else {
      this.setWarningText(null);
      const svg = this.getSvgRoot();
      if (svg) svg.classList.remove('blockly-conflict-glow');
    }
  }
};

Blockly.Blocks['py_ai_pose_process'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_POSE_PROCESS"],
      "args0": [
        { "type": "input_value", "name": "FRAME" },
        { "type": "field_variable", "name": "VAR", "variable": "results" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI_POSE"],
      "tooltip": Blockly.Msg["AI_POSE_PROCESS_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_pose_is_detected'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_POSE_IS_DETECTED"],
      "args0": [
        { "type": "field_variable", "name": "VAR", "variable": "results" }
      ],
      "output": "Boolean",
      "colour": Blockly.Msg["COLOUR_AI_POSE"],
      "tooltip": Blockly.Msg["AI_POSE_IS_DETECTED_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_pose_get_landmarks'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_POSE_GET_LANDMARKS"],
      "args0": [
        { "type": "field_variable", "name": "VAR", "variable": "results" }
      ],
      "output": "PoseLandmarks",
      "colour": Blockly.Msg["COLOUR_AI_POSE"],
      "tooltip": Blockly.Msg["AI_POSE_GET_LANDMARKS_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_pose_get_landmark'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_POSE_GET_LANDMARK"],
      "args0": [
        { "type": "input_value", "name": "POSE", "check": "PoseLandmarks" },
        { "type": "field_number", "name": "INDEX", "value": 0, "min": 0, "max": 32 }
      ],
      "output": "Landmark",
      "colour": Blockly.Msg["COLOUR_AI_POSE"],
      "tooltip": Blockly.Msg["AI_POSE_GET_LANDMARK_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_pose_get_landmark_xy'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_POSE_GET_LANDMARK_XY"],
      "args0": [
        { "type": "input_value", "name": "LANDMARK", "check": "Landmark" },
        { "type": "field_number", "name": "WIDTH", "value": 640 },
        { "type": "field_number", "name": "HEIGHT", "value": 480 }
      ],
      "output": "Tuple",
      "inputsInline": true,
      "colour": Blockly.Msg["COLOUR_AI_POSE"],
      "tooltip": Blockly.Msg["AI_POSE_GET_LANDMARK_XY_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_pose_draw'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_POSE_DRAW"],
      "args0": [
        { "type": "field_variable", "name": "FRAME", "variable": "frame" },
        { "type": "field_variable", "name": "VAR", "variable": "results" },
        { "type": "field_colour", "name": "LANDMARK_COLOR", "colour": "#ff0000" },
        { "type": "field_colour", "name": "LINE_COLOR", "colour": "#00ff00" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI_POSE"],
      "tooltip": Blockly.Msg["AI_POSE_DRAW_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_pose_draw_indices'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_POSE_DRAW_INDICES"],
      "args0": [
        { "type": "field_variable", "name": "FRAME", "variable": "frame" },
        { "type": "field_variable", "name": "VAR", "variable": "results" },
        { "type": "input_value", "name": "SIZE" },
        { "type": "input_value", "name": "COLOR" }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI_POSE"],
      "tooltip": Blockly.Msg["AI_POSE_DRAW_INDICES_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_pose_calc_dist'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_POSE_CALC_DIST"],
      "args0": [
        { "type": "input_value", "name": "LM_A", "check": "Landmark" },
        { "type": "input_value", "name": "LM_B", "check": "Landmark" },
        { "type": "field_number", "name": "WIDTH", "value": 640 },
        { "type": "field_number", "name": "HEIGHT", "value": 480 }
      ],
      "output": "Number",
      "inputsInline": true,
      "colour": Blockly.Msg["COLOUR_AI_POSE"],
      "tooltip": Blockly.Msg["AI_POSE_CALC_DIST_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_pose_detect_punch'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_POSE_DETECT_PUNCH"],
      "args0": [
        { "type": "input_value", "name": "POSE", "check": "PoseLandmarks" },
        { 
          "type": "field_dropdown", 
          "name": "SIDE", 
          "options": [["左手", "LEFT"], ["右手", "RIGHT"]] 
        },
        { "type": "field_number", "name": "SENSITIVITY", "value": 20, "min": 1 }
      ],
      "output": "Boolean",
      "colour": Blockly.Msg["COLOUR_AI_POSE"],
      "tooltip": Blockly.Msg["AI_POSE_DETECT_PUNCH_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_pose_get_velocity'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_POSE_GET_VELOCITY"],
      "args0": [
        { "type": "input_value", "name": "CURR", "check": "Tuple" },
        { "type": "input_value", "name": "PREV", "check": "Tuple" }
      ],
      "output": "Number",
      "inputsInline": true,
      "colour": Blockly.Msg["COLOUR_AI_POSE"],
      "tooltip": Blockly.Msg["AI_POSE_GET_VELOCITY_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_pose_is_in_frame'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_POSE_IS_IN_FRAME"],
      "args0": [
        { "type": "input_value", "name": "POS", "check": "Tuple" },
        { "type": "field_number", "name": "WIDTH", "value": 640 },
        { "type": "field_number", "name": "HEIGHT", "value": 480 }
      ],
      "output": "Boolean",
      "inputsInline": true,
      "colour": Blockly.Msg["COLOUR_AI_POSE"],
      "tooltip": Blockly.Msg["AI_POSE_IS_IN_FRAME_TOOLTIP"]
    });
  }
};
