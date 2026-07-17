// AI Inference Blocks: 訓練與推論積木

Blockly.Blocks['py_ai_train_run'] = {
  init: function() {
    // 不使用 jsonInit，完全手動建立結構
    this.appendDummyInput()
        .appendField(Blockly.Msg["AI_TRAIN_RUN"]);

    // === 基本設定區 ===
    this.appendDummyInput()
        .appendField(Blockly.Msg["AI_TRAIN_SECTION_BASIC"]);

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

    // 基本區新增 3 個欄位
    this.appendDummyInput()
        .appendField(Blockly.Msg["AI_TRAIN_FIELD_VAL_SPLIT"])
        .appendField(new Blockly.FieldNumber(0.2, 0.1, 0.5, 0.1), 'VALIDATION_SPLIT')
        .appendField(Blockly.Msg["AI_TRAIN_FIELD_DROPOUT"])
        .appendField(new Blockly.FieldNumber(0.2, 0.0, 0.9, 0.1), 'DROPOUT')
        .appendField(Blockly.Msg["AI_TRAIN_FIELD_AUG"])
        .appendField(new Blockly.FieldCheckbox(true), 'AUGMENTATION');

    this.appendDummyInput()
        .appendField(Blockly.Msg["AI_TRAIN_FIELD_TYPE"])
        .appendField(new Blockly.FieldDropdown([
          [Blockly.Msg["AI_TASK_CLASSIFIER"], "classifier"],
          [Blockly.Msg["AI_TASK_DETECTOR"], "detector"],
          [Blockly.Msg["AI_TASK_LINE_FOLLOWER"], "line_follower"],
          [Blockly.Msg["AI_TASK_TABLE"], "table"]
        ]), 'TASK_TYPE')
        .appendField(Blockly.Msg["AI_TRAIN_FIELD_BACKEND"])
        .appendField(new Blockly.FieldDropdown([
          [Blockly.Msg["AI_BACKEND_AUTO"], "auto"],
          [Blockly.Msg["AI_BACKEND_LOCAL"], "local"],
          [Blockly.Msg["AI_BACKEND_REMOTE"], "remote"]
        ]), 'BACKEND');

    // === 進階設定區（分組顯示）===
    this.appendDummyInput()
        .appendField(Blockly.Msg["AI_TRAIN_SECTION_ADVANCED"]);

    this.appendDummyInput()
        .appendField(Blockly.Msg["AI_TRAIN_FIELD_BACKBONE"])
        .appendField(new Blockly.FieldDropdown([
          ["MobileNetV2", "mobilenetv2"],
          ["EfficientNetB0", "efficientnet"],
          ["ResNet50", "resnet"]
        ]), 'BACKBONE')
        .appendField(Blockly.Msg["AI_TRAIN_FIELD_OPTIMIZER"])
        .appendField(new Blockly.FieldDropdown([
          ["Adam", "adam"],
          ["SGD", "sgd"],
          ["RMSprop", "rmsprop"]
        ]), 'OPTIMIZER');

    this.appendDummyInput()
        .appendField(Blockly.Msg["AI_TRAIN_FIELD_DNN_LAYERS"])
        .appendField(new Blockly.FieldTextInput("128,64"), 'DNN_LAYERS')
        .appendField(Blockly.Msg["AI_TRAIN_FIELD_FINE_TUNE"])
        .appendField(new Blockly.FieldCheckbox(false), 'FINE_TUNE');

    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(Blockly.Msg["COLOUR_AI_INFERENCE"]);
    this.setTooltip(Blockly.Msg["AI_TRAIN_RUN_TOOLTIP"]);
    this.setHelpUrl("py_ai_train_run");
  }
};



// 推論積木

Blockly.Blocks["py_ai_model_init"] = {
  init: function() {
    this.appendDummyInput()
        .appendField(Blockly.Msg["AI_MODEL_INIT"])
        .appendField(new Blockly.FieldTextInput("model"), 'MODEL_PATH');

    // 新增 TASK_TYPE 欄位
    this.appendDummyInput()
        .appendField(Blockly.Msg["AI_TRAIN_FIELD_TYPE"])
        .appendField(new Blockly.FieldDropdown([
          [Blockly.Msg["AI_TASK_CLASSIFIER"], "classifier"],
          [Blockly.Msg["AI_TASK_DETECTOR"], "detector"],
          [Blockly.Msg["AI_TASK_LINE_FOLLOWER"], "line_follower"],
          [Blockly.Msg["AI_TASK_TABLE"], "table"]
        ]), 'TASK_TYPE');

    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(Blockly.Msg["COLOUR_AI_INFERENCE"]);
    this.setTooltip(Blockly.Msg["AI_MODEL_INIT_TOOLTIP"]);
    this.setHelpUrl("py_ai_model_init");
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
      "tooltip": Blockly.Msg["AI_MODEL_PREDICT_TOOLTIP"],
      "helpUrl": "py_ai_model_predict"
    });
    this.setOutput(true, "InferenceResult");
  }
};

// === 解析積木 ===

Blockly.Blocks["py_ai_get_label"] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_GET_LABEL"],
      "args0": [
        { "type": "input_value", "name": "RESULT" }
      ],
      "colour": Blockly.Msg["COLOUR_AI_INFERENCE"],
      "tooltip": Blockly.Msg["AI_GET_LABEL_TOOLTIP"],
      "helpUrl": "py_ai_get_label"
    });
    this.setOutput(true, "String");
  }
};

Blockly.Blocks["py_ai_get_confidence"] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_GET_CONFIDENCE"],
      "args0": [
        { "type": "input_value", "name": "RESULT" }
      ],
      "colour": Blockly.Msg["COLOUR_AI_INFERENCE"],
      "tooltip": Blockly.Msg["AI_GET_CONFIDENCE_TOOLTIP"],
      "helpUrl": "py_ai_get_confidence"
    });
    this.setOutput(true, "Number");
  }
};

Blockly.Blocks["py_ai_get_bbox"] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_GET_BBOX"],
      "args0": [
        { "type": "input_value", "name": "RESULT" }
      ],
      "colour": Blockly.Msg["COLOUR_AI_INFERENCE"],
      "tooltip": Blockly.Msg["AI_GET_BBOX_TOOLTIP"],
      "helpUrl": "py_ai_get_bbox"
    });
    this.setOutput(true, "Tuple");
  }
};

Blockly.Blocks["py_ai_get_direction"] = {
  init: function() {
    this.jsonInit({
      "message0": Blockly.Msg["AI_GET_DIRECTION"],
      "args0": [
        { "type": "input_value", "name": "RESULT" }
      ],
      "colour": Blockly.Msg["COLOUR_AI_INFERENCE"],
      "tooltip": Blockly.Msg["AI_GET_DIRECTION_TOOLTIP"],
      "helpUrl": "py_ai_get_direction"
    });
    this.setOutput(true, "String");
  }
};
