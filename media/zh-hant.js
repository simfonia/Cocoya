(function (Blockly) {
  Blockly.Msg = Blockly.Msg || {};
  Object.assign(Blockly.Msg, {
    // 基礎 UI
    "BKY_HELP_HINT": "右鍵點擊查看說明",
    "BKY_SAVE_SUCCESS": "儲存成功！",
    "BKY_NEW_VARIABLE_HINT": "請輸入變數名稱（可使用逗號分隔建立多個）。\n注意：名稱不可由數字開頭，且不可包含底線以外的特殊符號。",

    // 工具列與 UI 文字
    "TLB_NEW": "開新專案",
    "TLB_OPEN": "開啟專案",
    "TLB_SAVE": "儲存專案",
    "TLB_SAVE_AS": "另存專案",
    "TLB_SETTINGS": "設定 Python 路徑",
    "TLB_RUN": "執行程式",
    "TLB_UPDATE": "檢查更新",
    "TLB_STOP": "關閉",
    "TLB_FILE_NEW": "未命名專案",
    "TLB_PYTHON_PREVIEW": "Python 程式碼預覽",

    // 更新檢查訊息
    "MSG_UPDATE_LATEST": "目前已是最新版本 (%1)",
    "MSG_UPDATE_AVAILABLE": "有新版本可更新 (%1)",
    "MSG_UPDATE_LATEST_TOOLTIP": "目前已是最新版本 (%1)",
    "MSG_UPDATE_AVAILABLE_TOOLTIP": "有新版本可更新 (%1)，點擊前往下載",

    // 對話框與訊息
    "MSG_SAVE_CONFIRM": "您要儲存對目前專案的變更嗎？",
    "MSG_SAVE": "儲存",
    "MSG_DONT_SAVE": "不儲存",
    "MSG_CANCEL": "取消",
    "MSG_SELECT_PATH": "選取路徑",
    "MSG_UPDATE_LATEST": "目前已是最新版本！",
    "MSG_PYTHON_NOT_FOUND": "無法執行 Python (目前設定: %1)。請指定正確的 python.exe 路徑。",
    "MSG_PYTHON_UPDATED": "Python 路徑已更新: %1",

    // 分類顏色 (Hex Palette)
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
