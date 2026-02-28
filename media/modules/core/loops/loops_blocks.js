// Loop Blocks: loops_blocks.js

Blockly.Blocks['py_loop_while'] = {
  init: function() {
    this.appendValueInput("CONDITION").setCheck("Boolean").appendField(Blockly.Msg["LOOP_WHILE"]);
    this.appendDummyInput().appendField(Blockly.Msg["PY_COLON"]);
    this.appendStatementInput("DO");
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_LOOPS"]);
    this.setTooltip(Blockly.Msg["LOOP_WHILE_TOOLTIP"]);
  }
};

Blockly.Blocks['py_loop_for_range'] = {
  init: function() {
    this.appendDummyInput().appendField(Blockly.Msg["LOOP_FOR"]).appendField(new Blockly.FieldVariable("i"), "VAR").appendField(Blockly.Msg["LOOP_IN"]).appendField(Blockly.Msg["LOOP_RANGE"]);
    this.appendValueInput("START").setCheck("Number");
    this.appendValueInput("STOP").setCheck("Number").appendField(",");
    this.appendValueInput("STEP").setCheck("Number").appendField(",");
    this.appendDummyInput().appendField(")");
    this.appendDummyInput().appendField(Blockly.Msg["PY_COLON"]);
    this.appendStatementInput("DO");
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_LOOPS"]);
    this.setTooltip(Blockly.Msg["LOOP_RANGE_TOOLTIP"]);
  }
};

Blockly.Blocks['py_loop_for_in'] = {
  init: function() {
    this.appendDummyInput().appendField(Blockly.Msg["LOOP_FOR"]).appendField(new Blockly.FieldVariable("item"), "VAR").appendField(Blockly.Msg["LOOP_IN"]);
    this.appendValueInput("ITERABLE");
    this.appendDummyInput().appendField(Blockly.Msg["PY_COLON"]);
    this.appendStatementInput("DO");
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_LOOPS"]);
    this.setTooltip(Blockly.Msg["LOOP_FOR_IN_TOOLTIP"]);
  }
};

Blockly.Blocks['py_loop_flow_control'] = {
  init: function() {
    this.appendDummyInput().appendField(new Blockly.FieldDropdown([[Blockly.Msg["LOOP_FLOW_BREAK"], "break"], [Blockly.Msg["LOOP_FLOW_CONTINUE"], "continue"]]), "FLOW");
    this.setPreviousStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_LOOPS"]);
    this.setTooltip(Blockly.Msg["LOOP_FLOW_TOOLTIP"]);
  }
};

Blockly.Blocks["py_loop_enumerate"] = {
  init: function() {
    this.appendDummyInput().appendField(Blockly.Msg["LOOP_FOR"]).appendField(new Blockly.FieldVariable("i"), "VAR_I").appendField(",").appendField(new Blockly.FieldVariable("item"), "VAR_ITEM").appendField(Blockly.Msg["LOOP_IN"]).appendField(Blockly.Msg["LOOP_ENUMERATE"]);
    this.appendValueInput("LIST").setCheck("Array");
    this.appendDummyInput().appendField(")");
    this.appendDummyInput().appendField(Blockly.Msg["PY_COLON"]);
    this.appendStatementInput("DO");
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_LOOPS"]);
    this.setTooltip(Blockly.Msg["LOOP_ENUMERATE_TOOLTIP"]);
  }
};

Blockly.Blocks["py_loop_items"] = {
  init: function() {
    this.appendDummyInput().appendField(Blockly.Msg["LOOP_FOR"]).appendField(new Blockly.FieldVariable("key"), "VAR_K").appendField(",").appendField(new Blockly.FieldVariable("val"), "VAR_V").appendField(Blockly.Msg["LOOP_IN"]);
    this.appendValueInput("DICT").setCheck("Dict");
    this.appendDummyInput().appendField(Blockly.Msg["LOOP_ITEMS"]);
    this.appendDummyInput().appendField(Blockly.Msg["PY_COLON"]);
    this.appendStatementInput("DO");
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_LOOPS"]);
    this.setTooltip(Blockly.Msg["LOOP_ITEMS_TOOLTIP"]);
  }
};
