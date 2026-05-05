import { BaseBridge } from './base.js';

/**
 * VS Code Extension (VSIX) 專屬橋接實作
 */
export class BridgeVSIX extends BaseBridge {
    constructor() {
        super();
        this.isVsCode = true;
        this.vscode = null;
    }

    /**
     * 初始化 VSIX 通訊
     */
    init() {
        if (typeof acquireVsCodeApi === 'function') {
            this.vscode = acquireVsCodeApi();
            
            // 監聽來自 Host (extension.ts) 的訊息
            window.addEventListener('message', (event) => {
                this._dispatchToFrontend(event.data);
            });
            
            console.log('[Bridge] VSIX mode initialized');
        } else {
            console.error('[Bridge] Failed to initialize VSIX: acquireVsCodeApi is undefined.');
        }
        
        // VSIX 初始化是同步的，直接完成
        this._resolveReady();
    }

    /**
     * 透過 postMessage 發送指令至 VS Code Host
     */
    async send(command, data = {}) {
        await this.ready;
        if (this.vscode) {
            this.vscode.postMessage({ command, ...data });
        } else {
            console.warn(`[Bridge] Cannot send command "${command}": VS Code API not available.`);
        }
    }
}
