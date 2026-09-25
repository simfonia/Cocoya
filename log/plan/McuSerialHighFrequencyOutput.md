# MCU 高頻 Serial 輸出穩定性計畫

**建立日期**：2026-09-25  
**問題範圍**：Tauri MCU 模式優先；VSIX 使用 VS Code 原生終端機，列為後續相容性回歸。  
**觸發情境**：產生並上傳下列程式後，Cocoya 在大量 Serial 訊息下停止回應，或無法再次上傳：

```python
while True:
    print("hello")
```

## 1. 目標

- 高頻 Serial 輸出不可讓 Tauri WebView 長時間無回應。
- 停止監看後，序列埠必須確實釋放，能再次上傳程式。
- 不改變一般 Serial 訊息的語意與多視窗隔離。
- 保留 raw Serial 診斷能力，但不得讓診斷寫檔阻塞正式監看流程。
- 高於 UI 可處理能力的普通訊息必須採有界策略，並提供可見的丟棄數量或警告。

## 2. 已取證的可疑路徑

### 2.1 Python monitor 的同步磁碟 I/O

`resources/deploy/base.py::BaseDeployer.monitor` 目前在每次讀到 Serial 資料時，會開啟並追加 `temp_scripts/raw_dump.log`，再關閉檔案。`print("hello")` 會讓這段路徑以極高頻率執行，可能造成不必要的磁碟 I/O 與 monitor 延遲。

**計畫決策**：保留診斷功能，但改為明確開發旗標才啟用；正式預設關閉。若啟用，仍需使用非同步或有界策略，不得在 Serial 主迴圈逐批同步開關檔案。

### 2.2 Tauri 事件洪水與 WebView DOM 更新

`src-tauri/src/commands/mcu.rs` 的 monitor stdout 目前約每 1 KB chunk 發送一次 `python-log` 事件。`ui/src/bridge/tauri.js` 收到事件後直接呼叫 `CocoyaUI.appendTerminal`，而 `ui/src/ui/terminal.js` 每次都可能執行 DOM 追加、行數清理、`scrollHeight` 計算與自動捲動。

**計畫決策**：Rust 與前端都要建立有界批次處理；不能以每個 chunk 一個事件、每個事件一次 layout 的方式承受無限輸出。

### 2.3 Monitor 停止與上傳交接

`src-tauri/src/commands/mcu.rs::stop_serial_monitor` 目前主要以 `Child::kill()` 停止 monitor，未明確等待子程序結束、stdout/stderr reader thread 收到 EOF，以及 COM 埠完全釋放。`deploy_mcu` 會先停止 Python/monitor，再建立新的 deploy process，因此高頻輸出時可能遇到埠尚未釋放就再次開啟的競態。

**計畫決策**：把「停止 monitor」改成可等待的資源交接流程；必要時加入 timeout 與 Windows process-tree termination 保底。上傳期間不得因 focus 自動重取 monitor。

## 3. 分階段實作

### Phase 0：建立可重現訊號

- 建立不需實體開發板即可執行的測試/harness，模擬高頻 Serial chunk。
- 驗證以下現象可被量測：
  - raw dump 是否每批同步寫檔。
  - Rust/前端事件數是否隨輸入無界增加。
  - terminal DOM flush 次數與輸入 chunk 數是否一比一。
  - pending buffer 是否有最大容量。
- 無硬體環境時，不宣稱已重現「COM 埠無法再次上傳」；該項保留實機驗證。

### Phase 1：修正 Python monitor 的診斷寫檔

- 將 raw dump 改由開發旗標控制，正式預設關閉。
- 開發模式若啟用，改用背景 writer 或有界 ring buffer，避免每批 `open/write/close`。
- 保留 UTF-8 解碼、換行整理、`OK`/完成訊息與錯誤處理語意。
- 避免把使用者程式輸出直接限制成固定低頻；應由 host/UI 採背壓。

### Phase 2：Rust 輸出聚合與背壓

- 在 `src-tauri/src/commands/mcu.rs` 抽出 deploy/monitor 可共用的輸出轉發策略。
- 以固定時間窗或固定大小合併 stdout/stderr，再發送 `emit_to(&own_label, ...)`。
- pending buffer 設定最大 bytes；超過上限時只丟棄普通 log，保留 error、完成與停止事件。
- 丟棄訊息需帶 dropped count，讓使用者知道終端機顯示不是完整 raw stream。
- 不得退回全域 `emit`，維持多視窗單播契約。

### Phase 3：前端批次渲染

- 在 `ui/src/bridge/tauri.js` 對 `python-log`/`python-error` 建立有界 queue。
- 使用 `requestAnimationFrame` 或固定間隔 flush，避免每個事件都同步更新 DOM。
- 在 `ui/src/ui/terminal.js` 增加批次追加能力，單次 flush 完成文字合併、行數/字數上限與捲動。
- 高頻輸出時降低自動捲動成本；錯誤、上傳成功與 monitor stopped 等控制訊息不可被普通 log 淹沒。
- 保留現有 1000 個 terminal child 的保護，並評估改以字數上限避免單一 child 過大。

### Phase 4：停止 monitor 與上傳交接

- 為 `SerialMonitorSession` 增加可觀察的停止狀態或 join/完成通知。
- `stop_serial_monitor`：標記停止、終止 child、等待 child exit 與 reader EOF，再移除 session。
- Windows 必要時以 `taskkill /F /T /PID` 清理子孫程序，避免只殺 Python 父程序。
- `deploy_mcu` 在開始部署前確認該視窗 monitor 已完成釋放。
- 區分「使用者明確停止」與「上傳前暫停」：上傳完成後不可因舊的 `serial_wants` 或 focus 事件意外重開舊 monitor。
- 檢查 `serial_monitors`、`serial_wants` 與多視窗搶占同一埠時的狀態一致性。

### Phase 5：VSIX 相容性回歸

- VSIX 目前透過 `src/handlers/serialOps.ts` 建立 VS Code 原生 Terminal，與 Tauri WebView 路徑不同。
- 先確認高頻輸出是否仍能讓 VS Code Terminal 或 monitor process 異常。
- 若 VSIX 不存在同一問題，保留最小必要修正，不將 Tauri 的 DOM batching 硬套到原生 Terminal。

## 4. 測試矩陣

### 自動測試

- Python：monitor 高頻 chunk 處理、raw dump 預設關閉、開發旗標開啟時不阻塞主迴圈。
- Node：事件聚合、queue 上限、dropped count、terminal batch flush 與行數/字數上限。
- Rust：可測範圍內驗證 monitor stop state、session 移除與停止交接。
- 語法/建置：
  - `python -m py_compile resources/deploy/base.py`
  - `node --check ui/src/bridge/tauri.js`
  - `node --check ui/src/ui/terminal.js`
  - `cargo check --manifest-path src-tauri/Cargo.toml`
  - `npm run compile`
  - `npm run build --prefix ui`

### Tauri 實機

使用 XIAO ESP32-S3 或 Maker Pi RP2040：

1. 上傳 `while True: print("hello")`，持續 30 秒。
2. 觀察 WebView 是否仍可操作、CPU/記憶體是否持續上升。
3. 停止監看後立即重新上傳，重複 10 次。
4. 監看開啟時直接按上傳，確認部署流程先完成埠交接。
5. 視窗失焦、重新聚焦，再停止監看與上傳。
6. 兩個 Tauri 視窗交替監看同一 COM 埠，確認事件不互相污染。
7. 確認高頻普通 log 若被丟棄，畫面顯示 dropped count 或明確警告；錯誤與上傳完成訊息仍可見。

### VSIX 實機

- 使用同一支程式持續輸出，確認 VS Code Terminal 不停止回應。
- 重複監看停止／重新上傳至少 10 次。
- 確認不因 Tauri 專用的批次邏輯影響 VSIX 原生 Terminal。

## 5. 驗收條件

- Tauri 在 30 秒高頻輸出測試下仍能操作 UI。
- 停止監看後再次上傳成功率為 100%（至少連續 10 次）。
- raw dump 預設不產生逐批同步磁碟 I/O；開發旗標開啟時仍不阻塞 monitor。
- 普通 log 訊息有界，錯誤、停止與完成訊息不被丟棄。
- 多視窗事件仍使用 `emit_to` 精準單播。
- 自動測試、Rust/Node/Python 語法檢查與建置通過。
- 實機尚未完成前，相關 todo 保持未完成，不以編譯通過替代硬體驗證。

## 6. 不採用的短期修法

- 不要求使用者在每個 `print` 後自行加入 `sleep` 作為唯一解法。
- 不只把 terminal 最大行數從 1000 調大；這會延後而非解決事件與 DOM 壓力。
- 不將 Serial 輸出完全靜默，避免失去部署與除錯能力。
- 不把 `emit_to` 改回全域廣播。
- 不在尚未建立壓力測試前大幅重寫整個 Serial stack。

## 7. 目前狀態

- [x] 問題範圍確認：主要為 Tauri；VSIX 尚待測試。
- [x] 初步取證：同步 raw dump、事件洪水、同步 DOM 更新、monitor stop 交接皆為風險點。
- [x] 計畫建立。
- [x] Phase 0 壓力 harness（`temp_scripts/test_deploy_base_raw_dump.py`、`ui/src/ui/terminal_batch.test.mjs`）。
- [x] Phase 1 raw dump 開發旗標化（`_RawDumper` 有界背景佇列，`COCOYA_SERIAL_RAW_DUMP` 預設關閉）。
- [x] Phase 2 Rust 聚合與背壓（`forward_stream_with_backpressure` 30ms 時間窗/4KB 批次/有界佇列/dropped 警告注入/單播 `emit_to`）。
- [x] Phase 3 前端批次渲染（`terminal.js` 有界隊列、rAF 批次 flush、1000 行限制、單節點字元長度防護、`appendTerminalBatch`）。
- [x] Phase 4 monitor/上傳交接（`stop_serial_monitor` 等待 child exit、100ms 驅動冷卻、`deploy_mcu` 與 `set_window_focus` 互斥防呆）。
- [x] Phase 5 VSIX 回歸（確認共用 `base.py` 改善、VSIX 專用原生 Terminal 不受影響、`npm run compile` PASS）。
- [ ] Tauri 實機驗證（待硬體：`while True: print("hello")` 30 秒高頻輸出下 UI 可操作性與連續 10 次上傳）。
- [ ] VSIX 實機驗證（待硬體：VS Code 原生 Terminal 10 次上傳與監看停止穩定性）。
