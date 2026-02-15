// Functions Blocks: functions_blocks.js

function getIcon(name) {
    const base = window.CocoyaMediaUri || 'icons';
    if (name === 'plus') return base + '/icons/add_circle_outline_24dp_1F1F1F.svg';
    if (name === 'minus') return base + '/icons/do_disturb_on_24dp_1F1F1F.svg';
    return '';
}

// --- Function Definition Block (修正：保留名稱與參數名) ---
Blockly.Blocks['py_function_def'] = {
  init: function() {
    this.paramCount_ = 0;
    this.setColour(Blockly.Msg["COLOUR_FUNCTIONS"]);
    this.updateShape_();
  },
  mutationToDom: function() {
    const container = Blockly.utils.xml.createElement('mutation');
    container.setAttribute('params', this.paramCount_);
    return container;
  },
  domToMutation: function(xmlElement) {
    this.paramCount_ = parseInt(xmlElement.getAttribute('params'), 10) || 0;
    this.updateShape_();
  },
  updateShape_: function() {
    // 1. 備份連線與欄位數值
    const doConn = this.getInput('DO') ? this.getInput('DO').connection.targetConnection : null;
    if (doConn) doConn.disconnect();

    const funcName = this.getFieldValue('NAME') || "my_function";
    const prmNames = [];
    for (let i = 0; i < this.paramCount_; i++) {
        prmNames.push(this.getFieldValue('PRM' + i) || ("p" + i));
    }

    // 2. 清理
    if (this.getInput('HEADER')) this.removeInput('HEADER');
    if (this.getInput('DO')) this.removeInput('DO');

    // 3. 重建單行標頭
    const header = this.appendDummyInput('HEADER');
    header.appendField(Blockly.Msg["PY_DEF"])
          .appendField(new Blockly.FieldTextInput(funcName), "NAME")
          .appendField("(");

    for (let j = 0; j < this.paramCount_; j++) {
        if (j > 0) header.appendField(",");
        header.appendField(new Blockly.FieldTextInput(prmNames[j]), "PRM" + j);
    }

    header.appendField(")")
          .appendField(Blockly.Msg["PY_COLON"])
          .appendField(new Blockly.FieldImage(getIcon('minus'), 16, 16, '-', () => setTimeout(() => this.minus(), 0)), 'MINUS')
          .appendField(new Blockly.FieldImage(getIcon('plus'), 16, 16, '+', () => setTimeout(() => this.plus(), 0)), 'PLUS');

    this.appendStatementInput("DO").setCheck(null);

    // 4. 恢復連線
    if (doConn && this.getInput('DO')) this.getInput('DO').connection.connect(doConn);
  },
  plus: function() { window.CocoyaUtils.Mutator.execute(this, () => { this.paramCount_++; this.updateShape_(); }); },
  minus: function() { if (this.paramCount_ > 0) { window.CocoyaUtils.Mutator.execute(this, () => { this.paramCount_--; this.updateShape_(); }); } }
};

// --- Function Call Block (修正：保留名稱) ---
Blockly.Blocks['py_function_call'] = {
  init: function() {
    this.argCount_ = 0;
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(Blockly.Msg["COLOUR_FUNCTIONS"]);
    this.updateShape_();
  },
  mutationToDom: function() {
    const container = Blockly.utils.xml.createElement('mutation');
    container.setAttribute('args', this.argCount_);
    return container;
  },
  domToMutation: function(xmlElement) {
    this.argCount_ = parseInt(xmlElement.getAttribute('args'), 10) || 0;
    this.updateShape_();
  },
  updateShape_: function(opt_skipIndex) {
    const conns = [];
    for (let i = 0; i < this.argCount_; i++) {
        const input = this.getInput('ARG' + i);
        const conn = (input && input.connection) ? input.connection.targetConnection : null;
        if (conn) conn.disconnect();
        if (opt_skipIndex !== undefined && i === opt_skipIndex) continue;
        conns.push(conn);
    }

    const funcName = this.getFieldValue('NAME') || "my_function";

    let i = 0; while (this.getInput('ARG' + i)) { this.removeInput('ARG' + i); i++; }
    if (this.getInput('HEAD')) this.removeInput('HEAD');
    if (this.getInput('TAIL')) this.removeInput('TAIL');

    this.appendDummyInput('HEAD')
        .appendField(new Blockly.FieldTextInput(funcName), "NAME")
        .appendField("(");

    this.setInputsInline(true);

    const displayCount = opt_skipIndex !== undefined ? this.argCount_ - 1 : this.argCount_;
    for (let j = 0; j < displayCount; j++) {
        const input = this.appendValueInput('ARG' + j);
        if (j > 0) input.appendField(",");
    }

    this.appendDummyInput('TAIL')
        .appendField(")")
        .appendField(new Blockly.FieldImage(getIcon('minus'), 16, 16, '-', () => setTimeout(() => this.minus(this.argCount_ - 1), 0)), 'MINUS')
        .appendField(new Blockly.FieldImage(getIcon('plus'), 16, 16, '+', () => setTimeout(() => this.plus(), 0)), 'PLUS');

    for (let k = 0; k < conns.length; k++) {
        const input = this.getInput('ARG' + k);
        if (conns[k] && input && input.connection) input.connection.connect(conns[k]);
    }
  },
  plus: function() { window.CocoyaUtils.Mutator.execute(this, () => { this.argCount_++; this.updateShape_(); }); },
  minus: function(idx) { if (this.argCount_ > 0) { window.CocoyaUtils.Mutator.execute(this, () => { this.argCount_--; this.updateShape_(idx); this.updateShape_(); }); } }
};

Blockly.Blocks['py_function_call_expr'] = {
  init: function() {
    this.argCount_ = 0;
    this.setOutput(true, null);
    this.setColour(Blockly.Msg["COLOUR_FUNCTIONS"]);
    this.updateShape_();
  },
  mutationToDom: Blockly.Blocks['py_function_call'].mutationToDom,
  domToMutation: Blockly.Blocks['py_function_call'].domToMutation,
  updateShape_: Blockly.Blocks['py_function_call'].updateShape_,
  plus: Blockly.Blocks['py_function_call'].plus,
  minus: Blockly.Blocks['py_function_call'].minus
};

Blockly.Blocks['py_function_return'] = { init: function() { this.appendValueInput("VALUE").appendField(Blockly.Msg["PY_RETURN"]); this.setPreviousStatement(true, null); this.setNextStatement(true, null); this.setColour(Blockly.Msg["COLOUR_FUNCTIONS"]); this.setTooltip("從函式回傳數值"); } };
Blockly.Blocks['py_function_local_set'] = { init: function() { this.appendValueInput("VALUE").appendField(Blockly.Msg["PY_LOCAL"]).appendField(new Blockly.FieldTextInput("x"), "VAR").appendField(Blockly.Msg["PY_EQUAL"]); this.setPreviousStatement(true, null); this.setNextStatement(true, null); this.setColour(Blockly.Msg["COLOUR_FUNCTIONS"]); this.setTooltip("設定或建立區域變數（僅限函式內部使用）"); } };
Blockly.Blocks['py_function_local_get'] = { init: function() { this.appendDummyInput().appendField(Blockly.Msg["PY_LOCAL"]).appendField(new Blockly.FieldTextInput("x"), "VAR"); this.setOutput(true, null); this.setColour(Blockly.Msg["COLOUR_FUNCTIONS"]); this.setTooltip("讀取區域變數或參數（僅限函式內部使用）"); } };
