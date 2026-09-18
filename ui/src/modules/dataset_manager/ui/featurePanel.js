/**
 * ui/featurePanel.js — feature 類型 live 特徵採集面板（M4，Phase 4）
 *
 * 沿用 samplerPanel 委派模式：由 ui_layout refreshDynamicPanels live 段調用，
 * 相機開關語意與 image 採集共用 Sampler（sidecar 自開 OpenCV 預覽視窗）。
 * feature 採集不走拍照落盤，改為：相機幀 → sidecar collectFeature 提取 Hand/Pose
 * landmarks → 前端經 core/featureSchema.js 組 row → 依標籤累計進 state.tableRows
 * （表格樣本），並以 buildFeatureSchema 動態建立 schema.columns。
 *
 * 依賴全注入，無模組級全域耦合，Node 可測。
 */

export const FEATURE_DOM_CAMERA_SELECT = 'feature-camera-select';
export const FEATURE_DOM_TOGGLE_CAM = 'feature-toggle-cam';
export const FEATURE_DOM_LABEL_SELECT = 'feature-label-select';
export const FEATURE_DOM_USE_Z = 'feature-use-z';
export const FEATURE_DOM_COLLECT = 'feature-collect';
export const FEATURE_DOM_STATUS = 'feature-status';

export function createFeaturePanel({
    state, datasetBridge, t,
    Sampler, UIComponents, escapeHtml,
    FEATURE_MEDIAPIPE_MISSING,
    buildFeatureSchema, landmarksToRow,
    nextLabelId,
    onFeatureCollected,
    renderTablePreview,
    refreshStructurePanel
}) {
    let currentUseZ = false;

    function buildDom(labels, targetLabel, cameraScanning) {
        const camOptions = cameraScanning
            ? '<option value="" disabled selected>' + escapeHtml(t('SAMPLER_SCANNING', '⏳ 掃描攝影機中...')) + '</option>'
            : Sampler.state.cameraList.map((c) =>
            '<option value="' + c.id + '"' + (c.id === Sampler.state.selectedDeviceId ? ' selected' : '') + '>'
            + escapeHtml(c.name) + '</option>'
        ).join('');
        const labelOptions = labels.map((l) =>
            '<option value="' + escapeHtml(l) + '"' + (l === targetLabel ? ' selected' : '') + '>'
            + escapeHtml(l) + '</option>'
        ).join('');

        return '<div class="dataset-sampler-container">'
            + '<div id="' + FEATURE_DOM_STATUS + '" class="dataset-feature-status">'
            + escapeHtml(t('FEATURE_PANEL_HINT', '啟動攝影機後，點「擷取特徵點」依目前標籤累計一筆樣本（MediaPipe Hand/Pose 關鍵點）'))
            + '</div>'
            + '<div class="dataset-sampler-controls">'
            + '<div class="dataset-sampler-row">'
            + '<label style="display:flex;align-items:center;gap:5px;margin-bottom:0;font-size: calc(11px * var(--dsm-font-scale, 1));">'
            + '<span>' + t('SAMPLER_CAMERA', '📷 攝影機:') + '</span>'
            + '<select id="' + FEATURE_DOM_CAMERA_SELECT + '" style="font-size: calc(11px * var(--dsm-font-scale, 1));padding:2px 4px;">' + camOptions + '</select>'
            + '</label>'
            + '<button type="button" id="feature-refresh-cameras" class="dataset-icon-btn" title="'
            + escapeHtml(t('SAMPLER_REFRESH_CAMERAS', '重新掃描攝影機')) + '" style="font-size: calc(14px * var(--dsm-font-scale, 1));">🔄</button>'
            + '</div>'
            + '<div class="dataset-sampler-row">'
            + '<button type="button" id="' + FEATURE_DOM_TOGGLE_CAM + '" class="dataset-primary-btn">'
            + t('SAMPLER_START_CAM', '啟動預覽') + '</button>'
            + '</div>'
            + '<div class="dataset-sampler-row">'
            + '<label style="display:flex;align-items:center;gap:5px;margin-bottom:0;flex:1;">'
            + '<span>' + t('SAMPLER_LABEL', '標籤:') + '</span>'
            + '<select id="' + FEATURE_DOM_LABEL_SELECT + '" style="flex:1;">'
            + (labelOptions || '<option value="" disabled selected>' + escapeHtml(t('SAMPLER_NO_LABEL', '請先新增標籤')) + '</option>')
            + '</select>'
            + '</label>'
            + '</div>'
            + '<div class="dataset-sampler-row">'
            + '<label style="display:flex;align-items:center;gap:5px;margin-bottom:0;font-size: calc(11px * var(--dsm-font-scale, 1));">'
            + '<input type="checkbox" id="' + FEATURE_DOM_USE_Z + '"> '
            + '<span>' + t('FEATURE_USE_Z', '包含 z 座標（維度較高，含深度）') + '</span>'
            + '</label>'
            + '</div>'
            + '<div class="dataset-sampler-row">'
            + '<button type="button" id="' + FEATURE_DOM_COLLECT + '" class="dataset-primary-btn">'
            + t('FEATURE_COLLECT', '🧬 擷取特徵點') + '</button>'
            + '</div>'
            + '</div>'
            + '</div>';
    }
    function bind(modal, view, labels) {
        const cameraSelect = view.querySelector('#' + FEATURE_DOM_CAMERA_SELECT);
        const refreshBtn = view.querySelector('#feature-refresh-cameras');
        const toggleBtn = view.querySelector('#' + FEATURE_DOM_TOGGLE_CAM);
        const labelSelect = view.querySelector('#' + FEATURE_DOM_LABEL_SELECT);
        const useZCheck = view.querySelector('#' + FEATURE_DOM_USE_Z);
        const collectBtn = view.querySelector('#' + FEATURE_DOM_COLLECT);
        const statusEl = view.querySelector('#' + FEATURE_DOM_STATUS);

        if (cameraSelect) {
            cameraSelect.onchange = () => { Sampler.setCameraDevice(parseInt(cameraSelect.value, 10)); };
        }
        if (refreshBtn) {
            refreshBtn.onclick = async () => {
                refreshBtn.disabled = true;
                refreshBtn.textContent = '⏳';
                const cams = await Sampler.listCameras();
                if (cameraSelect) cameraSelect.innerHTML = cams.map((c) =>
                    '<option value="' + c.id + '"' + (c.id === Sampler.state.selectedDeviceId ? ' selected' : '') + '>'
                    + escapeHtml(c.name) + '</option>').join('');
                refreshBtn.disabled = false;
                refreshBtn.textContent = '🔄';
            };
        }

        toggleBtn.onclick = async () => {
            const isRunning = Sampler.state.isCamRunning;
            if (!isRunning) {
                toggleBtn.disabled = true;
                toggleBtn.textContent = t('SAMPLER_STARTING', '啟動中...');
                const ok = await Sampler.startCamera(Sampler.state.selectedDeviceId);
                toggleBtn.disabled = false;
                if (ok) {
                    toggleBtn.textContent = t('SAMPLER_STOP_CAM', '停止攝影機');
                    toggleBtn.className = 'dataset-danger-btn';
                    setStatus(statusEl, 'ok', t('FEATURE_CAM_READY', '📷 相機預覽已開啟，可開始擷取特徵點'));
                } else {
                    toggleBtn.textContent = t('SAMPLER_START_FAILED', '啟動失敗，再試一次');
                }
            } else {
                Sampler.stopCamera(true);
                toggleBtn.textContent = t('SAMPLER_START_CAM', '啟動預覽');
                toggleBtn.className = 'dataset-primary-btn';
            }
        };

        if (labelSelect) {
            labelSelect.onchange = () => {
                const l = labelSelect.value;
                rebuildLabelMap(modal, l);
                refreshLabelSelect(view, Object.keys(state.spec.toJSON().schema.label_map || {}), l);
            };
        }

        // P2：新增/改名/刪除標籤收斂至中欄統一標籤管理器；此處僅保留標籤「選取」下拉，
        // 無標籤時下拉為「請先於【標籤與樣本統計】面板新增標籤」佔位（見 buildDom）。

        if (collectBtn) {
            collectBtn.onclick = () => collect(modal, view, labelSelect, useZCheck, statusEl, collectBtn);
        }
    }
    function setStatus(el, kind, text) {
        if (!el) return;
        el.className = 'dataset-feature-status ' + (kind === 'ok' ? 'is-ok' : (kind === 'err' ? 'is-err' : ''));
        el.textContent = text;
    }

    function addLabelToMap(modal, label) {
        const map = state.spec.toJSON().schema.label_map || {};
        if (map[label] === undefined) {
            map[label] = nextLabelId(map);
            state.spec.updateSchema({ label_map: map });
        }
    }

    function rebuildLabelMap(modal, label) {
        addLabelToMap(modal, label);
        // P2：重建結構面板（統一標籤管理器＋統計），取代「renderLabelStats 覆寫
        // structure innerHTML」舊行為（會沖掉中欄統一標籤管理器 DOM）
        if (typeof refreshStructurePanel === 'function') refreshStructurePanel();
    }

    function refreshLabelSelect(view, updatedLabels, selected) {
        const select = view.querySelector('#' + FEATURE_DOM_LABEL_SELECT);
        if (!select) return;
        select.innerHTML = updatedLabels.map((l) =>
            '<option value="' + escapeHtml(l) + '"' + (l === selected ? ' selected' : '') + '>'
            + escapeHtml(l) + '</option>').join('');
    }

    async function collect(modal, view, labelSelect, useZCheck, statusEl, collectBtn) {
        const label = (labelSelect && labelSelect.value) || '';
        if (!label) {
            setStatus(statusEl, 'err', t('FEATURE_NO_LABEL', '請先新增並選擇一個標籤'));
            return;
        }
        const useZ = useZCheck ? useZCheck.checked : false;

        if (state.tableRows.length > 0 && useZ !== currentUseZ) {
            setStatus(statusEl, 'err', t('FEATURE_USEZ_LOCKED', '⚠️ 已採集樣本，無法切換是否含 z；請清除樣本或改用 file 模式匯入'));
            useZCheck.checked = currentUseZ;
            return;
        }

        collectBtn.disabled = true;
        setStatus(statusEl, '', t('STATUS_CAPTURETING', '📸 正在提取特徵點...'));
        try {
            const { promise } = datasetBridge.request({
                command: 'datasetCollectFeature',
                payload: { label, useZ },
                resultCommand: 'datasetCollectFeatureResult',
                timeoutMs: 20000
            });
            const msg = await promise;
            if (!msg.success) {
                if (msg.errorCode === FEATURE_MEDIAPIPE_MISSING) {
                    setStatus(statusEl, 'err', t('FEATURE_MEDIAPIPE_MISSING', '❌ MediaPipe 未安裝，無法啟用 live 特徵採集；請改用 file 匯入或安裝 mediapipe'));
                } else {
                    setStatus(statusEl, 'err', t('FEATURE_COLLECT_FAILED', '❌ 擷取特徵點失敗: %1').replace('%1', msg.error || ''));
                }
                return;
            }
            currentUseZ = useZ;
            const row = landmarksToRow({ hand: msg.hand, pose: msg.pose, label: msg.label || label, useZ });
            const schema = buildFeatureSchema({ useZ });
            if (onFeatureCollected) {
                onFeatureCollected({ row, useZ, schema, handDetected: msg.handDetected, poseDetected: msg.poseDetected });
            }
            const statusText = []
                .concat(msg.handDetected ? t('FEATURE_HAND', '手部 ✓') : t('FEATURE_NO_HAND', '手部 ✕'))
                .concat(msg.poseDetected ? t('FEATURE_POSE', '姿勢 ✓') : t('FEATURE_NO_POSE', '姿勢 ✕'))
                .join(' · ');
            setStatus(statusEl, 'ok', t('FEATURE_COLLECTED', '✅ 已累計 1 筆（%1）').replace('%1', statusText));
        } catch (e) {
            setStatus(statusEl, 'err', t('FEATURE_COLLECT_FAILED', '❌ 擷取特徵點失敗: %1').replace('%1', e.message || e));
        } finally {
            collectBtn.disabled = false;
        }
    }

    function setupFeatureLiveView(modal, view) {
        if (!view) return;
        view.style.display = 'block';
        const labels = Object.keys(state.spec.toJSON().schema.label_map || {});
        currentUseZ = false;
        view.innerHTML = buildDom(labels, labels.length ? labels[0] : '', Sampler.state.cameraList.length === 0);
        bind(modal, view, labels);
        if (Sampler.state.cameraList.length === 0) {
            // 背景列舉完成後只補下拉選單（不重建整面，避免焦點跳動＋閉包失效）
            refreshCameraSelect(view, Promise.resolve(Sampler.listCameras()));
        }
    }

    function refreshCameraSelect(view, camsPromise) {
        return camsPromise.then((cams) => {
            const sel = view.querySelector ? view.querySelector('#' + FEATURE_DOM_CAMERA_SELECT) : null;
            if (!sel) return;
            sel.innerHTML = (cams || []).map((cm) =>
                '<option value="' + cm.id + '"'
                + (cm.id === Sampler.state.selectedDeviceId ? ' selected' : '') + '>'
                + escapeHtml(cm.name) + '</option>').join('');
            sel.disabled = false;
        }).catch(() => {
            const sel = view.querySelector ? view.querySelector('#' + FEATURE_DOM_CAMERA_SELECT) : null;
            if (sel) sel.disabled = false;
        });
    }

    return { setupFeatureLiveView, refreshCameraSelect };
}
