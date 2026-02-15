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

async function loadModule(moduleId, basePath) {
    try {
        console.log(`Loading module: ${moduleId}`);
        // 改用具辨識度的檔名：moduleId_blocks.js
        await loadScript(`${basePath}/${moduleId}/${moduleId}_blocks.js`);
        await loadScript(`${basePath}/${moduleId}/${moduleId}_generators.js`);
        
        return await fetchXMLViaHost(moduleId);
    } catch (error) {
        console.error(`Failed to load module ${moduleId}:`, error);
    }
    return null;
}

window.CocoyaLoader = {
    /**
     * 載入模組並根據平台過濾
     * @param {Object} manifest 模組清單
     * @param {string} corePath 基礎路徑
     * @param {string} platform 目標平台 (PC/MCU)
     */
    loadModules: async function(manifest, corePath, platform = 'PC') {
        const toolboxes = [];
        for (const module of manifest.modules) {
            // 如果模組定義了平台限制，且目前平台不在其中，則跳過
            if (module.platforms && !module.platforms.includes(platform)) {
                continue;
            }
            
            const toolbox = await loadModule(module.id, corePath);
            if (toolbox) toolboxes.push(toolbox);
        }
        return toolboxes;
    }
};