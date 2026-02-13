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
