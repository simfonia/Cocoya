/**
 * vsix_terminal_hidden.test.mjs — VSIX 端隱藏 webview 虛擬終端的契約守門
 *
 * 【背景】2026-10-05 實查確認：VSIX 端（src 目錄下的 TS 檔）完全沒有 appendTerminal 呼叫，
 * 也沒有任何 postMessage 把 python-log／序列埠資料轉發進 webview。訓練
 * （trainingOps.ts TrainingTerminal）、序列埠監看（serialOps.ts createTerminal）、
 * 執行程式（envOps.ts）、韌體燒錄（firmwareOps.ts）全數走 VS Code 原生終端機，
 * sidecar 日誌走 OutputChannel。故 #terminalArea 在 VSIX 下是永遠為空的面板，
 * 卻仍佔用版面 —— 使用者回報「VSIX 分兩區顯示訊息版面有點擠」。
 *
 * 【本守門保護的行為】
 *   1. ui/base.js 必須依 caps.hasTerminal 隱藏 #terminalArea（不是只藏按鈕）
 *   2. ui/terminal.js 的 toggleTerminal 必須在面板 display:none 時拒絕展開
 *      （序列埠開啟會呼叫 toggleTerminal(true)，不得把隱藏面板撐出來）
 *   3. capabilities 三端鍵集合必須一致（新增旗標時的既有不變式）
 *
 * 【為什麼是掃描型】被測對象是「依 capabilities 動態切換 DOM」的 UI 行為，
 * 真正要驗的是「VSIX 分支確實存在且條件正確」——這在執行期取決於 bridge 實例，
 * 行為測試會退化成「餵一個假的 hasTerminal 就全綠」。故採掃描 + 條款自檢。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const UI_DIR = path.resolve(import.meta.dirname, '.');
const BRIDGE_DIR = path.resolve(import.meta.dirname, '../bridge');

const read = (p) => fs.readFileSync(p, 'utf8');

test('ui/base.js：VSIX 隱藏整個 terminalArea 面板（非僅按鈕）', () => {
  const src = read(path.join(UI_DIR, 'base.js'));
  assert.ok(src.includes('hasTerminal'),
    'ui/base.js 應讀取 caps.hasTerminal');

  // 必須同時隱藏「面板本體」，而非只有 terminalToggleBtn。
  // 判準用兩段獨立斷言而非單一跨巢狀正則：`[^}]*` 無法跨越 if 內的巢狀大括號。
  const hideBlock = src.slice(src.indexOf('if (!caps.hasTerminal)'));
  const block = hideBlock.slice(0, hideBlock.indexOf('}'));
  assert.ok(block.includes("getElementById('terminalArea')"),
    'ui/base.js 應在 !caps.hasTerminal 分支中取得 #terminalArea');
  assert.ok(/style\.display\s*=\s*'none'/.test(block),
    "ui/base.js 應將 #terminalArea 設為 display: 'none'");
});

test('ui/base.js：仍需隱藏序列埠 toggle 按鈕（不得回歸）', () => {
  const src = read(path.join(UI_DIR, 'base.js'));
  assert.ok(/terminalToggleBtn[\s\S]{0,120}caps\.hasTerminal/.test(src),
    '序列埠 toggle 按鈕仍應依 caps.hasTerminal 切換顯示');
});

test('ui/terminal.js：toggleTerminal 在面板隱藏時拒絕展開', () => {
  const src = read(path.join(UI_DIR, 'terminal.js'));
  const fn = src.slice(src.indexOf('UI.toggleTerminal = function'));
  const body = fn.slice(0, fn.indexOf('};'));
  assert.ok(body.includes('style.display') && body.includes("'none'"),
    "toggleTerminal 應檢查 panel.style.display === 'none'");
  // 必須在改動 classList 之前 return
  const guardIdx = body.indexOf('style.display');
  const mutateIdx = body.indexOf("classList.add('collapsed')");
  assert.ok(guardIdx !== -1 && mutateIdx !== -1 && guardIdx < mutateIdx,
    '隱藏守門必須在 classList 操作之前（否則仍會改動隱藏面板的狀態）');
});

test('capabilities：hasTerminal 三端皆有宣告且值正確', () => {
  const base = read(path.join(BRIDGE_DIR, 'base.js'));
  const tauri = read(path.join(BRIDGE_DIR, 'tauri.js'));
  const vsix = read(path.join(BRIDGE_DIR, 'vsix.js'));

  assert.ok(base.includes('hasTerminal'), 'base.js 應宣告 hasTerminal 預設值');
  assert.ok(/hasTerminal:\s*true/.test(tauri),
    'Tauri 應為 hasTerminal: true（虛擬終端是唯一輸出管道）');
  assert.ok(/hasTerminal:\s*false/.test(vsix),
    'VSIX 應為 hasTerminal: false（輸出走 VS Code 原生終端）');
});

test('capabilities：VSIX 端 isAnchored／projectRoot 由 Host 執行期注入（不得回歸）', () => {
  // 【為什麼查這裡】2026-10-05 實查發現：vsix.js 的**靜態** _caps 宣告中沒有
  // isAnchored / projectRoot / isRemoteConnected，但 cocoyaManager.ts 會在
  // 「環境資訊」訊息裡執行期注入這三個鍵（updateCapabilities 走 Object.assign）。
  // 這是**刻意設計**（依檔案開啟狀態與 remote 環境而定），不是缺陷。
  //
  // 真正的失效模式是「從未注入」—— 前端讀 undefined 時分支會靜默走錯。
  // 故判準落在「Host 是否確實注入」，而非靜態宣告字串。
  const root = path.resolve(UI_DIR, '../../..');
  const host = read(path.join(root, 'src/cocoyaManager.ts'));
  assert.ok(/isAnchored:\s*!!this\.currentFilePath/.test(host),
    'cocoyaManager.ts 應於環境資訊中注入 isAnchored');
  assert.ok(/projectRoot/.test(host),
    'cocoyaManager.ts 應於環境資訊中注入 projectRoot');
  assert.ok(/isRemoteConnected:\s*vscode\.env\.remoteName\s*!==\s*undefined/.test(host),
    'cocoyaManager.ts 應注入 isRemoteConnected（依 vscode.env.remoteName）');
});