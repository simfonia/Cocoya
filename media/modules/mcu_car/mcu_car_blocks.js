// mcu_car_blocks.js
Blockly.Blocks['mcu_car_motor'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["CAR_MOTOR"],
      "args0": [
        { "type": "input_value", "name": "LEFT", "check": "Number" },
        { "type": "input_value", "name": "RIGHT", "check": "Number" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_MCU_CAR"],
      "tooltip": Blockly.Msg["CAR_MOTOR_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['mcu_car_stop'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["CAR_STOP"],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_MCU_CAR"],
      "tooltip": Blockly.Msg["CAR_STOP_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['mcu_car_servo'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["CAR_SERVO"],
      "args0": [
        {
          "type": "field_dropdown",
          "name": "PIN",
          "options": [
            ["GP12", "board.GP12"],
            ["GP13", "board.GP13"],
            ["GP14", "board.GP14"],
            ["GP15", "board.GP15"],
            ["D0", "board.D0"],
            ["D1", "board.D1"]
          ]
        },
        { "type": "input_value", "name": "ANGLE", "check": "Number" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_MCU_CAR"],
      "tooltip": Blockly.Msg["CAR_SERVO_TOOLTIP"],
      "helpUrl": ""
    });
  }
};
