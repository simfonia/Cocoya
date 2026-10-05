/**
 * terminal_capacity.test.mjs — 終端機「字元總量」上限守門
 *
 * 【背景／真實 bug】使用者回報：Tauri 下跑 `while True: print("hello")` 會塞住序列埠。
 * Rust 端（commands/mcu/stream.rs）已有位元組節流，前端（terminal.js）也有
 * 「佇列 600 筆」與「1000 行 children」兩道保護 —— 但**都沒有限制字元總量**。
 *
 * 【缺陷根因】terminal.js 的 flushTerminal 有「同類型合併到同一 span」最佳化：
 *   curLast.textContent += '\n' + text
 * 而行數保護是 `content.children.length - 1000`（**節點數**，不是字元數）。
 * 兩者相乘 → 1000 個 span × 每個最多 MAX_SPAN_TEXT_LEN(20000) 字元
 *          = **最多 2000 萬字元**留在 DOM。
 * 瀏覽器渲染 2000 萬字元的文字節點必然卡死，使用者只能手動按「清除」才能恢復。
 *
 * 【本守門的判準】真正的容量不變式是「**DOM 內字元總量**」，不是節點數。
 * 直接量測 DOM 實際字元數，而非掃描原始碼字串（節點數上界推算會與實際
 * 合併最佳化脫節）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const terminalJsPath = path.join(here, 'terminal.js');
const src = fs.readFileSync(terminalJsPath, 'utf8');



/** 建立可控的 terminalContent 元素（記錄 childNodes 與字元總量）。 */
function makeContent() {
  const node = {
    children: [],
    childNodes: [],
    textContent: '',
    scrollTop: 0,
    scrollHeight: 0,
    classList: { _s: new Set(), contains(c) { return this._s.has(c); }, add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); } },
    lastElementChild: null,
    get firstChild() { return this.children[0] || null; },
    // terminal.js 以 DocumentFragment 批次加入：fragment.childNodes 才是真正的節點。
      // appendChild(fragment) 時必須把 fragment 內的**所有子節點**攤平到容器，
      // 否則整批日誌會變成「一個節點、文字全在 undefined」——測試會假綠。
      appendChild(child) {
        const nodes = (child && child.childNodes && child.childNodes.length)
          ? child.childNodes : [child];
        for (const n of nodes) { this.children.push(n); this.childNodes.push(n); }
        this.lastElementChild = this.children[this.children.length - 1] || null;
      },
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
      this.lastElementChild = this.children[this.children.length - 1] || null;
      return child;
    },
    /** 模擬 flushTerminal 讀到的「最後一個節點」；null 代表空容器。 */
    getLastChildText() {
      const last = this.lastElementChild;
      return last ? (last.textContent || '') : '';
    },
  };
  return node;
}

/** 執行 terminal.js 於沙箱，並把 terminalContent 換成可控 mock。 */
function setup(content) {
  const sandbox = {
    document: {
      getElementById: (id) => (id === 'terminalContent' ? content : null),
      createElement: (tag) => {
        const el = {
          tagName: tag,
          className: '',
          textContent: '',
          childNodes: [],
          classList: { _s: new Set(), contains(c) { return this._s.has(c); }, add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); } },
          appendChild(c) { this.childNodes.push(c); },
        };
        return el;
      },
      createDocumentFragment: () => ({
        childNodes: [],
        get firstChild() { return this.childNodes[0] || null; },
        appendChild(c) { this.childNodes.push(c); },
      }),
      addEventListener() {},
      querySelector: () => null,
    },
    window: { addEventListener() {}, CocoyaUI: null, Blockly: null },
    console, setTimeout: () => 0, clearTimeout: () => {},
    requestAnimationFrame: (cb) => { cb(); return 1; },
    cancelAnimationFrame: () => {},
  };
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  const UI = sandbox.window.CocoyaUI;
  UI._terminalQueue = [];
  UI._terminalDroppedCount = 0;
  return UI;
}

test('DOM 字元總量有明確上限（不是只有節點數上限）', () => {
  // 判準落在「量測實際 DOM 字元數」，而非掃描常數字串。
  const MAX_CHARS = 400000;

  const content = makeContent();
  const UI = setup(content);

  // 模擬 `while True: print("hello")`：持續灌入大量 'out' 型短行
  const line = 'hello\n';
  for (let round = 0; round < 200; round++) {
    for (let i = 0; i < 600; i++) {
      UI.appendTerminal(line, 'out', false);
    }
    UI.flushTerminal();
  }

  const totalChars = content.children.reduce((s, c) => s + (c.textContent || '').length, 0);
  assert.ok(totalChars <= MAX_CHARS,
    `DOM 字元總量應 <= ${MAX_CHARS}，實得 ${totalChars}（${content.children.length} 個節點）。` +
    `節點數上限無法限制字元量：1000 節點 × 20000 字元 = 2000 萬字元會卡死瀏覽器。`);
});

test('超量時會從最舊節點開始修剪（保留最新輸出）', () => {
  const content = makeContent();
  const UI = setup(content);

  UI.appendTerminal('第一行\n', 'out', false);
  UI.flushTerminal();
  for (let i = 0; i < 3000; i++) {
    UI.appendTerminal(`第${i}行\n`, 'out', false);
    if (i % 600 === 0) UI.flushTerminal();
  }
  UI.flushTerminal();

  const totalChars = content.children.reduce((s, c) => s + (c.textContent || '').length, 0);
  const allText = content.children.map(c => c.textContent).join('');
  assert.ok(totalChars <= 400000, `修剪後字元總量應受控，實得 ${totalChars}`);
  assert.ok(!allText.includes('第一行'),
    '最舊的輸出應已被修剪（保留最新輸出）');
  assert.ok(allText.includes('第2999行'),
    '最新的輸出必須保留');
});

test('err / info 等重要訊息不受丟棄與修剪影響', () => {
  const content = makeContent();
  const UI = setup(content);

  // 先灌入大量 out 造成修剪
  for (let i = 0; i < 5000; i++) {
    UI.appendTerminal(`填充${i}\n`, 'out', false);
    if (i % 600 === 0) UI.flushTerminal();
  }
  UI.flushTerminal();
  // 再送一則 err
  UI.appendTerminal('關鍵錯誤\n', 'err', false);
  UI.flushTerminal();

  const allText = content.children.map(c => c.textContent).join('');
  assert.ok(allText.includes('關鍵錯誤'), 'err 訊息必須保留');
});