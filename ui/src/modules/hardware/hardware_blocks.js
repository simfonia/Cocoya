// Hardware Blocks: hardware_blocks.js

/**
 * 定義常用腳位清單 (依開發板分組)
 */
const MCU_PIN_OPTIONS = [
  ["內建 LED", "board.LED"],
  // --- Maker Pi RP2040 / Pico W 常用腳位 ---
  ["[Pico] GP0 (Digital/PWM)", "board.GP0"],
  ["[Pico] GP1 (Digital/PWM)", "board.GP1"],
  ["[Pico] GP2 (Digital/PWM)", "board.GP2"],
  ["[Pico] GP16 (Digital/PWM)", "board.GP16"],
  ["[Pico] GP18 (NeoPixel)", "board.GP18"],
  ["[Pico] GP20 (Button)", "board.GP20"],
  ["[Pico] GP26 (ADC0)", "board.GP26"],
  ["[Pico] GP27 (ADC1)", "board.GP27"],
  ["[Pico] GP28 (ADC2)", "board.GP28"],
  // --- XIAO ESP32-S3 Sense 常用腳位 ---
  ["[XIAO] D0 (ADC/PWM)", "board.D0"],
  ["[XIAO] D1 (ADC/PWM)", "board.D1"],
  ["[XIAO] D2 (ADC/PWM)", "board.D2"],
  ["[XIAO] D3 (ADC/PWM)", "board.D3"],
  ["[XIAO] D4 (SDA/ADC)", "board.D4"],
  ["[XIAO] D5 (SCL/ADC)", "board.D5"],
  ["[XIAO] D6 (TX/UART)", "board.D6"],
  ["[XIAO] D7 (RX/UART)", "board.D7"],
  ["[XIAO] D8 (ADC/PWM)", "board.D8"],
  ["[XIAO] D9 (ADC/PWM)", "board.D9"],
  ["[XIAO] D10 (ADC/PWM)", "board.D10"]
];

// --- 影子積木：腳位選取器 (優化版：改為分組下拉選單) ---
Blockly.Blocks['mcu_pin_shadow'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1",
      "args0": [
        {
          "type": "field_dropdown",
          "name": "PIN",
          "options": MCU_PIN_OPTIONS
        }
      ],
      "output": "String",
      "colour": Blockly.Msg["COLOUR_HARDWARE"],
      "tooltip": "選擇開發板腳位名稱。 [Pico] 開頭適用於 Maker Pi / Pico W；[XIAO] 開頭適用於 XIAO S3。"
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
      "helpUrl": "hardware_pins",
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
      "helpUrl": "hardware_pins",
      "tooltip": Blockly.Msg["HW_DIGITAL_WRITE_TOOLTIP"]
    });
  }
};

// --- 數位讀入 ---
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
      "helpUrl": "hardware_pins",
      "tooltip": Blockly.Msg["HW_DIGITAL_READ_TOOLTIP"]
    });
  }
};

// --- 類比讀入 ---
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
      "helpUrl": "hardware_pins",
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
      "helpUrl": "hardware_pins",
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
      "helpUrl": "hardware_pins",
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
