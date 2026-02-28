// mcu_huskylens_generators.js
Blockly.Python.forBlock['mcu_huskylens_init'] = function(block, generator) {
  generator.definitions_['import_board'] = 'import board';
  generator.definitions_['import_busio'] = 'import busio';
  generator.definitions_['import_time'] = 'import time';

  // Inject HuskyLens Helper Class
  generator.definitions_['class_huskylens'] = `
class HuskyLensHelper:
    def __init__(self, i2c_bus, address=0x32):
        self.i2c = i2c_bus
        self.address = address
        self.last_data = {}

    def request_all(self):
        try:
            # Request All Objects (0x20)
            self.i2c.try_lock()
            self.i2c.writeto(self.address, bytes([0x55, 0xAA, 0x11, 0x00, 0x20, 0x31]))
            time.sleep(0.05)
            # Basic implementation for educational purpose
            # HuskyLens returns 5 bytes header + N*10 bytes data + checksum
            # We'll assume successful read of the most prominent object for simplicity
            buf = bytearray(16)
            self.i2c.readfrom_into(self.address, buf)
            if buf[3] > 0: # If data length > 0
                # Parsing specific to HuskyLens I2C protocol
                # x = buf[5] | buf[6] << 8 ...
                self.last_data[buf[9]] = {
                    "x": buf[5] + (buf[6] << 8),
                    "y": buf[7] + (buf[8] << 8),
                    "width": buf[9] + (buf[10] << 8),
                    "height": buf[11] + (buf[12] << 8)
                }
            self.i2c.unlock()
        except Exception as e:
            if self.i2c: self.i2c.unlock()
            print("HuskyLens Error:", e)

    def get_data(self, obj_id, field):
        return self.last_data.get(obj_id, {}).get(field, 0)

    def is_detected(self, obj_id):
        return obj_id in self.last_data
`;

  var code = `
# Initialize HuskyLens
if 'husky' not in globals():
    try:
        husky_i2c = busio.I2C(board.SCL, board.SDA)
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
