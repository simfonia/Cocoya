// mcu_car_generators.js
Blockly.Python.forBlock['mcu_car_motor'] = function(block, generator) {
  generator.definitions_['import_board'] = 'import board';
  generator.definitions_['import_pwmio'] = 'import pwmio';

  generator.definitions_['class_car_motor'] = `
class CarMotor:
    def __init__(self):
        # Maker Pi RP2040 Motor Pins
        self.m1a = pwmio.PWMOut(board.GP8, frequency=1000)
        self.m1b = pwmio.PWMOut(board.GP9, frequency=1000)
        self.m2a = pwmio.PWMOut(board.GP10, frequency=1000)
        self.m2b = pwmio.PWMOut(board.GP11, frequency=1000)

    def set_speed(self, left, right):
        # Left Motor (M1)
        l = max(min(left, 100), -100)
        if l >= 0:
            self.m1a.duty_cycle = int(l * 655.35)
            self.m1b.duty_cycle = 0
        else:
            self.m1a.duty_cycle = 0
            self.m1b.duty_cycle = int(-l * 655.35)
        
        # Right Motor (M2)
        r = max(min(right, 100), -100)
        if r >= 0:
            self.m2a.duty_cycle = int(r * 655.35)
            self.m2b.duty_cycle = 0
        else:
            self.m2a.duty_cycle = 0
            self.m2b.duty_cycle = int(-r * 655.35)

    def stop(self):
        # Brake: Short to GND (IN1=L, IN2=L) - Verified by User Observation
        self.m1a.duty_cycle = 0
        self.m1b.duty_cycle = 0
        self.m2a.duty_cycle = 0
        self.m2b.duty_cycle = 0

    def coast(self):
        # Coast: Hi-Z (IN1=H, IN2=H) - Verified by User Observation
        self.m1a.duty_cycle = 65535
        self.m1b.duty_cycle = 65535
        self.m2a.duty_cycle = 65535
        self.m2b.duty_cycle = 65535
`;

  var left = generator.valueToCode(block, 'LEFT', Blockly.Python.ORDER_ATOMIC) || '0';
  var right = generator.valueToCode(block, 'RIGHT', Blockly.Python.ORDER_ATOMIC) || '0';

  var code = `
if 'car' not in globals(): car = CarMotor()
car.set_speed(${left}, ${right})
`;
  return code;
};

Blockly.Python.forBlock['mcu_car_stop'] = function(block, generator) {
  var mode = block.getFieldValue('MODE');
  generator.definitions_['import_time'] = 'import time';
  
  if (mode === 'COAST') {
    return `if 'car' in globals(): car.coast()\ntime.sleep(0.01)  ${Blockly.Msg["CAR_COAST_DELAY"]}\n`;
  } else {
    return `if 'car' in globals(): car.stop()\ntime.sleep(0.1)  ${Blockly.Msg["CAR_BRAKE_DELAY"]}\n`;
  }
};

// --- Servo Helper Injection ---
const SERVO_CLASS_INJECT = `
class PiCarServo:
    _TRIM = {} # Store per-pin min_us/max_us

    def __init__(self, pin, min_us=460, max_us=2400):
        self.pwm = pwmio.PWMOut(pin, frequency=50)
        self.pin_str = str(pin).replace("board.", "")
        # Use existing trim if available, else use default (Apply 400-2600 limit)
        _m1, _m2 = self._TRIM.get(self.pin_str, (min_us, max_us))
        self.min_us = max(min(_m1, 2600), 400)
        self.max_us = max(min(_m2, 2600), 400)
        self.current_angle = 90
        self.hand_range = 180

    def set_angle(self, angle):
        angle = max(min(angle, 180), 0)
        self.current_angle = angle
        # Always fetch latest trim values (Apply 400-2600 limit)
        _m1, _m2 = self._TRIM.get(self.pin_str, (self.min_us, self.max_us))
        min_u = max(min(_m1, 2600), 400)
        max_u = max(min(_m2, 2600), 400)
        
        # Map angle (0-180) to pulse width (min_u - max_u us)
        us = min_u + (angle / 180 * (max_u - min_u))
        # Convert microseconds to duty_cycle (0-65535)
        # Period at 50Hz is 20,000us (1,000,000 / 50)
        self.pwm.duty_cycle = int(us / 20000 * 65535)

    def move_smooth(self, target_angle, speed):
        PiCarServo.move_sync([self], [target_angle], speed)

    @staticmethod
    def move_sync(servos, targets, speed):
        # Speed 10: Instant positioning
        if speed >= 10:
            for i in range(len(servos)):
                servos[i].set_angle(targets[i])
            return

        # Speed 1-9: Smooth stepping (Map 1->0.1s, 9->0.01s)
        delay = (10 - max(min(speed, 9), 1)) * 0.011
        moving = True
        while moving:
            moving = False
            for i in range(len(servos)):
                s = servos[i]
                t = targets[i] # Target angle is already pre-validated
                if s.current_angle != t:
                    step = 1 if t > s.current_angle else -1
                    s.set_angle(s.current_angle + step)
                    moving = True
            if moving: time.sleep(delay)
`;

Blockly.Python.forBlock['mcu_car_servo'] = function(block, generator) {
  generator.definitions_['import_board'] = 'import board';
  generator.definitions_['import_pwmio'] = 'import pwmio';
  generator.definitions_['import_time'] = 'import time';
  generator.definitions_['class_picar_servo'] = SERVO_CLASS_INJECT;

  var pin = block.getFieldValue('PIN');
  var angle = generator.valueToCode(block, 'ANGLE', Blockly.Python.ORDER_ATOMIC) || '90';
  var pin_id = pin.replace('board.', '');

  generator.definitions_['init_servo_' + pin_id] = `
if 'servo_${pin_id}' not in globals():
    servo_${pin_id} = PiCarServo(${pin})
`;

  return `servo_${pin_id}.set_angle(${angle})\n`;
};

Blockly.Python.forBlock['mcu_car_servo_setup'] = function(block, generator) {
  generator.definitions_['class_picar_servo'] = SERVO_CLASS_INJECT;
  
  var hand = block.getFieldValue('HAND'); // 現在是 "board.GP12" 等格式
  var min = block.getFieldValue('MIN') || '460';
  var max = block.getFieldValue('MAX') || '2400';
  var pin_id = hand.replace('board.', '');
  
  var code = `PiCarServo._TRIM["${pin_id}"] = (${min}, ${max})\n`;
  code += `if 'servo_${pin_id}' in globals(): servo_${pin_id}.min_us, servo_${pin_id}.max_us = ${min}, ${max}\n`;
  
  return code;
};

Blockly.Python.forBlock['mcu_car_hand_range'] = function(block, generator) {
  generator.definitions_['class_picar_servo'] = SERVO_CLASS_INJECT;
  var range = generator.valueToCode(block, 'RANGE', Blockly.Python.ORDER_ATOMIC) || '180';
  return `
if 'servo_GP12' not in globals(): servo_GP12 = PiCarServo(board.GP12)
if 'servo_GP13' not in globals(): servo_GP13 = PiCarServo(board.GP13)
servo_GP12.hand_range = ${range}
servo_GP13.hand_range = ${range}
`;
};

Blockly.Python.forBlock['mcu_car_in_position'] = function(block, generator) {
  generator.definitions_['import_board'] = 'import board';
  generator.definitions_['import_pwmio'] = 'import pwmio';
  generator.definitions_['import_time'] = 'import time';
  generator.definitions_['class_picar_servo'] = SERVO_CLASS_INJECT;
  // 確保初始化
  var code = `
if 'servo_GP12' not in globals(): servo_GP12 = PiCarServo(board.GP12)
if 'servo_GP13' not in globals(): servo_GP13 = PiCarServo(board.GP13)
servo_GP12.set_angle(0)
servo_GP13.set_angle(180)
`;
  return code;
};

Blockly.Python.forBlock['mcu_car_move_hands'] = function(block, generator) {
  var hand = block.getFieldValue('HAND');
  var percent = generator.valueToCode(block, 'PERCENT', Blockly.Python.ORDER_ATOMIC) || '50';
  var speed = generator.valueToCode(block, 'SPEED', Blockly.Python.ORDER_ATOMIC) || '8';
  
  generator.definitions_['import_board'] = 'import board';
  generator.definitions_['import_pwmio'] = 'import pwmio';
  generator.definitions_['import_time'] = 'import time';
  generator.definitions_['class_picar_servo'] = SERVO_CLASS_INJECT;

  var code = `
if 'servo_GP12' not in globals(): servo_GP12 = PiCarServo(board.GP12)
if 'servo_GP13' not in globals(): servo_GP13 = PiCarServo(board.GP13)
_p = max(min(${percent}, 100), 0) / 100.0
_s = max(min(${speed}, 10), 1)
# Dynamic target based on hand_range: Right (0 -> range), Left (180 -> 180-range)
_target_R = int(_p * servo_GP12.hand_range)
_target_L = 180 - int(_p * servo_GP13.hand_range)
`;
  if (hand === 'BOTH') {
    code += `PiCarServo.move_sync([servo_GP12, servo_GP13], [_target_R, _target_L], _s)\n`;
  } else if (hand === 'RIGHT') {
    code += `servo_GP12.move_smooth(_target_R, _s)\n`;
  } else if (hand === 'LEFT') {
    code += `servo_GP13.move_smooth(_target_L, _s)\n`;
  }
  
  return code;
};

Blockly.Python.forBlock['mcu_car_ultrasonic'] = function(block, generator) {
  generator.definitions_['import_board'] = 'import board';
  generator.definitions_['import_digitalio'] = 'import digitalio';
  generator.definitions_['import_time'] = 'import time';

  // Inject UltrasonicHelper
  generator.definitions_['class_ultrasonic'] = `
class UltrasonicHelper:
    def __init__(self, trig_pin, echo_pin):
        self.trig = digitalio.DigitalInOut(trig_pin)
        self.trig.direction = digitalio.Direction.OUTPUT
        self.echo = digitalio.DigitalInOut(echo_pin)
        self.echo.direction = digitalio.Direction.INPUT

    def get_distance(self):
        self.trig.value = False
        time.sleep(0.000002)
        self.trig.value = True
        time.sleep(0.00001)
        self.trig.value = False
        
        # Timeout after 30ms (approx 5 meters)
        timeout = time.monotonic() + 0.03
        while not self.echo.value:
            if time.monotonic() > timeout: return -1.0
        
        start = time.monotonic_ns()
        while self.echo.value:
            if time.monotonic() > timeout: return -1.0
        end = time.monotonic_ns()
        
        return round((end - start) / 1000000 * 34.3 / 2, 2)
`;

  var trig = block.getFieldValue('TRIG');
  var echo = block.getFieldValue('ECHO');
  var trig_id = trig.replace('board.', '');
  var echo_id = echo.replace('board.', '');
  var instance_name = 'ultrasonic_' + trig_id + '_' + echo_id;

  generator.definitions_['init_' + instance_name] = `
if '${instance_name}' not in globals():
    ${instance_name} = UltrasonicHelper(${trig}, ${echo})
`;

  return [instance_name + ".get_distance()", Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['mcu_car_check_color'] = function(block, generator) {
  generator.definitions_['import_board'] = 'import board';
  generator.definitions_['import_digitalio'] = 'import digitalio';
  
  var pin = block.getFieldValue('PIN');
  var pin_id = pin.replace('board.', '');

  generator.definitions_['init_ir_d_' + pin_id] = `
if 'ir_d_${pin_id}' not in globals():
    ir_d_${pin_id} = digitalio.DigitalInOut(${pin})
    ir_d_${pin_id}.direction = digitalio.Direction.INPUT
`;

  // Maker Pi IR is 1 when Black, 0 when White.
  // We want to return 0 for Black, 1 for White to match the block label.
  return ["(0 if ir_d_" + pin_id + ".value else 1)", Blockly.Python.ORDER_CONDITIONAL];
};

Blockly.Python.forBlock['mcu_car_check_gray'] = function(block, generator) {
  generator.definitions_['import_board'] = 'import board';
  generator.definitions_['import_analogio'] = 'import analogio';
  
  var pin = block.getFieldValue('PIN');
  var pin_id = pin.replace('board.', '');

  generator.definitions_['init_ir_a_' + pin_id] = `
if 'ir_a_${pin_id}' not in globals():
    ir_a_${pin_id} = analogio.AnalogIn(${pin})
`;

  // CircuitPython 0-65535 map to 0-1023
  // piBlockly return (1023 - IR_A) where 0 is black.
  return ["(1023 - int(ir_a_" + pin_id + ".value * 1023 / 65535))", Blockly.Python.ORDER_MULTIPLICATIVE];
};

// --- Music Engine ---
const MUSIC_ENGINE_INJECT = `
class MusicEngine:
    def __init__(self, pin):
        import pwmio
        self.buzzer = pwmio.PWMOut(pin, variable_frequency=True)
        self.tempo = 120
        self.volume = 50 # Default 50%
        self.note_map = {"C":0, "CS":1, "D":2, "DS":3, "E":4, "F":5, "FS":6, "G":7, "GS":8, "A":9, "AS":10, "B":11, "R":-1}

    def get_freq(self, note, octave):
        if note == "R": return 0
        semi = self.note_map.get(note, 0)
        # A4 = 440Hz, A4 is octave 4, semi 9
        # freq = 440 * 2^((n-45)/12)
        n = octave * 12 + semi
        return int(440 * (2 ** ((n - 57) / 12)))

    def play(self, freq, duration_ms):
        if freq > 0:
            self.buzzer.frequency = freq
            # Map 0-100 to 0-32768 (0-50% Duty Cycle for volume control)
            self.buzzer.duty_cycle = int(max(min(self.volume, 100), 0) * 327.68)
        time.sleep(duration_ms / 1000)
        self.buzzer.duty_cycle = 0
        time.sleep(0.01) # Staccato gap

    def parse_and_play(self, melody_str):
        import re
        # Simplified regex for CircuitPython compatibility
        # Group 1: Note (A-G or R), Group 2: Octave (optional), Group 3: Raw Duration string
        pattern = r"([A-GR][#S]?)([0-8])?([WHQEST\._T\+]+)"
        dur_map = {"W":4.0, "H":2.0, "Q":1.0, "E":0.5, "S":0.25, "T":0.125}
        
        for part in melody_str.replace(",", " ").split():
            m = re.match(pattern, part.upper())
            if m:
                # Standardize Sharp: C# or CS -> CS
                note = m.group(1).replace("#", "S")
                octave = int(m.group(2)) if m.group(2) else 4
                
                # Parse multiple durations (Ties) manually using split
                total_dur = 0
                for d_part in m.group(3).split("+"):
                    if not d_part: continue
                    # Take first char as duration identifier
                    base_dur = dur_map.get(d_part[0], 1.0)
                    if "." in d_part: base_dur *= 1.5
                    if "_T" in d_part: base_dur *= 0.666
                    total_dur += base_dur
                
                ms = (60000 / self.tempo) * total_dur
                self.play(self.get_freq(note, octave), int(ms))
            else:
                print(f"Warning: Invalid note format '{part}'")
`;

Blockly.Python.forBlock['mcu_car_set_tempo'] = function(block, generator) {
  var bpm = generator.valueToCode(block, 'BPM', Blockly.Python.ORDER_ATOMIC) || '120';
  generator.definitions_['import_board'] = 'import board';
  generator.definitions_['import_time'] = 'import time';
  generator.definitions_['class_music_engine'] = MUSIC_ENGINE_INJECT;
  generator.definitions_['init_music'] = "if 'music' not in globals(): music = MusicEngine(board.GP22)";
  return `music.tempo = ${bpm}\n`;
};

Blockly.Python.forBlock['mcu_car_set_volume'] = function(block, generator) {
  var vol = generator.valueToCode(block, 'VOL', Blockly.Python.ORDER_ATOMIC) || '50';
  generator.definitions_['import_board'] = 'import board';
  generator.definitions_['import_time'] = 'import time';
  generator.definitions_['class_music_engine'] = MUSIC_ENGINE_INJECT;
  generator.definitions_['init_music'] = "if 'music' not in globals(): music = MusicEngine(board.GP22)";
  return `music.volume = ${vol}\n`;
};

Blockly.Python.forBlock['mcu_car_play_note'] = function(block, generator) {
  var note = block.getFieldValue('NOTE');
  var octave = block.getFieldValue('OCTAVE');
  var durRatio = block.getFieldValue('DURATION');
  var dotted = block.getFieldValue('DOTTED') === 'TRUE';
  var triplet = block.getFieldValue('TRIPLET') === 'TRUE';

  generator.definitions_['import_board'] = 'import board';
  generator.definitions_['import_time'] = 'import time';
  generator.definitions_['class_music_engine'] = MUSIC_ENGINE_INJECT;
  generator.definitions_['init_music'] = "if 'music' not in globals(): music = MusicEngine(board.GP22)";

  var code = `_dur = (60000 / music.tempo) * ${durRatio}`;
  if (dotted) code += " * 1.5";
  if (triplet) code += " * 0.666";
  return code + `\nmusic.play(music.get_freq("${note}", ${octave}), int(_dur))\n`;
};

Blockly.Python.forBlock['mcu_car_play_melody'] = function(block, generator) {
  var melody = block.getFieldValue('MELODY');
  generator.definitions_['import_board'] = 'import board';
  generator.definitions_['import_time'] = 'import time';
  generator.definitions_['class_music_engine'] = MUSIC_ENGINE_INJECT;
  generator.definitions_['init_music'] = "if 'music' not in globals(): music = MusicEngine(board.GP22)";
  return `music.parse_and_play(${JSON.stringify(melody)})\n`;
};

Blockly.Python.forBlock['mcu_car_tone'] = function(block, generator) {
  var freq = generator.valueToCode(block, 'FREQ', Blockly.Python.ORDER_ATOMIC) || '440';
  var ms = generator.valueToCode(block, 'MS', Blockly.Python.ORDER_ATOMIC) || '500';
  generator.definitions_['import_board'] = 'import board';
  generator.definitions_['import_time'] = 'import time';
  generator.definitions_['class_music_engine'] = MUSIC_ENGINE_INJECT;
  generator.definitions_['init_music'] = "if 'music' not in globals(): music = MusicEngine(board.GP22)";
  return `music.play(${freq}, ${ms})\n`;
};

Blockly.Python.forBlock['mcu_car_no_tone'] = function(block, generator) {
  generator.definitions_['init_music'] = "if 'music' not in globals(): music = MusicEngine(board.GP22)";
  return "music.buzzer.duty_cycle = 0\n";
};

Blockly.Python.forBlock['mcu_car_note_freq'] = function(block, generator) {
  var note = block.getFieldValue('NOTE');
  var octave = block.getFieldValue('OCTAVE');
  generator.definitions_['class_music_engine'] = MUSIC_ENGINE_INJECT;
  generator.definitions_['init_music'] = "if 'music' not in globals(): music = MusicEngine(board.GP22)";
  return [`music.get_freq("${note}", ${octave})`, Blockly.Python.ORDER_FUNCTION_CALL];
};

// --- NeoPixel LED ---
Blockly.Msg["CAR_SET_LED"] = "設定內建 NeoPixel 燈 %1 顏色 %2";
Blockly.Msg["CAR_LED_ALL"] = "全部";
Blockly.Msg["CAR_LED_LEFT"] = "左 (0)";
Blockly.Msg["CAR_LED_RIGHT"] = "右 (1)";

Blockly.Python.forBlock['mcu_car_set_led_color'] = function(block, generator) {
  generator.definitions_['import_board'] = 'import board';
  generator.definitions_['import_neopixel'] = 'import neopixel';
  generator.definitions_['init_np'] = "if 'np' not in globals(): np = neopixel.NeoPixel(board.GP18, 2)";
  
  var idx = block.getFieldValue('LED_INDEX');
  var color = block.getFieldValue('COLOR');
  var r = parseInt(color.substring(1, 3), 16);
  var g = parseInt(color.substring(3, 5), 16);
  var b = parseInt(color.substring(5, 7), 16);

  if (idx === 'ALL') {
    return `np.fill((${r}, ${g}, ${b}))\nnp.show()\n`;
  }
  return `np[${idx}] = (${r}, ${g}, ${b})\nnp.show()\n`;
};

Blockly.Python.forBlock['mcu_car_wait_start'] = function(block, generator) {
  generator.definitions_['import_board'] = 'import board';
  generator.definitions_['import_digitalio'] = 'import digitalio';
  generator.definitions_['import_time'] = 'import time';

  var pin = block.getFieldValue('PIN');
  var pin_id = pin.replace('board.', '');

  generator.definitions_['init_btn_' + pin_id] = `
if 'btn_${pin_id}' not in globals():
    btn_${pin_id} = digitalio.DigitalInOut(${pin})
    btn_${pin_id}.direction = digitalio.Direction.INPUT
    btn_${pin_id}.pull = digitalio.Pull.UP
`;

  return `print("${Blockly.Msg["CAR_WAIT_KEY_MSG"]}")
while btn_${pin_id}.value:
${generator.INDENT}time.sleep(0.01) ${Blockly.Msg["CAR_DEBOUNCE_COMMENT"]}
time.sleep(0.5) ${Blockly.Msg["CAR_HAND_OFF_COMMENT"]}
`;
};

Blockly.Python.forBlock['mcu_car_set_led_io'] = function(block, generator) {
  generator.definitions_['import_board'] = 'import board';
  generator.definitions_['import_digitalio'] = 'import digitalio';

  var pin_val = generator.valueToCode(block, 'PIN', Blockly.Python.ORDER_ATOMIC) || '0';
  var state = generator.valueToCode(block, 'STATE', Blockly.Python.ORDER_ATOMIC) || 'True';

  // 使用字典管理動態腳位，避免重複初始化
  generator.definitions_['init_led_map'] = "if '_LED_MAP' not in globals(): _LED_MAP = {}";

  return `
_p_id = int(${pin_val})
if _p_id not in _LED_MAP:
    _p_obj = getattr(board, f"GP{_p_id}")
    _LED_MAP[_p_id] = digitalio.DigitalInOut(_p_obj)
    _LED_MAP[_p_id].direction = digitalio.Direction.OUTPUT
_LED_MAP[_p_id].value = ${state}
`;
};

Blockly.Python.forBlock['mcu_car_button_pressed'] = function(block, generator) {
  generator.definitions_['import_board'] = 'import board';
  generator.definitions_['import_digitalio'] = 'import digitalio';

  var pin = block.getFieldValue('PIN');
  var pin_id = pin.replace('board.', '');

  // 注入初始化代碼 (上拉電阻模式)
  generator.definitions_['init_btn_' + pin_id] = `
if 'btn_${pin_id}' not in globals():
    btn_${pin_id} = digitalio.DigitalInOut(${pin})
    btn_${pin_id}.direction = digitalio.Direction.INPUT
    btn_${pin_id}.pull = digitalio.Pull.UP
`;

  // 因為是 Active Low，所以按下時 value 為 False，需取反
  return ["(not btn_" + pin_id + ".value)", Blockly.Python.ORDER_LOGICAL_NOT];
};
