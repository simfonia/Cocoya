/**
 * ui/src/bridge/tauri/training.js — 遠端訓練與訓練報告指令群（P2-1 拆檔）
 *
 * 對應原 `BridgeTauri.send()` switch 內 4 個 case：
 *   startRemoteTraining / stopRemoteTraining / openTrainingReport / openLatestTrainingReport
 *
 * 【注意】`startRemoteTraining` 原為區塊式 case（`case 'x': {`，因宣告 let/const 需要作用域）。
 * 搬成函式後作用域由函式本身提供，區塊式語法已移除。
 *
 * 【handler 契約】簽名 `async function handler(command, data)`，以
 * `handler.call(this, command, data)` 呼叫。回傳值被刻意丟棄（見 tauri.js send() 註解）。
 * @this {import('../tauri.js').BridgeTauri}
 */

/**
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function startRemoteTraining(_command, data) {
    // 遠端訓練（D4）：重用 sidecar trainRemote（同步 -> Docker 遠端訓練 -> 下載 .keras/labels）
    // 前端自行解析參數（Tauri 無 host 層 handler），路徑以最新專案錨定為基準
    let projectRoot = (this._anchor && this._anchor.projectRoot) || null;
    if (!projectRoot) {
        try {
            // 鐵律：get_project_anchor 回傳需經 _normalizeAnchor（snake/camel 雙保險，AGENTS.md serde 坑）
            const anchor = this._normalizeAnchor(await this.tauriInvoke('get_project_anchor'));
            projectRoot = (anchor && anchor.projectRoot) || null;
            if (anchor) this._anchor = anchor;
        } catch (e) { /* 未錨定 */ }
    }
    const pickRt = (re, d) => { const m = (data.code || '').match(re); return m ? m[1] : d; };
    let dsDir = data.datasetDir || '';
    if (dsDir && projectRoot && !/^[A-Za-z]:[\\/]/.test(dsDir) && !dsDir.startsWith('/')) {
        dsDir = projectRoot.replace(/[\\/]+$/, '') + '/' + dsDir;
    }
    const projName = (dsDir || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'training_project';
    const taskRt = pickRt(/task_type='([^']+)'/, 'image_classification');
    const remotePayload = {
        host: data.sshConfig?.host,
        port: data.sshConfig?.port || 22,
        username: data.sshConfig?.username,
        password: data.sshConfig?.password,
        localDatasetDir: dsDir,
        projectName: projName,
        syncMode: data.syncMode || 'smart',
        hyperparams: {
            epochs: parseInt(pickRt(/epochs=(\d+)/, '30'), 10) || 30,
            batchSize: parseInt(pickRt(/batch_size=(\d+)/, '32'), 10) || 32,
            learningRate: parseFloat(pickRt(/learning_rate=([\d.]+)/, '0.001')) || 0.001,
            validationSplit: parseFloat(pickRt(/validation_split=([\d.]+)/, '0.2')) || 0.2,
            dropout: parseFloat(pickRt(/dropout=([\d.]+)/, '0.2')) || 0.2,
            augmentation: pickRt(/augmentation=(True|False)/, 'False') === 'True' ? 'true' : 'false',
            backbone: pickRt(/backbone='([^']+)'/, 'mobilenetv2'),
            optimizer: pickRt(/optimizer='([^']+)'/, 'adam'),
            dnnLayers: pickRt(/dnn_layers='([^']+)'/, '128,64'),
            fineTune: pickRt(/fine_tune=(True|False)/, 'False') === 'True' ? 'true' : 'false',
            modelOutput: pickRt(/model_output='([^']+)'/, 'none'),
            taskType: taskRt
        },
        outputDir: (projectRoot ? projectRoot.replace(/[\\/]+$/, '') + '/model/' + projName : 'model/' + projName),
        dockerImage: 'cocoya-train-' + (taskRt === 'object_detection' ? 'object_detection' : 'image_classification')
    };
    await this._handleDatasetCommand('trainRemote', remotePayload, (response) => {
        this._dispatchToFrontend({
            command: response.success ? 'trainingComplete' : 'trainingError',
            success: !!response.success,
            remote: true,
            errorCode: response.errorCode,
            modelDir: response.modelDir,
            projectName: response.projectName,
            modelOutput: response.modelOutput,
            reportPath: response.reportPath,
            kerasPath: response.kerasPath,
            curvePath: response.curvePath,
            historyPath: response.historyPath,
            error: response.error
        });
    }, { timeoutSecs: 3600 });
    return;
}

/**
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function stopRemoteTraining(_command, _data) {
    // 中斷遠端訓練（sidecar 端 docker rm -f 訓練容器）
    await this._handleDatasetCommand('stopTraining', {}, (response) => {
        if (!response.success && window.CocoyaUI?.appendTerminal) {
            window.CocoyaUI.appendTerminal('[Remote] ' + (response.error || '中斷失敗'), 'err');
        }
    });
    return;
}

/**
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function openTrainingReport(_command, data) {
    try {
        await this.tauriInvoke('open_report', { reportPath: data.path });
    } catch (e) {
        console.error('[Bridge] open_report failed:', e);
        this.alert(`開啟失敗，請手動開啟檔案：\n${data.path}\n\n錯誤：${e}`);
    }
    return;
}

/**
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function openLatestTrainingReport(_command, _data) {
    try {
        const reports = await this.tauriInvoke('find_latest_training_report');
        if (!reports || reports.length === 0) {
            this.alert('尚無訓練結果，請先執行訓練。');
            return;
        }
        if (reports.length === 1) {
            await this.tauriInvoke('open_report', { reportPath: reports[0].path });
        } else {
            // 多個報告：顯示 QuickPick 讓使用者選擇
            const options = reports.map(r => ({
                id: r.path,
                label: r.projectName
            }));
            window.CocoyaUI.showQuickPick(
                `找到 ${reports.length} 個訓練報告，請選擇要開啟的項目：`,
                options,
                (selectedPath) => {
                    if (selectedPath) {
                        this.tauriInvoke('open_report', { reportPath: selectedPath })
                            .catch(e => this.alert(`開啟失敗：${e}`));
                    }
                }
            );
        }
    } catch (e) {
        console.error('[Bridge] find_latest_training_report failed:', e);
        this.alert('搜尋訓練報告失敗：' + e);
    }
    return;
}
