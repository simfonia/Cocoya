import sys
import uselect
import machine
import time


_cocoya_serial_buf = ""
def cocoya_get_latest_serial():
    # MicroPython 讀取 stdin，排空至最新一筆
    # 這裡需要非阻塞讀取，通常透過 select 或 poll 實作
    global _cocoya_serial_buf
    latest = ""
    poll = uselect.poll()
    poll.register(sys.stdin, uselect.POLLIN)
    while poll.poll(0):
        ch = sys.stdin.read(1)
        if ch == '\n':
            if _cocoya_serial_buf:
                latest = _cocoya_serial_buf.strip()
            _cocoya_serial_buf = ""
        else:
            _cocoya_serial_buf += ch
    return latest

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


# Serial initialized via REPL (default)  # S_ID:kI/.N1;]+Q~]iA@S%-Fc  # E_ID:kI/.N1;]+Q~]iA@S%-Fc  # S_ID:def_root  # E_ID:def_root

# --- MicroPython Main Program ---  # S_ID:main_root
time.sleep(0.2)  # Short boot delay for serial stability
while True:  # S_ID:D_Rt)Ya5?|^hd|8p=n/l
    gesture_data = cocoya_get_latest_serial()  # S_ID:bTUn,=@Iy}tdCK3Ff?(A  # E_ID:bTUn,=@Iy}tdCK3Ff?(A
    if gesture_data != '':  # S_ID:h$Auh?:kSG?hQ,F@qS~.
        if gesture_data == 'rock':  # S_ID:}ey{Nh(-2,@s23;ZK93_
            _dur = (60000 / music.tempo) * 1.0  # S_ID:)X/Wo??nrysL!B!+^g.b
            music.play(music.get_freq("C", 4), int(_dur))  # E_ID:)X/Wo??nrysL!B!+^g.b
        elif gesture_data == 'scissors':
            _dur = (60000 / music.tempo) * 1.0  # S_ID:)Eam!:jNDckMJSCA8=KS
            music.play(music.get_freq("E", 4), int(_dur))  # E_ID:)Eam!:jNDckMJSCA8=KS
        elif gesture_data == 'paper':
            _dur = (60000 / music.tempo) * 1.0  # S_ID:3b(=vaa^{!lNb6Odf|w.
            music.play(music.get_freq("G", 4), int(_dur))  # E_ID:3b(=vaa^{!lNb6Odf|w.
        else:
            music.buzzer.duty_u16(0)  # S_ID:{uFzc/?Br[%$j(DRynkU  # E_ID:{uFzc/?Br[%$j(DRynkU  # E_ID:}ey{Nh(-2,@s23;ZK93_  # E_ID:h$Auh?:kSG?hQ,F@qS~.  # E_ID:D_Rt)Ya5?|^hd|8p=n/l  # E_ID:main_root