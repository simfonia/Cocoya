/**
 * Dataset Manager application/progressUseCases.js — 進度存讀與自動落盤 use-case（Stage 3）
 *
 * Application 層：接收 domain state 與 UI 回呼（注入依賴），不直接依賴具體平台 API；
 * 對外通訊一律經 io/bridge.js。從 ui_layout.js 原地搬移，行為語意不變。
 *
 * deps：
 *  - state: DatasetStore 持有的模組狀態（ui_layout 的 state 物件）
 *  - syncSpecFromUI(full): UI → Spec 同步（ui_layout 提供）
 *  - getFormValue(name): 表單值讀取
 *  - hasData(): 是否有可落盤資料
 *  - applyLoadedProgress(spec): 載入成功後套回 UI
 *  - autoSaveDelay: debounce 毫秒（預設 800）
 */
import { datasetBridge } from '../io/bridge.js';

export function createProgressUseCases({
    state,
    syncSpecFromUI,
    getFormValue,
    hasData,
    applyLoadedProgress,
    autoSaveDelay = 800
}) {
    let autoSaveTimer = null;

    /**
     * 執行一次落盤：同步最新資料 → toJSON → bridge request。
     * 低噪音：成功不打擾；僅失敗時 console 記錄（未錨定/失敗不造成錯誤訊息騷擾學生）。
     */
    function writeProgressToDisk() {
        try {
            syncSpecFromUI(true);
            const spec = state.spec.toJSON();
            const projectName = getFormValue('projectName') || (spec.project && spec.project.name) || 'dataset';

            // Stage 2：經 io/bridge.js request correlation（timeout 保護，listener 自動清理）
            const { promise } = datasetBridge.request({
                command: 'datasetSaveProgress',
                payload: { projectName, spec },
                resultCommand: 'datasetSaveProgressResult',
                timeoutMs: 15000
            });
            console.debug('[DatasetManager] Auto-save sending:', projectName,
                '| samples:', spec.data_source.samples.length,
                '| type:', spec.project.type);
            promise.then((msg) => {
                if (!msg.success) {
                    console.error('[DatasetManager] Auto-save progress failed:',
                        msg.errorCode ? `[${msg.errorCode}] ` : '', msg.error);
                } else {
                    console.info('[DatasetManager] Auto-save OK ->', msg.path);
                }
            }).catch((e) => console.error('[DatasetManager] Auto-save progress Error:', e.message));
        } catch (e) {
            console.error('[DatasetManager] Auto-save progress Error:', e);
        }
    }

    /**
     * 排程自動落盤（時間防抖）。切圖/退出/關閉可用 immediate=true 立即 flush 作為保險。
     * 錨定與否由後端裁決（SSOT）；無資料 → 靜默略過。
     * @param {boolean} [immediate] true = 立即寫入
     */
    function scheduleAutoSave(immediate = false) {
        const bridgeCaps = datasetBridge.getCapabilities();

        // 錨定裁決交還後端（SSOT）：capabilities.isAnchored 是載入時快照，可能過期；
        // 後端未錨定時會回 PROJECT_ROOT_REQUIRED 並由 handler 記錄，此處不再硬擋。
        if (bridgeCaps && !bridgeCaps.isAnchored) {
            console.debug('[DatasetManager] Auto-save: capabilities snapshot says not anchored; delegating to backend anchor check');
        }
        if (!hasData()) {
            console.debug('[DatasetManager] Auto-save skipped: no data');
            return;
        }

        if (immediate) {
            cancelAutoSave();
            writeProgressToDisk();
            return;
        }

        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => {
            autoSaveTimer = null;
            writeProgressToDisk();
        }, autoSaveDelay);
    }

    /** 取消排程中的 autosave（modal 關閉/銷毀時呼叫，防 dispose 後 timer 回呼） */
    function cancelAutoSave() {
        if (autoSaveTimer) {
            clearTimeout(autoSaveTimer);
            autoSaveTimer = null;
        }
    }

    /**
     * 等級一存讀（載入）：向 Bridge 讀取指定資料夾內的 dataset.json。
     * 有進度 → 套回；無進度或失敗 → 維持目前掃描結果，不清空既有成功訊息。
     */
    function loadProgressFromFolder(folderPath) {
        const { promise } = datasetBridge.request({
            command: 'datasetLoadProgress',
            payload: { folderPath },
            resultCommand: 'datasetLoadProgressResult',
            timeoutMs: 15000
        });
        promise.then((msg) => {
            if (!msg.success) {
                console.error('[DatasetManager] Load progress failed:', msg.error);
                return;
            }
            if (msg.hasProgress && msg.spec) {
                applyLoadedProgress(msg.spec);
            }
        }).catch((e) => console.error('[DatasetManager] Load progress failed:', e.message));
    }

    return { writeProgressToDisk, scheduleAutoSave, cancelAutoSave, loadProgressFromFolder };
}
