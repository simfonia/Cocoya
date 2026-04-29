// mcu_car_generators.js
// Optimized for MicroPython (Machine module)

Blockly.Python.forBlock['mcu_car_motor'] = function(block, generator) {
  generator.definitions_['import_machine'] = 'import machine';

  generator.definitions_['class_car_motor'] = `
class CarMotor:
    def __init__(self):
        # Maker Pi RP2040 Motor Pins (GP8, GP9, GP10, GP11)
        self.m1a = machine.PWM(machine.Pin(8), freq=1000)
        self.m1b = machine.PWM(machine.Pin(9), freq=1000)
        self.m2a = machine.PWM(machine.Pin(10), freq=1000)
        self.m2b = machine.PWM(machine.Pin(11), freq=1000)

    def set_speed(self, left, right):
        # Left Motor (M1)
        l = max(min(left, 100), -100)
        if l >= 0:
            self.m1a.duty_u16(int(l * 655.35))
            self.m1b.duty_u16(0)
        else:
            self.m1a.duty_u16(0)
            self.m1b.duty_u16(int(-l * 655.35))
        
        # Right Motor (M2)
        r = max(min(right, 100), -100)
        if r >= 0:
            self.m2a.duty_u16(int(r * 655.35))
            self.m2b.duty_u16(0)
        else:
            self.m2a.duty_u16(0)
            self.m2b.duty_u16(int(-r * 655.35))

    def stop(self):
        self.m1a.duty_u16(0)
        self.m1b.duty_u16(0)
        self.m2a.duty_u16(0)
        self.m2b.duty_u16(0)

    def coast(self):
        self.m1a.duty_u16(65535)
        self.m1b.duty_u16(65535)
        self.m2a.duty_u16(65535)
        self.m2b.duty_u16(65535)
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
    return `if 'car' in globals(): car.coast()\ntime.sleep(0.01)\n`;
  } else {
    return `if 'car' in globals(): car.stop()\ntime.sleep(0.1)\n`;
  }
};

// --- Servo Helper Injection (MicroPython) ---
var SERVO_CLASS_INJECT = `
class PiCarServo:
    _TRIM = {} 

    def __init__(self, pin_num, min_us=460, max_us=2400):
        self.pwm = machine.PWM(machine.Pin(pin_num), freq=50)
        self.pin_num = pin_num
        _m1, _m2 = self._TRIM.get(pin_num, (min_us, max_us))
        self.min_us = max(min(_m1, 2600), 400)
        self.max_us = max(min(_m2, 2600), 400)
        self.current_angle = 90
        self.hand_range = 180

    def set_angle(self, angle):
        angle = max(min(angle, 180), 0)
        self.current_angle = angle
        _m1, _m2 = self._TRIM.get(self.pin_num, (self.min_us, self.max_us))
        min_u = max(min(_m1, 2600), 400)
        max_u = max(min(_m2, 2600), 400)
        
        us = min_u + (angle / 180 * (max_u - min_u))
        # MicroPython duty_u16: us / 20000 * 65535
        self.pwm.duty_u16(int(us / 20000 * 65535))

    def move_smooth(self, target_angle, speed):
        PiCarServo.move_sync([self], [target_angle], speed)

    @staticmethod
    def move_sync(servos, targets, speed):
        if speed >= 10:
            for i in range(len(servos)):
                servos[i].set_angle(targets[i])
            return
        delay = (10 - max(min(speed, 9), 1)) * 0.011
        moving = True
        while moving:
            moving = False
            for i in range(len(servos)):
                s = servos[i]
                t = targets[i]
                if s.current_angle != t:
                    step = 1 if t > s.current_angle else -1
                    s.set_angle(s.current_angle + step)
                    moving = True
            if moving: time.sleep(delay)
`;

Blockly.Python.forBlock['mcu_car_servo'] = function(block, generator) {
  generator.definitions_['import_machine'] = 'import machine';
  generator.definitions_['import_time'] = 'import time';
  generator.definitions_['class_picar_servo'] = SERVO_CLASS_INJECT;

  var pin_str = block.getFieldValue('PIN'); // "board.GP12"
  var pin_num = pin_str.replace('board.GP', '');
  var angle = generator.valueToCode(block, 'ANGLE', Blockly.Python.ORDER_ATOMIC) || '90';

  generator.definitions_['init_servo_' + pin_num] = `
if 'servo_${pin_num}' not in globals():
    servo_${pin_num} = PiCarServo(${pin_num})
`;

  return `servo_${pin_num}.set_angle(${angle})\n`;
};

Blockly.Python.forBlock['mcu_car_servo_setup'] = function(block, generator) {
  generator.definitions_['class_picar_servo'] = SERVO_CLASS_INJECT;
  
  var hand_str = block.getFieldValue('HAND'); // "board.GP12"
  var pin_num = hand_str.replace('board.GP', '');
  var min = block.getFieldValue('MIN') || '460';
  var max = block.getFieldValue('MAX') || '2400';
  
  var code = `PiCarServo._TRIM[${pin_num}] = (${min}, ${max})\n`;
  code += `if 'servo_${pin_num}' in globals(): servo_${pin_num}.min_us, servo_${pin_num}.max_us = ${min}, ${max}\n`;
  
  return code;
};

Blockly.Python.forBlock['mcu_car_hand_range'] = function(block, generator) {
  generator.definitions_['class_picar_servo'] = SERVO_CLASS_INJECT;
  var range = generator.valueToCode(block, 'RANGE', Blockly.Python.ORDER_ATOMIC) || '180';
  return `
if 'servo_12' not in globals(): servo_12 = PiCarServo(12)
if 'servo_13' not in globals(): servo_13 = PiCarServo(13)
servo_12.hand_range = ${range}
servo_13.hand_range = ${range}
`;
};

Blockly.Python.forBlock['mcu_car_in_position'] = function(block, generator) {
  generator.definitions_['import_machine'] = 'import machine';
  generator.definitions_['class_picar_servo'] = SERVO_CLASS_INJECT;
  var code = `
if 'servo_12' not in globals(): servo_12 = PiCarServo(12)
if 'servo_13' not in globals(): servo_13 = PiCarServo(13)
servo_12.set_angle(180)
servo_13.set_angle(0)
`;
  return code;
};

Blockly.Python.forBlock['mcu_car_move_hands'] = function(block, generator) {
  var hand = block.getFieldValue('HAND');
  var percent = generator.valueToCode(block, 'PERCENT', Blockly.Python.ORDER_ATOMIC) || '50';
  var speed = generator.valueToCode(block, 'SPEED', Blockly.Python.ORDER_ATOMIC) || '8';
  
  generator.definitions_['import_machine'] = 'import machine';
  generator.definitions_['import_time'] = 'import time';
  generator.definitions_['class_picar_servo'] = SERVO_CLASS_INJECT;

  var code = `
if 'servo_12' not in globals(): servo_12 = PiCarServo(12)
if 'servo_13' not in globals(): servo_13 = PiCarServo(13)
_p = max(min(${percent}, 100), 0) / 100.0
_s = max(min(${speed}, 10), 1)
_target_R = int(_p * servo_13.hand_range)
_target_L = 180 - int(_p * servo_12.hand_range)
`;
  if (hand === 'BOTH') {
    code += `PiCarServo.move_sync([servo_12, servo_13], [_target_L, _target_R], _s)\n`;
  } else if (hand === 'RIGHT') {
    code += `servo_13.move_smooth(_target_R, _s)\n`;
  } else if (hand === 'LEFT') {
    code += `servo_12.move_smooth(_target_L, _s)\n`;
  }
  
  return code;
};

Blockly.Python.forBlock['mcu_car_ultrasonic'] = function(block, generator) {
  generator.definitions_['import_machine'] = 'import machine';
  generator.definitions_['import_time'] = 'import time';

  generator.definitions_['class_ultrasonic'] = `
class UltrasonicHelper:
    def __init__(self, trig_pin, echo_pin):
        self.trig = machine.Pin(trig_pin, machine.Pin.OUT)
        self.echo = machine.Pin(echo_pin, machine.Pin.IN)

    def get_distance(self):
        time.sleep_ms(20)  # Wait for sensor to settle
        self.trig.low()
        time.sleep_us(2)
        self.trig.high()
        time.sleep_us(10)
        self.trig.low()
        
        # machine.time_pulse_us returns duration in microseconds
        try:
            pulse_time = machine.time_pulse_us(self.echo, 1, 30000)
            if pulse_time < 0: return 10000
            return round(pulse_time * 0.0343 / 2, 2)
        except:
            return 10000
`;

  var trig_str = block.getFieldValue('TRIG');
  var echo_str = block.getFieldValue('ECHO');
  var trig_num = trig_str.replace('board.GP', '');
  var echo_num = echo_str.replace('board.GP', '');
  var instance_name = 'ultrasonic_' + trig_num + '_' + echo_num;

  generator.definitions_['init_' + instance_name] = `
if '${instance_name}' not in globals():
    ${instance_name} = UltrasonicHelper(${trig_num}, ${echo_num})
`;

  return [instance_name + ".get_distance()", Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['mcu_car_check_color'] = function(block, generator) {
  generator.definitions_['import_machine'] = 'import machine';
  generator.definitions_['import_time'] = 'import time';

  var pin_str = block.getFieldValue('PIN');
  var pin_num = pin_str.replace('board.GP', '');
  var irVar = 'ir_d_' + pin_num;

  generator.definitions_['init_' + irVar] = 
    "if '" + irVar + "' not in globals():\n" +
    "    " + irVar + " = machine.Pin(" + pin_num + ", machine.Pin.IN, machine.Pin.PULL_UP)";

  var code = "(time.sleep_ms(1) or (0 if " + irVar + ".value() else 1))";
  return [code, 6]; 
};

Blockly.Python.forBlock['mcu_car_check_gray'] = function(block, generator) {
  generator.definitions_['import_machine'] = 'import machine';
  generator.definitions_['import_time'] = 'import time';

  var pin_str = block.getFieldValue('PIN');
  var pin_num = pin_str.replace('board.GP', '');
  var irVar = 'ir_a_' + pin_num;

  generator.definitions_['init_' + irVar] = 
    "if '" + irVar + "' not in globals():\n" +
    "    " + irVar + " = machine.ADC(machine.Pin(" + pin_num + "))";

  // MicroPython ADC is 0-65535, map to 0-1023
  var code = "(time.sleep_ms(1) or (1023 - int(" + irVar + ".read_u16() * 1023 / 65535)))";
  return [code, 6];
};

const MUSIC_ENGINE_INJECT = `
class MusicEngine:
    def __init__(self, pin_num):
        self.buzzer = machine.PWM(machine.Pin(pin_num))
        self.tempo = 120
        self.volume = 50 
        self.note_map = {"C":0, "CS":1, "D":2, "DS":3, "E":4, "F":5, "FS":6, "G":7, "GS":8, "A":9, "AS":10, "B":11, "R":-1}

    def get_freq(self, note, octave):
        if note == "R": return 0
        semi = self.note_map.get(note, 0)
        n = octave * 12 + semi
        return int(440 * (2 ** ((n - 57) / 12)))

    def play(self, freq, duration_ms):
        if freq > 0:
            self.buzzer.freq(freq)
            # Map 0-100 to 0-32768
            self.buzzer.duty_u16(int(max(min(self.volume, 100), 0) * 327.68))
        time.sleep_ms(duration_ms)
        self.buzzer.duty_u16(0)
        time.sleep_ms(10) 

    def parse_and_play(self, melody_str):
        import re
        pattern = r"([A-GR][#S]?)([0-8])?([WHQEST\._T\+]+)"
        dur_map = {"W":4.0, "H":2.0, "Q":1.0, "E":0.5, "S":0.25, "T":0.125}
        for part in melody_str.replace(",", " ").split():
            m = re.match(pattern, part.upper())
            if m:
                note = m.group(1).replace("#", "S")
                octave = int(m.group(2)) if m.group(2) else 4
                total_dur = 0
                for d_part in m.group(3).split("+"):
                    if not d_part: continue
                    base_dur = dur_map.get(d_part[0], 1.0)
                    if "." in d_part: base_dur *= 1.5
                    if "_T" in d_part: base_dur *= 0.666
                    total_dur += base_dur
                ms = (60000 / self.tempo) * total_dur
                self.play(self.get_freq(note, octave), int(ms))
`;

Blockly.Python.forBlock['mcu_car_set_tempo'] = function(block, generator) {
  var bpm = generator.valueToCode(block, 'BPM', Blockly.Python.ORDER_ATOMIC) || '120';
  generator.definitions_['import_machine'] = 'import machine';
  generator.definitions_['import_time'] = 'import time';
  generator.definitions_['class_music_engine'] = MUSIC_ENGINE_INJECT;
  generator.definitions_['init_music'] = "if 'music' not in globals(): music = MusicEngine(22)";
  return `music.tempo = ${bpm}\n`;
};

Blockly.Python.forBlock['mcu_car_set_volume'] = function(block, generator) {
  var vol = generator.valueToCode(block, 'VOL', Blockly.Python.ORDER_ATOMIC) || '50';
  generator.definitions_['import_machine'] = 'import machine';
  generator.definitions_['import_time'] = 'import time';
  generator.definitions_['class_music_engine'] = MUSIC_ENGINE_INJECT;
  generator.definitions_['init_music'] = "if 'music' not in globals(): music = MusicEngine(22)";
  return `music.volume = ${vol}\n`;
};

Blockly.Python.forBlock['mcu_car_play_note'] = function(block, generator) {
  var note = block.getFieldValue('NOTE');
  var octave = block.getFieldValue('OCTAVE');
  var durRatio = block.getFieldValue('DURATION');
  var dotted = block.getFieldValue('DOTTED') === 'TRUE';
  var triplet = block.getFieldValue('TRIPLET') === 'TRUE';

  generator.definitions_['import_machine'] = 'import machine';
  generator.definitions_['import_time'] = 'import time';
  generator.definitions_['class_music_engine'] = MUSIC_ENGINE_INJECT;
  generator.definitions_['init_music'] = "if 'music' not in globals(): music = MusicEngine(22)";

  var code = `_dur = (60000 / music.tempo) * ${durRatio}`;
  if (dotted) code += " * 1.5";
  if (triplet) code += " * 0.666";
  return code + `\nmusic.play(music.get_freq("${note}", ${octave}), int(_dur))\n`;
};

Blockly.Python.forBlock['mcu_car_play_melody'] = function(block, generator) {
  var melody = block.getFieldValue('MELODY');
  generator.definitions_['import_machine'] = 'import machine';
  generator.definitions_['import_time'] = 'import time';
  generator.definitions_['class_music_engine'] = MUSIC_ENGINE_INJECT;
  generator.definitions_['init_music'] = "if 'music' not in globals(): music = MusicEngine(22)";
  return `music.parse_and_play(${JSON.stringify(melody)})\n`;
};

Blockly.Python.forBlock['mcu_car_tone'] = function(block, generator) {
  var freq = generator.valueToCode(block, 'FREQ', Blockly.Python.ORDER_ATOMIC) || '440';
  var ms = generator.valueToCode(block, 'MS', Blockly.Python.ORDER_ATOMIC) || '500';
  generator.definitions_['import_machine'] = 'import machine';
  generator.definitions_['import_time'] = 'import time';
  generator.definitions_['class_music_engine'] = MUSIC_ENGINE_INJECT;
  generator.definitions_['init_music'] = "if 'music' not in globals(): music = MusicEngine(22)";
  return `music.play(${freq}, ${ms})\n`;
};

Blockly.Python.forBlock['mcu_car_no_tone'] = function(block, generator) {
  generator.definitions_['init_music'] = "if 'music' not in globals(): music = MusicEngine(22)";
  return "music.buzzer.duty_u16(0)\n";
};

Blockly.Python.forBlock['mcu_car_note_freq'] = function(block, generator) {
  var note = block.getFieldValue('NOTE');
  var octave = block.getFieldValue('OCTAVE');
  generator.definitions_['class_music_engine'] = MUSIC_ENGINE_INJECT;
  generator.definitions_['init_music'] = "if 'music' not in globals(): music = MusicEngine(22)";
  return [`music.get_freq("${note}", ${octave})`, Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['mcu_car_set_led_color'] = function(block, generator) {
  generator.definitions_['import_machine'] = 'import machine';
  generator.definitions_['import_neopixel'] = 'import neopixel';
  generator.definitions_['init_np'] = "if 'np' not in globals(): np = neopixel.NeoPixel(machine.Pin(18), 2)";
  
  var idx = block.getFieldValue('LED_INDEX');
  var color = block.getFieldValue('COLOR');
  var r = parseInt(color.substring(1, 3), 16);
  var g = parseInt(color.substring(3, 5), 16);
  var b = parseInt(color.substring(5, 7), 16);

  if (idx === 'ALL') {
    return `np.fill((${r}, ${g}, ${b}))\nnp.write()\n`;
  }
  return `np[${idx}] = (${r}, ${g}, ${b})\nnp.write()\n`;
};

Blockly.Python.forBlock['mcu_car_wait_start'] = function(block, generator) {
  generator.definitions_['import_machine'] = 'import machine';
  generator.definitions_['import_time'] = 'import time';

  var pin_str = block.getFieldValue('PIN');
  var pin_num = pin_str.replace('board.GP', '');

  generator.definitions_['init_btn_' + pin_num] = `
if 'btn_${pin_num}' not in globals():
    btn_${pin_num} = machine.Pin(${pin_num}, machine.Pin.IN, machine.Pin.PULL_UP)
`;

  return `print("${Blockly.Msg["CAR_WAIT_KEY_MSG"]}")
while btn_${pin_num}.value():
    time.sleep(0.01)
time.sleep(0.5)
`;
};

Blockly.Python.forBlock['mcu_car_set_led_io'] = function(block, generator) {
  generator.definitions_['import_machine'] = 'import machine';
  var pin_val = generator.valueToCode(block, 'PIN', Blockly.Python.ORDER_ATOMIC) || '0';
  var state = generator.valueToCode(block, 'STATE', Blockly.Python.ORDER_ATOMIC) || 'True';
  generator.definitions_['init_led_map'] = "if '_LED_MAP' not in globals(): _LED_MAP = {}";

  return `
_p_id = int(${pin_val})
if _p_id not in _LED_MAP:
    _LED_MAP[_p_id] = machine.Pin(_p_id, machine.Pin.OUT)
_LED_MAP[_p_id].value(1 if ${state} else 0)
`;
};

Blockly.Python.forBlock['mcu_car_button_pressed'] = function(block, generator) {
  generator.definitions_['import_machine'] = 'import machine';
  var pin_str = block.getFieldValue('PIN');
  var pin_num = pin_str.replace('board.GP', '');

  generator.definitions_['init_btn_' + pin_num] = `
if 'btn_${pin_num}' not in globals():
    btn_${pin_num} = machine.Pin(${pin_num}, machine.Pin.IN, machine.Pin.PULL_UP)
`;

  return ["(not btn_" + pin_num + ".value())", Blockly.Python.ORDER_LOGICAL_NOT];
};
