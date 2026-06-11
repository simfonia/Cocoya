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

## [進行中] 雲端 AI 模型訓練 (NVIDIA NGX Spark 整合)
- **核心方針**：利用本地 Python Sidecar 建立 SSH/SFTP 連線與遠端 GPU 伺服器通訊，實現跨 VSIX 與 Tauri 雙模通用、純本地除錯、高安全性的雲端訓練。
- [ ] **[架構] VSIX 回歸 UI 模式**：修改 <code>package.json</code> 將 <code>extensionKind</code> 還原為 <code>["ui"]</code>，使 Extension 鎖定在本地執行以利除錯。
- [ ] **[UI] 臨時安全授權 Dialog**：在開啟雲端 AI 模式或執行診斷時，彈出對話框讓使用者輸入 Host/User/Pass，僅保存在前端內存中而不持久化。
- [ ] **[Sidecar] 實作 SSH/SFTP 通訊模組**：在本地 Python Sidecar 中使用 <code>paramiko</code> 庫，實作遠端指令執行與 SFTP 檔案傳輸。
- [ ] **[功能] 遠端環境診斷 (CUDA/Docker)**：由本地 Sidecar 透過 SSH 執行遠端主機的 GPU 與 Docker 狀態檢查。
- [ ] **[功能] 資料集 SFTP 傳輸與原位解壓**：本地 Sidecar 執行 ZIP 壓縮，並以 SFTP 直接上傳至遠端家目錄，隨後呼叫遠端 Python 自動解壓縮。
- [ ] **伺服器端容器化訓練**：建立基於 NGC TAO 鏡像的訓練容器與模板程式。
- [ ] **推論與部署鏈**：支援雲端推論結果回傳與 `.tflite` 模型自動燒錄至 πCar。

## [待辦] 其他優化
- [ ] **[優化] 跨平台 Friendly Name**：實作 macOS/Linux 的序列埠名稱顯示優化。
- [ ] **[功能] 重置韌體 Sidecar 化**：研究將 `esptool` 整合成 Tauri Sidecar 的可行性。

---
*最後更新日期：2026-06-11 (重整 Cloud AI 方案 C 開發架構)*

## [異動紀錄] 2026-06-11 方案 C 後端閉環完成
- [x] **[Sidecar] 抑制警告雜訊**：在 <code>dataset_sidecar.py</code> 加入 warnings 抑制邏輯，消除 CryptographyDeprecationWarning。
- [x] **[Extension] 優化 stderr 過濾**：修改 <code>extension.ts</code>，將 Deprecation/UserWarning 分類為 console.warn，避免誤報為錯誤。
- [x] **[環境] 優化 F5 啟動配置**：移除 <code>launch.json</code> 中的 Remote 配置，解決啟動時彈出選單問題。
- [x] **[UI] 移除「變更帳密」按鈕**：避免學生誤操作（ui_layout.js）。
- [x] **[Extension] handleSetCloudAiMode 簡化**：移除舊有 Remote-SSH 強制檢查，本地 UI Kind 即可啟用雲端 AI 模式。
- [x] **[Extension] handleCheckRemoteEnvironment 改寫**：從 exec 本地命令改為委託 this.sidecar.send('checkRemoteEnvironment', sshConfig) 透過 paramiko SSH 執行。
- [x] **[Extension] handleDatasetUploadArchive 改寫**：本地組裝 ZIP 後，委託 this.sidecar.send('uploadDataset', ...) 透過 SFTP 上傳至遠端並解壓。
- [x] **[Extension] 移除所有 spread operator**：改用 Object.assign，符合專案規範。
- [x] **[Sidecar] 修正 unzip_cmd**：改用單行 python3 -c '...' 格式，避免多行 triple-quote 在 SSH exec_command 中被 bash 誤解析。
- [x] **[架構] VSIX 已確認回歸 UI 模式 (extensionKind: [ ui])**，不再需要 Remote-SSH 環境。
- [x] **[建置] TypeScript 編譯與 Vite build 均無錯誤**。

## [異動紀錄] 2026-06-11 解決 Cloud AI 模式無彈窗與診斷無回應問題
- [x] **[UI] 移植 SSH 帳密對話框至全域 (dialogs.js)**：在 <code>window.CocoyaUI</code> 新增全域 <code>sshConfig</code>、<code>showSshConfigDialog</code> 與 <code>ensureSshConfig</code>。
- [x] **[UI] 切換 Cloud AI 模式強制彈窗 (base.js)**：當使用者在工具列開啟 Cloud AI 開關時，強制彈出輸入對話框；若取消則 Toggle 彈回 false，避免未設定即啟用。
- [x] **[Extension] 新增 VS Code OutputChannel (extension.ts)**：建立名為 " Cocoya Sidecar\ 的輸出通道，將 Sidecar 執行過程、stdout 與 stderr 全部寫入。
- [x] **[Extension] 修正 Sidecar 啟動失敗無反應問題 (extension.ts)**：若 <code>spawn</code> 進程失敗，在 <code>send()</code> 內主動回傳錯誤給前端，避免前端 webview 懸空等待。
- [x] **[建置] Vite 前端重新 build 成功**：修復了因替換失誤多出來的語法錯誤括號，順利完成編譯。
- [x] **[UI] 修正 SSH 輸入框模板字串變數解析**：將 <code>dialogs.js</code> 中的 <code>\${</code> 改回 <code>${</code>，修復 Port 等輸入框格式錯誤與卡死問題。
- [x] **[UI] 解決 CSS 預設 display: none 隱藏對話框問題**：在 <code>dialogs.js</code> 的 <code>showSshConfigDialog</code> 中，手動設定 <code>dialog.style.display = 'flex'</code> 以覆寫 <code>dataset-manager-overlay</code> 類別的預設樣式，確保對話框正常顯現。
