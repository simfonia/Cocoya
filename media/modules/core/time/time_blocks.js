/**
 * Time Blocks: time_blocks.js
 * Definitions for time-related functions.
 */

// Import statement for the 'time' module will be handled by the generator.

// --- Sleep ---
Blockly.Blocks['py_time_sleep'] = {
  init: function() {
    this.jsonInit({
      "message0": "%{BKY_TIME_SLEEP}",
      "args0": [{ "type": "input_value", "name": "SECONDS", "check": "Number" }],
      "previousStatement": null,
      "nextStatement": null,
      "inputsInline": true,
      "colour": Blockly.Msg["COLOUR_TIME"],
      "tooltip": "%{BKY_TIME_SLEEP_TOOLTIP}"
    });
  }
};

// --- Get Current Time ---
Blockly.Blocks['py_time_now'] = {
  init: function() {
    this.jsonInit({
      "message0": "%{BKY_TIME_NOW}",
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_TIME"],
      "tooltip": "%{BKY_TIME_NOW_TOOLTIP}"
    });
  }
};

// --- Get Monotonic Time ---
Blockly.Blocks['py_time_monotonic'] = {
  init: function() {
    this.jsonInit({
      "message0": "%{BKY_TIME_MONOTONIC}",
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_TIME"],
      "tooltip": "%{BKY_TIME_MONOTONIC_TOOLTIP}"
    });
  }
};

// --- Get Local Time (struct_time) ---
Blockly.Blocks['py_time_localtime'] = {
  init: function() {
    this.jsonInit({
      "message0": "%{BKY_TIME_LOCALTIME}",
      "args0": [{ "type": "input_value", "name": "SECONDS", "check": "Number" }],
      "output": "struct_time", // Represents a time tuple
      "colour": Blockly.Msg["COLOUR_TIME"],
      "tooltip": "%{BKY_TIME_LOCALTIME_TOOLTIP}"
    });
  }
};

// --- Format Time ---
Blockly.Blocks['py_time_strftime'] = {
  init: function() {
    this.jsonInit({
      "message0": "%{BKY_TIME_STRFTIME}",
      "args0": [
        { "type": "input_value", "name": "FORMAT", "check": "String" },
        { "type": "input_value", "name": "TIME", "check": "struct_time" }
      ],
      "output": "String",
      "inputsInline": true,
      "colour": Blockly.Msg["COLOUR_TIME"],
      "tooltip": "%{BKY_TIME_STRFTIME_TOOLTIP}"
    });
  }
};
