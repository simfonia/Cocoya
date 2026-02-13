// Variables Blocks: variables_blocks.js

Blockly.Blocks['py_variables_set'] = {
  init: function() {
    this.appendValueInput("VALUE").appendField(new Blockly.FieldVariable("item"), "VAR").appendField(Blockly.Msg["PY_EQUAL"]);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_VARIABLES"]);
    this.setTooltip("");
  }
};

Blockly.Blocks['py_variables_get'] = {
  init: function() {
    this.appendDummyInput().appendField(new Blockly.FieldVariable("item"), "VAR");
    this.setOutput(true, null);
    this.setColour(Blockly.Msg["COLOUR_VARIABLES"]);
    this.setTooltip("");
  }
};

// --- Global Declaration Block ---
Blockly.Blocks['py_variables_global'] = {
  init: function() {
    this.itemCount_ = 1;
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_VARIABLES"]);
    this.updateShape_();
  },
  mutationToDom: function() {
    const container = Blockly.utils.xml.createElement('mutation');
    container.setAttribute('items', this.itemCount_);
    return container;
  },
  domToMutation: function(xmlElement) {
    this.itemCount_ = parseInt(xmlElement.getAttribute('items'), 10) || 1;
    this.updateShape_();
  },
  updateShape_: function() {
    const currentValues = [];
    for (let i = 0; i < this.itemCount_; i++) {
        const field = this.getField('VAR' + i);
        if (field) currentValues.push(field.getValue());
    }

    if (this.getInput('MAIN')) this.removeInput('MAIN');
    const input = this.appendDummyInput('MAIN');
    input.appendField(Blockly.Msg["PY_GLOBAL"]);
    
    const allVars = (this.workspace && !this.workspace.isFlyout) ? this.workspace.getAllVariables() : [];
    const existingVarName = allVars.length > 0 ? allVars[0].name : 'item';

    for (let i = 0; i < this.itemCount_; i++) {
        if (i > 0) input.appendField(",");
        const varField = new Blockly.FieldVariable(existingVarName);
        input.appendField(varField, "VAR" + i);
        if (currentValues[i]) varField.setValue(currentValues[i]);
    }
    input.appendField(new Blockly.FieldImage(getIcon('minus'), 16, 16, '-', () => setTimeout(() => this.minus(), 0)), 'MINUS');
    input.appendField(new Blockly.FieldImage(getIcon('plus'), 16, 16, '+', () => setTimeout(() => this.plus(), 0)), 'PLUS');
  },
  plus: function() { 
    window.CocoyaUtils.Mutator.execute(this, 
        () => { this.itemCount_++; }, 
        () => { this.updateShape_(); }
    ); 
  },
  minus: function() {
    if (this.itemCount_ > 1) {
        window.CocoyaUtils.Mutator.execute(this, 
            () => { this.itemCount_--; }, 
            () => { this.updateShape_(); }
        );
    }
  }
};

function getIcon(name) {
    const base = window.CocoyaMediaUri || 'icons';
    if (name === 'plus') return base + '/icons/add_circle_outline_24dp_1F1F1F.svg';
    if (name === 'minus') return base + '/icons/do_disturb_on_24dp_1F1F1F.svg';
    return '';
}
