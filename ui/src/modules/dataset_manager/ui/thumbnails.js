/**
 * 縮圖網格 scroll save/restore 集中管理（Stage 4 切片 4，§7.2 步驟 4）
 * - 資料輸入：getContainer() 取得 #dataset-image-preview 容器（可為 null）
 * - 狀態：沿用 state._savedGridScrollTop（core/state.js 既有欄位，契約不變）
 * - DOM ownership：唯讀/唯寫 .dataset-image-grid 的 scrollTop，不變更其他 DOM
 * - dispose：no-op（無 listener/timer；saved 值隨 state 生命週期）
 * @param {object} options
 * @param {object} options.state 模組共用狀態（含 _savedGridScrollTop）
 * @param {() => Element|null} options.getContainer 取得 #dataset-image-preview 容器
 * @param {() => boolean} options.hasImages 目前是否有影像資料
 */
export function createGridScrollManager({ state, getContainer, hasImages }) {
    function queryGrid(container) {
        return container?.querySelector('.dataset-image-grid') || null;
    }

    /**
     * 保存目前縮圖網格的捲動位置（進入標註/分類模式、刪除影像前呼叫）
     */
    function saveGridScroll() {
        const grid = queryGrid(getContainer());
        state._savedGridScrollTop = grid ? grid.scrollTop : 0;
    }

    /**
     * 恢復縮圖網格的捲動位置（在 renderImageGrid 之後呼叫）
     * 決定 scrollTop 值：先取 state._savedGridScrollTop（從標註模式返回），
     * 若無則嘗試現有 grid 的 scrollTop（刪除照片時保留），最後為 0
     */
    function restoreGridScroll() {
        const container = getContainer();
        if (!container) return;

        const grid = queryGrid(container);
        const savedScrollTop = (state._savedGridScrollTop > 0) ? state._savedGridScrollTop : (grid ? grid.scrollTop : 0);
        // 使用過後清空，避免下次 refreshDynamicPanels 誤用
        state._savedGridScrollTop = 0;

        if (grid && hasImages() && savedScrollTop > 0) {
            grid.scrollTop = savedScrollTop;
        }
    }

    return {
        saveGridScroll,
        restoreGridScroll,
        dispose() {
            // 無 listener/timer，無需釋放資源
        }
    };
}
