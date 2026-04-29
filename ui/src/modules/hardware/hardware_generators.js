// Hardware Generators: hardware_generators.js
// Optimized for MicroPython (Machine module)

Blockly.Python.forBlock['mcu_pin_shadow'] = function(block, generator) {
  var pin = block.getFieldValue('PIN');
  return [JSON.stringify(pin), Blockly.Python.ORDER_ATOMIC];
};

Blockly.Python.forBlock['mcu_set_led'] = function(block, generator) {
  var state = block.getFieldValue('STATE');
  generator.definitions_['import_machine'] = 'import machine';
  
  // Onboard LED handling: Pico=25, XIAO S3=21. 
  // For portability, we try to use 'LED' if the firmware supports it, 
  // or default to 25 (Pico).
  generator.definitions_['init_led'] = `
# Init onboard LED
if 'led' not in globals():
    try:
        # Try 'LED' name first
        led = machine.Pin('LED', machine.Pin.OUT)
    except:
        # Fallback to Pin 25 (Pico)
        led = machine.Pin(25, machine.Pin.OUT)
`;
  return 'led.value(1 if ' + state + ' else 0)\n';
};

// --- 數位輸出 ---
Blockly.Python.forBlock['mcu_digital_write'] = function(block, generator) {
  var pin = generator.valueToCode(block, 'PIN', Blockly.Python.ORDER_ATOMIC) || '"board.GP0"';
  var state = block.getFieldValue('STATE');
  
  // 移除引號並清理
  var pinRaw = pin.replace(/['"]/g, '');
  // 支援 board.GPx -> x, board.Dx -> x (需注意 XIAO D0-D10 映射)
  var pinNum = pinRaw.replace('board.GP', '').replace('board.D', '');
  // 特殊處理 board.LED
  if (pinRaw === 'board.LED') pinNum = '25'; 
  
  var pinVar = 'pin_' + pinNum;

  generator.definitions_['import_machine'] = 'import machine';
  generator.definitions_['init_' + pinVar] = 
    pinVar + ' = machine.Pin(' + pinNum + ', machine.Pin.OUT)';

  return pinVar + '.value(1 if ' + state + ' else 0)\n';
};

// --- 數位輸入 ---
Blockly.Python.forBlock['mcu_digital_read'] = function(block, generator) {
  var pin = generator.valueToCode(block, 'PIN', Blockly.Python.ORDER_ATOMIC) || '"board.GP0"';
  
  var pinRaw = pin.replace(/['"]/g, '');
  var pinNum = pinRaw.replace('board.GP', '').replace('board.D', '');
  if (pinRaw === 'board.LED') pinNum = '25';

  var pinVar = 'pin_' + pinNum;

  generator.definitions_['import_machine'] = 'import machine';
  generator.definitions_['init_' + pinVar] = 
    pinVar + ' = machine.Pin(' + pinNum + ', machine.Pin.IN, machine.Pin.PULL_UP)';

  return [pinVar + '.value()', Blockly.Python.ORDER_ATOMIC];
};

// --- 類比輸入 ---
Blockly.Python.forBlock['mcu_analog_read'] = function(block, generator) {
  var pin = generator.valueToCode(block, 'PIN', Blockly.Python.ORDER_ATOMIC) || '"board.GP26"';
  
  var pinRaw = pin.replace(/['"]/g, '');
  var pinNum = pinRaw.replace('board.GP', '').replace('board.D', '');
  
  var pinVar = 'adc_' + pinNum;

  generator.definitions_['import_machine'] = 'import machine';
  generator.definitions_['init_' + pinVar] = 
    pinVar + ' = machine.ADC(machine.Pin(' + pinNum + '))';

  // MicroPython ADC: 0-65535
  return [pinVar + '.read_u16()', Blockly.Python.ORDER_ATOMIC];
};

// --- PWM 輸出 ---
Blockly.Python.forBlock['mcu_pwm_write'] = function(block, generator) {
  var pin = generator.valueToCode(block, 'PIN', Blockly.Python.ORDER_ATOMIC) || '"board.GP0"';
  var value = generator.valueToCode(block, 'VALUE', Blockly.Python.ORDER_ATOMIC) || '0';
  
  var pinRaw = pin.replace(/['"]/g, '');
  var pinNum = pinRaw.replace('board.GP', '').replace('board.D', '');
  
  var pinVar = 'pwm_' + pinNum;

  generator.definitions_['import_machine'] = 'import machine';
  generator.definitions_['init_' + pinVar] = 
    pinVar + ' = machine.PWM(machine.Pin(' + pinNum + '), freq=5000)';

  // 支援 0-100 轉 0-65535 的簡單偵測
  var code = 'if ' + value + ' <= 100: ' + pinVar + '.duty_u16(int(' + value + ' * 655.35))\n' +
             'else: ' + pinVar + '.duty_u16(int(' + value + '))\n';
  
  return code;
};

// --- I2C 掃描 ---
Blockly.Python.forBlock['mcu_i2c_scan'] = function(block, generator) {
  generator.definitions_['import_machine'] = 'import machine';
  generator.definitions_['init_i2c'] = `
# Init default I2C (RP2040: GP5=SCL, GP4=SDA)
if 'i2c' not in globals():
    try:
        i2c = machine.I2C(0, scl=machine.Pin(5), sda=machine.Pin(4), freq=100000)
    except:
        # Fallback for other boards
        i2c = machine.I2C(1, scl=machine.Pin(7), sda=machine.Pin(6), freq=100000)
`;
  var code = '[(hex(addr)) for addr in i2c.scan()]';
  return [code, Blockly.Python.ORDER_ATOMIC];
};

Blockly.Python.forBlock['mcu_stop_program'] = function(block, generator) {
  generator.definitions_['import_sys'] = 'import sys';
  return 'sys.exit()\n';
};

Blockly.Python.forBlock['mcu_reset'] = function(block, generator) {
  generator.definitions_['import_machine'] = 'import machine';
  return 'machine.reset()\n';
};

