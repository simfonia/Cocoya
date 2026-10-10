import { BaseBridge } from './base.js';
// [P2-1 2026-10-03] send() 的 command → 函式對照表（command 集合的 SSOT）。
// 已遷移的 command 在此攔截，未遷移的仍走下方 switch（漸進式遷移，見 send() 註解）。
import { getSendHandler } from './tauri/sendHandlers.js';

/**
 * Tauri 桌面應用專屬橋接實作
 */
import { getSetting, SETTINGS_KEY } from '../core/settingsApi.js';

export class BridgeTauri extends BaseBridge {
    constructor() {
        super();
        this.isTauri = true;
        this.tauriInvoke = null;
        this.tauriListen = null;
        this.tauriGetCurrent = null;
        this._firstLogReceived = false;
        this._isClosing = false;
        this._datasetUploadChain = Promise.resolve();
        this._anchor = null; // { isAnchored, projectRoot } 由 init() 從後端取得
        this._serialMonitorSnapshot = { generation: 0, revision: 0 };
    }

    /**
     * 獲取環境功能清單 (Tauri)
     *
     * 契約：兩個橋的 capabilities 必須回傳**同一組鍵**（值可不同），
     * 否則前端「Tauri vs VSIX 走不同分支」會在欄位缺失時靜默失效。
     * 2026-10-01（P2-6-b）：補上 isRemoteConnected（Tauri 固定 false —— 沒有 VS Code
     * remote 環境；VSIX 端由 cocoyaManager.ts 依 vscode.env.remoteName 注入 _caps）。
     */
    get capabilities() {
        return {
            hasTerminal: true,
            canClose: true,
            supportsAutoUpdate: true,
            supportsFirmwareReset: true,
            supportsEnvironmentCheck: true,
            supportsEraseFS: false,
            // 2026-10-01：Tauri 具備 restore_examples command（Resource → AppData 強制覆寫）
            supportsRestoreExamples: true,
            // 2026-10-10（Editor C-1）：Tauri 獨有純文字模式（VSIX 直接用 VS Code 開 .py）
            supportsTextEditor: true,
            isTauri: true,
            isRemoteAware: true, // Tauri 亦保留雲端/SSH 擴充可能性
            isRemoteConnected: false,
            isAnchored: !!(this._anchor && this._anchor.isAnchored),
            projectRoot: (this._anchor && this._anchor.projectRoot) || null
        };
    }

    /**
     * 初始化 Tauri 通訊與監聽器
     */
    async init() {
        try {
            // 動態導入 Tauri 2.0 API，確保在非 Tauri 環境下不會報錯
            const { invoke } = await import('@tauri-apps/api/core');
            const { listen } = await import('@tauri-apps/api/event');
            const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
            
            this.tauriInvoke = invoke;
            this.tauriListen = listen;
            this.tauriGetCurrent = getCurrentWebviewWindow;
            
            // 取得專案根錨定狀態（供 Startup Home / Dataset Manager 查詢）
            try {
                this._anchor = this._normalizeAnchor(await this.tauriInvoke('get_project_anchor'));
            } catch (e) {
                console.error('[Bridge] Failed to get project anchor:', e);
                this._anchor = null;
            }
            
            await this._setupTauriListeners();
            console.log('[Bridge] Tauri mode initialized');
            this._resolveReady();
        } catch (e) {
            console.error('[Bridge] Failed to load Tauri API:', e);
            this._resolveReady(); // 即使失敗也要 resolve 以免前端卡死
        }
    }

    /**
     * 處理 Tauri 指令分發
     */
    /**
     * 處理 Tauri 指令分發
     *
     * [P2-1 2026-10-03] 採**漸進式遷移**：已搬至子模組的 command 走 handler 對照表，
     * 未搬的仍留在下方 switch。每完成一組遷移就從 switch 移除對應 case，
     * 全部搬完時整個 switch 與 `result` 變數一併刪除。
     * 分派機制刻意與原 switch **逐項等價**：
     *   - 未命中的 command 落入 switch，行為完全不變
     *   - 例外 → 同一則 console.error ＋ resetFirmware 的 alert（兩者皆原樣保留）
     *   - **不回傳** handler 結果：原 `let result` 從未 `return`（實測 0 處 `return result`），
     *     `base.js` 呼叫端也只 await promise 等副作用完成。故本方法 resolve 值恆為 undefined。
     */
    async send(command, data = {}) {
        await this.ready;
        if (!this.tauriInvoke) return;

        try {
            // ── 已遷移至 tauri/*.js 的 command ──
            const handler = getSendHandler(command);
            if (handler) {
                await handler.call(this, command, data);
                return;
            }

            // ── 尚未遷移的 command（下方 switch）──
            switch (command) {
                default:
                    console.warn(`[Bridge] Command "${command}" not handled in Tauri mode`);
                    break;
            }
        } catch (e) {
            console.error(`[Bridge] Error processing command "${command}":`, e);
            if (command === 'resetFirmware') {
                this.alert((window.Blockly?.Msg['MSG_FIRMWARE_BURN_FAILED'] || 'Failed: ') + e);
            }
        }
    }

    // --- Tauri 專屬私有方法 ---

    async _setupTauriListeners() {
        if (!this.tauriListen || !this.tauriGetCurrent) return;

        try {
            const appWindow = this.tauriGetCurrent();
            this._appWindow = appWindow; // 供 closeEditor（toolbar 關閉）復用同一關閉流程
            
            // 監聽後端發來的「要關了」請求 (由 Rust 攔截 X 按鈕觸發)
            await appWindow.listen('closeRequested', () => {
                this._handleCloseDialog();
            });

            // 視窗焦點/失焦偵測（方案 B：多視窗自動交接串列埠監控）。
            // document blur 於視窗層級失焦時觸發（切換到別的 Cocoya 視窗/其他應用），
            // 呼叫後端釋放（blur）或重取（focus）monitor。
            const doc = window.document;
            if (doc && this.tauriInvoke) {
                doc.addEventListener('blur', () => {
                    if (this.tauriInvoke) {
                        this.tauriInvoke('set_window_focus', {
                            focused: false,
                            rawDumpEnabled: getSetting(SETTINGS_KEY.SERIAL_RAW_DUMP_ENABLED)
                        }).catch(() => {
                            // 失焦時釋放序列埠失敗不需打擾使用者（可能本就沒有 monitor）。
                        });
                    }
                });
                doc.addEventListener('focus', () => {
                    if (this.tauriInvoke) {
                        this.tauriInvoke('set_window_focus', {
                            focused: true,
                            rawDumpEnabled: getSetting(SETTINGS_KEY.SERIAL_RAW_DUMP_ENABLED)
                        }).catch(() => {
                            // 重新取得序列埠失敗（埠被拔除／被其他程式佔用）時靜默，
                            // 使用者再次點擊序列埠選單即可重試。
                        });
                    }
                });
            }

            // 監聽日誌
            await appWindow.listen('python-log', (event) => {
                if (!this._firstLogReceived) {
                    this._firstLogReceived = true;
                    if (window.CocoyaUI) window.CocoyaUI.hideLoadingModal();
                }
                // 生資料轉發：Rust 端已整行緩衝，此處僅剝除 \r（Raw REPL 輸出），空白行由
                // deploy/base.py 統一控制（含「OK 後補一行」），不再做壓平/跨區塊猜測。
                let payload = event.payload;
                if (typeof payload === 'string') {
                    payload = payload.replace(/\r/g, '');
                }
                if (window.CocoyaUI) {
                    // 等待連線的點點（"."）以 inline 模式附加，避免每點獨立一行
                    if (typeof payload === 'string' && payload.trim() === '.') {
                        window.CocoyaUI.appendTerminal('.', 'out', true);
                    } else {
                        window.CocoyaUI.appendTerminal(payload, 'out');
                    }
                }

                // 解析訓練結果 RESULT: {...} 格式（由 classifier_train.py 輸出）
                // 注意：輸出可能以 \n 開頭，需用 includes + indexOf 定位
                const text = payload || '';
                const resultIdx = text.indexOf('RESULT:');
                if (resultIdx !== -1) {
                    try {
                        const result = JSON.parse(text.substring(resultIdx + 7).trim());
                        console.log('[Bridge] Training result detected:', result);
                        this._dispatchToFrontend({ command: 'trainingComplete', ...result });
                    } catch (e) {
                        console.warn('[Bridge] Failed to parse training result:', e);
                    }
                }
            });

            await appWindow.listen('python-error', (event) => {
                this._firstLogReceived = true;
                if (window.CocoyaUI) window.CocoyaUI.hideLoadingModal();
                if (window.CocoyaUI) window.CocoyaUI.appendTerminal(event.payload, 'err');
            });

            // Python 套件安裝輸出（Rust 以 emit_to 精準單播，僅本視窗）
            // 刻意不送往底部終端機：環境設定 modal 是 z-index 10050 的全幕遮罩，
            // 會把終端機面板完全蓋住——這正是「看不到安裝進度」的根因之一。
            await appWindow.listen('install-module-log', (event) => {
                this._dispatchToFrontend({ command: 'installModuleLog', ...(event.payload || {}) });
            });

            // 安裝結束（真實結束訊號，取代舊版前端「猜 5 秒」）
            await appWindow.listen('install-module-done', (event) => {
                this._dispatchToFrontend({ command: 'installModuleDone', ...(event.payload || {}) });
            });

            // 序列埠熱插拔輪詢：埠清單變化（全域事實）→ 走既有 serialPortsData 流程
            // （updateSerialPorts 會自動選埠/切板；偵測到埠即顯示，無需手動按偵測）
            await appWindow.listen('serial-ports-changed', (event) => {
                this._dispatchToFrontend({ command: 'serialPortsData', ports: event.payload || [] });
            });

            // 序列監看狀態由 Rust generation/revision 管理；事件以 emit_to 僅送至本視窗。
            await appWindow.listen('serial-monitor-state', (event) => {
                this._applySerialMonitorSnapshot(event.payload);
            });

            // 監聽 sidecar 事件（如 cameraStatus 變化）
            await appWindow.listen('sidecar-event', (event) => {
                try {
                    const payload = typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload);
                    const parsed = JSON.parse(payload);
                    // 將 sidecar event 轉為前端可理解的格式
                    if (parsed.type === 'event' && parsed.event) {
                        // D4 遠端訓練日誌：保留原名轉發（base.js onTrainingLog / trainingError 監聽）
                        // 注意：sidecar send_event 把 message 放在頂層（{type,event,message}），非 data 子物件
                        if (parsed.event === 'trainingLog') {
                            this._dispatchToFrontend({
                                command: 'trainingLog',
                                message: parsed.message || (parsed.data && parsed.data.message) || ''
                            });
                            return;
                        }
                        const command = 'dataset' + parsed.event.charAt(0).toUpperCase() + parsed.event.slice(1);
                        this._dispatchToFrontend({
                            command,
                            success: parsed.running !== undefined ? parsed.running : true,
                            ...parsed
                        });
                    }
                } catch (e) {
                    console.warn('[Bridge] Failed to parse sidecar event:', e);
                }
            });

            // 必須在 state event listener 註冊後查 snapshot；若期間收到較新的事件，
            // _applySerialMonitorSnapshot 會以 generation/revision 拒絕舊 snapshot。
            if (this.tauriInvoke) {
                try {
                    const snapshot = await this.tauriInvoke('get_serial_monitor_state');
                    this._applySerialMonitorSnapshot(snapshot);
                } catch (e) {
                    console.warn('[Bridge] Failed to get serial monitor state:', e);
                }
            }
        } catch (e) {
            console.error('[Bridge] Failed to setup Tauri listeners:', e);
        }
    }

    _applySerialMonitorSnapshot(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return;
        const generation = Number(snapshot.generation) || 0;
        const revision = Number(snapshot.revision) || 0;
        const current = this._serialMonitorSnapshot;
        if (generation < current.generation
            || (generation === current.generation && revision < current.revision)) return;
        this._serialMonitorSnapshot = { generation, revision };
        if (window.CocoyaUI && window.CocoyaUI.setSerialMonitorState) {
            window.CocoyaUI.setSerialMonitorState(snapshot);
        }
    }

    // 2026-09-30 移除未使用的 appWindow 參數（兩個呼叫點傳的都是 this._appWindow，
    // 函式內完全未使用；關閉流程一律走 window.CocoyaApp）。
    async _handleCloseDialog() {
        if (this._isClosing) {
            // 保險絲（E4-B）：萬一前一次關閉流程卡住（對話框 promise 永不 resolve、
            // 或確認框被更高 z-index 的 modal 覆蓋導致按鈕點不到），_isClosing 會永久為 true
            // → 之後每次按視窗 X 都被這行吃掉，視窗再也關不掉（只能工作管理員）。
            // 超過 30 秒視為卡死，強制放行繼續走關閉流程。
            const stuckMs = Date.now() - (this._closingSince || 0);
            if (stuckMs < 30000) return;
            console.warn('[Bridge] Close dialog latched for', stuckMs, 'ms; forcing close.');
        }
        this._isClosing = true;
        this._closingSince = Date.now();

        try {
            const app = window.CocoyaApp;
            const confirmMsg = (window.Blockly && Blockly.Msg['MSG_SAVE_CONFIRM']) || 'Do you want to save changes?';

            // 安裝進行中 → 讓使用者知道「關閉視窗 = 中止安裝」。
            // 註：Rust 端只在 dirty 時才 prevent_close 並發 closeRequested，因此
            // 這條提示僅涵蓋 dirty 情境；非 dirty 時視窗會直接關閉（後端會一併
            // 終止 pip 子進程，不留孤兒），此為 E4-B 刻意接受的取捨——
            // 以換取「視窗永遠關得掉」這個更重要的保證。
            if (window.CocoyaUI && window.CocoyaUI.isEnvInstallActive && window.CocoyaUI.isEnvInstallActive()) {
                const detailEl = document.getElementById('save-confirm-detail');
                if (detailEl) {
                    this._savedConfirmDetail = detailEl.textContent;
                    detailEl.textContent = (window.Blockly && Blockly.Msg['DIAG_CLOSE_WARN_INSTALLING'])
                        || 'Python environment installation is in progress. Closing the window will stop the install.';
                }
            }

            if (window.CocoyaUI && window.CocoyaUI.showSaveConfirm) {
                const choice = await window.CocoyaUI.showSaveConfirm(confirmMsg);

                if (choice === 'save') {
                    // 準備 XML
                    const dom = Blockly.Xml.workspaceToDom(app.workspace);
                    dom.setAttribute('platform', app.currentPlatform);
                    const xml = Blockly.Xml.domToPrettyText(dom);
                    
                    try {
                        // 1. 執行存檔 (若為唯讀則強制另存新檔)
                        const isReadOnly = !!app.isReadOnly;
                        const filename = await this.tauriInvoke('save_file', { xml, saveAs: isReadOnly });
                        
                        if (filename) {
                            // 2. 存檔成功
                            await app.onSaveCompleted(filename); 
                            // 3. 確保後端 dirty 狀態已更新，再要求關閉視窗
                            await this.tauriInvoke('set_dirty', { isDirty: false });
                            await this.tauriInvoke('close_window'); 
                        }
                    } catch (e) {
                        // 處理取消與失敗
                        if (e === 'EXAMPLES_PATH') {
                            // 目標是內建範例目錄：跳出範例警示（覆蓋/另存）
                            // 完成（覆蓋成功或另存成功）才關閉；若使用者取消則維持視窗回到原作業
                            const done = await this._handleExamplesSaveDialog(xml);
                            if (done) {
                                await this.tauriInvoke('set_dirty', { isDirty: false });
                                await this.tauriInvoke('close_window');
                            } else {
                                console.log('[Bridge] Close canceled after examples dialog (user aborted).');
                            }
                        } else if (e === 'Canceled') {
                            // 使用者在系統對話框案取消，不做任何事，讓視窗維持開啟並保持 isDirty=true
                            console.log('[Bridge] Save canceled by user.');
                        } else {
                            // 真正的儲存錯誤（如權限、磁碟滿）
                            this.alert((window.Blockly?.Msg['BKY_SAVE_FAILED'] || 'Save failed: ') + e);
                        }
                    }
                } else if (choice === 'discard') {
                    // 強制不儲存：先同步 dirty 狀態後再關閉
                    await app.setDirty(false);
                    await this.tauriInvoke('set_dirty', { isDirty: false });
                    await this.tauriInvoke('close_window');
                }
            } else {
                // Fallback for simple alert（2026-09-01：改 token 化；「確定」即關閉視窗）
                const ok = await this._showConfirmDialog(confirmMsg);
                if (ok) {
                    // 這裡簡化處理，如果不支援 showSaveConfirm 則僅問是否要關閉 (可能遺失未存檔)
                    await app.setDirty(false);
                    await this.tauriInvoke('set_dirty', { isDirty: false });
                    await this.tauriInvoke('close_window');
                }
            }
        } catch (err) {
            console.error('[Bridge] Error in _handleCloseDialog:', err);
            await this.tauriInvoke('close_window');
        } finally {
            // 還原確認框的說明文字（安裝中曾暫時改寫為警示）
            if (this._savedConfirmDetail !== null && this._savedConfirmDetail !== undefined) {
                const detailEl = document.getElementById('save-confirm-detail');
                if (detailEl) detailEl.textContent = this._savedConfirmDetail;
                this._savedConfirmDetail = null;
            }
            this._isClosing = false;
        }
    }

    async _handleDatasetCommand(sidecarCommand, data, callback, opts) {
        try {
            // 1. 確保 sidecar 已啟動（使用輕量 ping 健康檢查 + 狀態快取）
            const pythonPath = getSetting(SETTINGS_KEY.PYTHON_PATH) || 'python';
            let sidecarReady = false;

            // 啟動失敗統一回結構化錯誤碼，讓面板能以 i18n 文案提示使用者
            // （典型情境：Python 路徑未設定／無效，或缺 opencv-python 導致 sidecar 秒死）
            const startFailure = (e) => {
                if (callback) callback({ success: false, errorCode: 'SIDECAR_START_FAILED', error: String(e) });
            };

            try {
                await this.tauriInvoke('sidecar_send', {
                    command: 'ping',
                    payload: '{}'
                });
                sidecarReady = true;
            } catch (e) {
                // sidecar 未啟動或已死，啟動它
                console.log('[Bridge] Sidecar not running, starting...');
                try {
                    await this.tauriInvoke('start_sidecar', { pythonPath });
                } catch (startErr) {
                    console.error('[Bridge] Sidecar start failed:', startErr);
                    startFailure(startErr);
                    return;
                }
                // 等待 sidecar 啟動後 re-ping：spawn 成功仍可能 import 失敗秒死，
                // 未驗證就當成功會讓錯誤延後到下一次 stdin write（os error 232）
                await new Promise(r => setTimeout(r, 1000));
                try {
                    await this.tauriInvoke('sidecar_send', { command: 'ping', payload: '{}' });
                    sidecarReady = true;
                } catch (pingErr) {
                    console.error('[Bridge] Sidecar not alive after start:', pingErr);
                    startFailure(pingErr);
                    return;
                }
            }

            if (!sidecarReady) {
                if (callback) callback({ success: false, error: 'Sidecar failed to start' });
                return;
            }

            // 2. 發送實際指令到 sidecar（長時任務如 trainRemote 可指定 timeoutSecs）
            const payload = JSON.stringify(data);
            const raw = await this.tauriInvoke('sidecar_send', {
                command: sidecarCommand,
                payload,
                timeoutSecs: (opts && opts.timeoutSecs) || undefined
            });

            // 3. 解析回應
            const response = JSON.parse(raw);
            if (response.type === 'response' && callback) {
                callback(response);
            } else if (response.type === 'error') {
                console.error('[Bridge] Sidecar error:', response.error);
                if (callback) callback({ success: false, error: response.error });
            } else {
                if (callback) callback(response);
            }
        } catch (e) {
            console.error(`[Bridge] Dataset command "${sidecarCommand}" failed:`, e);
            if (callback) callback({ success: false, error: String(e) });
        }
    }

    async _handleCheckUpdate() {
        try {
            const currentVersion = await this.tauriInvoke('get_version').catch(() => '0.8.0');
            const GITHUB_REPO_API = "https://api.github.com/repos/simfonia/Cocoya/releases/latest";
            const DOWNLOAD_URL = "https://github.com/simfonia/Cocoya/releases";

            const res = await fetch(GITHUB_REPO_API);
            if (!res.ok) throw new Error('Network response was not ok');
            const release = await res.json();
            const latestVersion = release.tag_name.replace('v', '');

            const cParts = currentVersion.split(/[.-]/).map(v => parseInt(v) || 0);
            const lParts = latestVersion.split(/[.-]/).map(v => parseInt(v) || 0);
            
            let hasUpdate = false;
            for (let i = 0; i < 3; i++) {
                const l = lParts[i] || 0;
                const c = cParts[i] || 0;
                if (l > c) { hasUpdate = true; break; }
                if (l < c) { hasUpdate = false; break; }
            }

            if (window.CocoyaUI) {
                window.CocoyaUI.setUpdateStatus({ hasUpdate, currentVersion, latestVersion, url: DOWNLOAD_URL });
            }
        } catch (e) {
            console.error('[Bridge] Check update failed:', e);
            if (window.CocoyaUI) {
                const current = await this.tauriInvoke('get_version').catch(() => '0.8.0');
                window.CocoyaUI.setUpdateStatus({ hasUpdate: false, currentVersion: current, latestVersion: current, url: '' });
            }
        }
    }

    async _confirmSaveBeforeOpen(data) {
        if (!data.isDirty) return true;

        const confirmMsg = (window.Blockly && Blockly.Msg['MSG_SAVE_CONFIRM']) || 'Do you want to save changes to the current project?';
        let choice = 'cancel';
        if (window.CocoyaUI && window.CocoyaUI.showSaveConfirm) {
            choice = await window.CocoyaUI.showSaveConfirm(confirmMsg);
        }

        if (choice === 'cancel') return false;
        if (choice === 'save') {
            const xml = data.xml || this._getCurrentXml();
            const saved = await this.send('saveFile', { xml });
            return saved === true;
        }
        return true; // discard
    }

    async _handleNativeDialogs(command, data) {
        // 2026-09-01：改用自訂 token 化對話框（原 OS 原生 ask/message 無法隨深色主題換膚，
        // DM 清除資料等確認框在深色下白底；與 prompt 同一套 .cocoya-prompt-* 樣式）
        if (command === 'alert') {
            await this._showAlertDialog(data.message);
            this._dispatchToFrontend({ 
                command: 'promptResponse', 
                requestId: data.requestId, 
                result: null 
            });
        } else if (command === 'confirm') {
            const okLabel = (window.Blockly && (Blockly.Msg['MSG_OK'] || Blockly.Msg['MSG_SAVE'])) || 'OK';
            const cancelLabel = (window.Blockly && Blockly.Msg['MSG_CANCEL']) || 'Cancel';
            const ok = await this._showConfirmDialog(data.message, { okLabel, cancelLabel });
            this._dispatchToFrontend({ 
                command: 'promptResponse', 
                requestId: data.requestId, 
                result: ok 
            });
        } else if (command === 'prompt') {
            // Tauri 2.0 沒有內建的 input dialog，使用自定義 HTML 對話框
            const value = await this._showPromptDialog(data.message, data.defaultValue || '');
            this._dispatchToFrontend({ 
                command: 'promptResponse', 
                requestId: data.requestId, 
                result: value 
            });
        }
    }
    
    /**
     * 自定義 prompt 對話框（Tauri 2.0 沒有內建 input dialog）
     */
    async _showPromptDialog(message, defaultValue) {
        return new Promise((resolve) => {
            // 建立對話框 HTML
            const dialog = document.createElement('div');
            dialog.className = 'cocoya-prompt-dialog-overlay';
            dialog.innerHTML = `
                <div class="cocoya-prompt-dialog">
                    <div class="cocoya-prompt-message">${this._escapeHtml(message)}</div>
                    <input type="text" class="cocoya-prompt-input" value="${this._escapeHtml(defaultValue)}" autofocus>
                    <div class="cocoya-prompt-buttons">
                        <button class="cocoya-prompt-btn cocoya-prompt-cancel">${window.Blockly?.Msg['MSG_CANCEL'] || 'Cancel'}</button>
                        <button class="cocoya-prompt-btn cocoya-prompt-ok">${window.Blockly?.Msg['MSG_OK'] || 'OK'}</button>
                    </div>
                </div>
            `;
            this._ensureDialogStyles();
            
            document.body.appendChild(dialog);
            
            const input = dialog.querySelector('.cocoya-prompt-input');
            const okBtn = dialog.querySelector('.cocoya-prompt-ok');
            const cancelBtn = dialog.querySelector('.cocoya-prompt-cancel');
            
            // 自動聚焦並選中文字
            input.focus();
            input.select();
            
            // 處理 Enter 鍵
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    dialog.remove();
                    resolve(input.value);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    dialog.remove();
                    resolve(null);
                }
            });
            
            // 處理按鈕點擊
            okBtn.onclick = () => {
                dialog.remove();
                resolve(input.value);
            };
            
            cancelBtn.onclick = () => {
                dialog.remove();
                resolve(null);
            };
            
            // 點擊背景關閉
            dialog.addEventListener('click', (e) => {
                if (e.target === dialog) {
                    dialog.remove();
                    resolve(null);
                }
            });
        });
    }

    /**
     * 自訂 confirm 對話框（token 化，隨深色主題換膚；取代原生 ask()）
     * @returns {Promise<boolean>} OK=true，Cancel/Escape/背景點擊=false
     */
    async _showConfirmDialog(message, { okLabel, cancelLabel } = {}) {
        return new Promise((resolve) => {
            const dialog = document.createElement('div');
            dialog.className = 'cocoya-prompt-dialog-overlay';
            dialog.innerHTML = `
                <div class="cocoya-prompt-dialog">
                    <div class="cocoya-prompt-message">${this._escapeHtml(message)}</div>
                    <div class="cocoya-prompt-buttons">
                        <button class="cocoya-prompt-btn cocoya-prompt-cancel">${this._escapeHtml(cancelLabel || 'Cancel')}</button>
                        <button class="cocoya-prompt-btn cocoya-prompt-ok">${this._escapeHtml(okLabel || 'OK')}</button>
                    </div>
                </div>
            `;
            this._ensureDialogStyles();
            document.body.appendChild(dialog);

            const settle = (value) => {
                document.removeEventListener('keydown', onKey, true);
                dialog.remove();
                resolve(value);
            };
            const okBtn = dialog.querySelector('.cocoya-prompt-ok');
            const cancelBtn = dialog.querySelector('.cocoya-prompt-cancel');
            const onKey = (e) => {
                if (e.key === 'Enter') { e.preventDefault(); settle(true); }
                else if (e.key === 'Escape') { e.preventDefault(); settle(false); }
            };

            okBtn.onclick = () => settle(true);
            cancelBtn.onclick = () => settle(false);
            dialog.addEventListener('click', (e) => { if (e.target === dialog) settle(false); });
            document.addEventListener('keydown', onKey, true);
            okBtn.focus();
        });
    }

    /**
     * 自訂 alert 對話框（token 化；取代原生 message()）
     */
    async _showAlertDialog(message) {
        return new Promise((resolve) => {
            const dialog = document.createElement('div');
            dialog.className = 'cocoya-prompt-dialog-overlay';
            dialog.innerHTML = `
                <div class="cocoya-prompt-dialog">
                    <div class="cocoya-prompt-message">${this._escapeHtml(message)}</div>
                    <div class="cocoya-prompt-buttons">
                        <button class="cocoya-prompt-btn cocoya-prompt-ok">${window.Blockly?.Msg['MSG_OK'] || 'OK'}</button>
                    </div>
                </div>
            `;
            this._ensureDialogStyles();
            document.body.appendChild(dialog);

            const settle = () => {
                document.removeEventListener('keydown', onKey, true);
                dialog.remove();
                resolve();
            };
            const okBtn = dialog.querySelector('.cocoya-prompt-ok');
            const onKey = (e) => {
                if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); settle(); }
            };

            okBtn.onclick = settle;
            dialog.addEventListener('click', (e) => { if (e.target === dialog) settle(); });
            document.addEventListener('keydown', onKey, true);
            okBtn.focus();
        });
    }

    /**
     * 注入 .cocoya-prompt-* 共用樣式（token 化，幂等）
     */
    _ensureDialogStyles() {
        if (document.getElementById('cocoya-prompt-styles')) return;
        const styles = document.createElement('style');
        styles.id = 'cocoya-prompt-styles';
        styles.textContent = `
                    .cocoya-prompt-dialog-overlay {
                        position: fixed;
                        inset: 0;
                        background: rgba(0, 0, 0, 0.5);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 10100; /* 須高於 Startup Home(10002) 與診斷視窗(10050)，否則首頁操作的成功訊息會被蓋住 */
                    }
                    .cocoya-prompt-dialog {
                        background: var(--dsm-surface, #ffffff);
                        border: 1px solid var(--dsm-border-strong, #cccccc);
                        border-radius: 8px;
                        padding: 20px;
                        min-width: 300px;
                        max-width: 500px;
                        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                    }
                    .cocoya-prompt-message {
                        margin-bottom: 12px;
                        font-size: 13px;
                        color: var(--dsm-text, #333333);
                        word-wrap: break-word;
                    }
                    .cocoya-prompt-input {
                        width: 100%;
                        padding: 8px 10px;
                        border: 1px solid var(--dsm-border-strong, #cccccc);
                        border-radius: 4px;
                        font-size: 13px;
                        margin-bottom: 16px;
                        box-sizing: border-box;
                        outline: none;
                        background: var(--dsm-input-bg, #ffffff);
                        color: var(--dsm-text, #333333);
                    }
                    .cocoya-prompt-input:focus {
                        border-color: var(--dsm-brand, #FE2F89);
                        box-shadow: 0 0 0 2px var(--dsm-brand-soft, rgba(254, 47, 137, 0.12));
                    }
                    .cocoya-prompt-buttons {
                        display: flex;
                        justify-content: flex-end;
                        gap: 8px;
                    }
                    .cocoya-prompt-btn {
                        padding: 6px 16px;
                        border: 1px solid var(--dsm-border-strong, #cccccc);
                        border-radius: 4px;
                        background: var(--dsm-btn-bg, #f7f7f7);
                        color: var(--dsm-text, #333333);
                        cursor: pointer;
                        font-size: 12px;
                        min-height: 30px;
                    }
                    .cocoya-prompt-btn:hover {
                        border-color: var(--dsm-brand, #FE2F89);
                        color: var(--dsm-brand, #FE2F89);
                        background: var(--dsm-btn-hover-bg, #fff7fb);
                    }
                    .cocoya-prompt-ok {
                        background: var(--dsm-brand, #FE2F89);
                        color: white;
                        border: none;
                    }
                    .cocoya-prompt-ok:hover {
                        background: #e91e63;
                        color: white;
                    }
                    body.vscode-dark .cocoya-prompt-dialog,
                    body.vscode-high-contrast .cocoya-prompt-dialog {
                        background: #252526;
                        border-color: #404040;
                    }
                    body.vscode-dark .cocoya-prompt-message,
                    body.vscode-high-contrast .cocoya-prompt-message {
                        color: #e0e0e0;
                    }
                    body.vscode-dark .cocoya-prompt-input,
                    body.vscode-high-contrast .cocoya-prompt-input {
                        background: #1e1e1e;
                        border-color: #555555;
                        color: #e0e0e0;
                    }
                    body.vscode-dark .cocoya-prompt-btn,
                    body.vscode-high-contrast .cocoya-prompt-btn {
                        background: #3c3c3c;
                        border-color: #555555;
                        color: #e0e0e0;
                    }
                `;
        document.head.appendChild(styles);
    }

    /**
     * HTML 轉義函數
     */
    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    _getCurrentXml() {
        if (typeof Blockly !== 'undefined' && Blockly.getMainWorkspace) {
            const dom = Blockly.Xml.workspaceToDom(Blockly.getMainWorkspace());
            const platform = window.CocoyaApp?.currentPlatform;
            dom.setAttribute('platform', platform);
            return Blockly.Xml.domToPrettyText(dom);
        }
        return '';
    }

    /**
     * 重新取得目前視窗的專案根錨定狀態，並更新 _anchor 快取。
     * 呼叫時機：開啟專案後、存檔/另存後，讓 capabilities.isAnchored/projectRoot 與後端同步，
     * 避免 _anchor（init 時快照）在開檔/存檔後過期。
     */
    /**
     * 正規化後端回傳的錨定物件（相容 camelCase / snake_case），統一為 { isAnchored, projectRoot }
     */
    _normalizeAnchor(a) {
        if (!a) return { isAnchored: false, projectRoot: null };
        return {
            isAnchored: !!(a.isAnchored ?? a.is_anchored),
            projectRoot: (a.projectRoot ?? a.project_root) || null
        };
    }

    async _refreshAnchor() {
        try {
            this._anchor = this._normalizeAnchor(await this.tauriInvoke('get_project_anchor'));
            console.log('[Anchor] refreshed -> projectRoot =', this._anchor.projectRoot,
                '| isAnchored =', this._anchor.isAnchored);
        } catch (e) {
            console.error('[Bridge] Failed to refresh project anchor:', e);
            this._anchor = null;
        }
    }

    async _handleExamplesSaveDialog(xml) {
        try {
            const okLabel = window.Blockly?.Msg['MSG_SAVE'] || Blockly?.Msg['BKY_SAVE'] || '覆蓋範例';
            const cancelLabel = window.Blockly?.Msg['MSG_CANCEL'] || '另存新檔';
            const message = window.Blockly?.Msg['BKY_EXAMPLES_OVERWRITE_CONFIRM']
                || '此為 Cocoya 內建範例目錄，是否要覆蓋原始範例？';
            const overwrite = await this._showConfirmDialog(message, { okLabel, cancelLabel });
            
            if (overwrite) {
                // 覆蓋範例：直接呼叫 save_file 並標註強制覆蓋 examples 目錄
                try {
                    const filename = await this.tauriInvoke('save_file', { xml, saveAs: false, forceExamples: true });
                    this._dispatchToFrontend({ command: 'saveCompleted', filename: filename });
                    return true;
                } catch (e2) {
                    if (e2 !== 'Canceled' && e2 !== 'EXAMPLES_PATH') {
                        this.alert((window.Blockly?.Msg['BKY_SAVE_FAILED'] || 'Save failed: ') + e2);
                    }
                    return false;
                }
            } else {
                // 另存新檔：成功（含取消）由 send 回傳判斷
                return (await this.send('saveFileAs', { xml })) === true;
            }
        } catch (e) {
            console.error('[Bridge] Examples save dialog error:', e);
            return false;
        }
    }

    /**
     * 覆寫 _dispatchToFrontend：除了調用內部 listeners，
     * 也要透過 window.postMessage 讓 sampler.js 能接收
     */
    _dispatchToFrontend(message) {
        // 內部 listeners
        this._listeners.forEach(cb => cb(message));
        // window message event（相容 sampler.js 的 window.addEventListener('message') 監聽）
        window.postMessage(message, '*');
    }

    /**
     * 還原內建範例檔（Tauri 專屬，2026-10-01）。
     *
     * 走 Tauri command `restore_examples`，強制以 Resource 內的原始 examples
     * 覆寫 AppData 播種目錄（注意：與啟動時的 ensure_examples_seeded 不同，
     * 後者只補缺檔、保護使用者自建檔；本指令是使用者主動要求還原，故強制覆寫）。
     *
     * 後端 struct 已加 #[serde(rename_all = "camelCase")]，
     * 故回傳欄位為 restoredCount / examplesPath（不是 snake_case）。
     *
     * @returns {Promise<{restoredCount:number, examplesPath:string}>}
     */
    async restoreExamples() {
        return this.tauriInvoke('restore_examples');
    }

    // 覆寫父類別方法以使用 Tauri 特有的 UI
    async pickMcuModel(options) {
        const requestId = 'pick_' + Date.now();
        return new Promise((resolve) => {
            const handler = (msg) => {
                if (msg.command === 'promptResponse' && msg.requestId === requestId) {
                    this.offMessage(handler);
                    resolve(msg.result);
                }
            };
            this.onMessage(handler);

            const title = window.Blockly?.Msg['MSG_SELECT_MCU_MODEL'] || 'Select MCU Model';
            window.CocoyaUI.showQuickPick(title, options, (selectedId) => {
                this._dispatchToFrontend({ 
                    command: 'promptResponse', 
                    requestId: requestId, 
                    result: selectedId 
                });
            });
        });
    }
}
