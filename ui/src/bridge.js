/**
 * Cocoya 通訊橋樑 (Bridge)
 * 封裝 VS Code Webview 與 Tauri 兩種通訊模式
 * 提供統一的介面給前端邏輯呼叫
 */

const CocoyaBridge = {
    // 環境判定
    isVsCode: typeof acquireVsCodeApi === 'function',
    isTauri: typeof window.__TAURI__ !== 'undefined' || (window.__TAURI_INTERNALS__),

    // VS Code API 實體 (僅在 VSIX 模式下存在)
    vscode: null,

    /**
     * 初始化 Bridge
     */
    init() {
        if (this.isVsCode) {
            this.vscode = acquireVsCodeApi();
            console.log('[Bridge] Running in VS Code mode');
        } else if (this.isTauri) {
            console.log('[Bridge] Running in Tauri mode');
        } else {
            console.warn('[Bridge] Running in Browser (Preview) mode');
        }
    },

    /**
     * 發送指令至後端
     * @param {string} command 指令名稱
     * @param {object} data 攜帶的數據
     */
    send(command, data = {}) {
        if (this.isVsCode && this.vscode) {
            this.vscode.postMessage({ command, ...data });
        } else if (this.isTauri) {
            // Tauri 2.0 使用 @tauri-apps/api/core 的 invoke
            // 這裡假設我們將 invoke 綁定在 window.CocoyaTauriInvoke
            if (window.CocoyaTauriInvoke) {
                window.CocoyaTauriInvoke(command, data);
            } else {
                console.error('[Bridge] Tauri invoke not found');
            }
        } else {
            console.log(`[Bridge-Mock] Sending: ${command}`, data);
        }
    },

    /**
     * 監聽後端回傳的訊息
     * @param {function} callback 回調函式
     */
    onMessage(callback) {
        if (this.isVsCode) {
            window.addEventListener('message', (event) => {
                callback(event.data);
            });
        } else if (this.isTauri) {
            // Tauri 使用事件監聽
            if (window.CocoyaTauriListen) {
                window.CocoyaTauriListen('backend-event', (event) => {
                    callback(event.payload);
                });
            }
        }
    },

    /**
     * [快捷 API] 取得 Manifest
     */
    getManifest() {
        this.send('getManifest');
    },

    /**
     * [快捷 API] 儲存檔案
     * @param {string} xml Blockly XML 字串
     * @param {boolean} isDirty 是否有更動
     */
    saveFile(xml, isDirty) {
        this.send('saveFile', { xml, isDirty });
    },

    /**
     * [快捷 API] 執行程式碼
     * @param {string} code Python 程式碼
     * @param {string} platform 目標平台 (PC/CircuitPython)
     * @param {string} serialPort 序列埠名稱
     */
    runCode(code, platform, serialPort) {
        this.send('runCode', { code, platform, serialPort });
    },

    /**
     * [快捷 API] 停止程式執行
     */
    stopCode() {
        this.send('stopCode');
    }
};

// 全域初始化
CocoyaBridge.init();
window.CocoyaBridge = CocoyaBridge;
export default CocoyaBridge;
