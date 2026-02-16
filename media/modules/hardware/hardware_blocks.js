// Hardware Blocks: hardware_blocks.js
Blockly.Blocks['mcu_set_led'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HW_SET_LED"],
      "args0": [
        { 
          "type": "field_dropdown", 
          "name": "STATE",
          "options": [
            [Blockly.Msg["HW_SET_LED_ON"], "True"], 
            [Blockly.Msg["HW_SET_LED_OFF"], "False"]
          ]
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_HARDWARE"],
      "tooltip": Blockly.Msg["HW_SET_LED_TOOLTIP"]
    });
  }
};
