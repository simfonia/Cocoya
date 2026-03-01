import board
import pwmio
import time
import digitalio
import microcontroller

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

if 'btn_GP20' not in globals():
    btn_GP20 = digitalio.DigitalInOut(board.GP20)
    btn_GP20.direction = digitalio.Direction.INPUT
    btn_GP20.pull = digitalio.Pull.UP




# --- MCU Main Program ---  # S_ID:=NJ]emz+oNaL~f(Z,1Hj
PiCarServo._TRIM["GP12"] = (420, 2470)  # S_ID:{pi/Ag/fvG8rBoD-JVj)
if 'servo_GP12' in globals(): servo_GP12.min_us, servo_GP12.max_us = 420, 2470  # E_ID:{pi/Ag/fvG8rBoD-JVj)
PiCarServo._TRIM["GP12"] = (460, 2410)  # S_ID:]#tGU:@Mq_dbKq@@CKYG
if 'servo_GP12' in globals(): servo_GP12.min_us, servo_GP12.max_us = 460, 2410  # E_ID:]#tGU:@Mq_dbKq@@CKYG
  # S_ID:$;z.SSr-/a8]y-@WBX}h
if 'servo_GP12' not in globals(): servo_GP12 = PiCarServo(board.GP12)
if 'servo_GP13' not in globals(): servo_GP13 = PiCarServo(board.GP13)
servo_GP12.hand_range = 90
servo_GP13.hand_range = 90  # E_ID:$;z.SSr-/a8]y-@WBX}h
  # S_ID:O4:;`]})dce3H*y{v0!c
if 'servo_GP12' not in globals(): servo_GP12 = PiCarServo(board.GP12)
if 'servo_GP13' not in globals(): servo_GP13 = PiCarServo(board.GP13)
servo_GP12.set_angle(0)
servo_GP13.set_angle(180)  # E_ID:O4:;`]})dce3H*y{v0!c
time.sleep(1)  # S_ID:qJc2)bb{5(m),hd;M5l[  # E_ID:qJc2)bb{5(m),hd;M5l[
print("等待按鍵中...")  # S_ID:i2mz=+#bFA9+kZEdSU4{
while btn_GP20.value:
    time.sleep(0.01) # 防彈跳並避免空迴圈高速運轉讓CPU滿載
time.sleep(0.5) # 讓手離開  # E_ID:i2mz=+#bFA9+kZEdSU4{
  # S_ID:/QTJJqqx?$87zRmx:4un
if 'servo_GP12' not in globals(): servo_GP12 = PiCarServo(board.GP12)
if 'servo_GP13' not in globals(): servo_GP13 = PiCarServo(board.GP13)
_p = max(min(50, 100), 0) / 100.0
_s = max(min(10, 10), 1)
# Dynamic target based on hand_range: Right (0 -> range), Left (180 -> 180-range)
_target_R = int(_p * servo_GP12.hand_range)
_target_L = 180 - int(_p * servo_GP13.hand_range)
PiCarServo.move_sync([servo_GP12, servo_GP13], [_target_R, _target_L], _s)  # E_ID:/QTJJqqx?$87zRmx:4un
  # S_ID:4Mml;_i/wf-n_Db4m*3`
if 'servo_GP12' not in globals(): servo_GP12 = PiCarServo(board.GP12)
if 'servo_GP13' not in globals(): servo_GP13 = PiCarServo(board.GP13)
_p = max(min(0, 100), 0) / 100.0
_s = max(min(5, 10), 1)
# Dynamic target based on hand_range: Right (0 -> range), Left (180 -> 180-range)
_target_R = int(_p * servo_GP12.hand_range)
_target_L = 180 - int(_p * servo_GP13.hand_range)
PiCarServo.move_sync([servo_GP12, servo_GP13], [_target_R, _target_L], _s)  # E_ID:4Mml;_i/wf-n_Db4m*3`
microcontroller.reset()  # S_ID:tc)0K~4N+CbLxmPqWA^f  # E_ID:tc)0K~4N+CbLxmPqWA^f  # E_ID:=NJ]emz+oNaL~f(Z,1Hj