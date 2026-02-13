// Structure Blocks: structure_blocks.js

Blockly.Blocks['py_main'] = {
  init: function() {
    this.appendDummyInput()
        .appendField('if __name__ == "__main__"');
    this.appendDummyInput()
        .appendField(Blockly.Msg["PY_COLON"]);
    this.appendStatementInput("DO")
        .setCheck(null);
    this.setInputsInline(true);
    this.setColour(Blockly.Msg["COLOUR_STRUCTURE"]);
    this.setTooltip("程式執行入口");
  }
};

Blockly.Blocks['py_definition_zone'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("Global Definitions (全域定義)");
    this.appendDummyInput()
        .appendField(Blockly.Msg["PY_COLON"]);
    this.appendStatementInput("DEFS")
        .setCheck(null);
    this.setInputsInline(true);
    this.setColour(Blockly.Msg["COLOUR_STRUCTURE"]);
    this.setTooltip("在此區域定義全域變數或進行初始化設定");
  }
};

Blockly.Blocks['py_import'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("import")
        .appendField(new Blockly.FieldTextInput("math"), "LIB");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_STRUCTURE"]);
    this.setTooltip("引用 Python 程式庫");
  }
};

Blockly.Blocks['py_import_from'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("from")
        .appendField(new Blockly.FieldTextInput("math"), "LIB")
        .appendField("import")
        .appendField(new Blockly.FieldTextInput("*"), "TARGET");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_STRUCTURE"]);
    this.setTooltip("從程式庫引用特定功能");
  }
};
