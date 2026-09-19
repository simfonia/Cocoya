/**
 * Cocoya 開發板資訊表 (SSOT)
 * 新增開發板：在 boards 新增一個條目（boardId 為 key，vidPid/pins/gpioMap 必填）。
 * - 前端：mcu_board_init 積木下拉、mcu_pin_shadow 動態選項、resolveGpio 權威映射
 * - Rust (mcu.rs detect_board_id) / VSIX (serialOps.ts boardIdMap) 的 vidPid 表需同步維護
 * - pins[].tags 詞彙（供未來依積木類型過濾下拉；目前尚未過濾，加 tag 不影響現有行為）：
 *   digital / pwm / adc / input / i2c / uart / spi
 * - label 為下拉顯示文字（可含功能提示）；ref 才是解析鍵（board.GPx / board.Dx）→ 改 label 不影響舊專案
 * 由 module_loader 以 loadScript 載入（與其他模組腳本同機制，無 fetch/CSP 風險）。
 */
window.CocoyaBoardDefs = window.CocoyaBoardDefs || {};
window.CocoyaBoardDefs.hardware = {
    version: 1,
    boards: {
        picow: {
            name: "Raspberry Pi Pico W",
            vidPid: [["2E8A", "0003"]],
            pins: [
                { ref: "board.GP0", label: "GP0", tags: ["digital", "pwm"] },
                { ref: "board.GP1", label: "GP1", tags: ["digital", "pwm"] },
                { ref: "board.GP2", label: "GP2", tags: ["digital", "pwm"] },
                { ref: "board.GP16", label: "GP16", tags: ["digital", "pwm"] },
                { ref: "board.GP18", label: "GP18", tags: ["digital", "pwm"] },
                { ref: "board.GP20", label: "GP20", tags: ["digital", "input"] },
                { ref: "board.GP26", label: "GP26", tags: ["adc"] },
                { ref: "board.GP27", label: "GP27", tags: ["adc"] },
                { ref: "board.GP28", label: "GP28", tags: ["adc"] }
            ],
            gpioMap: { GP0: 0, GP1: 1, GP2: 2, GP3: 3, GP4: 4, GP5: 5, GP6: 6, GP7: 7, GP8: 8, GP9: 9, GP10: 10, GP11: 11, GP12: 12, GP13: 13, GP14: 14, GP15: 15, GP16: 16, GP17: 17, GP18: 18, GP19: 19, GP20: 20, GP21: 21, GP22: 22, GP26: 26, GP27: 27, GP28: 28, LED: 25 }
        },
        "maker-pi": {
            name: "Maker Pi RP2040",
            vidPid: [["2E8A", "0005"]],
            // 腳位來源：Cytron MAKER-PI-RP2040 Datasheet Rev 1.2 (Jan 2022) Table 1
            //  - 板載週邊：直流馬達 M1A/M1B/M2A/M2B = GP8/GP9/GP10/GP11、
            //    RC 伺服 GP12~GP15、WS2812B RGB LED = GP18、可程式按鈕 = GP20/GP21、
            //    Piezo 蜂鳴器 = GP22（USB VID/PID 2E8A:0005 = MicroPython 韌體；
            //    datasheet 另載 2E8A:1000 為 CircuitPython/Arduino Core，未納入自動偵測）
            //  - Grove 埠：1=GP0/GP1、2=GP2/GP3、3=GP4/GP5、4=GP16/GP17、
            //    5=GP6/GP26(A0)、6=GP26(A0)/GP27(A1)、7=GP7/GP28(A2)
            //    ※ GP26 在 datasheet 表中同時列於 Grove 5 與 Grove 6（原始表如此登載）
            //  - ADC：GP26=ADC0、GP27=ADC1、GP28=ADC2（表中其餘腳位 Analog 欄為空）
            //  - 板載 LED：Maker Pi 無 GP25 指示燈（Power LED 非 GPIO）；
            //    gpioMap 保留 LED:25 僅為相容舊專案 XML 的 board.LED（Pico 慣例）
            pins: [
                // --- 板載週邊（馬達 / 伺服 / RGB / 按鈕 / 蜂鳴器）---
                { ref: "board.GP8", label: "GP8 (M1A)", tags: ["digital", "pwm"] },
                { ref: "board.GP9", label: "GP9 (M1B)", tags: ["digital", "pwm"] },
                { ref: "board.GP10", label: "GP10 (M2A)", tags: ["digital", "pwm"] },
                { ref: "board.GP11", label: "GP11 (M2B)", tags: ["digital", "pwm"] },
                { ref: "board.GP12", label: "GP12 (Servo)", tags: ["digital", "pwm"] },
                { ref: "board.GP13", label: "GP13 (Servo)", tags: ["digital", "pwm"] },
                { ref: "board.GP14", label: "GP14 (Servo)", tags: ["digital", "pwm"] },
                { ref: "board.GP15", label: "GP15 (Servo)", tags: ["digital", "pwm"] },
                { ref: "board.GP18", label: "GP18 (RGB LED)", tags: ["digital"] },
                { ref: "board.GP20", label: "GP20 (Button 1)", tags: ["digital", "input"] },
                { ref: "board.GP21", label: "GP21 (Button 2)", tags: ["digital", "input"] },
                { ref: "board.GP22", label: "GP22 (Buzzer)", tags: ["digital", "pwm"] },
                // --- Grove 埠（外部模組；tags 依 datasheet 的 PWM/SPI/I2C/UART/Analog 欄）---
                { ref: "board.GP0", label: "GP0 (Grove 1)", tags: ["digital", "pwm", "i2c", "uart", "spi"] },
                { ref: "board.GP1", label: "GP1 (Grove 1)", tags: ["digital", "pwm", "i2c", "uart", "spi"] },
                { ref: "board.GP2", label: "GP2 (Grove 2)", tags: ["digital", "pwm", "i2c", "spi"] },
                { ref: "board.GP3", label: "GP3 (Grove 2)", tags: ["digital", "pwm", "i2c", "spi"] },
                { ref: "board.GP4", label: "GP4 (Grove 3)", tags: ["digital", "pwm", "i2c", "uart", "spi"] },
                { ref: "board.GP5", label: "GP5 (Grove 3)", tags: ["digital", "pwm", "i2c", "uart", "spi"] },
                { ref: "board.GP16", label: "GP16 (Grove 4)", tags: ["digital", "pwm", "i2c", "uart", "spi"] },
                { ref: "board.GP17", label: "GP17 (Grove 4)", tags: ["digital", "pwm", "i2c", "uart", "spi"] },
                { ref: "board.GP6", label: "GP6 (Grove 5)", tags: ["digital", "pwm", "i2c", "spi"] },
                { ref: "board.GP26", label: "GP26 (Grove 5/6, ADC0)", tags: ["digital", "pwm", "adc", "i2c"] },
                { ref: "board.GP27", label: "GP27 (Grove 6, ADC1)", tags: ["digital", "pwm", "adc", "i2c"] },
                { ref: "board.GP7", label: "GP7 (Grove 7)", tags: ["digital", "pwm", "i2c", "spi"] },
                { ref: "board.GP28", label: "GP28 (Grove 7, ADC2)", tags: ["digital", "pwm", "adc"] }
            ],
            gpioMap: { GP0: 0, GP1: 1, GP2: 2, GP3: 3, GP4: 4, GP5: 5, GP6: 6, GP7: 7, GP8: 8, GP9: 9, GP10: 10, GP11: 11, GP12: 12, GP13: 13, GP14: 14, GP15: 15, GP16: 16, GP17: 17, GP18: 18, GP19: 19, GP20: 20, GP21: 21, GP22: 22, GP26: 26, GP27: 27, GP28: 28, LED: 25 }
        },
        "xiao-s3": {
            name: "XIAO ESP32-S3 Sense",
            vidPid: [["303A", "*"]],
            pins: [
                { ref: "board.D0", label: "D0", tags: ["digital", "pwm", "adc"] },
                { ref: "board.D1", label: "D1", tags: ["digital", "pwm", "adc"] },
                { ref: "board.D2", label: "D2", tags: ["digital", "pwm", "adc"] },
                { ref: "board.D3", label: "D3", tags: ["digital", "pwm", "adc"] },
                { ref: "board.D4", label: "D4", tags: ["digital", "adc"] },
                { ref: "board.D5", label: "D5", tags: ["digital", "adc"] },
                { ref: "board.D6", label: "D6", tags: ["digital", "adc"] },
                { ref: "board.D7", label: "D7", tags: ["digital", "adc"] },
                { ref: "board.D8", label: "D8", tags: ["digital", "pwm", "adc"] },
                { ref: "board.D9", label: "D9", tags: ["digital", "pwm", "adc"] },
                { ref: "board.D10", label: "D10", tags: ["digital", "pwm", "adc"] }
            ],
            gpioMap: { D0: 0, D1: 1, D2: 2, D3: 3, D4: 4, D5: 5, D6: 6, D7: 7, D8: 8, D9: 9, D10: 10 }
        },
        microbit: {
            name: "Micro:bit V1/V2",
            vidPid: [["0D28", "0204"], ["0D28", "0209"]],
            pins: [
                { ref: "board.pin0", label: "P0", tags: ["digital", "pwm", "adc"] },
                { ref: "board.pin1", label: "P1", tags: ["digital", "pwm", "adc"] },
                { ref: "board.pin2", label: "P2", tags: ["digital", "pwm", "adc"] },
                { ref: "board.pin3", label: "P3", tags: ["digital"] },
                { ref: "board.pin4", label: "P4", tags: ["digital"] },
                { ref: "board.pin5", label: "P5", tags: ["digital", "input"] },
                { ref: "board.pin6", label: "P6", tags: ["digital"] },
                { ref: "board.pin7", label: "P7", tags: ["digital"] },
                { ref: "board.pin8", label: "P8", tags: ["digital", "pwm"] },
                { ref: "board.pin9", label: "P9", tags: ["digital"] },
                { ref: "board.pin10", label: "P10", tags: ["digital"] },
                { ref: "board.pin11", label: "P11", tags: ["digital", "input"] },
                { ref: "board.pin12", label: "P12", tags: ["digital"] },
                { ref: "board.pin13", label: "P13", tags: ["digital"] },
                { ref: "board.pin14", label: "P14", tags: ["digital"] },
                { ref: "board.pin15", label: "P15", tags: ["digital"] },
                { ref: "board.pin16", label: "P16", tags: ["digital"] },
                { ref: "board.pin19", label: "P19", tags: ["digital"] },
                { ref: "board.pin20", label: "P20", tags: ["digital"] }
            ],
            // micro:bit MicroPython：Pin(n) 的 n 對應 edge connector 腳位編號 pin0~pin20（17/18 不外露）
            // 注意：P5/P11 為按鈕 A/B 共用，實機驗證後再依需求調整
            // gpioMap 同時提供 P0 與 pin0 兩種鍵：pins[].ref 為 board.pin0（MicroPython Pin(n) 語意），
            // 相容舊專案 XML 可能寫的 board.P0。2026-09-19 由「所有板 pins 必可解析」不變式測試發現
            // 原表僅有 P 開頭鍵 → mcu_pin_shadow 選出的 board.pinN 全部 miss（與 scrub_ 標記污染同類症狀）。
            gpioMap: { P0: 0, pin0: 0, P1: 1, pin1: 1, P2: 2, pin2: 2, P3: 3, pin3: 3, P4: 4, pin4: 4, P5: 5, pin5: 5, P6: 6, pin6: 6, P7: 7, pin7: 7, P8: 8, pin8: 8, P9: 9, pin9: 9, P10: 10, pin10: 10, P11: 11, pin11: 11, P12: 12, pin12: 12, P13: 13, pin13: 13, P14: 14, pin14: 14, P15: 15, pin15: 15, P16: 16, pin16: 16, P19: 19, pin19: 19, P20: 20, pin20: 20 }
        },
        "spike-prime": {
            name: "LEGO SPIKE Prime",
            vidPid: [["0694", "0009"]],
            // SPIKE Prime 無 GPIO 腳位（馬達/感測器為 Port A~F，走 spike 專屬積木，
            // 不使用 mcu_pin_shadow 腳位機制）；pins 留空以滿足必填欄位。
            // 韌體模式（官方 SPIKE 3 / Pybricks）由 spike_init_hub 積木的下拉選擇。
            pins: [],
            gpioMap: {}
        }
    }
};
