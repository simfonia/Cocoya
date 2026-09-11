import { DatasetSpec, DatasetSpecConstants, TABLE_SAMPLES_PERSIST_LIMIT } from './spec.js';
import { Sampler } from './sampler.js';
import { UIComponents } from './ui_components.js';
import { UICanvas } from './ui_canvas.js';
import { t } from './i18n.js';
import { buildLabelMap as buildCoreLabelMap, nextLabelId as getNextLabelId } from './core/labelMap.js';
import { calculateStats } from './core/stats.js';
import { createInitialDatasetState, DatasetStore } from './core/state.js';
import { sanitizeProjectName } from './core/projectNaming.js';
import { validateDeletableImagePath, validateDeletableDiskPath, normalizePath } from './core/pathPolicy.js';
import { escapeHtml } from './core/html.js';
import { datasetBridge } from './io/bridge.js';
import { createProgressUseCases } from './application/progressUseCases.js';
import { createImportUseCases } from './application/importUseCases.js';
import { createExportUseCases } from './application/exportUseCases.js';
import {
    countUnclassifiedBoxes
} from './application/annotationMutations.js';
import { createStatusMessageUI } from './ui/statusMessage.js';
import { buildModalTemplate } from './ui/modal.js';
import { createFormPresenter } from './ui/form.js';
import { createGridScrollManager } from './ui/thumbnails.js';
import { createClassificationController } from './ui/classification.js';
import { createAnnotationController } from './ui/annotation.js';
import { createPanelsPresenter } from './ui/panels.js';
import { createLabelManager } from './ui/labelManager.js';
import { createSamplerPanel } from './ui/samplerPanel.js';
import { buildEntryTemplate } from './ui/entryCards.js';
import { allowedModes, isDevType } from './core/typePolicy.js';
import { createSessionManager } from './application/sessionManager.js';

const MODAL_ID = 'dataset-manager-modal';

const TYPE_TO_MODES_MAP = {
    'table': ['file'],
    'feature': ['file'],
    'serial': ['file'],
    'image': ['live', 'file'],
    'object_detection': ['live', 'file'],
    'line_following': ['live', 'file']
};

const datasetStore = new DatasetStore(createInitialDatasetState(
    DatasetSpec.createDefault({ name: 'dataset', type: 'table', mode: 'file' })
));
const state = datasetStore.getState();

// M1 類型鎖定會話（R1）：lockedType＝已選定類型；phase＝entry|workspace
const sessionManager = createSessionManager({
    confirmFn: (key) => datasetBridge.confirm(t(key === 'SWITCH_TYPE_CONFIRM' ? 'SWITCH_TYPE_CONFIRM' : key, '確定嗎？')),
    notifyFn: (key) => showStatusMessage(t(key, ''))
});

// Stage 4 切片 1：集中式狀態訊息呈現邏輯移至 ui/statusMessage.js
// （計時器重置/dispose 語意不變；此 const 供模組內各函式與 use-case 注入使用）
const statusMessagePresenter = createStatusMessageUI();
const showStatusMessage = statusMessagePresenter.showStatusMessage;

// M2 R5：統一標籤管理器抽至 ui/labelManager.js（下方函式宣告已提升，可安全參照）
const labelManager = createLabelManager({
    state, t, escapeHtml, UIComponents, UICanvas,
    getFormValue: (name) => getFormValue(name),
    syncLabelMap: () => syncLabelMap(),
    updateStatsFromImages: () => updateStatsFromImages(),
    scheduleAutoSave: (immediate) => scheduleAutoSave(immediate),
    refreshPreview: () => refreshPreview(),
    renderClassificationControls: () => renderClassificationControls(),
    renderAnnotationControls: () => renderAnnotationControls(),
    updateThumbnailHighlight: () => updateThumbnailHighlight(),
    bridge: datasetBridge
});

// Stage 4 切片 5：分類校正模式狀態機移至 ui/classification.js（依賴注入；下方函式宣告已提升，可安全參照）
const classificationController = createClassificationController({
    state, t, escapeHtml,
    getModal: () => getModal(),
    UIComponents,
    saveGridScroll: () => saveGridScroll(),
    exitAnnotationMode: () => exitAnnotationMode(),
    navigateToImage: (index) => navigateToImage(index),
    setAnnotationHeaderActions: (hide) => setAnnotationHeaderActions(hide),
    handleExportDataset: () => handleExportDataset(),
    updateStatsFromImages: () => updateStatsFromImages(),
    updateThumbnailHighlight: () => updateThumbnailHighlight(),
    refreshPreview: () => refreshPreview(),
    createLabelMapManager: (container, statsContainer) => createLabelMapManager(container, statsContainer),
    onDeleteImage: (index) => handleDeleteImage(index)
});

// Stage 4 切片 6：bbox/line 標註模式編排移至 ui/annotation.js（依賴注入；下方函式宣告已提升，可安全參照）
const annotationController = createAnnotationController({
    state, t, escapeHtml,
    getModal: () => getModal(),
    UICanvas,
    UIComponents,
    getFormValue: (name) => getFormValue(name),
    saveGridScroll: () => saveGridScroll(),
    exitAnnotationMode: () => exitAnnotationMode(),
    navigateToImage: (index) => navigateToImage(index),
    setAnnotationHeaderActions: (hide) => setAnnotationHeaderActions(hide),
    handleExportDataset: () => handleExportDataset(),
    updateStatsFromImages: () => updateStatsFromImages(),
    updateThumbnailHighlight: () => updateThumbnailHighlight(),
    refreshPreview: () => refreshPreview(),
    createLabelMapManager: (container, statsContainer) => createLabelMapManager(container, statsContainer),
    onDeleteImage: (index) => handleDeleteImage(index)
});

// M2 R6：live 採集面板編排抽至 ui/samplerPanel.js（下方函式宣告已提升，可安全參照）
const samplerPanel = createSamplerPanel({
    state, Sampler, UIComponents,
    updateStatsFromImages: () => updateStatsFromImages(),
    refreshPreview: () => refreshPreview(),
    onSnapshot: () => handleSamplerSnapshot(),
    onBurstToggle: () => handleSamplerBurstToggle(),
    onStartCamera: () => Sampler.startCamera(Sampler.state.selectedDeviceId),
    onStopCamera: () => Sampler.stopCamera(true),
    onSampleCaptured: (blob, savePath) => addSampleFromSampler(blob, savePath),
    nextLabelId: (map) => nextLabelId(map)
});

// Stage 4 切片 7：欄位列/驗證/表格預覽等面板呈現移至 ui/panels.js（依賴注入；下方函式宣告已提升，可安全參照）
const panelsPresenter = createPanelsPresenter({
    state,
    t,
    escapeHtml: (value) => escapeHtml(value),
    optionList: (values, selected) => optionList(values, selected),
    getModal: () => getModal(),
    refreshPreview: () => refreshPreview(),
    DatasetSpec,
    DatasetSpecConstants
});

/**
 * 判斷 Dataset Manager 是否有「未匯出」的工作（樣本/欄位/標籤/來源資料夾），供防呆確認使用。
 * 純空白（全新預設 spec、無任何資料）時回傳 false，避免空畫布也被打擾。
 */
function hasUnsavedWork() {
    if (state.images.length > 0 || state.tableRows.length > 0 || state.sourceFolderPath) return true;
    if (!state.spec) return false;
    const spec = state.spec.toJSON();
    if (Array.isArray(spec.schema.columns) && spec.schema.columns.length > 0) return true;
    if (Array.isArray(spec.data_source.samples) && spec.data_source.samples.length > 0) return true;
    if (spec.schema.label_map && Object.keys(spec.schema.label_map).length > 0) return true;
    if ((spec.stats && spec.stats.sample_count) > 0) return true;
    return false;
}

function optionList(values, selected) {
    return values
        .map((value) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${value}</option>`)
        .join('');
}

/**
 * 同步 state.spec 的 label_map 到 UICanvas.state.labelMap
 * 確保畫布能即時顯示最新的類別名稱
 */
function syncLabelMap() {
    const labelMap = state.spec.toJSON().schema.label_map || {};
    UICanvas.state.labelMap = labelMap;
}

function getModal() {
    if (typeof document === 'undefined') return null;
    return document.getElementById(MODAL_ID);
}

const formPresenter = createFormPresenter({ getModalRoot: getModal });

function getFormValue(name) {
    return formPresenter.getFormValue(name);
}

function getColumnsFromUI() {
    return formPresenter.getColumnsFromUI();
}


function buildLabelMap(columns) {
    const current = state.spec.toJSON().schema.label_map || {};
    return buildCoreLabelMap(columns, current);
}

function syncSpecFromUI(includeSamples = true) {
    const projectType = getFormValue('projectType');
    const projectName = getFormValue('projectName') || 'dataset';
    const isImage = projectType === 'image' || projectType === 'object_detection' || projectType === 'line_following';

    let columns = getColumnsFromUI();
    // 影像模式下，如果 UI 上沒有欄位列表（因為切換到了統計視圖），保留現有的 Spec 欄位定義
    if (isImage && columns.length === 0 && state.spec.toJSON().schema.columns.length > 0) {
        columns = state.spec.toJSON().schema.columns;
    }

    const labelColumn = columns.find((column) => column.role === 'label');
    const features = columns
        .filter((column) => column.role === 'feature')
        .map((column) => column.name);

    // 優化：如果 includeSamples 為 false，則延用舊的 samples 列表，避免 O(N) 操作
    const oldSamples = state.spec.toJSON().data_source.samples || [];
    const oldStats = state.spec.toJSON().stats || {};
    // R7：非影像系（table/feature/serial）落盤 samples——舊行為一律 [] 導致 dataset.json 表格永遠是空的。
    // 委派 spec.js 純函式：samples 前 TABLE_SAMPLES_PERSIST_LIMIT 筆、stats.sample_count 記全量 rows、
    // samples_truncated 表露是否截斷。後端透傳不解讀。
    const tableCap = !isImage
        ? DatasetSpec.buildTableSamples(state.tableRows, TABLE_SAMPLES_PERSIST_LIMIT)
        : { samples: state.images.map((img) => ({
            image_path: img.path,
            label: img.label,
            annotations: img.annotations || []
        })), truncated: false, total: Array.isArray(state.images) ? state.images.length : 0 };
    const newSamples = includeSamples ? tableCap.samples : oldSamples;

    state.spec = new DatasetSpec({
        project: {
            name: projectName,
            type: projectType,
            description: getFormValue('description')
        },
        data_source: {
            mode: getFormValue('sourceMode'),
            files: state.spec.toJSON().data_source.files,
            samples: newSamples,
            base_dir: `dataset/${projectName}/`
        },
        schema: {
            columns,
            features,
            label: labelColumn ? labelColumn.name : '',
            label_map: buildLabelMap(columns)
        },
        stats: {
            // R7：sample_count 記全量（影像=images.length／表格=tableRows 全量 total），
            // 避免落盤 samples 截斷後低估；samples_truncated 表露是否因上限截斷。
            sample_count: tableCap.total,
            label_counts: oldStats.label_counts || {},
            samples_truncated: tableCap.truncated
        }
    });
}

/**
 * 依專案類型重建 sourceMode 下拉選項（與 createModal 內的 updateSourceModeOptions 等效），
 * 供「依進度檔恢復 type」時同步 sourceMode 選項。
 * 路徑比對一律用 core/pathPolicy.js normalizePath（SSOT）。
 */
function rebuildSourceModeOptions(projectType) {
    const modal = getModal();
    const sourceSelect = modal?.querySelector('[name="sourceMode"]');
    if (!sourceSelect) return;
    const modes = allowedModes(projectType);
    const currentMode = sourceSelect.value;
    const nextMode = modes.includes(currentMode) ? currentMode : modes[0];
    sourceSelect.innerHTML = optionList(modes, nextMode);
    sourceSelect.value = nextMode;
}

/**
 * 等級一存讀（載入）：依已讀回的 dataset.json 將 annotations / label 套回重新掃描出的 images[]，
 * 並以「檔案為準」同步 type / schema（label_map、features、label）/ stats。
 * 註：以相對路徑為比對鍵；比對失敗的圖僅略過（不阻斷整體載入）。
 */
function applyLoadedProgress(spec) {
    const currentJson = state.spec.toJSON();
    const loadedSamples = (spec.data_source && spec.data_source.samples) || [];
    const savedSchema = spec.schema || {};

    // 1. project.type / sourceMode 對齊（若與 UI 目前不同，更新下拉與 mode 選項）
    const savedType = spec.project && spec.project.type;
    if (savedType) {
        const typeSelect = getModal()?.querySelector('[name="projectType"]');
        if (typeSelect && typeSelect.value !== savedType) {
            typeSelect.value = savedType;
            rebuildSourceModeOptions(savedType);
        }
    }
    if (spec.data_source && spec.data_source.mode) {
        const modeInput = getModal()?.querySelector('[name="sourceMode"]');
        if (modeInput) modeInput.value = spec.data_source.mode;
    }

    // 2. 依 image_path 將 annotations / label 套回重新掃描出的 images[]
    let matched = 0;
    state.images.forEach((img) => {
        const sample = loadedSamples.find((s) => normalizePath(s.image_path) === normalizePath(img.path));
        if (sample) {
            img.annotations = Array.isArray(sample.annotations) ? sample.annotations.map((a) => ({ ...a })) : (img.annotations || []);
            if (sample.label != null) img.label = sample.label;
            matched++;
        } else {
            img.annotations = img.annotations || [];
        }
    });

    const newColumns = (savedSchema.columns && savedSchema.columns.length) ? savedSchema.columns : currentJson.schema.columns;
    const newLabelMap = (savedSchema.label_map && Object.keys(savedSchema.label_map).length) ? savedSchema.label_map : currentJson.schema.label_map;

    // 3. 重建 spec（以「檔案為準」，保留目前 UI 的專案名稱與描述）
    const projectName = getFormValue('projectName') || (spec.project && spec.project.name) || 'dataset';
    state.spec = new DatasetSpec({
        project: {
            name: projectName,
            type: savedType || currentJson.project.type,
            description: getFormValue('description')
        },
        data_source: {
            mode: getFormValue('sourceMode'),
            files: currentJson.data_source.files,
            samples: state.images.map((img) => ({
                image_path: img.path,
                label: img.label,
                annotations: img.annotations || []
            })),
            base_dir: `dataset/${projectName}/`
        },
        schema: {
            columns: newColumns,
            features: (savedSchema.features && savedSchema.features.length) ? savedSchema.features : currentJson.schema.features,
            label: savedSchema.label || currentJson.schema.label,
            label_map: newLabelMap
        },
        stats: (spec.stats && Object.keys(spec.stats).length) ? spec.stats : (currentJson.stats || {})
    });

    // 以「載入的 label_map + 已套回的 annotations」重算 label_counts，
    // 確保非資料夾名的類別（曾用於標註）在載入後也納入統計
    updateStatsFromImages();

    refreshDynamicPanels();
    refreshPreview();
    showStatusMessage(t('SUCCESS_LOAD_PROGRESS', '✅ 已從上次進度恢復（套回 %1 張標註）').replace('%1', matched));
}

/**
 * 等級一存讀（載入）：向 Bridge 讀取指定資料夾內的 dataset.json。
 * 有進度 → 套回；無進度或失敗 → 維持目前掃描結果，不清空既有成功訊息。
 */
function loadProgressFromFolder(folderPath) {
    // Stage 3：use-case 委派（application/progressUseCases.js）
    getProgressUC().loadProgressFromFolder(folderPath);
}

/** Stage 3：進度存讀 use-case（延遲初始化，注入 UI 依賴） */
let progressUC = null;
function getProgressUC() {
    if (!progressUC) {
        progressUC = createProgressUseCases({
            state,
            syncSpecFromUI,
            getFormValue,
            hasData,
            applyLoadedProgress
        });
    }
    return progressUC;
}

function renderValidation(result) {
    return panelsPresenter.renderValidation(result);
}

let refreshTimeout = null;
export function refreshPreview() {
    const modal = getModal();
    if (!modal) return;

    // 1. 立即同步基本屬性 (但不重新生成龐大的 samples 列表)，確保 state.spec 的基本欄位最新
    syncSpecFromUI(false);

    // 2. 防抖處理重度任務 (驗證、全量同步、JSON 字串化)
    if (refreshTimeout) clearTimeout(refreshTimeout);
    refreshTimeout = setTimeout(() => {
        syncSpecFromUI(true);
        
        const result = state.spec.validate();
        const validation = modal.querySelector('#dataset-validation');
        const preview = modal.querySelector('#dataset-json-preview');
        
        if (validation) validation.innerHTML = renderValidation(result);
        
        if (preview) {
            const specJson = state.spec.toJSON();
            // 效能優化：如果樣本數過多，預覽區僅顯示前 20 筆
            if (specJson.data_source.samples && specJson.data_source.samples.length > 20) {
                const total = specJson.data_source.samples.length;
                specJson.data_source.samples = specJson.data_source.samples.slice(0, 20);
                preview.textContent = JSON.stringify(specJson, null, 2) + `\n\n` + t('PREVIEW_MORE_SAMPLES', '... (還有 %1 個樣本未顯示於預覽區)').replace('%1', total - 20);
            } else {
                preview.textContent = JSON.stringify(specJson, null, 2);
            }
        }

        // 方案 A：任何 spec/標註異動防抖後自動落盤（時間制；涵蓋「停在同張圖」的標註）
        scheduleAutoSave();
    }, 300);
}

function addColumn(column) {
    return panelsPresenter.addColumn(column);
}

function renderAllColumns() {
    return panelsPresenter.renderAllColumns();
}

function renderPreviewTable(container, rows) {
    return panelsPresenter.renderPreviewTable(container, rows);
}

function sanitizeName(text) {
    return sanitizeProjectName(text);
}

/**
 * 切換「資料集名稱衝突」的醒目警示樣式。
 * @param {boolean} on true=加上警示；false=移除。
 */
function setNameWarning(on) {
    const nameInput = getModal()?.querySelector('[name="projectName"]');
    if (!nameInput) return;
    if (on) nameInput.classList.add('dataset-name-warning');
    else nameInput.classList.remove('dataset-name-warning');
}

/**
 * 名稱/來源對齊決策（方案 A）：防止來源切換時「沒注意」而靜默覆寫既有 dataset 進度。
 * @param {string} derivedName 由來源（資料夾名/檔名）推導出的名稱。
 * @param {string|null} sourcePath 新來源路徑（資料夾匯入傳入；檔案匯入傳 null，不觸發碰撞檢查）。
 * @returns {Promise<boolean>} false = 使用者取消（呼叫端應中止匯入）。
 */
async function reconcileProjectName(derivedName, sourcePath) {
    const modal = getModal();
    const nameInput = modal?.querySelector('[name="projectName"]');
    const dirInput = modal?.querySelector('[name="baseDir"]');
    const currentName = nameInput ? (nameInput.value || '').trim() : '';

    // (1) 首次/仍為預設或空白 → 自動帶入來源名稱，並同步 baseDir
    if (!currentName || currentName === 'dataset') {
        if (nameInput) nameInput.value = derivedName;
        if (dirInput) dirInput.value = `dataset/${derivedName}/`;
        setNameWarning(false);
        return true;
    }

    // (2) 已載入來源與新來源路徑不同、且推導名稱相同 → basename 碰撞，可能覆寫既有進度
    const prevPath = state.sourceFolderPath;
    if (prevPath && sourcePath && prevPath !== sourcePath && currentName === derivedName) {
        const ok = await datasetBridge.confirm(
            t('SOURCE_COLLISION_CONFIRM',
                '不同來源資料夾使用了相同名稱「%1」，標註進度將寫入並可能覆寫 dataset/%1/ 的既有進度。\n仍要繼續嗎？',
                derivedName)
        );
        if (!ok) return false;
        if (dirInput) dirInput.value = `dataset/${currentName}/`;
        setNameWarning(true);
        return true;
    }

    // (3) 名稱與新來源推導名稱不同 → 顯式確認是否更新（確認=更新；取消=維持現稱並提示風險）
    if (currentName !== derivedName) {
        const update = await datasetBridge.confirm(
            t('SOURCE_RENAME_CONFIRM',
                '來源已變更為「%1」，但目前資料集名稱為「%2」。\n是否自動更新資料集名稱為「%1」？\n\n（若選擇「取消」將維持「%2」，後續標註進度會儲存至 dataset/%2/，可能覆寫既有進度。若要另立新的資料集，建議先自行複製來源資料夾後再匯入。）',
                derivedName, currentName)
        );
        if (update) {
            if (nameInput) nameInput.value = derivedName;
            if (dirInput) dirInput.value = `dataset/${derivedName}/`;
            setNameWarning(false);
        } else {
            // 維持名稱：同步 baseDir 到維持的名稱，並提示將寫到該 namespace
            if (dirInput) dirInput.value = `dataset/${currentName}/`;
            setNameWarning(true);
            showStatusMessage(
                t('SOURCE_KEPT_STATUS', '資料集名稱維持「%1」；標註進度將儲存至 dataset/%1/', currentName)
            );
        }
        return true;
    }

    // (4) 名稱一致：僅同步 baseDir（確保與目前名稱相符）
    if (dirInput) dirInput.value = `dataset/${currentName}/`;
    setNameWarning(false);
    return true;
}

// Stage 3 切片 2：匯入流程移至 application/importUseCases.js，此處保留同名委派 wrapper
async function handleFileImport(file) {
    getImportUC().importDataFile(file);
}

async function handleDirectoryImport() {
    getImportUC().importDirectory();
}

async function handleDataFileImport() {
    getImportUC().importDataFilePath();
}

/** Stage 3：匯入 use-case（延遲初始化，注入 UI 依賴） */
let importUC = null;
function getImportUC() {
    if (!importUC) {
        importUC = createImportUseCases({
            state,
            getFormValue,
            sanitizeName,
            reconcileProjectName,
            showStatusMessage,
            refreshDynamicPanels,
            refreshPreview,
            loadProgressFromFolder,
            t
        });
    }
    return importUC;
}

/**
 * 自動落盤（方案 A：全範圍自動，移除「儲存進度」按鈕）
 * 在標註/分類/新增/刪除/類別增刪改名等任何資料異動後，將 spec（含 samples[].annotations）
 * 自動寫入「專案根/dataset/<專案>/dataset.json」。時間防抖為主、切圖/退出/關閉立即 flush。
 */
/**
 * 是否有需要持久化的資料（僅在資料存在時才寫入，避免空 spec 落盤）
 */
function hasData() {
    return (state.images && state.images.length > 0) || (state.tableRows && state.tableRows.length > 0);
}

// Stage 3：writeProgressToDisk / scheduleAutoSave 移至 application/progressUseCases.js，此處僅保留同名委派 wrapper（呼叫點零改動）
function writeProgressToDisk() {
    getProgressUC().writeProgressToDisk();
}

function scheduleAutoSave(immediate = false) {
    getProgressUC().scheduleAutoSave(immediate);
}


/**
 * 顯示/隱藏「匯出進行中」的不確定進度條（置於 modal 頂部，兩種模式皆可見）。
 */
function showExportProgress(active) {
    const bar = document.getElementById('dataset-export-progress');
    if (bar) bar.style.display = active ? 'block' : 'none';
}

/**
 * 進入/退出標註模式時，隱藏/還原預覽面板 header 的「驗證/匯出/自動儲存指示」，
 * 避免這些列表導向的操作在標註模式重複或突兀（標註工具列自行提供匯出）。
 */
function setAnnotationHeaderActions(hidden) {
    const modal = getModal();
    if (!modal) return;
    ['#dataset-manager-validate', '#dataset-manager-export', '.dataset-autosave-indicator'].forEach((sel) => {
        const el = modal.querySelector(sel);
        if (el) el.style.display = hidden ? 'none' : '';
    });
}

// Stage 3 切片 3：匯出流程移至 application/exportUseCases.js，此處保留同名委派 wrapper
async function handleExportDataset() {
    getExportUC().exportDataset();
}

/** Stage 3：匯出 use-case（延遲初始化，注入 UI 依賴） */
let exportUC = null;
function getExportUC() {
    if (!exportUC) {
        exportUC = createExportUseCases({
            state,
            getFormValue,
            syncSpecFromUI,
            showStatusMessage,
            showExportProgress,
            t
        });
    }
    return exportUC;
}

// Stage 4 切片 4：縮圖 scroll save/restore 集中管理移至 ui/thumbnails.js，此處保留同名委派 wrapper
const gridScrollManager = createGridScrollManager({
    state,
    getContainer: () => getModal()?.querySelector('#dataset-image-preview') || null,
    hasImages: () => state.images.length > 0
});

function saveGridScroll() {
    gridScrollManager.saveGridScroll();
}

function restoreGridScroll() {
    gridScrollManager.restoreGridScroll();
}


/**
 * 進入影像分類標籤校正模式（image 類型專用）— 委派至 ui/classification.js
 */
function enterClassificationReviewMode(image, index) {
    // P3：隱藏 header 的清除資料／重新選擇類型（X 改為返回資料集管理）
    setHeaderButtons(false, false);
    return classificationController.enterClassificationReviewMode(image, index);
}

/**
 * 載入指定索引的圖片並更新分類校正 UI（image 類型專用）— 委派至 ui/classification.js
 */
function loadClassificationImage(index) {
    return classificationController.loadClassificationImage(index);
}

function enterAnnotationMode(image, index) {
    // 分流：image（影像分類）類型進入「分類標籤校正」模式，而非 bbox 拉框標註
    if (getFormValue('projectType') === 'image') {
        return enterClassificationReviewMode(image, index);
    }
    // P3：隱藏 header 的清除資料／重新選擇類型（X 改為返回資料集管理）
    setHeaderButtons(false, false);
    return annotationController.enterAnnotationMode(image, index);
}

/**
 * 將目前畫布上的標註寫回 state.images 並清除 debounce timer — 委派至 ui/annotation.js
 */
function saveCurrentAnnotations() {
    return annotationController.saveCurrentAnnotations();
}

/**
 * 載入指定索引的圖片並初始化畫布 — 委派至 ui/annotation.js
 */
function loadAnnotationImage(index) {
    return annotationController.loadAnnotationImage(index);
}

/**
 * 切換到指定索引的圖片（先自動儲存目前圖片）
 */
function navigateToImage(newIndex) {
    if (newIndex < 0 || newIndex >= state.images.length) return;
    if (newIndex === state.annotationMode.currentIndex) return;

    // 自動儲存前一張圖的標註（classification 下 annotations 為空陣列，安全）
    saveCurrentAnnotations();

    // 方案 A：切圖時立即將目前圖標註落盤（不等 800ms 防抖）
    scheduleAutoSave(true);

    // 依當前模式載入新圖
    if (state.annotationMode.mode === 'classification') {
        loadClassificationImage(newIndex);
    } else {
        loadAnnotationImage(newIndex);
    }
}

/**
 * 更新頂部進度計數器 — 委派至 ui/annotation.js
 */
function updateAnnotationProgress() {
    return annotationController.updateAnnotationProgress();
}

/**
 * 更新縮圖欄的高亮與勾號狀態
 */
function updateThumbnailHighlight() {
    const thumbnails = document.getElementById('annotation-thumbnails');
    if (!thumbnails) return;

    const items = thumbnails.querySelectorAll('.dataset-annotation-thumb-item');
    const isClassification = state.annotationMode.mode === 'classification';
    items.forEach((item, idx) => {
        item.classList.toggle('current', idx === state.annotationMode.currentIndex);
        if (!isClassification) {
            const isAnnotated = state.images[idx].annotations && state.images[idx].annotations.length > 0;
            item.classList.toggle('annotated', isAnnotated);
        }
    });

    // 自動捲動到當前縮圖
    const currentItem = items[state.annotationMode.currentIndex];
    if (currentItem) {
        currentItem.scrollIntoView({ block: 'center', inlineSize: 'nearest', behavior: 'smooth' });
    }
}

/**
 * 渲染分類標籤校正模式的右側控制欄（目前分類下拉選單 + 新增類別）
 * image 類型專用，不涉及 bbox 標註 — 委派至 ui/classification.js
 */
function renderClassificationControls() {
    return classificationController.renderClassificationControls();
}

/**
 * 清理分類校正模式的鍵盤事件 — 委派至 ui/classification.js
 */
function unbindClassificationKeyboardEvents() {
    return classificationController.unbindClassificationKeyboardEvents();
}

/**
 * 統一「label_map 標籤管理器」— 委派至 ui/labelManager.js（M2 R5）
 */
function createLabelMapManager(container, statsContainer = null) {
    return labelManager.createLabelMapManager(container, statsContainer);
}

/**
 * 渲染右側控制欄（類別選擇器 + 標註列表）— 委派至 ui/annotation.js
 */
function renderAnnotationControls() {
    return annotationController.renderAnnotationControls();
}

/**
 * 渲染標註列表 UI（含 class 更正下拉與高亮）— 委派至 ui/annotation.js
 */
function renderAnnotationListUI(anns) {
    return annotationController.renderAnnotationListUI(anns);
}

/**
 * 檢查是否有未標註圖片，若有則提示使用者
 * @returns {boolean} true = 繼續離開，false = 取消
 */
async function checkUnannotatedOnExit() {
    // 分類校正模式不做 bbox/line 未標註檢查
    if (state.annotationMode.mode === 'classification') return true;
    const unannotated = state.images.filter(img => !img.annotations || img.annotations.length === 0).length;
    if (unannotated > 0) {
        return await datasetBridge.confirm(t('ANNOTATION_UNANNOTATED_WARNING', '尚有 %1 張圖片未標註，確定要離開？').replace('%1', unannotated));
    }
    return true;
}

async function exitAnnotationMode(skipUnannotatedCheck = false) {
    // 非標註模式下安全返回
    if (!state.annotationMode.isActive) {
        UICanvas.unbindEvents();
        unbindClassificationKeyboardEvents();
        const modal = getModal();
        const backBtn = modal?.querySelector('#dataset-annotation-back');
        if (backBtn) backBtn.remove();
        if (modal) modal.classList.remove('dataset-annotation-fullscreen');
        setAnnotationHeaderActions(false);
        refreshDynamicPanels();
        return;
    }

    // 檢查未標註圖片（清除資料等「已確認銷毀一切」的呼叫端可跳過，避免二次警告干擾/誤阻斷）
    if (!(skipUnannotatedCheck || (await checkUnannotatedOnExit()))) return;

    // 自動儲存當前圖標註
    saveCurrentAnnotations();

    // 方案 A：正常退出時將目前圖標註立即落盤（清除流程不需落盤）
    if (!skipUnannotatedCheck) scheduleAutoSave(true);

    // 清理鍵盤事件
    UICanvas.unbindEvents();
    unbindClassificationKeyboardEvents();

    const modal = getModal();
    if (!modal) return;

    // 移除返回按鈕
    const backBtn = modal.querySelector('#dataset-annotation-back');
    if (backBtn) backBtn.remove();

    // 恢復副標題
    const subtitle = modal.querySelector('#dataset-manager-subtitle');
    if (subtitle) subtitle.textContent = t('PAGE_MANAGE', '資料集管理') + ' — ' + t('ENTRY_TYPE_' + (getFormValue('projectType') || 'table').toUpperCase(), getFormValue('projectType') || 'table');
    setHeaderButtons(true, true);

    // 移除 overlay 撐滿 class，恢復原始布局
    modal.classList.remove('dataset-annotation-fullscreen');

    // 移除標註模式 class，恢復原始布局
    const body = modal.querySelector('.dataset-manager-body');
    if (body) {
        body.classList.remove('dataset-annotation-mode');
    }

    // 顯示 source/schema 面板
    const sourcePanel = modal.querySelector('.dataset-source-panel');
    const schemaPanel = modal.querySelector('.dataset-schema-panel');
    if (sourcePanel) sourcePanel.style.display = '';
    if (schemaPanel) schemaPanel.style.display = '';

    // 還原預覽 header 的驗證/匯出/自動儲存指示
    setAnnotationHeaderActions(false);

    // 重置標註模式狀態
    state.annotationMode.isActive = false;
    state.annotationMode.currentIndex = -1;
    state.annotationMode.mode = null;
    state.annotationMode.originalBodyClass = null;

    // 恢復縮圖網格
    refreshDynamicPanels();
}

export function refreshDynamicPanels() {
    const modal = getModal();
    if (!modal) return;

    const projectType = getFormValue('projectType');
    const sourceMode = getFormValue('sourceMode');
    const isImage = projectType === 'image' || projectType === 'object_detection' || projectType === 'line_following';
    const isLive = sourceMode === 'live';

    // 1. 更新匯入/採集區域顯示
    modal.querySelector('#dataset-import-area-table').style.display = (isImage || isLive) ? 'none' : 'block';
    modal.querySelector('#dataset-import-area-image').style.display = (isImage && !isLive) ? 'block' : 'none';

    const structureTitle = modal.querySelector('#dataset-structure-title');
    const structureActions = modal.querySelector('#dataset-schema-actions');
    const structureContent = modal.querySelector('#dataset-structure-content');

    // 2. 更新欄位/標籤面板
    if (isImage || isLive) {
        structureTitle.textContent = t('LABEL_STATS_TITLE', '標籤與樣本統計');
        structureActions.style.display = 'none';
        if (projectType === 'image' || projectType === 'object_detection') {
            // 統一標籤管理器（新增/改名/刪除）+ 統計，與標註模式一致
            structureContent.innerHTML = `
                <div id="view-label-class-manager"></div>
                <div id="view-label-stats"></div>
            `;
            createLabelMapManager(
                document.getElementById('view-label-class-manager'),
                document.getElementById('view-label-stats')
            );
            UIComponents.renderLabelStats(document.getElementById('view-label-stats'), state.spec.toJSON().stats);
        } else {
            UIComponents.renderLabelStats(structureContent, state.spec.toJSON().stats);
        }
    } else {
        structureTitle.textContent = t('STRUCTURE_TITLE', '欄位與標籤');
        structureActions.style.display = 'block';
        structureContent.innerHTML = `
            <div class="dataset-column-head">
                <span>${t('COLUMN_NAME', '名稱')}</span>
                <span>${t('COLUMN_TYPE', '型別')}</span>
                <span>${t('COLUMN_ROLE', '角色')}</span>
                <span></span>
            </div>
            <div id="dataset-column-list" class="dataset-column-list"></div>
        `;
        renderAllColumns();
    }

    // 3. 更新預覽面板
    const previewContent = modal.querySelector('#dataset-preview-content');
    previewContent.innerHTML = `
        <div id="dataset-sampler-view" style="display: none; background: white; border-radius: 8px; margin-bottom: 12px;"></div>
        <div id="dataset-image-preview" style="display: none;"></div>
        <div id="dataset-table-preview" style="background: white; border-bottom: 1px solid #ddd; max-height: 400px; overflow: auto; display: none;"></div>
        <pre id="dataset-json-preview"></pre>
    `;

    // 顯示採集視圖（M2 R6：委派 ui/samplerPanel.js）
    if (isLive) {
        samplerPanel.setupLiveSamplerView(modal, modal.querySelector('#dataset-sampler-view'));
    } else {
        Sampler.stopCamera(true);
    }

    // 顯示影像或表格預覽（保留 scrollTop 避免回到列表或刪除時縮圖捲回最上方）
    if (isImage || isLive) {
        const imagePreview = modal.querySelector('#dataset-image-preview');
        imagePreview.style.display = state.images.length ? 'block' : 'none';
        UIComponents.renderImageGrid(imagePreview, state.images, {
            onImageClick: (img, idx) => enterAnnotationMode(img, idx),
            onDeleteImage: (idx) => handleDeleteImage(idx)
        });
        // 恢復捲動位置（統一由 restoreGridScroll 處理）
        restoreGridScroll();
    } else {
        const tablePreview = modal.querySelector('#dataset-table-preview');
        tablePreview.style.display = state.tableRows.length ? 'block' : 'none';
        renderPreviewTable(tablePreview, state.tableRows);
    }
    refreshPreview();
}

async function handleSamplerSnapshot() {
    showStatusMessage(t('STATUS_CAPTURETING', '📸 正在採集...'));
    
    try {
        const projectName = getFormValue('projectName') || 'dataset';
        await Sampler.takeSnapshot(projectName);
        showStatusMessage(t('SUCCESS_CAPTURE', '✅ 採集成功'));
    } catch (e) {
        showStatusMessage(t('ERROR_CAPTURE_FAILED', '❌ 採集失敗: %1').replace('%1', e.message));
    }
}

/**
 * 刪除指定索引的照片
 */
async function handleDeleteImage(index) {
    const removed = state.images[index];
    if (!removed) return;

    // 解析實體檔案路徑並通知後端刪除（兩種來源）：
    // a) 來源資料夾匯入：sourceFolderPath + 相對 path（前端預檢拒絕絕對路徑與 traversal）
    // b) live 拍攝落盤：removed.diskPath（sidecar 實際存檔的絕對路徑；需 basename 一致驗證）
    let deleteTarget = null;
    if (state.sourceFolderPath && removed.path) {
        const pathCheck = validateDeletableImagePath(state.sourceFolderPath, removed.path);
        if (!pathCheck.ok) {
            console.error('[DatasetManager] Blocked delete of unsafe image path:', removed.path, pathCheck.code);
            return;
        }
        deleteTarget = pathCheck.value;
    } else if (removed.diskPath) {
        const diskCheck = validateDeletableDiskPath(removed.diskPath, state.sourceFolderPath, removed.path);
        if (!diskCheck.ok) {
            console.error('[DatasetManager] Blocked delete of unsafe disk path:', removed.diskPath, diskCheck.code);
            return;
        }
        deleteTarget = diskCheck.value;
    }

    if (deleteTarget) {
        // 預防性保守處理：等待後端結果，成功或「檔案已不存在」皆移除縮圖；真實 IO 失敗才保留並提示
        try {
            const { promise } = datasetBridge.request({
                command: 'datasetDeleteImage',
                payload: { filePath: deleteTarget },
                resultCommand: 'datasetDeleteImageResult',
                timeoutMs: 10000
            });
            const result = await promise;
            if (result && result.success === false && result.errorCode !== 'FILE_NOT_FOUND') {
                showStatusMessage(t('ERROR_PREFIX', '❌ 錯誤: %1').replace('%1', result.error || 'delete failed'));
                return;
            }
            if (result && result.errorCode === 'FILE_NOT_FOUND') {
                showStatusMessage(t('DELETE_FILE_NOT_FOUND', '原始檔已不存在，已從清單移除'));
            }
        } catch (e) {
            console.error('[DatasetManager] Delete image failed:', e);
            showStatusMessage(t('ERROR_PREFIX', '❌ 錯誤: %1').replace('%1', e.message || e));
            return;
        }
    }

    // 釋放 blobUrl 避免記憶體洩漏
    if (removed.blobUrl) {
        URL.revokeObjectURL(removed.blobUrl);
    }

    // 從陣列中移除
    state.images.splice(index, 1);

    // 更新統計與 Spec
    updateStatsFromImages();

    // 刷新 UI（保留 scrollTop 避免刪除後縮圖捲回最上方）
    const modal = getModal();
    if (modal) {
        const structureContent = modal.querySelector('#dataset-structure-content');
        if (structureContent) {
            UIComponents.renderLabelStats(structureContent, state.spec.toJSON().stats);
        }

        const imagePreview = modal.querySelector('#dataset-image-preview');
        if (imagePreview) {
            // 刪除前保存捲動位置
            saveGridScroll();

            if (state.images.length === 0) {
                imagePreview.style.display = 'none';
            }
            UIComponents.renderImageGrid(imagePreview, state.images, {
                onImageClick: (img, idx) => enterAnnotationMode(img, idx),
                onDeleteImage: (idx) => handleDeleteImage(idx)
            });

            // 恢復捲動位置（統一由 restoreGridScroll 處理）
            restoreGridScroll();
        }
    }

    // 標註/校正模式：左欄縮圖條是獨立 DOM（#annotation-thumbnails），刪除後需重繪＋修正 currentIndex
    if (state.annotationMode.isActive) {
        const am = state.annotationMode;
        if (state.images.length === 0) {
            exitAnnotationMode();
        } else {
            const wasCurrent = index === am.currentIndex;
            if (am.currentIndex >= index) am.currentIndex = Math.max(0, am.currentIndex - 1);
            if (am.currentIndex >= state.images.length) am.currentIndex = state.images.length - 1;
            const strip = modal?.querySelector('#annotation-thumbnails');
            if (strip) {
                UIComponents.renderAnnotationThumbnails(strip, state.images, am.currentIndex, {
                    mode: am.mode === 'classification' ? 'classification' : undefined,
                    onThumbnailClick: (newIndex) => navigateToImage(newIndex),
                    onDeleteImage: (delIndex) => handleDeleteImage(delIndex)
                });
            }
            if (wasCurrent) {
                // currentIndex 已調整為倖存鄰圖；navigateToImage 會因 newIndex===currentIndex 早退，
                // 故直接載圖（bbox canvas / 分類預覽同步），內部會一併刷新進度
                if (am.mode === 'classification') {
                    classificationController.loadClassificationImage(am.currentIndex);
                } else {
                    annotationController.loadAnnotationImage(am.currentIndex);
                }
            }
            // 刪除「當前圖之後」的圖時不會走載圖路徑，需顯式刷新「樣本 N / 總數」進度
            if (am.mode === 'classification') {
                classificationController.updateClassifyProgress();
            } else {
                updateAnnotationProgress();
            }
            updateThumbnailHighlight();
        }
    }

    refreshPreview();
}

function handleSamplerBurstToggle() {
    if (Sampler.state.isCapturing) {
        Sampler.stopBurst();
        return false;
    } else {
        const interval = parseInt(document.getElementById('dataset-sampler-interval')?.value || '500');
        const projectName = getFormValue('projectName') || 'dataset';
        Sampler.startBurst(interval, projectName);
        return true;
    }
}

function addSampleFromSampler(blob, savePath = null) {
    const label = Sampler.state.targetLabel || 'unlabeled';
    // [關鍵修正] 單一時間戳：若 sidecar/bridge 已給 savePath（磁碟實際落盤檔），
    // 直接以其 basename 作為檔名，讓 img.path / image_path / diskPath 與磁碟檔名完全一致，
    // 避免「載入資料夾時取不回標註」的檔名脫鏈（先前 image_path 用獨立的 Date.now() 產生虛幻檔名）。
    let filename;
    if (savePath) {
        filename = savePath.split(/[\\/]/).pop();
    } else {
        // 未錨定 / 不落盤時才 fallback 到前端時戳（無磁碟檔，不需還原）
        filename = `${label}_${Date.now()}.jpg`;
    }
    const blobUrl = URL.createObjectURL(blob);
    
    const newImage = {
        name: filename,
        path: `${label}/${filename}`, 
        label: label,
        blobUrl: blobUrl,
        // 真磁碟路徑（VSIX 由 host 端產生；Tauri 若提供即帶入），供「儲存進度」還原與下次載入掃描
        diskPath: savePath || null,
        annotations: []
    };

    state.images.push(newImage);
    
    // 更新統計與 Spec
    updateStatsFromImages();
    
    // 刷新 UI
    const modal = getModal();
    if (modal) {
        // 更新左側的標籤統計數字
        const structureContent = modal.querySelector('#dataset-structure-content');
        if (structureContent) {
            UIComponents.renderLabelStats(structureContent, state.spec.toJSON().stats);
        }

        // 更新右側的影像網格
        const imagePreview = modal.querySelector('#dataset-image-preview');
        if (imagePreview) {
            imagePreview.style.display = 'block'; // 確保網格容器是顯示的
            UIComponents.renderImageGrid(imagePreview, state.images, {
                onImageClick: (img, idx) => enterAnnotationMode(img, idx),
                onDeleteImage: (idx) => handleDeleteImage(idx)
            });
            // 排序統一為「舊→新」：拍攝後自動捲到最下方（最新一張），方便檢視
            const grid = imagePreview.querySelector('.dataset-image-grid');
            if (grid) grid.scrollTop = grid.scrollHeight;
        }
    }

    refreshPreview();
}

/**
 * 產生下一個可用的 label_map 類別 id：取現有最大 id + 1。
 * 避免「以 length 產生 id」在刪除類別後與現存類別碰撞（例如保留 {B:1} 後新增會拿到 1 與 B 衝突）。
 * @param {Object} labelMap 目前的 label_map（name → id）。
 * @returns {number} 新類別應使用的 id（>= 0）。
 */
function nextLabelId(labelMap) {
    return getNextLabelId(labelMap);
}

function updateStatsFromImages() {
    const currentSpec = state.spec.toJSON();
    const projectType = currentSpec.project.type || getFormValue('projectType') || 'table';
    const stats = calculateStats(projectType, state.images, currentSpec.schema.label_map || {});

    state.spec = new DatasetSpec({
        project: currentSpec.project,
        data_source: currentSpec.data_source,
        schema: {
            columns: currentSpec.schema.columns,
            features: currentSpec.schema.features,
            label: currentSpec.schema.label,
            label_map: stats.labelMap
        },
        stats: {
            sample_count: stats.sampleCount,
            label_counts: stats.labelCounts
        }
    });

    // 即時同步所有可見的統計面板（列表/檢視/標註模式皆涵蓋；容器不存在時為 no-op）
    renderStatsPanels();
}

/** 重繪統計容器：優先 #view-label-stats（image/od 列表模式，與 label manager 並存），
 *  否則退回 #dataset-structure-content（line_following 純統計） */
function renderStatsPanels() {
    const modal = getModal();
    if (!modal) return;
    const stats = state.spec.toJSON().stats;
    const viewStats = document.getElementById('view-label-stats');
    if (viewStats) {
        UIComponents.renderLabelStats(viewStats, stats);
        return;
    }
    const structureContent = modal.querySelector('#dataset-structure-content');
    if (structureContent && state.images.length > 0) {
        UIComponents.renderLabelStats(structureContent, stats);
    }
}

function bindModalEvents(modal) {
    modal.querySelector('#dataset-manager-close').onclick = requestCloseDM;
    modal.querySelector('#dataset-manager-validate').onclick = refreshPreview;
    const headerEntryBtn = modal.querySelector('#dataset-header-entry');
    if (headerEntryBtn) headerEntryBtn.onclick = backToEntry;

    const clearBtn = modal.querySelector('#dataset-manager-clear');
    if (clearBtn) {
        clearBtn.onclick = async () => {
            // 防呆：有未匯出工作時先確認，避免誤按清空整批資料
            if (hasUnsavedWork()) {
                const ok = await datasetBridge.confirm(t('CLEAR_CONFIRM', '確定清除所有資料並重置嗎？'));
                if (!ok) return;
            }

            // 0. 確保退出標註模式，清空畫布與事件綁定，並移除返回按鈕
            //    （清除資料是銷毀一切的確認操作，跳過未標註二次警告，避免無關阻斷）
            exitAnnotationMode(true);

            // 1. 停止攝影機與連拍動作
            Sampler.stopCamera(true);
            Sampler.stopBurst();

            // 2. 還原暫存變數
            state.images = [];
            state.tableRows = [];
            state.sourceFolderPath = null;

            // 3. 還原 UI 欄位值
            const nameInput = modal.querySelector('[name="projectName"]');
            if (nameInput) nameInput.value = 'dataset';
            setNameWarning(false);

            const descInput = modal.querySelector('[name="description"]');
            if (descInput) descInput.value = '';

            const typeSelect = modal.querySelector('[name="projectType"]');
            // M1 類型鎖定：清除資料僅清空內容，不變更鎖定類型（修正前誤寫死 'table'）
            const lockedType = sessionManager.snapshot().lockedType || getFormValue('projectType') || 'table';
            if (typeSelect) typeSelect.value = lockedType;

            // 4. 動態關聯 Mode 選項（保留鎖定類型的允許 modes）
            updateSourceModeOptions(lockedType);

            // 5. 重設 Spec 為預設（保留鎖定類型）
            state.spec = DatasetSpec.createDefault({
                name: 'dataset',
                type: lockedType,
                mode: allowedModes(lockedType)[0]
            });

            // 6. 清理檔案選擇值（集中式狀態訊息由面板自動清除）
            
            const fi = modal.querySelector('#dataset-file-input');
            if (fi) fi.value = '';

            // 7. 清理 Sampler 模組內部的預覽快取
            if (Sampler.state.lastPreviewUrl) {
                URL.revokeObjectURL(Sampler.state.lastPreviewUrl);
                Sampler.state.lastPreviewUrl = null;
            }
            Sampler.state.targetLabel = '';

            // 8. 重新整理 UI 與 預覽
            refreshDynamicPanels();
            refreshPreview();
        };
    }

    const exportBtn = modal.querySelector('#dataset-manager-export');
    if (exportBtn) {
        exportBtn.onclick = handleExportDataset;
    }

    const importBtn = modal.querySelector('#dataset-import-btn');
    const fileInput = modal.querySelector('#dataset-file-input');
    if (importBtn) {
        // 原生 dialog 選取檔案（預設起始目錄 = XML 專案根），取代 <input type=file>
        importBtn.onclick = () => handleDataFileImport();
    }
    if (fileInput) {
        // 保留舊機制作為 fallback（file input 的 change 仍可觸發）
        fileInput.onchange = (e) => handleFileImport(e.target.files[0]);
    }

    const dirImportBtn = modal.querySelector('#dataset-dir-import-btn');
    if (dirImportBtn) {
        dirImportBtn.onclick = () => handleDirectoryImport();
    }

    // M1：回入口按鈕（換類型唯一路徑）
    const backBtn = modal.querySelector('#dataset-back-to-entry');
    if (backBtn) {
        backBtn.onclick = () => backToEntry();
    }

    // 遠端環境診斷面板已移除（遠端訓練收斂至積木執行時的 SSH 精靈，見 log/plan/DatasetManagerDarkThemeFinish.md 四；
    // 後端 checkRemoteEnvironment / trainRemote command 保留，訓練端 sidecar 仍在使用）

    // 輔助函式：根據選取的專案類型動態更新來源模式 (Mode) 的選項
    function updateSourceModeOptions(projectType) {
        const sourceSelect = modal.querySelector('[name="sourceMode"]');
        if (!sourceSelect) return;

        const allowedModesList = allowedModes(projectType);

        // 重新渲染選項，若原本選取的模式依舊在允許列表中，則保留它；否則使用預設第一個模式
        const currentMode = sourceSelect.value;
        const nextMode = allowedModesList.includes(currentMode) ? currentMode : allowedModesList[0];
        sourceSelect.innerHTML = optionList(allowedModesList, nextMode);
        
        // 確保 DOM 上的選定值也被同步更新
        sourceSelect.value = nextMode;
    }

    const typeSelect = modal.querySelector('[name="projectType"]');
    if (typeSelect) {
        // M1 類型鎖定：下拉改為 disabled 顯示用，變更唯一路徑＝回入口（backToEntry 按鈕）
        typeSelect.disabled = true;
        typeSelect.title = t('TYPE_LOCKED_TIP', '類型已鎖定');
    }

    const sourceSelect = modal.querySelector('[name="sourceMode"]');
    if (sourceSelect) {
        sourceSelect.onchange = () => {
            // 切換模式（例如從 Live 切換到 File）時，應確實關閉攝影機與連拍
            Sampler.stopCamera(true);
            Sampler.stopBurst();

            refreshDynamicPanels();
            refreshPreview();
        };
    }

    modal.querySelector('#dataset-add-column').onclick = () => addColumn({
        name: `feature_${getColumnsFromUI().length + 1}`,
        type: 'float',
        role: 'feature'
    });
    modal.querySelector('#dataset-add-label').onclick = () => addColumn({
        name: 'label',
        type: 'string',
        role: 'label'
    });

    // 專案名稱即時過濾 (僅限英數下劃線；此欄位值 = dataset/ 下的「資料集名稱」，非 xml 積木專案名)
    const nameInput = modal.querySelector('[name="projectName"]');
    if (nameInput) {
        nameInput.oninput = () => {
            // 使用者開始編輯名稱 → 清除衝突警示
            nameInput.classList.remove('dataset-name-warning');
            const pos = nameInput.selectionStart;
            const original = nameInput.value;
            // 過濾非英數字符
            const sanitized = original.replace(/[^a-zA-Z0-9_-]/g, '');
            if (original !== sanitized) {
                nameInput.value = sanitized;
                // 嘗試保持光標位置
                nameInput.setSelectionRange(pos, pos);
            }
            refreshPreview();
        };
    }

    modal.addEventListener('input', refreshPreview);

    modal.addEventListener('click', (event) => {
        // [強化安全] 徹底移除點擊背景關閉的邏輯，避免因從內部拖曳到外部導致誤觸
        if (event.target.classList.contains('dataset-remove-column')) {
            event.target.closest('.dataset-column-row')?.remove();
            refreshPreview();
        }
    });
    modal.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') requestCloseDM();
    });
}

function createModal() {
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'dataset-manager-overlay';
    // Stage 4 切片 2：modal 模板移至 ui/modal.js（buildModalTemplate 純函式）
    modal.innerHTML = buildModalTemplate({
        t,
        optionList,
        projectTypes: DatasetSpecConstants.PROJECT_TYPES,
        sourceModes: TYPE_TO_MODES_MAP['table']
    });

    document.body.appendChild(modal);
    bindModalEvents(modal);
    return modal;
}

export function initDatasetManagerUI() {
    if (typeof document === 'undefined') return null;

    // 註冊 Sampler 狀態變更回調，當視窗被手動關閉時能即時重新渲染 UI
    Sampler.state.onStatusChanged = () => {
        refreshDynamicPanels();
    };

    const button = document.getElementById('btn-dataset-manager');
    if (button) {
        button.onclick = openDatasetManager;
    }
    return getModal() || createModal();
}

export function refreshI18n() {
    if (typeof document === 'undefined') return null;

    const existingModal = getModal();
    if (existingModal) {
        const shouldReopen = state.isOpen && existingModal.style.display === 'flex';
        existingModal.remove();
        const newModal = initDatasetManagerUI();
        if (shouldReopen && newModal) {
            state.isOpen = true;
            newModal.style.display = 'flex';
            refreshDynamicPanels();
            refreshPreview();
        }
        return newModal;
    }

    return initDatasetManagerUI();
}

export async function openDatasetManager() {
    if (typeof document === 'undefined') return state.spec;

    // 進入閘（2026-08-26 決策）：開啟 Dataset Manager 前先以後端權威來源檢查錨定；
    // 未錨定一律擋下（capabilities 快照會過期，不作為依據）。
    try {
        const anchor = await datasetBridge.getProjectAnchor();
        if (!anchor || !anchor.isAnchored) {
            datasetBridge.alert(t('NEED_ANCHOR',
                '請先開新或開啟一個 xml 積木專案後，再使用 Dataset Manager。\n（資料集必須存放於專案根的 dataset/<資料集名稱> 資料夾內）'));
            return state.spec;
        }
    } catch (e) {
        console.error('[DatasetManager] Anchor check failed:', e);
        datasetBridge.alert(t('NEED_ANCHOR',
            '請先開新或開啟一個 xml 積木專案後，再使用 Dataset Manager。\n（資料集必須存放於專案根的 dataset/<資料集名稱> 資料夾內）'));
        return state.spec;
    }

    const modal = getModal() || createModal();
    state.isOpen = true;
    modal.style.display = 'flex';

    // M1 卡片入口：每次開啟先停在 entry；選卡後才進 workspace
    showEntryPhase(modal);

    modal.querySelector('input[name="projectName"]')?.classList.remove('dataset-name-warning');
    return state.spec;
}

/**
 * M1 卡片入口 phase：body 隱藏、entry 容器顯示；選卡→鎖定→進 workspace。
 */
function showEntryPhase(modal) {
    const body = modal.querySelector('.dataset-manager-body');
    let entry = modal.querySelector('#dataset-entry-view');
    if (!entry) {
        entry = document.createElement('div');
        entry.id = 'dataset-entry-view';
        modal.querySelector('.dataset-manager-dialog')?.appendChild(entry);
    }
    if (body) body.style.display = 'none';
    entry.style.display = 'block';
    entry.innerHTML = buildEntryTemplate({ t });
    entry.querySelectorAll('.dataset-entry-card').forEach((card) => {
        card.onclick = () => enterWorkspace(card.dataset.type);
    });
    setHeaderButtons(false, false);
    const subtitle = modal.querySelector('#dataset-manager-subtitle');
    if (subtitle) subtitle.textContent = t('PAGE_NEW_DATASET', '建立新資料集');
}

/** 頁面級 header 按鈕顯隱（P1：全隱 / P2：清除資料＋重新選擇類型 / P3：全隱） */
function setHeaderButtons(showClear, showEntry) {
    const modal = getModal();
    if (!modal) return;
    const clearBtn = modal.querySelector('#dataset-manager-clear');
    const entryBtn = modal.querySelector('#dataset-header-entry');
    if (clearBtn) clearBtn.style.display = showClear ? 'flex' : 'none';
    if (entryBtn) entryBtn.style.display = showEntry ? 'inline-block' : 'none';
}

/** 設定副標題頁面名（P1 建立新資料集 / P2 資料集管理 — 類型 / P3 標註 — 子模式） */
function setPageSubtitle(text) {
    const modal = getModal();
    const subtitle = modal?.querySelector('#dataset-manager-subtitle');
    if (subtitle) subtitle.textContent = text;
}

function enterWorkspace(type) {
    const modal = getModal();
    if (!modal || !type) return;
    sessionManager.openSession(type);
    // 停止舊會話殘留
    Sampler.stopCamera(true);
    Sampler.stopBurst();
    state.images = [];
    state.tableRows = [];
    state.sourceFolderPath = null;
    setNameWarning(false);
    // 鎖定下拉顯示＋連動 modes
    const typeSelect = modal.querySelector('[name="projectType"]');
    if (typeSelect) {
        typeSelect.value = type;
        typeSelect.disabled = true;
        typeSelect.title = t('TYPE_LOCKED_TIP', '類型已鎖定');
    }
    state.spec = DatasetSpec.createDefault({ name: getFormValue('projectName') || 'dataset', type, mode: allowedModes(type)[0] });
    rebuildSourceModeOptions(type);
    // 開發中 banner
    renderDevBanner(modal, type);
    const entry = modal.querySelector('#dataset-entry-view');
    if (entry) entry.style.display = 'none';
    const body = modal.querySelector('.dataset-manager-body');
    if (body) body.style.display = '';
    setHeaderButtons(true, true);
    setPageSubtitle(t('PAGE_MANAGE', '資料集管理') + ' — ' + t('ENTRY_TYPE_' + type.toUpperCase(), type));
    refreshDynamicPanels();
    refreshPreview();
    modal.querySelector('input[name="projectName"]')?.focus();
}

function renderDevBanner(modal, type) {
    let banner = modal.querySelector('#dataset-dev-banner');
    if (isDevType(type)) {
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'dataset-dev-banner';
            banner.className = 'dataset-dev-banner';
            modal.querySelector('.dataset-manager-dialog')?.insertBefore(banner, modal.querySelector('.dataset-manager-body'));
        }
        const key = type === 'feature' ? 'DEV_BANNER_FEATURE' : 'DEV_BANNER_SERIAL';
        banner.textContent = t(key, '開發中，功能未完善');
        banner.style.display = 'block';
    } else if (banner) {
        banner.style.display = 'none';
    }
}

async function backToEntry() {
    const modal = getModal();
    const result = await sessionManager.requestSwitchType(hasUnsavedWork());
    if (!result.switched || !modal) return;
    // 清理工作區殘留後回入口
    Sampler.stopCamera(true);
    Sampler.stopBurst();
    exitAnnotationMode(true);
    showStatusMessage(t('SWITCH_TYPE_HINT', ''));
    showEntryPhase(modal);
}

/**
 * header X 統一出口（誤觸防護）：
 * - P3 標註模式 → 返回 P2（exitAnnotationMode）
 * - P2 工作區 → confirm 後退出 DM（資料已 autosave 落盤）
 * - P1 入口 → 直接關閉
 */
async function requestCloseDM() {
    if (state.annotationMode.isActive) {
        exitAnnotationMode();
        return;
    }
    if (sessionManager.snapshot().phase === 'workspace') {
        const ok = await datasetBridge.confirm(t('EXIT_DM_CONFIRM',
            '確定退出 Dataset Manager？\n目前的資料已自動儲存於專案的 dataset/<資料集名稱> 資料夾，\n下次可用「選擇影像資料夾」匯入繼續。'));
        if (!ok) return;
    }
    closeDatasetManager();
}

export async function closeDatasetManager() {
    // 方案 A + 進入閘（2026-08-26）：openDatasetManager 已用後端權威錨定擋下未錨定使用者，
    // 且關閉前一律立即落盤（scheduleAutoSave(true)），資料不會遺失。
    // 舊「未錨定才詢問」邏輯依賴會過期的 capabilities.isAnchored 快照，反而造成誤彈確認框，已移除。
    // 保留 CLOSE_UNSAVED_CONFIRM i18n key 供未來情境使用。

    // 關閉前立即落盤，避免最後異動遺失
    scheduleAutoSave(true);

    const modal = getModal();
    state.isOpen = false;
    Sampler.stopCamera(true);

    // 清除標註模式的 debounce timer，避免 callback 在 DOM 銷毀後執行
    if (state.annotationMode.saveTimer) {
        clearTimeout(state.annotationMode.saveTimer);
        state.annotationMode.saveTimer = null;
    }

    // Stage 3：取消排程中的 autosave timer 與 sampler 訂閱（dispose 安全，防銷毀後回呼）
    getProgressUC().cancelAutoSave();
    Sampler.dispose();
    // Stage 4 切片 1：取消進行中的狀態訊息計時器，防止 DOM 銷毀後殘留回呼
    statusMessagePresenter.dispose();
    // Stage 4 切片 5：解除分類校正模式的鍵盤 listener
    classificationController.dispose();
    annotationController.dispose();

    if (modal) modal.style.display = 'none';
    return state.spec;
}

export function toggleDatasetManager() {
    return state.isOpen ? closeDatasetManager() : openDatasetManager();
}

export function removeAnnotation(index) {
    if (UICanvas.state.annotations[index]) {
        UICanvas.state.annotations.splice(index, 1);
        renderAnnotationListUI(UICanvas.state.annotations);
        UICanvas.render();
        refreshPreview();
        // 同步更新縮圖勾號與進度
        updateThumbnailHighlight();
        updateAnnotationProgress();
    }
}

export function getCurrentDatasetSpec() {
    syncSpecFromUI();
    return state.spec;
}
