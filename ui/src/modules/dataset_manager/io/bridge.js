/**
 * Dataset Manager io/bridge.js — Bridge Port（Stage 2）
 *
 * dataset_manager/ 模組內「唯一」允許觸碰 window.CocoyaBridge 的位置。
 * 職責：
 *  - 統一 send / subscribe / request correlation（requestId 或 per-command FIFO）
 *  - timeout / cancel / unsubscribe / dispose，不留幽靈 callback
 *  - VSIX（postMessage）與 Tauri（invoke/event）差異由上層 ui/src/bridge/{base,vsix,tauri}.js 吸收，
 *    兩端的事件都經 _dispatchToFrontend -> onMessage 抵達這裡，因此單一 transport 即涵蓋雙平台。
 *
 * 可測性：createDatasetBridge(transport) 接受注入 transport（fake adapter），
 * Node 測試見 io/bridge.test.mjs。預設 transport 延遲解析 window.CocoyaBridge。
 */

const DEFAULT_TIMEOUT_MS = 30000;

/** 預設 transport：每次呼叫時才讀 window.CocoyaBridge（webview 環境） */
const defaultTransport = {
    send(command, payload) {
        const bridge = typeof window !== 'undefined' ? window.CocoyaBridge : null;
        if (!bridge) throw new Error('[DatasetBridge] window.CocoyaBridge is not available');
        return bridge.send(command, payload);
    },
    onMessage(cb) {
        const bridge = typeof window !== 'undefined' ? window.CocoyaBridge : null;
        if (!bridge) throw new Error('[DatasetBridge] window.CocoyaBridge is not available');
        bridge.onMessage(cb);
    },
    offMessage(cb) {
        const bridge = typeof window !== 'undefined' ? window.CocoyaBridge : null;
        if (!bridge) return;
        bridge.offMessage(cb);
    }
};

function rejectWith(reject, code, message) {
    const err = new Error(message || code);
    err.code = code;
    reject(err);
}

export function createDatasetBridge(transport = defaultTransport) {
    /** @type {Map<string, object>} token -> pending entry（request() 用） */
    const pending = new Map();
    let tokenSeq = 0;
    let internalHandler = null;

    function ensureDispatcher() {
        if (internalHandler) return;
        internalHandler = (msg) => {
            if (!msg || !msg.command) return;
            // 依插入序（FIFO）尋找第一個匹配的 pending request
            for (const entry of pending.values()) {
                if (entry.resultCommand !== msg.command) continue;
                if (entry.requestId != null && msg.requestId !== entry.requestId) continue;
                if (typeof entry.match === 'function' && !entry.match(msg)) continue;
                pending.delete(entry.token);
                if (entry.timer) clearTimeout(entry.timer);
                entry.resolve(msg);
                return;
            }
        };
        transport.onMessage(internalHandler);
    }

    function settle(entry, code, message) {
        if (!pending.has(entry.token)) return;
        pending.delete(entry.token);
        if (entry.timer) clearTimeout(entry.timer);
        rejectWith(entry.reject, code, message);
    }

    const bridge = {
        /** 直接發送 command（不等待回應；回應請用 subscribe/request） */
        send(command, payload = {}) {
            return transport.send(command, payload);
        },

        /** 訂閱事件；回傳 unsubscribe 函式 */
        subscribe(command, handler) {
            const wrapped = (msg) => {
                if (msg && msg.command === command) handler(msg);
            };
            transport.onMessage(wrapped);
            return function unsubscribe() {
                transport.offMessage(wrapped);
            };
        },

        /**
         * 訂閱一次性事件（收到第一筆匹配即解除；逾時 reject TIMEOUT）
         */
        once(command, { timeoutMs = DEFAULT_TIMEOUT_MS, match } = {}) {
            ensureDispatcher();
            return new Promise((resolve, reject) => {
                let timer = null;
                const wrapped = (msg) => {
                    if (!msg || msg.command !== command) return;
                    if (typeof match === 'function' && !match(msg)) return;
                    cleanup();
                    resolve(msg);
                };
                function cleanup() {
                    transport.offMessage(wrapped);
                    if (timer) clearTimeout(timer);
                }
                transport.onMessage(wrapped);
                if (timeoutMs > 0) {
                    timer = setTimeout(() => {
                        transport.offMessage(wrapped);
                        rejectWith(reject, 'TIMEOUT', `[DatasetBridge] once('${command}') timeout after ${timeoutMs}ms`);
                    }, timeoutMs);
                }
            });
        },

        /**
         * 發送 command 並等待 resultCommand 回應。
         * @param {object} opts
         *  - command: 送出的 command 名稱
         *  - payload: 送出內容
         *  - resultCommand: 期待的事件名稱
         *  - requestId: 若後端會回塞 requestId 則以此精準 correlation；否則 per-command FIFO
         *  - match(msg): 額外匹配條件
         *  - timeoutMs: 預設 30000；0 = 不限時
         * @returns {{ promise: Promise<object>, cancel: () => void }}
         */
        request(opts) {
            const { command, payload = {}, resultCommand, requestId = null, match = null, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
            if (!command || !resultCommand) throw new Error('[DatasetBridge] request() requires command & resultCommand');
            ensureDispatcher();
            let resolveFn, rejectFn;
            const promise = new Promise((resolve, reject) => { resolveFn = resolve; rejectFn = reject; });
            const token = 'req_' + (++tokenSeq);
            const entry = { token, resultCommand, requestId, match, resolve: resolveFn, reject: rejectFn, timer: null };
            pending.set(token, entry);
            if (timeoutMs > 0) {
                entry.timer = setTimeout(() => {
                    settle(entry, 'TIMEOUT', `[DatasetBridge] request('${command}' -> '${resultCommand}') timeout after ${timeoutMs}ms`);
                }, timeoutMs);
            }
            const cancel = () => settle(entry, 'CANCELED', `[DatasetBridge] request('${command}') canceled`);
            try {
                transport.send(command, requestId != null ? { ...payload, requestId } : payload);
            } catch (e) {
                settle(entry, 'SEND_FAILED', e.message);
            }
            return { promise, cancel };
        },

        /** 訂閱多個事件；回傳 unsubscribe（一次解除全部） */
        subscribeMultiple(commands, handler) {
            const offs = commands.map((c) => this.subscribe(c, handler));
            return function unsubscribeAll() {
                offs.forEach((off) => off());
            };
        },

        /** 取消所有 pending 與內部 dispatcher（modal 關閉/模組 dispose 時呼叫） */
        dispose() {
            for (const entry of Array.from(pending.values())) {
                settle(entry, 'DISPOSED', '[DatasetBridge] disposed');
            }
            if (internalHandler) {
                transport.offMessage(internalHandler);
                internalHandler = null;
            }
        },

        // --- 既有 Bridge 型別化捷徑（僅轉發，不改變語意） ---
        confirm(message) { return passthrough('confirm', [message]); },
        prompt(message, defaultValue = '') { return passthrough('prompt', [message, defaultValue]); },
        alert(message) { return passthrough('alert', [message]); },
        pickFolder() { return passthrough('pickFolder', []); },
        prepareDatasetImport(sourcePath, projectName, confirmed = false) { return passthrough('prepareDatasetImport', [sourcePath, projectName, confirmed]); },
        loadDatasetProgress(folderPath) { return passthrough('loadDatasetProgress', [folderPath]); },
        saveDatasetProgress(projectName, spec) { return passthrough('saveDatasetProgress', [projectName, spec]); },
        getProjectAnchor() { return passthrough('getProjectAnchor', []); },
        getCapabilities() {
            const bridge = typeof window !== 'undefined' ? window.CocoyaBridge : null;
            return bridge ? bridge.capabilities : null;
        }
    };

    function passthrough(method, args) {
        const bridge = typeof window !== 'undefined' ? window.CocoyaBridge : null;
        if (!bridge || typeof bridge[method] !== 'function') {
            throw new Error(`[DatasetBridge] window.CocoyaBridge.${method} is not available`);
        }
        return bridge[method](...args);
    }

    return bridge;
}

/** 模組單例（webview 環境使用） */
export const datasetBridge = createDatasetBridge();

