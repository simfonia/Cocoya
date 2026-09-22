// mcu_huskylens_blocks.js
// V1/V2 通用版（2026-09-19）：init 積木新增版本與匯流排下拉，
// 新增 LINE_TRACKING 向量積木（get_arrow）與 V2 演算法切換積木（set_algorithm）。

Blockly.Blocks['mcu_huskylens_init'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HUSKY_INIT"],
      "args0": [
        {
          "type": "field_dropdown",
          "name": "HL_VERSION",
          "options": [
            [Blockly.Msg["HUSKY_VERSION_V2"], "v2"],
            [Blockly.Msg["HUSKY_VERSION_V1"], "v1"]
          ]
        },
        {
          "type": "field_dropdown",
          "name": "HL_BUS",
          "options": [
            [Blockly.Msg["HUSKY_BUS_I2C"], "i2c"],
            [Blockly.Msg["HUSKY_BUS_UART"], "uart"]
          ]
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_HUSKYLENS"],
      "tooltip": Blockly.Msg["HUSKY_INIT_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['mcu_huskylens_request'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HUSKY_REQUEST"],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_HUSKYLENS"],
      "tooltip": Blockly.Msg["HUSKY_REQUEST_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['mcu_huskylens_set_algorithm'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HUSKY_SET_ALGORITHM"],
      "args0": [
        {
          "type": "field_dropdown",
          "name": "ALGO",
          "options": [
            [Blockly.Msg["HUSKY_ALGO_FACE"], "1"],
            [Blockly.Msg["HUSKY_ALGO_OBJECT_REC"], "2"],
            [Blockly.Msg["HUSKY_ALGO_OBJECT_TRACK"], "3"],
            [Blockly.Msg["HUSKY_ALGO_COLOR"], "4"],
            [Blockly.Msg["HUSKY_ALGO_OBJ_CLASS"], "5"],
            [Blockly.Msg["HUSKY_ALGO_SELF_LEARN"], "6"],
            [Blockly.Msg["HUSKY_ALGO_SEGMENT"], "7"],
            [Blockly.Msg["HUSKY_ALGO_LINE"], "12"],
            [Blockly.Msg["HUSKY_ALGO_TAG"], "16"]
          ]
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_HUSKYLENS"],
      "tooltip": Blockly.Msg["HUSKY_SET_ALGORITHM_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['mcu_huskylens_get_box'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HUSKY_GET_BOX"],
      "args0": [
        { "type": "input_value", "name": "ID", "check": "Number" },
        {
          "type": "field_dropdown",
          "name": "FIELD",
          "options": [
            [Blockly.Msg["HUSKY_GET_BOX_X"], "x"],
            [Blockly.Msg["HUSKY_GET_BOX_Y"], "y"],
            [Blockly.Msg["HUSKY_GET_BOX_W"], "width"],
            [Blockly.Msg["HUSKY_GET_BOX_H"], "height"]
          ]
        }
      ],
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_HUSKYLENS"],
      "tooltip": Blockly.Msg["HUSKY_GET_BOX_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['mcu_huskylens_get_arrow'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HUSKY_GET_ARROW"],
      "args0": [
        { "type": "input_value", "name": "ID", "check": "Number" },
        {
          "type": "field_dropdown",
          "name": "FIELD",
          "options": [
            [Blockly.Msg["HUSKY_ARROW_XORIGIN"], "xOrigin"],
            [Blockly.Msg["HUSKY_ARROW_YORIGIN"], "yOrigin"],
            [Blockly.Msg["HUSKY_ARROW_XTARGET"], "xTarget"],
            [Blockly.Msg["HUSKY_ARROW_YTARGET"], "yTarget"],
            [Blockly.Msg["HUSKY_ARROW_ANGLE"], "angle"],
            [Blockly.Msg["HUSKY_ARROW_LENGTH"], "length"]
          ]
        }
      ],
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_HUSKYLENS"],
      "tooltip": Blockly.Msg["HUSKY_GET_ARROW_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['mcu_huskylens_is_detected'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HUSKY_IS_LEARNED"],
      "args0": [
        { "type": "input_value", "name": "ID", "check": "Number" }
      ],
      "output": "Boolean",
      "colour": Blockly.Msg["COLOUR_HUSKYLENS"],
      "tooltip": Blockly.Msg["HUSKY_IS_LEARNED_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

// ===== Tier 1 擴充（2026-09-19）=====

Blockly.Blocks['mcu_huskylens_count'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HUSKY_COUNT"],
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_HUSKYLENS"],
      "tooltip": Blockly.Msg["HUSKY_COUNT_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['mcu_huskylens_get_id_at'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HUSKY_GET_ID_AT"],
      "args0": [
        { "type": "input_value", "name": "N", "check": "Number" }
      ],
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_HUSKYLENS"],
      "tooltip": Blockly.Msg["HUSKY_GET_ID_AT_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['mcu_huskylens_get_name'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HUSKY_GET_NAME"],
      "args0": [
        { "type": "input_value", "name": "ID", "check": "Number" }
      ],
      "output": "String",
      "colour": Blockly.Msg["COLOUR_HUSKYLENS"],
      "tooltip": Blockly.Msg["HUSKY_GET_NAME_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['mcu_huskylens_any_arrow'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HUSKY_ANY_ARROW"],
      "output": "Boolean",
      "colour": Blockly.Msg["COLOUR_HUSKYLENS"],
      "tooltip": Blockly.Msg["HUSKY_ANY_ARROW_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['mcu_huskylens_learn'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HUSKY_LEARN"],
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_HUSKYLENS"],
      "tooltip": Blockly.Msg["HUSKY_LEARN_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['mcu_huskylens_forget'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HUSKY_FORGET"],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_HUSKYLENS"],
      "tooltip": Blockly.Msg["HUSKY_FORGET_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['mcu_huskylens_save_knowledge'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HUSKY_SAVE_KNOWLEDGE"],
      "args0": [
        { "type": "field_number", "name": "KNOWLEDGE_ID", "value": 0, "min": 0, "max": 4, "precision": 1 }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_HUSKYLENS"],
      "tooltip": Blockly.Msg["HUSKY_SAVE_KNOWLEDGE_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['mcu_huskylens_load_knowledge'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HUSKY_LOAD_KNOWLEDGE"],
      "args0": [
        { "type": "field_number", "name": "KNOWLEDGE_ID", "value": 0, "min": 0, "max": 4, "precision": 1 }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_HUSKYLENS"],
      "tooltip": Blockly.Msg["HUSKY_LOAD_KNOWLEDGE_TOOLTIP"],
      "helpUrl": ""
    });
  }
};

Blockly.Blocks['mcu_huskylens_set_name'] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["HUSKY_SET_NAME"],
      "args0": [
        { "type": "field_number", "name": "ID", "value": 1, "min": 1, "max": 255, "precision": 1 },
        { "type": "field_input", "name": "NAME", "text": "cat" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_HUSKYLENS"],
      "tooltip": Blockly.Msg["HUSKY_SET_NAME_TOOLTIP"],
      "helpUrl": ""
    });
  }
};
