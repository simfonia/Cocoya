/**
 * Dataset Manager UI Components
 * 負責渲染動態面板內容 (影像網格、欄位表格等)
 */
import { Sampler } from './sampler.js';
import { t } from './i18n.js';

function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, '&#039;');
}

export const UIComponents = {
    /**
     * 渲染影像縮圖牆
     * @param {Array} images 影像資料 [{path, label, blobUrl}]
     * @param {Object} options 點擊回調等
     */
    renderImageGrid(container, images, options = {}) {
        if (!container) return;
        
        if (!images || images.length === 0) {
            container.innerHTML = '<div class="dataset-empty-state">' + t('NO_IMAGES', '尚無影像資料') + '</div>';
            return;
        }

        container.innerHTML = `
            <div class="dataset-image-grid">
                ${images.map((img, index) => {
                    const label = img.label || 'unlabeled';
                    const color = this.getLabelColor(label);
                    const isAnnotated = img.annotations && img.annotations.length > 0;
                    return `
                    <div class="dataset-image-item ${isAnnotated ? 'annotated' : ''}" data-index="${index}" title="${escapeHTML(img.path)}">
                        <button type="button" class="dataset-image-delete-btn" data-index="${index}" title="${t('DELETE_IMAGE', '刪除照片')}">×</button>
                        <div class="dataset-image-thumb" data-index="${index}">
                            ${img.blobUrl ? `<img src="${img.blobUrl}">` : '<div class="dataset-thumb-placeholder">?</div>'}
                        </div>
                        ${isAnnotated ? '<span class="dataset-image-check">✓</span>' : ''}
                        <div class="dataset-image-info">
                            <span class="dataset-image-label" style="background-color: ${color} !important;">
                                ${escapeHTML(label)}
                            </span>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        `;

        if (options.onImageClick) {
            container.querySelectorAll('.dataset-image-thumb').forEach(item => {
                item.onclick = () => {
                    const index = parseInt(item.dataset.index);
                    options.onImageClick(images[index], index);
                };
            });
        }

        if (options.onDeleteImage) {
            container.querySelectorAll('.dataset-image-delete-btn').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const index = parseInt(btn.dataset.index);
                    options.onDeleteImage(index);
                };
            });
        }
    },

    /**
     * 渲染標註模式左側的單列垂直縮圖欄
     * @param {HTMLElement} container 容器元素
     * @param {Array} images 影像資料 [{path, label, blobUrl, annotations}]
     * @param {number} currentIndex 當前圖片索引
     * @param {Object} options 回調 { onThumbnailClick }
     */
    renderAnnotationThumbnails(container, images, currentIndex, options = {}) {
        if (!container) return;

        if (!images || images.length === 0) {
            container.innerHTML = '<div class="dataset-empty-state">' + t('NO_IMAGES', '尚無影像資料') + '</div>';
            return;
        }

        container.innerHTML = `
            <div class="dataset-annotation-thumb-list">
                ${images.map((img, index) => {
                    const isCurrent = (index === currentIndex);
                    const isCheckMode = options.mode === 'classification';
                    const isAnnotated = img.annotations && img.annotations.length > 0;
                    const badgeHtml = isCheckMode
                        ? `<span class="dataset-annotation-thumb-label">${escapeHTML(img.label || '?')}</span>`
                        : (isAnnotated ? '<span class="dataset-annotation-thumb-check">✓</span>' : '');
                    const itemClass = [isCurrent ? 'current' : '', isCheckMode ? '' : (isAnnotated ? 'annotated' : '')]
                        .filter(Boolean).join(' ');
                    return `
                    <div class="dataset-annotation-thumb-item ${itemClass}" data-index="${index}" title="${escapeHTML(img.path || img.name || '')}">
                        ${img.blobUrl ? `<img src="${img.blobUrl}" class="dataset-annotation-thumb">` : '<div class="dataset-thumb-placeholder">?</div>'}
                        ${badgeHtml}
                    </div>
                    `;
                }).join('')}
            </div>
        `;

        if (options.onThumbnailClick) {
            container.querySelectorAll('.dataset-annotation-thumb-item').forEach(item => {
                item.onclick = () => {
                    const index = parseInt(item.dataset.index);
                    options.onThumbnailClick(index);
                };
            });
        }
    },

    /**
     * 渲染標籤統計列表
     */
    renderLabelStats(container, stats, onLabelChange) {
        if (!container) return;
        const counts = stats.label_counts || {};
        const labels = Object.keys(counts).sort((a, b) => a.localeCompare(b));

        if (labels.length === 0) {
            container.innerHTML = '<div class="dataset-empty-state">' + t('NO_LABELS', '尚未偵測到標籤') + '</div>';
            return;
        }

        container.innerHTML = `
            <div class="dataset-label-stats">
                <div class="dataset-label-head">
                    <span>${t('LABEL_NAME', '標籤名稱')}</span>
                    <span>${t('SAMPLE_COUNT', '樣本數')}</span>
                    <span>${t('COLOR', '顏色')}</span>
                </div>
                ${labels.map(label => {
                    const color = this.getLabelColor(label);
                    return `
                    <div class="dataset-label-row">
                        <span>${escapeHTML(label)}</span>
                        <span>${counts[label]}</span>
                        <span class="dataset-label-color" style="background-color: ${color} !important;"></span>
                    </div>
                    `;
                }).join('')}
            </div>
        `;
    },

    /**
     * 渲染即時採集視圖 (Sampler)
     */
    renderSamplerView(container, options = {}) {
        if (!container) return;

        const { isCamRunning, lastPreviewUrl, targetLabel, cameraList, selectedDeviceId } = Sampler.state;

        container.innerHTML = `
            <div class="dataset-sampler-container">
                <div class="dataset-sampler-video-wrapper">
                    <div id="dataset-sampler-placeholder" class="dataset-sampler-placeholder" style="${lastPreviewUrl ? 'display:none;' : ''}">
                        <div class="dataset-sampler-icon">📷</div>
                        <div class="dataset-sampler-text">${t('SAMPLER_PLACEHOLDER', '等待採集影像...')}</div>
                    </div>
                    <img id="dataset-sampler-last-preview" class="dataset-sampler-last-img" 
                         src="${lastPreviewUrl || ''}" 
                         style="${lastPreviewUrl ? 'display:block;' : 'display:none;'}">
                    <div id="dataset-sampler-flash" class="dataset-sampler-flash"></div>
                    <div id="dataset-sampler-hint" class="dataset-sampler-hint-overlay" style="${isCamRunning ? 'display:block;' : 'display:none;'}">
                        📷 ${cameraList.length > 0 ? escapeHTML(cameraList.find(c => c.id === selectedDeviceId)?.name || '攝影機') : '攝影機'} ${t('SAMPLER_CAMERA_READY', '已就緒 · 點擊拍攝快照')}
                    </div>
                </div>
                
                <div class="dataset-sampler-controls">
                    <div class="dataset-sampler-row">
                        <div id="dataset-sampler-camera-group" style="display: flex; align-items: center; gap: 5px; margin-bottom: 6px;">
                            <label style="display: flex; align-items: center; gap: 5px; margin-bottom: 0; font-size: 11px;">
                                <span>${t('SAMPLER_CAMERA', '📷 攝影機:')}</span>
                                <select id="dataset-sampler-camera-select" style="font-size: 11px; padding: 2px 4px;">
                                    ${cameraList.map(c => `<option value="${c.id}" ${c.id === selectedDeviceId ? 'selected' : ''}>${escapeHTML(c.name)}</option>`).join('')}
                                </select>
                            </label>
                            <button type="button" id="dataset-sampler-refresh-cameras" class="dataset-icon-btn" title="${t('SAMPLER_REFRESH_CAMERAS', '重新掃描攝影機')}" style="font-size: 14px;">🔄</button>
                        </div>
                    </div>
                    <div class="dataset-sampler-row">
                        <div id="dataset-sampler-label-group" style="display: flex; align-items: center; flex: 1;">
                            <label style="flex: 1; display: flex; align-items: center; gap: 5px; margin-bottom: 0;">
                                <span>${t('SAMPLER_LABEL', '標籤:')}</span>
                                <select id="dataset-sampler-label-select" style="flex: 1;">
                                    ${options.labels.map(l => `<option value="${escapeHTML(l)}" ${l === targetLabel ? 'selected' : ''}>${escapeHTML(l)}</option>`).join('')}
                                    ${options.labels.length === 0 ? '<option value="" disabled selected>' + t('SAMPLER_NO_LABEL', '請先新增標籤') + '</option>' : ''}
                                </select>
                            </label>
                            <button type="button" id="dataset-sampler-add-label-btn" class="dataset-icon-btn" title="${t('SAMPLER_ADD_LABEL', '新增標籤')}" style="margin-left: 5px; font-size: 18px;">+</button>
                        </div>

                        <div id="dataset-sampler-new-label-group" style="display: none; align-items: center; flex: 1; gap: 5px;">
                            <input type="text" id="dataset-sampler-new-label-input" placeholder="${t('SAMPLER_NEW_LABEL_PLACEHOLDER', '輸入新標籤名稱')}" style="flex: 1;">
                            <button type="button" id="dataset-sampler-new-label-confirm" class="dataset-icon-btn" style="color: #4CAF50;" title="${t('SAMPLER_CONFIRM', '確認')}">✔</button>
                            <button type="button" id="dataset-sampler-new-label-cancel" class="dataset-icon-btn" style="color: #F44336;" title="${t('SAMPLER_CANCEL', '取消')}">✘</button>
                        </div>

                        <button type="button" id="dataset-sampler-toggle-cam" class="${isCamRunning ? 'dataset-danger-btn' : 'dataset-primary-btn'}" style="margin-left: 8px;">
                            ${isCamRunning ? t('SAMPLER_STOP_CAM', '停止攝影機') : t('SAMPLER_START_CAM', '啟動預覽')}
                        </button>
                    </div>

                    <div id="dataset-sampler-main-actions" class="dataset-sampler-actions" 
                         style="${isCamRunning ? 'display:flex; visibility:visible; opacity:1;' : 'display:none; visibility:hidden; opacity:0;'}">
                        <button type="button" id="dataset-sampler-snapshot" class="dataset-primary-btn">${t('SAMPLER_SNAPSHOT', '📸 拍攝快照')}</button>
                        <button type="button" id="dataset-sampler-burst" class="dataset-secondary-btn">${t('SAMPLER_BURST', '⏯ 自動連拍')}</button>
                    </div>

                    <div id="dataset-sampler-settings" class="dataset-sampler-settings" style="${isCamRunning ? 'display:block;' : 'display:none;'}">
                        <span>${t('SAMPLER_INTERVAL', '間隔:')}</span>
                        <select id="dataset-sampler-interval">
                            <option value="200">0.2s</option>
                            <option value="500" selected>0.5s</option>
                            <option value="1000">1.0s</option>
                        </select>
                    </div>
                </div>
            </div>
        `;

        // 綁定內部事件
        const labelGroup = container.querySelector('#dataset-sampler-label-group');
        const labelSelect = container.querySelector('#dataset-sampler-label-select');
        const addLabelBtn = container.querySelector('#dataset-sampler-add-label-btn');
        
        const newLabelGroup = container.querySelector('#dataset-sampler-new-label-group');
        const newLabelInput = container.querySelector('#dataset-sampler-new-label-input');
        const confirmBtn = container.querySelector('#dataset-sampler-new-label-confirm');
        const cancelBtn = container.querySelector('#dataset-sampler-new-label-cancel');

        const toggleCamBtn = container.querySelector('#dataset-sampler-toggle-cam');
        const mainActions = container.querySelector('#dataset-sampler-main-actions');
        const settings = container.querySelector('#dataset-sampler-settings');
        const hint = container.querySelector('#dataset-sampler-hint');

        // 攝影機選擇與重新整理
        const cameraSelect = container.querySelector('#dataset-sampler-camera-select');
        const refreshCamerasBtn = container.querySelector('#dataset-sampler-refresh-cameras');

        if (cameraSelect) {
            cameraSelect.onchange = () => {
                const deviceId = parseInt(cameraSelect.value);
                Sampler.setCameraDevice(deviceId);
                console.log('[UIComponents] Camera device changed to:', deviceId);
            };
        }

        if (refreshCamerasBtn) {
            refreshCamerasBtn.onclick = async () => {
                refreshCamerasBtn.disabled = true;
                refreshCamerasBtn.textContent = '⏳';
                console.log('[UIComponents] Refreshing camera list...');
                const cameras = await Sampler.listCameras();
                if (cameraSelect) {
                    cameraSelect.innerHTML = cameras.map(c => 
                        `<option value="${c.id}" ${c.id === Sampler.state.selectedDeviceId ? 'selected' : ''}>${escapeHTML(c.name)}</option>`
                    ).join('');
                }
                refreshCamerasBtn.disabled = false;
                refreshCamerasBtn.textContent = '🔄';
            };
        }

        // 儲存進入新增模式前的標籤值，以便取消時還原
        let previousLabel = targetLabel;

        // 切換模式函式
        const setAddMode = (isAdd) => {
            labelGroup.style.display = isAdd ? 'none' : 'flex';
            newLabelGroup.style.display = isAdd ? 'flex' : 'none';
            if (isAdd) {
                // 進入新增模式時，記錄當前選擇的標籤
                previousLabel = labelSelect ? labelSelect.value : targetLabel;
                newLabelInput.value = '';
                newLabelInput.focus();
            } else {
                // 取消新增時，恢復到原來的標籤
                if (previousLabel && options.labels.indexOf(previousLabel) >= 0) {
                    labelSelect.value = previousLabel;
                    if (options.onLabelChange) options.onLabelChange(previousLabel);
                }
            }
        };

        addLabelBtn.onclick = () => setAddMode(true);
        cancelBtn.onclick = () => setAddMode(false);

        const handleAdd = () => {
            const val = newLabelInput.value.trim();
            if (val) {
                if (options.onLabelChange) options.onLabelChange(val);
                setAddMode(false);
            }
        };

        confirmBtn.onclick = handleAdd;
        newLabelInput.onkeydown = (e) => {
            if (e.key === 'Enter') handleAdd();
            if (e.key === 'Escape') {
                e.stopPropagation(); // 阻止冒泡到 modal 的全域 Escape 關閉
                setAddMode(false);
            }
        };

        toggleCamBtn.onclick = async () => {
            if (!Sampler.state.isCamRunning) {
                toggleCamBtn.disabled = true;
                toggleCamBtn.textContent = t('SAMPLER_STARTING', '啟動中...');
                const success = await options.onStartCamera();
                toggleCamBtn.disabled = false;
                
                if (success) {
                    toggleCamBtn.textContent = t('SAMPLER_STOP_CAM', '停止攝影機');
                    toggleCamBtn.className = 'dataset-danger-btn';
                    mainActions.style.display = 'flex';
                    mainActions.style.visibility = 'visible';
                    mainActions.style.opacity = '1';
                    settings.style.display = 'block';
                    hint.style.display = 'block';
                } else {
                    toggleCamBtn.textContent = t('SAMPLER_START_FAILED', '啟動失敗，再試一次');
                }
            } else {
                options.onStopCamera();
                toggleCamBtn.textContent = t('SAMPLER_START_CAM', '啟動預覽');
                toggleCamBtn.className = 'dataset-primary-btn';
                mainActions.style.display = 'none';
                mainActions.style.visibility = 'hidden';
                mainActions.style.opacity = '0';
                settings.style.display = 'none';
                hint.style.display = 'none';
            }
        };

        labelSelect.onchange = () => {
            if (options.onLabelChange) options.onLabelChange(labelSelect.value);
        };

        // [關鍵修正] 如果標籤清單為空，自動進入新增模式
        if (options.labels.length === 0) {
            setAddMode(true);
        }

        if (options.onSnapshot) {
            const snapshotBtn = container.querySelector('#dataset-sampler-snapshot');
            if (snapshotBtn) {
                snapshotBtn.onclick = () => {
                    console.log('[UIComponents] Snapshot button clicked');
                    UIComponents.triggerFlash(container);
                    options.onSnapshot();
                };
            }
        }

        if (options.onBurstToggle) {
            const burstBtn = container.querySelector('#dataset-sampler-burst');
            if (burstBtn) {
                burstBtn.onclick = (e) => {
                    console.log('[UIComponents] Burst toggle clicked');
                    const isBursting = options.onBurstToggle();
                    e.target.textContent = isBursting ? t('SAMPLER_STOP_BURST', '⏹ 停止連拍') : t('SAMPLER_BURST', '⏯ 自動連拍');
                    e.target.classList.toggle('dataset-danger-btn', isBursting);
                };
            }
        }
    },

    triggerFlash(container) {
        const flash = container.querySelector('#dataset-sampler-flash');
        if (flash) {
            flash.style.display = 'block';
            flash.style.opacity = '1';
            setTimeout(() => {
                flash.style.opacity = '0';
                setTimeout(() => { flash.style.display = 'none'; }, 200);
            }, 50);
        }
    },

    /**
     * 根據標籤名稱生成穩定的 HSL 顏色
     * @param {string} label 標籤名稱
     */
    getLabelColor(label) {
        if (!label || label === 'unlabeled') return '#999';

        // FNV-1a 32-bit hash：擴散佳，短/相近字串的 hash 差異大（避免 a/b/c 幾乎同色）
        let hash = 0x811c9dc5;
        for (let i = 0; i < label.length; i++) {
            hash ^= label.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        hash = hash >>> 0; // 轉無號 32-bit

        // 使用 HSL 確保顏色鮮艷且具辨識度
        // 黃金比例(137.508°)擴散色相：即使 hash 相近，色相也至少差約 137°，易分辨
        const h = Math.floor((hash * 137.508) % 360);
        const s = 65 + (hash % 20); // 65-85%
        const l = 40 + (hash % 15); // 40-55%

        return `hsl(${h}, ${s}%, ${l}%)`;
    }
};