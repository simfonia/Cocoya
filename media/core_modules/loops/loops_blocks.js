// Loop Blocks: loops_blocks.js

Blockly.Blocks['py_loop_while'] = {
  init: function() {
    this.appendValueInput("CONDITION").setCheck("Boolean").appendField("while");
    this.appendDummyInput().appendField(":");
    this.appendStatementInput("DO");
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_LOOPS"]);
    this.setTooltip("當條件成立時，重複執行內容");
  }
};

Blockly.Blocks['py_loop_for_range'] = {
  init: function() {
    this.appendDummyInput().appendField("for").appendField(new Blockly.FieldVariable("i"), "VAR").appendField("in range(");
    this.appendValueInput("START").setCheck("Number");
    this.appendValueInput("STOP").setCheck("Number").appendField(",");
    this.appendValueInput("STEP").setCheck("Number").appendField(",");
    this.appendDummyInput().appendField(")");
    this.appendDummyInput().appendField(":");
    this.appendStatementInput("DO");
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_LOOPS"]);
    this.setTooltip("使用 range 函數進行數字迭代");
  }
};

Blockly.Blocks['py_loop_for_in'] = {
  init: function() {
    this.appendDummyInput().appendField("for").appendField(new Blockly.FieldVariable("item"), "VAR").appendField("in");
    this.appendValueInput("ITERABLE");
    this.appendDummyInput().appendField(":");
    this.appendStatementInput("DO");
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_LOOPS"]);
    this.setTooltip("迭代列表、字典或元組中的每一項");
  }
};

Blockly.Blocks['py_loop_flow_control'] = {
  init: function() {
    this.appendDummyInput().appendField(new Blockly.FieldDropdown([["break", "break"], ["continue", "continue"]]), "FLOW");
    this.setPreviousStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_LOOPS"]);
    this.setTooltip("中斷目前迴圈 (break) 或跳過剩餘內容進入下一次迭代 (continue)");
  }
};

Blockly.Blocks["py_loop_enumerate"] = {
  init: function() {
    this.appendDummyInput().appendField("for").appendField(new Blockly.FieldVariable("i"), "VAR_I").appendField(",").appendField(new Blockly.FieldVariable("item"), "VAR_ITEM").appendField("in enumerate(");
    this.appendValueInput("LIST").setCheck("Array");
    this.appendDummyInput().appendField(")");
    this.appendDummyInput().appendField(":");
    this.appendStatementInput("DO");
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_LOOPS"]);
    this.setTooltip("同時取得索引 (i) 與內容 (item)");
  }
};

Blockly.Blocks["py_loop_items"] = {
  init: function() {
    this.appendDummyInput().appendField("for").appendField(new Blockly.FieldVariable("key"), "VAR_K").appendField(",").appendField(new Blockly.FieldVariable("val"), "VAR_V").appendField("in");
    this.appendValueInput("DICT").setCheck("Dict");
    this.appendDummyInput().appendField(".items()");
    this.appendDummyInput().appendField(":");
    this.appendStatementInput("DO");
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_LOOPS"]);
    this.setTooltip("同時取得字典的鍵 (key) 與值 (val)");
  }
};
