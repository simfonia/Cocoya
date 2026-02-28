/**
 * IO Blocks: io_blocks.js
 * Definitions for standard input and output.
 */

Blockly.Blocks['py_io_print'] = {
  init: function() {
    this.jsonInit({
      "message0": "%{BKY_IO_PRINT}",
      "args0": [{ "type": "input_value", "name": "TEXT" }],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_IO"] || "#34495e",
      "tooltip": ""
    });
  }
};

Blockly.Blocks['py_io_input'] = {
  init: function() {
    this.jsonInit({
      "message0": "%{BKY_IO_INPUT}",
      "args0": [{ "type": "input_value", "name": "PROMPT", "check": "String" }],
      "output": "String",
      "colour": Blockly.Msg["COLOUR_IO"] || "#34495e",
      "tooltip": ""
    });
  }
};

// --- Serial Init ---
Blockly.Blocks['py_io_serial_init'] = {
  init: function() {
    this.jsonInit({
      "message0": "%{BKY_IO_SERIAL_INIT}",
      "args0": [
        { "type": "input_value", "name": "PORT", "check": "String" },
        { 
          "type": "field_dropdown", 
          "name": "BAUD", 
          "options": [["9600", "9600"], ["19200", "19200"], ["38400", "38400"], ["57600", "57600"], ["115200", "115200"]]
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_IO"],
      "tooltip": "%{BKY_IO_SERIAL_INIT_TOOLTIP}"
    });
  }
};

// --- Serial Read ---
Blockly.Blocks['py_io_serial_read'] = {
  init: function() {
    this.jsonInit({
      "message0": "%{BKY_IO_SERIAL_READ}",
      "output": "String",
      "colour": Blockly.Msg["COLOUR_IO"],
      "tooltip": "%{BKY_IO_SERIAL_READ_TOOLTIP}"
    });
  }
};

// --- Serial Write ---
Blockly.Blocks['py_io_serial_write'] = {
  init: function() {
    this.jsonInit({
      "message0": "%{BKY_IO_SERIAL_WRITE}",
      "args0": [{ "type": "input_value", "name": "DATA" }],
      "previousStatement": null,
      "nextStatement": null,
      "inputsInline": true,
      "colour": Blockly.Msg["COLOUR_IO"],
      "tooltip": "%{BKY_IO_SERIAL_WRITE_TOOLTIP}"
    });
  }
};

// --- Serial Available ---
Blockly.Blocks['py_io_serial_available'] = {
  init: function() {
    this.jsonInit({
      "message0": "%{BKY_IO_SERIAL_AVAILABLE}",
      "output": "Boolean",
      "colour": Blockly.Msg["COLOUR_IO"],
      "tooltip": "%{BKY_IO_SERIAL_AVAILABLE_TOOLTIP}"
    });
  }
};

// --- Sleep ---
Blockly.Blocks['py_io_sleep'] = {
  init: function() {
    this.jsonInit({
      "message0": "%{BKY_IO_SLEEP}",
      "args0": [{ "type": "input_value", "name": "SECONDS", "check": "Number" }],
      "previousStatement": null,
      "nextStatement": null,
      "inputsInline": true,
      "colour": Blockly.Msg["COLOUR_IO"],
      "tooltip": "%{BKY_IO_SLEEP_TOOLTIP}"
    });
  }
};

// --- Serial Flush ---
Blockly.Blocks['py_io_serial_flush'] = {
  init: function() {
    this.jsonInit({
      "message0": "%{BKY_IO_SERIAL_FLUSH}",
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_IO"],
      "tooltip": "%{BKY_IO_SERIAL_READ_TOOLTIP}"
    });
  }
};
