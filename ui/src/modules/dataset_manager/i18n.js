/**
 * Dataset Manager i18n 輔助函式庫
 * 提供統一的 t() 函式供所有 Dataset Manager 模組使用
 *
 * 使用方式：
 *   t('KEY', 'fallback text')                          // 無佔位符
 *   t('KEY', 'fallback %1', value1)                    // 單個佔位符
 *   t('KEY', 'fallback %1 %2', value1, value2)        // 多個佔位符
 */

/**
 * 取得 Blockly.Msg 中的 DSM_* 鍵值
 * @param {string} key - i18n 鍵值（不含 DSM_ 前綴）
 * @param {string} fallback - 找不到時的回退文字
 * @param {...*} args - 佔位符替換值（%1, %2, ...）
 * @returns {string} 翻譯後的文字
 */
export function t(key, fallback, ...args) {
    const fullKey = 'DSM_' + key;
    let text = (typeof Blockly !== 'undefined' && Blockly.Msg && Blockly.Msg[fullKey])
        ? Blockly.Msg[fullKey]
        : fallback;
    if (args.length > 0) {
        args.forEach((arg, i) => {
            text = text.replace(new RegExp('%' + (i + 1), 'g'), String(arg));
        });
    }
    return text;
}
