# Cocoya 知識蒸餾基礎 (Knowledge Base)
> 產出日期：2026-08-24。蒸餾自 log/work/ 全部工作日誌（2026-02-12 ~ 2026-08-24），
> 關鍵技術點均已對照現行程式碼求證（標註 ✅ 已驗證 / ⚠️ 歷史紀錄，可能已過時）。
> 目的：讓接手者快速掌握「重大技術、容易犯的錯、已確立的規範」。

## 第 1 章 專案架構總覽

### 1.1 混合架構 (Hybrid)
- 同一份前端 SSOT（`ui/src/`）同時服務 VSIX（VS Code Extension）與 Tauri 2.0 桌面版。
- 前端一律透過 `CocoyaBridge`（`ui/src/bridge/base.js` + `tauri.js`/`vsix.js`）通訊，禁止直接使用 vscode / tauri API。
- 能力差異以 `bridge.capabilities` 查詢（如 `isAnchored`、`projectRoot`、`hasTerminal`），不要用 `isTauri` 旗標分支判斷功能。

### 1.2 目錄職責（✅ 已驗證現存）
| 路徑 | 職責 |
|---|---|
| `ui/src/app/` | 應用核心：config / persistence / workspace / lifecycle / controller |
| `ui/src/ui/` | UI 邏輯：base(工具列) / hardware / dialogs / renderer(預覽高亮) / terminal |
| `ui/src/utils/` | Blockly 攔截：core(ID提取/縮排) / generators / toolbox / mutator / search |
| `ui/src/modules/` | 各積木模組（blocks/generators/toolbox.xml/i18n 四件套）+ theme_manager + dataset_manager + ai_inference |
| `src/handlers/*.ts` | VSIX 後端 handler：fileOps / firmwareOps / datasetOps / serialOps / envOps / trainingOps |
| `src-tauri/src/commands/` | Rust 後端：app / file / mcu / python / dataset / training（✅ 已確認現存） |
| `resources/dataset_manager/` | Python sidecar（dataset_sidecar.py / camera_service.py / dataset_io.py） |
| `resources/train_templates/` | AI 訓練腳本（common 共同模組 + classifier/detector 任務腳本） |
| `docs/backend_api_manifest.md` | Tauri command 簽名 SSOT（含 Parameters 表） |
| `docs/system_spec.html` | 系統規格書（ID 注入、轉義、AI 座標規範）——開發積木前必讀 |

### 1.3 專案根錨定 SSOT（2026-08 起）
- 「專案根 = 目前 .xml 所在資料夾」；未存檔 ⇒ 未錨定 ⇒ Startup Home 強制開新/開啟。
- VSIX：`cocoyaManager.getProjectRoot()` = dirname(currentFilePath)；Tauri：Rust `get_project_anchor` 讀 `current_paths[label]` 的 parent。
- 前端統一讀 `bridge.capabilities.isAnchored / projectRoot`；Tauri 端 `_anchor` 快照會過期，故有 `_refreshAnchor()`（開/存檔後同步）＋採集時動態拉取雙保險（✅ tauri.js 已驗證存在此模式）。
- Dataset 落盤位置鐵律：`<專案根>/dataset/<資料集名>/<標籤>/`，未錨定一律拒絕寫入，避免亂放。

## 第 2 章 Tauri 後端開發鐵律（全部 ✅ 已對照現行程式碼驗證）

### 2.1 指令權限二階段定義
1. 定義：`src-tauri/permissions/commands.toml` 的 `commands.allow` 陣列加入指令名（格式是 `[[permission]]` 區塊，不是 `[commands]`）。
2. 分配：`capabilities/default.json` 引用 `"allow-all-commands"` identifier。
3. 漏做 ⇒ 開發模式正常、**Release Build 指令被攔截失效**，極難察覺。

### 2.2 serde camelCase 鐵律（踩坑兩次：ScanedImage.blob_url、ProjectAnchor.is_anchored）
- 所有 Rust -> JS 的 `#[derive(serde::Serialize)]` struct **必須加** `#[serde(rename_all = "camelCase")]`。
- 症狀特徵：物件存在但欄位全 undefined（前端讀 `data.projectRoot` => undefined），log 難查。
- 前端雙保險：normalize 函式相容 camel/snake（如 tauri.js `_normalizeAnchor()`）。
- 注意：`cargo check` 只保證編譯，不保證欄位命名符合前端期望；新增回傳型別須實機看一次前端讀到的欄位名。
- 已確認現行 file.rs 的 ProjectAnchor / ScanedImage / PickFolderResult / DatasetProgressResult 均已加 ✅。

### 2.3 多視窗事件單播 emit_to 鐵則
- Tauri `.emit()` 是**全域廣播**，會送達所有視窗 listener => 多視窗終端機互相污染。
- 視窗專屬事件一律 `window.emit_to(&own_label, "event", payload)`；執行緒內用 `let label = own_label.clone()` 防 move double-move。
- 已轉換清單（SSOT 見 AGENTS.md）：run_python / start_training / deploy_mcu / open_serial_monitor / erase_filesystem / reset_firmware（✅ python.rs:108 已見 emit_to）。
- 前端對應：`getCurrentWebviewWindow().listen(...)`（tauri.js `_setupTauriListeners` 已採 appWindow.listen）。

### 2.4 跨語言 Invoke 簽名同步
- JS camelCase 自動映射 Rust snake_case（serialPort<->serial_port）；Tauri command 增改參數必同步：tauri.js + vsix.js/cocoyaManager.ts/handlers + docs/backend_api_manifest.md Parameters 表。
- 教訓案例：reset_firmware 加了 serial_port 必填參數但前端沒傳 => 執行期 invalid args；解法含 Rust 端改 Option<String> 內部驗證。
- 改簽名後必跑三重驗證：`cargo check` + `npx tsc --noEmit` + `node --check ui/src/bridge/*.js`。改 TS 後要生效必須 `npm run compile`（tsc --noEmit 只驗型別不產出 out/，曾因此誤判修復無效）。
- 長期方案（待辦）：tauri-codegen 自動生成 typed invoke。

### 2.5 其他 Tauri 要點
- 資源路徑：開發模式從專案根解析（current_dir 去掉 src-tauri 尾），生產模式用 `BaseDirectory::Resource`；打包映射在 tauri.conf.json `bundle.resources`。
- Webview 載入本機檔案圖片：用 asset protocol + `convertFileSrc(path)`（勿手拼 URL）；需開 `assetProtocol` scope 與 fs read 權限。
- VSIX webview 沒有真實文件 URL，`location.reload()` 會白屏 => 主題/語系切換走 `reloadWebview` 指令（host 重建 HTML），並在 HTML 注入唯一時間戳註解強制「相同字串不重載」的 VS Code 行為失效。

## 第 3 章 前端 Bridge 與雙模差異
- **VSIX bridge.send() 是 fire-and-forget**（postMessage 無回傳值）：dirty 檢查/取消判斷必須留在後端 handler，由後端完成後再 postMessage 結果（如 handleNewFile）。**Tauri 有回傳值**（await invoke），可前端 await 判斷取消。寫跨平台流程時務必先確認此差異。
- 需要後端「帶語意」的結果時用 tag 回傳鏈：saveCompleted 带 message.tag（例：tag=newProject 才重建初始積木，避免普通存檔誤觸）。
- capabilities getter 是同步的：Tauri 端非同步資料（如錨定）在 async init() 先拉好存 instance 屬性，getter 同步讀。
- Sidecar stderr 分流：Python sidecar 非 JSON 日誌走 stderr 保持 stdout 協議純淨；host 端識別 [Sidecar Log] 標籤分流，避免誤判為崩潰。

## 第 4 章 Blockly 產生器與 i18n 規範

### 4.1 三層字串意識（轉義鐵律）
第一層 Gemini payload / 第二層磁碟上的 .js / 第三層 .js 執行後 return 給 Blockly 的字串。
- 單雙引號字串中禁止實體換行，必須寫 \\n；長篇 Python 注入用反引號模板字串（允許實體換行，最安全）。
- 產生代碼要換行：return 字串結尾加 \n。
- Regex 反斜線多層轉義：最終要 `split("\\+")` 的話，.js 裡要寫四重 `split("\\\\+")`。

### 4.2 縮排與注入順序
- 靜態 Python 輔助程式碼一律 **4 空白縮排基準**：全域攔截器（utils/generators.js finish 攔截）偵測 4 空白倍數後依 INDENT 等比縮放。混用其他縮排會讓全域縮排失效。
- 函式/import 定義用 `generator.definitions_` 注入（finish 時排在 Imports 後、主流程前），徹底解決「先呼叫後定義 NameError」與「函式內硬體 lazy init 的 UnboundLocalError」（MicroPython 安全模式：globals()['var'] = ...）。
- 產生器註冊一律 `Blockly.Python.forBlock[...]`（或 Blockly.Arduino 等），未註冊會噴 does not know how to generate。
- FieldCheckbox.getValue() 回傳**字串 "TRUE"/"FALSE" 不是布林**——truthy 判斷永遠為真，必須 `=== 'TRUE'`（踩坑：export_model/augmentation/fine_tune 三處同 bug）。

### 4.3 ID 定位技術
- scrub_ 重寫注入行尾註解；statement 用 `# S_ID:xxx` / `# E_ID:xxx` 區間標記，value 積木不標記。
- value/expression 積木定位：renderer.js `findLocatableBlock()` 對有 outputConnection 的積木遞迴向上找 statement 父積木（移植自 CodeBridge）。不要走「value 也標記」的路（曾被 triggerCodeUpdateSync 的正則清除）。
- Preview 即執行檔原則：兩者共用同一份預處理字串，UI 渲染時動態抹除 ID 標記但保持行號。

### 4.4 i18n 規則（%{BKY_} 前綴陷阱）
- toolbox.xml / jsonInit 內佔位符：`%{BKY_XXX}`（Blockly 核心解析時自動剝掉 BKY_ 前綴去查 Msg）。
- JS 定義：`Blockly.Msg["XXX"]` **無 BKY_ 前綴**。兩邊前綴規則不一致是最常見的顯示原始 %{...} 字串根因。
- 分類名/顏色在全域 zh-hant.js/en.js 定義無前綴 fallback；模組 i18n 用 Object.assign(Blockly.Msg, {...}) 風格。
- Dataset Manager 有共享 t() 模組（i18n.js）：`t(KEY, fallback, value1, value2)` 以全域 regex 取代 %1/%2——鏈式 `.replace('%1', v)` 只換第一個出現處，重複佔位符會殘留（踩坑紀錄）。

### 4.5 工作區行為知識
- 孤兒積木白名單（workspace.js allowedTypes）：py_main、mcu_main、py_definition_zone、py_function_def、py_coding_comment、procedures_def*；新增頂層合法積木要加白名單。
- 打字失焦真兇：Minimap 同步 + Orphan Check 觸發狀態變更關閉 WidgetDiv => Silence Mode（WidgetDiv.isVisible() 時暫停背景任務）。
- 執行/存檔按鈕開頭呼叫 `Blockly.hideChaff()` 強制寫回欄位值，配合 triggerCodeUpdateSync() 同步產碼（300ms debounce 會拿舊碼）。
- 工作區註解（v12+）：需 `workspaceComments:true` **且**手動 `Blockly.ContextMenuItems.registerCommentOptions()`。Minimap 對註解事件採完整重載法（workspaceToDom->clear->domToWorkspace）＋大小位置同步，勿用增量 mirror（內部 p Set 不含註解事件）。

## 第 5 章 多視窗完整性協議 (MWIP)
- 狀態以 window label 隔離：current_paths / python_processes / serial_monitors / serial_wants 皆 HashMap<label, ...>。
- 檔案鎖：file_locks「首開鎖定、後開唯讀」；save_file 檢查路徑擁有者，非本視窗鎖定路徑 => 回錯誤導引另存。
- 備份宣示權：未命名備份偵測後立即 rename 為 .recovering，保證單一視窗領取；存檔成功即刪該視窗備份。
- Serial 交接方案 B：前端 document blur/focus -> set_window_focus(focused)；失焦釋放埠（保留 serial_wants）、聚焦延遲 400ms 自動重取。stop_python 一併釋放 monitor。
- 不可逆破壞（清工作區/清檔名/隱首頁）必須放在對話框確認之後：「先確認、後破壞」原則（2026-08-24 兩次回歸的根因）。

## 第 6 章 Dataset Manager 技術體系（✅ 核心檔案已確認現存）

### 6.1 Python Sidecar 架構
- 動機：VS Code Webview 封鎖 getUserMedia => 改由 sidecar（OpenCV 原生視窗預覽）+ stdin/stdout JSON 協議。
- 協議：request/response 以 requestId 匹配；背景事件（cameraStatus 等）主動推送。VSIX 端 DatasetSidecarManager；Tauri 端 start_sidecar/sidecar_send/stop_sidecar 三指令。
- **sidecar_send 必須逐 byte 讀 stdout**：BufReader 會預緩衝 8KB 把 event 吃掉。
- 健康檢查用輕量 ping，勿用 listCameras（遍歷 10 個 index 各等 OpenCV timeout，3-5 秒起跳 => 快照超時假象）。
- stderr 只放非 JSON 日誌；paramiko 警告要抑制避免污染。

### 6.2 標註與存讀
- 三種標註模式共用 state.annotationMode 狀態機：bbox / line / classification（分類模式不初始化 UICanvas、無 Delete 鍵）。
- 自動落盤（方案 A）：無儲存按鈕，寫 dataset.json 於 refreshPreview 尾端/採集/刪圖/切圖/退出/關閉觸發，800ms 防抖；未錨定靜默略過。
- 載入套回：依 samples[].image_path 精確比對 images[].path（normalizePath 正斜線）；0 match 不阻斷。
- **savePath basename 是磁碟唯一真相**：落盤檔名由 host/bridge 先產生傳入 sidecar；前端若自取 Date.now() 會造成 image_path 與磁碟檔名脫鏈（踩坑：兩次獨立時間戳差 ~125ms）。前端一律取 savePath 的 basename。
- YOLO 匯出座標轉換：內部 [x,y,w,h] 左上角制 => YOLO `class_id cx cy w h` 中心點制（cx=x+w/2, cy=y+h/2）；推論逆轉換 x1=cx-w/2。
- label_map 權威制：統計以 label_map 為準並為所有類別補 0；新 id 用 nextLabelId()=max+1（用 length 會在刪除後碰撞）。標籤色 FNV-1a hash * 黃金比例 137.508 度擴散色相。
- 名稱即 namespace（dataset/<名稱>/）：來源變更走 reconcileProjectName 顯式 confirm，防靜默覆寫錯誤資料集。

### 6.3 UI 工程教訓（高頻回歸點）
- 後端 ScanedImage **沒有** annotations 欄位：匯入後必須 map 初始化 annotations 陣列，且寫回時 .slice() 拷貝（共用參考會讓所有縮圖同時出現綠勾）。
- UICanvas.init() 不要放 img.onload 內——blobUrl 相同時 onload 不觸發 => 右欄全空白；同步初始化，onload 只負責重繪。
- 高度鏈斷裂：grid 子項 height:100% 在無明確高度容器中無法解析 => 捲動失效；改純 flex 每層 flex:1; min-height:0。
- Flexbox align-content:center + 溢出 => 頂部內容被推到負座標永遠捲不到；改 flex-start。
- 縮圖 scroll 保存/恢復統一 saveGridScroll()/restoreGridScroll()；移除 loading=lazy 避免 [Intervention] 警告。
- Escape 鍵在輸入框要 stopPropagation，否則冒泡關掉整個 modal。
- 訊息一律 showStatusMessage()（ui_layout.js，modal 頂部中央、8 秒自動清除、計時器重置）；禁止直接寫 status.textContent（標註模式面板隱藏會看不到）。

## 第 7 章 AI 訓練管線
- 分層：`resources/train_templates/common/`（classifier_dataset/classifier_model/training_loop/model_export/training_report/detector_dataset/detector_model）+ 任務腳本 classifier_train.py / detector_train.py（✅ 新檔名已驗證存在）。腳本以 sys.path.insert(dirname/../) 匯入 common。
- IMG_SIZE=224 硬編碼是刻意的（MobileNetV2 imagenet 權重綁定；224=7*32 使最終特徵圖 7x7）。
- 確定性訓練：TF_DETERMINISTIC_OPS=1 + tf.random.set_seed(42) + np.random.seed(42) + enable_op_determinism()，否則 VSIX/Tauri 環境差異會導致正確率明顯不同（實測 90% vs 57.5%）。
- MODEL_OUTPUT 下拉控制產物（none/int8/f32/keras/all）；推論積木 MODEL_TYPE 以 `_f32` 後綴篩選 tflite。labels.txt 永遠與模型同產。
- detector = MobileNetV2 + GAP + Dense(4,sigmoid)，MSE loss；單目標、ESP32-S3 int8 約 1-2 FPS。
- DGX Spark：ARM64 架構，TF 官方映像無 ARM64 GPU 版 => 用 nvcr.io/nvidia/pytorch NGC 容器；TFLite 轉換的 keras_deps bug 需在 AMD64 本地做。SSH/SFTP：SFTP 不展開 ~（先 exec echo $HOME）、os.uname 在 Windows 不存在改 socket.gethostname()、exec_command 內指令必須單行字串（多行 triple-quote 被 bash 截斷）。
- VSIX 長時任務輸出：terminal.sendText 會把文字當命令執行、OutputChannel 不支援 ANSI => 用 Pseudoterminal(pty)；child.on(close) 不要 fire closeEmitter 否則終端機自動消失。Rust 端 stdout 讀取用 read_until(b\n)+from_utf8_lossy 並 strip ANSI。

## 第 8 章 MCU 部署（MicroPython 時代）
- 2026-04-29 重大決策：**放棄 CircuitPython 磁碟機模式（Windows Errno22 不穩），全面 MicroPython Serial REPL**。舊磁碟掃描相關紀錄皆為歷史。
- deploy_mcu.py：Raw REPL 協議（煞車 -> Raw 模式 -> 推送 -> soft reboot）；代碼存 main.py；--monitor-only / --erase-filesystem 模式。
- 分塊策略依硬體：ESP32-S3 Native USB 用 128-byte + 0.8s 同步延遲（防緩衝溢出）；RP2040 用 1024-byte 極速模式。中斷序列 10 次。
- Deep Repair（清使用者檔案）= pyserial REPL wipe()，**不是** esptool erase-flash——VSIX 曾誤用 esptool 對運行 MicroPython 的 S3 => Invalid head of packet。兩平台統一走 deploy_mcu.py --erase-filesystem。
- reset_firmware：RP2040 走 UF2 磁碟複製（RPI-RP2 標籤輪詢+自動寫 code/main）；XIAO S3 走 esptool Serial（CAMERA/FACTORY 多段燒錄讀 project_config.json，offset 0x0/0x8000/0xe000/0x10000）。serial_port 參數僅 serial 分支必填（Rust Option<String>）。
- 序列埠偵測：Windows 用 WMI Win32_SerialPort + VID/PID 映射表顯示板名；VSIX 開硬體任務前 stopAllCocoyaTerminals 防 COM 佔用 (PermissionError 13)。

## 第 9 章 踩坑快查表（Bug Patterns）
| # | 症狀 | 根因 | 解法/規範 |
|---|---|---|---|
| 1 | 前端欄位全 undefined | serde 預設 snake_case | rename_all camelCase + normalize 雙保險 |
| 2 | Release 版指令無反應 | 權限未二階段定義 | commands.toml + capabilities |
| 3 | 多視窗終端機互相污染 | emit() 全域廣播 | emit_to(&own_label) |
| 4 | invalid args for command | Rust 加參數前端未同步 | 三重驗證 + manifest SSOT |
| 5 | sidecar 全指令失敗 UnboundLocalError: json | 函式內區域 import 遮蔽全域 import | 勿在函式內重複 import 頂層模組 |
| 6 | 改 TS 不生效 | 只跑 tsc --noEmit 未 compile | npm run compile / watch |
| 7 | VSIX webview 白屏 | location.reload() 無文件 URL | reloadWebview + 時間戳註解 |
| 8 | Blockly.Msg 顯示 %{BKY_...} 原始字串 | 前綴規則搞混 | XML 有 BKY_、JS 定義無 |
| 9 | checkbox 判斷永遠 true | getValue 回傳 "TRUE" 字串 | === TRUE 比較 |
| 10 | 中文路徑 openExternal 失敗 0x2 | ShellExecuteW ANSI 轉碼 | 正則擋中文路徑提示 / Tauri 用 open::that |
| 11 | 匯出後 image_path 與磁碟不符 | 兩次獨立 Date.now() | 以 savePath basename 為唯一真相 |
| 12 | 所有縮圖同時綠勾 | annotations 陣列參考共用 | map 初始化 + .slice() |
| 13 | onload 不觸發右欄空白 | 同 src blobUrl 不重載 | 同步 init，onload 只重繪 |
| 14 | 容器內容捲不到頂 | flex align-content:center 溢出推負區 | flex-start |
| 15 | %1/%2 殘留 | replace 只換第一處 | t(KEY, fb, args...) 全域 regex |
| 16 | 打字失焦 | Minimap/orphan check 關掉 WidgetDiv | Silence Mode |
| 17 | 函式內硬體變數 UnboundLocalError | lazy init 賦值被判區域 | definitions_ 注入 + globals() 安全模式 |
| 18 | 開新專案殘留髒狀態 | 對話框前先破壞狀態 | 先確認後破壞 + tag 回傳鏈 |

## 第 10 章 未來方向（呼應 log/todo.md 待辦）
1. Dataset Manager 重構（core/io/ui 三層，計畫見 log/plan/DatasetManagerRefactor.md）——重構時 showStatusMessage 遷移須同步 AGENTS.md。
2. tauri-codegen typed invoke：把第 2.4 節的手工同步自動化。
3. macOS/Linux 序列埠 Friendly Name；esptool Sidecar 化評估。
4. line_follower_train.py / table_train.py 尚未以 common 模組實作（detector 已完成）。
5. 主題系統擴充點：hljs 語法色尚未變數化（--hljs-*）、自訂主題 JSON 載入、主題編輯器。
6. 各任務遺留的「實機雙平台驗證」清單見 todo.md。

## 附錄：已過時知識（閱讀舊日誌時的校正）
- CircuitPython / CIRCUITPY 磁碟寫入、code.py 相關內容 => 已改 MicroPython main.py。
- py_io_sleep => 更名 py_time_sleep。
- dataset_manager/importer.js => 已刪除（改走 Bridge pickFolder 後端掃描）。
- train_templates 舊 Docker 模板 => 封存於 mvp_hand_gesture/train_templates/。
- Minimap 註解同步 v1 增量法 => 已棄用，現行 v2/v3 完整重載法。
- media/ 目錄結構、ui_manager.js/main.js/utils.js 單檔架構 => 已模組化為 ui/src/{app,ui,utils,modules}。
- extension.ts 巨型單檔 => 已拆 src/cocoyaManager.ts + src/handlers/*.ts。

## 第 11 章 2026-08-25 ~ 09-07 追加蒸餾（2026-09-08 #task[整理todo] 期間核定）
> 蒸餾自 log/work/2026-08-26 ~ 2026-09-07；以「第 1-10 章與 AGENTS.md 尚未收錄或有重要補充」為選材標準。

### 11.1 Dataset Manager 三層架構完成（取代 ui_layout.js 上帝模組）
- 拆解 `ui_layout.js`（108KB/60+ 函式）為 `core/io/ui/application` 四層，Phase 0-6 全完成（見 todo Archive A）。
- **唯一 Bridge Port**：`ui/src/modules/dataset_manager/io/bridge.js`——所有 DSM 通訊一律經此（request correlation / timeout / cancel / unsubscribe）；UI 層嚴禁 direct `window.CocoyaBridge`。
- **訊息責任邊界（AGENTS.md「Dataset Manager 訊息責任定義」）**：錯誤「碼」後端定義（如 `PROGRESS_NOT_FOUND`），人類文案前端 i18n（`DSM_*`）；core/application 層禁 hard-code 中文。
- **狀態訊息**：一律 `showStatusMessage(msg, {duration})` 顯示於 `#dataset-manager-message`（預設 8s 自動清除），禁手寫 `#dataset-import-status`。
- **style token 化**：DSM 色彩以 `--dsm-*` CSS 變數統一（vscode/vscode-dark/cocoya_dark 三主題各自定義），深色確認框改用 token 化自訂對話框取代 native confirm（i18n 需求）。
- 開發 SOP 見 `log/mappings/DatasetManager_DevGuide.html`；色彩盤點見 `log/plan/DatasetManagerStyleTokens.md`。

### 11.2 硬體板子感知 SSOT（board_defs.js）與 board_init 帽子積木
- 腳位權威 SSOT＝`ui/src/modules/hardware/board_defs.js`（`window.CocoyaBoardDefs`），由 module_loader `loadScript` 載入（**避免 fetch/CSP 風險**；由 JSON 改 JS 的原因）。
- 每板條目：`vidPid`（含萬用 `"303A":"*"`）、`pins`（`ref`/`label`/`tags[digital,pwm,adc,input]`）、`gpioMap`（**權威**；`cocoyaResolvePinNum` 找不到即報錯註解，不再 fallback）。
- `mcu_board_init` 帽子積木：宣告板子 → 決定腳位下拉選項、初始座標、開新 MCU 檔預設 `maker-pi`；插板與宣告不符 → confirm 攔截。
- **目前支援板**：picow / maker-pi / xiao-s3 / microbit（board_defs.js）；**Lego SPIKE Prime 獨立**於 `ui/src/modules/spike/`＋`resources/deploy/pybricks.py`（Pybricks 機制，非 board_defs）。
- **三處 vidPid 手動同步債**：board_defs.js（前端）/ `mcu.rs detect_board_id` / `serialOps.ts boardIdMap`——未來執行期讀或 codegen。
- micro:bit MicroPython：`Pin(n)` 的 n 對應 edge connector pin0~pin20（17/18 不外露）；P5/P11 為按鈕 A/B 共用，實機後再定。

### 11.3 部署器模組化（deploy/ 工廠模式）
- `resources/deploy/`：`__init__.py` 工廠 `get_deployer()`＋`base.py`（BaseDeployer：序列埠監控/`detect_board()`）＋`micropython.py`（Raw REPL）＋`pybricks.py`（SPIKE）。`deploy_mcu.py` 為向後相容薄 CLI 包裝。
- **Tauri 資源打包坑**：`bundle.resources` 若只列 `deploy_mcu.py` 而未列 `deploy/` 資料夾，dev 打包後 `target/debug/resources/` 缺該資料夾 → 子進程 `ModuleNotFoundError: deploy`；必須加入 `"../resources/deploy": "resources/deploy"`（log/work/2026-09-07.md）。

### 11.4 Keras 跨版本序列化相容（遠端訓練→本地 TFLite 轉換）
- 遠端容器（較新 Keras 3）產生的 `.keras`(zip) 本地（較舊）載入失敗：`_local_convert_tflite.py::_sanitize_keras_config()` 讀 config.json 遞迴剝除不相容鍵（`renorm/renorm_clipping/renorm_momentum/synchronized`）後重打包再 load；未知新參數把鍵名加入 `_STRIP_KEYS` 即可（失敗訊息會印「下一個不相容層/參數」）。
- 四層 fallback 載入：`_load_model_compat`。
- **TFLite int8 量化必須與訓練 pipeline 一致**：representative dataset 缺 `1/255` 正規化會使值域差 255 倍 → int8 精度崩壞；實測補正規化後 int8 vs f32 一致率 96.7%。
- 遠端權重快取：keras_cache 掛載避免重下權重。
- esptool 版本 pin `==4.7.0`（有預編 wheel、cryptography 相依較寬、避免 msal 衝突與 sdist 現場 build）；type 檢查清單在 `config/python_modules.json`。
- 深入見 `log/mappings/KerasSerializationCompat.html`。

### 11.5 VSIX 訓練終端機除錯（Total：三案）
- sidecar `onEvent` 例外不再靜默（寫 Cocoya Sidecar outputChannel）；`TrainingTerminal.writeLine` 失敗 fallback 輸出頻道。
- 本地訓練誤標 remote 之根因：remote 旗標偵測；host i18n：新增共用 `src/hostI18n.ts`（`HOST_MSGS` zh-hant/en＋`hostMsg()`），trainingOps/datasetOps/sidecarManager/serialOps 使用者可見訊息全走 hostMsg（殘留掃描=0）。

### 11.6 Tauri 開發板偵測與序列埠互動細節
- serial「(無序列埠)」根治：`updateSerialPorts` 在 `ports` 為空時只有 `currentVal` 也空才清 `data-value`（否則已選 COM 被 monitor 佔用時誤清空）。
- 序列埠被 monitor 程序佔用時 `serialport::available_ports()` 未必回傳該埠。
- `_applyBoardFromPort`：由選單 `root.__boardIdMap` 取 boardId → `CocoyaBoard.setCurrent(boardId,'port')` 自動切板（曾因未註冊而 `is not a function`）。
- 多視窗輪詢事件須互不污染（呼應 2.3 emit_to）：`serial-ports-changed` 等採輪詢，確認不廣播混流。

### 11.7 開新專案「先確認後破壞」與範例保護（2026-09-06 追記彙整）
- 開新/切換前先 snapshotWorkspaceForReload()（語系/主題切換對齊），保留編輯區積木與 dirty 狀態（sessionStorage 快照）。
- `SAME_AS_CURRENT` 防呆＋開新重試迴圈；examples 唯讀保護下 dirty「開新檔」流程中斷問題已修（Tauri/VSIX 雙）。
- `base.js::alert()` 必須 `return this.send(...)`，否則 `await bridge.alert()` 不等待確認就往下跑。

## 附錄補充（2026-09-08）
- dataset_manager/ui_layout.js 上帝模組 => 已拆 core/io/ui/application 四層（Stage 6 完成，見第 11.1）。
- 遠端環境面板（checkRemoteEnvironment/trainRemote 前端 UI）=> 前端已移除，後端指令保留供 `backend==='remote'` 用。
- board_defs.json（fetch 載入）=> 已改 board_defs.js（module_loader loadScript，修 CSP/fetch 失敗）。
- 開新專案流程 => 以「先確認後破壞」為唯一模式（不再先清狀態）。
- line_follower/table 訓練模板 => 仍待以 common 模組實作（呼應第 10 章第 4 項）。

### 11.8 程式碼→積木 反向定位（2026-09-08 實作，renderer.js）
- **背景**：原 Cocoya 定位僅「積木→code」單向（workspace.js `SELECTED`→`syncSelection`；renderer.js `blockToRangeMap` + `findLocatableBlock` 高亮 `.highlight-line`）。README 原先「雙向點擊定位」為誇大不實，已改正。
- **新增反向**：renderer.js ①建立 `lineIndexToBlockId` 反查表 ②每 `.code-line` 綁 click → `locateBlockByLineIndex(lineIndex)`。
- **反向的兩個落點**：Blockly 原生 `workspace.centerOnBlock(blockId)`（捲動置中）+ `Block.select()`（無參數，內部 `fireSelectedEvent` → `SELECTED` → `syncSelection` 回饋整段高亮，與正向視覺一致）。
- **選擇語意**：一行 code 常被多層積木範圍覆蓋 → 取「覆蓋該行且範圍最窄」的可定位積木（與 `findLocatableBlock` 對稱；value 積木往上轉 statement 父積木，內層較精確）。
- **誤觸保護**：文字選取中（`window.getSelection().toString()` 非空）不觸發；`cursor:pointer` 提示可點。
- **驗證**：node --check ✓、vite build ✓（537ms）。實機待測（todo 登錄）。
- **踩坑**：反向切換積木選取不可用 `block.select()`（只 addSelect 不 unselect 舊框，多積木框疊加）；需用 focus 驅動的 `Blockly.setSelected(block)`（自動 unselect 舊 + addSelect 新 + fire SELECTED）。且 code 高亮切換要**明確呼叫 `syncSelection(newId)`**（其開頭必清 `.highlight-line`），別只依賴 SELECTED 事件回饋（可能被 isInputActive 中斷）。
