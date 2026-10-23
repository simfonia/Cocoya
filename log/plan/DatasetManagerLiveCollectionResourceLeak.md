# Dataset Manager Live 採集：資源釋放缺陷與耗盡根因 / 修復計畫

- **建立日期**：2026-10-20
- **審查修訂**：2026-10-20（Act 模式，逐項對照程式碼修正；原檔已備份至 `backup/DatasetManagerLiveCollectionResourceLeak_20261020_173413.md`）
- **任務**：`#task[cocoya 開新視窗當機診斷] 之 DM live 採集資源線追查`
- **來源**：前序診斷結果（`CameraService.stop()` 2 秒超時、`takeSnapshot` blob URL 錯誤路徑、`startBurst` 狀態競態、sidecar 孤兒、多視窗累積）

---

## 0. 結論摘要

DM 的 **live 採集照片（Sampler + camera_service + sidecar）** 已有資源清理機制：

- `camera_service.py::_run()` 每幀使用「本地 `cap` 參照」，退出時 `cap.release()` + `cv2.destroyAllWindows()`；
- 前端 `stopCamera(true)` 發 `datasetStopCamera`、`stopBurst()`、`stopStatusPoll()`；`closeModal()` 呼叫 `Sampler.dispose()`；
- 快照 `takeSnapshot()` 會 `URL.revokeObjectURL(上一張)` 後再 `URL.createObjectURL(新 blob)`；
- 連拍 `startBurst()`/`stopBurst()` 控制 `setInterval`；
- 歷史上 2026-09-10 已修過「按停止不關 OpenCV 視窗」的 bug（跨執行緒 `destroyAllWindows()` 會 deadlock，故改由 `_run` 執行緒自己清理）。

但仍存在 **5 個真實的資源耗盡／遺漏環節**（2026-10-20 審查後評級），最可能在同一台電腦上造成「逐漸卡頓、最終當機」的情形：

| # | 缺點 | 位置 | 風險 | 審查評級 |
|---|---|---|---|---|
| 1 | `CameraService.stop()` 只 `join(2.0s)`，`cap`／OpenCV 視窗不由 `stop()` 直接釋放；若 `_run()` 執行緒卡住，camera handle 與視窗會「失守」 | `camera_service.py:88-96`、`:108-154` | 狀態不一致；GDI／camera handle 累積 | 半對：風險存在，但原修法（置 `self.cap=None`）錯誤，會製造新洩漏 |
| 2 | 多視窗並存：每視窗獨立 sidecar + `CameraService` + OpenCV 視窗（`cv2.VideoCapture(0)`、執行緒、同名視窗） | `state.rs:259`、`dataset.rs:114`、`cocoyaManager.ts:60`、`sidecarManager.ts:37-48` | 同一台電腦多個視窗時，CPU／記憶體／GDI 突降 | 成立（已補 host 證據；「重複開關」收斂為「多視窗並存」，見 §1.2） |
| 3 | `takeSnapshot()` 正常關閉路徑從不 revoke `lastPreviewUrl`；異常路徑僅漏當次一個 URL | `sampler.js:243-261`、`sampler.js:51-56`、`ui_layout.js:2267,2277` | 每次開關 DM 成功拍照過，最後一張預覽 URL 永久殘留 | 主次顛倒：先修 `dispose()` 保底，而非異常路徑 |
| 4 | X 關 OpenCV 視窗 → `datasetCameraStatus(false)` 只改 `isCamRunning`、不停 burst；連拍 `setInterval` 續跑 | `sampler.js:29-37` | 定時器與失敗快照持續存在，CPU／記憶體隱性耗損 | 原描述（`force=false` 守衛）是已修舊 bug；真風險在 X 關窗路徑 |
| 5 | 「孤兒 sidecar」實為「常駐持有相機」；停相機 ≠ 結束 sidecar 進程 | `dataset_sidecar.py:168-172,480-483`、`dataset.rs:233-241`、`cocoyaManager.ts:83-87` | 關 DM 未送 `stopCamera` 時相機被常駐進程持有 | 混淆生命週期：`exit` 只綁面板／視窗銷毀，不可綁停相機 |

---

## 1. 詳細根因與證據

### 1.1 缺點 1：`stop()` 2.0s timeout，不保底放出 `cap`／視窗

- 位置：`resources/dataset_manager/camera_service.py:88-96`
  ```python
  def stop(self):
      self.running = False
      if self.thread:
          self.thread.join(timeout=2.0)
  ```
- 現況：真正的 `cap.release()` + `cv2.destroyAllWindows()` 寫在 `_run()` 退出分支（`:150-154`），`stop()` **只設 flag 並 join**。
- 風險：若 `_run()` 被 `cap.read()`、`cv2.imshow()`、`cv2.getWindowProperty()` 卡住，`join(2.0)` 以後 `self.cap` 仍非 `None`；後續的 `capture()`、`stopCamera()` 之間的狀態函式可能不一致（按鈕卡在「停止」）。
- 證據：`log/work/2026-09-10.md`「熱修2／熱修3／熱修4」記載過實機「按鈕變停止攝影機、按了 OpenCV 視窗不關、stopCamera 30s timeout」等類似問題，且修復依賴「執行緒自行退出、join 放寬 2.0s」。
- 審查補充（2026-10-20）：「`_run` 卡住」目前無行級證據——`cap.read` 有 `try/except`、`getWindowProperty` 有 `try/except`、`ret==False` 有 `sleep(0.01)`、`waitKey(1)` 正常只擋 1ms。USB 驅動層卡死有可能，但缺 log／dump 證據。不可直接把 `join` 放寬到 5s 當修復（只讓前端多等）；應先加可觀測性（`stop()` 回傳 `thread.is_alive()`、log `running/cap is None/thread alive` 三元組），再定保底策略。
- 原修法「`stop()` 後置 `self.cap = None`」已撤回：`_run()` 取本地參照 `cap = self.cap`，退出分支檢查 `if self.cap` 才 `release()`。`stop()` 執行緒若置 `None`，`_run` 手中本地 `cap` 成孤兒且退出分支跳過釋放——原本會釋放的反而漏掉。正確二選一：(a) 維持現狀（釋放永遠由 `_run` 做）；或 (b) 持鎖取出舊 `cap` 並 `release()` 它，且 `_run` 退出改 `try/finally` 配本地參照釋放。`destroyAllWindows()` 仍不可搬進 `stop()`（09-10 deadlock 教訓維持）。

### 1.2 缺點 2：多視窗並存產生多組資源（已證實，補 host 證據）

- host 進程模型（2026-10-20 補查，非猜測）：
  - Tauri：`src-tauri/src/state.rs:259`（`sidecar_processes: HashMap<Window Label, SidecarProcess>`）＋ `src-tauri/src/commands/dataset.rs:114,181,306,380`（`start_sidecar`／`sidecar_send` 皆以 `window.label()` 為 key）→ 每視窗獨立 python 進程。
  - VSIX：`src/cocoyaManager.ts:60`（每個 `CocoyaManager(panel)` 各 `new DatasetSidecarManager(...)`）＋ `src/sidecarManager.ts:37-48`（`start()` 內 `spawn(python dataset_sidecar.py)`；`if (this.process) return true` 同面板復用）＋ `cocoyaManager.ts:83-89,452`（`activeManagers: Set` 追蹤多面板，`onDidDispose → sidecar.stop()`）→ 每面板獨立進程。
  - `Sampler` 的「全域單例」（`sampler.js:9-21`）是 per-JS-context 單例（每個 webview／每個 Tauri window 各一份 JS 世界，各有一份 `Sampler`），與「每視窗一套 sidecar」不矛盾。
- 後端：各 sidecar 內 `DatasetSidecar` → `CameraService` → `cv2.VideoCapture(device_id)`、`cv2.namedWindow`、`cv2.imshow`、`cv2.waitKey(1)` 都會佔用系統資源。
- 風險：同一台電腦開 2～3 個視窗並同時開 live，會同時出現：
  - 多個 Python sidecar 進程；
  - 多個 `cv2.VideoCapture(0)`（第二個可能 `isOpened()` 失敗或搶走同一 cam；
  - 多個同名 OpenCV 視窗（`Cocoya Dataset Preview`）互相衝突；
  - 額外的 display thread + 列舉／掃描負載。
- 收斂用詞：「重複開關」不會疊加（同面板 `start()` 復用進程、`CameraService.start()` 有 `if self.running: return True` no-op）→ 觸發條件收斂為「多視窗／多面板並存且同時開 live」，非「開關次數」。
- 為「多台電腦都能重現、但只在卡住特定組合時發生」的性質。

### 1.3 缺點 3：`lastPreviewUrl` 正常關閉路徑從不 revoke（主）＋ 異常路徑漏當次一個 URL（次）

- 位置：`ui/src/modules/dataset_manager/sampler.js:243-261`（建 URL）、`:51-56`（`dispose()`）、`ui_layout.js:2267,2277`（`closeDatasetManager()`）
- 現況：`takeSnapshot()` 第 243–244 行先 revoke 舊 URL 再建新 URL；第 262–264 行 `catch` 有 `throw err`（不是「只記錄」）。
- 真實洩漏（主）：`Sampler.dispose()` 只做 `stopStatusPoll + stopBurst`，`closeDatasetManager()` 也沒 revoke `lastPreviewUrl`。**每次開關 DM 且成功拍照過，最後一張預覽 URL 就永久殘留**（VS Code webview 跟隨整個 session，反覆開關持續累積）。
- 真實洩漏（次）：異常路徑僅漏「當次新建的那一個 URL」（已寫進 `lastPreviewUrl`，下次成功拍照會被 revoke），除非連續失敗才累積。
- 修法注意：異常路徑若「revoke 後再 throw」會把剛拍到的圖一起銷毀，應區分「建 URL 前失敗」（無需 revoke）vs「建 URL 後失敗」（保持 `lastPreviewUrl` 由下次成功拍照或 `dispose()` 收尾）。優先修 `dispose()` 保底。

### 1.4 缺點 4：X 關 OpenCV 視窗後連拍 `setInterval` 續跑（原 `force=false` 守衛描述已過時）

- 位置：`sampler.js:29-37`（`datasetCameraStatus` 事件訂閱）、`:88-99`（`startStatusPoll`）、`:192-200`（`stopCamera`）、`:271-283`（`startBurst`）
- 現況：`stopCamera()` 無論是否 force，只要送出就會同步 `stopBurst() + stopStatusPoll()`；且 `ui_layout.js` 全部清理路徑（`onStopCamera`、live 切換、`enterWorkspace`、`backToEntry`、`closeDatasetManager` 共 7 處）一律用 `stopCamera(true)`。原「`force=false` 守衛早退漏清 interval」是 09-10 熱修 2 已修掉的舊 bug，`false` 路徑已無清理呼叫者。
- 真實殘留風險：OpenCV 視窗按 X 關閉時，`_monitor_camera` → `datasetCameraStatus(running=false)` → `sampler.js:29-37` 只更新 `isCamRunning`，沒有 `stopBurst()`。連拍中的 `setInterval` 會繼續每 500ms 打 `takeSnapshot`，每次失敗進 `catch` 吃掉。修法目標應為「狀態事件轉 false 時停 burst（或 burst 迴圈自檢 `isCamRunning`＋連續失敗熔斷）」，而非 `stopCamera` 守衛。

### 1.5 缺點 5：「孤兒 sidecar」實為「常駐持有相機」——兩種生命週期不可混淆

- 位置：`dataset_sidecar.py:168-172`（`run()` 主迴圈）、`:480-483`（`exit`）、`src-tauri/src/commands/dataset.rs:233-241`（`stop_sidecar_inner`）、`src/cocoyaManager.ts:83-87`（`onDidDispose → sidecar.stop()`）
- 現況：`run()` 第 168–172 行 `readline` 返回空字串就 `break`，stdin 關閉（host 死亡）時進程自己退出，不是孤兒。真正的條件是「stdin 還開著、但永遠收不到 `stopCamera/exit`」（VSIX webview 關閉但 extension host 常駐，sidecar 被設計為常駐服務）→ 稱「孤兒」是誤稱，實為「常駐但持有相機」。
- 邊界：停相機只停 `CameraService`；sidecar 進程常駐，退出只綁面板／視窗銷毀（VSIX 已有 `onDidDispose → stop()` 送 `exit`；Tauri 有 `stop_sidecar_inner: drop stdin + kill + wait`）。原「停相機後送 `exit`」修法已撤回——`exit` 會終結整個主迴圈（含訓練／匯出服務），每次拍照完殺進程等於把服務一起停掉。
- 結果：若關 DM 未送 `stopCamera`，相機被常駐進程持有；後續 `datasetStartCamera` 可能因相機鎖被卡住。`taskmgr` 判讀前須先區分「常駐 sidecar」（正常）vs「真孤兒」（host 已死但 python 仍在）。

## 2. 修復計畫（按優先順序，2026-10-20 審查後重排）

### P0：文件修正（不碰碼，已在本修訂完成）
- §1.1 補「卡住缺證據」＋撤回置 `None` 修法；§1.2 補 host 證據＋收斂「多視窗並存」；§1.3 主次對調；§1.4 改指 X 關窗；§1.5 刪「停相機送 exit」。

### P1（小改大效，建議實作順序）

#### P1-1：`dispose()` 保底 `revokeObjectURL(lastPreviewUrl)`
- 修改 `ui/src/modules/dataset_manager/sampler.js::dispose()`：結尾加 `if (this.state.lastPreviewUrl) { URL.revokeObjectURL(this.state.lastPreviewUrl); this.state.lastPreviewUrl = null; }`。
- 異常路徑不額外 revoke（保持 `lastPreviewUrl` 由下次成功拍照或本保底收尾），避免銷毀剛拍到的圖。

#### P1-2：X 關窗事件連動 `stopBurst()`
- 修改 `sampler.js` 的 `datasetCameraStatus`／`datasetCameraStatusSync` 訂閱：當新狀態為 false 且舊狀態為 true 時，同步 `this.stopBurst()`（或在 burst 迴圈內自檢 `isCamRunning`＋連續失敗熔斷）。
- 既有 7 處 `stopCamera(true)` 保持不動（已正確）。

#### P1-3：`list_cameras()` 與 `_run()` 釋放區改 `try/finally`
- `camera_service.py:37-57`：`cap.release()` 移入 `finally`（`read/get` 拋錯亦釋放）。
- `camera_service.py:108-154`：釋放區（`release + destroyAllWindows`）改 `try/finally` 配本地參照（`imshow` 在 `try` 外，拋錯亦釋放）。注意：此處是 `finally` 保底，不是包 `try/except` 吞錯。
- 附帶：`self.feature`（MediaPipe lazy 實例）從未釋放，multi-window 下每 sidecar 一份，一併評估釋放點。

### P2（觀測先行，不直接改行為）

#### P2-1：`stop()` 可觀測性
- `stop()` 回報 `thread.is_alive()`，log `running/cap is None/thread alive` 三元組；確認「卡住」真實行級位置後，再決定保底策略（維持 `_run` 釋放 vs 持鎖釋放）。`join` 維持 2.0s，不放寬到 5s。

#### P2-2：常駐 vs 孤兒鑑別
- 實機先區分「常駐 sidecar」（host 活著，正常）vs「真孤兒」（host 已死但 python 仍在），再設計退出綁定。`taskmgr` 判讀須附 host 存活狀態，否則數字無意義。

### P3（防禦層，可選）
- 在 `Sampler` 狀態或 `ui_layout.js` 中增加「已有窗口正在開啟 live 採集」或「連拍仍在進行」的提示／互斥；
- 不在產品需求層面強制禁止多視窗，但可在日誌／狀態欄標出資源使用情形，方便教學環境排查。

---

## 3. 驗證方法

### 3.1 自動化／靜態驗證
- `node --check` 檢查前端改動（`ui/src/modules/dataset_manager/sampler.js`、`ui/src/modules/dataset_manager/ui_layout.js`）
- `py_compile` 檢查後端改動（`resources/dataset_manager/camera_service.py`、`resources/dataset_manager/dataset_sidecar.py`）
- `git diff --check` 確保無空白／行尾問題
- 改檔後 `npm run eol:fix` 收尾（AGENTS.md 行尾三層防護）；相關測試 `npm run test:fast`（至少 `test:dm`）＋ `lint:ui`

### 3.2 實機驗證（建議在單一電腦先做）
1. 開啟 DM 的 live 採集，拍照 10 張；關閉，重開 3 次。
   - 檢查 `taskmgr` 中 `python.exe`／其他 Python 進程數量是否穩定（須附 host 存活狀態，區分常駐 vs 真孤兒）。
2. 連拍 60 秒不關；X 關 OpenCV 視窗，確認 burst 已停（P1-2 驗證）；關閉後觀察記憶體／CPU。
3. 強制關閉（X / 重啟 / 殭屍）後觀察是否殭屍 `python` sidecar。
4. 開 2 個 Cocoya 視窗，同時開 live 採集，檢查其中一個是否能順利啟動相機（缺點 2 主場景）。

### 3.3 變異測試（如可行）
- 關閉／重開、連拍、X 關窗、連拍中關窗、`onSampleCaptured` 拋錯，斷言：
  - `cap` 與 `lastPreviewUrl` 皆已 release（`burstTimer == null`、`lastPreviewUrl == null`、`thread.is_alive == False`）；
  - `setInterval` 無殘留；
  - `taskmgr` 中 `python.exe` 未增加（附 host 存活狀態）。

---

## 4. 記錄件

- 本文件：`log/plan/DatasetManagerLiveCollectionResourceLeak.md`
- 相關修復歷史：`log/work/2026-09-10.md`（熱修2/3/4，CameraService 原本未釋放視窗／跨執行緒 destroyAllWindows deadlock）
- 待後續提交：`log/todo.md` 追加本任務條目（如有必要）

---

## 5. 下次啟動方向 (Next Steps)

1. 審查已完成（2026-10-20，見 §0 評級＋各節審查補充）；如有使用者實機殘留紀錄，直接投影到 P1/P2 對應步驟。
2. 若要立即修復資源耗盡風險，優先實作 P1-1（`dispose()` revoke 保底）與 P1-2（X 關窗停 burst）＋ P1-3（兩處 `try/finally`）。
3. 若要修復「全電腦當機」現象，需先鎖定是「多視窗並存開 live」（缺點 2，現有最強假設）還是「外部 serial / 螢幕廣播環境」引起；建議以 §3.2 先做 1 台電腦對照。
4. 完成修復後，取得實機驗證並同步更新 `log/todo.md`。

---

## 6. 審查修訂紀錄（2026-10-20 Act 模式）

| 節 | 原問題 | 修正 |
|---|---|---|
| §0 表 | 無評級，5 項皆稱「真實」 | 加審查評級列；#2 收斂為多視窗並存；#4 改指 X 關窗；#5 改稱常駐持有 |
| §1.1 | 「卡住」無證據卻直接放寬 join＋置 `None` | 補缺證據說明；撤回置 `None`（會造新洩漏）；給二選一正確方向；`join` 維持 2.0s |
| §1.2 | 「單例 vs 每視窗一套」語焉不詳，無 host 證據 | 補 Tauri `state.rs/dataset.rs`＋VSIX `cocoyaManager.ts/sidecarManager.ts` 證據；釐清 per-JS-context 單例；收斂觸發條件 |
| §1.3 | 誤稱 catch 只記錄；漏掉關閉路徑主洩漏 | 主次對調：主＝`dispose()` 從不 revoke；次＝異常路徑僅漏當次一個；禁「revoke 後 throw」 |
| §1.4 | 描述已修舊 bug（`force=false` 守衛） | 改指 X 關窗不停 burst 真路徑；給修法目標 |
| §1.5 | 「停相機送 exit」混淆生命週期 | 撤回；確立停相機≠殺進程；`exit` 只綁面板／視窗銷毀；常駐 vs 孤兒鑑別 |
| §2 | 步驟 1／4 照做會引入新缺陷 | 重排為 P0/P1/P2/P3；新增 M1/M2 即 P1-3（`list_cameras`＋`_run` 之 `try/finally`、`self.feature` 未釋放） |
| §3 | 缺守門＋判準模糊 | 補 `eol:fix`／`test:fast`／`lint:ui`；變異判準具體化；taskmgr 須附 host 存活 |
| 備份 | — | 原檔 `backup/DatasetManagerLiveCollectionResourceLeak_20261020_173413.md` |


