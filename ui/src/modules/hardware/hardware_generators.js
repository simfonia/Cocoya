// Hardware Generators: hardware_generators.js

Blockly.Python.forBlock['mcu_pin_shadow'] = function(block, generator) {
  var pin = block.getFieldValue('PIN');
  return [JSON.stringify(pin), Blockly.Python.ORDER_ATOMIC];
};

Blockly.Python.forBlock['mcu_set_led'] = function(block, generator) {
  var state = block.getFieldValue('STATE');
  generator.definitions_['import_board'] = 'import board';
  generator.definitions_['import_digitalio'] = 'import digitalio';
  generator.definitions_['init_led'] = `
# Init onboard LED
try:
    if 'led' not in globals():
        led = digitalio.DigitalInOut(board.LED)
        led.direction = digitalio.Direction.OUTPUT
except:
    pass
`;
  return 'if "led" in globals(): led.value = ' + state + '\n';
};

// --- 數位輸出 ---
Blockly.Python.forBlock['mcu_digital_write'] = function(block, generator) {
  var pin = generator.valueToCode(block, 'PIN', Blockly.Python.ORDER_ATOMIC) || '"board.GP0"';
  var state = block.getFieldValue('STATE');
  
  // 移除引號並清理
  var pinRaw = pin.replace(/['"]/g, '');
  var pinVar = 'pin_' + pinRaw.replace(/\./g, '_');

  generator.definitions_['import_board'] = 'import board';
  generator.definitions_['import_digitalio'] = 'import digitalio';
  generator.definitions_['init_' + pinVar] = 
    pinVar + ' = digitalio.DigitalInOut(' + pinRaw + ')\n' +
    pinVar + '.direction = digitalio.Direction.OUTPUT';

  return pinVar + '.value = ' + state + '\n';
};

// --- 數位輸入 ---
Blockly.Python.forBlock['mcu_digital_read'] = function(block, generator) {
  var pin = generator.valueToCode(block, 'PIN', Blockly.Python.ORDER_ATOMIC) || '"board.GP0"';
  
  var pinRaw = pin.replace(/['"]/g, '');
  var pinVar = 'pin_' + pinRaw.replace(/\./g, '_');

  generator.definitions_['import_board'] = 'import board';
  generator.definitions_['import_digitalio'] = 'import digitalio';
  generator.definitions_['init_' + pinVar] = 
    pinVar + ' = digitalio.DigitalInOut(' + pinRaw + ')\n' +
    pinVar + '.direction = digitalio.Direction.INPUT';

  return [pinVar + '.value', Blockly.Python.ORDER_ATOMIC];
};

// --- 類比輸入 ---
Blockly.Python.forBlock['mcu_analog_read'] = function(block, generator) {
  var pin = generator.valueToCode(block, 'PIN', Blockly.Python.ORDER_ATOMIC) || '"board.GP26"';
  
  var pinRaw = pin.replace(/['"]/g, '');
  var pinVar = 'adc_' + pinRaw.replace(/\./g, '_');

  generator.definitions_['import_board'] = 'import board';
  generator.definitions_['import_analogio'] = 'import analogio';
  generator.definitions_['init_' + pinVar] = 
    pinVar + ' = analogio.AnalogIn(' + pinRaw + ')';

  return [pinVar + '.value', Blockly.Python.ORDER_ATOMIC];
};

// --- PWM 輸出 ---
Blockly.Python.forBlock['mcu_pwm_write'] = function(block, generator) {
  var pin = generator.valueToCode(block, 'PIN', Blockly.Python.ORDER_ATOMIC) || '"board.GP0"';
  var value = generator.valueToCode(block, 'VALUE', Blockly.Python.ORDER_ATOMIC) || '0';
  
  var pinRaw = pin.replace(/['"]/g, '');
  var pinVar = 'pwm_' + pinRaw.replace(/\./g, '_');

  generator.definitions_['import_board'] = 'import board';
  generator.definitions_['import_pwmio'] = 'import pwmio';
  generator.definitions_['init_' + pinVar] = 
    pinVar + ' = pwmio.PWMOut(' + pinRaw + ', frequency=5000, duty_cycle=0)';

  // 支援 0-100 轉 0-65535 的簡單偵測
  var code = 'if ' + value + ' <= 100: ' + pinVar + '.duty_cycle = int(' + value + ' * 655.35)\n' +
             'else: ' + pinVar + '.duty_cycle = int(' + value + ')\n';
  
  return code;
};

// --- I2C 掃描 ---
Blockly.Python.forBlock['mcu_i2c_scan'] = function(block, generator) {
  generator.definitions_['import_board'] = 'import board';
  generator.definitions_['init_i2c'] = `
# Init default I2C
try:
    if 'i2c' not in globals():
        import busio
        i2c = board.I2C()
except:
    pass
`;
  var code = '[(hex(addr)) for addr in i2c.scan()] if "i2c" in globals() and i2c.try_lock() else []\n' +
             'if "i2c" in globals(): i2c.unlock()';
  return [code, Blockly.Python.ORDER_ATOMIC];
};

Blockly.Python.forBlock['mcu_stop_program'] = function(block, generator) {
  generator.definitions_['import_sys'] = 'import sys';
  return 'sys.exit()\n';
};

Blockly.Python.forBlock['mcu_reset'] = function(block, generator) {
  generator.definitions_['import_microcontroller'] = 'import microcontroller';
  return 'microcontroller.reset()\n';
};
