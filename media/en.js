(function (Blockly) {
  Blockly.Msg = Blockly.Msg || {};
  Object.assign(Blockly.Msg, {
    // Basic UI
    "BKY_HELP_HINT": "Right click for help",
    "BKY_SAVE_SUCCESS": "Saved successfully!",
    "BKY_NEW_VARIABLE_HINT": "Enter variable name(s), comma separated.\nNote: Name cannot start with a number or contain special characters except underscores.",

    // Category Colours (Hex Palette)
    "COLOUR_STRUCTURE": "#778899",
    "COLOUR_LOGIC": "#4C97FF",
    "COLOUR_LOOPS": "#0FBD8C",
    "COLOUR_MATH": "#5968B5",
    "COLOUR_TEXT": "#05ADAD",
    "COLOUR_TYPES": "#885AD5",
    "COLOUR_VARIABLES": "#FE2F89",
    "COLOUR_FUNCTIONS": "#FF6680",
    "COLOUR_TOOLS": "#9966FF",
    "COLOUR_AI": "#FF661A",
    "COLOUR_HARDWARE": "#FFBF00",

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

    // Toolbar & UI
    "TLB_NEW": "New Project",
    "TLB_OPEN": "Open Project",
    "TLB_SAVE": "Save Project",
    "TLB_SAVE_AS": "Save As...",
    "TLB_SETTINGS": "Set Python Path",
    "TLB_RUN": "Run Program",
    "TLB_UPDATE": "Check for Updates",
    "TLB_STOP": "Close",
    "TLB_FILE_NEW": "Untitled Project",
    "TLB_PYTHON_PREVIEW": "Python Code Preview",

    // Update messages
    "MSG_UPDATE_LATEST": "Already up to date (%1)",
    "MSG_UPDATE_AVAILABLE": "New version available (%1)",
    "MSG_UPDATE_LATEST_TOOLTIP": "You are using the latest version (%1)",
    "MSG_UPDATE_AVAILABLE_TOOLTIP": "New version available (%1). Click to download.",

    // Dialogs & Messages
    "MSG_SAVE_CONFIRM": "Do you want to save changes to the current project?",
    "MSG_SAVE": "Save",
    "MSG_DONT_SAVE": "Don't Save",
    "MSG_CANCEL": "Cancel",
    "MSG_SELECT_PATH": "Select Path",
    "MSG_UPDATE_LATEST": "You are already using the latest version.",
    "MSG_PYTHON_NOT_FOUND": "Could not execute Python (Current: %1). Please specify the correct python.exe path.",
    "MSG_PYTHON_UPDATED": "Python path updated: %1",

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
