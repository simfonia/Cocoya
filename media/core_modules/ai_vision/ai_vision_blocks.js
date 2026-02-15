// AI Vision Blocks: ai_vision_blocks.js
Blockly.Blocks['py_ai_open_camera'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(Blockly.Msg["AI_OPEN_CAMERA"].replace('%1', '0'));
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_AI"]);
    this.setTooltip(Blockly.Msg["AI_OPEN_CAMERA_TOOLTIP"]);
  }
};
