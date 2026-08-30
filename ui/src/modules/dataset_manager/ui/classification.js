/**
 * Classification controller：分類標籤校正模式狀態機（Stage 4 切片 5，§7.2 步驟 5）
 * - 職責：image 類型專用的「分類校正」模式——進入（enter）、載入圖（load）、
 *   右側控制欄渲染（renderControls）、進度更新（updateProgress）、鍵盤事件 bind/unbind
 * - 狀態：沿用統一狀態機 state.annotationMode（mode: 'classification'），不另立平行狀態
 * - DOM ownership：#dataset-preview-content 的 3 欄布局、annotation-classify-* / annotation-controls /
 *   annotation-progress / annotation-thumbnails；dispose 時解除鍵盤 listener
 * - 依賴全注入（t/escapeHtml/getModal/UIComponents/協調層回呼），無模組級全域耦合
 * @param {object} options
 * @param {object} options.state 模組共用狀態（含 annotationMode）
 * @param {Function} options.t i18n
 * @param {Function} options.escapeHtml HTML 轉義
 * @param {() => Element|null} options.getModal 取得 modal root
 * @param {object} options.UIComponents 共用 UI 元件（renderAnnotationThumbnails）
 * @param {() => void} options.saveGridScroll 進入模式前保存縮圖捲動
 * @param {() => void} options.exitAnnotationMode 返回列表（返回鈕/Esc）
 * @param {(index: number) => void} options.navigateToImage 縮圖/鍵盤切換圖片
 * @param {(hide: boolean) => void} options.setAnnotationHeaderActions 預覽 header 動作切換
 * @param {() => void} options.handleExportDataset 工具列匯出
 * @param {() => void} options.updateStatsFromImages label 變更後重算統計
 * @param {() => void} options.updateThumbnailHighlight 縮圖高亮同步
 * @param {() => void} options.refreshPreview debounce 落盤（寫回 samples）
 * @param {(container: Element, statsContainer?: Element|null) => void} options.createLabelMapManager 標籤管理器
 * @param {() => Document} [options.getDocument] 取得 document（預設 globalThis.document）
 */
export function createClassificationController({
    state, t, escapeHtml, getModal, UIComponents,
    saveGridScroll, exitAnnotationMode, navigateToImage,
    setAnnotationHeaderActions, handleExportDataset,
    updateStatsFromImages, updateThumbnailHighlight, refreshPreview,
    createLabelMapManager, getDocument = () => globalThis.document
}) {
    let classificationKeyHandler = null; // 分類模式的鍵盤事件 handler（用於清理）

    function doc() {
        return getDocument();
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
        const thumbnails = doc().getElementById('annotation-thumbnails');
        UIComponents.renderAnnotationThumbnails(thumbnails, state.images, index, {
            mode: 'classification',
            onThumbnailClick: (newIndex) => navigateToImage(newIndex)
        });

        // 載入目前圖片
        loadClassificationImage(index);

        // 標註模式：隱藏預覽 header 的驗證/匯出，改用標註工具列的匯出（含即時狀態回饋）
        setAnnotationHeaderActions(true);
        const exportBtn = doc().getElementById('annotation-export-btn');
        if (exportBtn) exportBtn.onclick = handleExportDataset;
    }

    /**
     * 載入指定索引的圖片並更新分類校正 UI（image 類型專用）
     */
    function loadClassificationImage(index) {
        const image = state.images[index];
        if (!image) return;

        state.annotationMode.currentIndex = index;

        const img = doc().getElementById('annotation-classify-img');
        if (img) img.src = image.blobUrl;

        renderClassificationControls();
        updateClassifyProgress();
        updateThumbnailHighlight();
        bindClassificationKeyboardEvents();
    }


    /**
     * 渲染分類標籤校正模式的右側控制欄（目前分類下拉選單 + 新增類別）
     * image 類型專用，不涉及 bbox 標註
     */
    function renderClassificationControls() {
        const controls = doc().getElementById('annotation-controls');
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

        const select = doc().getElementById('annotation-classify-select');
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
        createLabelMapManager(doc().getElementById('annotation-classify-manager'));
    }

    /**
     * 更新分類校正模式頂部進度（image 類型顯示樣本位置）
     */
    function updateClassifyProgress() {
        const progressEl = doc().getElementById('annotation-progress');
        if (!progressEl) return;
        progressEl.textContent = t('CLASSIFY_PROGRESS', '樣本: %1 / %2 張')
            .replace('%1', state.annotationMode.currentIndex + 1)
            .replace('%2', state.images.length);
    }

    /**
     * 綁定分類校正模式鍵盤事件（↑/↓ 切換圖片、Esc 退出，無 Delete）
     */
    function bindClassificationKeyboardEvents() {
        const container = doc().getElementById('annotation-classify-container');
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
        const container = doc().getElementById('annotation-classify-container');
        if (container && classificationKeyHandler) {
            container.removeEventListener('keydown', classificationKeyHandler);
        }
        classificationKeyHandler = null;
    }

    return {
        enterClassificationReviewMode,
        loadClassificationImage,
        renderClassificationControls,
        updateClassifyProgress,
        bindClassificationKeyboardEvents,
        unbindClassificationKeyboardEvents,
        /** dispose：解除進行中的鍵盤 listener（modal 關閉/退出模式時呼叫） */
        dispose() {
            unbindClassificationKeyboardEvents();
        }
    };
}
