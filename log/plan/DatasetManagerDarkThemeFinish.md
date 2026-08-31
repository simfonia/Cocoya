# Dataset Manager 深色主題收尾（Stage 5 延伸）＋遠端面板移除

> 日期：2026-08-30｜狀態：規劃完成，待執行（act mode）｜範圍：DM 樣式 token 補完、全域 prompt token 化、遠端面板前端移除

---

## 背景

Stage 5（樣式 token 化）進行至切片 5b，使用者於深色（cocoya_dark/candy）主題下回報數處仍為「白色/淺灰，無法辨識」。
根因：**cocoya_dark / candy 主題走 theme_manager cssVars 換膚（body 無 `vscode-dark` class）**，凡未 token 化、且 dark 覆寫綁死在 `body.vscode-dark` 的元件，在 cocoya 主題下永遠不會變深。

## 一、長遠收斂債（記入 todo）

`--dsm-*` 的深色值目前散落兩處、非單一事實來源：
- `dataset_manager.css` 的 `body.vscode-dark, body.vscode-high-contrast { ... }` 覆寫（16 個 token）
- cocoya_dark 主題 cssVars（22 個 token）

兩者數值部分重疊但來源不同（如 `--dsm-error-bg`：vscode-dark 用 `#3d1b1b`、cocoya_dark 用 `#2d1515`）。
目前無實際衝突（兩機制互斥觸發），但日後調色需改兩處。列為 Stage 5 延伸收斂工作。

## 二、修 (1)：標註列表清單白背景（可修）

- `.dataset-annotation-item { background: #eee; }`（light），dark `#444` 綁 `body.vscode-dark`。
- 新增 `--dsm-list-item-bg`（light `#eee` / dark `#444`）→ 納入三主題 cssVars + vscode-dark 覆寫；`.dataset-annotation-item` 改 `var(--dsm-list-item-bg)`。

## 三、修 (2)：彈出對話框白背景（可修，全域）

- 根因：`tauri.js` 全域 `.cocoya-prompt-dialog`（confirm/prompt/alert 共用），白底硬編碼 + dark 綁 `body.vscode-dark`。
- 修法：將 `.cocoya-prompt-*` 樣式改用 `--dsm-*` token（surface/text/input/btn），並收斂其 vscode-dark 覆寫。
- **影響面**：tauri.js 全域 → 所有模組的 prompt（不限 DM）。
- **VSIX 端不受影響**：走 VS Code 原生訊息框，深色自動跟隨。
- **真系統框（無法變更，需告知）**：VSIX 的 VS Code 原生 dialog（自動跟隨主題，OK）；Tauri OS 層 file dialog（OS 原生）。
- 其餘列出的（類別增刪、離開未標註、Spec 可用、匯出確認、打包 ZIP 面板）皆為可修的自訂框：
  - `.dataset-export-progress`（打包 ZIP）：成功色系 token 化（`--dsm-success-bg` 等）。

## 四、遠端環境面板移除（使用者確認之設計）

**設計意圖**：DM 與遠端概念脫勾；遠端訓練在積木執行時才處理。
**實錘已驗證**：
- `py_ai_train_run` 積木有後端欄位 local/remote（`ai_inference_blocks.js`）
- 執行時攔截 remote（`ui/base.js` 238-271：`ensureSshConfig` → `startRemoteTraining`）
- SSH 精靈（`dialogs.js` showSshConfigDialog/ensureSshConfig）
- VSIX（`cocoyaManager.ts` 292 → trainingOps → sidecar `trainRemote`）；Tauri（`tauri.js` 390-393 接收 sshConfig）
→ 遠端概念已完整搬到積木執行時，DM 面板為脫勾設計下多餘的獨立 SSH 診斷入口，**移除合理**。

**移除邊界**：
- 移除「前端」：`modal.js` 診斷區模板、`ui_layout.js` 的 `refreshDynamicPanels` 顯示診斷區、`bindModalEvents` 的 cloudDiagnoseBtn 綁定、`checkRemoteEnvironment`/`datasetUploadResult` 訂閱與 dispatch、`modal._offBridgeMessage` 相關（注意訂閱解除機制需一併處理）、i18n 對應 `CLOUD_*` key、parity matrix 紀錄。
- **保留後端**：`checkRemoteEnvironment` / `trainRemote` command 與 sidecar（訓練端仍在使用）。
- 注意：`ui_layout.js` 1333-1363 的 `subscribeMultiple` 訂閱回傳 `offBridgeMessage` 掛 `modal._offBridgeMessage`（refreshI18n 卸載解除）——移除遠端面板後此訂閱不再需要，連同 `modal._offBridgeMessage` 機制若無其他用途一併評估（目前僅此一處，可移除；但為最小變更，若 `_offBridgeMessage` 僅此用途則刪除該行與 1523 行解綁）。

## 五、執行順序與驗證

1. 寫 plan（本檔）
2. 記入 `log/todo.md` 收斂債
3. (1) 標註列表 token —— `node --test` + `vite build`
4. (2) prompt 對話框 token（tauri.js）＋ export-progress 成功 token —— `node --test` + `vite build` + `node --check tauri.js`
5. (4) 遠端面板前端移除 —— `node --check` + `node --test` + `vite build` + i18n 殘留掃描
6. 文件同步：parity matrix / FILE_STRUCTURE / log/work / todo（含手動驗證清單）

## 手動驗證清單

- [ ] dark 主題：標註列表、彈出對話框（類別增刪/離開未標註/Spec 可用/匯出確認/打包 ZIP）皆變深
- [ ] candy 主題：同上皆變主題色
- [ ] 遠端面板不再出現在 DM
- [ ] 積木 remote 訓練仍可經 SSH 精靈執行（回歸）
- [ ] VSIX 原生 dialog 仍正常
- [ ] Tauri OS file dialog 不受影響