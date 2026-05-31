/**
 * Dataset Manager UI Components
 * 負責渲染動態面板內容 (影像網格、欄位表格等)
 */
import { Sampler } from './sampler.js';

function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
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
            container.innerHTML = '<div class="dataset-empty-state">尚無影像資料</div>';
            return;
        }

        container.innerHTML = `
            <div class="dataset-image-grid">
                ${images.map((img, index) => {
                    const label = img.label || 'unlabeled';
                    const color = this.getLabelColor(label);
                    return `
                    <div class="dataset-image-item" data-index="${index}" title="${escapeHTML(img.path)}">
                        <div class="dataset-image-thumb">
                            ${img.blobUrl ? `<img src="${img.blobUrl}" loading="lazy">` : '<div class="dataset-thumb-placeholder">?</div>'}
                        </div>
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
            container.querySelectorAll('.dataset-image-item').forEach(item => {
                item.onclick = () => {
                    const index = parseInt(item.dataset.index);
                    options.onImageClick(images[index], index);
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
        const labels = Object.keys(counts);

        if (labels.length === 0) {
            container.innerHTML = '<div class="dataset-empty-state">尚未偵測到標籤</div>';
            return;
        }

        container.innerHTML = `
            <div class="dataset-label-stats">
                <div class="dataset-label-head">
                    <span>標籤名稱</span>
                    <span>樣本數</span>
                    <span>顏色</span>
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

        const { isCamRunning, lastPreviewUrl, targetLabel } = Sampler.state;

        container.innerHTML = `
            <div class="dataset-sampler-container">
                <div class="dataset-sampler-video-wrapper">
                    <div id="dataset-sampler-placeholder" class="dataset-sampler-placeholder" style="${lastPreviewUrl ? 'display:none;' : ''}">
                        <div class="dataset-sampler-icon">📷</div>
                        <div class="dataset-sampler-text">等待採集影像...</div>
                    </div>
                    <img id="dataset-sampler-last-preview" class="dataset-sampler-last-img" 
                         src="${lastPreviewUrl || ''}" 
                         style="${lastPreviewUrl ? 'display:block;' : 'display:none;'}">
                    <div id="dataset-sampler-flash" class="dataset-sampler-flash"></div>
                    <div id="dataset-sampler-hint" class="dataset-sampler-hint-overlay" style="${isCamRunning ? 'display:block;' : 'display:none;'}">
                        原生預覽已開啟
                    </div>
                </div>
                
                <div class="dataset-sampler-controls">
                    <div class="dataset-sampler-row">
                        <div id="dataset-sampler-label-group" style="display: flex; align-items: center; flex: 1;">
                            <label style="flex: 1; display: flex; align-items: center; gap: 5px; margin-bottom: 0;">
                                <span>標籤:</span>
                                <select id="dataset-sampler-label-select" style="flex: 1;">
                                    ${options.labels.map(l => `<option value="${escapeHTML(l)}" ${l === targetLabel ? 'selected' : ''}>${escapeHTML(l)}</option>`).join('')}
                                    ${options.labels.length === 0 ? '<option value="" disabled selected>請先新增標籤</option>' : ''}
                                </select>
                            </label>
                            <button type="button" id="dataset-sampler-add-label-btn" class="dataset-icon-btn" title="新增標籤" style="margin-left: 5px; font-size: 18px;">+</button>
                        </div>

                        <div id="dataset-sampler-new-label-group" style="display: none; align-items: center; flex: 1; gap: 5px;">
                            <input type="text" id="dataset-sampler-new-label-input" placeholder="輸入新標籤名稱" style="flex: 1;">
                            <button type="button" id="dataset-sampler-new-label-confirm" class="dataset-icon-btn" style="color: #4CAF50;" title="確認">✔</button>
                            <button type="button" id="dataset-sampler-new-label-cancel" class="dataset-icon-btn" style="color: #F44336;" title="取消">✘</button>
                        </div>

                        <button type="button" id="dataset-sampler-toggle-cam" class="${isCamRunning ? 'dataset-danger-btn' : 'dataset-primary-btn'}" style="margin-left: 8px;">
                            ${isCamRunning ? '停止攝影機' : '啟動預覽'}
                        </button>
                    </div>

                    <div id="dataset-sampler-main-actions" class="dataset-sampler-actions" 
                         style="${isCamRunning ? 'display:flex; visibility:visible; opacity:1;' : 'display:none; visibility:hidden; opacity:0;'}">
                        <button type="button" id="dataset-sampler-snapshot" class="dataset-primary-btn">📸 拍攝快照</button>
                        <button type="button" id="dataset-sampler-burst" class="dataset-secondary-btn">⏯ 自動連拍</button>
                    </div>

                    <div id="dataset-sampler-settings" class="dataset-sampler-settings" style="${isCamRunning ? 'display:block;' : 'display:none;'}">
                        <span>間隔:</span>
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

        // 切換模式函式
        const setAddMode = (isAdd) => {
            labelGroup.style.display = isAdd ? 'none' : 'flex';
            newLabelGroup.style.display = isAdd ? 'flex' : 'none';
            if (isAdd) {
                newLabelInput.value = '';
                newLabelInput.focus();
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
            if (e.key === 'Escape') setAddMode(false);
        };

        toggleCamBtn.onclick = async () => {
            if (!Sampler.state.isCamRunning) {
                toggleCamBtn.disabled = true;
                toggleCamBtn.textContent = '啟動中...';
                const success = await options.onStartCamera();
                toggleCamBtn.disabled = false;
                
                if (success) {
                    toggleCamBtn.textContent = '停止攝影機';
                    toggleCamBtn.className = 'dataset-danger-btn';
                    mainActions.style.display = 'flex';
                    mainActions.style.visibility = 'visible';
                    mainActions.style.opacity = '1';
                    settings.style.display = 'block';
                    hint.style.display = 'block';
                } else {
                    toggleCamBtn.textContent = '啟動失敗，再試一次';
                }
            } else {
                options.onStopCamera();
                toggleCamBtn.textContent = '啟動攝影機預覽';
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
                    e.target.textContent = isBursting ? '⏹ 停止連拍' : '⏯ 自動連拍';
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
        
        let hash = 0;
        for (let i = 0; i < label.length; i++) {
            hash = label.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        // 使用 HSL 確保顏色鮮艷且具辨識度
        const h = Math.abs(hash % 360);
        const s = 65 + (Math.abs(hash % 20)); // 65-85%
        const l = 40 + (Math.abs(hash % 15)); // 40-55%
        
        return `hsl(${h}, ${s}%, ${l}%)`;
    }
};
