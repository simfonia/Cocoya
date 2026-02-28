// mcu_huskylens_blocks.js
Blockly.Blocks['mcu_huskylens_init'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HUSKY_INIT"],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_HUSKYLENS"],
      "tooltip": Blockly.Msg["HUSKY_INIT_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['mcu_huskylens_request'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HUSKY_REQUEST"],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_HUSKYLENS"],
      "tooltip": Blockly.Msg["HUSKY_REQUEST_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['mcu_huskylens_get_box'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HUSKY_GET_BOX"],
      "args0": [
        { "type": "input_value", "name": "ID", "check": "Number" },
        {
          "type": "field_dropdown",
          "name": "FIELD",
          "options": [
            [Blockly.Msg["HUSKY_GET_BOX_X"], "x"],
            [Blockly.Msg["HUSKY_GET_BOX_Y"], "y"],
            [Blockly.Msg["HUSKY_GET_BOX_W"], "width"],
            [Blockly.Msg["HUSKY_GET_BOX_H"], "height"]
          ]
        }
      ],
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_HUSKYLENS"],
      "tooltip": "",
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['mcu_huskylens_is_detected'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HUSKY_IS_LEARNED"],
      "args0": [
        { "type": "input_value", "name": "ID", "check": "Number" }
      ],
      "output": "Boolean",
      "colour": Blockly.Msg["COLOUR_HUSKYLENS"],
      "tooltip": "",
      "helpUrl": ""
    });
  }
};
