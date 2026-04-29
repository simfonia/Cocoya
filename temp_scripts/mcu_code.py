import machine
import time
import random


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

if 'ultrasonic_28_7' not in globals():
    ultrasonic_28_7 = UltrasonicHelper(28, 7)

if '_random_initialized' not in globals():
    try:
        random.seed(time.ticks_us())
    except AttributeError:
        random.seed(time.monotonic_ns())
    _random_initialized = True

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




# --- MicroPython Main Program ---  # S_ID:=NJ]emz+oNaL~f(Z,1Hj
time.sleep(0.2)  # Short boot delay for serial stability
music.tempo = 120  # S_ID:;%$_`|AnT+zm23`.[f.Y  # E_ID:;%$_`|AnT+zm23`.[f.Y
music.play(440, 200)  # S_ID:L`4%Z%ua9ZHZOW;?#heL  # E_ID:L`4%Z%ua9ZHZOW;?#heL
print("等待按鍵中...")  # S_ID:E])L?x{ob~G+(v(VJQ8(
while btn_20.value():
    time.sleep(0.01)
time.sleep(0.5)  # E_ID:E])L?x{ob~G+(v(VJQ8(
# 偵測距離  # S_ID:8^%.X~h3zX5Fd(d%1vF^  # E_ID:8^%.X~h3zX5Fd(d%1vF^
while True:  # S_ID:jWxqT?]:4t;~#xxsXgjg
    distance = ultrasonic_28_7.get_distance()  # S_ID:fpeuTS]n6iSfS*:Q!s`)  # E_ID:fpeuTS]n6iSfS*:Q!s`)
    if distance <= 100 and distance > 70:  # S_ID:N?=7w;-d]nQ_Ty:xdVxB
        _dur = (60000 / music.tempo) * 1.0  # S_ID:8D$a|:cCOOj;E]G)kZr)
        music.play(music.get_freq("C", 3), int(_dur))  # E_ID:8D$a|:cCOOj;E]G)kZr)
    elif distance <= 70 and distance > 40:
        _dur = (60000 / music.tempo) * 0.5  # S_ID:|ipU{D`8vtj:db=+=Q*L
        music.play(music.get_freq("C", 4), int(_dur))  # E_ID:|ipU{D`8vtj:db=+=Q*L
    elif distance <= 40 and distance > 20:
        _dur = (60000 / music.tempo) * 0.25  # S_ID:V3VXT~V9p%)DkV9!d:d%
        music.play(music.get_freq("C", 5), int(_dur))  # E_ID:V3VXT~V9p%)DkV9!d:d%  # E_ID:N?=7w;-d]nQ_Ty:xdVxB
    if distance <= 20:  # S_ID:40@YJO^qx#BT?By!~bbp
        # 避障  # S_ID:}y^I.ZIa3Z8PRL=r+D,3  # E_ID:}y^I.ZIa3Z8PRL=r+D,3
        if 'car' in globals(): car.stop()  # S_ID:Pe6FpA;z}(R;1_0+%.Zr
        time.sleep(0.1)  # E_ID:Pe6FpA;z}(R;1_0+%.Zr
        if random.randint(1, 100) > 70:  # S_ID:):LkP]?3G5xL3L!v|!Ai
              # S_ID:o/L-jy(RbOm!S==)XogW
            if 'car' not in globals(): car = CarMotor()
            car.set_speed(0, (-50))  # E_ID:o/L-jy(RbOm!S==)XogW
        else:
              # S_ID:`!Y(C)!?7C{|i71N*T|a
            if 'car' not in globals(): car = CarMotor()
            car.set_speed((-50), 0)  # E_ID:`!Y(C)!?7C{|i71N*T|a  # E_ID:):LkP]?3G5xL3L!v|!Ai
        time.sleep(0.5)  # S_ID:`g1oU//EBWbDnm!0;U|c  # E_ID:`g1oU//EBWbDnm!0;U|c
        if 'car' in globals(): car.stop()  # S_ID:EXxfrVQVe5uNP%~uj{rI
        time.sleep(0.1)  # E_ID:EXxfrVQVe5uNP%~uj{rI
    else:
          # S_ID:6nb,i{r0*uW]_@dXLe^i
        if 'car' not in globals(): car = CarMotor()
        car.set_speed(50, 50)  # E_ID:6nb,i{r0*uW]_@dXLe^i  # E_ID:40@YJO^qx#BT?By!~bbp  # E_ID:jWxqT?]:4t;~#xxsXgjg  # E_ID:=NJ]emz+oNaL~f(Z,1Hj