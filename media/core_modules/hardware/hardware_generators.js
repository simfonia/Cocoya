// Hardware Generators: hardware_generators.js
Blockly.Python.forBlock['mcu_set_led'] = function(block, generator) {
  var state = block.getFieldValue('STATE');
  return 'led.value = ' + state + '\\n';
};
