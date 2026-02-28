// mcu_camera_generators.js
Blockly.Python.forBlock['mcu_camera_init'] = function(block, generator) {
  generator.definitions_['import_board'] = 'import board';
  generator.definitions_['import_esp32_camera'] = 'import esp32_camera';
  
  // XIAO ESP32S3 Sense Standard Pins
  // Note: These are standard for the Sense expansion board
  var code = `
# Initialize Camera for XIAO ESP32S3 Sense
if 'cam' not in globals():
    try:
        cam = esp32_camera.Camera(
            data_pins=[board.D2, board.D3, board.D4, board.D5, board.D6, board.D7, board.D8, board.D9],
            vsync_pin=board.D10,
            href_pin=board.D11,
            pclk_pin=board.D12,
            xclk_pin=board.D13,
            sda_pin=board.D14,
            scl_pin=board.D15,
            xclk_freq=20000000,
            frame_size=esp32_camera.FrameSize.QVGA,
            pixel_format=esp32_camera.PixelFormat.JPEG,
            jpeg_quality=15,
            frame_buffer_count=2
        )
    except Exception as e:
        print("Camera Init Failed:", e)
`;
  return code;
};

Blockly.Python.forBlock['mcu_camera_capture_serial'] = function(block, generator) {
  generator.definitions_['import_usb_cdc'] = 'import usb_cdc';
  generator.definitions_['import_binascii'] = 'import binascii';

  var code = `
# Capture and Send Image to PC (Data Collection Mode)
if 'cam' in globals():
    frame = cam.take_frame()
    if frame is not None:
        try:
            # Protocol: [Header][Base64 Data][Footer]
            usb_cdc.data.write(b"\xaa\xbbIMG:")
            usb_cdc.data.write(binascii.b2a_base64(frame))
            usb_cdc.data.write(b":END
")
        except Exception as e:
            print("Capture/Send Error:", e)
`;
  return code;
};
