// Tools Blocks: tools_blocks.js

Blockly.Blocks['py_tools_print'] = {
  init: function() {
    this.appendValueInput("TEXT").setCheck(null).appendField("print").appendField("(");
    this.appendDummyInput().appendField(")");
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_TOOLS"]);
  }
};

Blockly.Blocks['py_tools_input'] = {
  init: function() {
    this.appendValueInput("PROMPT").setCheck("String").appendField(Blockly.Msg["TEXT_INPUT"]).appendField("(");
    this.appendDummyInput().appendField(")");
    this.setInputsInline(true);
    this.setOutput(true, "String");
    this.setColour(Blockly.Msg["COLOUR_TOOLS"]);
  }
};

Blockly.Blocks['py_tools_comment'] = {
  init: function() {
    const FieldMultilineInput = window.FieldMultilineInput || Blockly.FieldMultilineInput;
    this.appendDummyInput().appendField(Blockly.Msg["TOOLS_COMMENT"]).appendField(new FieldMultilineInput(""), "TEXT");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_TOOLS"]);
    this.setTooltip(Blockly.Msg["TOOLS_COMMENT_TOOLTIP"]);
  }
};

Blockly.Blocks['py_tools_raw_statement'] = {
  init: function() {
    const FieldMultilineInput = window.FieldMultilineInput || Blockly.FieldMultilineInput;
    this.appendDummyInput().appendField(Blockly.Msg["TOOLS_RAW_CODE"]).appendField(new FieldMultilineInput(""), "TEXT");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_TOOLS"]);
    this.setTooltip(Blockly.Msg["TOOLS_RAW_STATEMENT_TOOLTIP"]);
  }
};

Blockly.Blocks['py_tools_raw_expression'] = {
  init: function() {
    this.appendDummyInput().appendField(new Blockly.FieldTextInput(""), "TEXT");
    this.setOutput(true, null);
    this.setColour(Blockly.Msg["COLOUR_TOOLS"]);
    this.setTooltip(Blockly.Msg["TOOLS_RAW_EXPRESSION_TOOLTIP"]);
  }
};
