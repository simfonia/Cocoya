// Hardware Blocks: hardware_blocks.js

/**
 * 開發板登錄器 (Board Registry)
 * 板子資料 SSOT 為同目錄 board_defs.json（由 module_loader 於載入模組時 fetch 至 window.CocoyaBoardDefs）。
 * - 目前板子狀態（boardId）可由序列埠 VID/PID 自動偵測（ui 層 setCocoyaBoardFromPort）或手動設定。
 * - 未指定板子時 fallback 為「全板合併清單」（與舊版行為相容）。
 */
var CocoyaBoard = (function() {
    var currentBoardId = '';
    var listeners = [];
    var pinBlocks = [];

    try { /* 無 localStorage 依賴：板子狀態由工作區 board_init 積木驅動 */ } catch (e) { }

    function defs() {
        return (window.CocoyaBoardDefs && window.CocoyaBoardDefs.hardware && window.CocoyaBoardDefs.hardware.boards) || {};
    }
    function boardIds() { return Object.keys(defs()); }
    function getBoard(id) { return id ? defs()[id] : null; }
    function boardName(id) { var b = getBoard(id); return b ? b.name : id; }

    /** 取得目前 boardId（未知板子回空字串） */
    function getCurrent() { return getBoard(currentBoardId) ? currentBoardId : ''; }

    /** 設定目前板子（source: 'workspace'=board_init 積木宣告，最高優先）；觸發 listener 刷新既有 pin 積木 */
    function setCurrent(id, source) {
        id = (id && getBoard(id)) ? id : '';
        if (id === currentBoardId) return;
        currentBoardId = id;
        refreshAllPinBlocks();
        listeners.forEach(function(fn) { try { fn(currentBoardId, source); } catch (e) { /* ignore */ } });
    }

    function onChange(fn) { listeners.push(fn); }

    /**
     * 組出腳位下拉選單 options：[顯示文字, 下拉值(boardRef)]
     * - 指定板子 → 該板腳位
     * - 未指定 → 全板合併（label 加 [板名] 前綴，與舊版 [Pico]/[XIAO] 行為相容）
     */
    function pinOptions(boardId) {
        var all = defs();
        var ids = boardId ? [boardId] : boardIds();
        var out = [];
        ids.forEach(function(id) {
            var b = all[id];
            if (!b || !b.pins) return;
            b.pins.forEach(function(p) {
                out.push([ (boardId ? '' : ('[' + b.name + '] ')) + p.label, p.ref ]);
            });
        });
        if (out.length === 0) out = [['GP0', 'board.GP0']];
        return out;
    }

    /**
     * 將 boardRef（如 board.GP0 / board.D10）解析為 GPIO 號碼。
     * - 有選板：優先查該板 gpioMap（權威映射）
     * - 查無 → 合併掃描所有板兜底（看程式永遠可解析；ref 帶 GP/D 家族前綴，歧義極低）
     * 全部查無回 null → generator 產生錯誤註解。
     */
    function resolveGpio(boardId, ref) {
        var bare = String(ref).replace(/['"]/g, '').replace(/^board\./, '');
        var b = getBoard(boardId) || getBoard(currentBoardId);
        if (b && b.gpioMap && Object.prototype.hasOwnProperty.call(b.gpioMap, bare)) {
            return b.gpioMap[bare];
        }
        var all = defs();
        var ids = boardIds();
        for (var i = 0; i < ids.length; i++) {
            var bb = all[ids[i]];
            if (bb && bb.gpioMap && Object.prototype.hasOwnProperty.call(bb.gpioMap, bare)) {
                return bb.gpioMap[bare];
            }
        }
        return null;
    }

    /** 註冊 mcu_pin_shadow 積木，板子切換時統一刷新下拉 */
    function registerPinBlock(block) {
        if (pinBlocks.indexOf(block) === -1) pinBlocks.push(block);
    }
    function refreshAllPinBlocks() {
        var opts = pinOptions(getCurrent());
        pinBlocks.forEach(function(block) {
            if (!block || !block.getField) return;
            try {
                var field = block.getField('PIN');
                if (field) field.setOptions(opts);
                if (block.render) block.render();
            } catch (e) { /* flyout/shadow 已銷毀 → 忽略 */ }
        });
    }

    return {
        getCurrent: getCurrent,
        setCurrent: setCurrent,
        getBoard: getBoard,
        boardName: boardName,
        boardIds: boardIds,
        pinOptions: pinOptions,
        resolveGpio: resolveGpio,
        onChange: onChange,
        registerPinBlock: registerPinBlock
    };
})();
window.CocoyaBoard = CocoyaBoard;

// --- 宣告積木：初始化開發板（工作區板子 SSOT）---
Blockly.Blocks['mcu_board_init'] = {
  init: function() {
    var options = CocoyaBoard.boardIds().map(function(id) {
      return [CocoyaBoard.boardName(id), id];
    });
    if (options.length === 0) options = [['Maker Pi RP2040', 'maker-pi']];
    this.jsonInit({
      "message0": Blockly.Msg["HW_BOARD_INIT"] || "初始化開發板 %1",
      "args0": [
        { "type": "field_dropdown", "name": "BOARD", "options": options }
      ],
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_HARDWARE"],
      "tooltip": Blockly.Msg["HW_BOARD_INIT_TOOLTIP"] || "宣告本專案使用的開發板，工作區所有腳位積木以此為準。"
    });
    // 帽子積木（如 Scratch 的「當啟動時」）：頂部無凹槽、不可從上方連接，
    // 渲染器支援 block.hat === 'cap'（不進 XML，重載後 init 重設即可）
    this.hat = 'cap';
    var block = this;
    // field 變更 → 切換全域板子（工作區宣告為最高優先）
    this.getField('BOARD').setValidator(function(value) {
      if (value && window.CocoyaBoard) window.CocoyaBoard.setCurrent(value, 'workspace');
      return value;
    });
  }
};

// --- 影子積木：腳位選取器 (板子感知動態下拉) ---
Blockly.Blocks['mcu_pin_shadow'] = {
  init: function() {
    var options = CocoyaBoard.pinOptions(CocoyaBoard.getCurrent());
    this.jsonInit({
      "message0": "%1",
      "args0": [
        {
          "type": "field_dropdown",
          "name": "PIN",
          "options": options
        }
      ],
      "output": "String",
      "colour": Blockly.Msg["COLOUR_HARDWARE"],
      "tooltip": Blockly.Msg["HW_PIN_SHADOW_TOOLTIP"] || "選擇開發板腳位名稱。"
    });
    CocoyaBoard.registerPinBlock(this);
  }
};

Blockly.Blocks['mcu_set_led'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HW_SET_LED"],
      "args0": [
        { 
          "type": "field_dropdown", 
          "name": "STATE",
          "options": [
            [Blockly.Msg["HW_SET_LED_ON"], "True"], 
            [Blockly.Msg["HW_SET_LED_OFF"], "False"]
          ]
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_HARDWARE"],
      "helpUrl": "hardware_pins",
      "tooltip": Blockly.Msg["HW_SET_LED_TOOLTIP"]
    });
  }
};

// --- 數位輸出 ---
Blockly.Blocks['mcu_digital_write'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HW_DIGITAL_WRITE"],
      "args0": [
        {
          "type": "input_value",
          "name": "PIN",
          "check": "String"
        },
        {
          "type": "field_dropdown",
          "name": "STATE",
          "options": [
            [Blockly.Msg["HW_PIN_HIGH"], "True"],
            [Blockly.Msg["HW_PIN_LOW"], "False"]
          ]
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_HARDWARE"],
      "helpUrl": "hardware_pins",
      "tooltip": Blockly.Msg["HW_DIGITAL_WRITE_TOOLTIP"]
    });
  }
};

// --- 數位讀入 ---
Blockly.Blocks['mcu_digital_read'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HW_DIGITAL_READ"],
      "args0": [
        {
          "type": "input_value",
          "name": "PIN",
          "check": "String"
        }
      ],
      "output": "Boolean",
      "colour": Blockly.Msg["COLOUR_HARDWARE"],
      "helpUrl": "hardware_pins",
      "tooltip": Blockly.Msg["HW_DIGITAL_READ_TOOLTIP"]
    });
  }
};

// --- 類比讀入 ---
Blockly.Blocks['mcu_analog_read'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HW_ANALOG_READ"],
      "args0": [
        {
          "type": "input_value",
          "name": "PIN",
          "check": "String"
        }
      ],
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_HARDWARE"],
      "helpUrl": "hardware_pins",
      "tooltip": Blockly.Msg["HW_ANALOG_READ_TOOLTIP"]
    });
  }
};

// --- PWM 輸出 ---
Blockly.Blocks['mcu_pwm_write'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HW_PWM_WRITE"],
      "args0": [
        {
          "type": "input_value",
          "name": "PIN",
          "check": "String"
        },
        {
          "type": "input_value",
          "name": "VALUE",
          "check": "Number"
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_HARDWARE"],
      "helpUrl": "hardware_pins",
      "tooltip": Blockly.Msg["HW_PWM_WRITE_TOOLTIP"]
    });
  }
};

// --- I2C 掃描 ---
Blockly.Blocks['mcu_i2c_scan'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HW_I2C_SCAN"],
      "output": "Array",
      "colour": Blockly.Msg["COLOUR_HARDWARE"],
      "helpUrl": "hardware_pins",
      "tooltip": Blockly.Msg["HW_I2C_SCAN_TOOLTIP"]
    });
  }
};

Blockly.Blocks['mcu_stop_program'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HW_STOP_PROGRAM"],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_HARDWARE"],
      "tooltip": Blockly.Msg["HW_STOP_PROGRAM_TOOLTIP"]
    });
  }
};

Blockly.Blocks['mcu_reset'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HW_RESET"],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_HARDWARE"],
      "tooltip": Blockly.Msg["HW_RESET_TOOLTIP"]
    });
  }
};
