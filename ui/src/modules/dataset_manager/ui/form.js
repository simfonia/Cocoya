/**
 * Form presenter：表單欄位讀取（Stage 4 slice 3）
 * - 資料輸入：modal root element（可注入，利於測試）
 * - 輸出：getFormValue / getColumnsFromUI 純讀取函式
 * - DOM ownership：唯讀，不寫入任何 DOM；dispose 為 no-op（無 listener/timer）
 * @param {object} options
 * @param {() => Element|null} [options.getModalRoot] 取得 modal root 的函式
 */
export function createFormPresenter({ getModalRoot = () => null } = {}) {
    function getFormValue(name) {
        const modal = getModalRoot();
        const field = modal?.querySelector(`[name="${name}"]`);
        return field ? field.value : '';
    }

    function getColumnsFromUI() {
        const modal = getModalRoot();
        if (!modal) return [];

        const rows = Array.from(modal.querySelectorAll('.dataset-column-row'));
        return rows.map((row) => ({
            name: row.querySelector('[data-field="name"]')?.value.trim() || '',
            type: row.querySelector('[data-field="type"]')?.value || 'string',
            role: row.querySelector('[data-field="role"]')?.value || 'feature'
        })).filter((column) => column.name);
    }

    return {
        getFormValue,
        getColumnsFromUI,
        dispose() {
            // 唯讀 presenter，無需釋放資源
        }
    };
}
