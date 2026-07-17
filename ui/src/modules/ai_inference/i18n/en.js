// AI Inference Module - English i18n

Blockly.Msg["CAT_AI_INFERENCE"] = "AI Inference";
Blockly.Msg["COLOUR_AI_INFERENCE"] = "#9C27B0";

// Training Blocks
Blockly.Msg["AI_TRAIN_RUN"] = "AI training";
Blockly.Msg["AI_TRAIN_RUN_TOOLTIP"] = "Start model training (uses remote mode if enabled)\n\nField descriptions:\n• Dataset: Image dataset folder path\n  Supports relative/absolute paths.\n  On Windows, use forward slashes\n  e.g. C:/dataset/images\n• Model: Model output folder (auto-extracted from dataset name)\n• Epochs: Training epochs (1-1000)\n• Batch: Batch size (1-512)\n• LR: Learning rate (0.0001-1)\n• Val Split: Validation set ratio (0.1-0.5)\n• Dropout: Dropout rate (0.0-0.9)\n• Aug: Enable data augmentation\n• Type: Task type (classifier/detector/line_follower/table)\n• Backend: Training location (auto/local/remote)\n\nAdvanced settings:\n• Backbone: Base model (MobileNetV2/EfficientNet/ResNet)\n• Optimizer: Optimizer (Adam/SGD/RMSprop)\n• DNN Layers: Custom FC layers (comma-separated, e.g. 128,64)\n• Fine-tune: Unfreeze backbone for fine-tuning\n\nNotes:\n• When unsaved, models output to temp_scripts/ folder\n• When saved, models output to workspace root";

// Section labels
Blockly.Msg["AI_TRAIN_SECTION_BASIC"] = "▸ Basic Settings";
Blockly.Msg["AI_TRAIN_SECTION_ADVANCED"] = "▸ Advanced Settings (keep defaults if unsure)";

// Field labels for training block
Blockly.Msg["AI_TRAIN_FIELD_DATASET"] = "Dataset:";
Blockly.Msg["AI_TRAIN_FIELD_MODEL"] = "Model:";
Blockly.Msg["AI_TRAIN_FIELD_EPOCHS"] = "Epochs:";
Blockly.Msg["AI_TRAIN_FIELD_BATCH"] = "Batch:";
Blockly.Msg["AI_TRAIN_FIELD_LR"] = "LR:";
Blockly.Msg["AI_TRAIN_FIELD_TYPE"] = "Type:";
Blockly.Msg["AI_TRAIN_FIELD_BACKEND"] = "Backend:";
Blockly.Msg["AI_TRAIN_FIELD_VAL_SPLIT"] = "Val Split:";
Blockly.Msg["AI_TRAIN_FIELD_DROPOUT"] = "Dropout:";
Blockly.Msg["AI_TRAIN_FIELD_AUG"] = "Aug:";
Blockly.Msg["AI_TRAIN_FIELD_BACKBONE"] = "Backbone:";
Blockly.Msg["AI_TRAIN_FIELD_OPTIMIZER"] = "Optimizer:";
Blockly.Msg["AI_TRAIN_FIELD_DNN_LAYERS"] = "DNN Layers:";
Blockly.Msg["AI_TRAIN_FIELD_FINE_TUNE"] = "Fine-tune:";

// Task Types
Blockly.Msg["AI_TASK_CLASSIFIER"] = "classifier";
Blockly.Msg["AI_TASK_DETECTOR"] = "detector";
Blockly.Msg["AI_TASK_LINE_FOLLOWER"] = "line_follower";
Blockly.Msg["AI_TASK_TABLE"] = "table";

// Backend Options
Blockly.Msg["AI_BACKEND_AUTO"] = "auto (follow remote mode)";
Blockly.Msg["AI_BACKEND_LOCAL"] = "local";
Blockly.Msg["AI_BACKEND_REMOTE"] = "remote";

// Inference Blocks
Blockly.Msg["AI_MODEL_INIT"] = "init model";
Blockly.Msg["AI_MODEL_INIT_TOOLTIP"] = "Load a trained TFLite model for inference\n\nField descriptions:\n• Model Path: Path to the .tflite model file\n  Supports relative/absolute paths\n  e.g. model/classifier_model\n• Type: Task type (classifier/detector/line_follower/table)\n  Determines the inference engine to use\n\nNotes:\n• Automatically loads corresponding labels file\n• Labels file naming: {model name}_labels.txt\n• Model file naming: {model name}.tflite\n• Returns a model object for prediction";
Blockly.Msg["AI_MODEL_PREDICT"] = "predict %1";
Blockly.Msg["AI_MODEL_PREDICT_TOOLTIP"] = "Run inference on an image frame\n\nInput:\n• FRAME: Image frame (numpy array from OpenCV)\n\nOutput:\n• InferenceResult dict with task-specific fields\n  - classifier: {type, label, confidence}\n  - detector: {type, objects: [{label, confidence, bbox}]}\n  - line_follower: {type, direction, confidence}\n  - table: {type, prediction, confidence}\n\nUsage:\n• Use get_label / get_confidence / get_bbox / get_direction\n  to extract specific values from the result";

// Extraction blocks
Blockly.Msg["AI_GET_LABEL"] = "get label %1";
Blockly.Msg["AI_GET_LABEL_TOOLTIP"] = "Extract the label string from an inference result\n\nInput:\n• RESULT: Inference result dict\n\nOutput:\n• String: Predicted class label\n  Returns 'none' if not available";
Blockly.Msg["AI_GET_CONFIDENCE"] = "get confidence %1";
Blockly.Msg["AI_GET_CONFIDENCE_TOOLTIP"] = "Extract the confidence score from an inference result\n\nInput:\n• RESULT: Inference result dict\n\nOutput:\n• Number: Confidence score (0.0-1.0)\n  Returns 0.0 if not available";
Blockly.Msg["AI_GET_BBOX"] = "get bbox %1";
Blockly.Msg["AI_GET_BBOX_TOOLTIP"] = "Extract the first bounding box from a detection result\n\nInput:\n• RESULT: Inference result dict (detector type)\n\nOutput:\n• Tuple (x1, y1, x2, y2): Bounding box coordinates\n  Returns (0,0,0,0) if not available";
Blockly.Msg["AI_GET_DIRECTION"] = "get direction %1";
Blockly.Msg["AI_GET_DIRECTION_TOOLTIP"] = "Extract the direction from a line follower result\n\nInput:\n• RESULT: Inference result dict (line_follower type)\n\nOutput:\n• String: Direction ('left', 'right', 'forward', 'none')\n  Returns 'none' if not available";