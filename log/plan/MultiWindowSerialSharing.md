# 多視窗 Serial 獨佔根治：Phase 1 監看狀態單一化 → Phase 2 Serial Hub (2a)

- **建立日期**：2026-10-07
- **任務**：`#task[cocoya 多視窗Serial port獨佔]`
- **需求來源**：多視窗同時開啟 `examples/AI_03_Pose_EZ_Robot/02_Robot_Control.xml`（MCU）與 `03_PC_Pose.xml`（PC），同一 COM 埠下兩邊終端機要能同時看到 print 輸出；另含上傳後監看按鈕「先打開而不是關閉」的狀態 bug。
- **狀態**：Phase 1 程式整合與自動驗證完成；使用者已確認拔插同一 COM 可自動重連。其餘 Phase 1 實機案例延至 Phase 2 完成後合併驗收；Phase 2 開發中。

---

## 0. 根因分析（已查證，程式碼位置為準）

### 場景資源需求
| 視窗 | 範例 | print 來源 | 對 COM 的需求 |
|---|---|---|---|
| A | 03_PC_Pose（PC Python） | Python stdout → `run_python` pipe → `python-log`（不經 COM） | `py_io_serial_init` 生成 `serial.Serial('COM6',...)` **直開 OS 埠**（只 write） |
| B | 02_Robot_Control（MCU） | MCU print 走 USB REPL 從 COM 輸出 | 需 `deploy_mcu.py <port> --monitor-only` **開同一埠讀取** |

### 三層獨佔
1. **OS 層（Windows 根本限制）**：Windows COM 埠由 pyserial 開啟時，通常同一時間只能有一個程序取得該埠。症狀二選一：B 的 monitor 先開 → A 程式 `PermissionError`；A 先跑 → monitor 開埠失敗並持續重試。上傳部署同理可能遇到 `AccessDenied`。此處限定 Windows，不推論所有 POSIX 平台行為相同。
2. **應用層 steal**：`src-tauri/src/commands/mcu/monitor.rs:68-82` `spawn_serial_monitor` 發現同埠被**其他視窗的 monitor** 佔用 → 直接 `stop_serial_monitor` 殺掉對方。前提「一埠一 monitor」。
3. **方案 B ping-pong**：`monitor.rs:210-264` `set_window_focus` 失焦釋放／聚焦重搶（搶時含第 2 層 steal）。任一時刻單一持有者，切視窗即交接 → 天生做不到兩邊同時。

### 附帶查出的獨立 bug（Phase 1 對象）：上傳後按鈕「先打開而不是關閉」
- 上傳（非 serial_upload_only）時 `deploy.rs:66-68` **不加** `--no-monitor` → deploy child 上傳完**自己留在 monitor 模式**繼續輸出；但該 child 註冊在 `python_processes`，**不在** `serial_monitors`。
- 按鈕 `_serialMonitorActive` 只有兩個觸發點：toggle 回傳值（`ui/src/bridge/tauri/serial.js:70-72`）、`serial-monitor-stopped` 熄燈（`ui/src/bridge/tauri.js:225-227`）。**上傳自動開啟的 monitor 從未觸發亮燈事件**（Rust 無 started 事件）。
- 於是再按 → `toggle_serial_monitor`（`monitor.rs:164-185`）查 `serial_monitors` 為空 → 判定「要開啟」→ spawn 第二個 monitor（與 deploy child 搶同埠）→ 正是「先打開而不是關閉」。
- 另：`deploy.rs:91-98` forward 的 `on_finished_event` 是 `None` → deploy child 結束也不會熄燈。

### 方案取捨結論
OS 不容兩行程同開一埠 → 一切解法收斂為「**單一埠擁有者 + 應用層分送**」。
- 方案 1（同埠多視窗訂閱單一 monitor）：救不了「PC 程式自己要寫埠」。
- **方案 2a（採用）Python Serial Hub**：Python Hub 擔任指定 port 的唯一 OS 埠 owner；Tauri monitor view 與 PC 程式各以獨立 client 訂閱／使用 proxy。Hub 的啟動、租約與狀態由 Tauri 管理；VSIX 不導入此 Hub 功能。
- 方案 2b（Rust Hub）：`serialport` crate 由 Rust 持有；Rust 工程量大，棄。
- 方案 3（維持交接＋提示）：不滿足需求，僅止血。
- 方案 4（改範例規避）：03 必須寫埠，排除。

### 已確認決策（2026-10-07）
- **範圍**：Windows Tauri 多視窗；VSIX 沒有此多視窗問題，排除本功能與驗收範圍。若修改共用 Python deployer／Blockly generator，只做必要回歸，不替 VSIX 增加 Hub 功能。POSIX 支援延後。
- **Hub 啟動**：PC Serial 積木執行時自動啟動或加入指定埠 Hub，不要求先上傳或先開監看。
- **讀寫權限**：允許多個監看／讀取訂閱者；同一實體埠同時間只有一個寫入租約。寫入租約被占用時明確拒絕並提示「關閉佔用的視窗或其他序列埠程式後再試」，不等待無限期、不靜默搶占、不終止其他視窗程序。
- **上傳交接**：部署先向 Hub 申請獨佔埠租約。Hub 能安全暫停其 client 並讓出埠時才部署；若租約取得／釋放失敗，回報相同類型的明確提醒，不直接殺掉其他視窗或外部程序。部署結束後依明確生命週期恢復 Hub/client；詳細狀態轉換列於 §2。
- **輸出分流**：Hub 的資料複製不等於終端廣播。MCU RX 只顯示給明確訂閱該埠的監看視窗，使用 `emit_to` 精準單播；PC proxy 的 RX 只供該 Python 程式讀取，不直接寫入 UI 終端。PC 程式 stdout（例如物件偵測座標）仍只回到啟動該程序的視窗。程式若自行把讀到的感測值 `print()`，才會依一般 Python stdout 顯示於該視窗。
- **監看狀態／重連**：UI「啟用」代表本視窗的監看工作階段存在，不代表實體埠當下已連線。拔除後仍保持工作階段並持續重試；若插回時仍是原 COM 名稱，可自動重連，且不設短時間逾期。COM 名稱改變時不保證自動追蹤，需重新選埠或另行實作埠重新辨識。連線中／等待重連需與工作階段狀態分開表達。


## Phase 1：監看狀態單一化 ＋ 按鈕雙狀態（獨立交付，先做）

### 1.1 Python — monitor 進入標記
- **既有 monitor marker 已驗證**於 `resources/deploy/base.py::BaseDeployer.monitor()`（`is_tauri=True` 時輸出並 flush）；本 Phase 新增連線／斷線 marker 供 Tauri 區分實體連線狀態。
- 只在 Tauri 發送；`is_tauri` 參數已存在，VSIX 不帶此旗標，不會收到／顯示 marker。
- 兩條路徑都經 `monitor()`：`--monitor-only`（`deploy_mcu.py:55`）與上傳後自動（`micropython.py:107`、`official_spike.py:140`、`pybricks.py:91`）→ 一處改動覆蓋兩來源。
- 狀態：✅ `py_compile` 與 marker 跨層契約測試通過。

### 1.2 Rust — monitor 狀態與可靠控制訊號
- 串流轉發器須辨識跨 chunk marker、從一般輸出剔除，並只觸發一次 monitor-started；**控制訊號不得放在可因 log 背壓而丟棄的普通輸出佇列後面**。需以獨立控制通道或在讀取端先解析，並測試 marker 被任意分 chunk 時仍可靠。
- Monitor 活動狀態以本視窗的**工作階段識別／generation** 管理，涵蓋「獨立 monitor child」及「deploy child 上傳後進入 monitor」兩來源。避免僅用 `HashSet<window_label>`：程序替換後的舊 EOF／停止事件不可清除新工作階段。
- 工作階段建立、停止、自然 EOF、`stop_python`、視窗關閉皆須依同一 generation 清理；停止命令等候 child 結束／reap 後才回報 stopped，不能只呼叫 `kill()` 就宣稱 COM 已釋放。
- 呼叫端：`monitor.rs` 與 `deploy.rs` 依來源接入共用的 session/event 管理；部署程序開始新一代 session 時需先清理舊 generation。不得將 MCU 輸出改成全域 Tauri event。
- 狀態：✅ `AppState.serial_monitor_registry`、monitor/deploy stdout marker filter 與 generation-scoped finish callback 已接線；控制 marker 在普通 log 背壓佇列前解析，使用 `serial-monitor-state` 對本視窗 `emit_to`。

### 1.3 Rust — `toggle_serial_monitor` 感知來源
- 若本視窗目前 generation 為 monitor 工作階段 → 明確停止該 generation、等程序結束後回 `"stopped"`；否則依使用者選定的 port 建立工作階段並回 `"opened"`。
- 若 monitor 來自 deploy child，停止需終止／等待該 deploy child；不得另開第二個 monitor 來「切換」狀態。
- `stop_python`、deploy replacement 與關窗共用同一清理規則，避免 stale marker、stale active state 或焦點事件讓已停止的工作階段復活。
- 狀態：✅ toggle 依 Dedicated／Deploy source 停止正確 child；`stop_python` 和關窗對 child terminate + wait/reap；focus handoff suspend 會保留 active intent 並使舊 generation callback 失效。

### 1.4 前端 — 事件與初始狀態
- `ui/src/bridge/tauri.js::_setupTauriListeners` 訂閱本視窗 `serial-monitor-state` snapshot event；active 與 connected 由同一 payload 分開表達。
- 提供初始 snapshot（至少 active／connected／port 或其必要子集）。先建立事件訂閱再讀 snapshot，並用 generation/version 合併事件與 snapshot，避免舊 snapshot 覆蓋新 start/stop。
  - 權限二階段：`src-tauri/permissions/commands.toml` allow 加入（capabilities 已引用 `allow-all-commands`）。
  - `lib.rs` `generate_handler!` 註冊（`command_registration.rs` 守門自動抓漏）。
  - `docs/backend_api_manifest.md` SSOT 同步。
- `serial.js::toggleSerialMonitor` 維持回 `"opened"/"stopped"`（已夠用）。
- 狀態：✅ 新增 `get_serial_monitor_state`、Tauri command registration/permission/manifest、事件先訂閱後取 snapshot，依 generation/revision 忽略舊 snapshot。

### 1.5 UI — 工作階段／實體連線狀態（對齊 P1-3 token 化）
- `setSerialMonitorActive` 以工作階段存在決定按鈕 active 與 `aria-pressed`；啟用期間若埠未連線，另呈現等待／重連，不把 active 熄掉。
- 移除 inline `#c8e6c9`，以 `ui/src/style.css` 主題感知樣式表達狀態並跑 `theme_contract`。
- 狀態：✅ active/reconnecting class、`aria-pressed`、本地化等待提示與三主題 token 樣式已完成。

### 1.6 VSIX 範圍界定
- VSIX 無本任務的多視窗問題，**不實作 Hub、多視窗狀態或上傳租約**，不列入功能驗收。僅當變更共用 Python deployer 或 Blockly generator 時，執行該共用程式碼的必要回歸檢查。

### 1.7 Phase 1 驗證
- `cargo check` + `npm run test:rust` + `npm run lint:ui` + `npm run test:fast`；改 Python 時依專案分層執行 Python 驗證。
- 新守門（掃描型 + **變異測試確認會紅**）：控制 marker 可靠偵測／剔除、deploy monitor 結束事件、generation 隔離、初始 snapshot 與事件順序。
- 目前 Python marker 已存在，仍需驗證 deploy 與 monitor 兩條路徑都命中；不得把「marker 字串存在」當作整項整合完成。
- 自動驗證已完成：`npm run test:fast`、`npm run test:rust`、`npm run lint:ui`、`npm run test:theme`、`npm run build --prefix ui`、`py_compile resources/deploy/base.py` 均通過。
- **已實測**：使用者確認拔除再插回同一 COM 可自動重連。
- **延至 Phase 2 完成後合併實測**：上傳後按鈕亮；按一下停止而不另開第二個；reload 狀態一致；focus handoff；三主題目視正確。

## Phase 2：Windows Tauri Python Serial Hub

**進度（2026-10-07，暫停點）**：已開始部分實作，尚未完成或宣告驗收。現有 WIP 包含 Python loopback Hub/client、PC generator Tauri 條件式 proxy、Tauri deploy upload helper lease、Hub monitor subscription，以及移除 monitor steal/focus release。最新修改尚需重新跑全套驗證；細節與接續順序見 [MultiWindowSerialSharing_Phase2_Handoff.md](MultiWindowSerialSharing_Phase2_Handoff.md)。

### 2.1 資源模型與生命週期
- Hub 以實體 port 為 key，同程序內及跨 Tauri 視窗共用一個埠 owner；不同 port 互不影響。PC Serial client 可在 Hub 未啟動時自動啟動 Hub，或加入已運作的同 port Hub。
- Hub 是唯一直接開啟實體 COM 的程序；所有 PC client 與 monitor view 透過 Hub 訪問，不得各自 `serial.Serial(port, ...)`。
- 監看訂閱與寫入租約分離：多個 reader 可同時訂閱；一個 port 同時只允許一個 writer lease。client 關閉／程序 crash 時需釋放自己的訂閱或租約；Hub crash 時 client 明確報錯並可依策略重啟／重連。

### 2.2 上傳獨佔租約
- `deploy_mcu` 先向 Hub 申請 exclusive-port lease；Hub 暫停其讀寫 client 並關閉 COM handle，確認已釋放後才允許 deployer 直接上傳。
- 租約申請或埠釋放失敗時拒絕上傳，顯示「關閉佔用的視窗或其他序列埠程式後再試」等明確提示；不得 kill 其他視窗／外部程序或直接繞過 Hub 開埠。
- deployer 結束後才釋放 exclusive lease，Hub 依使用者仍存在的 session/subscription 自動重新開埠；連線失敗時保留 session 並重試。
- writer lease 衝突同樣明確拒絕且提示，不自動搶占。第一版不做無限等待；錯誤需指出同一 COM 正被另一個寫入 session 使用。

### 2.3 輸出路由與視窗隔離
- Hub 收到的 serial RX 可複製給授權的讀取 client；這是資料層 fan-out，**不等於發送到每個視窗 terminal**。
- Tauri monitor UI 只向已訂閱該 port 的視窗以 `emit_to(label, ...)` 輸出 MCU 序列資料；禁止全域 `emit`。
- PC proxy 的 RX bytes 只進入對應 Python client 的 `readline()`／`in_waiting` 等 API；不直接寫 UI terminal。該程式自己的 stdout（例如座標）仍只送回執行它的視窗。
- A 視窗 MCU 感測資料與 B 視窗 PC Python stdout 預期互不污染；若 B 的 Python 明確讀取感測資料並自行 `print()`，那是 B 程式自己的輸出，僅顯示於 B。

### 2.4 Proxy API 相容
- client 對生成碼保留目前使用介面：`write(bytes)`、`in_waiting`、`readline()`、`reset_input_buffer()`、`timeout=0.01`、`write_timeout=0`。
- 協定需定義 bytes framing、讀取緩衝、超時語意、reset_input_buffer 對該 client 的範圍，以及每個 client 的有界 buffer／背壓；不可因一個慢 client 阻塞 Hub 或其他 subscriber。
- serial-block 的字串資料轉 UTF-8／附加 newline 現況由 generator 保持；不把 Python stderr/stdout 混入 Hub RX。

### 2.5 Hub 綁定與錯誤恢復
- TCP 僅綁定 loopback；定義每程序／每 Hub session 的認證或不可猜測 token，拒絕任意本機 client 連入。需防止誤加入同 port 的過期 Hub、程序啟動競態與 stale lock。
- **鮑率政策（決策 2026-10-08，關閉本節原決策點）**：**放行但警告，hub 實體鮑率以先啟動者為準**。理由：monitor（115200）與 PC 產生碼（9600）同埠共存是多視窗核心目標，嚴格拒絕與之互斥；支援板皆 USB CDC，鮑率為名目值不影響資料。實作：`_client_loop` 只驗 port（`serial_hub.py:544`）、hello 回應帶 `hubBaudrate`、`_connect` 不一致時 stderr 警告；舊 `test_connect_rejects_baud_mismatch` 隨政策改寫。DTR/RTS/reset-input 等實體序列行為由 Hub 或 deploy lease 負責（維持原規劃）。
- 拔除硬體後 Hub 保留工作階段並對原 COM 名稱持續重試，不設逾時；重新插入 COM 名稱相同可自動恢復。若 COM 名稱變更，第一版提示重新選埠，不承諾自動追蹤。

### 2.6 Phase 2 驗證
- 自動測試：雙視窗／多 reader 不互相污染、單 writer lease 與衝突錯誤、不同 port 隔離、Hub 未啟動時 auto-start/join、拔除／插回重連、COM 名稱改變提示、Hub/client crash、慢 reader 背壓、deploy exclusive lease 交接與失敗回報。
- Tauri 實機 E2E：A 開 MCU monitor 並接收感測輸出；B 執行 PC 程式並顯示自己的 print 輸出；驗證彼此不串台。再驗證 A/B 同時 monitor 的授權 fan-out、PC 寫入衝突、上傳交接與占用提示。
- 本任務只驗 Windows Tauri。若觸碰共用 deployer/generator，才加跑相應共用程式回歸；不將 VSIX Hub E2E 納入驗收。

---

---
