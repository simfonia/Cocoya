// spike_blocks.js - Lego SPIKE Prime 積木定義（多層分類實驗版）

// === 初始化 ===
Blockly.Blocks['spike_init_hub'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["SPIKE_INIT_HUB"],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_SPIKE"],
      "tooltip": Blockly.Msg["SPIKE_INIT_HUB_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['spike_motor_init'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["SPIKE_MOTOR_INIT"],
      "args0": [
        {
          "type": "field_dropdown",
          "name": "PORT",
          "options": [
            ["A", "A"], ["B", "B"], ["C", "C"],
            ["D", "D"], ["E", "E"], ["F", "F"]
          ]
        },
        {
          "type": "field_dropdown",
          "name": "TYPE",
          "options": [
            [Blockly.Msg["SPIKE_MOTOR_TYPE_LARGE"] || "Large", "Large"],
            [Blockly.Msg["SPIKE_MOTOR_TYPE_MEDIUM"] || "Medium", "Medium"]
          ]
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_SPIKE_MOTOR"],
      "tooltip": Blockly.Msg["SPIKE_MOTOR_INIT_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['spike_color_init'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["SPIKE_COLOR_INIT"],
      "args0": [
        {
          "type": "field_dropdown",
          "name": "PORT",
          "options": [
            ["A", "A"], ["B", "B"], ["C", "C"],
            ["D", "D"], ["E", "E"], ["F", "F"]
          ]
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_SPIKE_SENSOR_COLOR"],
      "tooltip": Blockly.Msg["SPIKE_COLOR_INIT_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['spike_distance_init'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["SPIKE_DISTANCE_INIT"],
      "args0": [
        {
          "type": "field_dropdown",
          "name": "PORT",
          "options": [
            ["A", "A"], ["B", "B"], ["C", "C"],
            ["D", "D"], ["E", "E"], ["F", "F"]
          ]
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_SPIKE_SENSOR_DISTANCE"],
      "tooltip": Blockly.Msg["SPIKE_DISTANCE_INIT_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['spike_force_init'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["SPIKE_FORCE_INIT"],
      "args0": [
        {
          "type": "field_dropdown",
          "name": "PORT",
          "options": [
            ["A", "A"], ["B", "B"], ["C", "C"],
            ["D", "D"], ["E", "E"], ["F", "F"]
          ]
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_SPIKE_SENSOR_FORCE"],
      "tooltip": Blockly.Msg["SPIKE_FORCE_INIT_TOOLTIP"],
      "helpUrl": ""
    });
  }
};
// === 馬達控制 ===
Blockly.Blocks['spike_motor_run'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["SPIKE_MOTOR_RUN"],
      "args0": [
        {
          "type": "field_dropdown",
          "name": "PORT",
          "options": [
            ["A", "A"], ["B", "B"], ["C", "C"],
            ["D", "D"], ["E", "E"], ["F", "F"]
          ]
        },
        {
          "type": "field_number",
          "name": "SPEED",
          "value": 500,
          "min": -1000,
          "max": 1000
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_SPIKE_MOTOR"],
      "tooltip": Blockly.Msg["SPIKE_MOTOR_RUN_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['spike_motor_run_angle'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["SPIKE_MOTOR_RUN_ANGLE"],
      "args0": [
        {
          "type": "field_dropdown",
          "name": "PORT",
          "options": [
            ["A", "A"], ["B", "B"], ["C", "C"],
            ["D", "D"], ["E", "E"], ["F", "F"]
          ]
        },
        {
          "type": "field_number",
          "name": "SPEED",
          "value": 500,
          "min": 1,
          "max": 1000
        },
        {
          "type": "field_number",
          "name": "ANGLE",
          "value": 360,
          "min": 1,
          "max": 999999
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_SPIKE_MOTOR"],
      "tooltip": Blockly.Msg["SPIKE_MOTOR_RUN_ANGLE_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['spike_motor_run_target'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["SPIKE_MOTOR_RUN_TARGET"],
      "args0": [
        {
          "type": "field_dropdown",
          "name": "PORT",
          "options": [
            ["A", "A"], ["B", "B"], ["C", "C"],
            ["D", "D"], ["E", "E"], ["F", "F"]
          ]
        },
        {
          "type": "field_number",
          "name": "SPEED",
          "value": 500,
          "min": 1,
          "max": 1000
        },
        {
          "type": "field_number",
          "name": "TARGET",
          "value": 90,
          "min": -360,
          "max": 360
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_SPIKE_MOTOR"],
      "tooltip": Blockly.Msg["SPIKE_MOTOR_RUN_TARGET_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['spike_motor_stop'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["SPIKE_MOTOR_STOP"],
      "args0": [
        {
          "type": "field_dropdown",
          "name": "PORT",
          "options": [
            ["A", "A"], ["B", "B"], ["C", "C"],
            ["D", "D"], ["E", "E"], ["F", "F"]
          ]
        },
        {
          "type": "field_dropdown",
          "name": "STOP_TYPE",
          "options": [
            [Blockly.Msg["SPIKE_STOP_COAST"] || "Coast", "COAST"],
            [Blockly.Msg["SPIKE_STOP_BRAKE"] || "Brake", "BRAKE"],
            [Blockly.Msg["SPIKE_STOP_HOLD"] || "Hold", "HOLD"]
          ]
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_SPIKE_MOTOR"],
      "tooltip": Blockly.Msg["SPIKE_MOTOR_STOP_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['spike_motor_angle'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["SPIKE_MOTOR_ANGLE"],
      "args0": [
        {
          "type": "field_dropdown",
          "name": "PORT",
          "options": [
            ["A", "A"], ["B", "B"], ["C", "C"],
            ["D", "D"], ["E", "E"], ["F", "F"]
          ]
        }
      ],
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_SPIKE_MOTOR"],
      "tooltip": Blockly.Msg["SPIKE_MOTOR_ANGLE_TOOLTIP"],
      "helpUrl": ""
    });
  }
};
// === 顏色感測器 ===
Blockly.Blocks['spike_color_detect'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["SPIKE_COLOR_DETECT"],
      "args0": [
        {
          "type": "field_dropdown",
          "name": "PORT",
          "options": [
            ["A", "A"], ["B", "B"], ["C", "C"],
            ["D", "D"], ["E", "E"], ["F", "F"]
          ]
        }
      ],
      "output": "Colour",
      "colour": Blockly.Msg["COLOUR_SPIKE_SENSOR_COLOR"],
      "tooltip": Blockly.Msg["SPIKE_COLOR_DETECT_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['spike_color_reflection'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["SPIKE_COLOR_REFLECTION"],
      "args0": [
        {
          "type": "field_dropdown",
          "name": "PORT",
          "options": [
            ["A", "A"], ["B", "B"], ["C", "C"],
            ["D", "D"], ["E", "E"], ["F", "F"]
          ]
        }
      ],
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_SPIKE_SENSOR_COLOR"],
      "tooltip": Blockly.Msg["SPIKE_COLOR_REFLECTION_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['spike_color_ambient'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["SPIKE_COLOR_AMBIENT"],
      "args0": [
        {
          "type": "field_dropdown",
          "name": "PORT",
          "options": [
            ["A", "A"], ["B", "B"], ["C", "C"],
            ["D", "D"], ["E", "E"], ["F", "F"]
          ]
        }
      ],
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_SPIKE_SENSOR_COLOR"],
      "tooltip": Blockly.Msg["SPIKE_COLOR_AMBIENT_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

// === 距離感測器 ===
Blockly.Blocks['spike_distance_get'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["SPIKE_DISTANCE_GET"],
      "args0": [
        {
          "type": "field_dropdown",
          "name": "PORT",
          "options": [
            ["A", "A"], ["B", "B"], ["C", "C"],
            ["D", "D"], ["E", "E"], ["F", "F"]
          ]
        }
      ],
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_SPIKE_SENSOR_DISTANCE"],
      "tooltip": Blockly.Msg["SPIKE_DISTANCE_GET_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

// === 力道感測器 ===
Blockly.Blocks['spike_force_pressed'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["SPIKE_FORCE_PRESSED"],
      "args0": [
        {
          "type": "field_dropdown",
          "name": "PORT",
          "options": [
            ["A", "A"], ["B", "B"], ["C", "C"],
            ["D", "D"], ["E", "E"], ["F", "F"]
          ]
        }
      ],
      "output": "Boolean",
      "colour": Blockly.Msg["COLOUR_SPIKE_SENSOR_FORCE"],
      "tooltip": Blockly.Msg["SPIKE_FORCE_PRESSED_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['spike_force_force'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["SPIKE_FORCE_FORCE"],
      "args0": [
        {
          "type": "field_dropdown",
          "name": "PORT",
          "options": [
            ["A", "A"], ["B", "B"], ["C", "C"],
            ["D", "D"], ["E", "E"], ["F", "F"]
          ]
        }
      ],
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_SPIKE_SENSOR_FORCE"],
      "tooltip": Blockly.Msg["SPIKE_FORCE_FORCE_TOOLTIP"],
      "helpUrl": ""
    });
  }
};
// === Hub 內建 ===
Blockly.Blocks['spike_button_pressed'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["SPIKE_BUTTON_PRESSED"],
      "args0": [
        {
          "type": "field_dropdown",
          "name": "BUTTON",
          "options": [
            [Blockly.Msg["SPIKE_BTN_LEFT"] || "Left", "LEFT"],
            [Blockly.Msg["SPIKE_BTN_RIGHT"] || "Right", "RIGHT"],
            [Blockly.Msg["SPIKE_BTN_CENTER"] || "Center", "CENTER"]
          ]
        }
      ],
      "output": "Boolean",
      "colour": Blockly.Msg["COLOUR_SPIKE_BUTTON"],
      "tooltip": Blockly.Msg["SPIKE_BUTTON_PRESSED_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['spike_wait_button'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["SPIKE_WAIT_BUTTON"],
      "args0": [
        {
          "type": "field_dropdown",
          "name": "BUTTON",
          "options": [
            [Blockly.Msg["SPIKE_BTN_LEFT"] || "Left", "LEFT"],
            [Blockly.Msg["SPIKE_BTN_RIGHT"] || "Right", "RIGHT"],
            [Blockly.Msg["SPIKE_BTN_CENTER"] || "Center", "CENTER"]
          ]
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_SPIKE_BUTTON"],
      "tooltip": Blockly.Msg["SPIKE_WAIT_BUTTON_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['spike_imu_tilt'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["SPIKE_IMU_TILT"],
      "args0": [
        {
          "type": "field_dropdown",
          "name": "AXIS",
          "options": [
            [Blockly.Msg["SPIKE_TILT_X"] || "Tilt X", "TILT_X"],
            [Blockly.Msg["SPIKE_TILT_Y"] || "Tilt Y", "TILT_Y"]
          ]
        }
      ],
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_SPIKE_SENSOR_IMU"],
      "tooltip": Blockly.Msg["SPIKE_IMU_TILT_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['spike_imu_up'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["SPIKE_IMU_UP"],
      "output": "String",
      "colour": Blockly.Msg["COLOUR_SPIKE_SENSOR_IMU"],
      "tooltip": Blockly.Msg["SPIKE_IMU_UP_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['spike_display_text'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["SPIKE_DISPLAY_TEXT"],
      "args0": [
        {
          "type": "field_input",
          "name": "TEXT",
          "text": "Hello!"
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_SPIKE_LED"],
      "tooltip": Blockly.Msg["SPIKE_DISPLAY_TEXT_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['spike_display_clear'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["SPIKE_DISPLAY_CLEAR"],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_SPIKE_LED"],
      "tooltip": Blockly.Msg["SPIKE_DISPLAY_CLEAR_TOOLTIP"],
      "helpUrl": ""
    });
  }
};


Blockly.Blocks['spike_play_note'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["SPIKE_PLAY_NOTE"],
      "args0": [
        {
          "type": "field_number",
          "name": "FREQUENCY",
          "value": 440,
          "min": 0,
          "max": 10000
        },
        {
          "type": "field_number",
          "name": "DURATION",
          "value": 500,
          "min": 0
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_SPIKE_MUSIC"],
      "tooltip": Blockly.Msg["SPIKE_PLAY_NOTE_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['spike_play_beep'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["SPIKE_PLAY_BEEP"],
      "args0": [
        {
          "type": "field_number",
          "name": "DURATION",
          "value": 500,
          "min": 0
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_SPIKE_MUSIC"],
      "tooltip": Blockly.Msg["SPIKE_PLAY_BEEP_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

