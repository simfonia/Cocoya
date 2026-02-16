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
    "CAT_AI_BASIC": "OpenCV Basic",
    "CAT_AI_DRAW": "Drawing",
    "CAT_AI_HAND": "Hand Tracking",
    "CAT_STRUCTURE": "Structure",
    "CAT_HARDWARE": "Hardware",

    // Toolbar & UI
    "TLB_NEW": "New Project",
    "TLB_OPEN": "Open Project",
    "TLB_SAVE": "Save Project",
    "TLB_SAVE_AS": "Save As...",
    "TLB_SETTINGS": "Set Python Path",
    "TLB_RUN": "Run Program",
    "TLB_RUN_PC": "Run PC Program",
    "TLB_RUN_MCU": "Upload to MCU",
    "TLB_UPDATE": "Check for Updates",
    "TLB_STOP": "Close",
    "TLB_SERIAL_PORT": "Serial Port",
    "TLB_SERIAL_REFRESH": "Detect Serial Port",
    "TLB_SERIAL_CONNECT": "Connect Serial",
    "TLB_SERIAL_DISCONNECT": "Disconnect Serial",
    "TLB_FILE_NEW": "Untitled Project",
    "TLB_PYTHON_PREVIEW": "Code Preview",
    "TLB_MODE_PC": "💻 Python (PC)",
    "TLB_MODE_MCU": "📟 CircuitPython (MCU)",

    // Update messages
    "MSG_UPDATE_LATEST": "Already up to date (%1)",
    "MSG_UPDATE_AVAILABLE": "New version available (%1)",
    "MSG_UPDATE_LATEST_TOOLTIP": "You are using the latest version (%1)",
    "MSG_UPDATE_AVAILABLE_TOOLTIP": "New version available (%1). Click to download.",

    // Dialogs & Messages
    "MSG_SAVE_CONFIRM": "Do you want to save changes to the current project?",
    "MSG_SWITCH_CONFIRM": "Switching modes will clear the workspace and start a new project. Are you sure you want to switch to %1 mode?",
    "MSG_SAVE": "Save",
    "MSG_DONT_SAVE": "Don't Save",
    "MSG_CANCEL": "Cancel",
    "MSG_SELECT_PATH": "Select Path",
    "MSG_SELECT_PORT": "Please select a serial port first!",
    "MSG_PYSERIAL_MISSING": "pyserial module not found. Please run 'pip install pyserial' to enable hardware deployment.",
    "MSG_DEPLOYING_MCU": "Deploying code to MCU (%1)...",
    "MSG_UPDATE_LATEST": "You are already using the latest version.",
    "MSG_PYTHON_NOT_FOUND": "Could not execute Python (Current: %1). Please specify the correct python.exe path.",
    "MSG_PYTHON_UPDATED": "Python path updated: %1",

    // Syntax (Basic)
    "PY_DEF": "def",
    "PY_RETURN": "return",
    "PY_GLOBAL": "global",
    "PY_LOCAL": "local"
  });
})(Blockly);
