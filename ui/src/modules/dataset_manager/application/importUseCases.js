/**
 * Dataset Manager application/importUseCases.js — 資料匯入 use-case（Stage 3 切片 2）
 *
 * Application 層：純轉換（parseDataFileRows，可單元測試）與匯入編排（importDataFile /
 * importDirectory）分離；對外通訊一律經 io/bridge.js，UI 呈現與確認對話以依賴注入。
 * 從 ui_layout.js 原地搬移，行為語意不變。
 */
import { DatasetSpec } from '../spec.js';
import { datasetBridge } from '../io/bridge.js';

/**
 * 純轉換：CSV/JSON 檔案內容 → 資料列陣列。
 * @param {string} fileName 檔名（判斷副檔名）
 * @param {string} text 檔案內容
 * @returns {Array<object>} rows
 * @throws {Error} 內容為空或格式不符
 */
export function parseDataFileRows(fileName, text) {
    let rows = [];
    if (fileName.endsWith('.csv')) {
        rows = DatasetSpec.parseCSV(text);
    } else if (fileName.endsWith('.json')) {
        rows = JSON.parse(text);
        if (!Array.isArray(rows)) {
            rows = rows.data || rows.samples || [rows];
            if (!Array.isArray(rows)) rows = [rows];
        }
    }

    if (!rows || rows.length === 0) {
        throw new Error('EMPTY_OR_INVALID');
    }
    return rows;
}

/**
 * 建立匯入 use-case。
 * deps：
 *  - state: ui_layout 模組狀態
 *  - getFormValue(name), sanitizeName(raw), reconcileProjectName(name, folderPath): Promise<bool>
 *  - showStatusMessage(msg), refreshDynamicPanels(), refreshPreview()
 *  - loadProgressFromFolder(folderPath), t(key, fallback)
 */
export function createImportUseCases(deps) {
    const {
        state,
        getFormValue,
        sanitizeName,
        reconcileProjectName,
        showStatusMessage,
        refreshDynamicPanels,
        refreshPreview,
        loadProgressFromFolder,
        t
    } = deps;

    /** 檔案匯入（CSV/JSON 表格資料） */
    async function importDataFile(file) {
        if (!file) return;
        showStatusMessage(t('STATUS_LOADING', '載入中: %1...').replace('%1', file.name));

        try {
            const text = await file.text();
            let rows;
            try {
                rows = parseDataFileRows(file.name, text);
            } catch (e) {
                if (e.message === 'EMPTY_OR_INVALID') {
                    throw new Error(t('ERROR_IMPORT_EMPTY', '檔案內容為空或格式不符'));
                }
                throw e;
            }

            const rawFileName = file.name.split('.')[0];
            const safeFileName = sanitizeName(rawFileName) || rawFileName;

            // 名稱/來源對齊決策（方案 A）：首次自動帶入；來源變更時顯式確認；同名來源碰撞防寫
            const proceed = await reconcileProjectName(safeFileName, null);
            if (!proceed) {
                showStatusMessage(t('IMPORT_CANCELLED', '已取消匯入'));
                return;
            }

            // 更新 State
            state.tableRows = rows;
            state.images = [];

            const detectedSchema = DatasetSpec.detectSchema(rows);
            state.spec.updateSchema(detectedSchema);

            refreshDynamicPanels();
            showStatusMessage(t('SUCCESS_IMPORT_DATA', '✅ 成功匯入 %1 筆資料').replace('%1', rows.length));

            const fileInput = document.getElementById('dataset-file-input');
            if (fileInput) fileInput.value = '';
        } catch (e) {
            console.error('[DatasetManager] Import Error:', e);
            showStatusMessage(t('ERROR_PREFIX', '❌ 錯誤: %1').replace('%1', e.message));
        }
    }

    /** 資料夾匯入（影像資料集） */
    async function importDirectory() {
        showStatusMessage(t('STATUS_IMPORTING_FOLDER', '正在選取資料夾...'));

        try {
            const result = await datasetBridge.pickFolder();
            if (!result) {
                showStatusMessage('');
                return;
            }

            const { path: folderPath } = result;

            // 取得最上層資料夾名稱
            const rawRootDir = folderPath.split(/[\\/]/).pop() || 'dataset';
            const safeRootDir = sanitizeName(rawRootDir) || rawRootDir;
            // 名稱/來源對齊決策（方案 A）：首次自動帶入；來源變更時顯式確認；同名來源碰撞防寫
            const proceed = await reconcileProjectName(safeRootDir, folderPath);
            if (!proceed) {
                // 使用者取消（basename 與已載入來源相同、可能覆寫既有進度）：中止匯入
                showStatusMessage(t('IMPORT_CANCELLED', '已取消匯入'));
                return;
            }

            // 決策（2026-08-26）：資料集必須位於專案根 dataset/<資料集名稱>。
            // 用詞鐵律：「專案」= xml 積木專案；dataset/ 下子資料夾名稱 = 資料集名稱（表單 projectName 欄位值）。
            // 錨定與 canonical 計算由後端裁決（前端 capabilities 快照可能過期）。
            let importData = await datasetBridge.prepareDatasetImport(folderPath, getFormValue('projectName') || safeRootDir, false);
            if (importData.error) {
                throw new Error(importData.error);
            }
            if (importData.action === 'confirm_required') {
                const copyOk = await datasetBridge.confirm(t('DSM_IMPORT_COPY_CONFIRM',
                    '資料集必須位於專案根的 dataset/<資料集名稱> 資料夾內。\n\n要將所選資料夾複製到：\n%1\n嗎？（已存在的檔案不會被覆寫）'
                ).replace('%1', importData.canonicalDir));
                if (!copyOk) {
                    showStatusMessage(t('DSM_IMPORT_REJECTED_EXTERNAL', '❌ 已取消：資料集必須位於專案根的 dataset/<資料集名稱> 資料夾內'));
                    return;
                }
                showStatusMessage(t('DSM_IMPORT_COPYING', '正在複製資料集至專案根...'));
                importData = await datasetBridge.prepareDatasetImport(folderPath, getFormValue('projectName') || safeRootDir, true);
                if (importData.error) {
                    throw new Error(importData.error);
                }
            }
            if (!importData.path) {
                throw new Error('Import target path missing');
            }
            const targetFolderPath = importData.path;
            const importImages = importData.images || [];
            const importLabelCounts = importData.labelCounts || {};
            const importLabelMap = importData.labelMap || {};
            if (importData.action === 'copied') {
                showStatusMessage(t('DSM_IMPORT_COPIED', '✅ 已複製 %1 個檔案至專案根').replace('%1', String(importData.copiedFiles ?? 0)));
            }

            // 初始化每張圖的 annotations 為獨立陣列（後端回傳的 images 沒有 annotations 欄位）
            state.images = importImages.map(img => ({ ...img, annotations: img.annotations || [] }));
            state.tableRows = [];
            state.sourceFolderPath = targetFolderPath; // 儲存來源路徑以便匯出時同步（決策後一律為專案根 canonical 目錄）

            // 更新 Spec 資訊
            state.spec.updateSchema({
                columns: [
                    { name: 'image_path', type: 'string', role: 'feature' },
                    { name: 'label', type: 'string', role: 'label' }
                ],
                features: ['image_path'],
                label: 'label',
                label_map: importLabelMap
            });

            // 更新統計
            const currentJson = state.spec.toJSON();
            state.spec = new DatasetSpec({
                project: currentJson.project,
                data_source: currentJson.data_source,
                schema: currentJson.schema,
                stats: {
                    sample_count: importImages.length,
                    label_counts: importLabelCounts,
                    last_updated: currentJson.stats.last_updated
                }
            });

            showStatusMessage(t('SUCCESS_IMPORT_IMAGES', '✅ 成功匯入 %1 張影像，共 %2 個標籤').replace('%1', importImages.length).replace('%2', Object.keys(importLabelCounts).length));

            refreshDynamicPanels();
            refreshPreview();

            // 等級一存讀（載入）：檢查該資料夾是否含 dataset.json，若有則依 image_path 套回標註
            loadProgressFromFolder(targetFolderPath);
        } catch (e) {
            console.error('[DatasetManager] Dir Import Error:', e);
            showStatusMessage(t('ERROR_PREFIX', '❌ 錯誤: %1').replace('%1', e.message));
        }
    }

    return { importDataFile, importDirectory };
}

