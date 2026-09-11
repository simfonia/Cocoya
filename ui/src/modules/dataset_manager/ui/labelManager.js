/**
 * ui/labelManager.js — 統一 label_map 標籤管理器（M2，R5）
 * 自 ui_layout.js createLabelMapManager 原地抽出，行為語意不變。
 * 依賴全注入，無模組級全域耦合，Node 可測。
 */
import { nextLabelId as getNextLabelId } from '../core/labelMap.js';
import {
    countImagesWithLabel, countBoxesWithClassId,
    removeAnnotationsByClassId, reassignLabelsToUnlabeled
} from '../application/annotationMutations.js';

export function createLabelManager({
    state, t, escapeHtml, UIComponents, UICanvas, getFormValue,
    syncLabelMap, updateStatsFromImages, scheduleAutoSave, refreshPreview,
    renderClassificationControls, renderAnnotationControls, updateThumbnailHighlight,
    bridge, getDocument = () => globalThis.document
}) {
    function doc() {
        return getDocument();
    }

    function createLabelMapManager(container, statsContainer = null) {
        if (!container) return;
        const spec = state.spec.toJSON();
        const projectType = spec.project.type || getFormValue('projectType') || 'table';
        const labelMap = spec.schema.label_map || {};
        const entries = Object.entries(labelMap).sort((a, b) => a[0].localeCompare(b[0]));

        container.innerHTML = ''
            + '<div class="dataset-annotation-class-row">'
            + '<select class="dataset-label-manager-select">'
            + (entries.length > 0
                ? entries.map(([name, id]) => '<option value="' + id + '">' + escapeHtml(name) + '</option>').join('')
                : '<option value="-1" disabled selected>' + t('ANNOTATION_EMPTY', '尚未有標註') + '</option>')
            + '</select>'
            + '<button type="button" class="dataset-icon-btn" data-action="add" title="' + t('ANNOTATION_CLASS_ADD', '新增') + '">+</button>'
            + '<button type="button" class="dataset-icon-btn" data-action="edit" title="' + t('ANNOTATION_CLASS_EDIT', '編輯') + '">✏️</button>'
            + '<button type="button" class="dataset-icon-btn" data-action="delete" title="' + t('ANNOTATION_CLASS_DELETE', '刪除') + '">🗑️</button>'
            + '</div>';

        const select = container.querySelector('.dataset-label-manager-select');
        if (!select) return;

        const currentId = () => {
            const v = parseInt(select.value, 10);
            return Number.isInteger(v) ? v : -1;
        };
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
        const freshContainer = () => (container.id ? (doc().getElementById(container.id) || container) : container);

        // 新增
        container.querySelector('[data-action="add"]').onclick = async () => {
            const name = await bridge.prompt(t('ANNOTATION_NEW_CLASS_PLACEHOLDER', '輸入新類別名稱'));
            if (!(name && name.trim())) return;
            const trimmed = name.trim();
            const map = state.spec.toJSON().schema.label_map || {};
            if (map[trimmed] !== undefined) return;
            map[trimmed] = getNextLabelId(map);
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
            const newName = await bridge.prompt(t('ANNOTATION_NEW_CLASS_PLACEHOLDER', '輸入新類別名稱'), entry[0]);
            if (newName && newName.trim() && newName.trim() !== entry[0]) {
                const trimmed = newName.trim();
                const map = state.spec.toJSON().schema.label_map || {};
                delete map[entry[0]];
                map[trimmed] = id;
                if (projectType === 'image') {
                    state.images.forEach((img) => { if (img.label === entry[0]) img.label = trimmed; });
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
                ? countImagesWithLabel(state.images, entry[0])
                : countBoxesWithClassId(state.images, id);
            const confirmed = await bridge.confirm(
                t('ANNOTATION_DELETE_CLASS_CONFIRM', '確定刪除類別嗎？')
                    .replace('%1', entry[0]).replace('%2', count)
            );
            if (confirmed) {
                const map = state.spec.toJSON().schema.label_map || {};
                delete map[entry[0]];
                if (projectType === 'image') {
                    reassignLabelsToUnlabeled(state.images, entry[0]);
                } else {
                    removeAnnotationsByClassId(state.images, id);
                    if (UICanvas.state.annotations) {
                        UICanvas.state.annotations = UICanvas.state.annotations.filter((a) => a.class_id !== id);
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

    return { createLabelMapManager };
}
