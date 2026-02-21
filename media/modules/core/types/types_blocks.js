// Types Blocks: types_blocks.js

function getIcon(name) {
    const base = window.CocoyaMediaUri || 'icons';
    if (name === 'plus') return base + '/icons/add_circle_outline_24dp_1F1F1F.svg';
    if (name === 'minus') return base + '/icons/do_disturb_on_24dp_1F1F1F.svg';
    return '';
}

// --- List Block ---
Blockly.Blocks['py_type_list'] = {
  init: function() { this.itemCount_ = 3; this.setOutput(true, "Array"); this.setInputsInline(true); this.setColour(Blockly.Msg["COLOUR_TYPES"]); this.updateShape_(); },
  mutationToDom: function() { const container = Blockly.utils.xml.createElement('mutation'); container.setAttribute('items', this.itemCount_); return container; },
  domToMutation: function(xmlElement) { this.itemCount_ = parseInt(xmlElement.getAttribute('items'), 10) || 0; this.updateShape_(); },
  updateShape_: function(opt_skipIndex) {
    const conns = [];
    for (let i = 0; i < this.itemCount_; i++) {
        const input = this.getInput('ADD' + i);
        const conn = input ? input.connection.targetConnection : null;
        if (conn) conn.disconnect();
        if (opt_skipIndex !== undefined && i === opt_skipIndex) continue;
        conns.push(conn);
    }
    if (this.getInput('EMPTY')) this.removeInput('EMPTY');
    if (this.getInput('TAIL')) this.removeInput('TAIL');
    let i = 0; while (this.getInput('ADD' + i)) { this.removeInput('ADD' + i); i++; }

    if (this.itemCount_ === 0 || (opt_skipIndex !== undefined && this.itemCount_ === 1)) {
        this.appendDummyInput('EMPTY').appendField('[  ]').appendField(new Blockly.FieldImage(getIcon('plus'), 18, 18, '+', () => setTimeout(() => this.plus(), 0)), 'PLUS');
    } else {
        const displayCount = opt_skipIndex !== undefined ? this.itemCount_ - 1 : this.itemCount_;
        for (let j = 0; j < displayCount; j++) {
            const input = this.appendValueInput('ADD' + j);
            if (j === 0) input.appendField('['); else input.appendField(',');
        }
        this.appendDummyInput('TAIL')
            .appendField(']')
            .appendField(new Blockly.FieldImage(getIcon('minus'), 18, 18, '-', () => setTimeout(() => this.minus(this.itemCount_ - 1), 0)), 'MINUS')
            .appendField(new Blockly.FieldImage(getIcon('plus'), 18, 18, '+', () => setTimeout(() => this.plus(), 0)), 'PLUS');
    }
    for (let k = 0; k < conns.length; k++) { if (conns[k] && this.getInput('ADD' + k)) this.getInput('ADD' + k).connection.connect(conns[k]); }
  },
  plus: function() { window.CocoyaUtils.Mutator.execute(this, () => { this.itemCount_++; }, () => { this.updateShape_(); }); },
  minus: function(index) { if (this.itemCount_ > 0) { window.CocoyaUtils.Mutator.execute(this, () => { this.itemCount_--; }, () => { this.updateShape_(index); this.updateShape_(); }); } }
};

// --- Dict Block ---
Blockly.Blocks['py_type_dict'] = {
  init: function() {
    this.itemCount_ = 1;
    this.setOutput(true, "Dict");
    this.setInputsInline(true); 
    this.setColour(Blockly.Msg["COLOUR_TYPES"]);
    this.updateShape_();
  },
  mutationToDom: function() {
    const container = Blockly.utils.xml.createElement('mutation');
    container.setAttribute('items', this.itemCount_);
    return container;
  },
  domToMutation: function(xmlElement) {
    this.itemCount_ = parseInt(xmlElement.getAttribute('items'), 10) || 0;
    this.updateShape_();
  },
  updateShape_: function(opt_skipIndex) {
    const kConns = []; const vConns = [];
    for (let i = 0; i < this.itemCount_; i++) {
        const k = this.getInput('KEY' + i); const v = this.getInput('VAL' + i);
        const kc = k ? k.connection.targetConnection : null;
        const vc = v ? v.connection.targetConnection : null;
        if (kc) kc.disconnect(); if (vc) vc.disconnect();
        if (opt_skipIndex !== undefined && i === opt_skipIndex) continue;
        kConns.push(kc); vConns.push(vc);
    }

    if (this.getInput('HEAD')) this.removeInput('HEAD');
    if (this.getInput('TAIL')) this.removeInput('TAIL');
    if (this.getInput('EMPTY')) this.removeInput('EMPTY');
    let i = 0; while (this.getInput('KEY' + i)) {
        this.removeInput('KEY' + i);
        this.removeInput('VAL' + i);
        if (this.getInput('M_HOLDER' + i)) this.removeInput('M_HOLDER' + i);
        i++;
    }

    if (this.itemCount_ === 0 || (opt_skipIndex !== undefined && this.itemCount_ === 1)) {
        this.appendDummyInput('EMPTY').appendField('{  }').appendField(new Blockly.FieldImage(getIcon('plus'), 18, 18, '+', () => setTimeout(() => this.plus(), 0)), 'PLUS');
    } else {
        const displayCount = opt_skipIndex !== undefined ? this.itemCount_ - 1 : this.itemCount_;
        this.appendDummyInput('HEAD').appendField('{');
        for (let j = 0; j < displayCount; j++) {
            const kInput = this.appendValueInput('KEY' + j);
            if (j > 0) kInput.appendField(',');
            this.appendValueInput('VAL' + j).appendField(':');
        }
        this.appendDummyInput('TAIL')
            .appendField('}')
            .appendField(new Blockly.FieldImage(getIcon('minus'), 18, 18, '-', () => setTimeout(() => this.minus(this.itemCount_ - 1), 0)), 'MINUS')
            .appendField(new Blockly.FieldImage(getIcon('plus'), 18, 18, '+', () => setTimeout(() => this.plus(), 0)), 'PLUS');
    }

    for (let k = 0; k < kConns.length; k++) {
        if (kConns[k] && this.getInput('KEY' + k)) this.getInput('KEY' + k).connection.connect(kConns[k]);
        if (vConns[k] && this.getInput('VAL' + k)) this.getInput('VAL' + k).connection.connect(vConns[k]);
    }
  },
  plus: function() { window.CocoyaUtils.Mutator.execute(this, () => { this.itemCount_++; }, () => { this.updateShape_(); }); },
  minus: function(index) { if (this.itemCount_ > 0) { window.CocoyaUtils.Mutator.execute(this, () => { this.itemCount_--; }, () => { this.updateShape_(index); this.updateShape_(); }); } }
};

// --- Tuple Block ---
Blockly.Blocks['py_type_tuple'] = {
  init: function() { this.itemCount_ = 3; this.setOutput(true, "Tuple"); this.setInputsInline(true); this.setColour(Blockly.Msg["COLOUR_TYPES"]); this.updateShape_(); },
  mutationToDom: function() { const container = Blockly.utils.xml.createElement('mutation'); container.setAttribute('items', this.itemCount_); return container; },
  domToMutation: function(xmlElement) { this.itemCount_ = parseInt(xmlElement.getAttribute('items'), 10) || 0; this.updateShape_(); },
  updateShape_: function(opt_skipIndex) {
    const conns = [];
    for (let i = 0; i < this.itemCount_; i++) {
        const input = this.getInput('ADD' + i);
        const conn = input ? input.connection.targetConnection : null;
        if (conn) conn.disconnect();
        if (opt_skipIndex !== undefined && i === opt_skipIndex) continue;
        conns.push(conn);
    }
    if (this.getInput('EMPTY')) this.removeInput('EMPTY');
    if (this.getInput('TAIL')) this.removeInput('TAIL');
    let i = 0; while (this.getInput('ADD' + i)) { this.removeInput('ADD' + i); i++; }
    if (this.itemCount_ === 0 || (opt_skipIndex !== undefined && this.itemCount_ === 1)) {
        this.appendDummyInput('EMPTY').appendField('(  )').appendField(new Blockly.FieldImage(getIcon('plus'), 18, 18, '+', () => setTimeout(() => this.plus(), 0)), 'PLUS');
    } else {
        const displayCount = opt_skipIndex !== undefined ? this.itemCount_ - 1 : this.itemCount_;
        for (let j = 0; j < displayCount; j++) {
            const input = this.appendValueInput('ADD' + j);
            if (j === 0) input.appendField('('); else input.appendField(',');
        }
        this.appendDummyInput('TAIL')
            .appendField(')')
            .appendField(new Blockly.FieldImage(getIcon('minus'), 18, 18, '-', () => setTimeout(() => this.minus(this.itemCount_ - 1), 0)), 'MINUS')
            .appendField(new Blockly.FieldImage(getIcon('plus'), 18, 18, '+', () => setTimeout(() => this.plus(), 0)), 'PLUS');
    }
    for (let k = 0; k < conns.length; k++) { if (conns[k] && this.getInput('ADD' + k)) this.getInput('ADD' + k).connection.connect(conns[k]); }
  },
  plus: function() { window.CocoyaUtils.Mutator.execute(this, () => { this.itemCount_++; }, () => { this.updateShape_(); }); },
  minus: function(index) { if (this.itemCount_ > 0) { window.CocoyaUtils.Mutator.execute(this, () => { this.itemCount_--; }, () => { this.updateShape_(index); this.updateShape_(); }); } }
};

// --- Type Casting ---
Blockly.Blocks['py_types_cast'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 ( %2 )",
      "args0": [
        {
          "type": "field_dropdown",
          "name": "TYPE",
          "options": [
            ["int", "int"],
            ["float", "float"],
            ["str", "str"],
            ["bool", "bool"],
            ["list", "list"],
            ["tuple", "tuple"]
          ]
        },
        { "type": "input_value", "name": "VALUE" }
      ],
      "output": null,
      "colour": Blockly.Msg["COLOUR_TYPES"],
      "tooltip": "%{BKY_TYPES_CAST_TOOLTIP}"
    });
  }
};

// --- Type Of ---
Blockly.Blocks['py_types_type_of'] = {
  init: function() {
    this.jsonInit({
      "message0": "type ( %1 )",
      "args0": [{ "type": "input_value", "name": "VALUE" }],
      "output": null,
      "colour": Blockly.Msg["COLOUR_TYPES"],
      "tooltip": "%{BKY_TYPES_TYPE_OF_TOOLTIP}"
    });
  }
};

// --- Map Int (For OpenCV) ---
Blockly.Blocks['py_types_map_int'] = {
  init: function() {
    this.jsonInit({
      "message0": "tuple ( map ( int , %1 ) )",
      "args0": [{ "type": "input_value", "name": "VALUE" }],
      "output": "Tuple",
      "colour": Blockly.Msg["COLOUR_TYPES"],
      "tooltip": "%{BKY_TYPES_MAP_INT_TOOLTIP}"
    });
  }
};

// --- Get Length ---
Blockly.Blocks['py_types_len'] = {
  init: function() {
    this.jsonInit({
      "message0": "len ( %1 )",
      "args0": [{ "type": "input_value", "name": "VALUE" }],
      "output": "Number",
      "colour": Blockly.Msg["COLOUR_TYPES"],
      "tooltip": "%{BKY_TYPES_LEN_TOOLTIP}"
    });
  }
};

// --- Get Item (Index/Key) ---
Blockly.Blocks['py_types_get_item'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 [ %2 ]",
      "args0": [
        { "type": "input_value", "name": "OBJ" },
        { "type": "input_value", "name": "INDEX" }
      ],
      "output": null,
      "inputsInline": true,
      "colour": Blockly.Msg["COLOUR_TYPES"],
      "tooltip": "%{BKY_TYPES_GET_ITEM_TOOLTIP}"
    });
  }
};

// --- Set Item (Index/Key) ---
Blockly.Blocks['py_types_set_item'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 [ %2 ] = %3",
      "args0": [
        { "type": "input_value", "name": "OBJ" },
        { "type": "input_value", "name": "INDEX" },
        { "type": "input_value", "name": "VALUE" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "inputsInline": true,
      "colour": Blockly.Msg["COLOUR_TYPES"],
      "tooltip": "%{BKY_TYPES_SET_ITEM_TOOLTIP}"
    });
  }
};

// --- List Append ---
Blockly.Blocks['py_types_list_append'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 . append ( %2 )",
      "args0": [
        { "type": "input_value", "name": "LIST" },
        { "type": "input_value", "name": "ITEM" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "inputsInline": true,
      "colour": Blockly.Msg["COLOUR_TYPES"],
      "tooltip": "%{BKY_TYPES_LIST_APPEND_TOOLTIP}"
    });
  }
};

// --- Pop ---
Blockly.Blocks['py_types_pop'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 . pop ( %2 )",
      "args0": [
        { "type": "input_value", "name": "OBJ" },
        { "type": "input_value", "name": "INDEX" }
      ],
      "output": null,
      "inputsInline": true,
      "colour": Blockly.Msg["COLOUR_TYPES"],
      "tooltip": "%{BKY_TYPES_POP_TOOLTIP}"
    });
  }
};

// --- In Operator ---
Blockly.Blocks['py_types_in'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 in %2",
      "args0": [
        { "type": "input_value", "name": "ITEM" },
        { "type": "input_value", "name": "OBJ" }
      ],
      "output": "Boolean",
      "inputsInline": true,
      "colour": Blockly.Msg["COLOUR_TYPES"],
      "tooltip": "%{BKY_TYPES_IN_TOOLTIP}"
    });
  }
};

// --- Dict Keys/Values ---
Blockly.Blocks['py_types_dict_get_parts'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 ( %2 )",
      "args0": [
        {
          "type": "field_dropdown",
          "name": "PART",
          "options": [
            ["keys", "keys"],
            ["values", "values"]
          ]
        },
        { "type": "input_value", "name": "DICT" }
      ],
      "output": "Array",
      "inputsInline": true,
      "colour": Blockly.Msg["COLOUR_TYPES"],
      "tooltip": "取得字典的所有鍵或所有值，並轉為清單格式。"
    });
  }
};

// --- Universal Sorted (Expression) ---
Blockly.Blocks['py_types_sorted'] = {
  init: function() {
    this.jsonInit({
      "message0": "sorted ( %1 , reverse = %2 )",
      "args0": [
        { "type": "input_value", "name": "VALUE" },
        {
          "type": "field_dropdown",
          "name": "REVERSE",
          "options": [
            ["False", "False"],
            ["True", "True"]
          ]
        }
      ],
      "output": "Array",
      "inputsInline": true,
      "colour": Blockly.Msg["COLOUR_TYPES"],
      "tooltip": "%{BKY_TYPES_SORTED_TOOLTIP}"
    });
  }
};

// --- In-place Sort (Statement) ---
Blockly.Blocks['py_types_sort_list'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 . sort ( reverse = %2 )",
      "args0": [
        { "type": "input_value", "name": "LIST" },
        {
          "type": "field_dropdown",
          "name": "REVERSE",
          "options": [
            ["False", "False"],
            ["True", "True"]
          ]
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "inputsInline": true,
      "colour": Blockly.Msg["COLOUR_TYPES"],
      "tooltip": "%{BKY_TYPES_SORT_TOOLTIP}"
    });
  }
};
