// MediaPipe Face Mesh Blocks: ai_face_blocks.js

Blockly.Blocks['py_ai_face_init'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_FACE_INIT"],
      "args0": [
        { "type": "field_number", "name": "MAX_FACES", "value": 1, "min": 1, "max": 10 },
        { "type": "field_number", "name": "MIN_CONF", "value": 0.5, "min": 0, "max": 1 }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI_FACE"],
      "tooltip": Blockly.Msg["AI_FACE_INIT_TOOLTIP"]
    });
  },
  onchange: function(event) {
    if (!this.workspace || this.workspace.isDragging || this.workspace.isFlyout) return;
    let parent = this.getSurroundParent();
    let inDefZone = false;
    while (parent) {
      if (parent.type === 'py_definition_zone') { inDefZone = true; break; }
      parent = parent.getSurroundParent();
    }
    const svg = (this.rendered && this.getSvgRoot) ? this.getSvgRoot() : null;
    if (!inDefZone) {
      this.setWarningText(Blockly.Msg["AI_FACE_INIT_WARNING"]);
      if (svg) svg.classList.add('blockly-conflict-glow');
    } else {
      this.setWarningText(null);
      if (svg) svg.classList.remove('blockly-conflict-glow');
    }
  }
};

Blockly.Blocks['py_ai_face_process'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_FACE_PROCESS"],
      "args0": [
        { "type": "input_value", "name": "FRAME" },
        { "type": "field_variable", "name": "VAR", "variable": "results_face" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI_FACE"],
      "tooltip": Blockly.Msg["AI_FACE_PROCESS_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_face_is_detected'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_FACE_IS_DETECTED"],
      "args0": [
        { "type": "field_variable", "name": "VAR", "variable": "results_face" }
      ],
      "output": "Boolean",
      "colour": Blockly.Msg["COLOUR_AI_FACE"],
      "tooltip": Blockly.Msg["AI_FACE_IS_DETECTED_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_face_get_landmarks'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_FACE_GET_LANDMARKS"],
      "args0": [
        { "type": "field_variable", "name": "VAR", "variable": "results_face" },
        { "type": "field_number", "name": "INDEX", "value": 0, "min": 0 }
      ],
      "output": "FaceLandmarks",
      "colour": Blockly.Msg["COLOUR_AI_FACE"],
      "tooltip": Blockly.Msg["AI_FACE_GET_LANDMARKS_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_face_get_landmark'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_FACE_GET_LANDMARK"],
      "args0": [
        { "type": "input_value", "name": "FACE", "check": "FaceLandmarks" },
        { "type": "field_number", "name": "INDEX", "value": 0, "min": 0, "max": 467 }
      ],
      "output": "Landmark",
      "colour": Blockly.Msg["COLOUR_AI_FACE"],
      "tooltip": Blockly.Msg["AI_FACE_GET_LANDMARK_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_face_draw'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_FACE_DRAW"],
      "args0": [
        { "type": "field_variable", "name": "FRAME", "variable": "frame" },
        { "type": "field_variable", "name": "VAR", "variable": "results_face" },
        { "type": "field_colour", "name": "MESH_COLOR", "colour": "#ffffff" },
        { "type": "field_colour", "name": "CONTOUR_COLOR", "colour": "#eeeeee" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI_FACE"],
      "tooltip": Blockly.Msg["AI_FACE_DRAW_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_ai_face_draw_indices'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_FACE_DRAW_INDICES"],
      "args0": [
        { "type": "field_variable", "name": "FRAME", "variable": "frame" },
        { "type": "field_variable", "name": "VAR", "variable": "results_face" },
        { "type": "input_value", "name": "START" },
        { "type": "input_value", "name": "END" },
        { "type": "input_value", "name": "SIZE" },
        { "type": "input_value", "name": "COLOR" }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI_FACE"],
      "tooltip": Blockly.Msg["AI_FACE_DRAW_INDICES_TOOLTIP"]
    });
  }
};
