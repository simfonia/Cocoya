// Logic Blocks: logic_blocks.js

// --- If-Elif-Else Block ---
Blockly.Blocks['py_logic_if'] = {
  init: function() {
    this.elifCount_ = 0;
    this.elsePresent_ = false;
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_LOGIC"]);
    this.updateShape_();
  },
  mutationToDom: function() {
    const container = Blockly.utils.xml.createElement('mutation');
    container.setAttribute('elif', this.elifCount_);
    container.setAttribute('else', this.elsePresent_ ? 1 : 0);
    return container;
  },
  domToMutation: function(xmlElement) {
    this.elifCount_ = parseInt(xmlElement.getAttribute('elif'), 10) || 0;
    this.elsePresent_ = parseInt(xmlElement.getAttribute('else'), 10) === 1;
    this.updateShape_();
  },
  updateShape_: function(opt_skipIndex) {
    const conds = []; const dos = [];
    for (let i = 0; i <= this.elifCount_; i++) {
        const c = this.getInput('IF' + i); const d = this.getInput('DO' + i);
        const cConn = c ? c.connection.targetConnection : null;
        const dConn = d ? d.connection.targetConnection : null;
        if (cConn) cConn.disconnect(); if (dConn) dConn.disconnect();
        if (opt_skipIndex !== undefined && i === opt_skipIndex) continue;
        conds.push(cConn); dos.push(dConn);
    }
    const eInput = this.getInput('ELSE');
    const elseConn = eInput ? eInput.connection.targetConnection : null;
    if (elseConn) elseConn.disconnect();

    let i = 0;
    while (this.getInput('IF' + i)) { this.removeInput('IF' + i); i++; }
    i = 0;
    while (this.getInput('DO' + i)) { this.removeInput('DO' + i); i++; }
    i = 0;
    while (this.getInput('C' + i)) { this.removeInput('C' + i); i++; }
    if (this.getInput('ELSE')) this.removeInput('ELSE');
    if (this.getInput('ELSE_HEADER')) this.removeInput('ELSE_HEADER');
    if (this.getInput('ADD_ELSE_ROW')) this.removeInput('ADD_ELSE_ROW');

    this.appendValueInput('IF0').setCheck('Boolean')
        .appendField(new Blockly.FieldImage(getIcon('plus'), 16, 16, '+', () => setTimeout(() => this.plusElif(), 0)), 'PLUS_ELIF')
        .appendField('if');
    this.appendDummyInput('C0').appendField(':');
    this.appendStatementInput('DO0');

    for (let j = 1; j <= this.elifCount_; j++) {
        this.appendValueInput('IF' + j).setCheck('Boolean')
            .appendField(new Blockly.FieldImage(getIcon('minus'), 16, 16, '-', () => setTimeout(() => this.minusElif(j), 0)), 'MINUS_ELIF' + j)
            .appendField('elif');
        this.appendDummyInput('C' + j).appendField(':');
        this.appendStatementInput('DO' + j);
    }

    if (this.elsePresent_) {
        this.appendDummyInput('ELSE_HEADER')
            .appendField(new Blockly.FieldImage(getIcon('minus'), 16, 16, '-', () => setTimeout(() => this.removeElse(), 0)), 'MINUS_ELSE')
            .appendField('else:');
        this.appendStatementInput('ELSE');
    } else {
        this.appendDummyInput('ADD_ELSE_ROW')
            .appendField(new Blockly.FieldImage(getIcon('plus'), 16, 16, '+', () => setTimeout(() => this.addElse(), 0)), 'PLUS_ELSE')
            .appendField('add else');
    }

    for (let k = 0; k < conds.length; k++) {
        if (conds[k] && this.getInput('IF' + k)) this.getInput('IF' + k).connection.connect(conds[k]);
        if (dos[k] && this.getInput('DO' + k)) this.getInput('DO' + k).connection.connect(dos[k]);
    }
    if (this.elsePresent_ && elseConn && this.getInput('ELSE')) {
        this.getInput('ELSE').connection.connect(elseConn);
    }
  },
  plusElif: function() { window.CocoyaUtils.Mutator.execute(this, () => { this.elifCount_++; }, () => { this.updateShape_(); }); },
  addElse: function() { window.CocoyaUtils.Mutator.execute(this, () => { this.elsePresent_ = true; }, () => { this.updateShape_(); }); },
  removeElse: function() {
    window.CocoyaUtils.Mutator.execute(this, 
        () => { this.elsePresent_ = false; }, 
        () => { 
            const conn = this.getInput('ELSE') ? this.getInput('ELSE').connection.targetConnection : null;
            if (conn) conn.disconnect();
            this.updateShape_(); 
        }
    );
  },
  minusElif: function(index) {
    window.CocoyaUtils.Mutator.execute(this, 
        () => { this.elifCount_--; }, 
        () => { 
            this.updateShape_(index); 
            this.updateShape_(); 
        }
    );
  }
};

function getIcon(name) {
    const base = window.CocoyaMediaUri || 'icons';
    if (name === 'plus') return base + '/icons/add_circle_outline_24dp_1F1F1F.svg';
    if (name === 'minus') return base + '/icons/do_disturb_on_24dp_1F1F1F.svg';
    return '';
}

// --- Comparison ---
Blockly.Blocks['py_logic_compare'] = {
  init: function() {
    this.appendValueInput("A");
    this.appendValueInput("B")
        .appendField(new Blockly.FieldDropdown([
            ["==", "=="], ["!=", "!="], ["<", "<"], ["<=", "<="], [">", ">"], [">=", ">="]
        ]), "OP");
    this.setInputsInline(true);
    this.setOutput(true, "Boolean");
    this.setColour(Blockly.Msg["COLOUR_LOGIC"]);
  }
};

// --- And/Or ---
Blockly.Blocks['py_logic_operation'] = {
  init: function() {
    this.appendValueInput("A").setCheck("Boolean");
    this.appendValueInput("B").setCheck("Boolean")
        .appendField(new Blockly.FieldDropdown([["and", "and"], ["or", "or"]]), "OP");
    this.setInputsInline(true);
    this.setOutput(true, "Boolean");
    this.setColour(Blockly.Msg["COLOUR_LOGIC"]);
  }
};

// --- Not ---
Blockly.Blocks['py_logic_negate'] = {
  init: function() {
    this.appendValueInput("BOOL").setCheck("Boolean")
        .appendField("not");
    this.setOutput(true, "Boolean");
    this.setColour(Blockly.Msg["COLOUR_LOGIC"]);
  }
};

// --- Boolean/None ---
Blockly.Blocks['py_logic_boolean'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown([["True", "True"], ["False", "False"], ["None", "None"]]), "BOOL");
    this.setOutput(true);
    this.setColour(Blockly.Msg["COLOUR_LOGIC"]);
  }
};
