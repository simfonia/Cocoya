// Hardware Generators: hardware_generators.js

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

Blockly.Python.forBlock['mcu_stop_program'] = function(block, generator) {
  generator.definitions_['import_sys'] = 'import sys';
  return 'sys.exit()\n';
};

Blockly.Python.forBlock['mcu_reset'] = function(block, generator) {
  generator.definitions_['import_microcontroller'] = 'import microcontroller';
  return 'microcontroller.reset()\n';
};
