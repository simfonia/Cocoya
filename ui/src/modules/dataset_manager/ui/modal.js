/**
 * ui/modal.js
 *
 * Dataset Manager Modal 呈現層：純模板建構函式，無 DOM 副作用、可單元測試。
 * Stage 4 切片 2：自 `ui_layout.js` 的 createModal() 抽出。
 *
 * buildModalTemplate() 為純函式，回傳 modal 的 innerHTML 字串。
 * 依賴以參數注入（t / optionList / projectTypes / sourceModes），使模板建構可測、不觸碰 window/document。
 */

/**
 * 建構 Dataset Manager modal 的 innerHTML。
 * @param {object} deps
 * @param {Function} deps.t i18n 翻譯函式（fallback 語法同 ui_layout 的 t()）
 * @param {Function} deps.optionList 產生 <option> HTML 的純函式
 * @param {string[]} deps.projectTypes 專案類型清單（DatasetSpecConstants.PROJECT_TYPES）
 * @param {string[]} deps.sourceModes 初始來源模式清單（TYPE_TO_MODES_MAP['table']）
 * @returns {string} modal innerHTML
 */
export function buildModalTemplate({ t, optionList, projectTypes, sourceModes }) {
    return `
        <section class="dataset-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="dataset-manager-title">
            <header class="dataset-manager-header">
                <div>
                    <h2 id="dataset-manager-title">${t('TITLE', 'Dataset Manager')}</h2>
                    <span id="dataset-manager-subtitle">${t('SUBTITLE', 'Dataset Spec')}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button type="button" id="dataset-manager-clear" class="dataset-secondary-btn" style="padding: 4px 8px; font-size: 11px; margin: 0; line-height: 1.2; display: flex; align-items: center; justify-content: center;" title="${t('CLEAR_DATA_TOOLTIP', '清空所有暫存資料記錄並重置')}">${t('CLEAR_DATA', '清除資料')}</button>
                    <button type="button" id="dataset-manager-close" class="dataset-icon-btn" title="${t('CLOSE', '關閉')}">×</button>
                </div>
            </header>

            <div id="dataset-export-progress" class="dataset-export-progress" style="display: none;">
                <div class="dataset-export-progress-bar"></div>
                <span class="dataset-export-progress-label">${t('EXPORT_IN_PROGRESS', '正在打包 ZIP 並產生 dataset.json...')}</span>
            </div>

            <div id="dataset-manager-message" class="dataset-manager-message" style="display: none;"></div>

            <div class="dataset-manager-body">
                <section class="dataset-panel dataset-source-panel">
                    <h3>${t('SOURCE', '資料來源')}</h3>
                    
                    <label>
                        <span>${t('PROJECT_TYPE', '專案類型')}</span>
                        <select name="projectType">${optionList(projectTypes, 'table')}</select>
                    </label>
                    <label>
                        <span>${t('SOURCE_MODE', '來源模式')}</span>
                        <select name="sourceMode">${optionList(sourceModes, 'file')}</select>
                    </label>

                    <div class="dataset-panel-divider"></div>

                    <label>
                        <span>${t('PROJECT_NAME', '資料集名稱')}</span>
                        <input name="projectName" value="dataset" placeholder="${t('PROJECT_NAME_PLACEHOLDER', '僅限英數與下劃線')}">
                        <span style="font-size: 10px; color: #999; margin-top: 2px; display: block;">${t('PROJECT_NAME_HINT', '* 僅限英文、數字與下劃線 (用於雲端路徑)')}</span>
                    </label>
                    
                    <label>
                        <span>${t('DESCRIPTION', '描述')}</span>
                        <textarea name="description" rows="3" placeholder="${t('DESCRIPTION_PLACEHOLDER', '專案詳細描述...')}"></textarea>
                    </label>

                    <div id="dataset-cloud-diagnostic-area" style="display: none; margin-top: 12px; padding: 10px; background: #fdf6fb; border: 1px solid #e1bee7; border-radius: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <span style="font-size: 12px; font-weight: bold; color: #9c27b0;">${t('CLOUD_REMOTE_ENV', '☁️ 遠端環境')}</span>
                            <div style="display: flex; gap: 4px;">
                                <button type="button" id="dataset-cloud-diagnose-btn" class="dataset-small-btn" style="margin: 0; background: #9c27b0; color: white; border: none; padding: 2px 6px;">${t('CLOUD_DIAGNOSE', '執行診斷')}</button>
                            </div>
                        </div>
                        <div id="dataset-cloud-diagnostic-result" style="font-size: 11px; color: #555; line-height: 1.4;">
                            ${t('CLOUD_DIAGNOSE_HINT', '請點擊「執行診斷」檢查 GPU 與 Docker 環境。')}
                        </div>
                    </div>

                    <!-- 匯入按鈕移至左欄最下方：使用者可先在上方依序完成設定，最後再選擇來源 -->
                    <div class="dataset-panel-divider"></div>

                    <div id="dataset-import-area-table" class="dataset-import-area">
                        <button type="button" id="dataset-import-btn" class="dataset-secondary-btn" style="width: 100%">${t('SELECT_CSV', '選擇 CSV / JSON 檔案')}</button>
                        <input type="file" id="dataset-file-input" accept=".csv,.json" style="display: none;">
                    </div>

                    <div id="dataset-import-area-image" class="dataset-import-area" style="display: none;">
                        <button type="button" id="dataset-dir-import-btn" class="dataset-secondary-btn" style="width: 100%">${t('SELECT_IMAGE_FOLDER', '選擇影像資料夾')}</button>
                    </div>
                </section>

                <section class="dataset-panel dataset-schema-panel">
                    <div class="dataset-panel-title">
                        <h3 id="dataset-structure-title">${t('STRUCTURE_TITLE', '欄位與標籤')}</h3>
                        <div id="dataset-schema-actions">
                            <button type="button" id="dataset-add-column" class="dataset-small-btn">${t('ADD_FEATURE', '新增 Feature')}</button>
                            <button type="button" id="dataset-add-label" class="dataset-small-btn">${t('ADD_LABEL', '新增 Label')}</button>
                        </div>
                    </div>
                    <div id="dataset-structure-content">
                        <div class="dataset-column-head">
                            <span>${t('COLUMN_NAME', '名稱')}</span>
                            <span>${t('COLUMN_TYPE', '型別')}</span>
                            <span>${t('COLUMN_ROLE', '角色')}</span>
                            <span></span>
                        </div>
                        <div id="dataset-column-list" class="dataset-column-list"></div>
                    </div>
                </section>

                <section class="dataset-panel dataset-preview-panel">
                    <div class="dataset-panel-title">
                        <h3>${t('PREVIEW_TITLE', '預覽與標註')}</h3>
                        <div>
                            <button type="button" id="dataset-manager-validate" class="dataset-small-btn">${t('VALIDATE', '驗證')}</button>
                            <span class="dataset-autosave-indicator" title="${t('AUTOSAVE_ON_TOOLTIP', '標註/分類/新增/刪除後自動寫入 dataset.json')}">🛡 ${t('AUTOSAVE_ON', '自動儲存已開啟')}</span>
                            <button type="button" id="dataset-manager-export" class="dataset-small-btn" style="background: #FE2F89; color: white; border: none;">${t('EXPORT', '匯出資料集')}</button>
                        </div>
                    </div>
                    <div id="dataset-validation"></div>
                    <div id="dataset-preview-content">
                        <pre id="dataset-json-preview"></pre>
                    </div>
                </section>
            </div>
        </section>
    `;
}