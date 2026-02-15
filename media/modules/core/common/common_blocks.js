// Common Blocks
Blockly.Blocks['common_test'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("print(\"Hello Cocoya\")");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(230);
    this.setTooltip("");
    this.setHelpUrl("");
  }
};
