# Cocoya 專案任務清單 (Todo List)
**專案名稱**：Cocoya (Code, Compute, Yield AI)
**核心目標**：建立一個以 Blockly 為介面，幫助 Python 初學者進入 AI 世界的 VSCode extension 與獨立桌面應用程式。

## [核心開發原則]
- **SSOT (單一事實來源)**：所有積木、產生器與前端邏輯必須統一存放在 `ui/src` 下，由 VSIX 與 Tauri 共享。
- **通訊抽象化**：前端必須透過 `CocoyaBridge` 與後端通訊，禁止在 UI 層直接使用環境專屬 API。

## [已完成] 里程碑 v1.0 ~ v6.0 (硬體、UI 與 部署穩定化)
- [x] **[硬體] XIAO S3 Sense 全面支援**：實作 Serial 燒錄 (esptool)、多段韌體恢復 (Factory C++ - 支援 project_config.json) 以及主動式硬體偵測優化 (2026-06-07)。
- [x] **[部署] 傳輸可靠性革命**：升級 `deploy_mcu.py` 支援 128-byte 分塊二進位寫入與 10 次中斷序列，徹底解決 ESP32-S3 同步失敗問題 (2026-06-07)。
- [x] **[UI] 徹底修復打字失焦 Bug**：透過 Silence Mode 機制判斷 `isVisible()` 暫停背景 UI 同步與檢查 (2026-06-07)。
- [x] **[功能] 互動式 REPL**：終端機支援雙向通訊，允許直接輸入 Python 指令與 MCU 互動 (2026-06-07)。
- [x] **[範例] 範例專案更新**：補完並測試 MicroPython 模式下的所有範例專案 (2026-06-07)。

## [已完成] 雲端 AI 模型訓練 (NVIDIA DGX Spark 整合)
- [x] **[架構] VSIX 回歸 UI 模式**
- [x] **[UI] 臨時安全授權 Dialog**
- [x] **[Sidecar] 實作 SSH/SFTP 通訊模組**
- [x] **[功能] 遠端環境診斷 (CUDA/Docker)**
- [x] **[功能] 資料集 SFTP 傳輸與原位解壓**
- [x] **[Phase 5] Python MVP 驗證完成**（2026-06-24）
- [ ] **[遠端訓練] SSH/Sidecar 整合**：實作 `extension.ts` 中 `backend === 'remote'` 的分支
- [ ] **[遠端訓練] 容器化訓練腳本**
- [ ] **[遠端訓練] 推論與部署鏈**
- [x] **[Phase 1] 訓練後端選擇 UI**
- [x] **[Phase 2] 本地訓練功能**
- [x] **[Phase 2.5] 通用化架構重構**
- [x] **[Phase 3] 訓練積木模組開發**
- [x] **[Phase 4] 推論積木模組開發**
- [x] **[Phase 3 重構] 訓練積木合併與重構**
- [x] **[Refactor] src/extension.ts 模組化重構**
- [x] **[Phase 5] PBL 範例積木專案測試**

## [已完成] 2026-07-05 訓練結果改為 HTML 報告
- [x] 產出 HTML 訓練報告
- [x] 移除訓練結果 Modal
- [x] 簡化訓練結果按鈕
- [x] 新增 openTrainingReport / openLatestTrainingReport 指令
- [x] Sidecar 傳遞 reportPath
- [x] CSS 清理
- [x] Bug Fix: 中文路徑問題、專案路徑判斷

## [已完成] 2026-07-11 — MicroPython 入門範例 + 孤兒積木白名單
- [x] 6 個 MicroPython 入門範例
- [x] 孤兒積木白名單擴充

## [已完成] AI 訓練積木功能擴充 (2026-07-12)
- [x] Phase 1：Python 共同模組提取（6 個 common/*.py）
- [x] Phase 2：積本修改（基本 3 + 進階 4 欄位 + 分組顯示）
- [x] Phase 3：通用推論積木（init + predict + 4 解析積木）
- [x] Phase 4：Dataset Manager 對齊
- [x] Phase 5：說明文件 docs/help/（7 個 HTML）

## [已完成] Help 系統整合 (2026-07-14)
- [x] 說明文件統一放置到 `docs/help/`（含硬體腳位與 AI 積木）
- [x] 所有 AI 推論積木加入 helpUrl
- [x] VSIX `handleOpenHelp` 路徑修正
- [x] Tauri 端 `open_help` 指令 + `docs/help` 資源包
- [x] `toolbox.xml` 補上 4 個解析積木

## [待辦] 優先級 1：AI 訓練腳本擴充
- [ ] **detector_train.py 實作**：使用 `resources/train_templates/common/` 模組實作物件偵測訓練腳本
- [ ] **line_follower_train.py 實作**：使用 common 模組實作循線訓練腳本
- [ ] **table_train.py 實作**：使用 common 模組實作表格資料訓練腳本

## [待辦] 優先級 2：遠端訓練
- [ ] **SSH/Sidecar 整合**：實作 `extension.ts` 中 `backend === 'remote'` 的分支
- [ ] **容器化訓練腳本**：建立基於 DGX 鏡像的訓練容器與模板程式

## [待辦] 優先級 3：範例與說明
- [ ] **物件偵測範例規劃**：討論 `examples/AI_03_???` 的方向
- [ ] **hardware_pins 說明文件補齊**：補上 `hardware_pins_en.html` 和 `hardware_pins_zh-hant.html` 的完整內容
- [ ] **[選用]** 更新 `03_PC_inference.xml` 使用新的解析積木

## [待辦] 長期優化
- [ ] **[優化] 跨平台 Friendly Name**：實作 macOS/Linux 的序列埠名稱顯示優化。
- [ ] **[功能] 重置韌體 Sidecar 化**：研究將 `esptool` 整合成 Tauri Sidecar 的可行性。
- [x] **[功能] Dataset manager 多部 webcam 選擇**
- [x] **[功能] Dataset manager 刪除照片**

## [規劃] Tauri 版 SSH/雲端訓練實作藍圖

### 架構選擇：Python Sidecar（沿用 VSIX 模式）
- **理由**：Python 已是 Cocoya 必備、`paramiko` 跨平台 SSH 成熟穩定、VSIX 已有 sidecarManager.ts 可參考
- **實作方式**：Tauri 用 `tauri-plugin-shell` 的 `Command` API 啟動 Python subprocess

### Phase 1：資料集管理補全（前端 only）
- [ ] `openDatasetManager` → 已修（直接 dispatch 前端）
- [ ] `datasetListCameras`、`datasetStartCamera`、`datasetStopCamera`、`datasetCaptureImage`、`datasetDeleteImage` → tauri.js 需加入對應 case
- [ ] `datasetExport`、`datasetUploadArchive` → 需後端支援（Python sidecar 或 Rust 實作）
- [ ] `pickFolder` → 使用 Tauri 原生對話框（已有 `tauri-plugin-dialog`）

### Phase 2：SSH Sidecar（Python subprocess）
- [ ] 新增 `resources/ssh_sidecar.py`：封裝 `paramiko` 實現 SSH 連線、指令執行、SFTP 傳輸
- [ ] 新增 Rust `ssh.rs` 指令模組：`check_remote_env`、`upload_dataset`、`start_remote_training`、`download_results`
- [ ] 註冊指令到 `lib.rs` + `commands.toml` 權限
- [ ] 前端 `tauri.js` 加入對應 command 處理

### Phase 3：DGX 訓練流程
- [ ] 支援「資料集上傳 → SSH 啟動容器 → 監控訓練進度 → 下載結果」完整流程
- [ ] 訓練對話框的後端選擇（local/DGX）在 Tauri 模式啟用
- [ ] SSH 設定（host/port/username/password）儲存機制（Tauri 可改用 `tauri-plugin-store`）

### Phase 4：推論與部署（未來）
- [ ] 遠端推論 API 整合
- [ ] 模型下載與部署流程

---
*最後更新日期：2026-07-17 (Tauri SSH 實作計畫)*
