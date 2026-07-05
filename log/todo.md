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

## [進行中] 雲端 AI 模型訓練 (NVIDIA DGX Spark 整合)
- **核心方針**：利用本地 Python Sidecar 建立 SSH/SFTP 連線與遠端 GPU 伺服器通訊，實現跨 VSIX 與 Tauri 雙模通用、純本地除錯、高安全性的雲端訓練。
- [x] **[架構] VSIX 回歸 UI 模式**：修改 <code>package.json</code> 將 <code>extensionKind</code> 還原為 <code>["ui"]</code>，使 Extension 鎖定在本地執行以利除錯。
- [x] **[UI] 臨時安全授權 Dialog**：在開啟雲端 AI 模式或執行診斷時，彈出對話框讓使用者輸入 Host/User/Pass，僅保存在前端內存中而不持久化。
- [x] **[Sidecar] 實作 SSH/SFTP 通訊模組**：在本地 Python Sidecar 中使用 <code>paramiko</code> 庫，實作遠端指令執行與 SFTP 檔案傳輸。
- [x] **[功能] 遠端環境診斷 (CUDA/Docker)**：由本地 Sidecar 透過 SSH 執行遠端主機的 GPU 與 Docker 狀態檢查。
- [x] **[功能] 資料集 SFTP 傳輸與原位解壓**：本地 Sidecar 執行 ZIP 壓縮，並以 SFTP 直接上傳至遠端家目錄，隨後呼叫遠端 Python 自動解壓縮。
- [x] **[Phase 5] Python MVP 驗證完成**（2026-06-24）：完整驗證從資料收集到 DGX 訓練到本地推論的全鏈路。
  - [x] 本地流程驗證：收集 → 訓練 (93~94%) → 推論
  - [x] DGX 遠端驗證：上傳 → 容器化訓練 (94.68%) → 下載模型
  - [x] πCar 整合腳本就緒（待實機測試）
- [ ] **伺服器端容器化訓練**：建立基於 NGC 鏡像的訓練容器與模板程式（MVP 已驗證 NGC PyTorch 容器 + TensorFlow）。
- [ ] **推論與部署鏈**：支援雲端推論結果回傳與 <code>.tflite</code> 模型自動燒錄至 πCar。
- [x] **[Phase 1] 訓練後端選擇 UI**（2026-06-25）：對話框 + 工具列按鈕 + localStorage 記住選擇
- [x] **[Phase 2] 本地訓練功能**（2026-06-25）：Sidecar trainLocal + Tauri start_training + Extension handleStartTraining
- [x] **[Phase 2.5] 通用化架構重構**（2026-06-25）：
  - [x] 移除訓練按鈕，改為純積木控制
  - [x] 「Cloud AI」改名為「遠端訓練」
  - [x] 建立通用訓練模板系統（<code>resources/train_templates/</code>）
  - [x] 移除對 MVP 腳本的依賴
  - [x] Dataset Manager icon 更新為 <code>dataset_24dp_1F1F1F.png</code>
- [x] **[Phase 3] 訓練積木模組開發**（2026-06-25）：
  - [x] 建立 <code>ai_inference/</code> 模組（2 個訓練積木）
  - [x] 實作 <code>py_ai_train_init</code>（訓練配置）
  - [x] 實作 <code>py_ai_train_run</code>（執行訓練）
  - [x] 加入 i18n 支援（英文 + 中文）
  - [x] 註冊至 core_manifest.json
  - [x] 前端編譯測試通過
  - [x] 修復 i18n key 名稱（<code>COLOUR_AI_INFERENCE</code>）
  - [x] 修復 message0 args 數量錯誤（中英文）
- [x] **[Phase 4] 推論積木模組開發**：建立 ai_inference 推論模組（2 個積木：init + predict）
  - [x] 建立 <code>ai_inference/</code> 模組積木定義（init + predict）
  - [x] 實作 <code>py_ai_model_init</code> / <code>py_ai_model_predict</code> 產生器
  - [x] 修正 input 名稱一致性（FRAME 與 INPUT）
  - [x] 修正 output 類型（Tuple）以符合 value block 語義
  - [x] 補齊 i18n（en / zh-hant）
  - [x] 註冊至 core_manifest.json
- [x] **[Phase 3 重構] 訓練積木合併與重構**（2026-06-29）：
  - [x] 合併 `py_ai_train_init` + `py_ai_train_run` 為單一 `py_ai_train_run` 積木
  - [x] 完全重寫為手動 `appendDummyInput()` 方式，解決欄位衝突
  - [x] 積木標題改為「影像訓練」(vision training)
  - [x] 移除不支援的 `FieldButton`
  - [x] 模型路徑改為唯讀標籤，自動從資料集路徑提取
  - [x] 更新產生器邏輯，注入 `train_model()` 函式
  - [x] 移除冗餘的 `--model_dir` 參數（訓練腳本簡化）
  - [x] 模型檔名使用專案名稱（非寫死 `gesture_` 前綴）
  - [x] labels.txt 加上專案名稱前綴保持一致
  - [x] 更新中英文 i18n 與詳細 tooltip
  - [x] 刪除已移除的訓練配置積木 i18n key
  - [x] 路徑選擇對話框整合（extension.ts handlePickFolder）
  - [x] 修正多項錯誤（i18n 佔位符、FieldButton、參數名稱衝突）

- [ ] **[Phase 5] PBL 範例積木專案測試**：僅測試 02（訓練），03（推論）與 04（MCU 控制）尚未測試

## [異動紀錄] 2026-07-05 訓練結果改為 HTML 報告，移除複雜 Modal
- [x] **[訓練腳本] 產出 HTML 訓練報告**：`classifier_train.py` 在訓練完成後額外產出 `{project_name}_training_report.html`，內嵌 base64 曲線圖、摘要統計與可展開的 JSON 歷史資料。
- [x] **[UI] 移除訓練結果 Modal**：刪除 `dialogs.js` 中的 `showTrainingResultPanel` 複雜浮動視窗（含拖曳、圖片載入、按鈕狀態管理），改為直接以系統瀏覽器開啟 HTML 報告。
- [x] **[UI] 簡化訓練結果按鈕**：`base.js` 中的「訓練結果」按鈕改為向後端發送 `openLatestTrainingReport` 指令，由後端搜尋 `model/` 目錄下最新的報告。
- [x] **[Extension] 新增 openTrainingReport / openLatestTrainingReport 指令**：`extension.ts` 實作用系統瀏覽器開啟 HTML 報告，以及遞迴搜尋最新報告的邏輯。
- [x] **[Sidecar] 傳遞 reportPath**：`dataset_sidecar.py` 的 `trainLocal` 回應中加入 `reportPath` 欄位。
- [x] **[CSS] 清理**：移除 `style.css` 中約 200 行的訓練結果 Modal 樣式。
- [x] **[Bug Fix] 中文路徑問題**：加入中文路徑檢測，當路徑包含中文時顯示友善的錯誤提示（避免 0x2 錯誤）。
- [x] **[Bug Fix] 專案路徑判斷**：`handleOpenLatestTrainingReport` 優先使用 `currentFilePath` 所在目錄，而非 `workspaceFolders[0]`。
- [x] **[PBL 專案重命名]**：將 `examples/影像分類控制piCarl音效/` 改名為 `examples/AI_02_classifier/`，所有中文檔名改為英文檔名。

## [待辦] 其他優化
- [ ] **[優化] 跨平台 Friendly Name**：實作 macOS/Linux 的序列埠名稱顯示優化。
- [ ] **[優化] 刪除隱藏積木**：如 break out of loop。
- [ ] **[功能] 重置韌體 Sidecar 化**：研究將 `esptool` 整合成 Tauri Sidecar 的可行性。
- [ ] **[功能] Dataset manager 多部 webcam 選擇**。
- [ ] **[功能] Dataset manager 刪除照片**。

---
*最後更新日期：2026-07-05 (訓練結果改為 HTML 報告，移除複雜 Modal)*