// AI Inference Generators: 訓練積木的 Python 程式碼產生器

Blockly.Python.forBlock['py_ai_train_init'] = function(block, generator) {
  const epochs = block.getFieldValue('EPOCHS');
  const batchSize = block.getFieldValue('BATCH_SIZE');
  const learningRate = block.getFieldValue('LEARNING_RATE');

  const code = '{\n' +
    "    'epochs': " + epochs + ",\n" +
    "    'batch_size': " + batchSize + ",\n" +
    "    'learning_rate': " + learningRate + "\n" +
    '}\n';
  return [code, Blockly.Python.ORDER_ATOMIC];
};

Blockly.Python.forBlock['py_ai_train_run'] = function(block, generator) {
  const datasetDir = block.getFieldValue('DATASET_DIR');
  const modelDir = block.getFieldValue('MODEL_DIR');
  const epochs = block.getFieldValue('EPOCHS');
  const batchSize = block.getFieldValue('BATCH_SIZE');
  const learningRate = block.getFieldValue('LEARNING_RATE');
  const taskType = block.getFieldValue('TASK_TYPE');
  const backend = block.getFieldValue('BACKEND');

  // 新參數
  const validationSplit = block.getFieldValue('VALIDATION_SPLIT');
  const dropout = block.getFieldValue('DROPOUT');
  const augmentation = block.getFieldValue('AUGMENTATION');
  const backbone = block.getFieldValue('BACKBONE');
  const optimizer = block.getFieldValue('OPTIMIZER');
  const dnnLayers = block.getFieldValue('DNN_LAYERS');
  const fineTune = block.getFieldValue('FINE_TUNE');

  const useRemote = (window.CocoyaUI && window.CocoyaUI.cloudAiEnabled) ? 'True' : 'False';

  let backendCode;
  if (backend === 'auto') {
    backendCode = "'remote' if " + useRemote + " else 'local'";
  } else if (backend === 'remote') {
    backendCode = "'remote'";
  } else {
    backendCode = "'local'";
  }

  // 注入 train_model 函式定義
  if (!generator.definitions_['train_model_func']) {
    generator.definitions_['train_model_func'] = 'def train_model(dataset_dir, model_dir, task_type, backend, epochs, batch_size, learning_rate, validation_split, dropout, augmentation, backbone, optimizer, dnn_layers, fine_tune):\n' +
      '    import subprocess\n' +
      '    import sys\n' +
      '    import os\n' +
      '    import json\n' +
      '    \n' +
      '    # 確保模型輸出目錄存在\n' +
      '    os.makedirs(model_dir, exist_ok=True)\n' +
      '    \n' +
      '    # 根據任務類型選擇訓練腳本\n' +
      '    if task_type == "classifier":\n' +
      '        script_name = "classifier_train.py"\n' +
      '    elif task_type == "detector":\n' +
      '        script_name = "detector_train.py"\n' +
      '    elif task_type == "line_follower":\n' +
      '        script_name = "line_follower_train.py"\n' +
      '    elif task_type == "table":\n' +
      '        script_name = "table_train.py"\n' +
      '    else:\n' +
      '        print(f"錯誤: 不支援的任務類型: {task_type}")\n' +
      '        return False\n' +
      '    \n' +
      '    # 呼叫訓練腳本\n' +
      '    # 使用絕對路徑，避免工作目錄問題\n' +
      '    script_path = os.path.abspath(os.path.join(os.path.dirname(sys.argv[0]), "..", "resources", "train_templates", task_type, script_name))\n' +
      '    \n' +
      '    if not os.path.exists(script_path):\n' +
      '        print(f"錯誤: 找不到訓練腳本 {script_path}")\n' +
      '        return False\n' +
      '    \n' +
      '    cmd = [\n' +
      '        sys.executable, script_path,\n' +
      '        "--dataset_dir", dataset_dir,\n' +
      '        "--output_dir", model_dir,\n' +
      '        "--epochs", str(epochs),\n' +
      '        "--batch_size", str(batch_size),\n' +
      '        "--learning_rate", str(learning_rate),\n' +
      '        "--project_name", os.path.basename(dataset_dir),\n' +
      '        "--validation_split", str(validation_split),\n' +
      '        "--dropout", str(dropout),\n' +
      '        "--augmentation", str(augmentation).lower(),\n' +
      '        "--backbone", backbone,\n' +
      '        "--optimizer", optimizer,\n' +
      '        "--dnn_layers", dnn_layers,\n' +
      '        "--fine_tune", str(fine_tune).lower()\n' +
      '    ]\n' +
      '    \n' +
      '    print("執行訓練命令: " + " ".join(cmd))\n' +
      '    print("\\n開始訓練，請稍候...\\n")\n' +
      '    \n' +
      '    # 使用 Popen 即時顯示輸出\n' +
      '    process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, universal_newlines=True)\n' +
      '    \n' +
      '    # 即時讀取並顯示輸出\n' +
      '    for line in process.stdout:\n' +
      '        print(line, end=\'\')\n' +
      '    \n' +
      '    process.wait()\n' +
      '    \n' +
      '    if process.returncode != 0:\n' +
      '        print("\\n訓練失敗")\n' +
      '        return False\n' +
      '    \n' +
      '    # 解析結果\n' +
      '    print("\\n訓練完成!")\n' +
      '    return True\n';
  }

  const code = '# 開始訓練\n' +
    'train_model(\n' +
    "    dataset_dir='" + datasetDir + "',\n" +
    "    model_dir='" + modelDir + "',\n" +
    "    task_type='" + taskType + "',\n" +
    '    backend=' + backendCode + ',\n' +
    '    epochs=' + epochs + ',\n' +
    '    batch_size=' + batchSize + ',\n' +
    '    learning_rate=' + learningRate + ',\n' +
    '    validation_split=' + validationSplit + ',\n' +
    '    dropout=' + dropout + ',\n' +
    '    augmentation=' + (augmentation ? 'True' : 'False') + ',\n' +
    "    backbone='" + backbone + "',\n" +
    "    optimizer='" + optimizer + "',\n" +
    "    dnn_layers='" + dnnLayers + "',\n" +
    '    fine_tune=' + (fineTune ? 'True' : 'False') + '\n' +
    ')\n';
  return code;
};

// === 通用推論產生器 ===

Blockly.Python.forBlock['py_ai_model_init'] = function(block, generator) {
  var modelPath = block.getFieldValue('MODEL_PATH');
  var taskType = block.getFieldValue('TASK_TYPE');

  var defName = 'module_ai_inference';
  if (!generator.definitions_[defName]) {
    generator.definitions_[defName] = 'class _ModelInference:\n' +
      '    def __init__(self, model_path, task_type):\n' +
      '        import os, sys, cv2, numpy as np\n' +
      '        try:\n' +
      '            import tflite_runtime.interpreter as tflite\n' +
      '        except ImportError:\n' +
      '            try:\n' +
      '                from tensorflow import lite as tflite\n' +
      '            except ImportError:\n' +
      '                print("Error: install tflite-runtime"); sys.exit(1)\n' +
      '        # 智能搜尋模型檔案\n' +
      '        if not model_path.endswith(".tflite"):\n' +
      '            if os.path.isdir(model_path):\n' +
      '                import glob\n' +
      '                tflite_files = glob.glob(os.path.join(model_path, "*.tflite"))\n' +
      '                if tflite_files:\n' +
      '                    if len(tflite_files) > 1:\n' +
      '                        print(f"警告: 找到多個模型檔案，使用第一個: {tflite_files[0]}")\n' +
      '                    model_path = tflite_files[0]\n' +
      '                else:\n' +
      '                    model_path = model_path + ".tflite"\n' +
      '        d = os.path.dirname(model_path)\n' +
      '        lbl = os.path.join(d, os.path.basename(d) + "_labels.txt")\n' +
      '        if not os.path.exists(model_path): raise FileNotFoundError("Model: " + model_path)\n' +
      '        if not os.path.exists(lbl): raise FileNotFoundError("Labels: " + lbl)\n' +
      '        self.it = tflite.Interpreter(model_path=model_path)\n' +
      '        self.it.allocate_tensors(); self.i = self.it.get_input_details(); self.o = self.it.get_output_details()\n' +
      '        self.isf = self.i[0]["dtype"] == np.float32\n' +
      '        self.ls = [line.strip() for line in open(lbl)]\n' +
      '        self.task_type = task_type\n' +
      '    \n' +
      '    def _preprocess(self, frame):\n' +
      '        import numpy as np\n' +
      '        if frame is None or frame.size == 0:\n' +
      '            return None\n' +
      '        s = self.i[0]["shape"][1]\n' +
      '        d2 = cv2.resize(frame, (s, s))\n' +
      '        d2 = d2.astype(np.float32)/255.0 if self.isf else d2.astype(np.uint8)\n' +
      '        d2 = np.expand_dims(d2, axis=0)\n' +
      '        return d2\n' +
      '    \n' +
      '    def _classify(self, frame):\n' +
      '        import numpy as np\n' +
      '        d2 = self._preprocess(frame)\n' +
      '        if d2 is None:\n' +
      '            return {"type": "classifier", "label": "none", "confidence": 0.0}\n' +
      '        self.it.set_tensor(self.i[0]["index"], d2); self.it.invoke()\n' +
      '        out = self.it.get_tensor(self.o[0]["index"])[0]\n' +
      '        out = out.astype(np.float32)/255.0 if not self.isf else out\n' +
      '        cid = int(np.argmax(out)); conf = float(out[cid])\n' +
      '        lb = self.ls[cid] if cid < len(self.ls) else "class_" + str(cid)\n' +
      '        return {"type": "classifier", "label": lb, "confidence": conf}\n' +
      '    \n' +
      '    def _detect(self, frame):\n' +
      '        # 物件偵測推論（預留接口）\n' +
      '        import numpy as np\n' +
      '        d2 = self._preprocess(frame)\n' +
      '        if d2 is None:\n' +
      '            return {"type": "detector", "objects": []}\n' +
      '        self.it.set_tensor(self.i[0]["index"], d2); self.it.invoke()\n' +
      '        # 目前回傳空結果，待 detector_train.py 實作後補齊\n' +
      '        return {"type": "detector", "objects": []}\n' +
      '    \n' +
      '    def _follow_line(self, frame):\n' +
      '        # 循線偵測推論（預留接口）\n' +
      '        import numpy as np\n' +
      '        d2 = self._preprocess(frame)\n' +
      '        if d2 is None:\n' +
      '            return {"type": "line_follower", "direction": "none", "confidence": 0.0}\n' +
      '        self.it.set_tensor(self.i[0]["index"], d2); self.it.invoke()\n' +
      '        # 目前回傳空結果，待 line_follower_train.py 實作後補齊\n' +
      '        return {"type": "line_follower", "direction": "none", "confidence": 0.0}\n' +
      '    \n' +
      '    def _table_predict(self, data):\n' +
      '        # 表格資料推論（預留接口）\n' +
      '        return {"type": "table", "prediction": 0.0, "confidence": 0.0}\n' +
      '    \n' +
      '    def predict(self, frame):\n' +
      '        if self.task_type == "classifier":\n' +
      '            return self._classify(frame)\n' +
      '        elif self.task_type == "detector":\n' +
      '            return self._detect(frame)\n' +
      '        elif self.task_type == "line_follower":\n' +
      '            return self._follow_line(frame)\n' +
      '        elif self.task_type == "table":\n' +
      '            return self._table_predict(frame)\n' +
      '        else:\n' +
      '            return {"type": "unknown", "error": "unknown task type"}\n';
  }
  var code = '_model_inference = _ModelInference("' + modelPath + '", "' + taskType + '")\n';
  return code;
};

Blockly.Python.forBlock['py_ai_model_predict'] = function(block, generator) {
  var frameCode = block.getInput('FRAME') ?
    Blockly.Python.valueToCode(block, 'FRAME', Blockly.Python.ORDER_ATOMIC) || 'None' :
    'None';
  var code = '_model_inference.predict(' + frameCode + ')';
  if (!block.outputConnection) {
    return code + '\n';
  }
  return [code, Blockly.Python.ORDER_FUNCTION_CALL];
};

// === 解析積木產生器 ===

Blockly.Python.forBlock['py_ai_get_label'] = function(block, generator) {
  var resultCode = Blockly.Python.valueToCode(block, 'RESULT', Blockly.Python.ORDER_ATOMIC) || '{}';
  var code = resultCode + '.get("label", "none")';
  if (!block.outputConnection) {
    return code + '\n';
  }
  return [code, Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['py_ai_get_confidence'] = function(block, generator) {
  var resultCode = Blockly.Python.valueToCode(block, 'RESULT', Blockly.Python.ORDER_ATOMIC) || '{}';
  var code = resultCode + '.get("confidence", 0.0)';
  if (!block.outputConnection) {
    return code + '\n';
  }
  return [code, Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['py_ai_get_bbox'] = function(block, generator) {
  var resultCode = Blockly.Python.valueToCode(block, 'RESULT', Blockly.Python.ORDER_ATOMIC) || '{}';
  var code = resultCode + '.get("objects", [{}])[0].get("bbox", (0, 0, 0, 0)) if ' + resultCode + '.get("objects", []) else (0, 0, 0, 0)';
  if (!block.outputConnection) {
    return code + '\n';
  }
  return [code, Blockly.Python.ORDER_FUNCTION_CALL];
};

Blockly.Python.forBlock['py_ai_get_direction'] = function(block, generator) {
  var resultCode = Blockly.Python.valueToCode(block, 'RESULT', Blockly.Python.ORDER_ATOMIC) || '{}';
  var code = resultCode + '.get("direction", "none")';
  if (!block.outputConnection) {
    return code + '\n';
  }
  return [code, Blockly.Python.ORDER_FUNCTION_CALL];
};