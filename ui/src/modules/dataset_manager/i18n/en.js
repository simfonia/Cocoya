/**
 * Dataset Manager i18n - English
 * All DSM_ prefixed keys are used by the Dataset Manager module
 */
(function (Blockly) {
  Blockly.Msg = Blockly.Msg || {};
  Object.assign(Blockly.Msg, {
    // Title & general
    "DSM_TITLE": "Dataset Manager",
    "DSM_SUBTITLE": "Dataset Spec",
    "DSM_CLEAR_DATA": "Clear Data",
    "DSM_CLEAR_DATA_TOOLTIP": "Clear all cached data and reset",
    "DSM_CLOSE": "Close",
    "DSM_VALIDATE": "Validate",
    "DSM_EXPORT": "Export Dataset",

    // Source panel
    "DSM_SOURCE": "Source",
    "DSM_PROJECT_TYPE": "Project Type",
    "DSM_SOURCE_MODE": "Source Mode",
    "DSM_SELECT_CSV": "Select CSV / JSON File",
    "DSM_SELECT_IMAGE_FOLDER": "Select Image Folder",
    "DSM_UPLOAD_ZIP": "☁️ Upload Local Dataset (ZIP)",
    "DSM_PROJECT_NAME": "Dataset Name",
    "DSM_PROJECT_NAME_PLACEHOLDER": "Alphanumeric and underscore only",
    "DSM_PROJECT_NAME_HINT": "* English, numbers, and underscore only (used for cloud paths)",
    "DSM_DESCRIPTION": "Description",
    "DSM_DESCRIPTION_PLACEHOLDER": "Project description...",

    // Columns & labels
    "DSM_STRUCTURE_TITLE": "Columns & Labels",
    "DSM_LABEL_STATS_TITLE": "Labels & Sample Stats",
    "DSM_ADD_FEATURE": "Add Feature",
    "DSM_ADD_LABEL": "Add Label",
    "DSM_COLUMN_NAME": "Name",
    "DSM_COLUMN_TYPE": "Type",
    "DSM_COLUMN_ROLE": "Role",
    "DSM_COLUMN_NAME_PLACEHOLDER": "Column name",
    "DSM_REMOVE_COLUMN": "Remove column",

    // Preview & annotation
    "DSM_PREVIEW_TITLE": "Preview & Annotation",
    "DSM_SPEC_OK": "Spec is valid",
    "DSM_SPEC_NEED_FIX": "Needs fixing",
    "DSM_BACK_TO_LIST": "← Back to list",
    "DSM_ANNOTATION_INFO": "Annotation Info",
    "DSM_ANNOTATION_FILE": "File",
    "DSM_ANNOTATION_LINE": "Line",
    "DSM_ANNOTATION_EMPTY": "No annotations yet",

    // Sampler view
    "DSM_SAMPLER_PLACEHOLDER": "Waiting for capture...",
    "DSM_SAMPLER_CAMERA": "📷 Camera:",
    "DSM_SAMPLER_CAMERA_READY": "Ready · Click to capture",
    "DSM_SAMPLER_REFRESH_CAMERAS": "Rescan cameras",
    "DSM_SAMPLER_LABEL": "Label:",
    "DSM_SAMPLER_ADD_LABEL": "Add label",
    "DSM_SAMPLER_NEW_LABEL_PLACEHOLDER": "Enter new label name",
    "DSM_SAMPLER_CONFIRM": "Confirm",
    "DSM_SAMPLER_CANCEL": "Cancel",
    "DSM_SAMPLER_START_CAM": "Start Preview",
    "DSM_SAMPLER_STOP_CAM": "Stop Camera",
    "DSM_SAMPLER_STARTING": "Starting...",
    "DSM_SAMPLER_START_FAILED": "Start failed, try again",
    "DSM_SAMPLER_SNAPSHOT": "📸 Capture Snapshot",
    "DSM_SAMPLER_BURST": "⏯ Auto Burst",
    "DSM_SAMPLER_STOP_BURST": "⏹ Stop Burst",
    "DSM_SAMPLER_INTERVAL": "Interval:",
    "DSM_SAMPLER_NO_LABEL": "Add a label first",

    // Image grid
    "DSM_NO_IMAGES": "No images yet",
    "DSM_NO_LABELS": "No labels detected",
    "DSM_LABEL_NAME": "Label Name",
    "DSM_SAMPLE_COUNT": "Count",
    "DSM_COLOR": "Color",
    "DSM_DELETE_IMAGE": "Delete photo",

    // Cloud diagnostics
    "DSM_CLOUD_REMOTE_ENV": "☁️ Remote Environment",
    "DSM_CLOUD_DIAGNOSE": "Run Diagnostics",
    "DSM_CLOUD_DIAGNOSE_HINT": "Click \"Run Diagnostics\" to check GPU and Docker environment.",
    "DSM_CLOUD_DIAGNOSING": "Running remote environment diagnostics...",
    "DSM_CLOUD_GPU": "GPU",
    "DSM_CLOUD_DOCKER": "Docker",
    "DSM_CLOUD_GPU_PASSTHROUGH": "GPU Passthrough",
    "DSM_CLOUD_AVAILABLE": "Available",
    "DSM_CLOUD_NONE": "None",
    "DSM_CLOUD_NORMAL": "Normal",
    "DSM_CLOUD_NOT_RUNNING": "Not running",
    "DSM_CLOUD_SUPPORTED": "Supported (--gpus)",
    "DSM_CLOUD_NOT_SUPPORTED": "Not supported",
    "DSM_CLOUD_DIAGNOSE_WARN": "⚠️ Diagnostic warnings:",
    "DSM_CLOUD_DIAGNOSE_FAILED": "❌ Diagnostics failed",

    // Status messages
    "DSM_STATUS_LOADING": "Loading: %1...",
    "DSM_STATUS_IMPORTING_FOLDER": "Selecting folder...",
    "DSM_STATUS_EXPORTING": "📦 Preparing export...",
    "DSM_STATUS_CAPTURETING": "📸 Capturing...",
    "DSM_STATUS_UPLOADING_ZIP": "📦 Preparing to upload local ZIP file...",
    "DSM_STATUS_UPLOADING": "☁️ Uploading dataset... (%1%)",
    "DSM_STATUS_DECOMPRESSING": "⌛ Decompressing on cloud, please wait...",

    // Success messages
    "DSM_SUCCESS_IMPORT_DATA": "✅ Successfully imported %1 records",
    "DSM_SUCCESS_IMPORT_IMAGES": "✅ Successfully imported %1 images, %2 labels",
    "DSM_SUCCESS_EXPORT": "✅ Dataset exported successfully",
    "DSM_SUCCESS_CAPTURE": "✅ Capture successful",
    "DSM_SUCCESS_UPLOAD": "✅ Dataset uploaded and decompressed on remote!",

    // Error messages
    "DSM_ERROR_PREFIX": "❌ Error: %1",
    "DSM_ERROR_IMPORT_EMPTY": "File is empty or format is invalid",
    "DSM_ERROR_EXPORT_FAILED": "❌ Export failed: %1",
    "DSM_ERROR_CAPTURE_FAILED": "❌ Capture failed: %1",
    "DSM_ERROR_UPLOAD_FAILED": "❌ Upload failed: %1",
    "DSM_ERROR_READ_FAILED": "❌ Read failed: %1",
    "DSM_ERROR_EXPORT_VALIDATE": "Dataset spec validation failed: %1",

    // Preview table
    "DSM_PREVIEW_MORE_SAMPLES": "... (%1 more samples not shown in preview)",

    // Validation messages
    "DSM_VALIDATE_VERSION_UNSUPPORTED": "Unsupported spec version \"%1\". Expected \"%2\".",
    "DSM_VALIDATE_PROJECT_NAME_REQUIRED": "Project name is required.",
    "DSM_VALIDATE_PROJECT_TYPE_INVALID": "Project type must be one of: %1.",
    "DSM_VALIDATE_SOURCE_MODE_INVALID": "Data source mode must be one of: %1.",
    "DSM_VALIDATE_COLUMN_REQUIRED": "At least one schema column is required.",
    "DSM_VALIDATE_COLUMN_MISSING_NAME": "Column %1 is missing a name.",
    "DSM_VALIDATE_COLUMN_DUPLICATE": "Duplicate column name: %1.",
    "DSM_VALIDATE_COLUMN_INVALID_TYPE": "Column \"%1\" has invalid type \"%2\".",
    "DSM_VALIDATE_COLUMN_INVALID_ROLE": "Column \"%1\" has invalid role \"%2\".",
    "DSM_VALIDATE_FEATURE_NOT_FOUND": "Feature column \"%1\" does not exist in schema.columns.",
    "DSM_VALIDATE_LABEL_NOT_FOUND": "Label column \"%1\" does not exist in schema.columns.",
    "DSM_VALIDATE_NO_LABEL": "No label column is assigned yet.",
    "DSM_VALIDATE_NO_FEATURES": "No feature columns are assigned yet."
  });
})(Blockly);
