(function (Blockly) {
  Object.assign(Blockly.Msg, {
    "HW_SET_LED": "Onboard LED %1",
    "HW_SET_LED_ON": "ON",
    "HW_SET_LED_OFF": "OFF",
    "HW_SET_LED_TOOLTIP": "Control the onboard LED.",
    "HW_STOP_PROGRAM": "sys.exit() (Stop Program)",
    "HW_STOP_PROGRAM_TOOLTIP": "Stop the program.",
    "HW_RESET": "microcontroller.reset() (Reset)",
    "HW_RESET_TOOLTIP": "Reset the hardware.",

    // --- Optimized Pin Control Text ---
    "HW_DIGITAL_WRITE": "Digital Write Pin %1 %2",
    "HW_DIGITAL_READ": "Digital Read Pin %1",
    "HW_ANALOG_READ": "Analog Read Pin %1",
    "HW_PWM_WRITE": "PWM Write Pin %1 %2",
    "HW_I2C_SCAN": "I2C Scan",
    "HW_PIN_HIGH": "High",
    "HW_PIN_LOW": "Low",

    // --- Simplified Tooltips ---
    "HW_DIGITAL_WRITE_TOOLTIP": "Digital Write: High (True) or Low (False)",
    "HW_DIGITAL_READ_TOOLTIP": "Digital Read: returns Boolean (True/False)",
    "HW_ANALOG_READ_TOOLTIP": "Analog Read: returns value (0-65535)",
    "HW_PWM_WRITE_TOOLTIP": "PWM Write: set duty cycle (0-100% or 0-65535)",
    "HW_I2C_SCAN_TOOLTIP": "I2C Scan: returns list of addresses"
  });
})(Blockly);
