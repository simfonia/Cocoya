/**
 * Panels presenter：source/schema/preview 面板的欄位列與預覽呈現（Stage 4 切片 7，§7.2 步驟 7）
 * - 職責：欄位列模板（renderColumnRow）、驗證結果模板（renderValidation）、
 *   表格預覽（renderPreviewTable）、欄位新增/全列渲染（addColumn/renderAllColumns）
 * - 唯讀/唯寫 DOM 呈現層：spec 建構與商業狀態（syncSpecFromUI）不在此；
 *   refreshDynamicPanels 為重度耦合協調編排（Sampler/label manager/註記入口），留 ui_layout
 * - 依賴全注入（t/escapeHtml/optionList/getModal/refreshPreview/getDocument），Node 可測
 * @param {object} options
 * @param {object} options.state 模組共用狀態（含 spec）
 * @param {Function} options.t i18n
 * @param {Function} options.escapeHtml HTML 轉義
 * @param {Function} options.optionList 下拉選項模板（ui_layout 既有 helper）
 * @param {() => Element|null} options.getModal 取得 modal root
 * @param {() => void} options.refreshPreview 欄位異動後刷新（debounce 落盤）
 * @param {object} options.DatasetSpec DatasetSpec 類別（normalizeColumn）
 * @param {object} options.DatasetSpecConstants COLUMN_TYPES / COLUMN_ROLES 常數
 * @param {() => Document} [options.getDocument] 取得 document（預設 globalThis.document）
 */
export function createPanelsPresenter({
    state, t, escapeHtml, optionList, getModal, refreshPreview,
    DatasetSpec, DatasetSpecConstants, getDocument = () => globalThis.document
}) {
    function doc() {
        return getDocument();
    }

    /**
     * 渲染單一欄位列（schema 面板）
     */
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

    /**
     * 渲染驗證結果（ok/error + errors/warnings 清單）
     */
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

    /**
     * 渲染表格預覽（前 10 筆樣本）
     */
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

    /**
     * 新增欄位列（schema 面板尾端）並刷新
     */
    function addColumn(column) {
        const modal = getModal();
        const list = modal?.querySelector('#dataset-column-list');
        if (!list) return;
        list.insertAdjacentHTML('beforeend', renderColumnRow(column));
        refreshPreview();
    }

    /**
     * 依 state.spec 全量重繪欄位列並刷新
     */
    function renderAllColumns() {
        const modal = getModal();
        const list = modal?.querySelector('#dataset-column-list');
        if (!list) return;

        const spec = state.spec.toJSON();
        list.innerHTML = spec.schema.columns.map(c => renderColumnRow(c)).join('');
        refreshPreview();
    }

    return {
        renderColumnRow,
        renderValidation,
        renderPreviewTable,
        addColumn,
        renderAllColumns,
        /** dispose：純呈現層無資源，no-op（介面一致性保留） */
        dispose() {}
    };
}
