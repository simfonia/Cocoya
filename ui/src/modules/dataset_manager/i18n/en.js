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
    "DSM_ANNOTATION_LINE": "Line",
    "DSM_ANNOTATION_EMPTY": "No annotations yet",
    "DSM_ANNOTATION_CLASS": "Class",
    "DSM_ANNOTATION_LIST": "Annotation List",
    "DSM_ANNOTATION_PROGRESS": "Progress: %1/%2",
    "DSM_ANNOTATION_CLASS_ADD": "Add",
    "DSM_ANNOTATION_CLASS_EDIT": "Edit",
    "DSM_ANNOTATION_CLASS_DELETE": "Delete",
    "DSM_ANNOTATION_NEW_CLASS_PLACEHOLDER": "Enter new class name",
    "DSM_ANNOTATION_DELETE_CLASS_CONFIRM": "Delete class '%1' and its %2 annotations?",
    "DSM_ANNOTATION_EXPORT_UNCLASSIFIED_WARNING": "%1 unclassified annotations, export anyway?",
    "DSM_ANNOTATION_EXPORT_UNANNOTATED_WARNING": "%1 images unannotated, export anyway?",
    "DSM_ANNOTATION_UNANNOTATED_WARNING": "%1 images unannotated, leave anyway?",
    "DSM_ANNOTATION_SHORTCUTS_HINT": "↑/↓ navigate · Delete remove · Esc exit",
    "DSM_ANNOTATION_MODE_TITLE": "Object Detection Annotation",

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
    "DSM_DELETE_FILE_NOT_FOUND": "Source file no longer exists, removed from list",

    // Status messages
    "DSM_STATUS_LOADING": "Loading: %1...",
    "DSM_STATUS_LOADING_FILE": "Selecting file...",
    "DSM_STATUS_IMPORTING_FOLDER": "Selecting folder...",
    "DSM_STATUS_EXPORTING": "📦 Preparing export...",
    "DSM_EXPORT_IN_PROGRESS": "Building ZIP and generating dataset.json...",
    "DSM_STATUS_CAPTURETING": "📸 Capturing...",

    // Success messages
    "DSM_SUCCESS_IMPORT_DATA": "✅ Successfully imported %1 records",
    "DSM_SUCCESS_IMPORT_IMAGES": "✅ Successfully imported %1 images, %2 labels",
    "DSM_SUCCESS_EXPORT": "✅ Dataset exported successfully",
    "DSM_SUCCESS_CAPTURE": "✅ Capture successful",

    // Error messages
    "DSM_ERROR_PREFIX": "❌ Error: %1",
    "DSM_ERROR_IMPORT_EMPTY": "File is empty or format is invalid",
    "DSM_ERROR_EXPORT_FAILED": "❌ Export failed: %1",
    "DSM_ERROR_CAPTURE_FAILED": "❌ Capture failed: %1",
    "DSM_ERROR_EXPORT_VALIDATE": "Dataset spec validation failed: %1",

    // Preview table
    "DSM_PREVIEW_MORE_SAMPLES": "... (%1 more samples not shown in preview)",

    // Validation messages
    "DSM_VALIDATE_VERSION_UNSUPPORTED": "Unsupported spec version \"%1\". Expected \"%2\".",
    "DSM_VALIDATE_PROJECT_NAME_REQUIRED": "Project name is required.",
    "DSM_VALIDATE_PROJECT_TYPE_INVALID": "Project type must be one of: %1.",
    "DSM_VALIDATE_SOURCE_MODE_INVALID": "Data source mode must be one of: %1.",
    "DSM_VALIDATE_COLUMN_REQUIRED": "No columns defined yet. Import a CSV/JSON file, or click \"Add Feature / Add Label\" to create one.",
    "DSM_VALIDATE_COLUMN_MISSING_NAME": "Column %1 is missing a name.",
    "DSM_VALIDATE_COLUMN_DUPLICATE": "Duplicate column name: %1.",
    "DSM_VALIDATE_COLUMN_INVALID_TYPE": "Column \"%1\" has invalid type \"%2\".",
    "DSM_VALIDATE_COLUMN_INVALID_ROLE": "Column \"%1\" has invalid role \"%2\".",
    "DSM_VALIDATE_FEATURE_NOT_FOUND": "Feature column \"%1\" does not exist in schema.columns.",
    "DSM_VALIDATE_LABEL_NOT_FOUND": "Label column \"%1\" does not exist in schema.columns.",
    "DSM_VALIDATE_NO_LABEL": "No label column is assigned yet.",
    "DSM_VALIDATE_NO_FEATURES": "No feature columns are assigned yet.",
    "DSM_VALIDATE_NO_SAMPLES": "No images imported yet. Select an image folder or capture photos with the camera.",

    // Classification review mode (image classification label correction)
    "DSM_CLASSIFY_MODE_TITLE": "Image Classification Labels",
    "DSM_CLASSIFY_CURRENT_LABEL": "Current Label",
    "DSM_CLASSIFY_IMAGE_INFO": "File: %1",
    "DSM_CLASSIFY_PROGRESS": "Sample: %1 / %2",
    "DSM_CLASSIFY_SHORTCUTS_HINT": "↑/↓ switch image · Esc exit",

    // Save / Load progress
    "DSM_AUTOSAVE_ON": "Auto-save enabled",
    "DSM_NEED_ANCHOR": "Please create or open a Blockly (.xml) project before using the Dataset Manager.\n(Datasets must live inside the project root under dataset/<dataset name>)",
    "DSM_IMPORT_COPY_CONFIRM": "Datasets must live inside the project root under dataset/<dataset name>.\n\nCopy the selected folder to:\n%1\n? (existing files will not be overwritten)",
    "DSM_IMPORT_REJECTED_EXTERNAL": "❌ Cancelled: datasets must live inside the project root under dataset/<dataset name>",
    "DSM_IMPORT_COPYING": "Copying dataset into project root...",
    "DSM_IMPORT_COPIED": "✅ Copied %1 files into project root",
    "DSM_AUTOSAVE_ON_TOOLTIP": "Automatically writes to dataset.json after annotating/classifying/adding/deleting; no manual save needed",
    "DSM_SUCCESS_LOAD_PROGRESS": "✅ Restored progress from last session (%1 annotated images)",

    // Guardrail confirmations
    "DSM_CLEAR_CONFIRM": "Clear all data and reset?",
    "DSM_TYPE_SWITCH_CONFIRM": "Switching project type will clear current data. Continue?",
    "DSM_CLOSE_UNSAVED_CONFIRM": "You have unsaved data. Close anyway?",
    "DSM_SOURCE_RENAME_CONFIRM": "Source changed to \"%1\", but the current dataset name is \"%2\".\nUpdate the dataset name to \"%1\"?\n\n(Choosing \"Cancel\" keeps \"%2\"; progress will be saved to dataset/%2/ and may overwrite existing progress. To create a new dataset, copy the source folder and re-import it.)",
    "DSM_SOURCE_COLLISION_CONFIRM": "A different source folder uses the same name \"%1\". Progress will be written to and may overwrite dataset/%1/. Continue?",
    "DSM_IMPORT_CANCELLED": "Import cancelled",
    "DSM_SOURCE_KEPT_STATUS": "Keeping dataset name \"%1\"; progress will be saved to dataset/%1/"
  });
})(Blockly);
