import machine
import time

class PiCarServo:
    _CONFIG = {} # pin: (min_us, max_us, max_angle, offset)

    def __init__(self, pin_num, min_us=460, max_us=2400, max_angle=180, offset=0):
        self.pwm = machine.PWM(machine.Pin(pin_num), freq=50)
        self.pin_num = pin_num
        self.update_config(min_us, max_us, max_angle, offset)
        self.current_angle = self.max_angle
        self.hand_range = 180

    def update_config(self, min_us, max_us, max_angle, offset):
        self.min_us = max(min(min_us, 2600), 400)
        self.max_us = max(min(max_us, 2600), 400)
        self.max_angle = max(min(max_angle, 360), 90)
        self.offset = offset
        PiCarServo._CONFIG[self.pin_num] = (self.min_us, self.max_us, self.max_angle, self.offset)

    def set_angle(self, angle, is_car_action=False):
        _conf = PiCarServo._CONFIG.get(self.pin_num, (self.min_us, self.max_us, self.max_angle, self.offset))
        min_u, max_u, max_ang, off_v = _conf

        # 物理限位：永遠不得超過該舵機型號的物理極限 (如 180 或 270)
        angle = max(min(angle, max_ang), 0)

        self.current_angle = angle
        # 套用角度微調 (Offset)
        final_angle = angle + off_v
        us = min_u + (final_angle / max_ang * (max_u - min_u))
        self.pwm.duty_u16(int(us / 20000 * 65535))

    def move_smooth(self, target_angle, speed, is_car_action=False):
        PiCarServo.move_sync([self], [target_angle], speed, is_car_action)

    @staticmethod
    def move_sync(servos, targets, speed, is_car_action=False):
        if speed >= 10:
            for i in range(len(servos)):
                servos[i].set_angle(targets[i], is_car_action)
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
                    s.set_angle(s.current_angle + step, is_car_action)
                    moving = True
            if moving: time.sleep(delay)

def lefthook():
    if 'servo_12' not in globals(): globals()['servo_12'] = PiCarServo(12, 460, 2400, 180)  # S_ID:6pEWMpO=BE#dmy3?,TW;
    servo_12 = globals()['servo_12']
    if 'servo_13' not in globals(): globals()['servo_13'] = PiCarServo(13, 460, 2400, 180)
    servo_13 = globals()['servo_13']
    _p = max(min(100, 100), 0) / 100.0
    _s = max(min(10, 10), 1)
    # 歸位基準點 (張開位)
    _home_R = int((servo_13.max_angle - 180) / 2)
    _home_L = servo_12.max_angle - _home_R
    # 以歸位點為起點旋出並進行「目標安全截斷」，防止平滑移動死鎖
    _target_R = max(0, min(_home_R + int(_p * servo_13.hand_range), servo_13.max_angle))
    _target_L = max(0, min(_home_L - int(_p * servo_12.hand_range), servo_12.max_angle))
    PiCarServo.move_sync([servo_12, servo_13], [_target_L, _target_R], _s, is_car_action=True)  # E_ID:6pEWMpO=BE#dmy3?,TW;
    time.sleep(1)  # S_ID:Y(FT(^[:ls`rpELD%_fu  # E_ID:Y(FT(^[:ls`rpELD%_fu
    if 'servo_12' not in globals(): globals()['servo_12'] = PiCarServo(12, 460, 2400, 180)  # S_ID:TIF+f:+e{.7As2P)Elf_
    servo_12 = globals()['servo_12']
    if 'servo_13' not in globals(): globals()['servo_13'] = PiCarServo(13, 460, 2400, 180)
    servo_13 = globals()['servo_13']
    _p = max(min(0, 100), 0) / 100.0
    _s = max(min(10, 10), 1)
    # 歸位基準點 (張開位)
    _home_R = int((servo_13.max_angle - 180) / 2)
    _home_L = servo_12.max_angle - _home_R
    # 以歸位點為起點旋出並進行「目標安全截斷」，防止平滑移動死鎖
    _target_R = max(0, min(_home_R + int(_p * servo_13.hand_range), servo_13.max_angle))
    _target_L = max(0, min(_home_L - int(_p * servo_12.hand_range), servo_12.max_angle))
    PiCarServo.move_sync([servo_12, servo_13], [_target_L, _target_R], _s, is_car_action=True)  # E_ID:TIF+f:+e{.7As2P)Elf_
    time.sleep(1)  # S_ID:JPJ^1)+|%~%Bj@2`X5Zk  # E_ID:JPJ^1)+|%~%Bj@2`X5Zk

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
        pattern = r"([A-GR][#S]?)([0-8])?([WHQEST._T+]+)"
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

if 'music' not in globals(): music = MusicEngine(22)

if 'btn_20' not in globals():
    btn_20 = machine.Pin(20, machine.Pin.IN, machine.Pin.PULL_UP)




# --- MicroPython Main Program ---  # S_ID:R|7yNB}?C3U67yOUlwUK
time.sleep(0.2)  # Short boot delay for serial stability
if 'servo_12' not in globals(): globals()['servo_12'] = PiCarServo(12, 460, 2400, 180)  # S_ID:QdfdSzUGA1uXt_EQkSA;
servo_12 = globals()['servo_12']
if 'servo_13' not in globals(): globals()['servo_13'] = PiCarServo(13, 460, 2400, 180)
servo_13 = globals()['servo_13']
servo_12.hand_range = 180
servo_13.hand_range = 180  # E_ID:QdfdSzUGA1uXt_EQkSA;
  # S_ID:W7aT@ecBhiL3$FsJ?l0#
if 'servo_12' not in globals(): globals()['servo_12'] = PiCarServo(12, 460, 2400, 180)
servo_12 = globals()['servo_12']
if 'servo_13' not in globals(): globals()['servo_13'] = PiCarServo(13, 460, 2400, 180)
servo_13 = globals()['servo_13']
# 歸位點：鎖定張開位置 (SG90->0/180; GEEK->45/225)，不受 hand_range 影響
_home_R = int((servo_13.max_angle - 180) / 2)
_home_L = servo_12.max_angle - _home_R
servo_12.set_angle(_home_L, is_car_action=True)
servo_13.set_angle(_home_R, is_car_action=True)  # E_ID:W7aT@ecBhiL3$FsJ?l0#
music.play(440, 200)  # S_ID:dly{{MjQ7bw)fA{8{G]=  # E_ID:dly{{MjQ7bw)fA{8{G]=
print("等待按鍵中...")  # S_ID:Hgqrp_|[C_N=}i?.]qx,
while btn_20.value():
    time.sleep(0.01)
time.sleep(0.5)  # E_ID:Hgqrp_|[C_N=}i?.]qx,
while True:  # S_ID:|s/Wn]^GaG@q}B3ua%x~
    lefthook()  # S_ID:RHD3DPuQ`q8!=}JdxcE!  # E_ID:RHD3DPuQ`q8!=}JdxcE!  # E_ID:|s/Wn]^GaG@q}B3ua%x~  # E_ID:R|7yNB}?C3U67yOUlwUK