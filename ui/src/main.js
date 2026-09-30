/**
 * Cocoya Webview 主程式 (Entry Point)
 * 核心邏輯已遷移至 app/ 子目錄下的各個模組
 */
(function() {
    // --- 說明文件系統攔截器 ---
    const originalOpen = window.open;
    // 覆寫 window.open 以攔截說明檔連結；簽名必須與瀏覽器 API 一致
    // (url, target, features)，故未使用的參數以底線標示（url 有用到）。
    window.open = function(url, _name, _specs) {
        if (url && !url.startsWith('http') && !url.startsWith('vscode-webview')) {
            const langSuffix = (window.CocoyaApp && window.CocoyaApp.currentLang) ? `_${window.CocoyaApp.currentLang}` : '_zh-hant';
            const helpId = `${url}${langSuffix}`;
            window.CocoyaBridge.send('openHelp', { helpId: helpId });
            return null;
        }
        return originalOpen.apply(this, arguments);
    };

    // 全域暴露與初始化 (CocoyaApp 已由各子模組定義完成)
    if (window.CocoyaApp && typeof window.CocoyaApp.init === 'function') {
        window.CocoyaApp.init();
    } else {
        console.error('[App] Failed to initialize: CocoyaApp.init not found.');
    }
})();
