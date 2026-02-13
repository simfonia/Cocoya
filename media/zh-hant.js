(function (Blockly) {
  Blockly.Msg = Blockly.Msg || {};
  Object.assign(Blockly.Msg, {
    // 基礎 UI
    "BKY_HELP_HINT": "右鍵點擊查看說明",
    "BKY_SAVE_SUCCESS": "儲存成功！",
    "BKY_NEW_VARIABLE_HINT": "請輸入變數名稱（可使用逗號分隔建立多個）。\n注意：名稱不可由數字開頭，且不可包含底線以外的特殊符號。",

    // 分類顏色 (Hue)
    "COLOUR_STRUCTURE": "180",
    "COLOUR_LOGIC": "210",
    "COLOUR_LOOPS": "120",
    "COLOUR_MATH": "230",
    "COLOUR_TEXT": "160",
    "COLOUR_TYPES": "260",
    "COLOUR_VARIABLES": "330",
    "COLOUR_FUNCTIONS": "290",
    "COLOUR_TOOLS": "200",

    // 分類名稱
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

    // Python 語法元件
    "PY_COLON": ":",
    "PY_EQUAL": "=",
    "PY_DEF": "def",
    "PY_RETURN": "return",
    "PY_GLOBAL": "global",
    "PY_LOCAL": "local",

    // 工具積木
    "TOOLS_COMMENT": "# 註解",
    "TOOLS_COMMENT_TOOLTIP": "新增多行註解內容。",
    "TOOLS_RAW_CODE": "Raw Code",
    "TOOLS_RAW_STATEMENT_TOOLTIP": "自由編寫原始碼 (陳述句)。",
    "TOOLS_RAW_EXPRESSION_TOOLTIP": "自由編寫原始碼 (運算式)。",

    // 數學與文字
    "MATH_SQRT": "sqrt",
    "MATH_ABS": "abs",
    "MATH_SIN": "sin",
    "MATH_COS": "cos",
    "MATH_TAN": "tan",
    "MATH_ROUND": "round",
    "MATH_RANDOM": "random",
    "TEXT_JOIN": "f-string",
    "TEXT_JOIN_TOOLTIP": "合併文字與變數。拼入文字積木會直接顯示，拼入變數則會自動加上 {}。",
    "TEXT_LENGTH": "len",
    "TEXT_INPUT": "input",

    // 通用積木文字
    "CONTROLS_IF_MSG_IF": "if",
    "CONTROLS_WHILEUNTIL_OPERATOR_WHILE": "while",
    "TEXT_PRINT_TITLE": "print(%1)"
  });
})(Blockly);
