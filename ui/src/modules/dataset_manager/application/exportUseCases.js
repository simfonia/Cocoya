/**
 * Dataset Manager application/exportUseCases.js — 資料集匯出 use-case（Stage 3 切片 3）
 *
 * 匯出編排自 ui_layout.js 原地搬移：未標註/未分類確認、Spec 同步驗證、
 * datasetExport request correlation（timeout 120s）。UI 呈現與對話以依賴注入，通訊經 io/bridge.js。
 */
import { datasetBridge } from '../io/bridge.js';
import { countUnannotated, countUnclassifiedBoxes } from './annotationMutations.js';
import { needsAnnotationCheck, needsUnclassifiedCheck, isDevType } from '../core/typePolicy.js';

/**
 * deps：
 *  - state: ui_layout 模組狀態
 *  - getFormValue(name), syncSpecFromUI(full)
 *  - showStatusMessage(msg), showExportProgress(active), t(key, fallback)
 */
export function createExportUseCases(deps) {
    const {
        state,
        getFormValue,
        syncSpecFromUI,
        showStatusMessage,
        showExportProgress,
        t
    } = deps;

    async function exportDataset() {
        console.log('[DatasetManager] handleExportDataset triggered');
        showStatusMessage(t('STATUS_EXPORTING', '📦 正在準備匯出...'));
        showExportProgress(true);

        try {
            const projectType = getFormValue('projectType');

            // R8：開發中類型（feature/serial）擋下匯出，避免產出無法訓練的空資料集
            if (isDevType(projectType)) {
                showExportProgress(false);
                showStatusMessage(t('ERROR_EXPORT_DEV_UNAVAILABLE', '❌ 此類型（%1）開發中，尚未支援匯出。').replace('%1', projectType));
                return;
            }

            // 0. 檢查是否有未標註圖片（僅物件偵測/循線需要 bbox/line）
            if (needsAnnotationCheck(projectType) && state.images.length > 0) {
                const unannotated = countUnannotated(state.images);
                if (unannotated > 0) {
                    if (!(await datasetBridge.confirm(t('ANNOTATION_EXPORT_UNANNOTATED_WARNING', '仍有 %1 張圖片未標註，確定要匯出嗎？').replace('%1', unannotated)))) {
                        showStatusMessage('');
                        showExportProgress(false);
                        return;
                    }
                }
            }

            // 檢查是否有未分類標註框 (class_id === -1)（僅物件偵測）
            if (needsUnclassifiedCheck(projectType) && state.images.length > 0) {
                const unclassified = countUnclassifiedBoxes(state.images);
                if (unclassified > 0) {
                    if (!(await datasetBridge.confirm(t('ANNOTATION_EXPORT_UNCLASSIFIED_WARNING', '尚有 %1 個未分類標註框，確定要匯出嗎？').replace('%1', unclassified)))) {
                        showStatusMessage('');
                        showExportProgress(false);
                        return;
                    }
                }
            }

            // 1. 同步最新資料
            syncSpecFromUI(true);
            const spec = state.spec.toJSON();
            console.log('[DatasetManager] Spec synced for export:', spec.project.name);

            // 2. 驗證 Spec
            const result = state.spec.validate();
            if (!result.ok) {
                throw new Error(t('ERROR_EXPORT_VALIDATE', '資料集規格驗證失敗: %1').replace('%1', result.errors[0]));
            }

            // 3. 透過 io/bridge.js 發送匯出指令並等待結果（Stage 2 correlation + timeout）
            console.log('[DatasetManager] Sending datasetExport command to Bridge');
            const { promise: exportPromise } = datasetBridge.request({
                command: 'datasetExport',
                payload: {
                    spec: spec,
                    sourceFolderPath: state.sourceFolderPath // 傳送來源路徑
                },
                resultCommand: 'datasetExportResult',
                timeoutMs: 120000 // 匯出含 ZIP 打包，給較長 timeout
            });

            exportPromise.then((msg) => {
                showExportProgress(false);
                if (msg.success) {
                    showStatusMessage(t('SUCCESS_EXPORT', '✅ 資料集匯出成功'));
                } else {
                    showStatusMessage(t('ERROR_EXPORT_FAILED', '❌ 匯出失敗: %1').replace('%1', msg.error));
                }
            }).catch((e) => {
                showExportProgress(false);
                showStatusMessage(t('ERROR_EXPORT_FAILED', '❌ 匯出失敗: %1').replace('%1', e.message));
            });
        } catch (e) {
            console.error('[DatasetManager] Export Error:', e);
            showExportProgress(false);
            showStatusMessage(t('ERROR_PREFIX', '❌ 錯誤: %1').replace('%1', e.message));
        }
    }

    return { exportDataset };
}
