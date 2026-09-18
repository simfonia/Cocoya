/**
 * ui/samplerPanel.js — live 採集面板編排（M2，R6）
 * 自 ui_layout.js refreshDynamicPanels live 段原地抽出，行為語意不變。
 * 職責：預設選取首標籤、綁定 onSampleCaptured、列舉攝影機、
 * renderSamplerView（含 onLabelChange 手動補 label_map＋統計＋dropdown 重建＋預覽刷新）。
 * 相機開關語意（DOM 真值＋stopCamera(true)）由 renderSamplerView 持有，本模組不碰。
 * P2：結構面板重繪委派 refreshStructurePanel（ui_layout 注入），不再覆寫 innerHTML
 *      以免沖掉中欄統一標籤管理器；採集面板僅保留標籤「選取」下拉。
 * 依賴全注入，無模組級全域耦合，Node 可測。
 */
export function createSamplerPanel({
    state, Sampler, UIComponents,
    updateStatsFromImages, refreshPreview, refreshStructurePanel,
    onSnapshot, onBurstToggle, onStartCamera, onStopCamera, onSampleCaptured,
    nextLabelId
}) {
    function setupLiveSamplerView(modal, samplerView) {
        samplerView.style.display = 'block';

        const labels = Object.keys(state.spec.toJSON().schema.label_map || {});
        // 移除自動推入 label_1，改為讓使用者手動新增標籤

        // [關鍵修正] 如果目前沒有選定標籤且有現成標籤，預設選取第一個
        if (!Sampler.state.targetLabel && labels.length > 0) {
            Sampler.setTargetLabel(labels[0]);
        }

        // [關鍵修正] 綁定採集回調，讓連拍也能觸發 UI 更新
        Sampler.state.onSampleCaptured = (blob, label, savePath) => {
            onSampleCaptured(blob, savePath);
        };

        const renderOpts = {
            labels,
            onLabelChange: (l) => handleSamplerLabelChange(modal, samplerView, l),
            onSnapshot,
            onBurstToggle,
            onStartCamera,
            onStopCamera,
            cameraScanning: Sampler.state.cameraList.length === 0
        };
        UIComponents.renderSamplerView(samplerView, renderOpts);

        // 自動列舉可用攝影機：先渲染「掃描中」佔位，背景掃完後只補下拉選單
        // （listCameras 逐 index 試開需 3~5s，不可阻塞首次渲染；回來後若面板已被重建則放棄補寫）
        if (Sampler.state.cameraList.length === 0) {
            // 背景列舉完成後只補下拉選單（不重建整面，避免焦點跳動＋閉包失效）
            refreshCameraSelect(samplerView, Promise.resolve(Sampler.listCameras()));
        }
    }

    function refreshCameraSelect(view, camsPromise) {
        return camsPromise.then((cams) => {
            const sel = view.querySelector
                ? view.querySelector('#dataset-sampler-camera-select')
                : null;
            if (!sel) return;
            sel.innerHTML = (cams || []).map((c) =>
                '<option value="' + c.id + '"'
                + (c.id === Sampler.state.selectedDeviceId ? ' selected' : '') + '>'
                + c.name + '</option>'
            ).join('');
            sel.disabled = false;
        }).catch(() => {
            const sel = view.querySelector
                ? view.querySelector('#dataset-sampler-camera-select')
                : null;
            if (sel) sel.disabled = false;
        });
    }

    function handleSamplerLabelChange(modal, samplerView, l) {
        Sampler.setTargetLabel(l);

        // [關鍵修正] 如果是新標籤且尚未存在於 spec 中，手動加入 label_map
        // （正常流程下只會選到既有標籤；保留以相容外部呼叫）
        const spec = state.spec.toJSON();
        const labelMap = spec.schema.label_map || {};
        let added = false;
        if (labelMap[l] === undefined) {
            labelMap[l] = nextLabelId(labelMap);
            state.spec.updateSchema({ label_map: labelMap });
            added = true;
        }

        if (added) {
            // 重新以 label_map 為權威計算統計，確保新標籤/改名即時反映
            updateStatsFromImages();
            // P2：重建結構面板（統一標籤管理器＋統計），取代「renderLabelStats 覆寫
            // structureContent innerHTML」舊行為（會沖掉中欄統一標籤管理器 DOM）
            if (typeof refreshStructurePanel === 'function') refreshStructurePanel();
        }

        // 更新採集面板的 dropdown 選項清單（新增標籤後讓新標籤出現在下拉選單）
        const updatedLabels = Object.keys(state.spec.toJSON().schema.label_map || {});
        const labelSelect = samplerView.querySelector('#dataset-sampler-label-select');
        if (labelSelect) {
            labelSelect.innerHTML = updatedLabels.map((lb) =>
                '<option value="' + lb + '"' + (lb === l ? ' selected' : '') + '>' + lb + '</option>'
            ).join('');
        }

        // 新增標籤後即時刷新 Spec JSON 預覽
        refreshPreview();
    }

    return { setupLiveSamplerView, handleSamplerLabelChange, refreshCameraSelect };
}
