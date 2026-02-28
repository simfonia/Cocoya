// mcu_car i18n (en)
Blockly.Msg["CAR_MOTOR"] = "Set Motor Power Left %1 %% Right %2 %% (-100 ~ 100)";
Blockly.Msg["CAR_MOTOR_TOOLTIP"] = "Control left and right motor power of πCar or compatible robot car.";
Blockly.Msg["CAR_STOP"] = "motor %1";
Blockly.Msg["CAR_STOP_TOOLTIP"] = "Control motor stop mode. Brake: stop immediately; Coast: glide to a stop.";
Blockly.Msg["CAR_BRAKE"] = "Brake";
Blockly.Msg["CAR_COAST"] = "Coast";
Blockly.Msg["CAR_BRAKE_DELAY"] = "# Wait briefly to ensure full stop and protect circuitry";
Blockly.Msg["CAR_COAST_DELAY"] = "# Minimal delay for stable state switching";
Blockly.Msg["CAR_SERVO"] = "Set Servo %1 Angle %2 degrees (0~180)";
Blockly.Msg["CAR_SERVO_TOOLTIP"] = "Control a servo on a specific pin to rotate to a certain angle. Note: Does NOT wait for completion; consider adding a delay manually.";
Blockly.Msg["CAR_BUTTON_PRESSED"] = "button %1 pressed";
Blockly.Msg["CAR_BUTTON_1"] = "1 (GP20)";
Blockly.Msg["CAR_BUTTON_2"] = "2 (GP21)";
Blockly.Msg["CAR_BUTTON_TOOLTIP"] = "Detect the button state on Maker Pi RP2040. Returns True when pressed, False when released.";

// πCar Group Labels
Blockly.Msg["CAR_LBL_DRIVE"] = "--- Driving Control ---";
Blockly.Msg["CAR_LBL_ACTION"] = "--- Action System ---";
Blockly.Msg["CAR_LBL_SENSOR"] = "--- Sensors ---";
Blockly.Msg["CAR_LBL_SOUND"] = "--- Sound & Light ---";
Blockly.Msg["CAR_LBL_OTHER"] = "--- Settings ---";

// πCar Action System
Blockly.Msg["CAR_SERVO_SETUP"] = "set %1 pulse range min %2 max %3 us";
Blockly.Msg["CAR_SERVO_SETUP_TOOLTIP"] = "Calibrate pulse range for specific servo (Limit 400-2600 us). Default 460-2400. Helps fix inconsistencies between hands.";
Blockly.Msg["CAR_HAND_RANGE"] = "set hands activity range %1 degrees";
Blockly.Msg["CAR_HAND_RANGE_TOOLTIP"] = "Set the maximum angle for hands (usually 180).";
Blockly.Msg["CAR_IN_POSITION"] = "hands in position (Right 0, Left 180)";
Blockly.Msg["CAR_IN_POSITION_TOOLTIP"] = "Reset hands to initial position. Note: Does NOT wait for completion.";
Blockly.Msg["CAR_MOVE_HANDS"] = "set %1 swing ratio %2 %% at speed %3";
Blockly.Msg["CAR_MOVE_HANDS_TOOLTIP"] = "Smoothly control hand swing ratio. This block WAITS until finished. Speed range 1-10 (1 slowest, 10 fastest).";
Blockly.Msg["CAR_HAND_LEFT"] = "left hand (GP13)";
Blockly.Msg["CAR_HAND_RIGHT"] = "right hand (GP12)";

// πCar Sensor System
Blockly.Msg["CAR_ULTRASONIC"] = "get ultrasonic distance (cm) Trig %1 Echo %2";
Blockly.Msg["CAR_ULTRASONIC_TOOLTIP"] = "Measure distance using HC-SR04 ultrasonic sensor.";
Blockly.Msg["CAR_CHECK_COLOR"] = "detect line color (Pin %1) [0:Black, 1:White]";
Blockly.Msg["CAR_CHECK_COLOR_TOOLTIP"] = "Read digital signal from IR sensor. Returns 0 for black, 1 for white.";
Blockly.Msg["CAR_CHECK_GRAY"] = "detect line grayscale (Pin %1) [0-1023]";
Blockly.Msg["CAR_CHECK_GRAY_TOOLTIP"] = "Read analog signal from IR sensor and map to 0-1023.";

// πCar Music System
Blockly.Msg["CAR_SET_TEMPO"] = "set tempo to %1 BPM";
Blockly.Msg["CAR_SET_TEMPO_TOOLTIP"] = "Set the musical tempo (beats per minute).";
Blockly.Msg["CAR_SET_VOLUME"] = "set volume to %1 (0-100)";
Blockly.Msg["CAR_SET_VOLUME_TOOLTIP"] = "Adjust buzzer volume (simulated via PWM duty cycle). Range 0-100. Note: Volume values may not correspond linearly to perceived loudness due to hardware constraints.";
Blockly.Msg["CAR_PLAY_NOTE"] = "play note %1 %2 duration %3 %4 dotted %5 triplet";
Blockly.Msg["CAR_PLAY_NOTE_TOOLTIP"] = "Play a specific note. You can set the note name, octave, base duration, and optionally apply a dot (1.5x length) or triplet (2/3 length).";
Blockly.Msg["CAR_NOTE_DOTTED"] = "dotted";
Blockly.Msg["CAR_NOTE_TRIPLET"] = "triplet";
Blockly.Msg["CAR_PLAY_MELODY"] = "play melody %1";
Blockly.Msg["CAR_PLAY_MELODY_TOOLTIP"] = "Parse/play melody. Durations: W(Whole), H(Half), Q(Quarter), E(Eighth), S(16th), T(32nd). Supports: Dotted(.), Triplet(_T), Tie(+). Example: 'C4Q. R4E E4H+Q'.";
Blockly.Msg["CAR_TONE"] = "play frequency %1 Hz for %2 ms";
Blockly.Msg["CAR_NO_TONE"] = "stop tone";
Blockly.Msg["CAR_NOTE_TO_FREQ"] = "get frequency of note %1 %2";
Blockly.Msg["CAR_WAIT_START"] = "wait for button %1 pressed to continue";
Blockly.Msg["CAR_WAIT_KEY_MSG"] = "Waiting for button...";
Blockly.Msg["CAR_DEBOUNCE_COMMENT"] = "# Debounce and prevent high CPU usage from tight loop";
Blockly.Msg["CAR_HAND_OFF_COMMENT"] = "# Let hand release";
Blockly.Msg["CAR_WAIT_START_TOOLTIP"] = "Pause the program until the specified button is pressed. Used for safe robot startup.";
Blockly.Msg["CAR_SET_LED_IO"] = "set LED %1 state %2";
Blockly.Msg["CAR_SET_LED"] = "set onboard NeoPixel %1 color %2";
Blockly.Msg["CAR_LED_ALL"] = "All";
Blockly.Msg["CAR_LED_LEFT"] = "Left (0)";
Blockly.Msg["CAR_LED_RIGHT"] = "Right (1)";
Blockly.Msg["CAR_LED_ON"] = "ON";
Blockly.Msg["CAR_LED_OFF"] = "OFF";

Blockly.Msg["COLOUR_MCU_CAR"] = "#4CAF50";
