/**
 * Cocoya 通用工具：Toolbox 處理
 */
(function() {
    window.CocoyaUtils = window.CocoyaUtils || {};

    Object.assign(window.CocoyaUtils, {
        /**
         * 根據平台過濾 Toolbox XML
         * @param {string} xmlString 原始 XML 字串
         * @param {string} currentPlatform 當前平台 (PC/MicroPython)
         * @returns {string} 過濾後的 XML 字串
         */
        filterToolboxXML: function(xmlString, currentPlatform) {
            // 防護：剝除 UTF-8 BOM（uFEFF）——BOM 會讓 DOMParser 報
            // 'Unexpected characters outside the root element' 而整個模組 toolbox 被跳過
            xmlString = String(xmlString).replace(/^\uFEFF/, '');

            // 凍結：剔除 SPIKE 分類（2026-09-09，詳 log/plan/SpikeSupportStatus.md）
            // 整個 SPIKE 工具箱以 "SPIKE" 命名分類包裹，偵測到即整組剔除
            if (xmlString.indexOf('SPIKE') !== -1) {
                return '';
            }

            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "text/xml");
            // XML 解析失敗時 DOMParser 會回傳 <parsererror> 文件；若原樣序列化送進 Blockly，
            // 會被當成未知 toolbox item 而拋出 "Unable to find [parsererror][toolboxitem]"。
            // 此處偵測並跳過該模組，同時輸出診斷資訊（parsererror 內文含具體錯誤行/列）。
            const parseErrors = xmlDoc.getElementsByTagName('parsererror');
            if (parseErrors.length > 0) {
                console.error('[Toolbox] XML 解析失敗，已跳過此模組 toolbox。錯誤內容：',
                    (parseErrors[0].textContent || '').slice(0, 300),
                    '\n原始 XML 前 300 字：', String(xmlString).slice(0, 300));
                return '';
            }
            xmlDoc.querySelectorAll('block').forEach(block => {
                const p = block.getAttribute('platform');
                if (p && p !== currentPlatform) block.parentNode.removeChild(block);
            });
            return new XMLSerializer().serializeToString(xmlDoc);
        }
    });
})();
