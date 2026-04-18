// Math Blocks: math_blocks.js

Blockly.Blocks['py_math_number'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1",
      "args0": [{ "type": "field_number", "name": "NUM", "value": 0 }],
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_MATH"]
    });
  }
};

Blockly.Blocks['py_math_arithmetic'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 %2 %3",
      "args0": [
        { "type": "input_value", "name": "A", "check": "Number" },
        { 
          "type": "field_dropdown", 
          "name": "OP",
          "options": [["+", "+"], ["-", "-"], ["*", "*"], ["/", "/"], ["%", "%"], ["**", "**"]]
        },
        { "type": "input_value", "name": "B", "check": "Number" }
      ],
      "inputsInline": true,
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_MATH"]
    });
  }
};

Blockly.Blocks['py_math_single'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["MATH_SINGLE"],
      "args0": [
        { 
          "type": "field_dropdown", 
          "name": "OP",
          "options": [
            [Blockly.Msg["MATH_SQRT"], "math.sqrt"], 
            [Blockly.Msg["MATH_ABS"], "abs"], 
            [Blockly.Msg["MATH_SIN"], "math.sin"], 
            [Blockly.Msg["MATH_COS"], "math.cos"], 
            [Blockly.Msg["MATH_TAN"], "math.tan"],
            ["degrees", "math.degrees"],
            ["radians", "math.radians"]
          ]
        },
        { "type": "input_value", "name": "NUM", "check": "Number" }
      ],
      "inputsInline": true,
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_MATH"]
    });
  }
};

Blockly.Blocks['py_math_atan2'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["MATH_ATAN2"],
      "args0": [
        { "type": "input_value", "name": "Y", "check": "Number" },
        { "type": "input_value", "name": "X", "check": "Number" }
      ],
      "inputsInline": true,
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_MATH"],
      "tooltip": "計算 y/x 的反正切值，傳回弧度。"
    });
  }
};

Blockly.Blocks['py_math_round'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["MATH_ROUND"],
      "args0": [
        { "type": "input_value", "name": "NUM", "check": "Number" }
      ],
      "inputsInline": true,
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_MATH"]
    });
  }
};

Blockly.Blocks['py_math_random'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["MATH_RANDINT"],
      "args0": [
        { "type": "input_value", "name": "FROM", "check": "Number" },
        { "type": "input_value", "name": "TO", "check": "Number" }
      ],
      "inputsInline": true,
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_MATH"]
    });
  }
};
