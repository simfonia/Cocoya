// mcu_camera_blocks.js
Blockly.Blocks['mcu_camera_init'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["MCU_CAM_INIT"],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_MCU_CAMERA"],
      "tooltip": Blockly.Msg["MCU_CAM_INIT_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['mcu_camera_capture_serial'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["MCU_CAM_CAPTURE_SERIAL"],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_MCU_CAMERA"],
      "tooltip": Blockly.Msg["MCU_CAM_CAPTURE_SERIAL_TOOLTIP"],
      "helpUrl": ""
    });
  }
};
