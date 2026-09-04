import * as vscode from 'vscode';

/**
 * Host 端使用者可見訊息 i18n（SSOT，共用模組）。
 * 對齊 envOps/firmwareOps 的 vscode.env.language 推導 pattern。
 * Host 無 Blockly.Msg（webview i18n 為 ui/src/zh-hant.js、en.js），故 host 自帶 zh-hant/en 兩套文案。
 * 鐵律：新增 host 端使用者可見訊息時，必須同時補 zh-hant 與 en 兩個 key。
 */
const HOST_MSGS: Record<string, Record<string, string>> = {
    'zh-hant': {
        // --- 訓練（trainingOps.ts）---
        remoteComplete: '遠端訓練完成！模型已下載至: %1',
        remoteCompleteMarker: '=== 遠端訓練完成 ===',
        remoteFailed: '遠端訓練失敗: %1',
        remoteFailedMarker: '=== 遠端訓練失敗: %1 ===',
        missingSsh: '缺少 SSH 連線資訊，請重新執行遠端訓練。',
        missingSshErr: '缺少 SSH 連線資訊',
        localComplete: '訓練完成！模型已儲存至: %1',
        localFailed: '訓練失敗: %1',
        localFailedErr: '訓練失敗',
        remoteNotAvailable: '遠端訓練功能開發中，請使用本地訓練模式。',
        remoteNotAvailableErr: '遠端訓練功能尚未開放',
        reportNotFoundEmpty: '找不到訓練報告檔案: 路徑為空',
        reportNotFound: '找不到訓練報告檔案: %1',
        openFailed: '開啟失敗，請手動開啟檔案：\n%1',
        openFailedWithErr: '開啟失敗，請手動開啟檔案：\n%1\n\n錯誤：%2',
        noTrainingResults: '尚無訓練結果，請先執行訓練。\n(搜尋路徑: %1)',
        reportPickerPlaceholder: '找到 %1 個訓練報告，請選擇要開啟的項目：',
        chinesePathError: '開啟訓練報告失敗！\n\n原因：路徑或檔名包含中文，導致無法直接開啟。\n\n解決方案：\n1. 將專案資料夾移到英文路徑，例如：\n   C:/Workspace/training/\n   \n2. 自行開啟：\n%1\n\n3. 建議：專案資料夾中的路徑及檔名都以英文命名。',
        // --- 資料集（datasetOps.ts）---
        folderPickFailed: '選擇資料夾失敗: %1',
        pickFolderTitle: '選取資料集資料夾',
        userCancelledPick: '使用者取消選擇',
        exportSuccess: '資料集匯出成功: %1',
        exportSaveTitle: '匯出資料集',
        uploadingTitle: '正在準備上傳資料集至雲端伺服器...',
        pickPythonTitle: '選取 python.exe',
        exportFailed: '資料集匯出失敗: %1',
        exportError: '匯出程序錯誤: %1',
        uploadSuccess: '資料集 %1 已成功上傳至雲端伺服器！',
        uploadFailed: '上傳失敗: %1',
        uploadError: '資料集上傳錯誤: %1',
        unknownCause: '原因未知',
        // --- Sidecar（sidecarManager.ts）---
        sidecarStartFailed: '無法啟動 Dataset Manager：Python 執行檔或腳本遺失。請在設定中確認 Python 路徑。'
    },
    'en': {
        // --- Training (trainingOps.ts) ---
        remoteComplete: 'Remote training complete! Model downloaded to: %1',
        remoteCompleteMarker: '=== Remote training complete ===',
        remoteFailed: 'Remote training failed: %1',
        remoteFailedMarker: '=== Remote training failed: %1 ===',
        missingSsh: 'Missing SSH connection info. Please run remote training again.',
        missingSshErr: 'Missing SSH connection info',
        localComplete: 'Training complete! Model saved to: %1',
        localFailed: 'Training failed: %1',
        localFailedErr: 'Training failed',
        remoteNotAvailable: 'Remote training is under development. Please use local training mode.',
        remoteNotAvailableErr: 'Remote training is not yet available',
        reportNotFoundEmpty: 'Training report not found: path is empty',
        reportNotFound: 'Training report not found: %1',
        openFailed: 'Failed to open. Please open the file manually:\n%1',
        openFailedWithErr: 'Failed to open. Please open the file manually:\n%1\n\nError: %2',
        noTrainingResults: 'No training results yet. Please run training first.\n(Search path: %1)',
        reportPickerPlaceholder: 'Found %1 training report(s). Select one to open:',
        chinesePathError: 'Failed to open training report!\n\nCause: the path or file name contains non-ASCII (Chinese) characters and cannot be opened directly.\n\nSolutions:\n1. Move the project folder to an ASCII path, e.g.:\n   C:/Workspace/training/\n   \n2. Open manually:\n%1\n\n3. Recommendation: use English-only names for paths and files in the project folder.',
        // --- Dataset (datasetOps.ts) ---
        folderPickFailed: 'Failed to pick folder: %1',
        pickFolderTitle: 'Select dataset folder',
        userCancelledPick: 'User cancelled selection',
        exportSuccess: 'Dataset exported successfully: %1',
        exportSaveTitle: 'Export dataset',
        uploadingTitle: 'Preparing to upload dataset to cloud server...',
        pickPythonTitle: 'Select python.exe',
        exportFailed: 'Dataset export failed: %1',
        exportError: 'Export process error: %1',
        uploadSuccess: 'Dataset %1 uploaded to cloud server successfully!',
        uploadFailed: 'Upload failed: %1',
        uploadError: 'Dataset upload error: %1',
        unknownCause: 'Unknown cause',
        // --- Sidecar (sidecarManager.ts) ---
        sidecarStartFailed: 'Cannot start Dataset Manager: Python executable or script missing. Please check the Python path in settings.'
    }
};

/**
 * 取得 host 端雙語訊息（依 VS Code 語言推導，en 為 fallback）。
 * 支援最多兩個參數替換（%1、%2）。
 */
export function hostMsg(key: string, arg1?: string, arg2?: string): string {
    const lang = vscode.env.language.toLowerCase().startsWith('zh') ? 'zh-hant' : 'en';
    let msg = HOST_MSGS[lang][key] || HOST_MSGS['en'][key] || key;
    if (arg1 !== undefined) msg = msg.replace('%1', arg1);
    if (arg2 !== undefined) msg = msg.replace('%2', arg2);
    return msg;
}
