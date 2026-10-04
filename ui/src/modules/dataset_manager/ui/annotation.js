/**
 * Annotation controller：bbox/line 標註模式編排（Stage 4 切片 6，§7.2 步驟 6）
 * - 職責：非 image 類型的「物件偵測/循跡」bbox 拉框標註——進入（enter）、
 *   載入圖（load，含 UICanvas.init 與 300ms debounce 落盤）、右側控制欄渲染（renderControls）、
 *   標註列表 UI（renderListUI，含 class 更正下拉）、進度更新（updateProgress）、
 *   畫布鍵盤事件（bindCanvasKeyboardEvents：↑/↓ 切換、Delete 刪除、Esc 退出）、
 *   刪除高亮標註（deleteSelectedAnnotation）、畫布標註寫回（saveCurrentAnnotations）
 * - 分流職責（projectType === 'image_classification' → 分類校正模式）留在 ui_layout 協調層
 * - 畫布生命週期：UICanvas 為共享 singleton，init 由本 controller 呼叫；
 *   unbindEvents / 面板清理仍由 ui_layout 的 exitAnnotationMode 統一處理
 * - 依賴全注入；標籤下拉排序改用 SSOT：import { sortedLabelEntries } from '../core/labelMap.js'
 */
import {
    countAnnotated, resolveDeleteIndex, removeAnnotationAt, setAnnotationClassId
} from '../application/annotationMutations.js';
// 2026-10-01（P1-2）：類型判斷改走 core/typePolicy.js（SSOT）。
import { needsUnclassifiedCheck } from '../core/typePolicy.js';
// [T4 2026-10-03] 標籤下拉排序 SSOT（四處渲染處統一，見 labelMap.js:sortedLabelEntries）
import { sortedLabelEntries } from '../core/labelMap.js';

/**
 * @param {object} options
 * @param {object} options.state 模組共用狀態（含 annotationMode）
 * @param {Function} options.t i18n
 * @param {Function} options.escapeHtml HTML 轉義
 * @param {() => Element|null} options.getModal 取得 modal root
 * @param {object} options.UICanvas 共享標註畫布 singleton
 * @param {object} options.UIComponents 共用 UI 元件（renderAnnotationThumbnails）
 * @param {(name: string) => string} options.getFormValue 表單欄位讀取
 * @param {() => void} options.saveGridScroll 進入模式前保存縮圖捲動
 * @param {() => void} options.exitAnnotationMode 返回列表（返回鈕/Esc）
 * @param {(index: number) => void} options.navigateToImage 縮圖/鍵盤切換圖片
 * @param {(hide: boolean) => void} options.setAnnotationHeaderActions 預覽 header 動作切換
 * @param {() => void} options.updateStatsFromImages 標註變更後重算統計
 * @param {() => void} options.updateThumbnailHighlight 縮圖高亮同步
 * @param {() => void} options.refreshPreview debounce 落盤
 * @param {(container: Element, statsContainer?: Element|null) => void} options.createLabelMapManager 標籤管理器
 * @param {() => Document} [options.getDocument] 取得 document（預設 globalThis.document）
 *
 * 2026-10-01：不再注入 handleExportDataset —— 匯出按鈕已從 P3 工具列移除
 *   （匯出僅存在於 P2 資料集管理頁）。ui_layout.js 仍會傳入該鍵，JS 會忽略未解構的參數。
 */
export function createAnnotationController({
    state, t, escapeHtml, getModal, UICanvas, UIComponents, getFormValue,
    saveGridScroll, exitAnnotationMode, navigateToImage,
    setAnnotationHeaderActions,
    updateStatsFromImages, updateThumbnailHighlight, refreshPreview,
    createLabelMapManager, onDeleteImage, getDocument = () => globalThis.document
}) {
    function doc() {
        return getDocument();
    }

    /**
     * 進入 bbox/line 標註模式（非 image 類型；分流由 ui_layout 協調層處理）
     * 中央大圖（UICanvas 拉框）+ 右側控制欄
     */
    function enterAnnotationMode(image, index) {
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
            <button type="button" id="dataset-annotation-back" class="dataset-small-btn" style="background: #FE2F89; color: white; border: none; margin-right: 8px;">${t('BACK_TO_MANAGE', '← 回資料集管理')}</button>
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
                        <!-- 2026-10-01：十字尺規調色（固定色在淺色照片上看不清）。
                             僅 bbox 模式顯示；line 模式本來就沒有尺規。
                             註：原本這裡另有一顆「匯出資料集」按鈕，已依使用者指示移除 ——
                             匯出僅存在於 P2 資料集管理頁（視窗標頭），P3 標註頁不提供匯出。 -->
                        <label class="dataset-annotation-crosshair-picker" id="annotation-crosshair-picker"
                               <!-- ⚠ [P2-15 2026-10-04] 下面單元树原本寫成 t('DSM_ANNOTATION_CROSSHAIR*', ...)，
     但 t() 會自動補前綴（'DSM_' + key）→ 實際查 DSM_DSM_* 永道查不到。
     這兩個鍵在 i18n/en.js 都有翻譯卻讀不到 —— 英文語系下永道顯示中文。 -->
                            title="${t('ANNOTATION_CROSSHAIR_COLOR', '十字尺規顏色')}">
                            <span class="dataset-annotation-crosshair-label">${t('ANNOTATION_CROSSHAIR', '尺規')}</span>
                            <input type="color" id="annotation-crosshair-color" value="#00ff88"
                                   aria-label="${t('ANNOTATION_CROSSHAIR_COLOR', '十字尺規顏色')}">
                        </label>
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
        const thumbnails = doc().getElementById('annotation-thumbnails');
        UIComponents.renderAnnotationThumbnails(thumbnails, state.images, index, {
            onThumbnailClick: (newIndex) => navigateToImage(newIndex),
            onDeleteImage: (delIndex) => onDeleteImage(delIndex)
        });

        // 渲染右側控制欄
        renderAnnotationControls();

        // 載入目前圖片
        loadAnnotationImage(index);

        // 十字尺規調色（bbox 模式才有尺規）
        setupCrosshairColorPicker(getFormValue('projectType'));

        // 標註模式：切換預覽 header 的按鈕組（只影響驗證鈕／自動儲存指示燈）
        setAnnotationHeaderActions(true);
        // 2026-10-01：工具列匯出鈕已移除（P3 不提供匯出，匯出僅在 P2），故無需綁 #annotation-export-btn。
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
        const container = doc().getElementById('annotation-container');
        const img = doc().getElementById('annotation-target-img');
        if (!container || !img) return;

        // 更新圖片來源
        img.src = image.blobUrl;

        // 同步初始化畫布（不依賴 onload，避免 src 相同時 onload 不觸發導致 UI 空白）
        const mode = projectType === 'line_following' ? 'line' : 'bbox';
        const labelMap = state.spec.toJSON().schema.label_map || {};
        UICanvas.init(container, img, image.annotations || [], {
            mode: mode,
            labelMap: labelMap,
            // 2026-10-01（P2-7）：bbox 框線改依 P2 類別色上色，
            // 讓標註畫布與 P2 縮圖／統計的顏色一致（同一類別看起來就是同一個顏色）。
            // ★ 必須傳固定 lightness，不可依主題變動：
            //   框線畫在「照片」上，而照片明暗與主題無關（白底商品照在 light/dark
            //   主題下都是白底）。若跟著主題改明度，暗照片配 light 主題時
            //   深色框線就看不見了。
            //   （框線本身的暗照片可見性另由 drawBox 的白色外層描邊處理。）
            getLabelColor: (label) => UIComponents.getLabelColor(label, {
                lightness: UICanvas.BOX_LABEL_LIGHTNESS
            }),
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
        const classSelect = doc().querySelector('#annotation-class-manager .dataset-label-manager-select');
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
     * 更新頂部進度計數器
     */
    function updateAnnotationProgress() {
        const progressEl = doc().getElementById('annotation-progress');
        if (!progressEl) return;

        const annotatedCount = countAnnotated(state.images);
        const total = state.images.length;
        progressEl.textContent = t('ANNOTATION_PROGRESS', '進度: %1/%2 張').replace('%1', annotatedCount).replace('%2', total);
    }

    /**
     * 綁定畫布鍵盤事件（↑/↓ 切換、Delete 刪除、Esc 退出）
     */
    function bindCanvasKeyboardEvents() {
        const container = doc().getElementById('annotation-container');
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
        const index = resolveDeleteIndex(anns, UICanvas.state.selectedAnnotationIndex);
        if (index < 0) return;

        removeAnnotationAt(anns, index);
        UICanvas.state.selectedAnnotationIndex = -1;
        if (UICanvas.state.onUpdate) UICanvas.state.onUpdate(anns);
        UICanvas.render();
        renderAnnotationListUI(anns);
    }

    /**
     * 十字尺規調色 UI（2026-10-01 使用者回報：固定白色在白色照片上看不清）。
     * - 僅 bbox 模式顯示（line 模式本來就沒有尺規）
     * - 顏色存於 localStorage，跨工作階段保留（UICanvas.loadCrosshairColor 還原）
     */
    function setupCrosshairColorPicker(projectType) {
        const picker = doc().getElementById('annotation-crosshair-picker');
        const input = doc().getElementById('annotation-crosshair-color');
        if (!picker || !input) return;

        const isBbox = projectType !== 'line_following';
        picker.style.display = isBbox ? 'inline-flex' : 'none';
        if (!isBbox) return;

        // 顯示目前生效的顏色（可能來自上次設定）
        input.value = UICanvas.loadCrosshairColor();

        // 2026-10-01 修：原本用 onchange —— 該事件只在關閉取色面板時觸發，
        // 使用者拖曳／點選顏色的當下畫布不會更新，必須再按一次左鍵關閉才換色。
        // oninput 會在選色過程中持續觸發，故尺規可即時跟隨變色。
        input.oninput = () => {
            UICanvas.setCrosshairColor(input.value);
        };
        // 部分 webview 只發 change 不發 input，保險起見兩者都掛（setCrosshairColor 冪等）。
        input.onchange = () => {
            UICanvas.setCrosshairColor(input.value);
        };
    }

    /**
     * 渲染右側控制欄（類別選擇器 + 標註列表）
     */
    function renderAnnotationControls() {
        const controls = doc().getElementById('annotation-controls');
        if (!controls) return;

        const projectType = getFormValue('projectType');

        // 類別選擇器（僅物件偵測模式顯示；標籤管理由共用 createLabelMapManager 處理）
        let classSelectorHtml = '';
        if (needsUnclassifiedCheck(projectType)) {
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
        if (needsUnclassifiedCheck(projectType)) {
            createLabelMapManager(doc().getElementById('annotation-class-manager'));
        }

        // 重新渲染標註列表（controls.innerHTML 重置會清空 #annotation-list-ui，需恢復）
        const currentIdx = state.annotationMode.currentIndex;
        if (currentIdx >= 0 && state.images[currentIdx]) {
            renderAnnotationListUI(state.images[currentIdx].annotations || []);
        }
    }

    function renderAnnotationListUI(anns) {
        const list = doc().getElementById('annotation-list-ui');
        if (!list) return;
        const labelMap = state.spec.toJSON().schema.label_map || {};
        // [T4 2026-10-03] 依字母序排列，與 classification.js 對齊。
        //   原先直接 Object.entries() 直出 → 順序取自 label_map 的鍵插入順序，
        //   使用者新增/刪除標籤後順序會跳動，且與分類審核的下拉不一致。
        //   ⚠️ 只排序顯示，不改 label_map 的 id 對應（id === ann.class_id 判定不受影響）。
        const labelEntries = sortedLabelEntries(labelMap);

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

            // 2026-10-01（使用者需求）：hover 列表項目 → 畫面對應的框高亮。
            // 多個框要刪除時，使用者需要知道畫面上是哪一個。
            // mouseenter / mouseleave 用 delegation 綁在容器上較省，
            // 但此處逐項綁定與既有的 onclick 風格一致、更好讀。
            item.onmouseenter = () => {
                UICanvas.setHoveredAnnotation(parseInt(item.dataset.index));
            };
            item.onmouseleave = () => {
                UICanvas.setHoveredAnnotation(-1);
            };
        });

        // 綁定類別下拉選單變更事件（即時更正標錯類別）
        list.querySelectorAll('.dataset-annotation-item-class').forEach(select => {
            select.onchange = () => {
                const idx = parseInt(select.dataset.index);
                setAnnotationClassId(anns, idx, parseInt(select.value, 10));
                if (UICanvas.state.onUpdate) UICanvas.state.onUpdate(anns);
                UICanvas.render();
            };
        });
    }

    return {
        enterAnnotationMode,
        saveCurrentAnnotations,
        loadAnnotationImage,
        updateAnnotationProgress,
        bindCanvasKeyboardEvents,
        deleteSelectedAnnotation,
        renderAnnotationControls,
        renderAnnotationListUI,
        /** dispose：清除未落的 debounce timer（modal 關閉時由 ui_layout 呼叫） */
        dispose() {
            if (state.annotationMode?.saveTimer) {
                clearTimeout(state.annotationMode.saveTimer);
                state.annotationMode.saveTimer = null;
            }
        }
    };
}
