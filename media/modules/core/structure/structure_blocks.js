// Structure Blocks: structure_blocks.js

Blockly.Blocks['py_main'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(Blockly.Msg["PY_MAIN"]);
    this.appendDummyInput()
        .appendField(Blockly.Msg["PY_COLON"]);
    this.appendStatementInput("DO")
        .setCheck(null);
    this.setInputsInline(true);
    this.setColour(Blockly.Msg["COLOUR_STRUCTURE"]);
    this.setTooltip(Blockly.Msg["PY_MAIN_TOOLTIP"]);
  }
};

Blockly.Blocks['py_definition_zone'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(Blockly.Msg["PY_DEF_ZONE"]);
    this.appendDummyInput()
        .appendField(Blockly.Msg["PY_COLON"]);
    this.appendStatementInput("DEFS")
        .setCheck(null);
    this.setInputsInline(true);
    this.setColour(Blockly.Msg["COLOUR_STRUCTURE"]);
    this.setTooltip(Blockly.Msg["PY_DEF_ZONE_TOOLTIP"]);
  }
};

Blockly.Blocks['mcu_main'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(Blockly.Msg["MCU_MAIN"]);
    this.appendDummyInput()
        .appendField(Blockly.Msg["PY_COLON"]);
    this.appendStatementInput("DO")
        .setCheck(null);
    this.setInputsInline(true);
    this.setColour(Blockly.Msg["COLOUR_STRUCTURE"]);
    this.setTooltip(Blockly.Msg["MCU_MAIN_TOOLTIP"]);
  }
};

Blockly.Blocks['py_import'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(Blockly.Msg["PY_IMPORT_IMPORT"])
        .appendField(new Blockly.FieldTextInput("math"), "LIB");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_STRUCTURE"]);
    this.setTooltip(Blockly.Msg["PY_IMPORT_TOOLTIP"]);
  }
};

Blockly.Blocks['py_import_from'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(Blockly.Msg["PY_IMPORT_FROM_FROM"])
        .appendField(new Blockly.FieldTextInput("math"), "LIB")
        .appendField(Blockly.Msg["PY_IMPORT_FROM_IMPORT"])
        .appendField(new Blockly.FieldTextInput("*"), "TARGET");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_STRUCTURE"]);
    this.setTooltip(Blockly.Msg["PY_IMPORT_FROM_TOOLTIP"]);
  }
};
