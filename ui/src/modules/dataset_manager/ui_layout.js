import { DatasetSpec, DatasetSpecConstants } from './spec.js';
import { Importer } from './importer.js';
import { Sampler } from './sampler.js';
import { UIComponents } from './ui_components.js';
import { UICanvas } from './ui_canvas.js';

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
    sourceFolderPath: null // 儲存來源資料夾路徑
};

function optionList(values, selected) {
    return values
        .map((value) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${value}</option>`)
        .join('');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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
    return Object.keys(current).reduce((acc, key) => {
        acc[key] = current[key];
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

function renderColumnRow(column = {}) {
    const normalized = DatasetSpec.normalizeColumn(column);
    return `
        <div class="dataset-column-row">
            <input data-field="name" value="${escapeHtml(normalized.name)}" placeholder="欄位名稱">
            <select data-field="type">
                ${optionList(DatasetSpecConstants.COLUMN_TYPES, normalized.type)}
            </select>
            <select data-field="role">
                ${optionList(DatasetSpecConstants.COLUMN_ROLES, normalized.role)}
            </select>
            <button type="button" class="dataset-icon-btn dataset-remove-column" title="移除欄位">×</button>
        </div>
    `;
}

function renderValidation(result) {
    const errors = result.errors.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    const warnings = result.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    const statusClass = result.ok ? 'ok' : 'error';
    const statusText = result.ok ? 'Spec 可用' : '需要修正';

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
                preview.textContent = JSON.stringify(specJson, null, 2) + `\n\n... (還有 ${total - 20} 個樣本未顯示於預覽區)`;
            } else {
                preview.textContent = JSON.stringify(specJson, null, 2);
            }
        }
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

async function handleFileImport(file) {
    if (!file) return;
    const status = document.getElementById('dataset-import-status');
    if (status) status.textContent = `載入中: ${file.name}...`;

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
            throw new Error('檔案內容為空或格式不符');
        }

        const rawFileName = file.name.split('.')[0];
        const safeFileName = sanitizeName(rawFileName) || rawFileName;
        const safeBaseDir = `dataset/${sanitizeName(safeFileName) || 'dataset'}/`;
        
        // 智慧填充：僅在目前的名稱是預設值時才自動填入
        const modal = getModal();
        if (modal) {
            const nameInput = modal.querySelector('[name="projectName"]');
            const dirInput = modal.querySelector('[name="baseDir"]');
            
            // 如果名稱是預設值 "dataset" 或空的，才進行填充
            if (nameInput && (nameInput.value === 'dataset' || !nameInput.value)) {
                nameInput.value = safeFileName;
                if (dirInput) dirInput.value = safeBaseDir;
            }
        }

        // 更新 State
        state.tableRows = rows;
        state.images = []; 
        
        const detectedSchema = DatasetSpec.detectSchema(rows);
        state.spec.updateSchema(detectedSchema);
        
        refreshDynamicPanels(); 
        if (status) status.textContent = `✅ 成功匯入 ${rows.length} 筆資料`;

        const fileInput = document.getElementById('dataset-file-input');
        if (fileInput) fileInput.value = '';

    } catch (e) {
        console.error('[DatasetManager] Import Error:', e);
        if (status) status.textContent = `❌ 錯誤: ${e.message}`;
    }
}

async function handleDirectoryImport() {
    const status = document.getElementById('dataset-import-status');
    if (status) status.textContent = '正在選取資料夾...';

    try {
        const result = await window.CocoyaBridge.pickFolder();
        if (!result) {
            if (status) status.textContent = '';
            return;
        }

        const { path: folderPath, images, labelCounts, labelMap } = result;

        // 取得最上層資料夾名稱
        const rawRootDir = folderPath.split(/[\\/]/).pop() || 'dataset';
        const safeRootDir = sanitizeName(rawRootDir) || rawRootDir;
        const safeBaseDir = `dataset/${safeRootDir}/`;

        // 智慧填充
        const modal = getModal();
        if (modal) {
            const nameInput = modal.querySelector('[name="projectName"]');
            const dirInput = modal.querySelector('[name="baseDir"]');
            // 如果名稱是空的、或預設的 "dataset"，則嘗試更新
            if (nameInput && (nameInput.value === 'dataset' || !nameInput.value)) {
                // 如果 sanitized 後是空字串 (例如全中文)，則維持原樣或使用 rawName (但後續會 validation)
                nameInput.value = safeRootDir;
                if (dirInput) dirInput.value = safeBaseDir;
            }
        }

        state.images = images;
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

        if (status) status.textContent = `✅ 成功匯入 ${images.length} 張影像，共 ${Object.keys(labelCounts).length} 個標籤`;
        
        refreshDynamicPanels();
        refreshPreview();

    } catch (e) {
        console.error('[DatasetManager] Dir Import Error:', e);
        if (status) status.textContent = `❌ 錯誤: ${e.message}`;
    }
}

async function handleExportDataset() {
    console.log('[DatasetManager] handleExportDataset triggered');
    const status = document.getElementById('dataset-import-status');
    if (status) status.textContent = '📦 正在準備匯出...';

    try {
        // 1. 同步最新資料
        syncSpecFromUI(true);
        const spec = state.spec.toJSON();
        console.log('[DatasetManager] Spec synced for export:', spec.project.name);

        // 2. 驗證 Spec
        const result = state.spec.validate();
        if (!result.ok) {
            throw new Error(`資料集規格驗證失敗: ${result.errors[0]}`);
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
                if (msg.success) {
                    if (status) status.textContent = '✅ 資料集匯出成功';
                } else {
                    if (status) status.textContent = `❌ 匯出失敗: ${msg.error}`;
                }
            }
        };
        window.CocoyaBridge.onMessage(handler);

    } catch (e) {
        console.error('[DatasetManager] Export Error:', e);
        if (status) status.textContent = `❌ 錯誤: ${e.message}`;
    }
}

function enterAnnotationMode(image, index) {
    const modal = getModal();
    const previewContent = modal?.querySelector('#dataset-preview-content');
    const previewHeader = modal?.querySelector('.dataset-preview-panel .dataset-panel-title div');
    if (!previewContent || !previewHeader) return;

    const existingBackBtn = modal.querySelector('#dataset-annotation-back');
    if (existingBackBtn) {
        existingBackBtn.remove();
    }

    previewHeader.insertAdjacentHTML('afterbegin', `
        <button type="button" id="dataset-annotation-back" class="dataset-small-btn" style="background: #FE2F89; color: white; border: none; margin-right: 8px;">← 返回列表</button>
    `);
    modal.querySelector('#dataset-annotation-back').onclick = exitAnnotationMode;

    previewContent.innerHTML = `
        <div class="dataset-annotation-view" style="display: flex; flex-direction: column; gap: 10px; height: 100%;">
            <div class="dataset-annotation-sidebar" style="display: flex; align-items: center; justify-content: space-between; width: 100%; box-sizing: border-box; padding: 8px 12px; gap: 16px;">
                <div style="min-width: 120px;">
                    <h4 style="margin: 0; font-size: 13px; color: #FE2F89;">標註資訊</h4>
                    <span style="font-size: 10px; color: #777; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px;" title="${image.name}">檔案: ${image.name}</span>
                </div>
                <div id="annotation-list-ui" style="display: flex; gap: 6px; flex-wrap: wrap; flex: 1; max-height: 60px; overflow-y: auto; justify-content: flex-start; align-content: flex-start;"></div>
            </div>
            <div class="dataset-annotation-image-container" style="min-height: 380px; height: 380px; width: 100%;">
                <div id="annotation-container" style="position: relative; display: inline-block;">
                    <img src="${image.blobUrl}" id="annotation-target-img" style="max-width: 100%; max-height: 380px; display: block; object-fit: contain;">
                </div>
            </div>
        </div>
    `;

    const img = document.getElementById('annotation-target-img');
    const container = document.getElementById('annotation-container');
    
    img.onload = () => {
        const projectType = getFormValue('projectType');
        const mode = projectType === 'line_following' ? 'line' : 'bbox';
        UICanvas.init(container, img, image.annotations || [], {
            mode: mode,
            onUpdate: (anns) => {
                image.annotations = anns; 
                renderAnnotationListUI(anns);
                refreshPreview(); 
            }
        });
        renderAnnotationListUI(image.annotations || []);
    };
}

function renderAnnotationListUI(anns) {
    const list = document.getElementById('annotation-list-ui');
    if (!list) return;
    list.innerHTML = anns.map((ann, i) => {
        if (ann.line) {
            const coords = ann.line.map(v => v.toFixed(2)).join(',');
            return `
                <div class="dataset-annotation-item">
                    <span>#${i+1} 線段: [${coords}]</span>
                    <button onclick="window.CocoyaDataset.removeAnnotation(${i})">×</button>
                </div>
            `;
        } else if (ann.bbox) {
            return `
                <div class="dataset-annotation-item">
                    <span>#${i+1} [${ann.bbox.map(v => v.toFixed(2)).join(',')}]</span>
                    <button onclick="window.CocoyaDataset.removeAnnotation(${i})">×</button>
                </div>
            `;
        }
        return '';
    }).join('') || '<p style="color: #999;">尚未有標註</p>';
}

function exitAnnotationMode() {
    UICanvas.unbindEvents();
    const modal = getModal();
    const backBtn = modal?.querySelector('#dataset-annotation-back');
    if (backBtn) backBtn.remove();
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
        structureTitle.textContent = '標籤與樣本統計';
        structureActions.style.display = 'none';
        UIComponents.renderLabelStats(structureContent, state.spec.toJSON().stats);
    } else {
        structureTitle.textContent = '欄位與標籤';
        structureActions.style.display = 'block';
        structureContent.innerHTML = `
            <div class="dataset-column-head">
                <span>名稱</span>
                <span>型別</span>
                <span>角色</span>
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
        Sampler.state.onSampleCaptured = (blob) => {
            addSampleFromSampler(blob);
        };

        UIComponents.renderSamplerView(samplerView, {
            labels,
            onLabelChange: (l) => {
                Sampler.setTargetLabel(l);
                
                // [關鍵修正] 如果是新標籤且尚未存在於 spec 中，手動加入 label_map
                const spec = state.spec.toJSON();
                const labelMap = spec.schema.label_map || {};
                if (labelMap[l] === undefined) {
                    labelMap[l] = Object.keys(labelMap).length;
                    state.spec.updateSchema({ label_map: labelMap });
                }

                // 立即刷新採集面板以更新 Select 清單
                refreshDynamicPanels();
            },
            onSnapshot: () => handleSamplerSnapshot(),
            onBurstToggle: () => handleSamplerBurstToggle(),
            onStartCamera: () => Sampler.startCamera(null), 
            onStopCamera: () => Sampler.stopCamera()
        });

    } else {
        Sampler.stopCamera();
    }

    // 顯示影像或表格預覽
    if (isImage || isLive) {
        const imagePreview = modal.querySelector('#dataset-image-preview');
        imagePreview.style.display = state.images.length ? 'block' : 'none';
        UIComponents.renderImageGrid(imagePreview, state.images, {
            onImageClick: (img, idx) => enterAnnotationMode(img, idx)
        });
    } else {
        const tablePreview = modal.querySelector('#dataset-table-preview');
        tablePreview.style.display = state.tableRows.length ? 'block' : 'none';
        renderPreviewTable(tablePreview, state.tableRows);
    }
    refreshPreview();
}

async function handleSamplerSnapshot() {
    const status = document.getElementById('dataset-import-status');
    if (status) status.textContent = '📸 正在採集...';
    
    try {
        const projectName = getFormValue('projectName') || 'dataset';
        await Sampler.takeSnapshot(projectName);
        if (status) status.textContent = '✅ 採集成功';
    } catch (e) {
        if (status) status.textContent = `❌ 採集失敗: ${e.message}`;
    }
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

function addSampleFromSampler(blob) {
    const label = Sampler.state.targetLabel || 'unlabeled';
    const timestamp = Date.now();
    const filename = `${label}_${timestamp}.jpg`;
    const blobUrl = URL.createObjectURL(blob);
    
    const newImage = {
        name: filename,
        path: `${label}/${filename}`, 
        label: label,
        blobUrl: blobUrl,
        annotations: []
    };

    state.images.unshift(newImage);
    
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
                onImageClick: (img, idx) => enterAnnotationMode(img, idx)
            });
        }
    }

    refreshPreview();
}

function updateStatsFromImages() {
    const currentSpec = state.spec.toJSON();
    const existingLabelMap = currentSpec.schema.label_map || {};

    const labelCounts = state.images.reduce((acc, img) => {
        acc[img.label] = (acc[img.label] || 0) + 1;
        return acc;
    }, {});

    // [關鍵修正] 合併目前的 label_map 與從影像中偵測到的標籤，確保「手動新增但尚無照片」的標籤不會消失
    const labelMap = Object.assign({}, existingLabelMap);
    Object.keys(labelCounts).forEach((label) => {
        if (labelMap[label] === undefined) {
            labelMap[label] = Object.keys(labelMap).length;
        }
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
        clearBtn.onclick = () => {
            // 0. 確保退出標註模式，清空畫布與事件綁定，並移除返回按鈕
            exitAnnotationMode();

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

            // 6. 清理檔案選擇值與狀態訊息
            const status = modal.querySelector('#dataset-import-status');
            if (status) status.textContent = '';
            
            const fi = modal.querySelector('#dataset-file-input');
            const di = modal.querySelector('#dataset-dir-input');
            if (fi) fi.value = '';
            if (di) di.value = '';

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
                const status = modal.querySelector('#dataset-import-status');
                if (status) status.textContent = '📦 正在準備上傳本地 ZIP 檔案...';

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

                        if (status) {
                            const progress = Math.round(((i + 1) / totalChunks) * 100);
                            status.textContent = `☁️ 正在上傳資料集... (${progress}%)`;
                        }

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

                    if (status) status.textContent = '⌛ 正在雲端進行解壓縮，請稍候...';
                } catch (err) {
                    if (status) status.textContent = `❌ 讀取失敗: ${err.message}`;
                }
            });
        };
    }

    const cloudDiagnoseBtn = modal.querySelector('#dataset-cloud-diagnose-btn');
    if (cloudDiagnoseBtn) {
        cloudDiagnoseBtn.onclick = () => {
            window.CocoyaUI.ensureSshConfig((sshConfig) => {
                const diagResult = modal.querySelector('#dataset-cloud-diagnostic-result');
                if (diagResult) diagResult.innerHTML = '正在進行遠端環境診斷...';
                window.CocoyaBridge.send('checkRemoteEnvironment', sshConfig);
            });
        };
    }



    // 監聽 Extension 回傳的結果
    const handleBridgeMessage = (msg) => {
        const diagResult = modal.querySelector('#dataset-cloud-diagnostic-result');
        const status = modal.querySelector('#dataset-import-status');

        if (msg.command === 'checkRemoteEnvironmentResult') {
            if (diagResult) {
                if (msg.success) {
                    const statusData = msg.status;
                    let html = `<div style="margin-top: 4px;">`;
                    html += `<strong>GPU</strong>: ${statusData.cudaAvailable ? `<span style="color:#4CAF50;">可用</span> (${statusData.gpuName})` : '<span style="color:#F44336;">無</span>'}<br>`;
                    html += `<strong>Docker</strong>: ${statusData.dockerRunning ? '<span style="color:#4CAF50;">正常</span>' : '<span style="color:#F44336;">未啟動</span>'}<br>`;
                    html += `<strong>GPU Passthrough</strong>: ${statusData.gpuPassthrough ? '<span style="color:#4CAF50;">支援 (--gpus)</span>' : '<span style="color:#F44336;">不支援</span>'}`;
                    
                    if (statusData.errors && statusData.errors.length > 0) {
                        html += `<div style="color: #FF9800; margin-top: 4px; font-size: 10px;">⚠️ 診斷警告:<br>- ${statusData.errors.join('<br>- ')}</div>`;
                    }
                    html += `</div>`;
                    diagResult.innerHTML = html;
                } else {
                    diagResult.innerHTML = `<span style="color: #F44336;">❌ 診斷失敗: ${msg.error}</span>`;
                }
            }
        } else if (msg.command === 'datasetUploadResult') {
            if (status) {
                if (msg.success) {
                    status.textContent = '✅ 資料集已成功上傳並在遠端解壓縮！';
                    if (cloudZipInput) cloudZipInput.value = '';
                } else {
                    status.textContent = `❌ 上傳失敗: ${msg.error}`;
                }
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
        typeSelect.onchange = () => {
            const newType = typeSelect.value;
            
            // 1. 徹底關閉攝影機與連拍
            Sampler.stopCamera();
            Sampler.stopBurst();

            // 2. 清除殘留的檔案與影像狀態，切換專案類型時務必乾淨重設
            state.images = [];
            state.tableRows = [];
            state.sourceFolderPath = null;
            
            // 3. 動態連動過濾 Mode 的 options 並重設 value
            updateSourceModeOptions(newType);

            // 4. 重設 Spec 並同步為更新後安全的 Mode 值
            state.spec = DatasetSpec.createDefault({ 
                name: getFormValue('projectName') || 'dataset', 
                type: newType,
                mode: getFormValue('sourceMode')
            });

            // 5. 清理 UI 狀態文字與 input
            const status = modal.querySelector('#dataset-import-status');
            if (status) status.textContent = '';
            
            const fi = modal.querySelector('#dataset-file-input');
            const di = modal.querySelector('#dataset-dir-input');
            if (fi) fi.value = '';
            if (di) di.value = '';

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
                    <h2 id="dataset-manager-title">Dataset Manager</h2>
                    <span>Dataset Spec</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button type="button" id="dataset-manager-clear" class="dataset-secondary-btn" style="padding: 4px 8px; font-size: 11px; margin: 0; line-height: 1.2; display: flex; align-items: center; justify-content: center;" title="清空所有暫存資料記錄並重置">清除資料</button>
                    <button type="button" id="dataset-manager-close" class="dataset-icon-btn" title="關閉">×</button>
                </div>
            </header>

            <div class="dataset-manager-body">
                <section class="dataset-panel dataset-source-panel">
                    <h3>資料來源 (Source)</h3>
                    
                    <label>
                        <span>專案類型 (Type)</span>
                        <select name="projectType">${optionList(DatasetSpecConstants.PROJECT_TYPES, 'table')}</select>
                    </label>
                    <label>
                        <span>來源模式 (Mode)</span>
                        <select name="sourceMode">${optionList(TYPE_TO_MODES_MAP['table'], 'file')}</select>
                    </label>

                    <div class="dataset-panel-divider"></div>

                    <div id="dataset-import-area-table" class="dataset-import-area">
                        <button type="button" id="dataset-import-btn" class="dataset-secondary-btn" style="width: 100%">選擇 CSV / JSON 檔案</button>
                        <input type="file" id="dataset-file-input" accept=".csv,.json" style="display: none;">
                    </div>

                    <div id="dataset-import-area-image" class="dataset-import-area" style="display: none;">
                        <button type="button" id="dataset-dir-import-btn" class="dataset-secondary-btn" style="width: 100%">選擇影像資料夾</button>
                        <input type="file" id="dataset-dir-input" webkitdirectory style="display: none;">
                        <button type="button" id="dataset-cloud-upload-btn" class="dataset-secondary-btn" style="width: 100%; margin-top: 8px; background: #9c27b0; color: white; border: none; display: none;">☁️ 上傳本地資料集 (ZIP)</button>
                        <input type="file" id="dataset-cloud-zip-input" accept=".zip" style="display: none;">
                    </div>

                    <div id="dataset-import-status" style="margin-top: 8px; font-size: 11px; color: #FE2F89; min-height: 15px;"></div>

                    <div class="dataset-panel-divider"></div>

                    <label>
                        <span>資料集名稱 (Name)</span>
                        <input name="projectName" value="dataset" placeholder="僅限英數與下劃線">
                        <span style="font-size: 10px; color: #999; margin-top: 2px; display: block;">* 僅限英文、數字與下劃線 (用於雲端路徑)</span>
                    </label>
                    
                    <label>
                        <span>描述 (Description)</span>
                        <textarea name="description" rows="3" placeholder="專案詳細描述..."></textarea>
                    </label>

                    <div id="dataset-cloud-diagnostic-area" style="display: none; margin-top: 12px; padding: 10px; background: #fdf6fb; border: 1px solid #e1bee7; border-radius: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <span style="font-size: 12px; font-weight: bold; color: #9c27b0;">☁️ 遠端環境</span>
                            <div style="display: flex; gap: 4px;">
                                <button type="button" id="dataset-cloud-diagnose-btn" class="dataset-small-btn" style="margin: 0; background: #9c27b0; color: white; border: none; padding: 2px 6px;">執行診斷</button>
                            </div>
                        </div>
                        <div id="dataset-cloud-diagnostic-result" style="font-size: 11px; color: #555; line-height: 1.4;">
                            請點擊「執行診斷」檢查 GPU 與 Docker 環境。
                        </div>
                    </div>
                </section>

                <section class="dataset-panel dataset-schema-panel">
                    <div class="dataset-panel-title">
                        <h3 id="dataset-structure-title">欄位與標籤</h3>
                        <div id="dataset-schema-actions">
                            <button type="button" id="dataset-add-column" class="dataset-small-btn">新增 Feature</button>
                            <button type="button" id="dataset-add-label" class="dataset-small-btn">新增 Label</button>
                        </div>
                    </div>
                    <div id="dataset-structure-content">
                        <div class="dataset-column-head">
                            <span>名稱</span>
                            <span>型別</span>
                            <span>角色</span>
                            <span></span>
                        </div>
                        <div id="dataset-column-list" class="dataset-column-list"></div>
                    </div>
                </section>

                <section class="dataset-panel dataset-preview-panel">
                    <div class="dataset-panel-title">
                        <h3>預覽與標註</h3>
                        <div>
                            <button type="button" id="dataset-manager-validate" class="dataset-small-btn">驗證</button>
                            <button type="button" id="dataset-manager-export" class="dataset-small-btn" style="background: #FE2F89; color: white; border: none;">匯出資料集</button>
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

export function openDatasetManager() {
    if (typeof document === 'undefined') return state.spec;
    const modal = getModal() || createModal();
    state.isOpen = true;
    modal.style.display = 'flex';
    
    // 確保預覽面板與採集視圖 DOM 已根據目前的狀態渲染
    refreshDynamicPanels();
    refreshPreview();
    
    modal.querySelector('input[name="projectName"]')?.focus();
    return state.spec;
}

export function closeDatasetManager() {
    const modal = getModal();
    state.isOpen = false;
    Sampler.stopCamera();
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
    }
}

export function getCurrentDatasetSpec() {
    syncSpecFromUI();
    return state.spec;
}
