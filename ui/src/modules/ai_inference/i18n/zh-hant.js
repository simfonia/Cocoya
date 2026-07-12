// AI Inference Module - 繁體中文 i18n

Blockly.Msg["CAT_AI_INFERENCE"] = "AI 推論";
Blockly.Msg["COLOUR_AI_INFERENCE"] = "#9C27B0";

// Training Blocks
Blockly.Msg["AI_TRAIN_RUN"] = "影像訓練";
Blockly.Msg["AI_TRAIN_RUN_TOOLTIP"] = "開始模型訓練（若開啟遠端模式則使用遠端訓練）\n\n欄位說明：\n• 資料集：圖像資料集資料夾路徑\n  支援相對/絕對路徑，Windows 建議用\n  正斜線如 C:/dataset/images\n• 模型：模型輸出資料夾（自動從資料集名稱提取）\n• Epochs：訓練輪數（1-1000）\n• Batch：批次大小（1-512）\n• LR：學習率（0.0001-1）\n• 類型：任務類型（分類器/偵測器/循線）\n• 後端：訓練位置（自動/本地/遠端）\n\n注意：\n• 未存檔時，模型輸出至 temp_scripts/ 資料夾\n• 已存檔時，模型輸出至工作區根目錄";

// Field labels for training block
Blockly.Msg["AI_TRAIN_FIELD_DATASET"] = "資料集:";
Blockly.Msg["AI_TRAIN_FIELD_MODEL"] = "模型存放:";
Blockly.Msg["AI_TRAIN_FIELD_EPOCHS"] = "Epochs:";
Blockly.Msg["AI_TRAIN_FIELD_BATCH"] = "Batch:";
Blockly.Msg["AI_TRAIN_FIELD_LR"] = "LR:";
Blockly.Msg["AI_TRAIN_FIELD_TYPE"] = "類型:";
Blockly.Msg["AI_TRAIN_FIELD_BACKEND"] = "後端:";

// Task Types
Blockly.Msg["AI_TASK_CLASSIFIER"] = "分類器";
Blockly.Msg["AI_TASK_DETECTOR"] = "偵測器";
Blockly.Msg["AI_TASK_LINE_FOLLOWER"] = "循線";

// Backend Options
Blockly.Msg["AI_BACKEND_AUTO"] = "自動 (依【遠端訓練】開關設定)";
Blockly.Msg["AI_BACKEND_LOCAL"] = "本地";
Blockly.Msg["AI_BACKEND_REMOTE"] = "遠端";

// Inference Blocks
Blockly.Msg["AI_MODEL_INIT"] = "初始化模型 %1";
Blockly.Msg["AI_MODEL_INIT_TOOLTIP"] = "載入訓練好的 TFLite 模型用於推論\n\n欄位說明：\n• 模型路徑：.tflite 模型檔案的路徑\n  支援相對/絕對路徑\n  例如：model/classifier_model\n\n注意事項：\n• 自動載入對應的標籤檔\n• 標籤檔案命名：{model name}_labels.txt\n• 模型檔案命名：{model name}.tflite\n• 回傳模型物件用於推論";
Blockly.Msg["AI_MODEL_PREDICT"] = "推論 %1";
Blockly.Msg["AI_MODEL_PREDICT_TOOLTIP"] = "對影像幀執行推論\n\n輸入：\n• FRAME：影像幀（來自 OpenCV 的 numpy 陣列）\n\n輸出：\n• Tuple（標籤，信心度）\n  - 標籤：預測的類別名稱（字串）\n  - 信心度：預測信心度（浮點數 0-1）\n\n使用方式：\n• 使用 py_types_get_item 提取數值\n• 索引 0：類別標籤\n• 索引 1：信心度分數\n\n範例：\n  result = predict(frame)\n  class_id = result[0]\n  confidence = result[1]";
