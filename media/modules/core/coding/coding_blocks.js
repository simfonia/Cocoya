// Coding Blocks: coding_blocks.js

Blockly.Blocks['py_coding_comment'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 %2",
      "args0": [
        { "type": "field_label", "text": Blockly.Msg["CODING_COMMENT"] },
        { "type": "field_multilinetext", "name": "TEXT", "text": "" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_CODING"],
      "tooltip": Blockly.Msg["CODING_COMMENT_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_coding_raw_statement'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 %2",
      "args0": [
        { "type": "field_label", "text": Blockly.Msg["CODING_RAW_CODE"] },
        { "type": "field_multilinetext", "name": "TEXT", "text": "" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_CODING"],
      "tooltip": Blockly.Msg["CODING_RAW_STATEMENT_TOOLTIP"]
    });
  }
};

Blockly.Blocks['py_coding_raw_expression'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1",
      "args0": [{ "type": "field_input", "name": "TEXT", "text": "" }],
      "output": null,
      "colour": Blockly.Msg["COLOUR_CODING"],
      "tooltip": Blockly.Msg["CODING_RAW_EXPRESSION_TOOLTIP"]
    });
  }
};
