// Tools Blocks: tools_blocks.js

Blockly.Blocks['py_tools_print'] = {
  init: function() {
    this.jsonInit({
      "message0": "print ( %1 )",
      "args0": [{ "type": "input_value", "name": "TEXT" }],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_TOOLS"]
    });
  }
};

Blockly.Blocks['py_tools_input'] = {
  init: function() {
    this.jsonInit({
      "message0": "input ( %1 )",
      "args0": [{ "type": "input_value", "name": "PROMPT", "check": "String" }],
      "output": "String",
      "colour": Blockly.Msg["COLOUR_TOOLS"]
    });
  }
};

Blockly.Blocks['py_tools_comment'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 %2",
      "args0": [
        { "type": "field_label", "text": Blockly.Msg["TOOLS_COMMENT"] },
        { "type": "field_multilinetext", "name": "TEXT", "text": "" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_TOOLS"],
      "tooltip": Blockly.Msg["TOOLS_COMMENT_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_tools_raw_statement'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 %2",
      "args0": [
        { "type": "field_label", "text": Blockly.Msg["TOOLS_RAW_CODE"] },
        { "type": "field_multilinetext", "name": "TEXT", "text": "" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_TOOLS"],
      "tooltip": Blockly.Msg["TOOLS_RAW_STATEMENT_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_tools_raw_expression'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1",
      "args0": [{ "type": "field_input", "name": "TEXT", "text": "" }],
      "output": null,
      "colour": Blockly.Msg["COLOUR_TOOLS"],
      "tooltip": Blockly.Msg["TOOLS_RAW_EXPRESSION_TOOLTIP"]
    });
  }
};
