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
            // 凍結：剔除 SPIKE 分類（2026-09-09，詳 log/plan/SpikeSupportStatus.md）
            // 整個 SPIKE 工具箱以 "SPIKE" 命名分類包裹，偵測到即整組剔除
            if (xmlString.indexOf('SPIKE') !== -1) {
                return '';
            }

            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "text/xml");
            xmlDoc.querySelectorAll('block').forEach(block => {
                const p = block.getAttribute('platform');
                if (p && p !== currentPlatform) block.parentNode.removeChild(block);
            });
            return new XMLSerializer().serializeToString(xmlDoc);
        }
    });
})();
