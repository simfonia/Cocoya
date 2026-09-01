/**
 * Dataset Manager i18n - 繁體中文
 * 所有 DSM_ 前綴的鍵值供 Dataset Manager 模組使用
 */
(function (Blockly) {
  Blockly.Msg = Blockly.Msg || {};
  Object.assign(Blockly.Msg, {
    // 標題與通用
    "DSM_TITLE": "Dataset Manager",
    "DSM_SUBTITLE": "Dataset Spec",
    "DSM_CLEAR_DATA": "清除資料",
    "DSM_CLEAR_DATA_TOOLTIP": "清空所有暫存資料記錄並重置",
    "DSM_CLOSE": "關閉",
    "DSM_VALIDATE": "驗證",
    "DSM_EXPORT": "匯出資料集",

    // 資料來源面板
    "DSM_SOURCE": "資料來源",
    "DSM_PROJECT_TYPE": "專案類型",
    "DSM_SOURCE_MODE": "來源模式",
    "DSM_SELECT_CSV": "選擇 CSV / JSON 檔案",
    "DSM_SELECT_IMAGE_FOLDER": "選擇影像資料夾",
    "DSM_PROJECT_NAME": "資料集名稱",
    "DSM_PROJECT_NAME_PLACEHOLDER": "僅限英數與下劃線",
    "DSM_PROJECT_NAME_HINT": "* 僅限英文、數字與下劃線 (用於雲端路徑)",
    "DSM_DESCRIPTION": "描述",
    "DSM_DESCRIPTION_PLACEHOLDER": "專案詳細描述...",

    // 欄位與標籤
    "DSM_STRUCTURE_TITLE": "欄位與標籤",
    "DSM_LABEL_STATS_TITLE": "標籤與樣本統計",
    "DSM_ADD_FEATURE": "新增 Feature",
    "DSM_ADD_LABEL": "新增 Label",
    "DSM_COLUMN_NAME": "名稱",
    "DSM_COLUMN_TYPE": "型別",
    "DSM_COLUMN_ROLE": "角色",
    "DSM_COLUMN_NAME_PLACEHOLDER": "欄位名稱",
    "DSM_REMOVE_COLUMN": "移除欄位",

    // 預覽與標註
    "DSM_PREVIEW_TITLE": "預覽與標註",
    "DSM_SPEC_OK": "Spec 可用",
    "DSM_SPEC_NEED_FIX": "需要修正",
    "DSM_BACK_TO_LIST": "← 返回列表",
    "DSM_ANNOTATION_LINE": "線段",
    "DSM_ANNOTATION_EMPTY": "尚未有標註",
    "DSM_ANNOTATION_CLASS": "類別",
    "DSM_ANNOTATION_LIST": "標註列表",
    "DSM_ANNOTATION_PROGRESS": "進度: %1/%2 張",
    "DSM_ANNOTATION_CLASS_ADD": "新增",
    "DSM_ANNOTATION_CLASS_EDIT": "編輯",
    "DSM_ANNOTATION_CLASS_DELETE": "刪除",
    "DSM_ANNOTATION_NEW_CLASS_PLACEHOLDER": "輸入新類別名稱",
    "DSM_ANNOTATION_DELETE_CLASS_CONFIRM": "確定刪除類別「%1」及其 %2 個標註框嗎？",
    "DSM_ANNOTATION_EXPORT_UNCLASSIFIED_WARNING": "尚有 %1 個未分類標註框，確定要匯出嗎？",
    "DSM_ANNOTATION_EXPORT_UNANNOTATED_WARNING": "仍有 %1 張圖片未標註，確定要匯出嗎？",
    "DSM_ANNOTATION_UNANNOTATED_WARNING": "尚有 %1 張圖片未標註，確定要離開？",
    "DSM_ANNOTATION_SHORTCUTS_HINT": "↑/↓ 切換圖片 · Delete 刪除標註 · Esc 退出",
    "DSM_ANNOTATION_MODE_TITLE": "物件偵測標註",

    // 採集視圖 (Sampler)
    "DSM_SAMPLER_PLACEHOLDER": "等待採集影像...",
    "DSM_SAMPLER_CAMERA": "📷 攝影機:",
    "DSM_SAMPLER_CAMERA_READY": "已就緒 · 點擊拍攝快照",
    "DSM_SAMPLER_REFRESH_CAMERAS": "重新掃描攝影機",
    "DSM_SAMPLER_LABEL": "標籤:",
    "DSM_SAMPLER_ADD_LABEL": "新增標籤",
    "DSM_SAMPLER_NEW_LABEL_PLACEHOLDER": "輸入新標籤名稱",
    "DSM_SAMPLER_CONFIRM": "確認",
    "DSM_SAMPLER_CANCEL": "取消",
    "DSM_SAMPLER_START_CAM": "啟動預覽",
    "DSM_SAMPLER_STOP_CAM": "停止攝影機",
    "DSM_SAMPLER_STARTING": "啟動中...",
    "DSM_SAMPLER_START_FAILED": "啟動失敗，再試一次",
    "DSM_SAMPLER_SNAPSHOT": "📸 拍攝快照",
    "DSM_SAMPLER_BURST": "⏯ 自動連拍",
    "DSM_SAMPLER_STOP_BURST": "⏹ 停止連拍",
    "DSM_SAMPLER_INTERVAL": "間隔:",
    "DSM_SAMPLER_NO_LABEL": "請先新增標籤",

    // 影像網格
    "DSM_NO_IMAGES": "尚無影像資料",
    "DSM_NO_LABELS": "尚未偵測到標籤",
    "DSM_LABEL_NAME": "標籤名稱",
    "DSM_SAMPLE_COUNT": "樣本數",
    "DSM_COLOR": "顏色",
    "DSM_DELETE_IMAGE": "刪除照片",

    // 狀態訊息
    "DSM_STATUS_LOADING": "載入中: %1...",
    "DSM_STATUS_IMPORTING_FOLDER": "正在選取資料夾...",
    "DSM_STATUS_EXPORTING": "📦 正在準備匯出...",
    "DSM_EXPORT_IN_PROGRESS": "正在打包 ZIP 並產生 dataset.json...",
    "DSM_STATUS_CAPTURETING": "📸 正在採集...",

    // 成功訊息
    "DSM_SUCCESS_IMPORT_DATA": "✅ 成功匯入 %1 筆資料",
    "DSM_SUCCESS_IMPORT_IMAGES": "✅ 成功匯入 %1 張影像，共 %2 個標籤",
    "DSM_SUCCESS_EXPORT": "✅ 資料集匯出成功",
    "DSM_SUCCESS_CAPTURE": "✅ 採集成功",

    // 錯誤訊息
    "DSM_ERROR_PREFIX": "❌ 錯誤: %1",
    "DSM_ERROR_IMPORT_EMPTY": "檔案內容為空或格式不符",
    "DSM_ERROR_EXPORT_FAILED": "❌ 匯出失敗: %1",
    "DSM_ERROR_CAPTURE_FAILED": "❌ 採集失敗: %1",
    "DSM_ERROR_EXPORT_VALIDATE": "資料集規格驗證失敗: %1",

    // 預覽表格
    "DSM_PREVIEW_MORE_SAMPLES": "... (還有 %1 個樣本未顯示於預覽區)",

    // 驗證訊息 (Validate messages)
    "DSM_VALIDATE_VERSION_UNSUPPORTED": "不支援的 spec 版本 \"%1\"。預期為 \"%2\"。",
    "DSM_VALIDATE_PROJECT_NAME_REQUIRED": "專案名稱為必填。",
    "DSM_VALIDATE_PROJECT_TYPE_INVALID": "專案類型必須為以下之一：%1。",
    "DSM_VALIDATE_SOURCE_MODE_INVALID": "資料來源模式必須為以下之一：%1。",
    "DSM_VALIDATE_COLUMN_REQUIRED": "尚未定義任何欄位。請先匯入 CSV/JSON 檔案，或點擊「新增 Feature / Label」手動建立。",
    "DSM_VALIDATE_COLUMN_MISSING_NAME": "第 %1 個欄位缺少名稱。",
    "DSM_VALIDATE_COLUMN_DUPLICATE": "重複的欄位名稱：%1。",
    "DSM_VALIDATE_COLUMN_INVALID_TYPE": "欄位 \"%1\" 具有無效的型別 \"%2\"。",
    "DSM_VALIDATE_COLUMN_INVALID_ROLE": "欄位 \"%1\" 具有無效的角色 \"%2\"。",
    "DSM_VALIDATE_FEATURE_NOT_FOUND": "Feature 欄位 \"%1\" 不存在於 schema.columns 中。",
    "DSM_VALIDATE_LABEL_NOT_FOUND": "Label 欄位 \"%1\" 不存在於 schema.columns 中。",
    "DSM_VALIDATE_NO_LABEL": "尚未指定 Label 欄位。",
    "DSM_VALIDATE_NO_FEATURES": "尚未指定 Feature 欄位。",
    "DSM_VALIDATE_NO_SAMPLES": "尚未匯入任何影像。請選擇影像資料夾，或使用攝影機拍攝。",

    // 影像分類標籤校正模式 (Image classification label correction)
    "DSM_CLASSIFY_MODE_TITLE": "影像分類標籤校正",
    "DSM_CLASSIFY_CURRENT_LABEL": "目前分類",
    "DSM_CLASSIFY_IMAGE_INFO": "檔案: %1",
    "DSM_CLASSIFY_PROGRESS": "樣本: %1 / %2 張",
    "DSM_CLASSIFY_SHORTCUTS_HINT": "↑/↓ 切換圖片 · Esc 退出",

    // 儲存/載入進度 (Save / Load progress)
    "DSM_AUTOSAVE_ON": "自動儲存已開啟",
    "DSM_NEED_ANCHOR": "請先開新或開啟一個 xml 積木專案後，再使用 Dataset Manager。\n（資料集必須存放於專案根的 dataset/<資料集名稱> 資料夾內）",
    "DSM_IMPORT_COPY_CONFIRM": "資料集必須位於專案根的 dataset/<資料集名稱> 資料夾內。\n\n要將所選資料夾複製到：\n%1\n嗎？（已存在的檔案不會被覆寫）",
    "DSM_IMPORT_REJECTED_EXTERNAL": "❌ 已取消：資料集必須位於專案根的 dataset/<資料集名稱> 資料夾內",
    "DSM_IMPORT_COPYING": "正在複製資料集至專案根...",
    "DSM_IMPORT_COPIED": "✅ 已複製 %1 個檔案至專案根",
    "DSM_AUTOSAVE_ON_TOOLTIP": "標註/分類/新增/刪除後自動寫入 dataset.json，無需手動儲存",
    "DSM_SUCCESS_LOAD_PROGRESS": "✅ 已從上次進度恢復（套回 %1 張標註）",

    // 防呆確認 (Guardrail confirmations)
    "DSM_CLEAR_CONFIRM": "確定清除所有資料並重置嗎？",
    "DSM_TYPE_SWITCH_CONFIRM": "切換專案類型將清除目前資料，確定繼續嗎？",
    "DSM_CLOSE_UNSAVED_CONFIRM": "目前有尚未匯出的資料，確定關閉嗎？",
    "DSM_SOURCE_RENAME_CONFIRM": "來源已變更為「%1」，但目前資料集名稱為「%2」。\n是否自動更新資料集名稱為「%1」？\n\n（若選擇「取消」將維持「%2」，後續標註進度會儲存至 dataset/%2/，可能覆寫既有進度。若要另立新的資料集，建議先自行複製來源資料夾後再匯入。）",
    "DSM_SOURCE_COLLISION_CONFIRM": "不同來源資料夾使用了相同名稱「%1」，標註進度將寫入並可能覆寫 dataset/%1/ 的既有進度。\n仍要繼續嗎？",
    "DSM_IMPORT_CANCELLED": "已取消匯入",
    "DSM_SOURCE_KEPT_STATUS": "資料集名稱維持「%1」；標註進度將儲存至 dataset/%1/"
  });
})(Blockly);
