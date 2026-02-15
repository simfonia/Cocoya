// Hardware Blocks: hardware_blocks.js
Blockly.Blocks['mcu_set_led'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(Blockly.Msg["HW_SET_LED"].replace('%1', ''))
        .appendField(new Blockly.FieldDropdown([
            [Blockly.Msg["HW_SET_LED_ON"], "True"], 
            [Blockly.Msg["HW_SET_LED_OFF"], "False"]
        ]), "STATE");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_HARDWARE"]);
    this.setTooltip(Blockly.Msg["HW_SET_LED_TOOLTIP"]);
  }
};
