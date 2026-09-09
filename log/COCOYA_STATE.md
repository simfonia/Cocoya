# Cocoya 專案現況快覽 (Project State Quick-Start)
> 產出：2026-09-08（#task[整理todo] 期間建立）。
> 目的：**每次任務開始前**由本檔快速掌握「專案目前在哪、有無已知問題、下一步該做什麼」，再決定要讀哪些細節。
> 指針：任務清單＝`log/todo.md`；技術深層知識＝`log/KNOWLEDGE_BASE.md` 與 `AGENTS.md`；每日執行細節／診斷＝`log/work/`；SSOT 簽名＝`docs/backend_api_manifest.md`、`docs/api_manifest.md`。

## 1. 專案身份
- **Cocoya**（Code, Compute, Yield AI）：Blockly 教學工具，為 Python AI 視覺初學者同時產生 PC 端 Python（MediaPipe/OpenCV）與 MCU 端 MicroPython（Micro:bit / Raspberry Pi Pico W / Maker Pi RP2040 / XIAO ESP32-S3 / Lego SPIKE Prime）代碼，Serial(USB) 通訊。
- **混合架構**：同一份前端 SSOT `ui/src/` 同時服務 VSIX（VS Code Extension）與 Tauri 2.0 桌面版；效能/路徑/訊息責任差異由 host 對應實作。

## 2. 目前來源 (git)
- 分支 `master`；HEAD `f32355e`（修復 Tauri dirty 狀態在範例檔保護機制下開新檔流程中斷）。

## 3. 已上線支援清單
### 開發板（腳位 SSOT＝`ui/src/modules/hardware/board_defs.js`，板子感知機制）
| boardId | 名稱 | VID:PID |
|---|---|---|
| `picow` | Raspberry Pi Pico W | `2E8A:0003` |
| `maker-pi` | Maker Pi RP2040 | `2E8A:0005` |
| `xiao-s3` | XIAO ESP32-S3 Sense | `303A:*` |
| `microbit` | Micro:bit V1/V2 | `0D28:0204` / `0D28:0209` |
- **Lego SPIKE Prime**：獨立模組 `ui/src/modules/spike/`（Pybricks 韌體＋專屬 `resources/deploy/pybricks.py` 部署器）——**不再 board_defs.js**（不同機制）；VID/PID 支援已加至 Rust `mcu.rs` / VSIX `serialOps.ts`。

### 積木模組（`ui/src/modules/`）
`hardware`（板子感知腳位／board_init 帽子積木）、`mcu_car`（Maker Pi 專用車）、`spike`（Lego）、`ai_inference`、`dataset_manager`（DSM）、`theme_manager`、基礎 logic/io 等 core 積木。

## 4. 核心架構現況（已完成之關鍵里程碑）
- **Dataset Manager 三層架構已完成（Stage 1-6，2026-08-24~09-01）**：`ui/src/modules/dataset_manager/{core,io,ui,application}/`；`ui_layout.js` 上帝模組拆解完成；全通訊只走唯一 Bridge Port＝`io/bridge.js`（front 嚴禁 direct `window.CocoyaBridge`）；訊息一律 `showStatusMessage(...)`。開發 SOP 見 `log/mappings/DatasetManager_DevGuide.html`。
- **Tauri 多視窗完整性協議**：視窗專屬事件用 `emit_to` 單播（禁全域 `emit`）；serial 失焦釋放／聚焦重取（`set_window_focus`）；`.recovering` 備份宣示權；`file_locks`；`save_file` 路徑擁有者檢查。
- **開新檔「先確認後破壞」**＋`SAME_AS_CURRENT` 防呆＋examples 唯讀保護＋開新重試迴圈（Tauri/VSIX 雙修）。
- **部署器模組化**：`resources/deploy/`（工廠 `get_deployer()`：`base` / `micropython` / `pybricks`）；`deploy_mcu.py` 為薄 CLI 包裝。
- **訓練模板 common 化**：`resources/train_templates/common/`（classifier + detector）；帶類別標籤切分一律**分層抽樣**。

## 5. 近期里程碑時點（詳細見 `log/work/` 對應日誌）
| 日期 | 內容 |
|---|---|
| 09-07 | 開發板偵測及上傳除錯；serial「(無序列埠)」根治（鐵壁版）；偵測/監看按鈕拆分＋`toggle_serial_monitor`；1.5s 熱插拔輪詢；Micro:bit 支援 |
| 09-06 | MCU 硬體控制一般化（board_defs SSOT＋board_init 帽子積木）；語系切換保留編輯區積木；Try/Except 積木；examples dirty 開新檔雙平台修復；`SAME_AS_CURRENT` 防呆 |
| 09-05 | terminal UI（字體/複製/高度拖曳/收合）；DSM 刪縮圖/選取路徑/hover 完整路徑；Lego SPIKE 多層分類最小模組（22 積木） |
| 09-03~04 | SPIKE 部署計畫；模型檔本地轉換三案（esptool pin / keras sanitize / 權重快取）；VSIX 訓練終端機除錯 |
| 09-02 | Tauri Release 訓練三案（cp950 亂碼/模板路徑/examples 唯讀） |
| 08-24~09-01 | Dataset Manager 三層重構 Stage 0-6（含手動測試 backlog 與 Gate 簽核遺留） |

## 6. 尚未解決／待決策（重要技術債，勿踩舊坑）
- **Tauri dev sidecar 路徑債**：`get_sidecar_dir` 以 Resource 目錄（`target\debug\resources`）優先於專案根原始檔 → **改 sidecar 後須手動同步 dev 副本＋重啟 app**（違反「dev 優先原始檔」規範，建議優先序對調或 build 自動同步）。
- **vidPid 表三處手動同步債**：`board_defs.js`（前端）／`mcu.rs detect_board_id`／`serialOps.ts boardIdMap`；未來改執行期讀取或 codegen。
- **Python deploy 端對齊債**：`resources/deploy/base.py` 尚以自家 vidPid 偵測（與前端兩套 drift），未統一讀 board_defs。
- **`--dsm-*` dark/token 非單一事實來源債**：`vscode-dark` CSS 覆寫與 `cocoya_dark` 主題 cssVars 各持一份 deep 值。
- **`spec.js` 直用 `t()` transitional 債**：core 層文案耦合 i18n（AGENTS.md 明令不得新增同類耦合）。
- **待產品決策**：捨棄「仍錨定」行為是否「捨棄並回首頁/清錨定」；`--dsm` dark 收斂範圍；腳位 tag 過濾清單範圍。

## 7. 大筆未完成工作（詳見 `log/todo.md`）
- **大量實機驗證**（VSIX＋Tauri 雙平台，見 todo 各節 `[ ]` 項與 `log/work/` Next Steps）。
- Dataset Manager 手動測試 backlog（`log/plan/DatasetManagerManualTestBacklog.md`）＋ Stage 6 Gate 簽核＋ Stage 7 總驗證。
- 遠端訓練 SSH 整合（Tauri 版藍圖／`datasetUploadArchive`／容器化訓練腳本）。
- `tauri-codegen` typed invoke（消除跨語言簽名手動同步）。

## 8. 鐵律速查（開發必守；詳細證據見 AGENTS.md / KNOWLEDGE_BASE.md）
- serde 跨邊界 struct 必加 `#[serde(rename_all = "camelCase")]`（否則前端物件存在但欄位全 undefined）。
- 視窗專屬事件用 `emit_to(&label, ...)`，**嚴禁**全域 `emit`。
- 所有 Python 子進程 I/O 強制 UTF-8（產生器 Popen `encoding`＋Host env `PYTHONIOENCODING/PYTHONUTF8`＋sidecar Popen `encoding`＋腳本 `reconfigure`/`open(encoding='utf-8')` 四者全帶）。
- 跨語言 Invoke 簽名同步：tauri.js＋vsix handlers＋`docs/backend_api_manifest.md`；改後必 `cargo check`＋`tsc --noEmit`＋`node --check`。
- 帶類別標籤訓練切分一律**分層抽樣**（禁全域隨機切）。
- DSM 錯誤「碼」後端定義、人類文案前端 i18n；後端禁輸出展示文案。
- 產生器基準縮排 4 空格；專案內路徑一律正斜線。
- 覆寫 `log/` 下檔案前先備份到 `backup/`（`log/todo.md` / `log/work/` 追加或備份）。

## 9. 每次任務啟動建議順序
1. 讀本檔（`log/COCOYA_STATE.md`）→ 快速定位現況。
2. 讀 `log/todo.md` 對應章節 → 確認本次任務範圍與未完項。
3. 讀最近 `log/work/yyyy-mm-dd*`（尤其「下次啟動方向 Next Steps」）→ 承接上次進度。
4. 開發積木前**必讀 `docs/system_spec.html`**（ID 注入／轉義／AI 座標規範）；踩坑快查 `KNOWLEDGE_BASE.md` 附錄＋第 10 章與本檔 6。