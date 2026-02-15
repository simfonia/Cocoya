// Math Blocks: math_blocks.js

Blockly.Blocks['py_math_number'] = {
  init: function() {
    this.appendDummyInput().appendField(new Blockly.FieldNumber(0), "NUM");
    this.setOutput(true, "Number");
    this.setColour(Blockly.Msg["COLOUR_MATH"]);
  }
};

Blockly.Blocks['py_math_arithmetic'] = {
  init: function() {
    this.appendValueInput("A").setCheck("Number");
    this.appendValueInput("B").setCheck("Number")
        .appendField(new Blockly.FieldDropdown([
            ["+", "+"], ["-", "-"], ["*", "*"], ["/", "/"], ["%", "%"], ["**", "**"]
        ]), "OP");
    this.setInputsInline(true);
    this.setOutput(true, "Number");
    this.setColour(Blockly.Msg["COLOUR_MATH"]);
  }
};

Blockly.Blocks['py_math_single'] = {
  init: function() {
    this.appendValueInput("NUM").setCheck("Number")
        .appendField(new Blockly.FieldDropdown([
            [Blockly.Msg["MATH_SQRT"], "math.sqrt"], 
            [Blockly.Msg["MATH_ABS"], "abs"], 
            [Blockly.Msg["MATH_SIN"], "math.sin"], 
            [Blockly.Msg["MATH_COS"], "math.cos"], 
            [Blockly.Msg["MATH_TAN"], "math.tan"]
        ]), "OP")
        .appendField("(");
    this.appendDummyInput().appendField(")");
    this.setInputsInline(true);
    this.setOutput(true, "Number");
    this.setColour(Blockly.Msg["COLOUR_MATH"]);
  }
};

Blockly.Blocks['py_math_round'] = {
  init: function() {
    this.appendValueInput("NUM").setCheck("Number").appendField("round(");
    this.appendDummyInput().appendField(")");
    this.setInputsInline(true);
    this.setOutput(true, "Number");
    this.setColour(Blockly.Msg["COLOUR_MATH"]);
  }
};

Blockly.Blocks['py_math_random'] = {
  init: function() {
    this.appendValueInput("FROM").setCheck("Number").appendField("random.randint(");
    this.appendValueInput("TO").setCheck("Number").appendField(",");
    this.appendDummyInput().appendField(")");
    this.setInputsInline(true);
    this.setOutput(true, "Number");
    this.setColour(Blockly.Msg["COLOUR_MATH"]);
  }
};
