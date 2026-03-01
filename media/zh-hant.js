(function (Blockly) {
  Blockly.Msg = Blockly.Msg || {};
  Object.assign(Blockly.Msg, {
    // 基礎 UI
    "BKY_HELP_HINT": "右鍵點擊查看說明",
    "BKY_SAVE_SUCCESS": "儲存成功！",
    "BKY_NEW_VARIABLE_HINT": "請輸入變數名稱（可使用逗號分隔建立多個）。\n注意：名稱不可由數字開頭，且不可包含底線以外的特殊符號。",

    // 分類顏色 (Hex Palette)
    "COLOUR_STRUCTURE": "#585858",
    "COLOUR_LOGIC": "#b198de",
    "COLOUR_LOOPS": "#7fcd81",
    "COLOUR_MATH": "#5C68A6",
    "COLOUR_TEXT": "#6a8871",
    "COLOUR_TYPES": "#d1972b",
    "COLOUR_VARIABLES": "#ef9a9a",
    "COLOUR_FUNCTIONS": "#d22f73",
    "COLOUR_IO": "#34495e",
    "COLOUR_CODING": "#585858",
    "COLOUR_AI": "#FF661A",
    "COLOUR_AI_BASIC": "#FF661A",
    "COLOUR_AI_DRAW": "#E64A19",
    "COLOUR_AI_HAND": "#FBC02D",
    "COLOUR_AI_FACE": "#FFA000",
    "COLOUR_AI_POSE": "#F57C00",
    "COLOUR_HARDWARE": "#FFBF00",
    "COLOUR_MCU_CAMERA": "#FF6600",
    "COLOUR_HUSKYLENS": "#00A8E8",
    "COLOUR_MCU_CAR": "#4CAF50",

    // 分類名稱 (核心管理)
    "CAT_IO": "IO",
    "CAT_LOGIC": "Logic",
    "CAT_LOOPS": "Loops",
    "CAT_MATH": "Math",
    "CAT_TEXT": "Text",
    "CAT_TYPES": "Types",
    "CAT_CODING": "Coding",
    "CAT_VARIABLES": "Variables",
    "CAT_FUNCTIONS": "Functions",
    "CAT_AI": "AI 視覺",
    "CAT_AI_BASIC": "基礎操作",
    "CAT_AI_DRAW": "繪圖標註",
    "CAT_AI_HAND": "手勢偵測",
    "CAT_AI_FACE": "臉部網格",
    "CAT_AI_POSE": "姿勢偵測",
    "CAT_STRUCTURE": "Structure",
    "CAT_HARDWARE": "硬體控制",
    "CAT_MCU_CAMERA": "AI 相機",
    "CAT_HUSKYLENS": "HuskyLens",
    "CAT_SEARCH": "搜尋積木",
    "CAT_MCU_CAR": "πCar 小車",

    // Types 分組標籤
    "TYPE_LBL_DEF": "建立資料結構",
    "TYPE_LBL_CAST": "型別轉換與檢查",
    "TYPE_LBL_OPS": "通用存取與判斷",
    "TYPE_LBL_METHODS": "進階操作 (清單/字典)",
    "TYPE_LBL_SORT": "排序功能",

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
    "TLB_DIAGNOSE": "檢查 Python 套件需求",

    // 環境診斷
    "DIAG_TITLE": "環境診斷與安裝助手",
    "DIAG_LOADING": "正在偵測 Python 模組狀態...",
    "DIAG_CHECKING": "正在檢查...",
    "DIAG_INSTALLED": "● 已安裝",
    "DIAG_MISSING": "○ 未安裝",
    "DIAG_INSTALL_BTN": "安裝",
    "MSG_CLOSE": "關閉",

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
