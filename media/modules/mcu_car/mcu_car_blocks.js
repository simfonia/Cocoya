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
      "args0": [
        {
          "type": "field_dropdown",
          "name": "MODE",
          "options": [
            [Blockly.Msg["CAR_BRAKE"] || "Brake", "BRAKE"],
            [Blockly.Msg["CAR_COAST"] || "Coast", "COAST"]
          ]
        }
      ],
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
            [Blockly.Msg["CAR_HAND_RIGHT"] || "Right Hand (GP12)", "board.GP12"],
            [Blockly.Msg["CAR_HAND_LEFT"] || "Left Hand (GP13)", "board.GP13"],
            ["GP14", "board.GP14"],
            ["GP15", "board.GP15"],
            ["D0 (GP0)", "board.GP0"],
            ["D1 (GP1)", "board.GP1"]
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

Blockly.Blocks['mcu_car_button_pressed'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["CAR_BUTTON_PRESSED"],
      "args0": [
        {
          "type": "field_dropdown",
          "name": "PIN",
          "options": [
            [Blockly.Msg["CAR_BUTTON_1"] || "1", "board.GP20"],
            [Blockly.Msg["CAR_BUTTON_2"] || "2", "board.GP21"]
          ]
        }
      ],
      "output": "Boolean",
      "colour": Blockly.Msg["COLOUR_MCU_CAR"],
      "tooltip": Blockly.Msg["CAR_BUTTON_TOOLTIP"]
    });
  }
};

// --- Servo Setup (Calibration) ---
Blockly.Blocks['mcu_car_servo_setup'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["CAR_SERVO_SETUP"],
      "args0": [
        {
          "type": "field_dropdown",
          "name": "HAND",
          "options": [
            [Blockly.Msg["CAR_HAND_RIGHT"] || "Right Hand (GP12)", "board.GP12"],
            [Blockly.Msg["CAR_HAND_LEFT"] || "Left Hand (GP13)", "board.GP13"],
            ["GP14", "board.GP14"],
            ["GP15", "board.GP15"],
            ["D0 (GP0)", "board.GP0"],
            ["D1 (GP1)", "board.GP1"]
          ]
        },
        { "type": "field_number", "name": "MIN", "value": 460, "min": 400, "max": 2600 },
        { "type": "field_number", "name": "MAX", "value": 2400, "min": 400, "max": 2600 }
      ],
      "inputsInline": true,
      "previousStatement": null, "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_MCU_CAR"],
      "tooltip": Blockly.Msg["CAR_SERVO_SETUP_TOOLTIP"]
    });
  }
};

// --- Hand Range ---
Blockly.Blocks['mcu_car_hand_range'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["CAR_HAND_RANGE"],
      "args0": [{ "type": "input_value", "name": "RANGE", "check": "Number" }],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_MCU_CAR"],
      "tooltip": Blockly.Msg["CAR_HAND_RANGE_TOOLTIP"]
    });
  }
};

// --- In Position ---
Blockly.Blocks['mcu_car_in_position'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["CAR_IN_POSITION"],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_MCU_CAR"],
      "tooltip": Blockly.Msg["CAR_IN_POSITION_TOOLTIP"]
    });
  }
};

// --- Move Hands ---
Blockly.Blocks['mcu_car_move_hands'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["CAR_MOVE_HANDS"],
      "args0": [
        {
          "type": "field_dropdown",
          "name": "HAND",
          "options": [
            [Blockly.Msg["CAR_HAND_BOTH"] || "Both Hands", "BOTH"],
            [Blockly.Msg["CAR_HAND_LEFT"] || "Left Hand (GP13)", "LEFT"],
            [Blockly.Msg["CAR_HAND_RIGHT"] || "Right Hand (GP12)", "RIGHT"]
          ]
        },
        { "type": "input_value", "name": "PERCENT", "check": "Number" },
        { "type": "input_value", "name": "SPEED", "check": "Number" }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_MCU_CAR"],
      "tooltip": Blockly.Msg["CAR_MOVE_HANDS_TOOLTIP"]
    });
  }
};

// --- Ultrasonic Sensor ---
Blockly.Blocks['mcu_car_ultrasonic'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["CAR_ULTRASONIC"],
      "args0": [
        { "type": "field_input", "name": "TRIG", "text": "board.GP28" },
        { "type": "field_input", "name": "ECHO", "text": "board.GP7" }
      ],
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_MCU_CAR"],
      "tooltip": Blockly.Msg["CAR_ULTRASONIC_TOOLTIP"]
    });
  }
};

// --- Check Color (Digital) ---
Blockly.Blocks['mcu_car_check_color'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["CAR_CHECK_COLOR"],
      "args0": [
        { "type": "field_input", "name": "PIN", "text": "board.GP26" }
      ],
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_MCU_CAR"],
      "tooltip": Blockly.Msg["CAR_CHECK_COLOR_TOOLTIP"]
    });
  }
};

// --- Check Gray (Analog) ---
Blockly.Blocks['mcu_car_check_gray'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["CAR_CHECK_GRAY"],
      "args0": [
        { "type": "field_input", "name": "PIN", "text": "board.GP27" }
      ],
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_MCU_CAR"],
      "tooltip": Blockly.Msg["CAR_CHECK_GRAY_TOOLTIP"]
    });
  }
};

// --- Music: Tempo ---
Blockly.Blocks['mcu_car_set_tempo'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["CAR_SET_TEMPO"],
      "args0": [{ "type": "input_value", "name": "BPM", "check": "Number" }],
      "previousStatement": null, "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_MCU_CAR"],
      "tooltip": Blockly.Msg["CAR_SET_TEMPO_TOOLTIP"]
    });
  }
};

// --- Music: Volume ---
Blockly.Blocks['mcu_car_set_volume'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["CAR_SET_VOLUME"],
      "args0": [{ "type": "input_value", "name": "VOL", "check": "Number" }],
      "previousStatement": null, "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_MCU_CAR"],
      "tooltip": Blockly.Msg["CAR_SET_VOLUME_TOOLTIP"]
    });
  }
};

// --- Music: Play Note ---
Blockly.Blocks['mcu_car_play_note'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["CAR_PLAY_NOTE"],
      "args0": [
        {
          "type": "field_dropdown", name: "NOTE",
          "options": [["C", "C"], ["C#", "CS"], ["D", "D"], ["D#", "DS"], ["E", "E"], ["F", "F"], ["F#", "FS"], ["G", "G"], ["G#", "GS"], ["A", "A"], ["A#", "AS"], ["B", "B"], ["Rest", "R"]]
        },
        { 
          "type": "field_dropdown", 
          "name": "OCTAVE", 
          "options": [["0","0"],["1","1"],["2","2"],["3","3"],["4","4"],["5","5"],["6","6"],["7","7"],["8","8"]]
        },
        {
          "type": "field_dropdown", "name": "DURATION",
          "options": [["1","4.0"], ["1/2","2.0"], ["1/4","1.0"], ["1/8","0.5"], ["1/16","0.25"], ["1/32","0.125"]]
        },
        { "type": "field_checkbox", "name": "DOTTED", "checked": false },
        { "type": "field_checkbox", "name": "TRIPLET", "checked": false }
      ],
      "inputsInline": true, "previousStatement": null, "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_MCU_CAR"],
      "tooltip": Blockly.Msg["CAR_PLAY_NOTE_TOOLTIP"]
    });
    this.getField('OCTAVE').setValue('4');
  }
};

// --- Music: Play Melody String ---
Blockly.Blocks['mcu_car_play_melody'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["CAR_PLAY_MELODY"],
      "args0": [{ "type": "field_multilinetext", "name": "MELODY", "text": "D4Q. D4E B3Q D4Q\nE4Q+E E4E G4Q B4Q\nA4Q. B4E A4Q. G4E\nF#4E_T RE_T F#4E_T D4E_T RE_T D4E_T G4E RE G5Q" }],
      "previousStatement": null, "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_MCU_CAR"],
      "tooltip": Blockly.Msg["CAR_PLAY_MELODY_TOOLTIP"]
    });
  }
};

// --- Music: Tone ---
Blockly.Blocks['mcu_car_tone'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["CAR_TONE"],
      "args0": [
        { "type": "input_value", "name": "FREQ", "check": "Number" },
        { "type": "input_value", "name": "MS", "check": "Number" }
      ],
      "inputsInline": true, "previousStatement": null, "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_MCU_CAR"]
    });
  }
};

// --- Music: No Tone ---
Blockly.Blocks['mcu_car_no_tone'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["CAR_NO_TONE"],
      "previousStatement": null, "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_MCU_CAR"]
    });
  }
};

// --- Music: Note to Freq ---
Blockly.Blocks['mcu_car_note_freq'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["CAR_NOTE_TO_FREQ"],
      "args0": [
        { "type": "field_dropdown", "name": "NOTE", "options": [["C", "C"], ["C#", "CS"], ["D", "D"], ["D#", "DS"], ["E", "E"], ["F", "F"], ["F#", "FS"], ["G", "G"], ["G#", "GS"], ["A", "A"], ["A#", "AS"], ["B", "B"]] },
        { 
          "type": "field_dropdown", 
          "name": "OCTAVE", 
          "options": [["0","0"],["1","1"],["2","2"],["3","3"],["4","4"],["5","5"],["6","6"],["7","7"],["8","8"]]
        }
      ],
      "output": "Number", "colour": Blockly.Msg["COLOUR_MCU_CAR"]
    });
    this.getField('OCTAVE').setValue('4');
  }
};

// --- NeoPixel LED ---
Blockly.Blocks['mcu_car_set_led_color'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["CAR_SET_LED"],
      "args0": [
        {
          "type": "field_dropdown", "name": "LED_INDEX",
          "options": [[Blockly.Msg["CAR_LED_ALL"] || "All", "ALL"], [Blockly.Msg["CAR_LED_LEFT"] || "Left", "0"], [Blockly.Msg["CAR_LED_RIGHT"] || "Right", "1"]]
        },
        { "type": "field_colour", "name": "COLOR", "colour": "#ff0000" }
      ],
      "previousStatement": null, "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_MCU_CAR"]
    });
  }
};

// --- IO LEDs (Dynamic) ---
Blockly.Blocks['mcu_car_set_led_io'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["CAR_SET_LED_IO"],
      "args0": [
        { "type": "input_value", "name": "PIN", "check": "Number" },
        { "type": "input_value", "name": "STATE", "check": "Boolean" }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_MCU_CAR"],
      "tooltip": "控制 Maker Pi 上的藍色指示燈 (GP0-GP7)。支援變數控制腳位。"
    });
  }
};

// --- Wait for Start ---
Blockly.Blocks['mcu_car_wait_start'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["CAR_WAIT_START"],
      "args0": [
        {
          "type": "field_dropdown", "name": "PIN",
          "options": [[Blockly.Msg["CAR_BUTTON_1"] || "1", "board.GP20"], [Blockly.Msg["CAR_BUTTON_2"] || "2", "board.GP21"]]
        }
      ],
      "previousStatement": null, "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_MCU_CAR"],
      "tooltip": Blockly.Msg["CAR_WAIT_START_TOOLTIP"]
    });
  }
};
