import { DatasetSpec, DatasetSpecConstants } from './spec.js';
import { Sampler } from './sampler.js';
import { UIComponents } from './ui_components.js';
import { UICanvas } from './ui_canvas.js';
import { t } from './i18n.js';

const MODAL_ID = 'dataset-manager-modal';

const TYPE_TO_MODES_MAP = {
    'table': ['file'],
    'feature': ['file'],
    'serial': ['file'],
    'image': ['live', 'file'],
    'object_detection': ['live', 'file'],
    'line_following': ['live', 'file']
};

const state = {
    spec: DatasetSpec.createDefault({ name: 'dataset', type: 'table', mode: 'file' }),
    isOpen: false,
    images: [], // 儲存匯入的影像資訊
    tableRows: [], // 儲存匯入的表格資料 (前幾筆)
    sourceFolderPath: null, // 儲存來源資料夾路徑
    _savedGridScrollTop: 0,  // 進入標註模式前保留的縮圖捲動位置
    annotationMode: {
        isActive: false,
        currentIndex: -1,
        mode: null,             // null | 'bbox' | 'line' | 'classification'
        saveTimer: null,        // debounce timer for auto-save
        originalBodyClass: null // for restoring layout
    }
};

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

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&' + 'amp;')
        .replace(/</g, '&' + 'lt;')
        .replace(/>/g, '&' + 'gt;')
        .replace(/"/g, '&' + 'quot;')
        .replace(/'/g, '&' + '#39;');
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

function getFormValue(name) {
    const modal = getModal();
    const field = modal?.querySelector(`[name="${name}"]`);
    return field ? field.value : '';
}

function getColumnsFromUI() {
    const modal = getModal();
    if (!modal) return [];

    const rows = Array.from(modal.querySelectorAll('.dataset-column-row'));
    return rows.map((row) => ({
        name: row.querySelector('[data-field="name"]')?.value.trim() || '',
        type: row.querySelector('[data-field="type"]')?.value || 'string',
        role: row.querySelector('[data-field="role"]')?.value || 'feature'
    })).filter((column) => column.name);
}

function buildLabelMap(columns) {
    const current = state.spec.toJSON().schema.label_map || {};
    const labelColumn = columns.find((column) => column.role === 'label');
    // 如果目前有 label_map 但沒選 label 欄位，暫且保留，以免剛匯入就清空
    if (!labelColumn && Object.keys(current).length > 0) return current;
    if (!labelColumn) return {};
    // 有 label 欄位時，過濾掉無效的條目（值不為非負整數的），避免髒資料殘留
    return Object.keys(current).reduce((acc, key) => {
        const val = current[key];
        if (Number.isInteger(val) && val >= 0) {
            acc[key] = val;
        }
        return acc;
    }, {});
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
    const newSamples = includeSamples ? (
        isImage ? state.images.map(img => ({
            image_path: img.path,
            label: img.label,
            annotations: img.annotations || []
        })) : []
    ) : oldSamples;

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
        stats: state.spec.toJSON().stats
    });
}

/**
 * 正規化路徑（統一使用正斜線 /），供載入進度時比對 sample.image_path 與 images[].path。
 */
function normalizePath(value) {
    return String(value ?? '').replace(/\\/g, '/');
}

/**
 * 依專案類型重建 sourceMode 下拉選項（與 createModal 內的 updateSourceModeOptions 等效），
 * 供「依進度檔恢復 type」時同步 sourceMode 選項。
 */
function rebuildSourceModeOptions(projectType) {
    const modal = getModal();
    const sourceSelect = modal?.querySelector('[name="sourceMode"]');
    if (!sourceSelect) return;
    const allowedModes = TYPE_TO_MODES_MAP[projectType] || ['file'];
    const currentMode = sourceSelect.value;
    const nextMode = allowedModes.includes(currentMode) ? currentMode : allowedModes[0];
    sourceSelect.innerHTML = optionList(allowedModes, nextMode);
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
    const handler = (msg) => {
        if (msg.command === 'datasetLoadProgressResult') {
            window.CocoyaBridge.offMessage(handler);
            if (!msg.success) {
                console.error('[DatasetManager] Load progress failed:', msg.error);
                return;
            }
            if (msg.hasProgress && msg.spec) {
                applyLoadedProgress(msg.spec);
            }
        }
    };
    window.CocoyaBridge.onMessage(handler);
    window.CocoyaBridge.loadDatasetProgress(folderPath);
}
function renderColumnRow(column = {}) {
    const normalized = DatasetSpec.normalizeColumn(column);
    return `
        <div class="dataset-column-row">
            <input data-field="name" value="${escapeHtml(normalized.name)}" placeholder="${t('COLUMN_NAME_PLACEHOLDER', '欄位名稱')}">
            <select data-field="type">
                ${optionList(DatasetSpecConstants.COLUMN_TYPES, normalized.type)}
            </select>
            <select data-field="role">
                ${optionList(DatasetSpecConstants.COLUMN_ROLES, normalized.role)}
            </select>
            <button type="button" class="dataset-icon-btn dataset-remove-column" title="${t('REMOVE_COLUMN', '移除欄位')}">×</button>
        </div>
    `;
}

function renderValidation(result) {
    const errors = result.errors.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    const warnings = result.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    const statusClass = result.ok ? 'ok' : 'error';
    const statusText = result.ok ? t('SPEC_OK', 'Spec 可用') : t('SPEC_NEED_FIX', '需要修正');

    return `
        <div class="dataset-validation ${statusClass}">
            <strong>${statusText}</strong>
            ${errors ? `<ul>${errors}</ul>` : ''}
            ${warnings ? `<ul class="dataset-warnings">${warnings}</ul>` : ''}
        </div>
    `;
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
    const modal = getModal();
    const list = modal?.querySelector('#dataset-column-list');
    if (!list) return;
    list.insertAdjacentHTML('beforeend', renderColumnRow(column));
    refreshPreview();
}

function renderAllColumns() {
    const modal = getModal();
    const list = modal?.querySelector('#dataset-column-list');
    if (!list) return;
    
    const spec = state.spec.toJSON();
    list.innerHTML = spec.schema.columns.map(c => renderColumnRow(c)).join('');
    refreshPreview();
}

function renderPreviewTable(container, rows) {
    if (!container || !rows || !rows.length) return;

    const samples = rows.slice(0, 10); // 顯示前 10 筆
    const headers = Object.keys(samples[0]);
    
    let html = `<div style="padding: 10px;"><table class="dataset-preview-table">`;
    html += `<thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>`;
    html += `<tbody>`;
    samples.forEach(row => {
        html += `<tr>${headers.map(h => `<td>${escapeHtml(row[h])}</td>`).join('')}</tr>`;
    });
    html += `</tbody></table></div>`;
    
    container.innerHTML = html;
}

function sanitizeName(text) {
    return (text || '').replace(/[^a-zA-Z0-9_-]/g, '');
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
        const ok = await window.CocoyaBridge.confirm(
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
        const update = await window.CocoyaBridge.confirm(
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

async function handleFileImport(file) {
    if (!file) return;
    showStatusMessage(t('STATUS_LOADING', '載入中: %1...').replace('%1', file.name));

    try {
        const text = await file.text();
        let rows = [];
        if (file.name.endsWith('.csv')) {
            rows = DatasetSpec.parseCSV(text);
        } else if (file.name.endsWith('.json')) {
            rows = JSON.parse(text);
            if (!Array.isArray(rows)) {
                rows = rows.data || rows.samples || [rows];
                if (!Array.isArray(rows)) rows = [rows];
            }
        }

        if (!rows || rows.length === 0) {
            throw new Error(t('ERROR_IMPORT_EMPTY', '檔案內容為空或格式不符'));
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

async function handleDirectoryImport() {
    showStatusMessage(t('STATUS_IMPORTING_FOLDER', '正在選取資料夾...'));

    try {
        const result = await window.CocoyaBridge.pickFolder();
        if (!result) {
            showStatusMessage('');
            return;
        }

        const { path: folderPath, images, labelCounts, labelMap } = result;

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

        // 初始化每張圖的 annotations 為獨立陣列（後端回傳的 images 沒有 annotations 欄位）
        state.images = images.map(img => ({ ...img, annotations: img.annotations || [] }));
        state.tableRows = []; 
        state.sourceFolderPath = folderPath; // 儲存來源路徑以便匯出時同步
        
        // 更新 Spec 資訊
        state.spec.updateSchema({
            columns: [
                { name: 'image_path', type: 'string', role: 'feature' },
                { name: 'label', type: 'string', role: 'label' }
            ],
            features: ['image_path'],
            label: 'label',
            label_map: labelMap
        });
        
        // 更新統計
        const currentJson = state.spec.toJSON();
        state.spec = new DatasetSpec({
            project: currentJson.project,
            data_source: currentJson.data_source,
            schema: currentJson.schema,
            stats: {
                sample_count: images.length,
                label_counts: labelCounts,
                last_updated: currentJson.stats.last_updated
            }
        });

        showStatusMessage(t('SUCCESS_IMPORT_IMAGES', '✅ 成功匯入 %1 張影像，共 %2 個標籤').replace('%1', images.length).replace('%2', Object.keys(labelCounts).length));
        
        refreshDynamicPanels();
        refreshPreview();

        // 等級一存讀（載入）：檢查該資料夾是否含 dataset.json，若有則依 image_path 套回標註
        loadProgressFromFolder(folderPath);

    } catch (e) {
        console.error('[DatasetManager] Dir Import Error:', e);
        showStatusMessage(t('ERROR_PREFIX', '❌ 錯誤: %1').replace('%1', e.message));
    }
}

/**
 * 自動落盤（方案 A：全範圍自動，移除「儲存進度」按鈕）
 * 在標註/分類/新增/刪除/類別增刪改名等任何資料異動後，將 spec（含 samples[].annotations）
 * 自動寫入「專案根/dataset/<專案>/dataset.json」。時間防抖為主、切圖/退出/關閉立即 flush。
 */
let autoSaveTimer = null;

/**
 * 是否有需要持久化的資料（僅在資料存在時才寫入，避免空 spec 落盤）
 */
function hasData() {
    return (state.images && state.images.length > 0) || (state.tableRows && state.tableRows.length > 0);
}

/**
 * 執行一次落盤：同步最新資料 → toJSON → Bridge.saveDatasetProgress。
 * 低噪音：成功不打擾；僅失敗時 console 記錄（未錨定/失敗不造成錯誤訊息騷擾學生）。
 */
function writeProgressToDisk() {
    try {
        syncSpecFromUI(true);
        const spec = state.spec.toJSON();
        const projectName = getFormValue('projectName') || (spec.project && spec.project.name) || 'dataset';

        const handler = (msg) => {
            if (msg.command === 'datasetSaveProgressResult') {
                window.CocoyaBridge.offMessage(handler);
                if (!msg.success) console.error('[DatasetManager] Auto-save progress failed:', msg.error);
            }
        };
        window.CocoyaBridge.onMessage(handler);
        window.CocoyaBridge.saveDatasetProgress(projectName, spec);
    } catch (e) {
        console.error('[DatasetManager] Auto-save progress Error:', e);
    }
}

/**
 * 排程自動落盤（時間防抖，預設 800ms）。
 * 說明：標註/分類/新增等常發生在「停在同張圖」上（與切換影像無關），
 * 因此為主觸發點採用時間防抖；切圖/退出/關閉可用 immediate=true 立即 flush 作為保險。
 * 未錨定（理論上被 Startup Home 擋住）或無資料 → 靜默略過，不噴錯。
 * @param {boolean} [immediate] true = 立即寫入
 */
function scheduleAutoSave(immediate = false) {
    const anchored = !!(window.CocoyaBridge
        && window.CocoyaBridge.capabilities
        && window.CocoyaBridge.capabilities.isAnchored);
    if (!anchored || !hasData()) return;

    if (immediate) {
        if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
        writeProgressToDisk();
        return;
    }

    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        autoSaveTimer = null;
        writeProgressToDisk();
    }, 800);
}

let statusMessageTimer = null;

const STATUS_MESSAGE_DURATION = 8000; // 集中式訊息預設顯示時間（毫秒）

/**
 * 顯示集中式狀態訊息（modal 頂部中央，所有模式皆可見），預設 8 秒後自動清除。
 * 顯示前會重置計時器，避免多個訊息交錯時被舊計時器提前清除。
 * @param {string} message 欲顯示的訊息文字；空字串/undefined 立即隱藏。
 * @param {object} [options]
 * @param {number} [options.duration=8000] 顯示毫秒數（0 = 不自動清除）。
 */
function showStatusMessage(message, options = {}) {
    const el = document.getElementById('dataset-manager-message');
    if (!el) return;
    if (statusMessageTimer) {
        clearTimeout(statusMessageTimer);
        statusMessageTimer = null;
    }
    if (!message) {
        el.style.display = 'none';
        el.textContent = '';
        return;
    }
    el.textContent = message;
    el.style.display = 'flex';
    const duration = options.duration === undefined ? STATUS_MESSAGE_DURATION : options.duration;
    if (duration > 0) {
        statusMessageTimer = setTimeout(() => {
            el.style.display = 'none';
            el.textContent = '';
            statusMessageTimer = null;
        }, duration);
    }
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

async function handleExportDataset() {
    console.log('[DatasetManager] handleExportDataset triggered');
    showStatusMessage(t('STATUS_EXPORTING', '📦 正在準備匯出...'));
    showExportProgress(true);

    try {
        // 0. 檢查是否有未標註圖片（僅物件偵測/循線需要 bbox/line）
        const projectType = getFormValue('projectType');
        const isImage = projectType === 'image' || projectType === 'object_detection' || projectType === 'line_following';
        const needsAnnotationCheck = projectType === 'object_detection' || projectType === 'line_following';
        if (needsAnnotationCheck && state.images.length > 0) {
            const unannotated = state.images.filter(img => !img.annotations || img.annotations.length === 0).length;
            if (unannotated > 0) {
                if (!(await window.CocoyaBridge.confirm(t('ANNOTATION_EXPORT_UNANNOTATED_WARNING', '仍有 %1 張圖片未標註，確定要匯出嗎？').replace('%1', unannotated)))) {
                    showStatusMessage('');
                    showExportProgress(false);
                    return;
                }
            }
        }

        // 檢查是否有未分類標註框 (class_id === -1)（僅物件偵測）
        if (projectType === 'object_detection' && state.images.length > 0) {
            const unclassified = state.images.reduce((sum, img) =>
                sum + (img.annotations?.filter(a => a.class_id === -1).length || 0), 0);
            if (unclassified > 0) {
                if (!(await window.CocoyaBridge.confirm(t('ANNOTATION_EXPORT_UNCLASSIFIED_WARNING', '尚有 %1 個未分類標註框，確定要匯出嗎？').replace('%1', unclassified)))) {
                    showStatusMessage('');
                    showExportProgress(false);
                    return;
                }
            }
        }

        // 1. 同步最新資料
        syncSpecFromUI(true);
        const spec = state.spec.toJSON();
        console.log('[DatasetManager] Spec synced for export:', spec.project.name);

        // 2. 驗證 Spec
        const result = state.spec.validate();
        if (!result.ok) {
            throw new Error(t('ERROR_EXPORT_VALIDATE', '資料集規格驗證失敗: %1').replace('%1', result.errors[0]));
        }

        // 3. 透過 Bridge 發送匯出指令
        console.log('[DatasetManager] Sending datasetExport command to Bridge');
        window.CocoyaBridge.send('datasetExport', {
            spec: spec,
            sourceFolderPath: state.sourceFolderPath // 傳送來源路徑
        });

        // 監聽匯出結果
        const handler = (msg) => {
            if (msg.command === 'datasetExportResult') {
                window.CocoyaBridge.offMessage(handler);
                showExportProgress(false);
                if (msg.success) {
                    showStatusMessage(t('SUCCESS_EXPORT', '✅ 資料集匯出成功'));
                } else {
                    showStatusMessage(t('ERROR_EXPORT_FAILED', '❌ 匯出失敗: %1').replace('%1', msg.error));
                }
            }
        };
        window.CocoyaBridge.onMessage(handler);

    } catch (e) {
        console.error('[DatasetManager] Export Error:', e);
        showExportProgress(false);
        showStatusMessage(t('ERROR_PREFIX', '❌ 錯誤: %1').replace('%1', e.message));
    }
}

/**
 * 保存目前縮圖網格的捲動位置
 */
function saveGridScroll() {
    const modal = getModal();
    const imagePreview = modal?.querySelector('#dataset-image-preview');
    const grid = imagePreview?.querySelector('.dataset-image-grid');
    state._savedGridScrollTop = grid ? grid.scrollTop : 0;
}

/**
 * 恢復縮圖網格的捲動位置（在 renderImageGrid 之後呼叫）
 */
function restoreGridScroll() {
    const modal = getModal();
    const imagePreview = modal?.querySelector('#dataset-image-preview');
    if (!imagePreview) return;

    // 決定 scrollTop 值：先取 state._savedGridScrollTop（從標註模式返回），
    // 若無則嘗試現有 grid 的 scrollTop（刪除照片時保留），最後為 0
    const oldGrid = imagePreview.querySelector('.dataset-image-grid');
    const savedScrollTop = (state._savedGridScrollTop > 0) ? state._savedGridScrollTop : (oldGrid ? oldGrid.scrollTop : 0);
    // 使用過後清空，避免下次 refreshDynamicPanels 誤用
    state._savedGridScrollTop = 0;

    const newGrid = imagePreview.querySelector('.dataset-image-grid');
    if (newGrid && state.images.length > 0 && savedScrollTop > 0) {
        newGrid.scrollTop = savedScrollTop;
    }
}

/**
 * 進入影像分類標籤校正模式（image 類型專用）
 * 中央大圖預覽 + 右側分類標籤重新指派，不使用 UICanvas 拉框
 */
function enterClassificationReviewMode(image, index) {
    const modal = getModal();
    const previewContent = modal?.querySelector('#dataset-preview-content');
    const previewHeader = modal?.querySelector('.dataset-preview-panel .dataset-panel-title div');
    if (!previewContent || !previewHeader) return;

    // 進入前保存縮圖網格捲動位置
    saveGridScroll();

    // 設定標註模式狀態（沿用統一狀態機）
    state.annotationMode.isActive = true;
    state.annotationMode.currentIndex = index;
    state.annotationMode.mode = 'classification';

    // 更新副標題
    const subtitle = modal.querySelector('#dataset-manager-subtitle');
    if (subtitle) subtitle.textContent = t('CLASSIFY_MODE_TITLE', '影像分類標籤校正');

    // 讓 overlay 撐滿
    modal.classList.add('dataset-annotation-fullscreen');

    // 為 body 添加標註模式 class，切換為全寬布局
    const body = modal.querySelector('.dataset-manager-body');
    if (body) {
        state.annotationMode.originalBodyClass = body.className;
        body.classList.add('dataset-annotation-mode');
    }

    // 隱藏 source/schema 面板
    const sourcePanel = modal.querySelector('.dataset-source-panel');
    const schemaPanel = modal.querySelector('.dataset-schema-panel');
    if (sourcePanel) sourcePanel.style.display = 'none';
    if (schemaPanel) schemaPanel.style.display = 'none';

    // 防禦性移除並重建返回按鈕
    const existingBackBtn = modal.querySelector('#dataset-annotation-back');
    if (existingBackBtn) existingBackBtn.remove();
    previewHeader.insertAdjacentHTML('afterbegin', `
        <button type="button" id="dataset-annotation-back" class="dataset-small-btn" style="background: #FE2F89; color: white; border: none; margin-right: 8px;">${t('BACK_TO_LIST', '← 返回列表')}</button>
    `);
    modal.querySelector('#dataset-annotation-back').onclick = exitAnnotationMode;

    // 渲染 3 欄布局（中央不初始化畫布）
    previewContent.innerHTML = `
        <div class="dataset-annotation-layout">
            <div class="dataset-annotation-thumbnails" id="annotation-thumbnails"></div>
            <div class="dataset-annotation-main">
                <div class="dataset-annotation-toolbar">
                    <span class="dataset-annotation-progress" id="annotation-progress"></span>
                    <span class="dataset-annotation-shortcuts-hint">${t('CLASSIFY_SHORTCUTS_HINT', '↑/↓ 切換圖片 · Esc 退出')}</span>
                    <span class="dataset-annotation-export-status" id="annotation-export-status"></span>
                    <button type="button" id="annotation-export-btn" class="dataset-small-btn">${t('EXPORT', '匯出資料集')}</button>
                </div>
                <div class="dataset-annotation-image-container" id="annotation-image-container">
                    <div id="annotation-classify-container" tabindex="0" style="position: relative; display: inline-block; outline: none;">
                        <img src="${image.blobUrl}" id="annotation-classify-img" style="max-width: 100%; max-height: 100%; display: block; object-fit: contain;">
                    </div>
                </div>
            </div>
            <div class="dataset-annotation-controls" id="annotation-controls"></div>
        </div>
    `;

    // 渲染縮圖欄（分類模式顯示標籤徽章）
    const thumbnails = document.getElementById('annotation-thumbnails');
    UIComponents.renderAnnotationThumbnails(thumbnails, state.images, index, {
        mode: 'classification',
        onThumbnailClick: (newIndex) => navigateToImage(newIndex)
    });

    // 載入目前圖片
    loadClassificationImage(index);

    // 標註模式：隱藏預覽 header 的驗證/匯出，改用標註工具列的匯出（含即時狀態回饋）
    setAnnotationHeaderActions(true);
    const exportBtn = document.getElementById('annotation-export-btn');
    if (exportBtn) exportBtn.onclick = handleExportDataset;
}

/**
 * 載入指定索引的圖片並更新分類校正 UI（image 類型專用）
 */
function loadClassificationImage(index) {
    const image = state.images[index];
    if (!image) return;

    state.annotationMode.currentIndex = index;

    const img = document.getElementById('annotation-classify-img');
    if (img) img.src = image.blobUrl;

    renderClassificationControls();
    updateClassifyProgress();
    updateThumbnailHighlight();
    bindClassificationKeyboardEvents();
}

function enterAnnotationMode(image, index) {
    // 分流：image（影像分類）類型進入「分類標籤校正」模式，而非 bbox 拉框標註
    if (getFormValue('projectType') === 'image') {
        return enterClassificationReviewMode(image, index);
    }

    const modal = getModal();
    const previewContent = modal?.querySelector('#dataset-preview-content');
    const previewHeader = modal?.querySelector('.dataset-preview-panel .dataset-panel-title div');
    if (!previewContent || !previewHeader) return;

    // 進入標註前，先保存目前縮圖網格的捲動位置
    saveGridScroll();

    // 設定標註模式狀態
    state.annotationMode.isActive = true;
    state.annotationMode.currentIndex = index;

    // 更新副標題為「物件偵測標註」
    const subtitle = modal.querySelector('#dataset-manager-subtitle');
    if (subtitle) subtitle.textContent = t('ANNOTATION_MODE_TITLE', '物件偵測標註');

    // 讓 overlay 撐滿，使高度鏈可解析（縮圖欄才能捲動）
    modal.classList.add('dataset-annotation-fullscreen');

    // 為 body 添加標註模式 class，切換為全寬單欄布局
    const body = modal.querySelector('.dataset-manager-body');
    if (body) {
        state.annotationMode.originalBodyClass = body.className;
        body.classList.add('dataset-annotation-mode');
    }

    // 隱藏 source/schema 面板
    const sourcePanel = modal.querySelector('.dataset-source-panel');
    const schemaPanel = modal.querySelector('.dataset-schema-panel');
    if (sourcePanel) sourcePanel.style.display = 'none';
    if (schemaPanel) schemaPanel.style.display = 'none';

    // 移除舊的返回按鈕（若存在）
    const existingBackBtn = modal.querySelector('#dataset-annotation-back');
    if (existingBackBtn) {
        existingBackBtn.remove();
    }

    // 在預覽面板標題加入返回按鈕
    previewHeader.insertAdjacentHTML('afterbegin', `
        <button type="button" id="dataset-annotation-back" class="dataset-small-btn" style="background: #FE2F89; color: white; border: none; margin-right: 8px;">${t('BACK_TO_LIST', '← 返回列表')}</button>
    `);
    modal.querySelector('#dataset-annotation-back').onclick = exitAnnotationMode;

    // 渲染 3 欄布局
    previewContent.innerHTML = `
        <div class="dataset-annotation-layout">
            <div class="dataset-annotation-thumbnails" id="annotation-thumbnails"></div>
            <div class="dataset-annotation-main">
                <div class="dataset-annotation-toolbar">
                    <span class="dataset-annotation-progress" id="annotation-progress"></span>
                    <span class="dataset-annotation-shortcuts-hint">${t('ANNOTATION_SHORTCUTS_HINT', '↑/↓ 切換圖片 · Delete 刪除標註 · Esc 退出')}</span>
                    <span class="dataset-annotation-export-status" id="annotation-export-status"></span>
                    <button type="button" id="annotation-export-btn" class="dataset-small-btn">${t('EXPORT', '匯出資料集')}</button>
                </div>
                <div class="dataset-annotation-image-container" id="annotation-image-container">
                    <div id="annotation-container" style="position: relative; display: inline-block;">
                        <img src="${image.blobUrl}" id="annotation-target-img" style="max-width: 100%; max-height: 100%; display: block; object-fit: contain;">
                    </div>
                </div>
            </div>
            <div class="dataset-annotation-controls" id="annotation-controls"></div>
        </div>
    `;

    // 渲染縮圖欄
    const thumbnails = document.getElementById('annotation-thumbnails');
    UIComponents.renderAnnotationThumbnails(thumbnails, state.images, index, {
        onThumbnailClick: (newIndex) => navigateToImage(newIndex)
    });

    // 渲染右側控制欄
    renderAnnotationControls();

    // 載入目前圖片
    loadAnnotationImage(index);

    // 標註模式：隱藏預覽 header 的驗證/匯出，改用標註工具列的匯出（含即時狀態回饋）
    setAnnotationHeaderActions(true);
    const exportBtn = document.getElementById('annotation-export-btn');
    if (exportBtn) exportBtn.onclick = handleExportDataset;
}

/**
 * 將目前畫布上的標註寫回 state.images 並清除 debounce timer
 */
function saveCurrentAnnotations() {
    const idx = state.annotationMode.currentIndex;
    if (idx < 0 || idx >= state.images.length) return;
    // 拷貝陣列，避免多張圖片共用同一個陣列參考
    state.images[idx].annotations = (UICanvas.state.annotations || []).slice();

    // 清除 debounce timer
    if (state.annotationMode.saveTimer) {
        clearTimeout(state.annotationMode.saveTimer);
        state.annotationMode.saveTimer = null;
    }

    // 以目前標註重算 label_counts（返回列表/切圖時，中間統計才正確）
    updateStatsFromImages();
}

/**
 * 載入指定索引的圖片並初始化畫布
 */
function loadAnnotationImage(index) {
    const image = state.images[index];
    if (!image) return;

    state.annotationMode.currentIndex = index;

    const projectType = getFormValue('projectType');
    const container = document.getElementById('annotation-container');
    const img = document.getElementById('annotation-target-img');
    if (!container || !img) return;

    // 更新圖片來源
    img.src = image.blobUrl;

    // 同步初始化畫布（不依賴 onload，避免 src 相同時 onload 不觸發導致 UI 空白）
    const mode = projectType === 'line_following' ? 'line' : 'bbox';
    const labelMap = state.spec.toJSON().schema.label_map || {};
    UICanvas.init(container, img, image.annotations || [], {
        mode: mode,
        labelMap: labelMap,
        onUpdate: (anns) => {
            image.annotations = anns;
            renderAnnotationListUI(anns);
            // Debounce refreshPreview（並以目前標註重算統計）
            clearTimeout(state.annotationMode.saveTimer);
            state.annotationMode.saveTimer = setTimeout(() => {
                updateStatsFromImages();
                refreshPreview();
            }, 300);
        }
    });

    // 物件偵測模式：與「類別管理」下拉同步（#annotation-class-manager 內的 .dataset-label-manager-select）
    const classSelect = document.querySelector('#annotation-class-manager .dataset-label-manager-select');
    if (classSelect) {
        classSelect.onchange = () => {
            UICanvas.state.currentClassId = parseInt(classSelect.value, 10) || 0;
        };
        // 初始化 currentClassId
        UICanvas.state.currentClassId = parseInt(classSelect.value, 10) || 0;
    }

    renderAnnotationListUI(image.annotations || []);
    updateAnnotationProgress();
    updateThumbnailHighlight();
    bindCanvasKeyboardEvents();
    // 聚焦畫布以接收鍵盤事件
    const canvas = container.querySelector('canvas.dataset-annotation-canvas');
    if (canvas) canvas.focus();
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
 * 更新頂部進度計數器
 */
function updateAnnotationProgress() {
    const progressEl = document.getElementById('annotation-progress');
    if (!progressEl) return;

    const annotatedCount = state.images.filter(img => img.annotations && img.annotations.length > 0).length;
    const total = state.images.length;
    progressEl.textContent = t('ANNOTATION_PROGRESS', '進度: %1/%2 張').replace('%1', annotatedCount).replace('%2', total);
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
 * 綁定畫布鍵盤事件（↑/↓ 切換、Delete 刪除、Esc 退出）
 */
function bindCanvasKeyboardEvents() {
    const container = document.getElementById('annotation-container');
    if (!container) return;

    const canvas = container.querySelector('canvas.dataset-annotation-canvas');
    if (!canvas) return;

    // 設定 tabindex 以便接收鍵盤事件
    canvas.tabIndex = 0;

    // 移除舊的鍵盤 handler
    if (UICanvas.state.handlers.keydown) {
        canvas.removeEventListener('keydown', UICanvas.state.handlers.keydown);
    }

    UICanvas.state.handlers.keydown = (e) => {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            navigateToImage(state.annotationMode.currentIndex - 1);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            navigateToImage(state.annotationMode.currentIndex + 1);
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            deleteSelectedAnnotation();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation(); // 阻止冒泡到 modal 的全域 Esc 關閉
            exitAnnotationMode();
        }
    };

    canvas.addEventListener('keydown', UICanvas.state.handlers.keydown);
}

/**
 * 刪除目前高亮的標註（若無高亮則刪除最後一個）
 */
function deleteSelectedAnnotation() {
    const anns = UICanvas.state.annotations || [];
    if (anns.length === 0) return;

    let index = UICanvas.state.selectedAnnotationIndex;
    if (index < 0 || index >= anns.length) {
        index = anns.length - 1;
    }

    anns.splice(index, 1);
    UICanvas.state.selectedAnnotationIndex = -1;
    if (UICanvas.state.onUpdate) UICanvas.state.onUpdate(anns);
    UICanvas.render();
    renderAnnotationListUI(anns);
}

/**
 * 渲染分類標籤校正模式的右側控制欄（目前分類下拉選單 + 新增類別）
 * image 類型專用，不涉及 bbox 標註
 */
function renderClassificationControls() {
    const controls = document.getElementById('annotation-controls');
    if (!controls) return;

    const image = state.images[state.annotationMode.currentIndex];
    if (!image) return;
    const labelMap = state.spec.toJSON().schema.label_map || {};
    const labelEntries = Object.entries(labelMap).sort((a, b) => a[0].localeCompare(b[0]));

    controls.innerHTML = `
        <div class="dataset-annotation-class-section">
            <div class="dataset-annotation-section-title">${t('CLASSIFY_CURRENT_LABEL', '目前分類')}</div>
            <div class="dataset-annotation-class-row">
                <select id="annotation-classify-select">
                    ${labelEntries.length > 0
                        ? labelEntries.map(([name, id]) =>
                            `<option value="${id}" ${name === (image.label || '') ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')
                        : '<option value="" disabled selected>' + t('NO_LABELS', '尚未偵測到標籤') + '</option>'}
                </select>
            </div>
            <div class="dataset-annotation-info">${t('CLASSIFY_IMAGE_INFO', '檔案: %1').replace('%1', escapeHtml(image.path || image.name || ''))}</div>
            <div class="dataset-annotation-section-title">${t('ANNOTATION_CLASS', '類別管理')}</div>
            <div id="annotation-classify-manager"></div>
        </div>
    `;

    const select = document.getElementById('annotation-classify-select');
    if (select) {
        select.onchange = () => {
            const id = parseInt(select.value, 10);
            const name = labelEntries.find(([, value]) => value === id)?.[0] || '';
            if (name && name !== image.label) {
                image.label = name;
                // label_counts / label_map 一致化（依 state.images 重算統計）
                updateStatsFromImages();
                renderClassificationControls();
                updateThumbnailHighlight();
                refreshPreview(); // debounce 內含 syncSpecFromUI(true)，把 label 寫回 samples
            }
        };
    }

    // 標籤管理（新增/改名/刪除，與物件偵測/檢視模式共用）
    createLabelMapManager(document.getElementById('annotation-classify-manager'));
}

/**
 * 更新分類校正模式頂部進度（image 類型顯示樣本位置）
 */
function updateClassifyProgress() {
    const progressEl = document.getElementById('annotation-progress');
    if (!progressEl) return;
    progressEl.textContent = t('CLASSIFY_PROGRESS', '樣本: %1 / %2 張')
        .replace('%1', state.annotationMode.currentIndex + 1)
        .replace('%2', state.images.length);
}

let classificationKeyHandler = null; // 分類模式的鍵盤事件 handler（用於清理）

/**
 * 綁定分類校正模式鍵盤事件（↑/↓ 切換圖片、Esc 退出，無 Delete）
 */
function bindClassificationKeyboardEvents() {
    const container = document.getElementById('annotation-classify-container');
    if (!container) return;

    unbindClassificationKeyboardEvents();
    container.tabIndex = 0;
    classificationKeyHandler = (e) => {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            navigateToImage(state.annotationMode.currentIndex - 1);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            navigateToImage(state.annotationMode.currentIndex + 1);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation(); // 阻止冒泡到 modal 的全域 Esc 關閉
            exitAnnotationMode();
        }
    };
    container.addEventListener('keydown', classificationKeyHandler);
    container.focus();
}

/**
 * 清理分類校正模式的鍵盤事件
 */
function unbindClassificationKeyboardEvents() {
    const container = document.getElementById('annotation-classify-container');
    if (container && classificationKeyHandler) {
        container.removeEventListener('keydown', classificationKeyHandler);
    }
    classificationKeyHandler = null;
}

/**
 * 渲染右側控制欄（類別選擇器 + 標註列表）
 */
/**
 * 統一「label_map 標籤管理器」（類別下拉 + ➕✏️🗑）。
 * 供分類(image)標註、物件偵測標註、與檢視模式中間欄共用，行為一致。
 * 變更流程：updateSchema(label_map) → syncLabelMap() → updateStatsFromImages() → 重繪 → 自動落盤。
 * 依專案類型處理：image（分類）改名/刪除會同步 img.label、刪除改 unlabeled；object_detection 刪除移除對應 class_id 標註框。
 * 新增類別後自動選取新類別。
 * @param {HTMLElement} container 欲放置元件的容器（建議有 id）。
 * @param {HTMLElement|null} [statsContainer] 統計列表容器；非 null 時變更後於此重繪標籤統計（檢視模式使用）。
 */
function createLabelMapManager(container, statsContainer = null) {
    if (!container) return;
    const spec = state.spec.toJSON();
    const projectType = spec.project.type || getFormValue('projectType') || 'table';
    const labelMap = spec.schema.label_map || {};
    const entries = Object.entries(labelMap).sort((a, b) => a[0].localeCompare(b[0]));

    container.innerHTML = `
        <div class="dataset-annotation-class-row">
            <select class="dataset-label-manager-select">
                ${entries.length > 0
                    ? entries.map(([name, id]) => `<option value="${id}">${escapeHtml(name)}</option>`).join('')
                    : '<option value="-1" disabled selected>' + t('ANNOTATION_EMPTY', '尚未有標註') + '</option>'}
            </select>
            <button type="button" class="dataset-icon-btn" data-action="add" title="${t('ANNOTATION_CLASS_ADD', '新增')}">+</button>
            <button type="button" class="dataset-icon-btn" data-action="edit" title="${t('ANNOTATION_CLASS_EDIT', '編輯')}">✏️</button>
            <button type="button" class="dataset-icon-btn" data-action="delete" title="${t('ANNOTATION_CLASS_DELETE', '刪除')}">🗑️</button>
        </div>
    `;

    const select = container.querySelector('.dataset-label-manager-select');
    if (!select) return;

    const currentId = () => {
        const v = parseInt(select.value, 10);
        return Number.isInteger(v) ? v : -1;
    };
    // 物件偵測：選取類別即作為畫布當前類別
    if (projectType === 'object_detection') {
        select.onchange = () => { UICanvas.state.currentClassId = currentId(); };
    }

    const reRender = () => {
        if (state.annotationMode && state.annotationMode.isActive) {
            if (projectType === 'image') renderClassificationControls();
            else renderAnnotationControls();
            updateThumbnailHighlight();
        } else {
            createLabelMapManager(container, statsContainer);
            if (statsContainer) UIComponents.renderLabelStats(statsContainer, state.spec.toJSON().stats);
        }
        scheduleAutoSave();
        refreshPreview();
    };
    const freshContainer = () => (container.id ? (document.getElementById(container.id) || container) : container);

// 新增
    container.querySelector('[data-action="add"]').onclick = async () => {
        const name = await window.CocoyaBridge.prompt(t('ANNOTATION_NEW_CLASS_PLACEHOLDER', '輸入新類別名稱'));
        if (!(name && name.trim())) return;
        const trimmed = name.trim();
        const map = state.spec.toJSON().schema.label_map || {};
        if (map[trimmed] !== undefined) return;
        map[trimmed] = nextLabelId(map);
        state.spec.updateSchema({ label_map: map });
        syncLabelMap();
        updateStatsFromImages();
        reRender();
        const sel = freshContainer().querySelector('.dataset-label-manager-select');
        if (sel) {
            sel.value = map[trimmed];
            if (projectType === 'object_detection') UICanvas.state.currentClassId = map[trimmed];
        }
    };

    // 編輯（改名）
    container.querySelector('[data-action="edit"]').onclick = async () => {
        const id = currentId();
        const entry = entries.find(([, v]) => v === id);
        if (!entry) return;
        const newName = await window.CocoyaBridge.prompt(t('ANNOTATION_NEW_CLASS_PLACEHOLDER', '輸入新類別名稱'), entry[0]);
        if (newName && newName.trim() && newName.trim() !== entry[0]) {
            const trimmed = newName.trim();
            const map = state.spec.toJSON().schema.label_map || {};
            delete map[entry[0]];
            map[trimmed] = id;
            if (projectType === 'image') {
                // 分類：一併更新所有使用該 label 的影像
                state.images.forEach(img => { if (img.label === entry[0]) img.label = trimmed; });
            }
            state.spec.updateSchema({ label_map: map });
            syncLabelMap();
            updateStatsFromImages();
            reRender();
        }
    };

    // 刪除
    container.querySelector('[data-action="delete"]').onclick = async () => {
        const id = currentId();
        const entry = entries.find(([, v]) => v === id);
        if (!entry) return;
        const count = (projectType === 'image')
            ? state.images.filter(img => img.label === entry[0]).length
            : state.images.reduce((s, img) => s + (img.annotations?.filter(a => a.class_id === id).length || 0), 0);
        const confirmed = await window.CocoyaBridge.confirm(
            t('ANNOTATION_DELETE_CLASS_CONFIRM', '確定刪除類別「%1」及其 %2 個標註框嗎？')
                .replace('%1', entry[0]).replace('%2', count)
        );
        if (confirmed) {
            const map = state.spec.toJSON().schema.label_map || {};
            delete map[entry[0]];
            if (projectType === 'image') {
                // 分類：把使用該 label 的影像改為 unlabeled，避免載入時又被回填進 label_map
                state.images.forEach(img => { if (img.label === entry[0]) img.label = 'unlabeled'; });
            } else {
                state.images.forEach(img => { if (img.annotations) img.annotations = img.annotations.filter(a => a.class_id !== id); });
                if (UICanvas.state.annotations) {
                    UICanvas.state.annotations = UICanvas.state.annotations.filter(a => a.class_id !== id);
                    UICanvas.state.selectedAnnotationIndex = -1;
                    UICanvas.render();
                }
            }
            state.spec.updateSchema({ label_map: map });
            syncLabelMap();
            updateStatsFromImages();
            reRender();
        }
    };
}

function renderAnnotationControls() {
    const controls = document.getElementById('annotation-controls');
    if (!controls) return;

    const projectType = getFormValue('projectType');
    const labelMap = state.spec.toJSON().schema.label_map || {};
    const labelEntries = Object.entries(labelMap);

    // 類別選擇器（僅物件偵測模式顯示；標籤管理由共用 createLabelMapManager 處理）
    let classSelectorHtml = '';
    if (projectType === 'object_detection') {
        classSelectorHtml = `
            <div class="dataset-annotation-class-section">
                <div class="dataset-annotation-section-title">${t('ANNOTATION_CLASS', '類別')}</div>
                <div id="annotation-class-manager"></div>
            </div>
        `;
    }

    controls.innerHTML = `
        ${classSelectorHtml}
        <div class="dataset-annotation-list-section">
            <div class="dataset-annotation-section-title">${t('ANNOTATION_LIST', '標註列表')}</div>
            <div id="annotation-list-ui" class="dataset-annotation-list"></div>
        </div>
    `;

    // 類別管理（標註模式，共用 createLabelMapManager，與檢視/分類一致）
    if (projectType === 'object_detection') {
        createLabelMapManager(document.getElementById('annotation-class-manager'));
    }

    // 重新渲染標註列表（controls.innerHTML 重置會清空 #annotation-list-ui，需恢復）
    const currentIdx = state.annotationMode.currentIndex;
    if (currentIdx >= 0 && state.images[currentIdx]) {
        renderAnnotationListUI(state.images[currentIdx].annotations || []);
    }
}

function renderAnnotationListUI(anns) {
    const list = document.getElementById('annotation-list-ui');
    if (!list) return;
    const labelMap = state.spec.toJSON().schema.label_map || {};
    const labelEntries = Object.entries(labelMap);

    list.innerHTML = anns.map((ann, i) => {
        if (ann.line) {
            const coords = ann.line.map(v => v.toFixed(2)).join(',');
            return `
                <div class="dataset-annotation-item" data-index="${i}">
                    <span>#${i+1} ${t('ANNOTATION_LINE', '線段')}: [${coords}]</span>
                    <button onclick="window.CocoyaDataset.removeAnnotation(${i})">×</button>
                </div>
            `;
        } else if (ann.bbox) {
            const options = labelEntries.length > 0
                ? labelEntries.map(([name, id]) =>
                    `<option value="${id}" ${id === ann.class_id ? 'selected' : ''}>${escapeHtml(name)}</option>`
                ).join('')
                : '<option value="-1">Unclassified</option>';
            return `
                <div class="dataset-annotation-item" data-index="${i}">
                    <span>#${i+1}</span>
                    <select class="dataset-annotation-item-class" data-index="${i}">
                        ${options}
                    </select>
                    <span>[${ann.bbox.map(v => v.toFixed(2)).join(',')}]</span>
                    <button onclick="window.CocoyaDataset.removeAnnotation(${i})">×</button>
                </div>
            `;
        }
        return '';
    }).join('') || '<p style="color: #999;">' + t('ANNOTATION_EMPTY', '尚未有標註') + '</p>';

    // 綁定點擊高亮事件
    list.querySelectorAll('.dataset-annotation-item').forEach(item => {
        item.onclick = (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;
            const index = parseInt(item.dataset.index);
            UICanvas.setSelectedAnnotation(index);
            // 高亮列表項目
            list.querySelectorAll('.dataset-annotation-item').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
        };
    });

    // 綁定類別下拉選單變更事件（即時更正標錯類別）
    list.querySelectorAll('.dataset-annotation-item-class').forEach(select => {
        select.onchange = () => {
            const idx = parseInt(select.dataset.index);
            anns[idx].class_id = parseInt(select.value, 10);
            if (UICanvas.state.onUpdate) UICanvas.state.onUpdate(anns);
            UICanvas.render();
        };
    });
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
        return await window.CocoyaBridge.confirm(t('ANNOTATION_UNANNOTATED_WARNING', '尚有 %1 張圖片未標註，確定要離開？').replace('%1', unannotated));
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
    if (subtitle) subtitle.textContent = t('SUBTITLE', 'Dataset Spec');

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

    const isCloudAi = document.getElementById('cloud-ai-toggle')?.checked || false;

    // 控制遠端環境診斷面板與上傳按鈕
    const diagArea = modal.querySelector('#dataset-cloud-diagnostic-area');
    const cloudUploadBtn = modal.querySelector('#dataset-cloud-upload-btn');
    if (diagArea) {
        diagArea.style.display = (isCloudAi && isImage) ? 'block' : 'none';
    }
    if (cloudUploadBtn) {
        cloudUploadBtn.style.display = (isCloudAi && isImage && sourceMode === 'file') ? 'block' : 'none';
    }

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

    // 顯示採集視圖
    if (isLive) {
        const samplerView = modal.querySelector('#dataset-sampler-view');
        samplerView.style.display = 'block';
        
        const labels = Object.keys(state.spec.toJSON().schema.label_map || {});
        // 移除自動推入 label_1，改為讓使用者手動新增標籤
        
        // [關鍵修正] 如果目前沒有選定標籤且有現成標籤，預設選取第一個
        if (!Sampler.state.targetLabel && labels.length > 0) {
            Sampler.setTargetLabel(labels[0]);
        }

        // [關鍵修正] 綁定採集回調，讓連拍也能觸發 UI 更新
        Sampler.state.onSampleCaptured = (blob, label, savePath) => {
            addSampleFromSampler(blob, savePath);
        };

        // 自動列舉可用攝影機 (但僅在清單為空時)
        if (Sampler.state.cameraList.length === 0) {
            Sampler.listCameras();
        }

        UIComponents.renderSamplerView(samplerView, {
            labels,
            onLabelChange: (l) => {
                Sampler.setTargetLabel(l);
                
                // [關鍵修正] 如果是新標籤且尚未存在於 spec 中，手動加入 label_map
                const spec = state.spec.toJSON();
                const labelMap = spec.schema.label_map || {};
                if (labelMap[l] === undefined) {
                    labelMap[l] = nextLabelId(labelMap);
                    state.spec.updateSchema({ label_map: labelMap });
                }

                // 重新以 label_map 為權威計算統計，確保新標籤/改名即時反映
                updateStatsFromImages();
                const structureContent = modal.querySelector('#dataset-structure-content');
                if (structureContent) {
                    UIComponents.renderLabelStats(structureContent, state.spec.toJSON().stats);
                }

                // 更新採集面板的 dropdown 選項清單（新增標籤後讓新標籤出現在下拉選單）
                const updatedLabels = Object.keys(state.spec.toJSON().schema.label_map || {});
                const labelSelect = samplerView.querySelector('#dataset-sampler-label-select');
                if (labelSelect) {
                    labelSelect.innerHTML = updatedLabels.map(lb => 
                        `<option value="${lb}" ${lb === l ? 'selected' : ''}>${lb}</option>`
                    ).join('');
                }

                // 新增標籤後即時刷新 Spec JSON 預覽
                refreshPreview();
            },
            onSnapshot: () => handleSamplerSnapshot(),
            onBurstToggle: () => handleSamplerBurstToggle(),
            onStartCamera: () => Sampler.startCamera(Sampler.state.selectedDeviceId), 
            onStopCamera: () => Sampler.stopCamera()
        });

    } else {
        Sampler.stopCamera();
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
    showStatusMessage(t('STATUS_CAPTURETTING', '📸 正在採集...'));
    
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
function handleDeleteImage(index) {
    const removed = state.images[index];
    if (!removed) return;

    // 計算實際檔案路徑並通知後端刪除實體檔案
    if (state.sourceFolderPath && removed.path) {
        const fullPath = state.sourceFolderPath.replace(/\\/g, '/') + '/' + removed.path;
        window.CocoyaBridge.send('datasetDeleteImage', { filePath: fullPath });
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
    const values = Object.values(labelMap || {})
        .map((v) => Number(v))
        .filter((v) => Number.isInteger(v) && v >= 0);
    return values.length ? Math.max(...values) + 1 : 0;
}

function updateStatsFromImages() {
    const currentSpec = state.spec.toJSON();
    const projectType = currentSpec.project.type || getFormValue('projectType') || 'table';
    const existingLabelMap = currentSpec.schema.label_map || {};
    const isClassification = projectType === 'image';

    // 以 label_map 為權威；分類時一併納入影像出現的 img.label
    const labelMap = Object.assign({}, existingLabelMap);
    const labelCounts = {};

    if (isClassification) {
        // 分類（image）：每張圖一個 img.label
        state.images.forEach((img) => {
            const key = String(img.label || 'unlabeled').trim() || 'unlabeled';
            labelCounts[key] = (labelCounts[key] || 0) + 1;
            if (labelMap[key] === undefined) {
                labelMap[key] = nextLabelId(labelMap);
            }
        });
    } else {
        // 物件偵測 / 線跟隨（bbox / line）：以 label_map 的 id→名稱，逐筆 annotation 的 class_id 計數
        const idToName = {};
        Object.keys(labelMap).forEach((name) => { idToName[labelMap[name]] = name; });
        state.images.forEach((img) => {
            (img.annotations || []).forEach((ann) => {
                const name = idToName[ann.class_id];
                if (name !== undefined) labelCounts[name] = (labelCounts[name] || 0) + 1;
            });
        });
    }

    // 補上 label_map 中所有類別（尚無樣本的以 0 呈現），確保「改名/新增後即時反映」與「非資料夾名的類別也納入統計」
    Object.keys(labelMap).forEach((label) => {
        if (labelCounts[label] === undefined) labelCounts[label] = 0;
    });

    state.spec = new DatasetSpec({
        project: currentSpec.project,
        data_source: currentSpec.data_source,
        schema: {
            columns: currentSpec.schema.columns,
            features: currentSpec.schema.features,
            label: currentSpec.schema.label,
            label_map: labelMap
        },
        stats: {
            sample_count: state.images.length,
            label_counts: labelCounts
        }
    });
}

function bindModalEvents(modal) {
    modal.querySelector('#dataset-manager-close').onclick = closeDatasetManager;
    modal.querySelector('#dataset-manager-validate').onclick = refreshPreview;

    const clearBtn = modal.querySelector('#dataset-manager-clear');
    if (clearBtn) {
        clearBtn.onclick = async () => {
            // 防呆：有未匯出工作時先確認，避免誤按清空整批資料
            if (hasUnsavedWork()) {
                const ok = await window.CocoyaBridge.confirm(t('CLEAR_CONFIRM', '確定清除所有資料並重置嗎？'));
                if (!ok) return;
            }

            // 0. 確保退出標註模式，清空畫布與事件綁定，並移除返回按鈕
            //    （清除資料是銷毀一切的確認操作，跳過未標註二次警告，避免無關阻斷）
            exitAnnotationMode(true);

            // 1. 停止攝影機與連拍動作
            Sampler.stopCamera();
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
            if (typeSelect) typeSelect.value = 'table'; 

            // 4. 動態關聯 Mode 選項 (table 只支援 file)
            updateSourceModeOptions('table');

            // 5. 重設 Spec 為預設
            state.spec = DatasetSpec.createDefault({ 
                name: 'dataset', 
                type: 'table',
                mode: 'file'
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
    if (importBtn && fileInput) {
        importBtn.onclick = () => fileInput.click();
        fileInput.onchange = (e) => handleFileImport(e.target.files[0]);
    }

    const dirImportBtn = modal.querySelector('#dataset-dir-import-btn');
    if (dirImportBtn) {
        dirImportBtn.onclick = () => handleDirectoryImport();
    }

    const cloudUploadBtn = modal.querySelector('#dataset-cloud-upload-btn');
    const cloudZipInput = modal.querySelector('#dataset-cloud-zip-input');
    if (cloudUploadBtn && cloudZipInput) {
        cloudUploadBtn.onclick = () => cloudZipInput.click();
        cloudZipInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            window.CocoyaUI.ensureSshConfig(async (sshConfig) => {
                showStatusMessage(t('STATUS_UPLOADING_ZIP', '📦 正在準備上傳本地 ZIP 檔案...'));

                try {
                    const chunkSize = 65536; // 64KB 分塊
                    const totalChunks = Math.ceil(file.size / chunkSize);
                    const projectName = getFormValue('projectName') || 'dataset';
                    const fileId = Math.random().toString(36).substring(7);

                    for (let i = 0; i < totalChunks; i++) {
                        const start = i * chunkSize;
                        const end = Math.min(start + chunkSize, file.size);
                        const blob = file.slice(start, end);
                        
                        const chunkBase64 = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => {
                                const bytes = new Uint8Array(reader.result);
                                let binary = '';
                                for (let j = 0; j < bytes.length; j++) {
                                    binary += String.fromCharCode(bytes[j]);
                                }
                                resolve(btoa(binary));
                            };
                            reader.onerror = reject;
                            reader.readAsArrayBuffer(blob);
                        });

                        const progress = Math.round(((i + 1) / totalChunks) * 100);
                        showStatusMessage(t('STATUS_UPLOADING', '☁️ 正在上傳資料集... (%1%)').replace('%1', progress));

                        // 發送分塊訊息，合併 SSH 帳密資訊
                        window.CocoyaBridge.send('datasetUploadArchive', Object.assign({
                            fileId: fileId,
                            chunkIndex: i,
                            totalChunks: totalChunks,
                            zipDataChunk: chunkBase64,
                            projectName: projectName,
                            isLast: (i === totalChunks - 1)
                        }, sshConfig));

                        // 稍微延遲避免阻塞 Webview UI
                        if (i % 5 === 0) await new Promise(resolve => setTimeout(resolve, 50));
                    }

                    showStatusMessage(t('STATUS_DECOMPRESSING', '⌛ 正在雲端進行解壓縮，請稍候...'));
                } catch (err) {
                    showStatusMessage(t('ERROR_READ_FAILED', '❌ 讀取失敗: %1').replace('%1', err.message));
                }
            });
        };
    }

    const cloudDiagnoseBtn = modal.querySelector('#dataset-cloud-diagnose-btn');
    if (cloudDiagnoseBtn) {
        cloudDiagnoseBtn.onclick = () => {
            window.CocoyaUI.ensureSshConfig((sshConfig) => {
                const diagResult = modal.querySelector('#dataset-cloud-diagnostic-result');
                if (diagResult) diagResult.innerHTML = t('CLOUD_DIAGNOSING', '正在進行遠端環境診斷...');
                window.CocoyaBridge.send('checkRemoteEnvironment', sshConfig);
            });
        };
    }



    // 監聽 Extension 回傳的結果
    const handleBridgeMessage = (msg) => {
        const diagResult = modal.querySelector('#dataset-cloud-diagnostic-result');

        if (msg.command === 'checkRemoteEnvironmentResult') {
            if (diagResult) {
                if (msg.success) {
                    const statusData = msg.status;
                    let html = `<div style="margin-top: 4px;">`;
                    html += `<strong>GPU</strong>: ${statusData.cudaAvailable ? `<span style="color:#4CAF50;">${t('CLOUD_AVAILABLE', '可用')}</span> (${statusData.gpuName})` : `<span style="color:#F44336;">${t('CLOUD_NONE', '無')}</span>`}<br>`;
                    html += `<strong>Docker</strong>: ${statusData.dockerRunning ? `<span style="color:#4CAF50;">${t('CLOUD_NORMAL', '正常')}</span>` : `<span style="color:#F44336;">${t('CLOUD_NOT_RUNNING', '未啟動')}</span>`}<br>`;
                    html += `<strong>GPU Passthrough</strong>: ${statusData.gpuPassthrough ? `<span style="color:#4CAF50;">${t('CLOUD_SUPPORTED', '支援 (--gpus)')}</span>` : `<span style="color:#F44336;">${t('CLOUD_NOT_SUPPORTED', '不支援')}</span>`}`;
                    
                    if (statusData.errors && statusData.errors.length > 0) {
                        html += `<div style="color: #FF9800; margin-top: 4px; font-size: 10px;">${t('CLOUD_DIAGNOSE_WARN', '⚠️ 診斷警告:')}<br>- ${statusData.errors.join('<br>- ')}</div>`;
                    }
                    html += `</div>`;
                    diagResult.innerHTML = html;
                } else {
                    diagResult.innerHTML = `<span style="color: #F44336;">${t('CLOUD_DIAGNOSE_FAILED', '❌ 診斷失敗')}: ${msg.error}</span>`;
                }
            }
        } else if (msg.command === 'datasetUploadResult') {
            if (msg.success) {
                showStatusMessage(t('SUCCESS_UPLOAD', '✅ 資料集已成功上傳並在遠端解壓縮！'));
                if (cloudZipInput) cloudZipInput.value = '';
            } else {
                showStatusMessage(t('ERROR_UPLOAD_FAILED', '❌ 上傳失敗: %1').replace('%1', msg.error));
            }
        }
    };
    window.CocoyaBridge.onMessage(handleBridgeMessage);

    // 輔助函式：根據選取的專案類型動態更新來源模式 (Mode) 的選項
    function updateSourceModeOptions(projectType) {
        const sourceSelect = modal.querySelector('[name="sourceMode"]');
        if (!sourceSelect) return;

        const allowedModes = TYPE_TO_MODES_MAP[projectType] || ['file'];
        const currentMode = sourceSelect.value;

        // 重新渲染選項，若原本選取的模式依舊在允許列表中，則保留它；否則使用預設第一個模式
        const nextMode = allowedModes.includes(currentMode) ? currentMode : allowedModes[0];
        sourceSelect.innerHTML = optionList(allowedModes, nextMode);
        
        // 確保 DOM 上的選定值也被同步更新
        sourceSelect.value = nextMode;
    }

    const typeSelect = modal.querySelector('[name="projectType"]');
    if (typeSelect) {
        typeSelect._prevType = typeSelect.value; // 記錄初始值供取消時回滾
        typeSelect.onchange = async () => {
            const newType = typeSelect.value;
            const prevType = typeSelect._prevType || typeSelect.options[0]?.value || 'table';

            // 防呆：切換類型會清空目前資料，若有未匯出工作需先確認；取消則回滾選項
            if (prevType !== newType && hasUnsavedWork()) {
                const ok = await window.CocoyaBridge.confirm(t('TYPE_SWITCH_CONFIRM', '切換專案類型將清除目前資料，確定繼續嗎？'));
                if (!ok) {
                    typeSelect.value = prevType;
                    return;
                }
            }
            typeSelect._prevType = newType;

            // 1. 徹底關閉攝影機與連拍
            Sampler.stopCamera();
            Sampler.stopBurst();

            // 2. 清除殘留的檔案與影像狀態，切換專案類型時務必乾淨重設
            state.images = [];
            state.tableRows = [];
            state.sourceFolderPath = null;
            setNameWarning(false);
            
            // 3. 動態連動過濾 Mode 的 options 並重設 value
            updateSourceModeOptions(newType);

            // 4. 重設 Spec 並同步為更新後安全的 Mode 值
            state.spec = DatasetSpec.createDefault({ 
                name: getFormValue('projectName') || 'dataset', 
                type: newType,
                mode: getFormValue('sourceMode')
            });

            // 5. 清理 input（集中式狀態訊息由面板自動清除）
            
            const fi = modal.querySelector('#dataset-file-input');
            if (fi) fi.value = '';

            refreshDynamicPanels();
            refreshPreview();
        };
    }

    const sourceSelect = modal.querySelector('[name="sourceMode"]');
    if (sourceSelect) {
        sourceSelect.onchange = () => {
            // 切換模式（例如從 Live 切換到 File）時，應確實關閉攝影機與連拍
            Sampler.stopCamera();
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

    // 專案名稱即時過濾 (僅限英數下劃線)
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
        if (event.key === 'Escape') closeDatasetManager();
    });
}

function createModal() {
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'dataset-manager-overlay';
    modal.innerHTML = `
        <section class="dataset-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="dataset-manager-title">
            <header class="dataset-manager-header">
                <div>
                    <h2 id="dataset-manager-title">${t('TITLE', 'Dataset Manager')}</h2>
                    <span id="dataset-manager-subtitle">${t('SUBTITLE', 'Dataset Spec')}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button type="button" id="dataset-manager-clear" class="dataset-secondary-btn" style="padding: 4px 8px; font-size: 11px; margin: 0; line-height: 1.2; display: flex; align-items: center; justify-content: center;" title="${t('CLEAR_DATA_TOOLTIP', '清空所有暫存資料記錄並重置')}">${t('CLEAR_DATA', '清除資料')}</button>
                    <button type="button" id="dataset-manager-close" class="dataset-icon-btn" title="${t('CLOSE', '關閉')}">×</button>
                </div>
            </header>

            <div id="dataset-export-progress" class="dataset-export-progress" style="display: none;">
                <div class="dataset-export-progress-bar"></div>
                <span class="dataset-export-progress-label">${t('EXPORT_IN_PROGRESS', '正在打包 ZIP 並產生 dataset.json...')}</span>
            </div>

            <div id="dataset-manager-message" class="dataset-manager-message" style="display: none;"></div>

            <div class="dataset-manager-body">
                <section class="dataset-panel dataset-source-panel">
                    <h3>${t('SOURCE', '資料來源')}</h3>
                    
                    <label>
                        <span>${t('PROJECT_TYPE', '專案類型')}</span>
                        <select name="projectType">${optionList(DatasetSpecConstants.PROJECT_TYPES, 'table')}</select>
                    </label>
                    <label>
                        <span>${t('SOURCE_MODE', '來源模式')}</span>
                        <select name="sourceMode">${optionList(TYPE_TO_MODES_MAP['table'], 'file')}</select>
                    </label>

                    <div class="dataset-panel-divider"></div>

                    <label>
                        <span>${t('PROJECT_NAME', '資料集名稱')}</span>
                        <input name="projectName" value="dataset" placeholder="${t('PROJECT_NAME_PLACEHOLDER', '僅限英數與下劃線')}">
                        <span style="font-size: 10px; color: #999; margin-top: 2px; display: block;">${t('PROJECT_NAME_HINT', '* 僅限英文、數字與下劃線 (用於雲端路徑)')}</span>
                    </label>
                    
                    <label>
                        <span>${t('DESCRIPTION', '描述')}</span>
                        <textarea name="description" rows="3" placeholder="${t('DESCRIPTION_PLACEHOLDER', '專案詳細描述...')}"></textarea>
                    </label>

                    <div id="dataset-cloud-diagnostic-area" style="display: none; margin-top: 12px; padding: 10px; background: #fdf6fb; border: 1px solid #e1bee7; border-radius: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <span style="font-size: 12px; font-weight: bold; color: #9c27b0;">${t('CLOUD_REMOTE_ENV', '☁️ 遠端環境')}</span>
                            <div style="display: flex; gap: 4px;">
                                <button type="button" id="dataset-cloud-diagnose-btn" class="dataset-small-btn" style="margin: 0; background: #9c27b0; color: white; border: none; padding: 2px 6px;">${t('CLOUD_DIAGNOSE', '執行診斷')}</button>
                            </div>
                        </div>
                        <div id="dataset-cloud-diagnostic-result" style="font-size: 11px; color: #555; line-height: 1.4;">
                            ${t('CLOUD_DIAGNOSE_HINT', '請點擊「執行診斷」檢查 GPU 與 Docker 環境。')}
                        </div>
                    </div>

                    <!-- 匯入按鈕移至左欄最下方：使用者可先在上方依序完成設定，最後再選擇來源 -->
                    <div class="dataset-panel-divider"></div>

                    <div id="dataset-import-area-table" class="dataset-import-area">
                        <button type="button" id="dataset-import-btn" class="dataset-secondary-btn" style="width: 100%">${t('SELECT_CSV', '選擇 CSV / JSON 檔案')}</button>
                        <input type="file" id="dataset-file-input" accept=".csv,.json" style="display: none;">
                    </div>

                    <div id="dataset-import-area-image" class="dataset-import-area" style="display: none;">
                        <button type="button" id="dataset-dir-import-btn" class="dataset-secondary-btn" style="width: 100%">${t('SELECT_IMAGE_FOLDER', '選擇影像資料夾')}</button>
                        <button type="button" id="dataset-cloud-upload-btn" class="dataset-secondary-btn" style="width: 100%; margin-top: 8px; background: #9c27b0; color: white; border: none; display: none;">${t('UPLOAD_ZIP', '☁️ 上傳本地資料集 (ZIP)')}</button>
                        <input type="file" id="dataset-cloud-zip-input" accept=".zip" style="display: none;">
                    </div>
                </section>

                <section class="dataset-panel dataset-schema-panel">
                    <div class="dataset-panel-title">
                        <h3 id="dataset-structure-title">${t('STRUCTURE_TITLE', '欄位與標籤')}</h3>
                        <div id="dataset-schema-actions">
                            <button type="button" id="dataset-add-column" class="dataset-small-btn">${t('ADD_FEATURE', '新增 Feature')}</button>
                            <button type="button" id="dataset-add-label" class="dataset-small-btn">${t('ADD_LABEL', '新增 Label')}</button>
                        </div>
                    </div>
                    <div id="dataset-structure-content">
                        <div class="dataset-column-head">
                            <span>${t('COLUMN_NAME', '名稱')}</span>
                            <span>${t('COLUMN_TYPE', '型別')}</span>
                            <span>${t('COLUMN_ROLE', '角色')}</span>
                            <span></span>
                        </div>
                        <div id="dataset-column-list" class="dataset-column-list"></div>
                    </div>
                </section>

                <section class="dataset-panel dataset-preview-panel">
                    <div class="dataset-panel-title">
                        <h3>${t('PREVIEW_TITLE', '預覽與標註')}</h3>
                        <div>
                            <button type="button" id="dataset-manager-validate" class="dataset-small-btn">${t('VALIDATE', '驗證')}</button>
                            <span class="dataset-autosave-indicator" title="${t('AUTOSAVE_ON_TOOLTIP', '標註/分類/新增/刪除後自動寫入 dataset.json')}">🛡 ${t('AUTOSAVE_ON', '自動儲存已開啟')}</span>
                            <button type="button" id="dataset-manager-export" class="dataset-small-btn" style="background: #FE2F89; color: white; border: none;">${t('EXPORT', '匯出資料集')}</button>
                        </div>
                    </div>
                    <div id="dataset-validation"></div>
                    <div id="dataset-preview-content">
                        <pre id="dataset-json-preview"></pre>
                    </div>
                </section>
            </div>
        </section>
    `;

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

export function openDatasetManager() {
    if (typeof document === 'undefined') return state.spec;
    const modal = getModal() || createModal();
    state.isOpen = true;
    modal.style.display = 'flex';
    
    // 確保預覽面板與採集視圖 DOM 已根據目前的狀態渲染
    refreshDynamicPanels();
    refreshPreview();
    
    modal.querySelector('input[name="projectName"]')?.classList.remove('dataset-name-warning');
    modal.querySelector('input[name="projectName"]')?.focus();
    return state.spec;
}

export async function closeDatasetManager() {
    // 方案 A：錨定時資料已自動落盤，關閉不需再問；
    // 僅「未錨定且有未匯出工作」（理論上被 Startup Home 擋住的邊緣）才提示，避免誤關遺失。
    const anchored = !!(window.CocoyaBridge
        && window.CocoyaBridge.capabilities
        && window.CocoyaBridge.capabilities.isAnchored);
    if (state.isOpen && !anchored && hasUnsavedWork()) {
        const ok = await window.CocoyaBridge.confirm(t('CLOSE_UNSAVED_CONFIRM', '目前有尚未匯出的資料，確定關閉嗎？'));
        if (!ok) return;
    }

    // 關閉前立即落盤，避免最後異動遺失
    scheduleAutoSave(true);

    const modal = getModal();
    state.isOpen = false;
    Sampler.stopCamera();

    // 清除標註模式的 debounce timer，避免 callback 在 DOM 銷毀後執行
    if (state.annotationMode.saveTimer) {
        clearTimeout(state.annotationMode.saveTimer);
        state.annotationMode.saveTimer = null;
    }

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
