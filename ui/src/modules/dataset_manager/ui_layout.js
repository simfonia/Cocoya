/**
 * ui_layout.js — Dataset Manager 的組裝層（composition root）
 *
 * 【本檔職責】只做三件事：① 建立四層的各模組實例（core/io/ui/application）
 *   ② 注入依賴 ③ 提供跨層協調。**不持有業務邏輯** —— 邏輯一律在
 *   core/（純函式）／application/（用例）／ui/（呈現）三層之內。
 *
 * 【為什麼需要這份註解】本檔 1891 行、70+ 個內部函式，是全專案最大的單一檔案，
 * 且四層架構（Stage 0~6 重構成果）已在 2026-09-01 落地，但本檔**未隨之收斂**。
 * 新增功能時容易在此「順手寫一段」，繞過分層 —— 那正是架構腐化的入口。
 *
 * 【四層架構與 SSOT】
 *   core/          純函式，無 DOM／無 bridge：typePolicy / stats / labelMap / pathPolicy
 *   io/bridge.js   與宿主通訊的唯一出口（datasetBridge）
 *   application/   用例編排：import / export / progress / session / labelRenameReconcile
 *   ui/            呈現與控制器：modal / form / panels / thumbnails / classification / annotation
 *
 * 【新增功能時的紀律】
 *   ✅ 純計算 → core/；✅ 有副作用的用例 → application/；✅ 只管畫面 → ui/
 *   ❌ 不要在本檔新增業務邏輯；本檔只做「組裝 + 跨層協調」。
 *   若某段協調邏輯 > ~50 行，考慮搬到 ui/orchestrator/（見 todo 的 P2-2 階段二）。
 *
 * 【已知架構債（暫緩施工，勿重蹈覆轍）】
 *   下列函式為**純委派薄包裝**（只做 `return xxxController.yyy()`），理論上可刪除後
 *   讓呼叫端直接取 controller。但實測每個薄包裝有 2~4 處內部呼叫點，刪除須同步
 *   改動 40+ 處，**風險遠高於收益（僅減約 100 行 / 5%）** → 已決策不做。
 *   代表：loadClassificationImage / saveCurrentAnnotations / loadAnnotationImage /
 *         renderValidation / addColumn / renderAllColumns / renderPreviewTable /
 *         getColumnsFromUI / updateAnnotationProgress / renderClassificationControls /
 *         unbindClassificationKeyboardEvents / createLabelMapManager /
 *         renderAnnotationControls / renderAnnotationListUI
 *
 * 【最大函式（搬移成本高，勿輕易嘗試）】
 *   bindModalEvents（190 行）依賴 **16 個本檔符號**（含 `refreshTimeout` 等可變狀態、
 *   `state` / `Sampler` / `refreshPreview` / `backToEntry` 等）。搬到 ui/modalEvents.js
 *   需注入 16 個依賴 → 新檔會比原函式更難懂，屬依賴注入反模式。維持現狀。
 *
 * 【契約红线 — 改本檔前必讀（AGENTS.md 有完整說明）】
 *   `#dataset-structure-content` 是**複合容器**，嚴禁覆寫其 innerHTML。
 *   統計只寫 `#view-label-stats`；需重建整面板時呼叫 `renderStructurePanel()`。
 *   改 `img.path` / `img.label` / `img.diskPath` 後**必**呼叫 `refreshThumbnailBadges()`。
 *   標註改名磁碟對帳一律走 `application/labelRenameReconcile.js`。
 */

import { DatasetSpec, DatasetSpecConstants, TABLE_SAMPLES_PERSIST_LIMIT } from './spec.js';
import { Sampler } from './sampler.js';
import { UIComponents } from './ui_components.js';
import { UICanvas } from './ui_canvas.js';
import { t } from './i18n.js';
import { buildLabelMap as buildCoreLabelMap, nextLabelId as getNextLabelId, sortedLabelEntries, sortedLabelNames } from './core/labelMap.js';
import { calculateStats, countAnnotatedImages } from './core/stats.js';
import { createInitialDatasetState, DatasetStore } from './core/state.js';
import { sanitizeProjectName, detectDatasetNameDrift } from './core/projectNaming.js';
import { validateDeletableImagePath, validateDeletableDiskPath, matchSampleForImage } from './core/pathPolicy.js';
import { escapeHtml } from './core/html.js';
import { datasetBridge } from './io/bridge.js';
import { createProgressUseCases } from './application/progressUseCases.js';
import { createImportUseCases } from './application/importUseCases.js';
import { createExportUseCases } from './application/exportUseCases.js';
import { reconcileRenamedPaths } from './application/labelRenameReconcile.js';
import { createStatusMessageUI } from './ui/statusMessage.js';
import { buildModalTemplate } from './ui/modal.js';
import { createFormPresenter } from './ui/form.js';
import { createGridScrollManager } from './ui/thumbnails.js';
import { createClassificationController } from './ui/classification.js';
import { createAnnotationController } from './ui/annotation.js';
import { createPanelsPresenter } from './ui/panels.js';
import { createLabelManager } from './ui/labelManager.js';
import { createSamplerPanel } from './ui/samplerPanel.js';
import { createFeaturePanel } from './ui/featurePanel.js';
import { buildEntryTemplate } from './ui/entryCards.js';
import { allowedModes, isDevType, isImageType, isFeatureType, isClassificationType } from './core/typePolicy.js';
import { createSessionManager } from './application/sessionManager.js';
import { buildFeatureSchema, landmarksToRow, FEATURE_MEDIAPIPE_MISSING } from './core/featureSchema.js';

const MODAL_ID = 'dataset-manager-modal';


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
    // P2：中欄管理器增/改/刪標籤後，同步右欄 live 採集面板的標籤下拉＋縮圖徽章
    onLabelMapChanged: () => { refreshLiveLabelOptions(); refreshThumbnailBadges(); },
    // Part B：改名後同步磁碟資料夾/檔名（live 落盤區；非阻塞）
    // 2026-10-16 ③：偵測模式的 img.label 在此同步為新名 —— reconcile 的
    // 「目錄段同步」分支以 img.label === newLabel 為觸發條件（分類模式已由
    // labelManager 先行同步，偵測模式 label 不以資料夾為準、此處補齊）。
    onLabelRenamed: (oldName, newName, projectType) => {
        if (!isClassificationType(projectType)) {
            state.images.forEach((img) => {
                if (img && img.label === oldName) img.label = newName;
            });
        }
        handleLabelRenamedOnDisk(oldName, newName);
    },
    // 2026-09-22：統計摘要（影像張數/已標註）SSOT——管理器重繪統計時同步帶入
    buildStatsViewOptions: () => buildStatsViewOptions(),
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
    // 2026-10-13：↑/↓ 必須在分類篩選集合內移動（否則會跳到別的分類的照片）
    navigateFiltered: (delta) => navigateFiltered(delta),
    setAnnotationHeaderActions: (hide) => setAnnotationHeaderActions(hide),
    updateStatsFromImages: () => updateStatsFromImages(),
    updateThumbnailHighlight: () => updateThumbnailHighlight(),
    refreshPreview: () => refreshPreview(),
    createLabelMapManager: (container, statsContainer) => createLabelMapManager(container, statsContainer),
    onDeleteImage: (index) => handleDeleteImage(index),
    // 2026-10-13：P3 縮圖條也套用頂部統計列的分類篩選（回傳 state.images 原始索引）
    visibleImageEntries: () => statsFilteredEntries(),
    // 2026-10-16 ①：進度的「全量＋篩選註記」顯示名；哨兵翻成使用者看得懂的字
    getStatsFilterInfo: () => (statsFilterLabel ? statsFilterDisplayLabel() : null),
    // 2026-10-16 ②：右欄改標籤後左側縮圖條即時重繪（徽章文字吃重繪，不是 highlight）
    // 目前圖改到篩選外時保留篩選（使用者選案：圖暫時看不到、進度註記消失）
    onImageRelabeled: () => renderVisibleThumbnails()
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
    // 2026-10-13：↑/↓ 必須在分類篩選集合內移動（否則會跳到別的分類的照片）
    navigateFiltered: (delta) => navigateFiltered(delta),
    setAnnotationHeaderActions: (hide) => setAnnotationHeaderActions(hide),
    updateStatsFromImages: () => updateStatsFromImages(),
    updateThumbnailHighlight: () => updateThumbnailHighlight(),
    refreshPreview: () => refreshPreview(),
    createLabelMapManager: (container, statsContainer) => createLabelMapManager(container, statsContainer),
    onDeleteImage: (index) => handleDeleteImage(index),
    // 2026-10-13：P3 縮圖條也套用頂部統計列的分類篩選（回傳 state.images 原始索引）
    visibleImageEntries: () => statsFilteredEntries()
});

// M2 R6：live 採集面板編排抽至 ui/samplerPanel.js（下方函式宣告已提升，可安全參照）
const samplerPanel = createSamplerPanel({
    state, Sampler, UIComponents,
    updateStatsFromImages: () => updateStatsFromImages(),
    refreshPreview: () => refreshPreview(),
    onSnapshot: () => handleSamplerSnapshot(),
    onBurstToggle: () => handleSamplerBurstToggle(),
    onStartCamera: async () => {
        const ok = await Sampler.startCamera(Sampler.state.selectedDeviceId);
        if (!ok) {
            // sidecar 啟動失敗（Python 路徑未設／無效或缺 opencv-python）給出可執行的提示
            const err = Sampler.state.lastCameraError || '';
            // ⚠️ [P2-15 2026-10-04] 這裡原本寫成 t('DSM_SIDECAR_START_FAILED', ...)，
            //   但 t() 會自動補前綴（'DSM_' + key）→ 實際查 DSM_DSM_SIDECAR_START_FAILED，
            //   永遠查不到翻譯，英文語系下這些訊息**永遠顯示中文 fallback**。
            //   這兩個鍵在 i18n/en.js 都有翻譯卻讀不到，即為此故。
            showStatusMessage(
                err.indexOf('SIDECAR_START_FAILED') !== -1
                    ? t('SIDECAR_START_FAILED', '❌ 無法啟動資料集服務：請於硬體頁設定有效的 Python 路徑，並確認該 Python 已安裝 opencv-python（pip install opencv-python）')
                    : t('SAMPLER_START_FAILED', '❌ 攝影機啟動失敗，請確認裝置後重試')
            , { duration: 0 });
        } else {
            Sampler.state.lastCameraError = null;
        }
        return ok;
    },
    onStopCamera: () => Sampler.stopCamera(true),
    onSampleCaptured: (blob, savePath) => addSampleFromSampler(blob, savePath),
    // P2：結構面板重繪回呼（重建中欄統一標籤管理器＋統計，不再覆寫 innerHTML）
    refreshStructurePanel: () => renderStructurePanel(),
    nextLabelId: (map) => nextLabelId(map),
    // [T4 2026-10-03] 標籤下拉清單排序 SSOT（見 core/labelMap.js:sortedLabelNames）
    sortedLabelNames: (map) => sortedLabelNames(map),
    sortedLabelEntries: (map) => sortedLabelEntries(map)
});

// M4 Phase 4：feature 類型 live 特徵採集面板（組 row → 依標籤累計 tableRows）
const featurePanel = createFeaturePanel({
    state, datasetBridge, t,
    showStatusMessage: (msg) => showStatusMessage(msg),
    Sampler, UIComponents,
    escapeHtml: (v) => escapeHtml(v),
    FEATURE_MEDIAPIPE_MISSING,
    buildFeatureSchema,
    landmarksToRow,
    nextLabelId: (map) => nextLabelId(map),
    sortedLabelNames: (map) => sortedLabelNames(map),
    sortedLabelEntries: (map) => sortedLabelEntries(map),
    onFeatureCollected: (data) => addFeatureRow(data),
    renderTablePreview: (container, rows) => renderPreviewTable(container, rows),
    // P2：結構面板重繪回呼（重建中欄統一標籤管理器＋統計，不再覆寫 innerHTML）
    refreshStructurePanel: () => renderStructurePanel()
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
 *
 * 2026-10-01：舊實作只更新 state.labelMap 卻不重繪，導致標籤管理器改名後
 * 畫布上的標註文字要切換影像（UICanvas.init → render）才更新。
 * 這裡補上 render()：label_map 變動屬於純顯示變更，立即重繪即可。
 */
function syncLabelMap() {
    const labelMap = state.spec.toJSON().schema.label_map || {};
    UICanvas.state.labelMap = labelMap;
    // 畫布尚未初始化時（沒有 ctx）render 會自行 no-op，不需額外防護
    UICanvas.render();
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
    const isImage = isImageType(projectType);

    let columns = getColumnsFromUI();
    // 影像模式下，如果 UI 上沒有欄位列表（因為切換到了統計視圖），保留現有的 Spec 欄位定義。
    // M4：feature 亦然——live 採集時 UI 顯示標籤+統計（無欄位列），欄位由 featureSchema 動態建立。
    if ((isImage || isFeatureType(projectType)) && columns.length === 0 && state.spec.toJSON().schema.columns.length > 0) {
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

    // 1. project.type / sourceMode 對齊
    // ⚠ 2026-10-13 修：原本無條件以 dataset.json 的 project.type 覆蓋 UI 下拉，
    //   造成「P1 選影像分類 → 匯入資料夾 → 中欄卻以 table 模式開啟」。
    //   M1 類型鎖定鐵律：類型一經選定即鎖定，dataset.json 不得推翻
    //   （否則「類型已鎖定」的 tooltip 與實際行為互相矛盾）。
    //   進度檔的 type 僅在「目前沒有鎖定類型」時才作為權威來源
    //   （例：未來若加入「依進度檔回復類型」的入口）。
    const savedType = spec.project && spec.project.type;
    const lockedType = sessionManager.snapshot().lockedType;
    const effectiveType = lockedType || savedType;
    if (savedType && lockedType && savedType !== lockedType) {
        // 不同就忽略檔案值，不提示（避免每次匯入都跳訊息干擾）；型別以鎖定值為準
        console.log('[DatasetManager] dataset.json type "%s" ignored (locked type "%s")', savedType, lockedType);
    }
    if (effectiveType) {
        const typeSelect = getModal()?.querySelector('[name="projectType"]');
        if (typeSelect && typeSelect.value !== effectiveType) {
            typeSelect.value = effectiveType;
            rebuildSourceModeOptions(effectiveType);
        }
    }
    if (spec.data_source && spec.data_source.mode) {
        const modeInput = getModal()?.querySelector('[name="sourceMode"]');
        if (modeInput) modeInput.value = spec.data_source.mode;
    }

    // 2. 依 image_path 將 annotations / label 套回重新掃描出的 images[]
    // OD 對齊 P3：匯出產物（images/ 扁平佈局）再匯入時，全路徑對不上 →
    // matchSampleForImage 退回 basename 唯一配對；碰撞時保守不套（回傳 null）
    let matched = 0;
    state.images.forEach((img) => {
        const sample = matchSampleForImage(loadedSamples, img.path);
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
    // ⚠ type 必須用 effectiveType（＝鎖定類型優先），不可用 savedType：
    //   兩者不同時若寫 savedType，state.spec 會被改回 dataset.json 的類型，
    //   即使下拉已修回 lockedType，統計/篩選/匯出仍依錯的類型運作
    //   （2026-10-13 實測：匯入影像分類資料夾卻以 table 模式開啟）。
    const projectName = getFormValue('projectName') || (spec.project && spec.project.name) || 'dataset';
    state.spec = new DatasetSpec({
        project: {
            name: projectName,
            type: effectiveType || currentJson.project.type,
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
// [P3-3 2026-10-03] 不再 export：本檔唯一外部消費者 index.js 已於本批移除
// window.CocoyaDataset.refreshPreview 掛載（零消費者）；內部呼叫不受影響。
function refreshPreview() {
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
 * 方案 A（2026-09-17）：資料集名稱＝落盤命名空間（`dataset/<名稱>/`）。
 * 名稱變更時不搬移磁碟既有資料（B 案未實作），故於「已有落盤證據」時提示並標紅；
 * 未落盤（無 diskPath、無 sourceFolderPath）→ 不提示，名稱可自由變更。
 * 判定為純函式 `core/projectNaming.detectDatasetNameDrift`（無 IO）；同一組漂移只提示一次。
 */
let nameDriftWarnKey = null;
function applyDatasetNameDriftHint(nameInput) {
    if (!nameInput) return;
    const drift = detectDatasetNameDrift(state, nameInput.value);
    if (!drift.drifted) {
        nameInput.classList.remove('dataset-name-warning');
        nameDriftWarnKey = null;
        return;
    }
    nameInput.classList.add('dataset-name-warning');
    const key = drift.diskName + '->' + (nameInput.value || 'dataset');
    if (key === nameDriftWarnKey) return; // 同一組漂移不重複提示（避免每次按鍵都跳）
    nameDriftWarnKey = key;
    showStatusMessage(
        t('NAME_DRIFT_TIP', '⚠️ 磁碟既有資料仍在 dataset/%1/；改名不會搬移既有檔案（匯出與標籤改名將以新名稱 dataset/%2/ 為準）')
            .replace('%1', drift.diskName)
            .replace('%2', nameInput.value || 'dataset'),
        { duration: 8000 }
    );
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
 * 進入/退出標註模式時，隱藏/還原預覽面板 header 的「驗證/自動儲存指示」，
 * 避免這些列表導向的操作在標註模式重複或突兀（標註工具列自行提供匯出；
 * 主 header 的匯出/清除改由 setHeaderButtons 依 P1/P2/P3 控制）。
 */
function setAnnotationHeaderActions(hidden) {
    const modal = getModal();
    if (!modal) return;
    ['#dataset-manager-validate', '.dataset-autosave-indicator'].forEach((sel) => {
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
    if (getFormValue('projectType') === 'image_classification') {
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
 * P3 鍵盤焦點歸位（2026-10-14）：縮圖 div 非可聚焦元素，點它會讓 document.activeElement
 * 脫離 canvas／classify-container → 之後 ↑/↓ 不再進 keydown handler 而是捲動縮圖欄。
 * 切換到別張圖時 loadAnnotationImage／loadClassificationImage 會順手 focus；
 * 唯獨「同張二次點擊」走下方的早退分支、焦點永遠回不來 —— 故由該分支明確呼叫本函式。
 */
function refocusAnnotationKeyboard() {
    const modal = getModal();
    if (!modal) return;
    if (state.annotationMode.mode === 'classification') {
        const container = modal.querySelector('#annotation-classify-container');
        if (container && typeof container.focus === 'function') container.focus();
        return;
    }
    const canvas = modal.querySelector('canvas.dataset-annotation-canvas');
    if (canvas && typeof canvas.focus === 'function') canvas.focus();
}

/**
 * 切換到指定索引的圖片（先自動儲存目前圖片）
 */
function navigateToImage(newIndex) {
    if (newIndex < 0 || newIndex >= state.images.length) return;
    if (newIndex === state.annotationMode.currentIndex) {
        // 同張二次點擊：載圖路徑（含 focus）不會執行，必須在此把鍵盤焦點還給畫布，
        // 否則 ↑/↓ 只會捲動縮圖欄、直到點別張圖才恢復（2026-10-14 實機回報）。
        refocusAnnotationKeyboard();
        return;
    }

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
 * 更新分類校正模式頂部進度 — 委派至 ui/classification.js。
 * 2026-10-16 ①：篩選 chip 切換時需即時刷新「全量＋篩選註記」，故 renderVisibleThumbnails
 * 內對 classification 模式補呼叫（bbox 模式的進度是已標註/總數，與篩選無關，不動）。
 */
function updateClassifyProgress() {
    return classificationController.updateClassifyProgress();
}

/**
 * 更新縮圖欄的高亮與勾號狀態
 */
function updateThumbnailHighlight() {
    const thumbnails = document.getElementById('annotation-thumbnails');
    if (!thumbnails) return;

    // 2026-10-13：縮圖條在分類篩選下只含 state.images 的子集，DOM 序號已與
    // currentIndex（絕對索引）脫勾。必須先換算成「篩選後陣列內的位置」再比對，
    // 否則焦點框／勾號會落在別張圖上，或（常見）完全不顯示
    // —— 實機回報：按第二個分類 chip 後綠色焦點框消失，篩全部或第一分類卻正常，
    // 正是因為那兩種情況下位置恰好等於絕對索引。
    const entries = statsFilteredEntries();
    const pos = statsVisiblePositionOf(state.annotationMode.currentIndex);

    const items = thumbnails.querySelectorAll('.dataset-annotation-thumb-item');
    const isClassification = state.annotationMode.mode === 'classification';
    items.forEach((item, idx) => {
        item.classList.toggle('current', idx === pos);
        if (!isClassification) {
            // 勾號必須讀「這張 DOM 縮圖對應的那張圖」，不可用 state.images[idx]
            const entry = entries[idx];
            const isAnnotated = !!(entry && Array.isArray(entry.img.annotations) && entry.img.annotations.length > 0);
            item.classList.toggle('annotated', isAnnotated);
        }
    });

    // 自動捲動到當前縮圖
    const currentItem = items[pos];
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

    // 還原預覽 header 的驗證/自動儲存指示
    setAnnotationHeaderActions(false);

    // 重置標註模式狀態
    state.annotationMode.isActive = false;
    state.annotationMode.currentIndex = -1;
    state.annotationMode.mode = null;
    state.annotationMode.originalBodyClass = null;

    // 恢復縮圖網格
    refreshDynamicPanels();
}

// [P3-3 2026-10-03] 同 refreshPreview：不再 export（ui_layout.js 全檔僅 index.js 匯入）。
function refreshDynamicPanels() {
    const modal = getModal();
    if (!modal) return;

    const projectType = getFormValue('projectType');
    const sourceMode = getFormValue('sourceMode');
    const isImage = isImageType(projectType);
    const isLive = sourceMode === 'live';

    // 1. 更新匯入/採集區域顯示
    modal.querySelector('#dataset-import-area-table').style.display = (isImage || isLive) ? 'none' : 'block';
    modal.querySelector('#dataset-import-area-image').style.display = (isImage && !isLive) ? 'block' : 'none';

    const structureTitle = modal.querySelector('#dataset-structure-title');
    const structureActions = modal.querySelector('#dataset-schema-actions');
    const structureContent = modal.querySelector('#dataset-structure-content');

    // 2. 更新欄位/標籤面板（P2：抽為 renderStructurePanel；sampler/feature 經 refreshStructurePanel 重用）
    renderStructurePanel(structureTitle, structureActions, structureContent);

    // 3. 更新預覽面板
    const previewContent = modal.querySelector('#dataset-preview-content');
    previewContent.innerHTML = `
        <!-- 2026-10-01：移除行內 background: white。行內樣式優先於所有樣式表規則，
             導致 #dataset-sampler-view 的 dark 覆寫（樣式表裡有 body.cocoya-dark-mode）
             永遠不生效 —— 使用者回報 dark 主題下預覽上下出現白底即為此故。
             底色改由樣式表/token 決定。 -->
        <div id="dataset-sampler-view" style="display: none; border-radius: 8px; margin-bottom: 12px;"></div>
        <div id="dataset-image-preview" style="display: none;"></div>
        <div id="dataset-table-preview" style="background: var(--dsm-surface); border-bottom: 1px solid var(--dsm-border-light); max-height: 400px; overflow: auto; display: none;"></div>
        <pre id="dataset-json-preview"></pre>
    `;

    // 顯示採集視圖（M2 R6：委派 ui/samplerPanel.js；M4：feature 走 featurePanel）
    // live 面板重建會拋棄舊按鈕閉包＋DOM 真值；先停舊輪詢，避免幽靈對帳寫回新面板
    if (isLive) {
        Sampler.stopStatusPoll();
        // Ctrl+R 後前端狀態重置但 sidecar 可能殘留 running；進 live 先對帳一次，
        // 事件遺失時由 sampler 內部 syncCameraStatus→onStatusChanged→重建校正。
        Sampler.syncCameraStatus().catch(() => undefined);
        if (isFeatureType(projectType)) {
            featurePanel.setupFeatureLiveView(modal, modal.querySelector('#dataset-sampler-view'));
        } else {
            samplerPanel.setupLiveSamplerView(modal, modal.querySelector('#dataset-sampler-view'));
        }
    } else {
        Sampler.stopCamera(true);
    }

    // 顯示影像或表格預覽（feature 一律顯示表格預覽：live 累計的是表格樣本）
    if (isImage) {
        const imagePreview = modal.querySelector('#dataset-image-preview');
        // 2026-10-13：改走篩選版（索引映射＋分類篩選），不可直接餵 state.images
        renderImageGridFiltered(imagePreview);
        // 恢復捲動位置（統一由 restoreGridScroll 處理）
        restoreGridScroll();
    } else {
        const tablePreview = modal.querySelector('#dataset-table-preview');
        tablePreview.style.display = state.tableRows.length ? 'block' : 'none';
        renderPreviewTable(tablePreview, state.tableRows);
    }

    // 2026-10-13：頂部統計列必須在這裡一併重繪。
    // ⚠ 它不在 #dataset-structure-content 之內，故上面的 renderStructurePanel() 不會碰到它；
    //   而 renderGlobalStatsBar() 原本只由 renderStatsPanels() 呼叫，於是
    //   「清除資料／進出 P3」這類只走 refreshDynamicPanels 的路徑會變成：
    //   中欄統計清了、頂部統計列卻留著舊數字（且未歸零）——這是使用者實機回報的問題 2，
    //   同時也是問題 3「進 P3 後回 P2 chips 全部失效」的根因
    //   （P3 版的 chips 是 span、未綁 click，DOM 沒被重繪就一直留在那裡）。
    renderGlobalStatsBar();

    refreshPreview();
}

/**
 * P2：中欄結構面板（標籤/欄位）重建——自 refreshDynamicPanels §2 抽出，
 * 供 refreshDynamicPanels 與 sampler/feature 的 refreshStructurePanel 共用 SSOT。
 * 影像系與所有 live 類型一律使用「統一標籤管理器（增/改/刪）＋統計」；
 * 僅非影像＋非 live（表格 file 匯入）顯示欄位（Feature/Label）編輯。
 * @param {HTMLElement} [structureTitle] #dataset-structure-title（省略時自行由 modal 定位）
 * @param {HTMLElement} [structureActions] #dataset-schema-actions（省略時自行由 modal 定位）
 * @param {HTMLElement} [structureContent] #dataset-structure-content（省略時自行由 modal 定位）
 */
function renderStructurePanel(structureTitle, structureActions, structureContent) {
    const modal = getModal();
    if (!modal) return;
    if (!structureTitle) structureTitle = modal.querySelector('#dataset-structure-title');
    if (!structureActions) structureActions = modal.querySelector('#dataset-schema-actions');
    if (!structureContent) structureContent = modal.querySelector('#dataset-structure-content');
    if (!structureTitle || !structureActions || !structureContent) return;

    const projectType = getFormValue('projectType');
    const sourceMode = getFormValue('sourceMode');
    const isImage = isImageType(projectType);
    const isLive = sourceMode === 'live';

    if (isImage || isLive) {
        structureTitle.textContent = t('LABEL_STATS_TITLE', '標籤與樣本統計');
        structureActions.style.display = 'none';
        // 統一標籤管理器（新增/改名/刪除）+ 統計，與標註模式一致
        // （P2：line_following / feature 的 live 亦涵蓋，不再是純統計）
        structureContent.innerHTML = `
            <div id="view-label-class-manager"></div>
            <div id="view-label-stats"></div>
        `;
        createLabelMapManager(
            document.getElementById('view-label-class-manager'),
            document.getElementById('view-label-stats')
        );
        UIComponents.renderLabelStats(document.getElementById('view-label-stats'), state.spec.toJSON().stats, buildStatsViewOptions());
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
}

/**
 * Part B（2026-09-16）：標籤改名後同步磁碟——
 * 對 canonical dataset/<專案>/ 落盤區發 datasetRenameLabel（資料夾整體改名＋<old>_ 檔名前綴改 <new>_），
 * 成功後以回傳 renames 對帳 img.diskPath/img.name/img.path，再經 refreshPreview 重同步 spec samples。
 * 來源資料夾（使用者 import 的 sourceFolderPath）不碰；失敗僅提示，不回滾 label_map 改名。
 * 2026-10-16 ③：renames 為空＝磁碟無改動（目錄不存在）才跳過；後端契約保證
 * 目錄有改名即非空（含目錄改名條目），故此處不再以「空」為由跳過目錄段對帳。
 */
async function handleLabelRenamedOnDisk(oldName, newName) {
    if (!state.images.length) return;
    const projectName = getFormValue('projectName') || 'dataset';
    try {
        const { promise } = datasetBridge.request({
            command: 'datasetRenameLabel',
            payload: { projectName, oldLabel: oldName, newLabel: newName },
            resultCommand: 'datasetRenameLabelResult',
            timeoutMs: 30000
        });
        const result = await promise;
        if (result && result.success === false) {
            showStatusMessage(t('LABEL_DISK_RENAME_FAILED', '⚠️ 標籤已改名，但磁碟資料夾同步失敗: %1')
                .replace('%1', result.errorCode || result.error || 'unknown'));
            return;
        }
        const renames = (result && result.renames) || [];
        // [2026-09-17 修] 對帳抽為 application/labelRenameReconcile.js 純函式（Node 可測）：
        // 路徑一律經 core/pathPolicy.normalizePath 比對——後端回傳已正規化（反斜線→正斜線），
        // 但 img.diskPath 是 capture 的 savePath（VSIX path.join＝反斜線；Tauri 專案根亦帶反斜線），
        // 不正規化會 miss，落到「只改 path 目錄段」分支，造成 spec image_path 資料夾新／檔名舊。
        // 2026-10-16 ③：renames 為空＝後端 no-op（目錄不存在），直接跳過；
        // 非空才對帳（含目錄改名條目 → 匯入圖的 path 目錄段同步，json 檔名不再脫鏈）。
        if (renames.length) {
            reconcileRenamedPaths(state.images, renames, { oldLabel: oldName, newLabel: newName });
            // [2026-09-17 修] 對帳後必須重繪縮圖（hover tooltip 的 title 吃 img.path），否則顯示舊檔名
            refreshThumbnailBadges();
            refreshPreview(); // 重同步 spec samples/image_path（防抖後自動落盤 dataset.json）
        }
        showStatusMessage(t('LABEL_DISK_RENAMED', '✅ 標籤改名完成，磁碟資料夾/檔名已同步（%1 個檔案）')
            .replace('%1', renames.length));
    } catch (e) {
        showStatusMessage(t('LABEL_DISK_RENAME_FAILED', '⚠️ 標籤已改名，但磁碟資料夾同步失敗: %1')
            .replace('%1', e.message || e));
    }
}

/**
 * 2026-09-16：label_map 改名/增刪後刷新縮圖徽章——
 * 標註模式重繪縮圖列（badge 吃 img.label）；列表模式重繪右欄縮圖牆（dataset-image-label 徽章）。
 * 兩者皆保留捲動位置；不改動 state.images（改名邏輯已在 labelManager 處理）。
 */
function refreshThumbnailBadges() {
    const modal = getModal();
    if (!modal) return;
    if (state.annotationMode && state.annotationMode.isActive) {
        const strip = modal.querySelector('#annotation-thumbnails');
        if (strip) {
            // 2026-10-13：改走 SSOT（含分類篩選＋索引映射；currentIndex 由它自行讀取）
            renderAnnotationStrip(strip);
        }
        return;
    }
    const imagePreview = modal.querySelector('#dataset-image-preview');
    if (imagePreview && state.images.length) {
        // 2026-10-13：改名/增刪類別後重繪縮圖徽章，改走篩選版以保留目前分類篩選
        renderImageGridFiltered(imagePreview);
        restoreGridScroll();
    }
}

/**
 * P2：label_map 變更（中欄管理器增/改/刪）後，同步右欄 live 採集面板的標籤下拉。
 * 同時修正 Sampler.state.targetLabel 指向已不存在（改名/刪除）的標籤時，退回首標籤。
 */
function refreshLiveLabelOptions() {
    const modal = getModal();
    const view = modal ? modal.querySelector('#dataset-sampler-view') : null;
    if (!view) return;
    // [T4 2026-10-03] 依字母序（與 samplerPanel / featurePanel 一致，SSOT 見 core/labelMap.js）
    const labels = sortedLabelNames(state.spec.toJSON().schema.label_map || {});

    // 影像採集下拉（sampler）
    const labelSelect = view.querySelector('#dataset-sampler-label-select');
    if (labelSelect) {
        let target = Sampler.state.targetLabel;
        if (!labels.includes(target)) {
            target = labels.length ? labels[0] : '';
            Sampler.setTargetLabel(target);
        }
        labelSelect.innerHTML = labels.map((lb) =>
            '<option value="' + escapeHtml(lb) + '"' + (lb === target ? ' selected' : '') + '>'
            + escapeHtml(lb) + '</option>'
        ).join('');
    }

    // 特徵採集下拉（feature；目前選取值以 DOM 為準）
    const featureSelect = view.querySelector('#feature-label-select');
    if (featureSelect) {
        let cur = featureSelect.value;
        if (!labels.includes(cur)) cur = labels.length ? labels[0] : '';
        featureSelect.innerHTML = labels.map((lb) =>
            '<option value="' + escapeHtml(lb) + '"' + (lb === cur ? ' selected' : '') + '>'
            + escapeHtml(lb) + '</option>'
        ).join('');
        if (cur) Sampler.setTargetLabel(cur);
    }
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
        // [2026-09-17 修] 統計由上方 updateStatsFromImages()→renderStatsPanels 就地更新；
        // 不再覆寫 #dataset-structure-content innerHTML（會沖掉中欄統一標籤管理器）。

        const imagePreview = modal.querySelector('#dataset-image-preview');
        if (imagePreview) {
            // 刪除前保存捲動位置
            saveGridScroll();

            if (state.images.length === 0) {
                imagePreview.style.display = 'none';
            }
            // 2026-10-13：改走篩選版——刪除後的 grid 序號已與 state.images 錯位，
            // 未映射會讓後續點擊/刪除打到別的圖（索引對齊是篩選功能的必要條件）
            renderImageGridFiltered(imagePreview);

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
                // 2026-10-13：改走 SSOT（含分類篩選＋索引映射）
                renderAnnotationStrip(strip);
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
        // 2026-10-13：標記此 blobUrl 由前端 createObjectURL 建立（＝我們持有、必須 revoke）。
        // 匯入資料夾而來的 blobUrl 是後端 asWebviewUri／convertFileSrc 產生的平台檔案 URI，
        // 不是我們建的，無從也不該 revoke（呼叫亦是 no-op）。兩者混在同一个 img.blobUrl
        // 欄位，只能靠這個旗標區分，否則「關閉 DM 釋放記憶體」會誤 revoke 平台 URI。
        _blobOwned: true,
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
        // [2026-09-17 修] 統計已由上方 updateStatsFromImages()→renderStatsPanels 就地更新。
        // 嚴禁再以 renderLabelStats 覆寫 #dataset-structure-content innerHTML——
        // 該容器裝的是中欄統一標籤管理器（#view-label-class-manager）＋統計，
        // 覆寫會讓「拍照後標籤管理 UI 消失」（同 P2 sampler/feature 病根，僅此路徑漏改）。

        // 更新右側的影像網格
        const imagePreview = modal.querySelector('#dataset-image-preview');
        if (imagePreview) {
            // 2026-10-13：拍攝到「非目前篩選分類」的圖時必須解除篩選，
            // 否則新拍的圖不在篩選結果內，使用者會以為沒拍進去。
            // 「未標註」哨兵例外：剛拍下的圖本來就沒有任何框/線段，
            // 它在該篩選下是可見的，解除反而會打斷使用者正在做的流程。
            if (statsFilterLabel !== null
                && statsFilterLabel !== UIComponents.UNANNOTATED_FILTER
                && statsFilterLabel !== newImage.label) {
                statsFilterLabel = null;
                renderGlobalStatsBar();
            }
            renderImageGridFiltered(imagePreview);
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

/**
 * M4 Phase 4：feature live 採集到一列後的回調——累計進 state.tableRows、
 * 依 featureSchema 動態建 schema.columns、重算 label_counts/sample_count、刷新表格預覽與統計。
 */
function addFeatureRow({ row, _useZ, schema }) {
    const curSpec = state.spec.toJSON();
    const labelMap = curSpec.schema.label_map || {};

    // live 採集由 featureSchema 動態建立欄位（蓋過既有；file 匯入的表格樣本不與 live 混用）
    state.tableRows.push(row);

    // 依實際 row 的 label 值統計（表格系無 state.images，無法走 calculateStats）
    const counts = {};
    state.tableRows.forEach((r) => {
        const l = String(r.label || '');
        if (l) counts[l] = (counts[l] || 0) + 1;
    });

    state.spec = new DatasetSpec({
        project: curSpec.project,
        data_source: curSpec.data_source,
        schema: {
            columns: schema.columns,
            features: schema.features,
            label: schema.label,
            label_map: labelMap
        },
        stats: {
            sample_count: state.tableRows.length,
            label_counts: counts,
            samples_truncated: state.tableRows.length > TABLE_SAMPLES_PERSIST_LIMIT
        }
    });

    // 刷新表格預覽與統計
    const modal = getModal();
    if (modal) {
        const tablePreview = modal.querySelector('#dataset-table-preview');
        renderPreviewTable(tablePreview, state.tableRows);
    }
    renderStatsPanels();
    refreshPreview();
}

/**
 * 2026-09-22：統計面板檢視選項（SSOT）。
 * 偵測/循跡的 label_counts 是「框數/線段數」，採集後未標註時全為 0，
 * 初學者會誤判「沒拍到圖」；故一併傳入影像張數與已標註張數，
 * 由 UIComponents.renderLabelStats 於頂部顯示摘要列（並依任務換計數欄表頭）。
 * 表格系（table/feature/serial，無 state.images）回空物件（僅渲染標籤計數）。
 * @returns {{projectType?: string, imageCount?: number, annotatedCount?: number}}
 */
function buildStatsViewOptions() {
    const projectType = state.spec.toJSON().project.type || getFormValue('projectType') || 'table';
    if (!isImageType(projectType)) {
        return {};
    }
    const images = Array.isArray(state.images) ? state.images : [];
    return {
        projectType,
        imageCount: images.length,
        annotatedCount: countAnnotatedImages(projectType, images)
    };
}

/** 重繪統計容器：優先 #view-label-stats（影像系/live 與 label manager 並存，P2 已全 live 涵蓋），
 *  其次：統一管理器存在但統計容器缺失 → 重建整個結構面板（嚴禁覆寫 innerHTML 沖掉管理器）；
 *  最後才退回 #dataset-structure-content（表格 file 模式，該模式無統一管理器） */
/**
 * 2026-10-13：頂部統計列（#dataset-global-stats）的「分類篩選」狀態。
 * null＝顯示全部。僅分類（image_classification）型別可篩選——
 * 偵測/循跡的 label_counts 是「框數/線段數」而非每張圖的類別，
 * 用同一組 chips 去篩選影像在語意上是錯的，故那些類型 chips 不可點。
 * 沿用 nameDriftWarnKey 的模組級慣例；新會話（enterWorkspace）與清除資料時重設。
 */
let statsFilterLabel = null;

/** 統計列是否可篩選：所有影像型別皆可（分類比 label、偵測/循跡比「含該類別的框/線段」）。
 *
 *  2026-10-13：原本限制為「僅 image_classification 且非標註模式」，造成兩個實機問題：
 *   ① 物件偵測模式的 chips 完全沒有反應（label_counts 是框數，被誤判成不可篩選）
 *   ② P3 的 chips 點了沒效果，且因為 P3 版渲染成 span，回 P2 後仍沿用那份 DOM → 全部失效
 *  現在三種影像型別在 P2／P3 都可篩選（P2 篩縮圖牆、P3 篩左側縮圖條），
 *  行為一致，也不會再出現「看起來能點卻沒反應」。 */
function isStatsFilterable() {
    const projectType = state.spec.toJSON().project.type || getFormValue('projectType') || 'table';
    return isImageType(projectType);
}

/**
 * 依目前篩選條件展開 state.images → [{ img, index }]。
 * 回傳 index 是**state.images 內的原始索引**，供刪除/進入標註時對齊
 * （篩選後 grid 的序號與 state.images 已不同，直接用會刪錯圖）。
 *
 * 比對語意依型別而異（兩者都對應 stats.label_counts 的計數口徑）：
 *   · 分類：img.label === 篩選類別
 *   · 偵測/循跡：該圖「至少有一個」class_id 等於該類別 id 的標註
 *     （chips 上顯示的是框/線段數，篩選出來的是「含該類別的影像」，語意不同但一致可用；
 *      tooltip 會標明兩者，避免誤解）
 */
function statsFilteredEntries() {
    const images = Array.isArray(state.images) ? state.images : [];
    const entries = images.map((img, index) => ({ img, index }));
    if (!statsFilterLabel) return entries;

    // 「未標註」哨兵（2026-10-13）：不是真實類別，故必須在 label_map 查表之前先處理。
    // 判準＝該圖完全沒有任何標註（與 annotatedCount 的口徑互補，兩者相加＝張數）。
    if (statsFilterLabel === UIComponents.UNANNOTATED_FILTER) {
        return entries.filter((entry) => {
            const anns = (entry.img && Array.isArray(entry.img.annotations)) ? entry.img.annotations : [];
            return anns.length === 0;
        });
    }

    const projectType = state.spec.toJSON().project.type || getFormValue('projectType') || 'table';
    if (isClassificationType(projectType)) {
        return entries.filter((entry) => String(entry.img && entry.img.label || 'unlabeled') === statsFilterLabel);
    }
    // 偵測/循跡：以 label_map 反查 class_id，再比對該圖的 annotations
    const labelMap = state.spec.toJSON().schema.label_map || {};
    const classId = labelMap[statsFilterLabel];
    if (classId === undefined) return [];
    return entries.filter((entry) => {
        const anns = (entry.img && Array.isArray(entry.img.annotations)) ? entry.img.annotations : [];
        return anns.some((a) => a && a.class_id === classId);
    });
}

/** 目前縮圖列／縮圖牆顯示的第幾張＝原始索引 absIndex（找不到回 -1） */
function statsVisiblePositionOf(absIndex) {
    return statsFilteredEntries().findIndex((entry) => entry.index === absIndex);
}

/**
 * 篩選條件的「顯示名稱」：一般情況就是類別名；「未標註」哨兵則翻成使用者看得懂的字。
 * 所有要把它印進訊息的地方都必須走這裡 —— 直接印哨兵值會出現 `__cocoya_unannotated__`。
 */
function statsFilterDisplayLabel() {
    return (statsFilterLabel === UIComponents.UNANNOTATED_FILTER)
        ? t('STATS_UNANNOTATED', '未標註')
        : statsFilterLabel;
}

/**
 * 2026-10-13：在「目前篩選集合內」前後移動（↑/↓ 鍵用）。
 *
 * 為何需要它：原本按鍵直接 `navigateToImage(currentIndex ± 1)`，走的是絕對索引，
 * 於是分類篩選後按 ↑/↓ 會跳到別的分類的照片 —— 與「畫面只看得到這個分類」矛盾
 * （實機回報：篩分類後仍可用上下鍵移到其它分類相片）。
 * 本函式在篩選後的序列裡算下一格，再映射回絕對索引。
 *
 * @param {number} delta -1＝上一張、+1＝下一張
 */
function navigateFiltered(delta) {
    const entries = statsFilteredEntries();
    if (entries.length === 0) return;
    const pos = statsVisiblePositionOf(state.annotationMode.currentIndex);
    // 當前照片不在篩選結果內（例如剛切到別的分類）→ 從頭/尾開始，而非整個失效
    const from = (pos < 0) ? (delta > 0 ? -1 : entries.length) : pos;
    const nextPos = from + delta;
    if (nextPos < 0 || nextPos >= entries.length) return; // 邊界：不做循環
    navigateToImage(entries[nextPos].index);
}

/**
 * 重繪右欄縮圖牆（含分類篩選）＋正確的索引映射。
 * 所有原本直接呼叫 renderImageGrid(..., state.images, ...) 的列表模式呼叫點
 * 一律改走本函式，確保篩選狀態不會在某條路徑上被繞過。
 */
function renderImageGridFiltered(imagePreview) {
    if (!imagePreview) return;
    if (state.annotationMode && state.annotationMode.isActive) return; // P3 有自己的縮圖條
    const entries = statsFilteredEntries();
    if (state.images.length > 0 && entries.length === 0) {
        // 篩選後無結果：不可回退成「尚無影像資料」（會讓人以為圖全掉了）
        imagePreview.style.display = 'block';
        imagePreview.innerHTML = '<div class="dataset-empty-state">'
            + escapeHtml(t('STATS_FILTER_EMPTY', '此分類目前沒有影像')
                .replace('%1', statsFilterDisplayLabel()))
            + '</div>';
        return;
    }
    imagePreview.style.display = entries.length ? 'block' : 'none';
    UIComponents.renderImageGrid(imagePreview, entries.map((entry) => entry.img), {
        onImageClick: (img, idx) => enterAnnotationMode(img, entries[idx].index),
        onDeleteImage: (idx) => handleDeleteImage(entries[idx].index)
    });
}

/** 重繪統計容器：優先 #view-label-stats（影像系/live 與 label manager 並存，P2 已全 live 涵蓋），
 *  其次：統一管理器存在但統計容器缺失 → 重建整個結構面板（嚴禁覆寫 innerHTML 沖掉管理器）；
 *  最後才退回 #dataset-structure-content（表格 file 模式，該模式無統一管理器）
 *
 *  2026-10-13：頂部統計列 #dataset-global-stats **在函式最前面無條件先寫**，
 *  再走下列既有分支。順序是契約不是風格——
 *  P3 標註模式時 `#view-label-stats` 的 DOM 仍存在（只是面板 display:none），
 *  第一個分支會 return；若把頂部列寫在後面，P3 就永遠不會更新。 */
function renderStatsPanels() {
    const modal = getModal();
    if (!modal) return;
    const stats = state.spec.toJSON().stats;

    // 篩選目標已被刪除/改名 → 自動解除，避免 chips 指著不存在的類別
    // 2026-10-13：「未標註」是哨兵不是真實類別，label_counts 永遠查不到它 ——
    // 若不豁免，一選中就立刻被本段誤判成「類別已刪除」而自動解除（chip 會閃一下就消失）。
    const counts = (stats && stats.label_counts) || {};
    if (statsFilterLabel !== null
        && statsFilterLabel !== UIComponents.UNANNOTATED_FILTER
        && !Object.prototype.hasOwnProperty.call(counts, statsFilterLabel)) {
        statsFilterLabel = null;
    }

    renderGlobalStatsBar();

    const viewStats = document.getElementById('view-label-stats');
    if (viewStats) {
        UIComponents.renderLabelStats(viewStats, stats, buildStatsViewOptions());
        return;
    }
    // [2026-09-17 修] 管理器在、統計容器不在 → 走 SSOT 重建，避免直接覆寫管理器的父容器
    if (document.getElementById('view-label-class-manager')) {
        renderStructurePanel();
        return;
    }
    const structureContent = modal.querySelector('#dataset-structure-content');
    if (structureContent && state.images.length > 0) {
        UIComponents.renderLabelStats(structureContent, stats, buildStatsViewOptions());
    }
}

/**
 * 2026-10-13：繪出視窗最上方常駐統計列（總數＋分類別 chips）。
 * 由 renderStatsPanels() 統一呼叫，故 updateStatsFromImages／addFeatureRow／
 * labelManager 增改刪／saveCurrentAnnotations 等 20+ 處呼叫點全部自動同步，
 * 不另立第二條更新路徑（避免兩處數字不一致的難查 bug）。
 */
function renderGlobalStatsBar() {
    const bar = document.getElementById('dataset-global-stats');
    if (!bar) return;
    const stats = state.spec.toJSON().stats;
    const options = buildStatsViewOptions();
    UIComponents.renderGlobalStats(bar, stats, Object.assign({}, options, {
        activeLabel: statsFilterLabel,
        filterable: isStatsFilterable(),
        onChipClick: (label) => setStatsFilter(label)
    }));
}

/**
 * 2026-10-13：點擊統計列 chip 切換分類篩選。同一顆再點＝取消（回到全部）。
 * 篩選只影響縮圖牆／縮圖條的顯示，不動 state.images 與 spec（統計數字恆為全量）。
 * P2 篩 #dataset-image-preview；P3 篩 #annotation-thumbnails（兩者都走索引映射）。
 */
function setStatsFilter(label) {
    const next = (typeof label === 'string' && label) ? label : null;
    statsFilterLabel = (next !== null && next === statsFilterLabel) ? null : next;
    renderGlobalStatsBar();
    renderVisibleThumbnails();
}

/** 依目前篩選重繪「當前模式可見的縮圖集合」（P2 縮圖牆／P3 縮圖條），並保留捲動位置 */
function renderVisibleThumbnails() {
    const modal = getModal();
    if (!modal) return;
    if (state.annotationMode && state.annotationMode.isActive) {
        const strip = modal.querySelector('#annotation-thumbnails');
        if (strip) renderAnnotationStrip(strip);
        // 2026-10-16 ①：切篩選時分類進度的註記（篩選 X: a/b）也要即時刷新；
        // bbox 進度是已標註/總數、與篩選無關，不刷新。
        if (state.annotationMode.mode === 'classification') updateClassifyProgress();
        return;
    }
    const imagePreview = modal.querySelector('#dataset-image-preview');
    if (imagePreview) {
        saveGridScroll();
        renderImageGridFiltered(imagePreview);
        restoreGridScroll();
    }
}

/**
 * P3 左側縮圖條（含分類篩選＋索引映射）。
 * currentIndex 必須傳「篩選後陣列內的位置」而非原始索引 —— renderAnnotationThumbnails
 * 是用它來決定哪一張高亮；而點擊／刪除回呼要映射回原始索引，否則會跳到或刪掉別張圖。
 */
function renderAnnotationStrip(strip) {
    const am = state.annotationMode;
    const entries = statsFilteredEntries();
    const pos = statsVisiblePositionOf(am.currentIndex);
    UIComponents.renderAnnotationThumbnails(strip, entries.map((entry) => entry.img), pos, {
        mode: am.mode === 'classification' ? 'classification' : undefined,
        onThumbnailClick: (i) => navigateToImage(entries[i].index),
        onDeleteImage: (i) => handleDeleteImage(entries[i].index)
    });
    updateThumbnailHighlight();
}

function bindModalEvents(modal) {
    modal.querySelector('#dataset-manager-close').onclick = requestCloseDM;
    // 2026-09-16：驗證按鈕即時回饋——取消防抖、立即驗證並以訊息框顯示結果摘要
    modal.querySelector('#dataset-manager-validate').onclick = () => {
        if (refreshTimeout) { clearTimeout(refreshTimeout); refreshTimeout = null; }
        syncSpecFromUI(true);
        const result = state.spec.validate();
        const validation = modal.querySelector('#dataset-validation');
        if (validation) validation.innerHTML = renderValidation(result);
        // [P2-13] 只用 errors.length（不讀取文案），無需翻譯
        showStatusMessage(result.ok
            ? t('VALIDATE_OK_STATUS', '✅ 驗證通過：Spec 可用')
            : t('VALIDATE_FAIL_STATUS', '❌ 驗證發現 %1 個錯誤，請查看右欄訊息框').replace('%1', result.errors.length));
    };
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

            // 1~7 全部收斂至 SSOT（2026-10-13）。
            // 原本這裡自己寫一份重置（8 個步驟），與 enterWorkspace 各持一份 →
            // 新增會話級暫存時只會補到其中一處（本次 statsFilterLabel 就漏了清除路徑）。
            // keepLockedType：清除資料只清內容，不變更已鎖定的類型（M1 契約）。
            resetSessionData({ keepLockedType: true });

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

    // 註：原本此處有一個區域函式 updateSourceModeOptions(projectType)，功能與頂層
    // rebuildSourceModeOptions(projectType) 完全相同。2026-10-13 死碼清理：
    // 「清除資料」改走 resetSessionData SSOT 後它已無呼叫端（0 處），
    // 且 2026-09-10 曾因 enterWorkspace 誤 call 這個未定義的區域版而報錯
    // （見 log/work/2026-09-10.md 熱修1）——同名兩份是歷史事故源，故直接移除。

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
            // 方案 A（2026-09-17）：已有落盤資料時，名稱變更不會搬移磁碟內容 → 標紅＋提示
            applyDatasetNameDriftHint(nameInput);
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
        sourceModes: allowedModes('table')
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

    // [2026-10-21 資源釋放] 重新訂閱相機狀態事件：
    // closeDatasetManager() 會呼叫 Sampler.dispose() 解除訂閱，而 Sampler 是
    // 跨 DM 開關存活的單例 —— 若不重新 init，關閉一次後就再也收不到
    // datasetCameraStatus（相機狀態燈號不會更新）。init() 本身冪等。
    Sampler.init();

    // 2026-10-13（方案 A）：關閉時已歸零（見 closeDatasetManager），這裡是保險網 ——
    // 只為「未經 closeDatasetManager 就被再次開啟」的異常路徑保留（例如 host 端直接
    // dispatch openDatasetManager）。正常路徑下 state 已是空的，此行等於 no-op。
    // 已 autosave 落盤的資料不受影響，仍可用「選擇影像資料夾」匯入繼續。
    resetSessionData();

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
    // 2026-10-13：統計列在 body 之外，body 隱藏不會連帶隱藏它 → 必須顯式隱藏
    const statsBar = modal.querySelector('#dataset-global-stats');
    if (statsBar) statsBar.style.display = 'none';
    modal.classList.add('dataset-entry-phase'); // P1 字級上游（font_scale.css --fs-p1）
    entry.style.display = 'block';
    entry.innerHTML = buildEntryTemplate({ t });
    entry.querySelectorAll('.dataset-entry-card').forEach((card) => {
        card.onclick = () => enterWorkspace(card.dataset.type);
    });
    setHeaderButtons(false, false);
    const subtitle = modal.querySelector('#dataset-manager-subtitle');
    if (subtitle) subtitle.textContent = t('PAGE_NEW_DATASET', '建立新資料集');
}

/**
 * 頁面級 header 按鈕顯隱（P1：全隱 / P2：匯出資料集＋清除資料＋重新選擇類型 / P3：全隱）
 *
 * 2026-10-01：P3（標註模式）不提供匯出 —— 匯出僅存在於 P2 資料集管理頁。
 *   P3 原本靠中欄工具列自帶的匯出鈕，該鈕已一併移除（與標頭語意重複）。
 *   故維持「showClear 同時控制匯出」的原語意：P3 傳 false 即三顆全隱。
 */
function setHeaderButtons(showClear, showEntry) {
    const modal = getModal();
    if (!modal) return;
    const exportBtn = modal.querySelector('#dataset-manager-export');
    const clearBtn = modal.querySelector('#dataset-manager-clear');
    const entryBtn = modal.querySelector('#dataset-header-entry');
    if (exportBtn) exportBtn.style.display = showClear ? 'flex' : 'none';
    if (clearBtn) clearBtn.style.display = showClear ? 'flex' : 'none';
    if (entryBtn) entryBtn.style.display = showEntry ? 'inline-block' : 'none';
}

/** 設定副標題頁面名（P1 建立新資料集 / P2 資料集管理 — 類型 / P3 標註 — 子模式） */
function setPageSubtitle(text) {
    const modal = getModal();
    const subtitle = modal?.querySelector('#dataset-manager-subtitle');
    if (subtitle) subtitle.textContent = text;
}

/**
 * 2026-10-13：釋放「前端自建」的縮圖 blob URL。
 *
 * 【為何需要它】live 拍照用 `URL.createObjectURL(blob)` 建立縮圖，該 URL 持有的 blob
 * 在 revoke 之前不會被回收。舊碼只在「刪單張圖」與「清除資料」時 revoke，
 * 關閉 DM 完全沒做 → VS Code webview 跟隨整個 session 存活，
 * 反覆開關就會不斷累積 blob（135 張圖就是一整批未釋放的解碼圖）。
 *
 * 【為何不能無腦 revoke 全部】`img.blobUrl` 有兩種來源：
 *   · live 拍照 → `URL.createObjectURL`（blob:，前端持有 → 必須 revoke）
 *   · 匯入資料夾 → VSIX `asWebviewUri`／Tauri `convertFileSrc`（平台檔案 URI → 不是我們建的）
 * 故只 revoke 帶 `_blobOwned` 旗標的那些。
 */
function releaseOwnedBlobUrls() {
    const images = Array.isArray(state.images) ? state.images : [];
    images.forEach((img) => {
        if (img && img._blobOwned && img.blobUrl) {
            try {
                URL.revokeObjectURL(img.blobUrl);
            } catch (e) {
                // revoke 失敗不阻斷關閉流程（重複 revoke 在某些 webview 會丟錯）
            }
        }
    });
}

/**
 * 2026-10-13：會話資料的完整重置（SSOT）。
 *
 * 【為何需要它】`closeDatasetManager()` 只把 modal 設成 display:none，從未重置
 * `state.images`／`state.spec`／表單欄位。重新開啟只做 `showEntryPhase()`（顯示卡片），
 * 於是一進 P2 就看到上一次的 135 張圖 —— 使用者回報「關閉 DM 重新進入，舊數據還在」。
 * 「清除資料」按鈕也做同一組重置，兩邊原本各寫一份，字段必然會漂移
 * （例如本次新增的 statsFilterLabel 就只在 enterWorkspace 補了，清除路徑漏掉）。
 *
 * 三條路徑（開啟 DM／進入 workspace／清除資料）一律經本函式，
 * 新增「會話級暫存」時只需在此補一行。
 *
 * @param {Object} [options]
 * @param {boolean} [options.keepLockedType=false] true＝保留目前鎖定的類型
 *   （「清除資料」按鈕的語意：只清空內容、不變更已鎖定類型；
 *     「開啟 DM」與「進入 workspace」都要回入口重新選類型，故傳 false）
 */
function resetSessionData(options = {}) {
    const keepLockedType = !!options.keepLockedType;
    const modal = getModal();
    const lockedType = keepLockedType
        ? (sessionManager.snapshot().lockedType || getFormValue('projectType') || 'table')
        : 'table';

    // 釋放縮圖記憶體（必須在清空 state.images 之前做，否則就遍歷不到 URL 了）。
    // 只 revoke 前端自建（_blobOwned）的 blob URL；匯入資料夾而來的是後端
    // asWebviewUri／convertFileSrc 平台 URI，不是我們建的，不能動（見 addSampleFromSampler）。
    releaseOwnedBlobUrls();

    // 停止舊會話的相機／連拍殘留（不停止會讓上一支串流在背景續跑）
    Sampler.stopCamera(true);
    Sampler.stopBurst();

    state.images = [];
    state.tableRows = [];
    state.sourceFolderPath = null;
    statsFilterLabel = null;      // 不繼承上一次的分類篩選
    nameDriftWarnKey = null;      // 無既有落盤證據，重設漂移提示去重鍵
    setNameWarning(false);

    // 解除類型鎖定（回入口＝可重新選類型）；keepLockedType 時維持鎖定
    if (!keepLockedType) sessionManager.backToEntry();
    if (modal) {
        const typeSelect = modal.querySelector('[name="projectType"]');
        if (typeSelect) {
            typeSelect.value = lockedType;
            typeSelect.disabled = keepLockedType;
            typeSelect.title = keepLockedType ? t('TYPE_LOCKED_TIP', '類型已鎖定') : '';
        }
        const nameInput = modal.querySelector('[name="projectName"]');
        if (nameInput) nameInput.value = 'dataset';
        const descInput = modal.querySelector('[name="description"]');
        if (descInput) descInput.value = '';
        const fi = modal.querySelector('#dataset-file-input');
        if (fi) fi.value = '';
        // Mode 選項需與（可能保留的）鎖定類型一致
        rebuildSourceModeOptions(lockedType);
    }

    state.spec = DatasetSpec.createDefault({ name: 'dataset', type: lockedType, mode: allowedModes(lockedType)[0] });

    // 釋放上一會話的相機預覽 blob，避免記憶體洩漏
    if (Sampler.state.lastPreviewUrl) {
        URL.revokeObjectURL(Sampler.state.lastPreviewUrl);
        Sampler.state.lastPreviewUrl = null;
    }
    Sampler.state.targetLabel = '';

    // 取消排程中的 autosave timer（舊資料不得在新會話被寫回磁碟）
    getProgressUC().cancelAutoSave();
    if (state.annotationMode && state.annotationMode.saveTimer) {
        clearTimeout(state.annotationMode.saveTimer);
        state.annotationMode.saveTimer = null;
    }
}

function enterWorkspace(type) {
    const modal = getModal();
    if (!modal || !type) return;
    // 每次進入 workspace 都是全新會話：先把上一回合的資料清乾淨（SSOT）
    resetSessionData();
    sessionManager.openSession(type);
    // 停止舊會話殘留（resetSessionData 已停，此處保留雙保險語意）
    Sampler.stopCamera(true);
    Sampler.stopBurst();
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
    modal.classList.remove('dataset-entry-phase'); // 進 P2 工作區，字級上游改回 --fs-p2
    const body = modal.querySelector('.dataset-manager-body');
    if (body) body.style.display = '';
    // 2026-10-13：離開 P1 入口頁，恢復統計列（進 P2 即由 renderStatsPanels 填入數字）
    const statsBar = modal.querySelector('#dataset-global-stats');
    if (statsBar) statsBar.style.display = '';
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

    // 2026-10-13（方案 A）：關閉即歸零並釋放記憶體，不等下次開啟。
    // 原本只在 openDatasetManager 重置 —— 那會讓「從關閉到下次開啟」之間
    // state.images 與其 blob URL 全程存活，而 VS Code webview 跟隨整個 session，
    // 反覆開關就持續累積（使用者回報「關閉 DM 重新進入舊數據還在」也是這個根因）。
    // 已落盤的資料不受影響，下次可用「選擇影像資料夾」匯入繼續。
    resetSessionData();

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
