/**
 * ui/src/bridge/tauri/sendHandlers.js — send() 指令處理器註冊表（P2-1 拆檔，2026-10-03）
 *
 * 【本檔存在的理由】
 * 原 `BridgeTauri.send()` 是 **1025 行、58 個 case 的單一 switch**（佔全文 55%）。
 * 每新增一個後端指令就要在這個大檔的 switch 中插一段，衝突與回歸風險隨之上升。
 * 改為「command → 函式」對照表後，新增指令只需在本表增加一行。
 *
 * 【本檔是 SSOT：command 集合的唯一事實來源】
 * `sendHandlers` 的鍵集合 = Tauri 端支援的 command 全集。
 * 守門 `bridge_split_contract.test.mjs` 會比對「本表鍵集合」與「原 tauri.js 的 case 集合」
 * 必須**完全一致**（集合比對，非數量下限 —— 見 P2-5 教訓）。
 *
 * 【分組模組】
 * 各群組檔案以具名 export 函式提供 handler；本檔扁平合併成單一對照表。
 * 群組劃分依實際 case 分佈，非按檔案操作／事件分類（見 log/plan/BridgeTauri_Split.md §3）。
 *
 * 【呼叫慣例】
 * 統一為 `handler.call(this, command, data)`，與原 switch 內的 `this.` 完全等價。
 *
 * 【fallthrough 組】
 * 原 switch 有 4 組「多 case 共用同一段 body」的 fallthrough（`refreshSerialPorts`、
 * `saveFile`、`alert`/`confirm`、`newFile`）。在本表中以「指向同一函式」表達，
 * **不可拆成兩個函式** —— 原空殼 case 拆開後不會報錯，只會靜默失效。
 */
import * as backup from './backup.js';
import * as manifest from './manifest.js';
import * as windowOps from './window.js';
import * as firmware from './firmware.js';
import * as serial from './serial.js';
import * as codeRun from './codeRun.js';
import * as pythonEnv from './pythonEnv.js';

export const sendHandlers = {
    ...backup,
    ...manifest,
    ...windowOps,
    ...firmware,
    ...serial,
    ...codeRun,
    ...pythonEnv
};

/**
 * 查詢某 command 的 handler。
 * @param {string} command
 * @returns {((command: string, data: object) => Promise<void>)|undefined}
 */
export function getSendHandler(command) {
    return Object.prototype.hasOwnProperty.call(sendHandlers, command)
        ? sendHandlers[command]
        : undefined;
}
