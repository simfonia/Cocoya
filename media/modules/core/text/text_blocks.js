// Text Blocks: text_blocks.js

function getIcon(name) {
    const base = window.CocoyaMediaUri || 'icons';
    if (name === 'plus') return base + '/icons/add_circle_outline_24dp_1F1F1F.svg';
    if (name === 'minus') return base + '/icons/do_disturb_on_24dp_1F1F1F.svg';
    return '';
}

Blockly.Blocks['py_text'] = {
  init: function() {
    this.appendDummyInput().appendField('"').appendField(new Blockly.FieldTextInput(""), "TEXT").appendField('"');
    this.setOutput(true, "String");
    this.setColour(Blockly.Msg["COLOUR_TEXT"]);
  }
};

Blockly.Blocks['py_text_multiline'] = {
  init: function() {
    const FieldMultilineInput = window.FieldMultilineInput || Blockly.FieldMultilineInput;
    this.appendDummyInput().appendField('"""').appendField(new FieldMultilineInput(""), "TEXT").appendField('"""');
    this.setOutput(true, "String");
    this.setColour(Blockly.Msg["COLOUR_TEXT"]);
  }
};

Blockly.Blocks['py_text_length'] = {
  init: function() {
    this.appendValueInput("VALUE").setCheck(["String", "Array", "Dict", "Tuple"]).appendField("len(");
    this.appendDummyInput().appendField(")");
    this.setInputsInline(true);
    this.setOutput(true, "Number");
    this.setColour(Blockly.Msg["COLOUR_TEXT"]);
  }
};

Blockly.Blocks['py_text_join'] = {
  init: function() {
    this.itemCount_ = 2;
    this.setOutput(true, "String");
    this.setInputsInline(true);
    this.setColour(Blockly.Msg["COLOUR_TEXT"]);
    this.setTooltip(Blockly.Msg["TEXT_JOIN_TOOLTIP"]);
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
        this.appendDummyInput('EMPTY').appendField('f""').appendField(new Blockly.FieldImage(getIcon('plus'), 18, 18, '+', () => setTimeout(() => this.plus(), 0)), 'PLUS');
    } else {
        const displayCount = opt_skipIndex !== undefined ? this.itemCount_ - 1 : this.itemCount_;
        for (let j = 0; j < displayCount; j++) {
            const input = this.appendValueInput('ADD' + j);
            if (j === 0) input.appendField('f"');
        }
        this.appendDummyInput('TAIL')
            .appendField('"')
            .appendField(new Blockly.FieldImage(getIcon('minus'), 18, 18, '-', () => setTimeout(() => this.minus(this.itemCount_ - 1), 0)), 'MINUS')
            .appendField(new Blockly.FieldImage(getIcon('plus'), 18, 18, '+', () => setTimeout(() => this.plus(), 0)), 'PLUS');
    }
    for (let k = 0; k < conns.length; k++) {
        if (conns[k] && this.getInput('ADD' + k)) this.getInput('ADD' + k).connection.connect(conns[k]);
    }
  },
  plus: function() { window.CocoyaUtils.Mutator.execute(this, () => { this.itemCount_++; }, () => { this.updateShape_(); }); },
  minus: function(index) {
    if (this.itemCount_ > 0) {
        window.CocoyaUtils.Mutator.execute(this, () => { this.itemCount_--; }, () => { this.updateShape_(index); this.updateShape_(); });
    }
  }
};
