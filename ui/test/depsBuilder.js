/**
 * ui/test/depsBuilder.js — 共用依賴建構（T3）
 *
 * 來源：ui/annotation.test.mjs 的 makeDeps 與 ui/classification.test.mjs 的 baseDeps。
 *       兩者建構的 deps 幾乎同構——classification 的鍵是 annotation 的子集
 *       （少 UICanvas 與 getFormValue），故以同一個 factory ＋ overrides 表達。
 *
 * 【T3 關鍵決策：注入真實 t() / escapeHtml】
 * 原本兩檔各自造假：
 *     t:          (key, fallback) => fallback || key
 *     escapeHtml: (v) => String(v)
 * 改為注入 production 實作（dataset_manager/i18n.js、core/html.js），理由與驗證：
 *
 *   1. 假 t() 不做佔位符替換，真 t() 會替換 —— 但本專案 production 碼的呼叫慣例是
 *      「先 t() 拿回 fallback，再由呼叫端自行 .replace('%1', ...)」
 *      （見 ui/classification.js:199-201 CLASSIFY_PROGRESS），且未對 t() 傳 args，
 *      故真 t() 不會觸發替換，輸出與假 t() 逐字相同。
 *   2. 真 escapeHtml 會轉義 & < > " '，假的不會 —— 但現有測試資料
 *      （'a.png'、'blob:x' 等）不含這些字元，輸出相同。
 *   3. 真 t() 內部以 `typeof Blockly !== 'undefined'` 防護，Node 環境安全。
 *
 * 若日後新增含 HTML 特殊字元的測試資料，此處行為會與舊假造不同 —— 那是修正而非迴歸。
 */
import { t as realT } from '../src/modules/dataset_manager/i18n.js';
import { escapeHtml as realEscapeHtml } from '../src/modules/dataset_manager/core/html.js';
import { makeFakeDocument } from './fakeDom.js';

export { realT as t, realEscapeHtml as escapeHtml };

/**
 * 建立 annotation / classification 兩支 controller 共用的 deps。
 *
 * @param {object} [options]
 * @param {object} [options.state] 覆寫預設 state
 * @param {object|null} [options.modal] getModal() 回傳值
 * @param {object} [options.document] getDocument() 回傳值
 * @param {string[]|Record<string,object>} [options.elementsById] 給 getDocument 用
 * @param {boolean} [options.record=false] true = 把 UIComponents／UICanvas 的呼叫
 *        記入 events 陣列（annotation.test.mjs 舊用法）
 * @param {object} [options.overrides] 其他鍵覆寫
 * @returns {{deps: object, events: Array}} events 僅在 record=true 時有內容
 */
export function makeDeps({
    state,
    modal = null,
    document,
    elementsById = [],
    record = false,
    overrides = {}
} = {}) {
    const events = [];
    // record=false 時沿用舊的 no-op 風格；record=true 時記入 events。
    const rec = (tag, fn) => (...args) => {
        events.push([tag, ...args]);
        if (fn) fn(...args);
    };

    const deps = {
        state: state || {
            images: [],
            annotationMode: { isActive: false, currentIndex: -1, saveTimer: null },
            spec: { toJSON: () => ({ schema: { label_map: {} } }) }
        },
        t: realT,
        escapeHtml: realEscapeHtml,
        getModal: () => modal,
        UIComponents: {
            // annotation 舊檔以物件記錄 thumbs 事件；classification 舊檔為 no-op。
            // 兩者形狀不同，故依 record 分流，保持各自既有語意。
            renderAnnotationThumbnails: record
                ? (container, images, index, opts) => {
                    events.push(['thumbs', { container, images, index, opts }]);
                }
                : () => {}
        },
        getFormValue: (name) => (name === 'projectType' ? 'object_detection' : ''),
        saveGridScroll: record ? rec('saveGridScroll') : () => {},
        exitAnnotationMode: record ? rec('exit') : () => {},
        navigateToImage: record ? rec('nav') : () => {},
        // 2026-10-13：↑/↓ 鍵的預設實作必須「忠實反映 ui_layout.navigateFiltered 的行為」——
        // 在篩選後序列內前後移動、再把位置映射回原始索引呼叫 navigateToImage。
        // 注意：這裡刻意寫成真行為而非 no-op stub，否則既有斷言
        // 「currentIndex=1 按 ArrowUp → nav 0」會變成驗證替身自己，而非被測程式。
        navigateFiltered: (delta) => {
            const images = deps.state.images || [];
            const cur = deps.state.annotationMode.currentIndex;
            // identity 篩選下 entries.index ＝ 陣列位置（與 statsFilteredEntries 一致）
            const pos = images.findIndex((im) => im.index === cur);
            const from = (pos < 0) ? cur : pos;
            const next = from + delta;
            if (next < 0 || next >= images.length) return;
            deps.navigateToImage(images[next].index);
        },
        setAnnotationHeaderActions: record ? rec('headerActions') : () => {},
        handleExportDataset: record ? rec('export') : () => {},
        updateStatsFromImages: record ? rec('stats') : () => {},
        updateThumbnailHighlight: record ? rec('highlight') : () => {},
        refreshPreview: record ? rec('refresh') : () => {},
        createLabelMapManager: record ? rec('labelManager') : () => {},
        // 2026-10-13：P3 縮圖條的分類篩選來源。預設為「恆等映射」（不篩選），
        // 與加入此依賴之前的行為完全相同 —— 這樣既有測試的語意不必改動；
        // ui_layout.js 注入的才是真正會依 statsFilterLabel 過濾的版本。
        // 讀取時走 deps.state（而非閉包外捕獲的 state），以免測試用 overrides 換掉 state 後讀到舊值。
        visibleImageEntries: () => {
            const imgs = (deps.state && Array.isArray(deps.state.images)) ? deps.state.images : [];
            return imgs.map((img, index) => ({ img, index }));
        },
        getDocument: () => (document || makeFakeDocument(elementsById)),
        ...overrides
    };

    // UICanvas 僅 annotation.test.mjs 使用（非子集），故以 overrides 注入。
    // 注意：init 事件必須記成 { container, img, anns, opts } 物件 —— 既有斷言
    // （annotation.test.mjs）讀取 init[1].opts.mode / init[1].opts.labelMap，
    // 不可改成位置引數，否則即為「修改測試語意」而非純搬移。
    if (record) {
        deps.UICanvas = {
            state: { annotations: [], selectedAnnotationIndex: -1, handlers: {}, currentClassId: 0 },
            init: (container, img, anns, opts) => events.push(['init', { container, img, anns, opts }]),
            render: () => events.push(['render']),
            setSelectedAnnotation: (i) => events.push(['select', i]),
            ...(overrides.UICanvas || {})
        };
    }

    return { deps, events };
}
