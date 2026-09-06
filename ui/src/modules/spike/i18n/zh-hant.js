// spike i18n (zh-hant) - Lego SPIKE Prime 積木文案

// === 初始化 ===
Blockly.Msg["SPIKE_INIT_HUB"] = "初始化 Hub";
Blockly.Msg["SPIKE_INIT_HUB_TOOLTIP"] = "初始化 Lego SPIKE Prime Hub。必須在程式開頭呼叫一次。";
Blockly.Msg["SPIKE_MOTOR_INIT"] = "初始化馬達 接口 %1 類型 %2";
Blockly.Msg["SPIKE_MOTOR_INIT_TOOLTIP"] = "初始化指定接口的馬達。Large 為大力馬達，Medium 為中力馬達。";
Blockly.Msg["SPIKE_MOTOR_TYPE_LARGE"] = "Large";
Blockly.Msg["SPIKE_MOTOR_TYPE_MEDIUM"] = "Medium";
Blockly.Msg["SPIKE_COLOR_INIT"] = "初始化顏色感測器 接口 %1";
Blockly.Msg["SPIKE_COLOR_INIT_TOOLTIP"] = "初始化指定接口的顏色感測器。";
Blockly.Msg["SPIKE_DISTANCE_INIT"] = "初始化距離感測器 接口 %1";
Blockly.Msg["SPIKE_DISTANCE_INIT_TOOLTIP"] = "初始化指定接口的超音波距離感測器。";
Blockly.Msg["SPIKE_FORCE_INIT"] = "初始化力道感測器 接口 %1";
Blockly.Msg["SPIKE_FORCE_INIT_TOOLTIP"] = "初始化指定接口的力道感測器。";

// === 馬達控制 ===
Blockly.Msg["SPIKE_MOTOR_RUN"] = "馬達 接口 %1 以速度 %2 運轉";
Blockly.Msg["SPIKE_MOTOR_RUN_TOOLTIP"] = "以指定速度運轉馬達。正值前進，負值後退。速度範圍 -1000 ~ 1000。";
Blockly.Msg["SPIKE_MOTOR_RUN_ANGLE"] = "馬達 接口 %1 以速度 %2 轉 %3 度";
Blockly.Msg["SPIKE_MOTOR_RUN_ANGLE_TOOLTIP"] = "以指定速度旋轉指定角度。";
Blockly.Msg["SPIKE_MOTOR_RUN_TARGET"] = "馬達 接口 %1 以速度 %2 轉到目標角度 %3";
Blockly.Msg["SPIKE_MOTOR_RUN_TARGET_TOOLTIP"] = "以指定速度轉到目標角度（絕對位置）。";
Blockly.Msg["SPIKE_MOTOR_STOP"] = "馬達 接口 %1 停止 %2";
Blockly.Msg["SPIKE_MOTOR_STOP_TOOLTIP"] = "停止馬達。Coast：慣性滑行；Brake：煞車；Hold：鎖定位置。";
Blockly.Msg["SPIKE_STOP_COAST"] = "慣性 (Coast)";
Blockly.Msg["SPIKE_STOP_BRAKE"] = "煞車 (Brake)";
Blockly.Msg["SPIKE_STOP_HOLD"] = "鎖定 (Hold)";
Blockly.Msg["SPIKE_MOTOR_ANGLE"] = "馬達 接口 %1 目前角度";
Blockly.Msg["SPIKE_MOTOR_ANGLE_TOOLTIP"] = "取得馬達目前的旋轉角度。";

// === 顏色感測器 ===
Blockly.Msg["SPIKE_COLOR_DETECT"] = "顏色感測器 接口 %1 偵測顏色";
Blockly.Msg["SPIKE_COLOR_DETECT_TOOLTIP"] = "偵測目前顏色。回傳 Color 列舉值（如 Color.RED）。";
Blockly.Msg["SPIKE_COLOR_REFLECTION"] = "顏色感測器 接口 %1 反射率";
Blockly.Msg["SPIKE_COLOR_REFLECTION_TOOLTIP"] = "測量表面反射率（0-100）。";
Blockly.Msg["SPIKE_COLOR_AMBIENT"] = "顏色感測器 接口 %1 環境光";
Blockly.Msg["SPIKE_COLOR_AMBIENT_TOOLTIP"] = "測量環境光強度（0-100）。";

// === 距離感測器 ===
Blockly.Msg["SPIKE_DISTANCE_GET"] = "距離感測器 接口 %1 距離 (mm)";
Blockly.Msg["SPIKE_DISTANCE_GET_TOOLTIP"] = "測量與障礙物的距離（毫米）。";

// === 力道感測器 ===
Blockly.Msg["SPIKE_FORCE_PRESSED"] = "力道感測器 接口 %1 被按壓";
Blockly.Msg["SPIKE_FORCE_PRESSED_TOOLTIP"] = "偵測力道感測器是否被按壓。";
Blockly.Msg["SPIKE_FORCE_FORCE"] = "力道感測器 接口 %1 力道 (N)";
Blockly.Msg["SPIKE_FORCE_FORCE_TOOLTIP"] = "測量按壓力道（牛頓）。";

// === Hub 內建 ===
Blockly.Msg["SPIKE_DISPLAY_TEXT"] = "螢幕顯示文字 %1";
Blockly.Msg["SPIKE_DISPLAY_TEXT_TOOLTIP"] = "在 Hub 的 5x5 LED 螢幕上顯示文字。";
Blockly.Msg["SPIKE_DISPLAY_CLEAR"] = "清除螢幕";
Blockly.Msg["SPIKE_DISPLAY_CLEAR_TOOLTIP"] = "關閉所有 LED，清除螢幕顯示。";
Blockly.Msg["SPIKE_BUTTON_PRESSED"] = "按鈕 %1 被按下";
Blockly.Msg["SPIKE_BUTTON_PRESSED_TOOLTIP"] = "偵測 Hub 上的按鈕是否被按下。";
Blockly.Msg["SPIKE_BTN_LEFT"] = "左鍵";
Blockly.Msg["SPIKE_BTN_RIGHT"] = "右鍵";
Blockly.Msg["SPIKE_BTN_CENTER"] = "中間 (Bluetooth)";
Blockly.Msg["SPIKE_WAIT_BUTTON"] = "等待按鈕 %1 被按下";
Blockly.Msg["SPIKE_WAIT_BUTTON_TOOLTIP"] = "程式暫停直到指定按鈕被按下。";
Blockly.Msg["SPIKE_PLAY_NOTE"] = "播放音符 頻率 %1 Hz 持續 %2 毫秒";
Blockly.Msg["SPIKE_PLAY_NOTE_TOOLTIP"] = "播放指定頻率的音符。";
Blockly.Msg["SPIKE_PLAY_BEEP"] = "嗶聲 持續 %1 毫秒";
Blockly.Msg["SPIKE_PLAY_BEEP_TOOLTIP"] = "播放 440Hz 的嗶聲。";
Blockly.Msg["SPIKE_IMU_TILT"] = "IMU 傾斜角度 %1";
Blockly.Msg["SPIKE_IMU_TILT_TOOLTIP"] = "取得 Hub 的傾斜角度。";
Blockly.Msg["SPIKE_TILT_X"] = "X 軸";
Blockly.Msg["SPIKE_TILT_Y"] = "Y 軸";
Blockly.Msg["SPIKE_IMU_UP"] = "IMU 朝向判斷";
Blockly.Msg["SPIKE_IMU_UP_TOOLTIP"] = "判斷 Hub 目前哪一面朝上。";
