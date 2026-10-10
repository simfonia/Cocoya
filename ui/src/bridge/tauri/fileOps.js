/**
 * ui/src/bridge/tauri/fileOps.js — 檔案開存與檔案選擇指令群（P2-1 拆檔）
 *
 * 對應原 `BridgeTauri.send()` switch 內 10 個 case：
 *   saveFile / saveFileAs（原 fallthrough 組）
 *   openFile / checkUpdate / openExamples / openDatasetManager
 *   pickFolder / pickDataFile
 *   newFile / createWindow（原 fallthrough 組）
 *
 * 【fallthrough 組的處理】
 * `saveFile` / `saveFileAs` 與 `newFile` / `createWindow` 各為一組 fallthrough。
 * 搬成 handler 表後 fallthrough 語法消失，故各以「多個匯出指向同一函式」表達。
 * 不可拆成獨立函式 —— `saveFile` 若變成空實作，**存檔功能會靜默失效**。
 *
 * 【handler 契約】簽名 `async function handler(command, data)`，以
 * `handler.call(this, command, data)` 呼叫。回傳值被刻意丟棄（見 tauri.js send() 註解）。
 * @this {import('../tauri.js').BridgeTauri}
 */

/**
 * saveFile / saveFileAs 的共用實作（存檔 / 另存新檔）。
 *
 * ⚠️ 兩個匯出指向同一函式 —— 對應原 switch 的 fallthrough 組。
 *   函式內以 `command === 'saveFileAs'` 分流語意（沿用原碼，未改寫）。
 * @this {import('../tauri.js').BridgeTauri}
 */
async function saveFile(command, data) {
    {
        const isSaveAs = (command === 'saveFileAs');
        // 2026-10-10 C-3：文字模式分叉 —— data 含 {code, isTextMode} 即送碼＋檔頭平台行，
        // 舊調用（只帶 xml）走原路（向後相容）。Rust 收 code: Option<String>。
        const isText = !!(data && data.isTextMode) && typeof (data.code) === 'string';
        let xml = data.xml || this._getCurrentXml();
        if (isText) {
            const TM = (typeof window !== 'undefined' && window.CocoyaTextMode) ? window.CocoyaTextMode : null;
            let code = data.code;
            try {
                if (TM && typeof TM.ensurePlatformLine === 'function') {
                    const plat = (window.CocoyaApp && window.CocoyaApp.currentPlatform) || 'PC';
                    code = TM.ensurePlatformLine(code, plat);
                }
            } catch (e) {}
            xml = code;
        }
        const saveParams = { xml, saveAs: isSaveAs };
        if (isText) { saveParams.code = xml; saveParams.isTextMode = true; }
        // 開新專案流程（tag==='newProject'）時傳入「開新專案」語意標題，
        // 讓 Rust 另存對話框顯示正確標題，避免使用者誤解為「把 dirty 另存」。
        if (data.tag === 'newProject') {
            saveParams.dialogTitle = window.Blockly?.Msg['TITLE_NEW_PROJECT'] || '開新專案：選擇儲存位置';
        }
        // 防呆重試迴圈：另存命中「目前專案檔」位置（SAME_AS_CURRENT）時提示後，
        // 自動重新彈出另存對話框讓使用者改選其他位置，直到成功 / 取消 / 達上限。
        const MAX_SAME_AS_CURRENT_RETRY = 5;
        for (let attempt = 0; attempt < MAX_SAME_AS_CURRENT_RETRY; attempt++) {
            try {
                const filename = await this.tauriInvoke('save_file', saveParams);
                this._dispatchToFrontend({ command: 'saveCompleted', filename: filename, tag: data.tag });
                await this._refreshAnchor(); // 存檔後同步前端錨定（首檔另存即錨定）
                return true;
            } catch (e) {
                if (e === 'EXAMPLES_PATH') {
                    // 要寫入 examples 目錄，顯示警告對話框。
                    // ★ 必須回傳 _handleExamplesSaveDialog 的真實結果：
                    //   覆蓋成功 / 另存成功 → true；取消 → false。
                    // 先前在此忽略回傳值而無條件 return false，導致 startNewProjectFromHome 的
                    // _confirmSaveBeforeNew（saved !== false）誤判「使用者取消」，存檔完成
                    // （saveCompleted 已觸發 setDirty(false)）但開新檔流程被中止、畫面停在原檔。
                    const done = await this._handleExamplesSaveDialog(xml);
                    if (done) await this._refreshAnchor(); // 存檔後同步前端錨定
                    return done;
                }
                if (e === 'SAME_AS_CURRENT') {
                    // 防呆（2026-09-06）：另存/開新專案命中「目前專案檔」位置 →
                    // 禁止覆寫自己（避免原檔被乾淨初始積木覆蓋）。提示後 continue
                    // 迴圈重新彈出另存對話框，讓使用者改選其他位置。
                    // ★ 必須 await：alert() 已回傳阻塞 promise（Tauri 自訂對話框按確認才 resolve），
                    //    若不等，下一個另存對話框會在此提示未關閉時重疊彈出。
                    await this.alert((window.Blockly?.Msg['MSG_SAME_AS_CURRENT'] || '新專案不能存到目前專案檔的位置，請更換檔名或位置。'));
                    continue; // 重新選位置
                }
                if (e !== 'Canceled') {
                    console.error('[Bridge] Save failed:', e);
                    await this.alert((window.Blockly?.Msg['BKY_SAVE_FAILED'] || 'Save failed: ') + e);
                }
                return false;
            }
        }
        // 連續多次命中目前路徑 → 中止（避免無限彈窗）
        await this.alert((window.Blockly?.Msg['MSG_SAME_AS_CURRENT_ABORT'] || '多次選到目前專案檔的位置，已中止操作。'));
        return false;
    }
}

export { saveFile as saveFile };
export { saveFile as saveFileAs };

/**
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function openFile(_command, data) {
        if (!(await this._confirmSaveBeforeOpen(data))) return;
        try {
            const res = await this.tauriInvoke('open_file');
            this._dispatchToFrontend({ 
                command: 'loadWorkspace', 
                xml: res.xml, 
                filename: res.filename, 
                platform: res.platform,
                is_read_only: res.is_read_only // 補上遺漏的唯讀旗標
            });
            await this._refreshAnchor(); // 開檔後同步前端錨定（後端 current_paths 已更新）
            if (res.backup_xml) {
                this._dispatchToFrontend({ command: 'recoveryData', xml: res.backup_xml });
            }
        } catch (e) {
            if (e === 'EXAMPLES_READ_ONLY') {
                this.alert(window.Blockly?.Msg['BKY_EXAMPLES_READ_ONLY'] ||
                    '已取消開啟內建範例。內建範例為唯讀，請重新開啟並選擇「複製並開啟」。');
            } else if (e !== 'Canceled') console.error('[Bridge] Open failed:', e);
        }
        return;

    // [P2-1] checkStartupBackup / autoBackup / clearBackup / rejectRecovery
    // 已遷移至 tauri/backup.js，見 sendHandlers.js
}

/**
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function checkUpdate(_command, _data) {
    await this._handleCheckUpdate();
    return;
}

/**
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function openExamples(_command, data) {
    if (!(await this._confirmSaveBeforeOpen(data))) return;
    try {
        const res = await this.tauriInvoke('open_examples');
        this._dispatchToFrontend({ 
            command: 'loadWorkspace', 
            xml: res.xml, 
            filename: res.filename, 
            platform: res.platform 
        });
    } catch (e) {
        if (e === 'EXAMPLES_READ_ONLY') {
            this.alert(window.Blockly?.Msg['BKY_EXAMPLES_READ_ONLY'] ||
                '已取消開啟內建範例。內建範例為唯讀，請重新開啟並選擇「複製並開啟」。');
        } else if (e !== 'Canceled') console.error('[Bridge] Open examples failed:', e);
    }
    return;
}

/**
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function openDatasetManager(_command, _data) {
    // 前端已有 CocoyaDataset 模組，直接 dispatch
    this._dispatchToFrontend({ command: 'openDatasetManager' });
    return;
}

/**
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function pickFolder(_command, data) {
    try {
        const result = await this.tauriInvoke('pick_folder', { defaultPath: data.defaultPath || null });
        const { convertFileSrc } = await import('@tauri-apps/api/core');
        const images = (result.images || []).map(img => ({
            name: img.name,
            path: img.path,
            label: img.label,
            blobUrl: convertFileSrc(img.blobUrl)
        }));
        this._dispatchToFrontend({
            command: 'folderSelected',
            requestId: data.requestId,
            path: result.path,
            images: images,
            labelCounts: result.labelCounts,
            labelMap: result.labelMap
        });
    } catch (e) {
        if (e === 'Canceled') {
            this._dispatchToFrontend({
                command: 'folderSelected',
                requestId: data.requestId,
                error: '使用者取消選擇'
            });
        } else {
            console.error('[Bridge] Pick folder failed:', e);
            this._dispatchToFrontend({
                command: 'folderSelected',
                requestId: data.requestId,
                error: String(e)
            });
        }
    }
    return;
}

/**
 * @this {import('../tauri.js').BridgeTauri}
 */
export async function pickDataFile(_command, data) {
    try {
        const fileResult = await this.tauriInvoke('pick_data_file', { defaultPath: data.defaultPath || null });
        this._dispatchToFrontend({
            command: 'dataFileSelected',
            requestId: data.requestId,
            path: fileResult.path,
            content: fileResult.content
        });
    } catch (e) {
        if (e === 'Canceled') {
            this._dispatchToFrontend({
                command: 'dataFileSelected',
                requestId: data.requestId,
                error: '使用者取消選擇'
            });
        } else {
            console.error('[Bridge] Pick data file failed:', e);
            this._dispatchToFrontend({
                command: 'dataFileSelected',
                requestId: data.requestId,
                error: String(e)
            });
        }
    }
    return;
}

/**
 * newFile / createWindow 的共用實作（開新視窗）。
 *
 * ⚠️ 兩個匯出指向同一函式 —— 對應原 switch 的 fallthrough 組（body 完全相同）。
 * @this {import('../tauri.js').BridgeTauri}
 */
async function newFile(_command, _data) {
    await this.tauriInvoke('create_window');
    return;
}

export { newFile as newFile };
export { newFile as createWindow };
