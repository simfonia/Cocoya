import board
import pwmio
import time
import digitalio


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

if 'ultrasonic_GP28_GP7' not in globals():
    ultrasonic_GP28_GP7 = UltrasonicHelper(board.GP28, board.GP7)

if 'ir_d_GP26' not in globals():
    ir_d_GP26 = digitalio.DigitalInOut(board.GP26)
    ir_d_GP26.direction = digitalio.Direction.INPUT




# --- MCU Main Program ---  # S_ID:=NJ]emz+oNaL~f(Z,1Hj
  # S_ID:D{b|^se.o]*`7][7Na%K
if 'servo_GP12' not in globals(): servo_GP12 = PiCarServo(board.GP12)
if 'servo_GP13' not in globals(): servo_GP13 = PiCarServo(board.GP13)
servo_GP12.set_angle(180)
servo_GP13.set_angle(0)  # E_ID:D{b|^se.o]*`7][7Na%K
while True:  # S_ID:sC#.Ys4+3Gw9PzA1Q1{{
    distance = ultrasonic_GP28_GP7.get_distance()  # S_ID:Z]Cso1]/AiWm5N9LjJ^+  # E_ID:Z]Cso1]/AiWm5N9LjJ^+
    color = '白色' if 1 == ((0 if ir_d_GP26.value else 1)) else '黑色'  # S_ID:A7^f#3c~*gCZ+=5HMZN)  # E_ID:A7^f#3c~*gCZ+=5HMZN)
    print(f"""距離: {distance}cm   地面顏色: {color}""")  # S_ID:R#BWujC#QAIBwBrEUp^#  # E_ID:R#BWujC#QAIBwBrEUp^#
    time.sleep(0.5)  # S_ID:nO8yR@jc}8MZlXgIGXvt  # E_ID:nO8yR@jc}8MZlXgIGXvt  # E_ID:sC#.Ys4+3Gw9PzA1Q1{{  # E_ID:=NJ]emz+oNaL~f(Z,1Hj