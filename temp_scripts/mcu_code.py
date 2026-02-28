import board
import digitalio
import time


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
while True:  # S_ID:sC#.Ys4+3Gw9PzA1Q1{{
    distance = ultrasonic_GP28_GP7.get_distance()  # S_ID:Z]Cso1]/AiWm5N9LjJ^+  # E_ID:Z]Cso1]/AiWm5N9LjJ^+
    color = '白色' if 1 == ((0 if ir_d_GP26.value else 1)) else '黑色'  # S_ID:A7^f#3c~*gCZ+=5HMZN)  # E_ID:A7^f#3c~*gCZ+=5HMZN)
    print(f"""距離: {distance}cm   地面顏色: {color}""")  # S_ID:R#BWujC#QAIBwBrEUp^#  # E_ID:R#BWujC#QAIBwBrEUp^#
    time.sleep(0.5)  # S_ID:nO8yR@jc}8MZlXgIGXvt  # E_ID:nO8yR@jc}8MZlXgIGXvt  # E_ID:sC#.Ys4+3Gw9PzA1Q1{{  # E_ID:=NJ]emz+oNaL~f(Z,1Hj