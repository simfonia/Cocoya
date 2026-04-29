// mcu_camera_generators.js
// Optimized for MicroPython (ESP32-S3 Camera firmwares)

Blockly.Python.forBlock['mcu_camera_init'] = function(block, generator) {
  generator.definitions_['import_camera'] = 'import camera';
  
  var code = `
# Initialize Camera (MicroPython ESP32-S3)
if 'cam' not in globals():
    try:
        # Note: Pin definitions vary by firmware/board
        # This setup is for Seeed XIAO ESP32S3 Sense common firmware
        camera.init(0, format=camera.JPEG, framesize=camera.FRAME_QVGA)
        cam = camera
    except Exception as e:
        print("Camera Init Failed:", e)
`;
  return code;
};

Blockly.Python.forBlock['mcu_camera_capture_serial'] = function(block, generator) {
  generator.definitions_['import_sys'] = 'import sys';
  generator.definitions_['import_binascii'] = 'import binascii';

  var code = `
# Capture and Send Image (MicroPython Serial)
if 'cam' in globals():
    frame = cam.capture()
    if frame:
        try:
            # Protocol: [Header][Base64 Data][Footer]
            sys.stdout.write(b"\\xaa\\xbbIMG:")
            sys.stdout.write(binascii.b2a_base64(frame))
            sys.stdout.write(b":END\\n")
        except Exception as e:
            print("Capture Error:", e)
`;
  return code;
};
