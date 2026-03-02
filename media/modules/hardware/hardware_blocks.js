// Hardware Blocks: hardware_blocks.js

// --- 影子積木：腳位選取器 ---
Blockly.Blocks['mcu_pin_shadow'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1",
      "args0": [
        {
          "type": "field_input",
          "name": "PIN",
          "text": "board.GP0"
        }
      ],
      "output": "String",
      "colour": Blockly.Msg["COLOUR_HARDWARE"],
      "tooltip": "輸入或選擇腳位名稱 (例如 board.GP0, board.D13)"
    });
  }
};

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

// --- 數位輸出 ---
Blockly.Blocks['mcu_digital_write'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HW_DIGITAL_WRITE"],
      "args0": [
        {
          "type": "input_value",
          "name": "PIN",
          "check": "String"
        },
        {
          "type": "field_dropdown",
          "name": "STATE",
          "options": [
            [Blockly.Msg["HW_PIN_HIGH"], "True"],
            [Blockly.Msg["HW_PIN_LOW"], "False"]
          ]
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_HARDWARE"],
      "tooltip": Blockly.Msg["HW_DIGITAL_WRITE_TOOLTIP"]
    });
  }
};

// --- 數位輸入 ---
Blockly.Blocks['mcu_digital_read'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HW_DIGITAL_READ"],
      "args0": [
        {
          "type": "input_value",
          "name": "PIN",
          "check": "String"
        }
      ],
      "output": "Boolean",
      "colour": Blockly.Msg["COLOUR_HARDWARE"],
      "tooltip": Blockly.Msg["HW_DIGITAL_READ_TOOLTIP"]
    });
  }
};

// --- 類比輸入 ---
Blockly.Blocks['mcu_analog_read'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HW_ANALOG_READ"],
      "args0": [
        {
          "type": "input_value",
          "name": "PIN",
          "check": "String"
        }
      ],
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_HARDWARE"],
      "tooltip": Blockly.Msg["HW_ANALOG_READ_TOOLTIP"]
    });
  }
};

// --- PWM 輸出 ---
Blockly.Blocks['mcu_pwm_write'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HW_PWM_WRITE"],
      "args0": [
        {
          "type": "input_value",
          "name": "PIN",
          "check": "String"
        },
        {
          "type": "input_value",
          "name": "VALUE",
          "check": "Number"
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_HARDWARE"],
      "tooltip": Blockly.Msg["HW_PWM_WRITE_TOOLTIP"]
    });
  }
};

// --- I2C 掃描 ---
Blockly.Blocks['mcu_i2c_scan'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HW_I2C_SCAN"],
      "output": "Array",
      "colour": Blockly.Msg["COLOUR_HARDWARE"],
      "tooltip": Blockly.Msg["HW_I2C_SCAN_TOOLTIP"]
    });
  }
};

Blockly.Blocks['mcu_stop_program'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HW_STOP_PROGRAM"],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_HARDWARE"],
      "tooltip": Blockly.Msg["HW_STOP_PROGRAM_TOOLTIP"]
    });
  }
};

Blockly.Blocks['mcu_reset'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HW_RESET"],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_HARDWARE"],
      "tooltip": Blockly.Msg["HW_RESET_TOOLTIP"]
    });
  }
};
