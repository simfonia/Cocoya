(function (Blockly) {
  Blockly.Msg = Blockly.Msg || {};
  Object.assign(Blockly.Msg, {
    // Basic UI
    "BKY_HELP_HINT": "Right click for help",
    "BKY_SAVE_SUCCESS": "Saved successfully!",
    "BKY_NEW_VARIABLE_HINT": "Enter variable name(s), comma separated.\nNote: Name cannot start with a number or contain special characters except underscores.",

    // Category Colours
    "COLOUR_STRUCTURE": "180",
    "COLOUR_LOGIC": "210",
    "COLOUR_LOOPS": "120",
    "COLOUR_MATH": "230",
    "COLOUR_TEXT": "160",
    "COLOUR_TYPES": "260",
    "COLOUR_VARIABLES": "330",
    "COLOUR_FUNCTIONS": "290",
    "COLOUR_TOOLS": "200",

    // Category Names
    "CAT_LOGIC": "Logic",
    "CAT_LOOPS": "Loops",
    "CAT_MATH": "Math",
    "CAT_TEXT": "Text",
    "CAT_TYPES": "Types",
    "CAT_TOOLS": "Tools",
    "CAT_VARIABLES": "Variables",
    "CAT_FUNCTIONS": "Functions",
    "CAT_AI": "AI Vision",
    "CAT_STRUCTURE": "Structure",
    "CAT_HARDWARE": "Hardware",

    // Python Syntax Elements
    "PY_COLON": ":",
    "PY_EQUAL": "=",
    "PY_DEF": "def",
    "PY_RETURN": "return",
    "PY_GLOBAL": "global",
    "PY_LOCAL": "local",

    // Tool Blocks
    "TOOLS_COMMENT": "# Comment",
    "TOOLS_COMMENT_TOOLTIP": "Add multi-line comments.",
    "TOOLS_RAW_CODE": "Raw Code",
    "TOOLS_RAW_STATEMENT_TOOLTIP": "Write custom Python code (statement).",
    "TOOLS_RAW_EXPRESSION_TOOLTIP": "Write custom Python code (expression).",

    // Math & Text
    "MATH_SQRT": "sqrt",
    "MATH_ABS": "abs",
    "MATH_SIN": "sin",
    "MATH_COS": "cos",
    "MATH_TAN": "tan",
    "MATH_ROUND": "round",
    "MATH_RANDOM": "random",
    "TEXT_JOIN": "f-string",
    "TEXT_JOIN_TOOLTIP": "Join text and variables. Text blocks are included literally, while others are wrapped in {}.",
    "TEXT_LENGTH": "len",
    "TEXT_INPUT": "input",

    // Block Messages
    "CONTROLS_IF_MSG_IF": "if",
    "CONTROLS_WHILEUNTIL_OPERATOR_WHILE": "while",
    "TEXT_PRINT_TITLE": "print(%1)"
  });
})(Blockly);
