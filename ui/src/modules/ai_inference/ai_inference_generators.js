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

  const useRemote = (window.CocoyaUI && window.CocoyaUI.cloudAiEnabled) ? 'True' : 'False';

  let backendCode;
  if (backend === 'auto') {
    backendCode = '\'remote\' if ' + useRemote + ' else \'local\'';
  } else if (backend === 'remote') {
    backendCode = "'remote'";
  } else {
    backendCode = "'local'";
  }

  // 注入 train_model 函式定義
  if (!generator.definitions_['train_model_func']) {
    generator.definitions_['train_model_func'] = 'def train_model(dataset_dir, model_dir, task_type, backend, epochs, batch_size, learning_rate):\n' +
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
      '        "--project_name", os.path.basename(dataset_dir)\n' +
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
    '    learning_rate=' + learningRate + '\n' +
    ')\n';
  return code;
};

// Inference generators

Blockly.Python.forBlock['py_ai_model_init'] = function(block, generator) {
  var modelPath = block.getFieldValue('MODEL_PATH');
  var defName = 'module_ai_classifier';
  if (!generator.definitions_[defName]) {
    generator.definitions_[defName] = 'class _ModelClassifier:\n' +
      '    def __init__(self, model_path):\n' +
      '        import os, sys, cv2, numpy as np\n' +
      '        try:\n' +
      '            import tflite_runtime.interpreter as tflite\n' +
      '        except ImportError:\n' +
      '            try:\n' +
      '                from tensorflow import lite as tflite\n' +
      '            except ImportError:\n' +
      '                print("Error: install tflite-runtime"); sys.exit(1)\n' +
      '        model_path = model_path + (".tflite" if not model_path.endswith(".tflite") else "")\n' +
      '        d = os.path.dirname(model_path)\n' +
      '        lbl = os.path.join(d, "labels.txt")\n' +
      '        if not os.path.exists(model_path): raise FileNotFoundError("Model: " + model_path)\n' +
      '        if not os.path.exists(lbl): raise FileNotFoundError("Labels: " + lbl)\n' +
      '        it = tflite.Interpreter(model_path=model_path)\n' +
      '        it.allocate_tensors(); i = it.get_input_details(); o = it.get_output_details()\n' +
      '        isf = i[0]["dtype"] == np.float32\n' +
      '        ls = [line.strip() for line in open(lbl)]\n' +
      '        def predict(frame):\n' +
      '            s = i[0]["shape"][1]\n' +
      '            d2 = cv2.resize(frame, (s, s))\n' +
      '            d2 = d2.astype(np.float32)/255.0 if isf else d2.astype(np.uint8)\n' +
      '            d2 = np.expand_dims(d2, axis=0)\n' +
      '            it.set_tensor(i[0]["index"], d2); it.invoke()\n' +
      '            out = it.get_tensor(o[0]["index"])[0]\n' +
      '            out = out.astype(np.float32)/255.0 if not isf else out\n' +
      '            cid = int(np.argmax(out)); conf = float(out[cid])\n' +
      '            lb = ls[cid] if cid < len(ls) else "class_" + str(cid)\n' +
      '            return (lb, conf)\n' +
      '        return predict\n' +
      '    \n' +
      '    def predict(self, frame):\n' +
      '        return self._predict(frame)';
  }
  var code = '_model_classifier = _ModelClassifier("' + modelPath + '")\n';
  return code;
};

Blockly.Python.forBlock['py_ai_model_predict'] = function(block, generator) {
  var frameCode = block.getInput('FRAME') ?
    Blockly.Python.valueToCode(block, 'FRAME', Blockly.Python.ORDER_ATOMIC) || 'None' :
    'None';
  var code = '_model_classifier.predict(' + frameCode + ')';
  if (!block.outputConnection) {
    return code + '\n';
  }
  return [code, Blockly.Python.ORDER_FUNCTION_CALL];
};