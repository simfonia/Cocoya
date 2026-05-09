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
