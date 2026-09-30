/**
 * ui/test/fixtures.js — 共用測試資料樣本（T3）
 *
 * 來源：ui/annotation.test.mjs、ui/classification.test.mjs、ui/featurePanel.test.mjs、
 *       ui/samplerPanel.test.mjs 各自重寫的 spec 假身（spec.toJSON / updateSchema）。
 *       形狀相同、內容不同，故抽成帶預設值的 factory。
 */

/**
 * 建立 DatasetSpec 假身。
 *
 * 對應的兩種既有用法（皆保留）：
 *   1) 唯讀：toJSON 回傳固定物件（annotation / classification）
 *   2) 可寫：toJSON 深拷貝 + updateSchema 合併（featurePanel / samplerPanel）
 *      → 皆以 live: true 開啟深拷貝行為。
 *
 * @param {object} [options]
 * @param {string|null} [options.type] project.type；null 表示不帶 project 欄位
 * @param {Record<string, number>} [options.labelMap] schema.label_map
 * @param {boolean} [options.live=false] true = 深拷貝 + 支援 updateSchema
 * @param {boolean} [options.noopUpdate=false] true = updateSchema 為 no-op
 *        （featurePanel.test.mjs L122 的第二處 spec 假身即此形）
 */
export function makeSpecStub({ type = null, labelMap = {}, live = false, noopUpdate = false } = {}) {
    const specData = { schema: { label_map: { ...labelMap } } };
    if (type !== null) specData.project = { type };

    if (!live) {
        return { specData, toJSON: () => JSON.parse(JSON.stringify(specData)) };
    }
    return {
        specData,
        toJSON: () => JSON.parse(JSON.stringify(specData)),
        updateSchema: noopUpdate
            ? () => {}
            : (patch) => { Object.assign(specData.schema, patch); }
    };
}

/** 常用標籤對應樣本（annotation.test.mjs 舊值） */
export const OBJECT_DETECTION_LABELS = { cat: 0, dog: 1 };

/**
 * 樹狀 fake element —— 供 ui/form.test.mjs 使用。
 *
 * 【為何獨立於 fakeDom.js】
 * form 測試需要的是「具 children／attrs 的樹狀節點」，querySelector 支援
 * [name=...]／[data-field=...] 屬性選擇器並遞迴 find；與 fakeDom.js 的
 * 「扁平 id 註冊表」是兩種不同物種。硬抽成同一個 factory 會讓參數布爾膨脹、
 * 且改變 form 測試的語意（違反 T3「純搬移」原則，見 ComprehensiveAudit §9.6）。
 * 故刻意分離，僅共用命名慣例。
 */
export function makeTreeEl({ tag = 'input', value = '', name = '', attrs = {}, children = [] } = {}) {
    return {
        tagName: tag.toUpperCase(),
        value,
        name,
        attrs,
        children,
        querySelector(sel) {
            if (sel.startsWith('[name=')) {
                const want = sel.slice(7, -2);
                return this.find((n) => n.name === want) || null;
            }
            if (sel.startsWith('[data-field=')) {
                const field = sel.slice(13, -2);
                return this.find((n) => n.attrs['data-field'] === field) || null;
            }
            return null;
        },
        querySelectorAll(sel) {
            if (sel === '.dataset-column-row') return this.children.filter((c) => c.attrs.class === 'dataset-column-row');
            return [];
        },
        // 便利：往下層找
        find(pred) {
            for (const c of this.children) {
                if (pred(c)) return c;
                const r = c.find ? c.find(pred) : null;
                if (r) return r;
            }
            return null;
        }
    };
}
