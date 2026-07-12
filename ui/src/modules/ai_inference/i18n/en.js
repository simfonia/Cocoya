// AI Inference Module - English i18n

Blockly.Msg["CAT_AI_INFERENCE"] = "AI Inference";
Blockly.Msg["COLOUR_AI_INFERENCE"] = "#9C27B0";

// Training Blocks
Blockly.Msg["AI_TRAIN_RUN"] = "vision training";
Blockly.Msg["AI_TRAIN_RUN_TOOLTIP"] = "Start model training (uses remote mode if enabled)\n\nField descriptions:\n• Dataset: Image dataset folder path\n  Supports relative/absolute paths.\n  On Windows, use forward slashes\n  e.g. C:/dataset/images\n• Model: Model output folder (auto-extracted from dataset name)\n• Epochs: Training epochs (1-1000)\n• Batch: Batch size (1-512)\n• LR: Learning rate (0.0001-1)\n• Type: Task type (classifier/detector/line_follower)\n• Backend: Training location (auto/local/remote)\n\nNotes:\n• When unsaved, models output to temp_scripts/ folder\n• When saved, models output to workspace root";

// Field labels for training block
Blockly.Msg["AI_TRAIN_FIELD_DATASET"] = "Dataset:";
Blockly.Msg["AI_TRAIN_FIELD_MODEL"] = "Model:";
Blockly.Msg["AI_TRAIN_FIELD_EPOCHS"] = "Epochs:";
Blockly.Msg["AI_TRAIN_FIELD_BATCH"] = "Batch:";
Blockly.Msg["AI_TRAIN_FIELD_LR"] = "LR:";
Blockly.Msg["AI_TRAIN_FIELD_TYPE"] = "Type:";
Blockly.Msg["AI_TRAIN_FIELD_BACKEND"] = "Backend:";

// Task Types
Blockly.Msg["AI_TASK_CLASSIFIER"] = "classifier";
Blockly.Msg["AI_TASK_DETECTOR"] = "detector";
Blockly.Msg["AI_TASK_LINE_FOLLOWER"] = "line_follower";

// Backend Options
Blockly.Msg["AI_BACKEND_AUTO"] = "auto (follow remote mode)";
Blockly.Msg["AI_BACKEND_LOCAL"] = "local";
Blockly.Msg["AI_BACKEND_REMOTE"] = "remote";

// Inference Blocks
Blockly.Msg["AI_MODEL_INIT"] = "init model %1";
Blockly.Msg["AI_MODEL_INIT_TOOLTIP"] = "Load a trained TFLite model for inference\n\nField descriptions:\n• Model Path: Path to the .tflite model file\n  Supports relative/absolute paths\n  e.g. model/classifier_model\n\nNotes:\n• Automatically loads corresponding labels file\n• Labels file naming: {model name}_labels.txt\n• Model file naming: {model name}.tflite\n• Returns a model object for prediction";
Blockly.Msg["AI_MODEL_PREDICT"] = "predict %1";
Blockly.Msg["AI_MODEL_PREDICT_TOOLTIP"] = "Run inference on an image frame\n\nInput:\n• FRAME: Image frame (numpy array from OpenCV)\n\nOutput:\n• Tuple (label, confidence)\n  - label: Predicted class name (string)\n  - confidence: Prediction confidence (float 0-1)\n\nUsage:\n• Use with py_types_get_item to extract values\n• Index 0: class label\n• Index 1: confidence score\n\nExample:\n  result = predict(frame)\n  class_id = result[0]\n  confidence = result[1]";
