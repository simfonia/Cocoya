# Dataset Manager Live 採集：嵌入式預覽（取代 OpenCV 視窗）— 路徑 A（Polling）

- **建立日期**：2026-10-23
- **任務**：`#task[cocoya 內嵌相機預覽]`
- **策略**：先做路徑 A（前端 polling），保留 OpenCV 視窗程式碼為 fallback；實機驗證幀率與 CPU 後再決定是否升級路徑 B。

## 0. 結論摘要

DM live 採集目前把 cv2.VideoCapture 的畫面用 cv2.imshow 開在獨立 OpenCV 視窗中，導致視窗遮住 modal、HighGUI 跨執行緒 deadlock 風險、多視窗視窗重疊。

可行且低風險：camera_service.py 已在 _run() 每幀寫 self.frame（帶 lock），capture() 已把該幀編成 base64 JPEG 回給前端，前端 takeSnapshot() 已實作 base64→blob→object URL→#dataset-sampler-last-preview 的完整渲染管線。只需把「只在拍照時送一次」改為「相機 running 期間定期送幀」，並移除 imshow/waitKey/getWindowProperty/namedWindow/destroyAllWindows。

X 關窗偵測由 OpenCV 視窗提供 → 改為 UI「停止攝影機」按鈕（已存在）。

## 1. 範圍

In scope（路徑 A）：
- sidecar 新增 getPreviewFrame command（回傳 base64 JPEG，不存檔）。
- camera_service.py：移除 HighGUI 視窗操作；保留 cap.read() + self.frame 寫入 + cap.release()。
- 前端：相機 running 期間以 setInterval (~100ms) 輪詢 getPreviewFrame，更新 #dataset-sampler-last-preview；running=false 時停止 polling 並還原 placeholder。
- placeholder 文案更新（移除「即時影像請看 OpenCV 預覽視窗」）。
- i18n 兩語系同步。

Out of scope：路徑 B（push streaming）、captureImage/collectFeature 既有路徑、多視窗互斥。

## 2. 步驟

### A-0：準備與基線
- [ ] 備份原檔到 backup/（時間戳 20261023_HHmmss）：camera_service.py、dataset_sidecar.py、sampler.js、ui_components.js、samplerPanel.js、i18n 兩檔。
- [ ] 跑基線：node --check ×3 前端檔、py_compile ×2 後端檔、npm run test:dm 全綠，記錄當前通過數。

### A-1：sidecar — 新增 getPreviewFrame command
- dataset_sidecar.py command dispatch 新增 getPreviewFrame：若 camera running 且 frame 非 None，回 {success, image: base64, width, height}；否則 {success:false, errorCode:'NO_FRAME'}。
- 不寫磁碟、不觸發 onSampleCaptured。
- VSIX：src/handlers/datasetOps.ts 加 handleDatasetGetPreviewFrame；STILL_LOCAL set 加 'getPreviewFrame'。
- Tauri：ui/src/bridge/tauri/camera.js 新增 datasetGetPreviewFrame（走 _handleDatasetCommand('getPreviewFrame', ...)）。
- 守門：sidecar_module_split.test.mjs 的 STILL_LOCAL set 與 tauri_send_dispatch.test.mjs 的 camera 清單同步更新。

### A-2：camera_service.py — 移除 HighGUI，保留 frame 採集
- 刪除：namedWindow、imshow、waitKey、getWindowProperty、destroyWindow/destroyAllWindows、flip（改到編碼前或保留 flip 在 _run 寫入 self.frame 前）。
- _run() 簡化為：cap.read() → 若 ret：self.frame = frame.copy()；否則 time.sleep(0.01)；迴圈條件 while self.running。
- stop() 維持 self.running=False + join(2.0)（釋放仍由 _run 退出分支的 cap.release() 做；沿用 P1-3 try/finally）。
- 新增 get_preview_frame()：lock 下取 self.frame，cv2.imencode('.jpg') → base64；無 frame 回 None。

### A-3：前端 sampler.js — polling loop
- 新增 state：previewTimer（setInterval id）、livePreviewUrl（需 revoke）。
- startCamera() 成功後啟動 startPreviewPolling()：setInterval(async()=>{...},100) → datasetBridge.request({command:'datasetGetPreviewFrame',...}) → 若 success：更新 livePreviewUrl（revoke 舊的）並設定 img src；失敗/NO_FRAME：保留 placeholder。
- stopCamera(force) 與 X 關窗路徑（datasetCameraStatus(false)）皆呼叫 stopPreviewPolling()（clearInterval + revoke livePreviewUrl + 還原 placeholder）。
- dispose() 一併 revoke livePreviewUrl。

### A-4：UI — placeholder 與 live 預覽切換
- ui_components.js / samplerPanel.js：placeholder 文案改為「相機未啟動」或「尚無預覽」；移除「即時影像請看 OpenCV 預覽視窗」。
- 複用同一個 img：相機 running 時顯示 live 幀、running=false 時顯示「最近一次拍攝」。
- i18n：zh-hant.js / en.js 同步更新文案鍵。

### A-5：清理與文件
- 移除不再使用的 i18n 鍵（若有）；core_contract.test.mjs 守門自動驗證。
- npm run eol:fix 收尾。
## 3. 風險與緩解

| 風險 | 緩解 |
|---|---|
| 10fps 體驗不足 | 路徑 A 先行；若不足升級路徑 B；interval 可調（100ms→66ms） |
| base64 IPC 負載（~300KB/s） | 640×480 JPEG quality 70；可降解析度至 320×240 作 live 預覽（拍照仍用全解析度） |
| polling 與拍照競態 | camera_service 已有 lock；get_preview_frame 取 lock copy 後編碼，不阻塞 _run |
| 相機啟動但尚未收到第一幀 | 保留 placeholder；NO_FRAME 不報錯 |
| modal 關閉後 polling 殘留 | dispose() + stopPreviewPolling()；測試斷言 previewTimer == null |
| VSIX 端 sidecar dispatch 漏註冊 | sidecar_module_split.test.mjs 守門 + tauri_send_dispatch.test.mjs |
| HighGUI 移除後 cap.release() 仍由 _run 做 | 沿用 P1-3 try/finally；stop() 不碰 cap |

## 4. 驗證方法

靜態：node --check（sampler.js、ui_components.js、samplerPanel.js）；py_compile（camera_service.py、dataset_sidecar.py）；npm run test:dm、npm run lint:ui、npm run eol:fix + git diff --check。

行為（手動）：啟動相機 → 預覽區即時顯示畫面（~10fps）；停止相機 → 預覽還原 placeholder，無 polling 殘留；拍照 → 預覽切換為「最近一次拍攝」；連拍 60s → 記憶體/CPU 穩定；關閉 modal → 無殭屍 polling / python 進程。

變異測試（新增守門時）：刪除 stopPreviewPolling() 呼叫 → 測試應報紅；刪除 get_preview_frame 的 lock → 測試應報紅。

## 5. 下次啟動方向 (Next Steps)

1. 進入 act mode，依 A-0 → A-5 順序實作；每步完成後跑對應測試。
2. A-1 / A-2 完成後先實機驗證「無 OpenCV 視窗、預覽仍可拍照」。
3. A-3 / A-4 完成後實機驗證幀率；若 < 8fps，調整 interval 或降解析度。
4. 完成後更新 log/todo.md 對應條目為 [x]，並寫 log/work/<日期>.md。

## 6. 相關檔案索引

- 計畫 SSOT：本檔
- 資源釋放計畫（前置）：log/plan/DatasetManagerLiveCollectionResourceLeak.md
- 待辦追蹤：log/todo.md
- 後端：resources/dataset_manager/camera_service.py、resources/dataset_manager/dataset_sidecar.py
- 前端：ui/src/modules/dataset_manager/sampler.js、ui/src/modules/dataset_manager/ui_components.js、ui/src/modules/dataset_manager/ui/samplerPanel.js
- Bridge：ui/src/bridge/tauri/camera.js、src/handlers/datasetOps.ts
- 守門：ui/src/modules/dataset_manager/sidecar_module_split.test.mjs、ui/src/bridge/tauri_send_dispatch.test.mjs
- i18n：ui/src/zh-hant.js、ui/src/en.js、各模組 i18n/*.js

