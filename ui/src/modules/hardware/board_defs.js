/**
 * Cocoya 開發板資訊表 (SSOT)
 * 新增開發板：在 boards 新增一個條目（boardId 為 key，vidPid/pins/gpioMap 必填）。
 * - 前端：mcu_board_init 積木下拉、mcu_pin_shadow 動態選項、resolveGpio 權威映射
 * - Rust (mcu.rs detect_board_id) / VSIX (serialOps.ts boardIdMap) 的 vidPid 表需同步維護
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
            gpioMap: { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4, P5: 5, P6: 6, P7: 7, P8: 8, P9: 9, P10: 10, P11: 11, P12: 12, P13: 13, P14: 14, P15: 15, P16: 16, P19: 19, P20: 20 }
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
