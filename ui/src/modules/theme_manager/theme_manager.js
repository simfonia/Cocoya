/**
 * Cocoya Theme Manager 模組
 * 主題註冊表 (registry) + 模式切換 (auto/指定主題) + 系統深淺色偵測同步
 *
 * 設計原則：
 * - 一個主題 = 一個檔案（themes/ 下各自 registerTheme），不做 light/dark 成對結構
 * - auto 是「模式」不是主題：動態解析成當下系統深淺相符的主題
 * - 自訂主題未來只需 registerTheme({ id, cssVars, blockly }) 即插即用
 */
(function() {
    'use strict';

    var MODE_KEY = 'cocoya_theme_mode';

    var CocoyaTheme = {
        /** @type {Object.<string, Object>} 主題註冊表 */
        _themes: {},
        _lastAppliedId: null,

        /**
         * 註冊主題（themes/*.js 於載入時呼叫）
         * @param {{id:string, labelKey?:string, labelFallback?:string, isDark?:boolean,
         *          hideGrid?:boolean, blockly?:Object, cssVars?:Object}} def
         */
        registerTheme: function(def) {
            if (!def || !def.id) return;
            this._themes[def.id] = def;
        },

        /**
         * 取得已註冊主題清單（供 UI 下拉選單動態生成）
         * @returns {Array<{id:string,labelKey:(string|undefined),labelFallback:string,isDark:boolean}>}
         */
        getThemes: function() {
            var list = [];
            for (var id in this._themes) {
                var t = this._themes[id];
                list.push({
                    id: id,
                    labelKey: t.labelKey,
                    labelFallback: t.labelFallback || id,
                    isDark: !!t.isDark
                });
            }
            return list;
        },

        getTheme: function(id) {
            return this._themes[id] || null;
        },

        /**
         * 取得目前模式偏好；舊版值 light/dark 遷移為 cocoya_light/cocoya_dark
         * @returns {string} 'auto' 或主題 id
         */
        getMode: function() {
            var m = 'auto';
            try { m = localStorage.getItem(MODE_KEY) || 'auto'; } catch (e) { }
            if (m === 'light') m = 'cocoya_light';
            else if (m === 'dark') m = 'cocoya_dark';
            return m;
        },

        /**
         * 儲存模式偏好並重載 webview（方案 B：積木色於註冊前由 Msg 決定，需重載才一致）。
         * 2026-09-05：一律直接保留——reload 前先快照 workspace，還原後不問、不捨棄
         * （原 dirty 三選對話框已移除；快照涵蓋 dirty 與乾淨兩種狀態，還原內容即當前內容）。
         * @returns {Promise<void>}
         */
        setMode: async function(mode) {
            var app = window.CocoyaApp;
            // 一律直接保留：快照後 reload（dirty 保留未存修改；乾淨時快照=當前內容，無副作用）
            if (app && app.snapshotWorkspaceForReload) app.snapshotWorkspaceForReload();

            try { localStorage.setItem(MODE_KEY, mode); } catch (e) { }
            console.log('[ThemeManager] setMode ->', mode);
            // VSIX 的 webview 沒有真實文件 URL，location.reload() 會白屏 → 交由 host 重建 HTML
            if (window.CocoyaBridge && typeof window.CocoyaBridge.send === 'function') {
                window.CocoyaBridge.send('reloadWebview');
                // 保險絲：host 成功重建時本頁銷毀、計時器自動失效；指令若遺失則強制重載兜底
                setTimeout(function() {
                    console.warn('[ThemeManager] reloadWebview 未生效，fallback location.reload()');
                    location.reload();
                }, 800);
            } else {
                location.reload();
            }
        },

        _escapeHtml: function(text) {
            var div = document.createElement('div');
            div.textContent = text == null ? '' : String(text);
            return div.innerHTML;
        },

        /**
         * 將目前偏好主題的 msgColours 覆寫進 Blockly.Msg（COLOUR_* 鍵）。
         * 必須在語系檔載入後、模組積木註冊前呼叫（lifecycle.initializeCocoya）。
         * 未提供覆寫的鍵保留 i18n 預設值 → 新分類漏定義也不會壞。
         */
        applyMsgColours: function() {
            if (typeof Blockly === 'undefined' || !Blockly.Msg) return;
            var themeId = this.resolveActiveThemeId();
            var theme = themeId ? this._themes[themeId] : null;
            if (!theme || !theme.msgColours) return;
            for (var key in theme.msgColours) {
                var value = theme.msgColours[key];
                if (value) Blockly.Msg['COLOUR_' + key] = value;
            }
        },

        /** 注入/移除主題專屬 CSS（單一 <style> 元素，換主題整個替換） */
        _applyThemeCss: function(theme) {
            var id = 'cocoya-theme-css';
            var el = document.getElementById(id);
            var cssText = (theme && theme.css) ? theme.css : '';
            if (!cssText) {
                if (el && el.parentNode) el.parentNode.removeChild(el);
                return;
            }
            if (!el) {
                el = document.createElement('style');
                el.id = id;
                document.head.appendChild(el);
            }
            el.textContent = cssText;
        },
        /** 偵測系統/VS Code 是否深色 */
        _detectSystemDark: function() {
            var isVSCodeDark = document.body.classList.contains('vscode-dark') ||
                               document.body.classList.contains('vscode-high-contrast');
            return isVSCodeDark ||
                   (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
        },



        /**
         * 解析目前應套用的主題 id：
         * mode 為具體 id 且該主題存在 → 直接採用；否則依系統深淺挑 isDark 相符的主題
         */
        resolveActiveThemeId: function() {
            var mode = this.getMode();
            if (mode !== 'auto' && this._themes[mode]) return mode;
            var preferDark = this._detectSystemDark();
            for (var id in this._themes) {
                if (!!this._themes[id].isDark === preferDark) return id;
            }
            return Object.keys(this._themes)[0] || null;
        },

        /**
         * 套用目前應有的主題（body class + CSS 變數 + Blockly Theme + grid/minimap）
         * @param {boolean} [force] 強制重套（跳過「主題未變」短路）
         */
        apply: function(force) {
            var themeId = this.resolveActiveThemeId();
            var theme = themeId ? this._themes[themeId] : null;
            var isDark = theme ? !!theme.isDark : false;

            // 同步 body class，供樣式表深/淺色變體使用
            document.body.classList.toggle('cocoya-dark-mode', isDark);
            document.body.classList.toggle('cocoya-light-mode', !isDark);

            // 套用主題 CSS 變數（inline style 優先於樣式表；自訂主題給一組變數即可換膚）
            if (theme && theme.cssVars) {
                for (var v in theme.cssVars) {
                    document.body.style.setProperty(v, theme.cssVars[v]);
                }
            }

            if (!force && themeId === this._lastAppliedId) return;

            var app = window.CocoyaApp;
            // 主題 CSS 注入不依賴 workspace，先於短路前處理
            this._applyThemeCss(theme);
            if (!app || !app.workspace || typeof Blockly === 'undefined') return;
            // ★ workspace 就緒後才記錄「已套用」，避免啟動初期空轉後被短路
            this._lastAppliedId = themeId;

            try {
                var themeObj = null;
                if (theme && theme.blockly && theme.blockly.componentStyles &&
                        typeof Blockly.Theme === 'function') {
                    // 惰性建立 Blockly.Theme 實例並快取於定義上
                    if (!theme._blocklyInstance) {
                        theme._blocklyInstance = new Blockly.Theme(
                            theme.blockly.name || themeId,
                            theme.blockly.blockStyles || {},
                            theme.blockly.categoryStyles || {},
                            theme.blockly.componentStyles
                        );
                    }
                    themeObj = theme._blocklyInstance;
                } else {
                    themeObj = (Blockly.Themes && Blockly.Themes.Classic) || 'classic';
                }
                app.workspace.setTheme(themeObj);
                var grid = app.workspace.getGrid();
                if (grid && typeof grid.setVisible === 'function') {
                    grid.setVisible(!(theme && theme.hideGrid));
                }
                if (app.minimap && app.minimap.minimapWorkspace) {
                    app.minimap.minimapWorkspace.setTheme(themeObj);
                }
            } catch (e) { }
        },

        /** 啟動系統深淺色偵測（VS Code body class + prefers-color-scheme），僅需呼叫一次 */
        startWatching: function() {
            if (this._watching) return;
            this._watching = true;
            var self = this;
            var observer = new MutationObserver(function(mutations) {
                for (var i = 0; i < mutations.length; i++) {
                    if (mutations[i].type === 'attributes' &&
                            mutations[i].attributeName === 'class') {
                        self.apply();
                        break;
                    }
                }
            });
            observer.observe(document.body, { attributes: true });
            if (window.matchMedia) {
                window.matchMedia('(prefers-color-scheme: dark)')
                    .addEventListener('change', function() { self.apply(); });
            }
        }
    };

    window.CocoyaTheme = CocoyaTheme;
})();
