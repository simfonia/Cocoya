// OpenCV Basic Blocks
Blockly.Blocks['py_ai_open_camera'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(Blockly.Msg["AI_OPEN_CAMERA"].replace('%1', ''))
        .appendField(new Blockly.FieldTextInput("0"), "INDEX");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_AI"]);
    this.setTooltip(Blockly.Msg["AI_OPEN_CAMERA_TOOLTIP"]);
  }
};

Blockly.Blocks['py_ai_read_frame'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(Blockly.Msg["AI_READ_FRAME"].split('%1')[0])
        .appendField(new Blockly.FieldVariable("frame"), "VAR")
        .appendField(Blockly.Msg["AI_READ_FRAME"].split('%1')[1] || '');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_AI"]);
    this.setTooltip(Blockly.Msg["AI_READ_FRAME_TOOLTIP"]);
  }
};

Blockly.Blocks['py_ai_show_image'] = {
  init: function() {
    this.appendValueInput("IMAGE")
        .setCheck(null)
        .appendField(Blockly.Msg["AI_SHOW_IMAGE"].replace('%1', ''));
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_AI"]);
    this.setTooltip(Blockly.Msg["AI_SHOW_IMAGE_TOOLTIP"]);
  }
};

Blockly.Blocks['py_ai_wait_key_break'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(Blockly.Msg["AI_WAIT_KEY_BREAK"].replace('%1', ''))
        .appendField(new Blockly.FieldTextInput("q"), "KEY");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_AI"]);
    this.setTooltip(Blockly.Msg["AI_WAIT_KEY_BREAK_TOOLTIP"]);
  }
};

Blockly.Blocks['py_ai_release_all'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(Blockly.Msg["AI_RELEASE_ALL"]);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_AI"]);
    this.setTooltip(Blockly.Msg["AI_RELEASE_ALL_TOOLTIP"]);
  }
};
