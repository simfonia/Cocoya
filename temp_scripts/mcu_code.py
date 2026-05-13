import machine
import time

def lefthook():
    pass

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

if 'servo_12' not in globals(): servo_12 = PiCarServo(12)

if 'servo_13' not in globals(): servo_13 = PiCarServo(13)

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




# --- MicroPython Main Program ---  # S_ID:=NJ]emz+oNaL~f(Z,1Hj
time.sleep(0.2)  # Short boot delay for serial stability
servo_12.hand_range = 180  # S_ID:5_{ax)ZqmRkmDI]t0sF_
servo_13.hand_range = 180  # E_ID:5_{ax)ZqmRkmDI]t0sF_
servo_12.set_angle(180)  # S_ID:a5Rftj8^8}aGsxnZd5q^
servo_13.set_angle(0)  # E_ID:a5Rftj8^8}aGsxnZd5q^
music.play(440, 200)  # S_ID:L`4%Z%ua9ZHZOW;?#heL  # E_ID:L`4%Z%ua9ZHZOW;?#heL
print("等待按鍵中...")  # S_ID:E])L?x{ob~G+(v(VJQ8(
while btn_20.value():
    time.sleep(0.01)
time.sleep(0.5)  # E_ID:E])L?x{ob~G+(v(VJQ8(
while True:  # S_ID:jWxqT?]:4t;~#xxsXgjg
    _p = max(min(100, 100), 0) / 100.0  # S_ID:Z6v[Q!!au%(r];Gf4-Sb
    _s = max(min(10, 10), 1)
    _target_R = int(_p * servo_13.hand_range)
    _target_L = 180 - int(_p * servo_12.hand_range)
    servo_12.move_smooth(_target_L, _s)  # E_ID:Z6v[Q!!au%(r];Gf4-Sb
    time.sleep(1)  # S_ID:%Fg{9UsuGaZ/[IsqxPZ/  # E_ID:%Fg{9UsuGaZ/[IsqxPZ/
    _p = max(min(0, 100), 0) / 100.0  # S_ID:R:=K/eS^-gV~[)JkAf{P
    _s = max(min(10, 10), 1)
    _target_R = int(_p * servo_13.hand_range)
    _target_L = 180 - int(_p * servo_12.hand_range)
    servo_12.move_smooth(_target_L, _s)  # E_ID:R:=K/eS^-gV~[)JkAf{P
    time.sleep(1)  # S_ID:Xk({NxCkR_c`bP`3PH.7  # E_ID:Xk({NxCkR_c`bP`3PH.7  # E_ID:jWxqT?]:4t;~#xxsXgjg  # E_ID:=NJ]emz+oNaL~f(Z,1Hj