/**
 * Cocoya 通訊橋樑 (Bridge) 入口點
 * 根據執行環境 (VSIX 或 Tauri) 自動實例化對應的橋接器
 */
import { BridgeVSIX } from './bridge/vsix.js';
import { BridgeTauri } from './bridge/tauri.js';

let bridge;

// 環境偵測邏輯
const isTauri = !!window.__TAURI_INTERNALS__;
const isVsCode = typeof acquireVsCodeApi === 'function';

if (isTauri) {
    bridge = new BridgeTauri();
} else {
    // 預設採用 VSIX 模式 (若在瀏覽器預覽且無 acquireVsCodeApi 則會報警告但不會崩潰)
    bridge = new BridgeVSIX();
}

// 初始化單例並掛載至全域
bridge.init();
window.CocoyaBridge = bridge;

export default bridge;
