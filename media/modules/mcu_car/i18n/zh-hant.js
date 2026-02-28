// mcu_car i18n (zh-hant)
Blockly.Msg["CAR_MOTOR"] = "設定馬達功率 左輪 %1 %% 右輪 %2 %% (-100 ~ 100)";
Blockly.Msg["CAR_MOTOR_TOOLTIP"] = "控制 πCar 或相容小車的左右馬達動力。正值前進，負值後退。";
Blockly.Msg["CAR_STOP"] = "馬達 %1";
Blockly.Msg["CAR_STOP_TOOLTIP"] = "控制馬達停止方式。煞車：立即停止；滑行：慣性慢慢停下。";
Blockly.Msg["CAR_BRAKE"] = "煞車 (Brake)";
Blockly.Msg["CAR_COAST"] = "滑行 (Coast)";
Blockly.Msg["CAR_BRAKE_DELAY"] = "# 短暫等待以確保完全靜止並保護電路";
Blockly.Msg["CAR_COAST_DELAY"] = "# 極短延遲以確保狀態切換穩定";
Blockly.Msg["CAR_SERVO"] = "設定 servo %1 角度 %2 度 (0~180)";
Blockly.Msg["CAR_SERVO_TOOLTIP"] = "控制指定腳位的 servo 旋轉到特定角度。注意：此積木不等待動作完成，若有後續動作建議手動加入等待。";
Blockly.Msg["CAR_BUTTON_PRESSED"] = "按鈕 %1 被按下";
Blockly.Msg["CAR_BUTTON_1"] = "1 (GP20)";
Blockly.Msg["CAR_BUTTON_2"] = "2 (GP21)";
Blockly.Msg["CAR_BUTTON_TOOLTIP"] = "偵測 Maker Pi RP2040 上的按鈕狀態。按下時傳回 True，放開時傳回 False。";

// πCar Group Labels
Blockly.Msg["CAR_LBL_DRIVE"] = "--- 運動控制 (Driving) ---";
Blockly.Msg["CAR_LBL_ACTION"] = "--- 動作系統 (Actions) ---";
Blockly.Msg["CAR_LBL_SENSOR"] = "--- 感測器 (Sensors) ---";
Blockly.Msg["CAR_LBL_SOUND"] = "--- 聲光效果 (Sound & Light) ---";
Blockly.Msg["CAR_LBL_OTHER"] = "--- 其他設定 (Others) ---";

// πCar Action System
Blockly.Msg["CAR_SERVO_SETUP"] = "設定 %1 脈衝範圍 最小 %2 最大 %3 微秒";
Blockly.Msg["CAR_SERVO_SETUP_TOOLTIP"] = "校準特定 servo 的訊號範圍 (極限值 400-2600 微秒)。預設 460-2400。可用於修正左右手動作不一致的問題。";
Blockly.Msg["CAR_HAND_RANGE"] = "設定雙手活動範圍 %1 度";
Blockly.Msg["CAR_HAND_RANGE_TOOLTIP"] = "設定雙手張開的最大角度（通常為 180）。";
Blockly.Msg["CAR_IN_POSITION"] = "雙手歸位 (右手 0, 左手 180)";
Blockly.Msg["CAR_IN_POSITION_TOOLTIP"] = "將雙手 servo 旋轉到初始位置。注意：此積木不等待動作完成。";
Blockly.Msg["CAR_MOVE_HANDS"] = "控制 %1 旋出比例 %2 %% 速度 %3";
Blockly.Msg["CAR_MOVE_HANDS_TOOLTIP"] = "以平滑方式控制手的旋出比例。此積木會等待動作完成。速度範圍 1-10 (1 為最慢，10 為最快)。";
Blockly.Msg["CAR_HAND_BOTH"] = "雙手";
Blockly.Msg["CAR_HAND_LEFT"] = "左手 (GP13)";
Blockly.Msg["CAR_HAND_RIGHT"] = "右手 (GP12)";

// πCar Sensor System
Blockly.Msg["CAR_ULTRASONIC"] = "讀取超音波距離 (公分) Trig %1 Echo %2";
Blockly.Msg["CAR_ULTRASONIC_TOOLTIP"] = "使用 HC-SR04 超音波感測器測量障礙物距離。";
Blockly.Msg["CAR_CHECK_COLOR"] = "偵測循跡顏色 (腳位 %1) [0:黑, 1:白]";
Blockly.Msg["CAR_CHECK_COLOR_TOOLTIP"] = "讀取循跡感測器的數位訊號。回傳 0 代表黑色，1 代表白色。";
Blockly.Msg["CAR_CHECK_GRAY"] = "偵測循跡灰階值 (腳位 %1) [0-1023]";
Blockly.Msg["CAR_CHECK_GRAY_TOOLTIP"] = "讀取循跡感測器的類比訊號並映射至 0-1023。數值越大越接近白色。";

// πCar Music System
Blockly.Msg["CAR_SET_TEMPO"] = "設定演奏速度 %1 BPM";
Blockly.Msg["CAR_SET_TEMPO_TOOLTIP"] = "設定音樂的演奏速度（每分鐘節拍數）。";
Blockly.Msg["CAR_SET_VOLUME"] = "設定音量 %1 (0-100)";
Blockly.Msg["CAR_SET_VOLUME_TOOLTIP"] = "調整蜂鳴器的音量（透過 PWM 佔空比模擬）。範圍 0-100。注意：受限於硬體特性，音量數值與聽覺感受並非線性關係。";
Blockly.Msg["CAR_PLAY_NOTE"] = "播放音符 %1 %2 時值 %3 %4 附點 %5 三連音";
Blockly.Msg["CAR_PLAY_NOTE_TOOLTIP"] = "播放指定的音符。可設定音名、八度、基本時值，並可勾選附點（增加 50% 長度）或三連音（縮短為 2/3 長度）。";
Blockly.Msg["CAR_NOTE_DOTTED"] = "附點";
Blockly.Msg["CAR_NOTE_TRIPLET"] = "三連音";
Blockly.Msg["CAR_PLAY_MELODY"] = "演奏旋律 %1";
Blockly.Msg["CAR_PLAY_MELODY_TOOLTIP"] = "解析並播放旋律。時值：W(全), H(半), Q(4分), E(8分), S(16分), T(32分)。支援：附點(.), 三連音(_T), 連結線(+)。範例：'C4Q. R4E E4H+Q'。";
Blockly.Msg["CAR_TONE"] = "播放頻率 %1 Hz 持續 %2 毫秒";
Blockly.Msg["CAR_NO_TONE"] = "停止發聲";
Blockly.Msg["CAR_NOTE_TO_FREQ"] = "取得音符 %1 %2 的頻率";
Blockly.Msg["CAR_WAIT_START"] = "等待按鈕 %1 按下，以往下執行程式";
Blockly.Msg["CAR_WAIT_KEY_MSG"] = "等待按鍵中...";
Blockly.Msg["CAR_DEBOUNCE_COMMENT"] = "# 防彈跳並避免空迴圈高速運轉讓CPU滿載";
Blockly.Msg["CAR_HAND_OFF_COMMENT"] = "# 讓手離開";
Blockly.Msg["CAR_WAIT_START_TOOLTIP"] = "程式會在此處暫停，直到按下指定的按鈕才會繼續。常用於安全啟動機器人。";
Blockly.Msg["CAR_SET_LED_IO"] = "設定 LED 燈 %1 狀態 %2";
Blockly.Msg["CAR_SET_LED"] = "設定內建 NeoPixel 燈 %1 顏色 %2";
Blockly.Msg["CAR_LED_ALL"] = "全部";
Blockly.Msg["CAR_LED_LEFT"] = "左 (0)";
Blockly.Msg["CAR_LED_RIGHT"] = "右 (1)";
Blockly.Msg["CAR_LED_ON"] = "亮";
Blockly.Msg["CAR_LED_OFF"] = "滅";

Blockly.Msg["COLOUR_MCU_CAR"] = "#4CAF50"; // 使用活力綠色
