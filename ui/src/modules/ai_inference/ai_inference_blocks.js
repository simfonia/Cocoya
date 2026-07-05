// AI Inference Blocks: 訓練與推論積木


Blockly.Blocks['py_ai_train_run'] = {
  init: function() {
    // 不使用 jsonInit，完全手動建立結構
    this.appendDummyInput()
        .appendField(Blockly.Msg["AI_TRAIN_RUN"]);

    this.appendDummyInput()
        .appendField(Blockly.Msg["AI_TRAIN_FIELD_DATASET"])
        .appendField(new Blockly.FieldTextInput("dataset/classifier_dataset", function(newValue) {
          if (newValue && this.sourceBlock_) {
            const modelDirField = this.sourceBlock_.getField('MODEL_DIR');
            if (modelDirField) {
              const datasetName = newValue.split('/').pop().split('\\').pop();
              const newModelDir = "model/" + datasetName;
              modelDirField.setValue(newModelDir);
            }
          }
        }), 'DATASET_DIR');

    this.appendDummyInput()
        .appendField(Blockly.Msg["AI_TRAIN_FIELD_MODEL"])
        .appendField(new Blockly.FieldLabel("model/classifier_dataset"), 'MODEL_DIR');

    this.appendDummyInput()
        .appendField(Blockly.Msg["AI_TRAIN_FIELD_EPOCHS"])
        .appendField(new Blockly.FieldNumber(20, 1, 1000), 'EPOCHS')
        .appendField(Blockly.Msg["AI_TRAIN_FIELD_BATCH"])
        .appendField(new Blockly.FieldNumber(32, 1, 512), 'BATCH_SIZE')
        .appendField(Blockly.Msg["AI_TRAIN_FIELD_LR"])
        .appendField(new Blockly.FieldNumber(0.001, 0.0001, 1, 0.0001), 'LEARNING_RATE');

    this.appendDummyInput()
        .appendField(Blockly.Msg["AI_TRAIN_FIELD_TYPE"])
        .appendField(new Blockly.FieldDropdown([
          [Blockly.Msg["AI_TASK_CLASSIFIER"], "classifier"],
          [Blockly.Msg["AI_TASK_DETECTOR"], "detector"],
          [Blockly.Msg["AI_TASK_LINE_FOLLOWER"], "line_follower"]
        ]), 'TASK_TYPE')
        .appendField(Blockly.Msg["AI_TRAIN_FIELD_BACKEND"])
        .appendField(new Blockly.FieldDropdown([
          [Blockly.Msg["AI_BACKEND_AUTO"], "auto"],
          [Blockly.Msg["AI_BACKEND_LOCAL"], "local"],
          [Blockly.Msg["AI_BACKEND_REMOTE"], "remote"]
        ]), 'BACKEND');

    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(Blockly.Msg["COLOUR_AI_INFERENCE"]);
    this.setTooltip(Blockly.Msg["AI_TRAIN_RUN_TOOLTIP"]);
  }
};



// 推論積木

Blockly.Blocks["py_ai_model_init"] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_MODEL_INIT"],
      "args0": [
        { "type": "field_input", "name": "MODEL_PATH", "text": "model" }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": Blockly.Msg["COLOUR_AI_INFERENCE"],
      "tooltip": Blockly.Msg["AI_MODEL_INIT_TOOLTIP"]
    });
  }
};

Blockly.Blocks["py_ai_model_predict"] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_MODEL_PREDICT"],
      "args0": [
        { "type": "input_value", "name": "FRAME" }
      ],
      "colour": Blockly.Msg["COLOUR_AI_INFERENCE"],
      "tooltip": Blockly.Msg["AI_MODEL_PREDICT_TOOLTIP"]
    });
    this.setOutput(true, "Tuple");
  }
};