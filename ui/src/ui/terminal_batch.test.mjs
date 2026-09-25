/**
 * terminal_batch.test.mjs — 終端機高頻批次渲染與背壓保護測試
 *
 * 驗證 Phase 0 / Phase 3：
 * 1. terminal.js 的有界佇列與批次 flush
 * 2. 高頻呼叫下排程合併，DOM 節點數限制在 1000 行以內
 * 3. 隊列超過 MAX_TERMINAL_QUEUE_SIZE 時丟棄普通 out 日誌並記錄 dropped count
 * 4. err / info 重要訊息永遠保留不丟棄
 * 5. 單一 span 節點超過長度保護時分割為新節點
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const terminalJsPath = path.join(here, 'terminal.js');
const terminalSrc = fs.readFileSync(terminalJsPath, 'utf8');

function createMockEnvironment() {
  const elements = {};

  class MockElement {
    constructor(id) {
      this.id = id;
      this.children = [];
      this.classList = {
        _classes: new Set(),
        contains(cls) { return this._classes.has(cls); },
        add(cls) { this._classes.add(cls); },
        remove(cls) { this._classes.delete(cls); }
      };
      this.textContent = '';
      this.scrollTop = 0;
      this.scrollHeight = 0;
      this.className = '';
      this.style = {};
      this.onclick = null;
    }

    get lastElementChild() {
      return this.children.length > 0 ? this.children[this.children.length - 1] : null;
    }

    get firstChild() {
      return this.children.length > 0 ? this.children[0] : null;
    }

    appendChild(child) {
      if (child.nodeType === 'DocumentFragment') {
        for (const c of child.children) {
          this.children.push(c);
        }
        child.children = [];
      } else {
        this.children.push(child);
      }
      this.scrollHeight = this.children.length * 20;
      return child;
    }

    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        this.children.splice(idx, 1);
      }
      return child;
    }

    querySelector() { return null; }
  }

  class MockFragment {
    constructor() {
      this.nodeType = 'DocumentFragment';
      this.children = [];
    }
    get childNodes() { return this.children; }
    appendChild(child) {
      this.children.push(child);
      return child;
    }
  }

  const content = new MockElement('terminalContent');
  const panel = new MockElement('terminalArea');
  elements['terminalContent'] = content;
  elements['terminalArea'] = panel;

  const mockDoc = {
    getElementById(id) {
      if (!elements[id]) {
        elements[id] = new MockElement(id);
      }
      return elements[id];
    },
    createElement(tag) {
      return new MockElement(tag);
    },
    createDocumentFragment() {
      return new MockFragment();
    },
    body: new MockElement('body')
  };

  const windowStub = {
    document: mockDoc,
    CocoyaUI: {},
    requestAnimationFrame: (cb) => {
      // 在測試中記錄排程次數
      windowStub._rafCount = (windowStub._rafCount || 0) + 1;
      return setTimeout(cb, 0);
    },
    cancelAnimationFrame: (id) => clearTimeout(id),
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  // 載入 terminal.js
  const fn = new Function('window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', terminalSrc);
  fn(windowStub, mockDoc, windowStub.requestAnimationFrame, windowStub.cancelAnimationFrame, setTimeout, clearTimeout);

  return { UI: windowStub.CocoyaUI, content, panel, windowStub };
}

test('terminal batch: single log is flushed correctly', () => {
  const { UI, content } = createMockEnvironment();
  UI.appendTerminal('hello world', 'out');
  UI.flushTerminal();

  assert.equal(content.children.length, 1);
  assert.equal(content.children[0].className, 'term-out');
  assert.equal(content.children[0].textContent, 'hello world');
});

test('terminal batch: merges high-frequency logs and enforces 1000 max lines limit', () => {
  const { UI, content } = createMockEnvironment();

  // 灌入 2500 筆換行日誌（不以 newline 結尾，每筆 append 應先插入 \n 或建立新 span）
  for (let i = 0; i < 2500; i++) {
    UI.appendTerminal(`log line ${i}\n`, 'out');
  }
  UI.flushTerminal();

  // 驗證行數上限不超過 1000
  assert.ok(content.children.length <= 1000, `children length ${content.children.length} should <= 1000`);
  // 自動捲動有被更新
  assert.ok(content.scrollTop > 0);
});

test('terminal queue: drops ordinary out logs and injects warning when queue is saturated, while preserving errors', () => {
  const { UI, content } = createMockEnvironment();

  // 灌入 800 筆普通 out（超過 MAX_TERMINAL_QUEUE_SIZE 600）+ 1 筆關鍵 err
  for (let i = 0; i < 800; i++) {
    UI.appendTerminal(`stream chunk ${i}\n`, 'out');
  }
  UI.appendTerminal('CRITICAL ERROR\n', 'err');

  assert.ok(UI._terminalDroppedCount > 0, '應有被丟棄的普通日誌計數');

  UI.flushTerminal();

  // 驗證有注入 Warning 訊息
  const allText = content.children.map(c => c.textContent).join(' ');
  assert.ok(allText.includes('Cocoya Warning'), '日誌中應包含丟棄警告提示');
  // 驗證關鍵錯誤絕對沒有被丟棄
  assert.ok(allText.includes('CRITICAL ERROR'), '關鍵錯誤必須被保留');
});

test('terminal node length: splits node if single span exceeds MAX_SPAN_TEXT_LEN', () => {
  const { UI, content } = createMockEnvironment();

  // 單筆很長的文字 15000 字元兩次
  const huge1 = 'A'.repeat(15000);
  const huge2 = 'B'.repeat(15000);
  UI.appendTerminal(huge1, 'out');
  UI.appendTerminal(huge2, 'out');
  UI.flushTerminal();

  // 兩筆總和 30000 超過 MAX_SPAN_TEXT_LEN (20000)，應分割成兩個 span 節點而非無上限擴大單一節點
  assert.equal(content.children.length, 2);
  assert.equal(content.children[0].textContent.length, 15000);
  assert.equal(content.children[1].textContent.length, 15000);
});
