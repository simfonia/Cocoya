// Hardware Generators: hardware_generators.js
// Optimized for MicroPython (Machine module)

Blockly.Python.forBlock['mcu_pin_shadow'] = function(block, generator) {
  var pin = block.getFieldValue('PIN');
  return [JSON.stringify(pin), Blockly.Python.ORDER_ATOMIC];
};

// --- 宣告積木：初始化開發板（純宣告，僅輸出註解，不產生硬體碼） ---
Blockly.Python.forBlock['mcu_board_init'] = function(block, generator) {
  var boardId = block.getFieldValue('BOARD');
  var name = (typeof CocoyaBoard !== 'undefined' && CocoyaBoard.boardName) ? CocoyaBoard.boardName(boardId) : boardId;
  return '# Board: ' + name + ' (' + boardId + ')\n';
};

/**
 * 共用腳位解析（嚴格模式）：boardRef 字串 → GPIO 號碼。
 * 只走 CocoyaBoard.resolveGpio（board_defs.json gpioMap 權威映射），
 * 解析失敗回 null，由各 generator 產生明確錯誤註解（不產壞碼、無舊格式 fallback）。
 */
function cocoyaResolvePinNum(pinCode) {
  if (typeof CocoyaBoard !== 'undefined' && CocoyaBoard.resolveGpio) {
    var num = CocoyaBoard.resolveGpio(CocoyaBoard.getCurrent(), String(pinCode));
    if (num !== null && num !== undefined) return String(num);
  }
  return null;
}

/** 產生「未知腳位」的錯誤註解代碼（取代默默產生壞碼） */
function cocoyaPinErrorComment(pinCode) {
  return '# [Cocoya] 無法解析腳位: ' + String(pinCode).replace(/['"]/g, '') +
         ' （請確認已選擇開發板，或改用腳位下拉選單）\npass\n';
}

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

  var pinNum = cocoyaResolvePinNum(pin);
  if (pinNum === null) return cocoyaPinErrorComment(pin);

  var pinVar = 'pin_' + pinNum;

  generator.definitions_['import_machine'] = 'import machine';
  generator.definitions_['init_' + pinVar] =
    pinVar + ' = machine.Pin(' + pinNum + ', machine.Pin.OUT)';

  return pinVar + '.value(1 if ' + state + ' else 0)\n';
};

// --- 數位輸入 ---
Blockly.Python.forBlock['mcu_digital_read'] = function(block, generator) {
  var pin = generator.valueToCode(block, 'PIN', Blockly.Python.ORDER_ATOMIC) || '"board.GP0"';

  var pinNum = cocoyaResolvePinNum(pin);
  if (pinNum === null) return [cocoyaPinErrorComment(pin) + '0', Blockly.Python.ORDER_ATOMIC];

  var pinVar = 'pin_' + pinNum;

  generator.definitions_['import_machine'] = 'import machine';
  generator.definitions_['init_' + pinVar] =
    pinVar + ' = machine.Pin(' + pinNum + ', machine.Pin.IN, machine.Pin.PULL_UP)';

  return [pinVar + '.value()', Blockly.Python.ORDER_ATOMIC];
};

// --- 類比輸入 ---
Blockly.Python.forBlock['mcu_analog_read'] = function(block, generator) {
  var pin = generator.valueToCode(block, 'PIN', Blockly.Python.ORDER_ATOMIC) || '"board.GP26"';

  var pinNum = cocoyaResolvePinNum(pin);
  if (pinNum === null) return [cocoyaPinErrorComment(pin) + '0', Blockly.Python.ORDER_ATOMIC];

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

  var pinNum = cocoyaResolvePinNum(pin);
  if (pinNum === null) return cocoyaPinErrorComment(pin);

  var pinVar = 'pwm_' + pinNum;

  generator.definitions_['import_machine'] = 'import machine';
  generator.definitions_['init_' + pinVar] = 
    pinVar + ' = machine.PWM(machine.Pin(' + pinNum + '), freq=5000)';

  // VALUE 使用百分比 (0-100%)，對應 duty_u16 0-65535；數值範圍限制 [0,100]
  var code = pinVar + '.duty_u16(int(max(0, min(100, ' + value + ')) * 655.35))\n';
  
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

