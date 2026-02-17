(function (Blockly) {
  Blockly.Msg = Blockly.Msg || {};
  Object.assign(Blockly.Msg, {
    // 基礎 UI
    "BKY_HELP_HINT": "右鍵點擊查看說明",
    "BKY_SAVE_SUCCESS": "儲存成功！",
    "BKY_NEW_VARIABLE_HINT": "請輸入變數名稱（可使用逗號分隔建立多個）。\n注意：名稱不可由數字開頭，且不可包含底線以外的特殊符號。",

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

    // 分類名稱 (核心管理)
    "CAT_LOGIC": "Logic",
    "CAT_LOOPS": "Loops",
    "CAT_MATH": "Math",
    "CAT_TEXT": "Text",
    "CAT_TYPES": "Types",
    "CAT_TOOLS": "Tools",
    "CAT_VARIABLES": "Variables",
    "CAT_FUNCTIONS": "Functions",
    "CAT_AI": "AI 視覺",
    "CAT_AI_BASIC": "基礎操作",
    "CAT_AI_DRAW": "繪圖標註",
    "CAT_AI_HAND": "手勢偵測",
    "CAT_AI_FACE": "臉部網格",
    "CAT_STRUCTURE": "Structure",
    "CAT_HARDWARE": "硬體控制",

    // 工具列與 UI 文字
    "TLB_NEW": "開新專案",
    "TLB_OPEN": "開啟專案",
    "TLB_SAVE": "儲存專案",
    "TLB_SAVE_AS": "另存專案",
    "TLB_SETTINGS": "設定 Python 路徑",
    "TLB_RUN": "執行程式",
    "TLB_RUN_PC": "執行 PC 端程式",
    "TLB_RUN_MCU": "上傳至 MCU",
    "TLB_UPDATE": "檢查更新",
    "TLB_STOP": "關閉",
    "TLB_SERIAL_PORT": "序列埠",
    "TLB_SERIAL_REFRESH": "偵測序列埠",
    "TLB_SERIAL_CONNECT": "連接序列埠",
    "TLB_SERIAL_DISCONNECT": "斷開序列埠",
    "TLB_FILE_NEW": "未命名專案",
    "TLB_PYTHON_PREVIEW": "程式碼預覽",
    "TLB_MODE_PC": "💻 Python (PC)",
    "TLB_MODE_MCU": "📟 CircuitPython (MCU)",

    // 更新檢查訊息
    "MSG_UPDATE_LATEST": "目前已是最新版本 (%1)",
    "MSG_UPDATE_AVAILABLE": "有新版本可更新 (%1)",
    "MSG_UPDATE_LATEST_TOOLTIP": "目前已是最新版本 (%1)",
    "MSG_UPDATE_AVAILABLE_TOOLTIP": "有新版本可更新 (%1)，點擊前往下載",

    // 對話框與訊息
    "MSG_SAVE_CONFIRM": "您要儲存對目前專案的變更嗎？",
    "MSG_SWITCH_CONFIRM": "切換模式將會清除目前的工作區並建立新專案。確定要切換到 %1 模式嗎？",
    "MSG_SAVE": "儲存",
    "MSG_DONT_SAVE": "不儲存",
    "MSG_CANCEL": "取消",
    "MSG_SELECT_PATH": "選取路徑",
    "MSG_SELECT_PORT": "請先選擇序列埠！",
    "MSG_PYSERIAL_MISSING": "找不到 pyserial 模組，請先執行 'pip install pyserial' 以支援硬體部署。",
    "MSG_DEPLOYING_MCU": "正在部署程式至 MCU (%1)...",
    "MSG_PYTHON_NOT_FOUND": "無法執行 Python (目前設定: %1)。請指定正確的 python.exe 路徑。",
    "MSG_PYTHON_UPDATED": "Python 路徑已更新: %1",

    // Python 核心關鍵字 (保留在核心或分散皆可，目前先移除已分散部分)
    "PY_DEF": "def",
    "PY_RETURN": "return",
    "PY_GLOBAL": "global",
    "PY_LOCAL": "local"
  });
})(Blockly);
