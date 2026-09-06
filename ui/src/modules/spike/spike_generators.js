// spike_generators.js - Lego SPIKE Prime 產生器（多層分類實驗版）

// === 初始化 ===
Blockly.Python.forBlock['spike_init_hub'] = function(block) {
  return 'hub = PrimeHub()\n';
};

Blockly.Python.forBlock['spike_motor_init'] = function(block) {
  var port = block.getFieldValue('PORT');
  var type = block.getFieldValue('TYPE');
  var varName = 'motor_' + port.toLowerCase();
  return varName + ' = Motor(Port.' + port + ')\n';
};

Blockly.Python.forBlock['spike_color_init'] = function(block) {
  var port = block.getFieldValue('PORT');
  var varName = 'color_' + port.toLowerCase();
  return varName + ' = ColorSensor(Port.' + port + ')\n';
};

Blockly.Python.forBlock['spike_distance_init'] = function(block) {
  var port = block.getFieldValue('PORT');
  var varName = 'distance_' + port.toLowerCase();
  return varName + ' = UltrasonicSensor(Port.' + port + ')\n';
};

Blockly.Python.forBlock['spike_force_init'] = function(block) {
  var port = block.getFieldValue('PORT');
  var varName = 'force_' + port.toLowerCase();
  return varName + ' = ForceSensor(Port.' + port + ')\n';
};

// === 馬達控制 ===
Blockly.Python.forBlock['spike_motor_run'] = function(block) {
  var port = block.getFieldValue('PORT');
  var speed = block.getFieldValue('SPEED');
  var varName = 'motor_' + port.toLowerCase();
  return varName + '.run(' + speed + ')\n';
};

Blockly.Python.forBlock['spike_motor_run_angle'] = function(block) {
  var port = block.getFieldValue('PORT');
  var speed = block.getFieldValue('SPEED');
  var angle = block.getFieldValue('ANGLE');
  var varName = 'motor_' + port.toLowerCase();
  return varName + '.run_angle(' + speed + ', ' + angle + ')\n';
};

Blockly.Python.forBlock['spike_motor_run_target'] = function(block) {
  var port = block.getFieldValue('PORT');
  var speed = block.getFieldValue('SPEED');
  var target = block.getFieldValue('TARGET');
  var varName = 'motor_' + port.toLowerCase();
  return varName + '.run_target(' + speed + ', ' + target + ')\n';
};

Blockly.Python.forBlock['spike_motor_stop'] = function(block) {
  var port = block.getFieldValue('PORT');
  var stopType = block.getFieldValue('STOP_TYPE');
  var varName = 'motor_' + port.toLowerCase();
  if (stopType === 'COAST') {
    return varName + '.stop()\n';
  } else if (stopType === 'BRAKE') {
    return varName + '.brake()\n';
  } else {
    return varName + '.hold()\n';
  }
};

Blockly.Python.forBlock['spike_motor_angle'] = function(block) {
  var port = block.getFieldValue('PORT');
  var varName = 'motor_' + port.toLowerCase();
  return [varName + '.angle()', Blockly.Python.ORDER_FUNCTION_CALL];
};

// === 顏色感測器 ===
Blockly.Python.forBlock['spike_color_detect'] = function(block) {
  var port = block.getFieldValue('PORT');
  var varName = 'color_' + port.toLowerCase();
  return [varName + '.color()', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['spike_color_reflection'] = function(block) {
  var port = block.getFieldValue('PORT');
  var varName = 'color_' + port.toLowerCase();
  return [varName + '.reflection()', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['spike_color_ambient'] = function(block) {
  var port = block.getFieldValue('PORT');
  var varName = 'color_' + port.toLowerCase();
  return [varName + '.ambient()', Blockly.Python.ORDER_FUNCTION_CALL];
};

// === 距離感測器 ===
Blockly.Python.forBlock['spike_distance_get'] = function(block) {
  var port = block.getFieldValue('PORT');
  var varName = 'distance_' + port.toLowerCase();
  return [varName + '.distance()', Blockly.Python.ORDER_FUNCTION_CALL];
};

// === 力道感測器 ===
Blockly.Python.forBlock['spike_force_pressed'] = function(block) {
  var port = block.getFieldValue('PORT');
  var varName = 'force_' + port.toLowerCase();
  return [varName + '.pressed()', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['spike_force_force'] = function(block) {
  var port = block.getFieldValue('PORT');
  var varName = 'force_' + port.toLowerCase();
  return [varName + '.force()', Blockly.Python.ORDER_FUNCTION_CALL];
};

// === Hub 內建 ===
Blockly.Python.forBlock['spike_display_text'] = function(block) {
  var text = block.getFieldValue('TEXT');
  return 'hub.display.text("' + text + '")\n';
};

Blockly.Python.forBlock['spike_display_clear'] = function(block) {
  return 'hub.display.off()\n';
};

Blockly.Python.forBlock['spike_button_pressed'] = function(block) {
  var button = block.getFieldValue('BUTTON');
  var btnMap = { 'LEFT': 'left', 'RIGHT': 'right', 'CENTER': 'center' };
  return ['hub.buttons.' + btnMap[button] + '.pressed()', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['spike_wait_button'] = function(block) {
  var button = block.getFieldValue('BUTTON');
  var btnMap = { 'LEFT': 'left', 'RIGHT': 'right', 'CENTER': 'center' };
  return 'wait_for_button_' + btnMap[button] + '()\n';
};

Blockly.Python.forBlock['spike_play_note'] = function(block) {
  var freq = block.getFieldValue('FREQUENCY');
  var duration = block.getFieldValue('DURATION');
  return 'hub.speaker.play_notes([(' + freq + ', ' + duration + ')])\n';
};

Blockly.Python.forBlock['spike_play_beep'] = function(block) {
  var duration = block.getFieldValue('DURATION');
  return 'hub.speaker.beep(440, ' + duration + ')\n';
};

Blockly.Python.forBlock['spike_imu_tilt'] = function(block) {
  var axis = block.getFieldValue('AXIS');
  if (axis === 'TILT_X') {
    return ['hub.imu.up()[0]', Blockly.Python.ORDER_FUNCTION_CALL];
  } else {
    return ['hub.imu.up()[1]', Blockly.Python.ORDER_FUNCTION_CALL];
  }
};

Blockly.Python.forBlock['spike_imu_up'] = function(block) {
  return ['hub.imu.up()', Blockly.Python.ORDER_FUNCTION_CALL];
};
