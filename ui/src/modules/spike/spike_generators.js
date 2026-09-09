// spike_generators.js - Lego SPIKE Prime 產生器（韌體雙模式：官方 SPIKE 3 / Pybricks）
//
// 韌體模式由 spike_init_hub 積木的 FIRMWARE 下拉決定（工作區掃描，未找到 init_hub 預設 official）。
// 官方模式對齊 SPIKE 3 模組式 API；Pybricks 模式對齊 pybricks 物件式 API。
// 注意：官方 API 部分 method 名（display/speaker/imu 細節）需實機驗證後微調。

// === 韌體模式判斷與 import 注入 ===
function spikeFirmwareMode(block) {
    try {
        // 掃描工作區所有積木（init_hub 常接在主流程堆疊中，不是 top block）
        var all = block.workspace.getAllBlocks(false);
        for (var i = 0; i < all.length; i++) {
            if (all[i].type === 'spike_init_hub') {
                var fw = all[i].getFieldValue('FIRMWARE');
                if (fw) return fw;
            }
        }
    } catch (e) { /* workspace 不可用時 fallback */ }
    return 'official';
}

function spikeInjectImports(generator, mode) {
    if (mode === 'pybricks') {
        generator.definitions_['import_spike'] =
            'from pybricks.hubs import PrimeHub\n' +
            'from pybricks.pupdevices import Motor, ColorSensor, UltrasonicSensor, ForceSensor\n' +
            'from pybricks.parameters import Port, Button\n' +
            'from pybricks.tools import wait\n';
    } else {
        generator.definitions_['import_spike'] =
            'import motor\n' +
            'import color_sensor\n' +
            'import distance_sensor\n' +
            'import force_sensor\n' +
            'from hub import port, display, speaker, button, motion_sensor\n';
    }
}

// 官方模式按鈕識別字串（button.pressed() 回傳集合；實際大小寫需実機検証）
function spikeBtnKey(button) {
    var btnMap = { 'LEFT': 'left', 'RIGHT': 'right', 'CENTER': 'center' };
    return btnMap[button] || 'left';
}

function spikePyButton(button) {
    return { 'LEFT': 'Button.LEFT', 'RIGHT': 'Button.RIGHT', 'CENTER': 'Button.CENTER' }[button] || 'Button.LEFT';
}

function spikePortRef(port) { return 'port.' + port; }
function spikeVarName(prefix, port) { return prefix + '_' + port.toLowerCase(); }

// === 初始化 ===
Blockly.Python.forBlock['spike_init_hub'] = function(block, generator) {
    var mode = spikeFirmwareMode(block);
    spikeInjectImports(generator, mode);
    if (mode === 'pybricks') {
        return 'hub = PrimeHub()\n';
    }
    return '# SPIKE 3 hub ready (module-based API)\n';
};

// === 裝置初始化（官方模式無物件，僅註解；Pybricks 建物件） ===
Blockly.Python.forBlock['spike_motor_init'] = function(block, generator) {
    var port = block.getFieldValue('PORT');
    var mode = spikeFirmwareMode(block);
    spikeInjectImports(generator, mode);
    if (mode === 'pybricks') return spikeVarName('motor', port) + ' = Motor(Port.' + port + ')\n';
    return '# motor on Port ' + port + '\n';
};

Blockly.Python.forBlock['spike_color_init'] = function(block, generator) {
    var port = block.getFieldValue('PORT');
    var mode = spikeFirmwareMode(block);
    spikeInjectImports(generator, mode);
    if (mode === 'pybricks') return spikeVarName('color', port) + ' = ColorSensor(Port.' + port + ')\n';
    return '# color sensor on Port ' + port + '\n';
};

Blockly.Python.forBlock['spike_distance_init'] = function(block, generator) {
    var port = block.getFieldValue('PORT');
    var mode = spikeFirmwareMode(block);
    spikeInjectImports(generator, mode);
    if (mode === 'pybricks') return spikeVarName('distance', port) + ' = UltrasonicSensor(Port.' + port + ')\n';
    return '# ultrasonic sensor on Port ' + port + '\n';
};

Blockly.Python.forBlock['spike_force_init'] = function(block, generator) {
    var port = block.getFieldValue('PORT');
    var mode = spikeFirmwareMode(block);
    spikeInjectImports(generator, mode);
    if (mode === 'pybricks') return spikeVarName('force', port) + ' = ForceSensor(Port.' + port + ')\n';
    return '# force sensor on Port ' + port + '\n';
};

// === 馬達控制 ===
Blockly.Python.forBlock['spike_motor_run'] = function(block, generator) {
    var port = block.getFieldValue('PORT');
    var speed = block.getFieldValue('SPEED');
    var mode = spikeFirmwareMode(block);
    spikeInjectImports(generator, mode);
    if (mode === 'pybricks') return spikeVarName('motor', port) + '.run(' + speed + ')\n';
    return 'motor.run(' + spikePortRef(port) + ', ' + speed + ')\n';
};


Blockly.Python.forBlock['spike_motor_run_angle'] = function(block, generator) {
    var port = block.getFieldValue('PORT');
    var speed = block.getFieldValue('SPEED');
    var angle = block.getFieldValue('ANGLE');
    var mode = spikeFirmwareMode(block);
    spikeInjectImports(generator, mode);
    if (mode === 'pybricks') return spikeVarName('motor', port) + '.run_angle(' + speed + ', ' + angle + ')\n';
    return 'motor.run_for_degrees(' + spikePortRef(port) + ', ' + angle + ', ' + speed + ')\n';
};

Blockly.Python.forBlock['spike_motor_run_target'] = function(block, generator) {
    var port = block.getFieldValue('PORT');
    var speed = block.getFieldValue('SPEED');
    var target = block.getFieldValue('TARGET');
    var mode = spikeFirmwareMode(block);
    spikeInjectImports(generator, mode);
    if (mode === 'pybricks') return spikeVarName('motor', port) + '.run_target(' + speed + ', ' + target + ')\n';
    return 'motor.run_to_relative_position(' + spikePortRef(port) + ', ' + target + ', ' + speed + ')\n';
};

Blockly.Python.forBlock['spike_motor_stop'] = function(block, generator) {
    var port = block.getFieldValue('PORT');
    var stopType = block.getFieldValue('STOP_TYPE');
    var mode = spikeFirmwareMode(block);
    spikeInjectImports(generator, mode);
    if (mode === 'pybricks') {
        var varName = spikeVarName('motor', port);
        if (stopType === 'COAST') return varName + '.stop()\n';
        if (stopType === 'BRAKE') return varName + '.brake()\n';
        return varName + '.hold()\n';
    }
    // SPIKE 3 的 motor.stop 不分 COAST/BRAKE/HOLD（由 default_stop_action 設定決定）
    return 'motor.stop(' + spikePortRef(port) + ')\n';
};

Blockly.Python.forBlock['spike_motor_angle'] = function(block, generator) {
    var port = block.getFieldValue('PORT');
    var mode = spikeFirmwareMode(block);
    spikeInjectImports(generator, mode);
    if (mode === 'pybricks') {
        return [spikeVarName('motor', port) + '.angle()', Blockly.Python.ORDER_FUNCTION_CALL];
    }
    return ['motor.relative_position(' + spikePortRef(port) + ')', Blockly.Python.ORDER_FUNCTION_CALL];
};


// === 顏色感測器 ===
Blockly.Python.forBlock['spike_color_detect'] = function(block, generator) {
    var port = block.getFieldValue('PORT');
    var mode = spikeFirmwareMode(block);
    spikeInjectImports(generator, mode);
    if (mode === 'pybricks') {
        return [spikeVarName('color', port) + '.color()', Blockly.Python.ORDER_FUNCTION_CALL];
    }
    return ['color_sensor.color(' + spikePortRef(port) + ')', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['spike_color_reflection'] = function(block, generator) {
    var port = block.getFieldValue('PORT');
    var mode = spikeFirmwareMode(block);
    spikeInjectImports(generator, mode);
    if (mode === 'pybricks') {
        return [spikeVarName('color', port) + '.reflection()', Blockly.Python.ORDER_FUNCTION_CALL];
    }
    return ['color_sensor.reflection(' + spikePortRef(port) + ')', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['spike_color_ambient'] = function(block, generator) {
    var port = block.getFieldValue('PORT');
    var mode = spikeFirmwareMode(block);
    spikeInjectImports(generator, mode);
    if (mode === 'pybricks') {
        return [spikeVarName('color', port) + '.ambient()', Blockly.Python.ORDER_FUNCTION_CALL];
    }
    return ['color_sensor.ambient(' + spikePortRef(port) + ')', Blockly.Python.ORDER_FUNCTION_CALL];
};

// === 距離感測器 ===
Blockly.Python.forBlock['spike_distance_get'] = function(block, generator) {
    var port = block.getFieldValue('PORT');
    var mode = spikeFirmwareMode(block);
    spikeInjectImports(generator, mode);
    if (mode === 'pybricks') {
        return [spikeVarName('distance', port) + '.distance()', Blockly.Python.ORDER_FUNCTION_CALL];
    }
    return ['distance_sensor.distance(' + spikePortRef(port) + ')', Blockly.Python.ORDER_FUNCTION_CALL];
};

// === 力道感測器 ===
Blockly.Python.forBlock['spike_force_pressed'] = function(block, generator) {
    var port = block.getFieldValue('PORT');
    var mode = spikeFirmwareMode(block);
    spikeInjectImports(generator, mode);
    if (mode === 'pybricks') {
        return [spikeVarName('force', port) + '.pressed()', Blockly.Python.ORDER_FUNCTION_CALL];
    }
    return ['force_sensor.pressed(' + spikePortRef(port) + ')', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['spike_force_force'] = function(block, generator) {
    var port = block.getFieldValue('PORT');
    var mode = spikeFirmwareMode(block);
    spikeInjectImports(generator, mode);
    if (mode === 'pybricks') {
        return [spikeVarName('force', port) + '.force()', Blockly.Python.ORDER_FUNCTION_CALL];
    }
    return ['force_sensor.force(' + spikePortRef(port) + ')', Blockly.Python.ORDER_FUNCTION_CALL];
};


// === Hub 內建 ===
Blockly.Python.forBlock['spike_display_text'] = function(block, generator) {
    var text = block.getFieldValue('TEXT');
    var mode = spikeFirmwareMode(block);
    spikeInjectImports(generator, mode);
    if (mode === 'pybricks') return 'hub.display.text("' + text + '")\n';
    // 実機検証：SPIKE 3 display.text 簽名
    return 'display.text("' + text + '")\n';
};

Blockly.Python.forBlock['spike_display_clear'] = function(block, generator) {
    var mode = spikeFirmwareMode(block);
    spikeInjectImports(generator, mode);
    if (mode === 'pybricks') return 'hub.display.off()\n';
    return 'display.off()\n';
};

Blockly.Python.forBlock['spike_button_pressed'] = function(block, generator) {
    var button = block.getFieldValue('BUTTON');
    var mode = spikeFirmwareMode(block);
    spikeInjectImports(generator, mode);
    if (mode === 'pybricks') {
        return [spikePyButton(button) + ' in hub.buttons.pressed()', Blockly.Python.ORDER_RELATIONAL];
    }
    return ["'" + spikeBtnKey(button) + "' in button.pressed()", Blockly.Python.ORDER_RELATIONAL];
};

Blockly.Python.forBlock['spike_wait_button'] = function(block, generator) {
    var button = block.getFieldValue('BUTTON');
    var mode = spikeFirmwareMode(block);
    spikeInjectImports(generator, mode);
    if (mode === 'pybricks') {
        return 'while ' + spikePyButton(button) + ' not in hub.buttons.pressed():\n    pass\n';
    }
    return "while '" + spikeBtnKey(button) + "' not in button.pressed():\n    pass\n";
};

Blockly.Python.forBlock['spike_play_note'] = function(block, generator) {
    var freq = block.getFieldValue('FREQUENCY');
    var duration = block.getFieldValue('DURATION');
    var mode = spikeFirmwareMode(block);
    spikeInjectImports(generator, mode);
    if (mode === 'pybricks') {
        return 'hub.speaker.play_notes([(' + freq + ', ' + duration + ')])\n';
    }
    // 実機検証：SPIKE 3 speaker.play_notes 簽名
    return 'speaker.play_notes([(' + freq + ', ' + duration + ')])\n';
};

Blockly.Python.forBlock['spike_play_beep'] = function(block, generator) {
    var duration = block.getFieldValue('DURATION');
    var mode = spikeFirmwareMode(block);
    spikeInjectImports(generator, mode);
    if (mode === 'pybricks') {
        return 'hub.speaker.beep(440, ' + duration + ')\n';
    }
    // 実機検証：SPIKE 3 speaker.beep 簽名
    return 'speaker.beep(440, ' + duration + ')\n';
};

Blockly.Python.forBlock['spike_imu_tilt'] = function(block, generator) {
    var axis = block.getFieldValue('AXIS');
    var mode = spikeFirmwareMode(block);
    spikeInjectImports(generator, mode);
    if (mode === 'pybricks') {
        if (axis === 'TILT_X') {
            return ['hub.imu.up()[0]', Blockly.Python.ORDER_FUNCTION_CALL];
        }
        return ['hub.imu.up()[1]', Blockly.Python.ORDER_FUNCTION_CALL];
    }
    // 実機検証：以加速度分量近似傾斜（SPIKE 3 motion_sensor）
    if (axis === 'TILT_X') {
        return ['motion_sensor.get_acceleration()[0]', Blockly.Python.ORDER_FUNCTION_CALL];
    }
    return ['motion_sensor.get_acceleration()[1]', Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['spike_imu_up'] = function(block, generator) {
    var mode = spikeFirmwareMode(block);
    spikeInjectImports(generator, mode);
    if (mode === 'pybricks') {
        return ['hub.imu.up()', Blockly.Python.ORDER_FUNCTION_CALL];
    }
    return ['motion_sensor.get_orientation()', Blockly.Python.ORDER_FUNCTION_CALL];
};

