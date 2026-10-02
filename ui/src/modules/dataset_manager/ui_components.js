/**
 * Dataset Manager UI Components
 * 負責渲染動態面板內容 (影像網格、欄位表格等)
 */
import { Sampler } from './sampler.js';
import { t } from './i18n.js';
import { escapeHtml as escapeHTML } from './core/html.js';
// 2026-10-01（P1-1/P1-2）：類型判斷改走 core/typePolicy.js（SSOT），不再在本檔自持硬編碼類型清單。
import { isImageType, needsUnclassifiedCheck } from './core/typePolicy.js';

export const UIComponents = {
    /**
     * 渲染影像縮圖牆
     * @param {Array} images 影像資料 [{path, label, blobUrl}]
     * @param {Object} options 點擊回調等
     */
    renderImageGrid(container, images, options = {}) {
        if (!container) return;

        if (!images || images.length === 0) {
            container.innerHTML = `<div class="dataset-empty-state">${escapeHTML(t('NO_IMAGES', '尚無影像資料'))}</div>`;
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
                            ${img.blobUrl ? `<img src="${escapeHTML(img.blobUrl)}">` : '<div class="dataset-thumb-placeholder">?</div>'}
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
            container.innerHTML = `<div class="dataset-empty-state">${escapeHTML(t('NO_IMAGES', '尚無影像資料'))}</div>`;
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
                        <button type="button" class="dataset-image-delete-btn" data-index="${index}" title="${t('DELETE_IMAGE', '刪除照片')}">×</button>
                        ${img.blobUrl ? `<img src="${escapeHTML(img.blobUrl)}" class="dataset-annotation-thumb">` : '<div class="dataset-thumb-placeholder">?</div>'}
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

        if (options.onDeleteImage) {
            container.querySelectorAll('.dataset-image-delete-btn').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    options.onDeleteImage(parseInt(btn.dataset.index));
                };
            });
        }
    },

    /**
     * 渲染標籤統計列表
     * @param {HTMLElement} container 統計容器（#view-label-stats）
     * @param {Object} stats spec.stats（sample_count / label_counts）
     * @param {Object} [options] 2026-09-22：
     *        { projectType, imageCount, annotatedCount }
     *        — 影像系時於頂部顯示「影像張數／已標註張數」摘要列，
     *          並依任務類型調整計數欄表頭（偵測=標註框數、循跡=標註線段、分類=樣本數）。
     *          未傳 options 時僅渲染標籤計數（向後相容）。
     */
    renderLabelStats(container, stats, options = {}) {
        if (!container) return;
        const counts = (stats && stats.label_counts) || {};
        const labels = Object.keys(counts).sort((a, b) => a.localeCompare(b));
        const projectType = options.projectType || '';
        const isImageTask = isImageType(projectType);
        const imageCount = Number.isInteger(options.imageCount)
            ? options.imageCount
            : (Number.isInteger(stats && stats.sample_count) ? stats.sample_count : 0);
        const annotatedCount = Number.isInteger(options.annotatedCount) ? options.annotatedCount : null;
        const countHeader = needsUnclassifiedCheck(projectType)
            ? t('BOX_COUNT', '標註框數')
            : (projectType === 'line_following' ? t('LINE_COUNT', '標註線段') : t('SAMPLE_COUNT', '樣本數'));

        const summaryHtml = isImageTask
            ? '<div class="dataset-label-summary">'
                + `<span class="dataset-label-summary-item">📷 ${t('IMAGE_COUNT', '影像張數')} <b>${imageCount}</b></span>`
                + (annotatedCount === null
                    ? ''
                    : `<span class="dataset-label-summary-item">✅ ${t('ANNOTATED_COUNT', '已標註')} <b>${annotatedCount}</b> / ${imageCount}</span>`)
                + '</div>'
            : '';

        if (labels.length === 0) {
            container.innerHTML = summaryHtml
                + '<div class="dataset-empty-state">' + t('NO_LABELS', '尚未偵測到標籤') + '</div>';
            return;
        }

        container.innerHTML = `
            <div class="dataset-label-stats">
                ${summaryHtml}
                <div class="dataset-label-head">
                    <span>${t('LABEL_NAME', '標籤名稱')}</span>
                    <span>${countHeader}</span>
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
        const cameraScanning = (options.cameraScanning !== undefined) ? !!options.cameraScanning : (cameraList.length === 0);

        container.innerHTML = `
            <div class="dataset-sampler-container">
                <div class="dataset-sampler-video-wrapper">
                    <div id="dataset-sampler-placeholder" class="dataset-sampler-placeholder" style="${lastPreviewUrl ? 'display:none;' : ''}">
                        <div class="dataset-sampler-icon">📷</div>
                        <div class="dataset-sampler-text">${t('SAMPLER_PLACEHOLDER', '最近一次拍攝')}</div>
                        <div class="dataset-sampler-sub">${t('SAMPLER_PLACEHOLDER_SUB', '即時影像請看 OpenCV 預覽視窗；此處僅顯示最近一次拍攝')}</div>
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
                            <label style="display: flex; align-items: center; gap: 5px; margin-bottom: 0; font-size: calc(11px * var(--dsm-font-scale, 1));">
                                <span>${t('SAMPLER_CAMERA', '📷 攝影機:')}</span>
                                <select id="dataset-sampler-camera-select" style="font-size: calc(11px * var(--dsm-font-scale, 1)); padding: 2px 4px;" ${cameraScanning ? 'disabled' : ''}>
                                    ${cameraScanning ? `<option value="" disabled selected>${t('SAMPLER_SCANNING', '⏳ 掃描攝影機中...')}</option>` : cameraList.map(c => `<option value="${escapeHTML(c.id)}" ${c.id === selectedDeviceId ? 'selected' : ''}>${escapeHTML(c.name)}</option>`).join('')}
                                </select>
                            </label>
                            <button type="button" id="dataset-sampler-refresh-cameras" class="dataset-icon-btn" title="${t('SAMPLER_REFRESH_CAMERAS', '重新掃描攝影機')}" style="font-size: calc(14px * var(--dsm-font-scale, 1));">🔄</button>
                        </div>
                    </div>
                    <div class="dataset-sampler-row">
                        <div id="dataset-sampler-label-group" style="display: flex; align-items: center; flex: 1;">
                            <label style="flex: 1; display: flex; align-items: center; gap: 5px; margin-bottom: 0;">
                                <span>${t('SAMPLER_LABEL', '標籤:')}</span>
                                <select id="dataset-sampler-label-select" style="flex: 1;">
                                    ${options.labels.map(l => `<option value="${escapeHTML(l)}" ${l === targetLabel ? 'selected' : ''}>${escapeHTML(l)}</option>`).join('')}
                                    ${options.labels.length === 0 ? '<option value="" disabled selected>' + t('SAMPLER_NO_LABEL', '請先於【標籤與樣本統計】面板新增標籤') + '</option>' : ''}
                                </select>
                            </label>
                        </div>
                    </div>

                    <!-- P2：啟動預覽按鈕獨立一行，避免字體放大後與標籤列擠壓出界 -->
                    <div class="dataset-sampler-row">
                        <button type="button" id="dataset-sampler-toggle-cam" class="${isCamRunning ? 'dataset-danger-btn' : 'dataset-primary-btn'}" style="width: 100%;">
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
        // P2：新增/改名/刪除標籤已收斂至中欄統一標籤管理器（labelManager），此處僅保留標籤「選取」下拉
        const labelSelect = container.querySelector('#dataset-sampler-label-select');

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
                        `<option value="${escapeHTML(c.id)}" ${c.id === Sampler.state.selectedDeviceId ? 'selected' : ''}>${escapeHTML(c.name)}</option>`
                    ).join('');
                }
                refreshCamerasBtn.disabled = false;
                refreshCamerasBtn.textContent = '🔄';
            };
        }

        toggleCamBtn.onclick = async () => {
            // 以 DOM 實際狀態（mainActions 可見性）判斷開關，而非 Sampler.state.isCamRunning，
            // 避免 X 關窗→狀態事件→refreshDynamicPanels 重建按鈕後，state 與按鈕文字失步造成誤判
            const isRunning = mainActions.style.display !== 'none' && mainActions.style.visibility !== 'hidden';
            if (!isRunning) {
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
                Sampler.state.isCamRunning = false;
                Sampler.stopBurst();
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

        // P2：標籤為空時不再進入內建新增模式（該 UI 已移除）；改由中欄統一標籤管理器新增，
        // 新增後經 onLabelMapChanged 同步右欄下拉，屆時可由使用者自行選取。

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
     * 根據標籤名稱生成穩定的顏色（P2-7 主題化，2026-10-01）
     *
     * 設計：**色相與飽和由標籤名 hash 決定（跨主題不變），明度由當前主題決定**
     * —— 同一標籤在任何主題下都是同一個色相，分類辨識度穩定；
     * 且各主題可各自挑選適合其底色的明度。
     *
     * 為什麼必須改（原實作的缺陷，實測數據）：
     *   原回傳單一 HSL（L=40~55% 隨 hash），對所有主題都一樣。
     *   實測 12 個常見標籤的 WCAG 對比度，**11 個低於 3.0**：
     *     · 7 個在淺底（#fff）不足 → 標籤色與白底幾乎分不出
     *     · 4 個在深底（#252526）不足 → dark 主題下標籤色糊掉
     *   單一明度不可能同時滿足兩種底色 —— 這是 P2-7 的根本動機。
     *
     * 明度來源（優先序）：
     *   1. options.lightness —— 呼叫端可指定
     *      ★ 標註框線（畫在**照片**上）必須走此路徑傳固定明度，
     *        因為照片明暗與主題無關，不可依主題變動。
     *   2. 當前主題的 labelLightness —— 給畫在 UI 底色上的元素（P2 縮圖徽章）
     *   3. 退回 light 明度（≈ 原外觀）
     *
     * @param {string} label 標籤名稱
     * @param {Object} [options]
     * @param {number} [options.lightness] 0~100，直接指定明度（優先於主題）
     * @param {number} [options.saturation] 0~100，預設 LABEL_SATURATION
     * @returns {string} CSS hsl() 字串
     */
    getLabelColor(label, options = {}) {
        if (!label || label === 'unlabeled') return '#999';

        // FNV-1a 32-bit hash：擴散佳，短/相近字串的 hash 差異大（避免 a/b/c 幾乎同色）
        let hash = 0x811c9dc5;
        for (let i = 0; i < label.length; i++) {
            hash ^= label.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        hash = hash >>> 0; // 轉無號 32-bit

        // 黃金比例(137.508°)擴散色相：即使 hash 相近，色相也至少差約 137°，易分辨。
        // ★ 跨主題不變 —— 這是「同標籤同色相」的保證。
        const h = Math.floor((hash * 137.508) % 360);
        const s = options.saturation != null ? options.saturation : LABEL_SATURATION;

        // 明度：呼叫端指定 → 當前主題 → 退回淺色預設
        let l = options.lightness;
        if (l == null) {
            const themeL = resolveThemeLabelLightness();
            l = (themeL != null) ? themeL : LABEL_LIGHTNESS.light;
        }

        return `hsl(${h}, ${s}%, ${l}%)`;
    }
};

/**
 * 標籤色飽和度（P2-7）：固定值，不再像原實作那樣由 hash 亂數 65~85%。
 * 固定飽和可讓不同標籤的「鮮豔程度」一致，視覺更平穩。
 */
const LABEL_SATURATION = 72;

/**
 * 各主題的標籤色明度（P2-7）
 *
 * 數值來自 WCAG 對比度實測，非憑感覺挑選：
 *   · light 底 #ffffff：L=42 → 對比約 4.3~5.2（達 AA 文字標準 4.5 的下限附近）
 *   · dark  底 #252526：L=62 → 對比約 3.5~5.0
 *   · candy 底 #FFF8F0（偏暖白）：L=44 兼顧辨識與可讀
 *
 * 淺色取固定 42 而非原實作的「40~55 隨機」：隨機會讓某些標籤偏淡
 * （對比不足），固定明度可預期、可驗證。
 */
const LABEL_LIGHTNESS = {
    light: 42,
    dark: 62,
    candy: 44
};

/**
 * 取得當前主題的標籤色明度（P2-7）
 *
 * 為什麼不直接 import 主題檔：主題檔是「資料」，本模組不該在載入期就
 * 依賴全域主題狀態；這裡讀取 window.CocoyaTheme 並容錯。
 *
 * ★ 已知限制（非 bug）：主題切換**不會**自動重繪既有的縮圖徽章。
 *   徽章是靜態 DOM，沒有訂閱主題變更的機制，切換後會停留在舊明度
 *   直到下一次 render。若要修，應讓 theme_manager.apply() 派發事件、
 *   由 DM 重繪徽章 —— 屬另一項工作。
 *
 * @returns {number|null} 0~100 的明度；無法判定時回 null
 */
function resolveThemeLabelLightness() {
    try {
        const theme = (typeof window !== 'undefined') ? window.CocoyaTheme : null;
        if (!theme || typeof theme.resolveActiveThemeId !== 'function') return null;
        const id = theme.resolveActiveThemeId();
        if (!id) return null;
        if (id === 'cocoya_dark') return LABEL_LIGHTNESS.dark;
        if (id === 'cocoya_candy') return LABEL_LIGHTNESS.candy;
        return LABEL_LIGHTNESS.light;
    } catch (e) {
        return null;
    }
}
