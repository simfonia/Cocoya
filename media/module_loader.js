/**
 * Cocoya Module Loader
 */

async function loadScript(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

window.CocoyaXMLRequests = new Map();

async function fetchXMLViaHost(moduleId) {
    return new Promise((resolve) => {
        const requestId = Date.now() + Math.random();
        window.CocoyaXMLRequests.set(requestId, resolve);
        window.vsCodeApi.postMessage({ 
            command: 'getModuleToolbox', 
            moduleId: moduleId,
            requestId: requestId
        });
    });
}

async function loadModule(moduleId, mediaUri, lang) {
    try {
        const basePath = `${mediaUri}/modules`;
        console.log(`Loading module: ${moduleId}`);
        
        // 1. 先載入語系檔 (如果有的話)
        if (lang) {
            try {
                await CocoyaLoader.loadScript(`${basePath}/${moduleId}/i18n/${lang}.js`);
            } catch (e) {
                // 如果該模組沒有該語系檔，靜默跳過
            }
        }
        // 2. 載入積木定義與產生器 (注意：moduleId 可能包含路徑如 core/logic)
        // 我們從 moduleId 中提取純檔名部分 (例如 logic)
        const pureId = moduleId.split('/').pop();
        await CocoyaLoader.loadScript(`${basePath}/${moduleId}/${pureId}_blocks.js`);
        await CocoyaLoader.loadScript(`${basePath}/${moduleId}/${pureId}_generators.js`);
        
        return await fetchXMLViaHost(moduleId);
    } catch (error) {
        console.error(`Failed to load module ${moduleId}:`, error);
    }
    return null;
}

window.CocoyaLoader = {
    loadScript: loadScript,

    /**
     * 載入模組並根據平台過濾
     * @param {Object} manifest 模組清單
     * @param {string} mediaUri 基礎路徑
     * @param {string} platform 目標平台 (PC/MCU)
     * @param {string} lang 目前語系
     */
    loadModules: async function(manifest, mediaUri, platform = 'PC', lang) {
        const promises = manifest.modules.map(async (module) => {
            if (module.platforms && !module.platforms.includes(platform)) {
                return null;
            }
            
            const xml = await loadModule(module.id, mediaUri, lang);
            return xml ? { id: module.id, xml: xml } : null;
        });

        const results = await Promise.all(promises);
        return results.filter(res => res !== null);
    }
};