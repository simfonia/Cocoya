// mcu_huskylens_generators.js
// Optimized for MicroPython (Machine I2C)

Blockly.Python.forBlock['mcu_huskylens_init'] = function(block, generator) {
  generator.definitions_['import_machine'] = 'import machine';
  generator.definitions_['import_time'] = 'import time';

  generator.definitions_['class_huskylens'] = `
class HuskyLensHelper:
    def __init__(self, i2c_bus, address=0x32):
        self.i2c = i2c_bus
        self.address = address
        self.last_data = {}

    def request_all(self):
        try:
            # Request All Objects (0x20)
            self.i2c.writeto(self.address, bytes([0x55, 0xAA, 0x11, 0x00, 0x20, 0x31]))
            time.sleep_ms(50)
            # Basic implementation
            buf = self.i2c.readfrom(self.address, 16)
            if buf[3] > 0: 
                # HuskyLens I2C protocol parsing
                self.last_data[buf[9]] = {
                    "x": buf[5] + (buf[6] << 8),
                    "y": buf[7] + (buf[8] << 8),
                    "width": buf[9] + (buf[10] << 8),
                    "height": buf[11] + (buf[12] << 8)
                }
        except Exception as e:
            print("HuskyLens Error:", e)

    def get_data(self, obj_id, field):
        return self.last_data.get(obj_id, {}).get(field, 0)

    def is_detected(self, obj_id):
        return obj_id in self.last_data
`;

  var code = `
# Initialize HuskyLens (MicroPython I2C)
if 'husky' not in globals():
    try:
        # Default I2C pins for RP2040 (GP5=SCL, GP4=SDA) or S3
        husky_i2c = machine.I2C(0, scl=machine.Pin(5), sda=machine.Pin(4), freq=100000)
        husky = HuskyLensHelper(husky_i2c)
    except Exception as e:
        print("HuskyLens Init Failed:", e)
`;
  return code;
};

Blockly.Python.forBlock['mcu_huskylens_request'] = function(block, generator) {
  return 'if "husky" in globals(): husky.request_all()\n';
};

Blockly.Python.forBlock['mcu_huskylens_get_box'] = function(block, generator) {
  var id = generator.valueToCode(block, 'ID', Blockly.Python.ORDER_ATOMIC) || '1';
  var field = block.getFieldValue('FIELD');
  return ['husky.get_data(' + id + ', "' + field + '")', Blockly.Python.ORDER_ATOMIC];
};

Blockly.Python.forBlock['mcu_huskylens_is_detected'] = function(block, generator) {
  var id = generator.valueToCode(block, 'ID', Blockly.Python.ORDER_ATOMIC) || '1';
  return ['husky.is_detected(' + id + ')', Blockly.Python.ORDER_ATOMIC];
};
