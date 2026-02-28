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
        self.m1a.duty_cycle = 0
        self.m1b.duty_cycle = 0
        self.m2a.duty_cycle = 0
        self.m2b.duty_cycle = 0
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
  return "if 'car' in globals(): car.stop()\n";
};

Blockly.Python.forBlock['mcu_car_servo'] = function(block, generator) {
  generator.definitions_['import_board'] = 'import board';
  generator.definitions_['import_pwmio'] = 'import pwmio';

  var pin = block.getFieldValue('PIN');
  var angle = generator.valueToCode(block, 'ANGLE', Blockly.Python.ORDER_ATOMIC) || '90';
  var pin_id = pin.replace('board.', '');

  generator.definitions_['init_servo_' + pin_id] = `
if 'servo_${pin_id}' not in globals():
    servo_${pin_id} = pwmio.PWMOut(${pin}, frequency=50)
`;

  var code = `
# Set Servo Angle (0-180)
if 'servo_${pin_id}' in globals():
    _angle = max(min(${angle}, 180), 0)
    # 0.5ms (1638) to 2.5ms (8192)
    _duty = int((_angle / 180 * (8192 - 1638)) + 1638)
    servo_${pin_id}.duty_cycle = _duty
`;
  return code;
};
