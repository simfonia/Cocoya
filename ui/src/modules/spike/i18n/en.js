// spike i18n (en) - Lego SPIKE Prime block messages

// === Initialization ===
Blockly.Msg["SPIKE_INIT_HUB"] = "Initialize Hub %1";
Blockly.Msg["SPIKE_INIT_HUB_TOOLTIP"] = "Initialize the Lego SPIKE Prime Hub. Must be called once at the start. Choose the firmware mode matching the firmware actually installed on the hub (Official SPIKE 3 App or Pybricks).";
Blockly.Msg["SPIKE_FW_OFFICIAL"] = "Official (SPIKE 3)";
Blockly.Msg["SPIKE_FW_PYBRICKS"] = "Pybricks";
Blockly.Msg["SPIKE_MOTOR_INIT"] = "Initialize motor port %1 type %2";
Blockly.Msg["SPIKE_MOTOR_INIT_TOOLTIP"] = "Initialize a motor on the specified port. Large is high-torque, Medium is standard.";
Blockly.Msg["SPIKE_MOTOR_TYPE_LARGE"] = "Large";
Blockly.Msg["SPIKE_MOTOR_TYPE_MEDIUM"] = "Medium";
Blockly.Msg["SPIKE_COLOR_INIT"] = "Initialize color sensor port %1";
Blockly.Msg["SPIKE_COLOR_INIT_TOOLTIP"] = "Initialize a color sensor on the specified port.";
Blockly.Msg["SPIKE_DISTANCE_INIT"] = "Initialize distance sensor port %1";
Blockly.Msg["SPIKE_DISTANCE_INIT_TOOLTIP"] = "Initialize an ultrasonic distance sensor on the specified port.";
Blockly.Msg["SPIKE_FORCE_INIT"] = "Initialize force sensor port %1";
Blockly.Msg["SPIKE_FORCE_INIT_TOOLTIP"] = "Initialize a force sensor on the specified port.";

// === Motor Control ===
Blockly.Msg["SPIKE_MOTOR_RUN"] = "Motor port %1 run at speed %2";
Blockly.Msg["SPIKE_MOTOR_RUN_TOOLTIP"] = "Run motor at specified speed. Positive = forward, negative = backward. Range -1000 ~ 1000.";
Blockly.Msg["SPIKE_MOTOR_RUN_ANGLE"] = "Motor port %1 run at speed %2 for %3 deg";
Blockly.Msg["SPIKE_MOTOR_RUN_ANGLE_TOOLTIP"] = "Run motor at specified speed for specified angle.";
Blockly.Msg["SPIKE_MOTOR_RUN_TARGET"] = "Motor port %1 run at speed %2 to target %3";
Blockly.Msg["SPIKE_MOTOR_RUN_TARGET_TOOLTIP"] = "Run motor at specified speed to target angle (absolute).";
Blockly.Msg["SPIKE_MOTOR_STOP"] = "Motor port %1 stop %2";
Blockly.Msg["SPIKE_MOTOR_STOP_TOOLTIP"] = "Stop motor. Coast: glide; Brake: stop immediately; Hold: lock position.";
Blockly.Msg["SPIKE_STOP_COAST"] = "Coast";
Blockly.Msg["SPIKE_STOP_BRAKE"] = "Brake";
Blockly.Msg["SPIKE_STOP_HOLD"] = "Hold";
Blockly.Msg["SPIKE_MOTOR_ANGLE"] = "Motor port %1 current angle";
Blockly.Msg["SPIKE_MOTOR_ANGLE_TOOLTIP"] = "Get the current angle of the motor.";

// === Color Sensor ===
Blockly.Msg["SPIKE_COLOR_DETECT"] = "Color sensor port %1 detect color";
Blockly.Msg["SPIKE_COLOR_DETECT_TOOLTIP"] = "Detect the current color. Returns Color enum (e.g., Color.RED).";
Blockly.Msg["SPIKE_COLOR_REFLECTION"] = "Color sensor port %1 reflection";
Blockly.Msg["SPIKE_COLOR_REFLECTION_TOOLTIP"] = "Measure surface reflection (0-100).";
Blockly.Msg["SPIKE_COLOR_AMBIENT"] = "Color sensor port %1 ambient light";
Blockly.Msg["SPIKE_COLOR_AMBIENT_TOOLTIP"] = "Measure ambient light intensity (0-100).";

// === Distance Sensor ===
Blockly.Msg["SPIKE_DISTANCE_GET"] = "Distance sensor port %1 distance (mm)";
Blockly.Msg["SPIKE_DISTANCE_GET_TOOLTIP"] = "Measure distance to obstacle in millimeters.";

// === Force Sensor ===
Blockly.Msg["SPIKE_FORCE_PRESSED"] = "Force sensor port %1 pressed";
Blockly.Msg["SPIKE_FORCE_PRESSED_TOOLTIP"] = "Detect if the force sensor is pressed.";
Blockly.Msg["SPIKE_FORCE_FORCE"] = "Force sensor port %1 force (N)";
Blockly.Msg["SPIKE_FORCE_FORCE_TOOLTIP"] = "Measure pressing force in Newtons.";

// === Hub Built-in ===
Blockly.Msg["SPIKE_DISPLAY_TEXT"] = "Display text %1";
Blockly.Msg["SPIKE_DISPLAY_TEXT_TOOLTIP"] = "Display text on the Hub's 5x5 LED screen.";
Blockly.Msg["SPIKE_DISPLAY_CLEAR"] = "Clear display";
Blockly.Msg["SPIKE_DISPLAY_CLEAR_TOOLTIP"] = "Turn off all LEDs, clearing the display.";
Blockly.Msg["SPIKE_BUTTON_PRESSED"] = "Button %1 pressed";
Blockly.Msg["SPIKE_BUTTON_PRESSED_TOOLTIP"] = "Detect if a Hub button is pressed.";
Blockly.Msg["SPIKE_BTN_LEFT"] = "Left";
Blockly.Msg["SPIKE_BTN_RIGHT"] = "Right";
Blockly.Msg["SPIKE_BTN_CENTER"] = "Center (Bluetooth)";
Blockly.Msg["SPIKE_WAIT_BUTTON"] = "Wait for button %1 pressed";
Blockly.Msg["SPIKE_WAIT_BUTTON_TOOLTIP"] = "Pause program until specified button is pressed.";
Blockly.Msg["SPIKE_PLAY_NOTE"] = "Play note frequency %1 Hz for %2 ms";
Blockly.Msg["SPIKE_PLAY_NOTE_TOOLTIP"] = "Play a note at the specified frequency.";
Blockly.Msg["SPIKE_PLAY_BEEP"] = "Beep for %1 ms";
Blockly.Msg["SPIKE_PLAY_BEEP_TOOLTIP"] = "Play a 440Hz beep.";
Blockly.Msg["SPIKE_IMU_TILT"] = "IMU tilt angle %1";
Blockly.Msg["SPIKE_IMU_TILT_TOOLTIP"] = "Get the Hub's tilt angle.";
Blockly.Msg["SPIKE_TILT_X"] = "X axis";
Blockly.Msg["SPIKE_TILT_Y"] = "Y axis";
Blockly.Msg["SPIKE_IMU_UP"] = "IMU up detection";
Blockly.Msg["SPIKE_IMU_UP_TOOLTIP"] = "Detect which face of the Hub is pointing up.";
