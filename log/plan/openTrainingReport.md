# openTrainingReport Tauri 移植計畫

**功能名稱**：openTrainingReport / openLatestTrainingReport  
**建立日期**：2026-08-01  
**完成日期**：2026-08-01  
**狀態**：已完成（Tauri 版本）  
**參考實作**：`src/handlers/trainingOps.ts` (VSIX 版本)

---

## 📋 功能概述

`openTrainingReport` 是用系統預設瀏覽器開啟 **HTML 訓練報告** 的功能。訓練完成後會產出 HTML 格式的視覺化報告（包含訓練曲線、準確率、損失等資訊），這個功能讓使用者可以方便地在瀏覽器中查看報告。

---

## 🎯 實作目標

在 Tauri 模式下實作相同的功能：
1. **openTrainingReport**：開啟指定的訓練報告 HTML 檔案
2. **openLatestTrainingReport**：自動搜尋並開啟最新的訓練報告

---

## 🔍 目前狀態

### VSIX 版本（已實作）
- ✅ `handleOpenTrainingReport()` - 開啟指定報告
- ✅ `handleOpenLatestTrainingReport()` - 開啟最新報告
- ✅ 中文路徑檢查與錯誤提示
- ✅ 使用 `vscode.env.openExternal()` 開啟瀏覽器

### Tauri 版本（已完成）
- ✅ Rust 端 `open_report` 指令（`src-tauri/src/commands/training.rs`）
- ✅ Rust 端 `find_latest_training_report` 指令（同檔案）
- ✅ 前端 `ui/src/bridge/tauri.js` 已加入對應處理
- ✅ 權限設定已更新（`commands.toml`）
- ✅ 編譯驗證通過

---

## 🛠️ 實作詳情

### Phase 1：Rust 端指令實作

#### 1.1 新增 `training.rs` 指令模組
**檔案**：`src-tauri/src/commands/training.rs`

包含兩個指令：

1. **`open_report(report_path: String)`**
   - 接收報告檔案路徑
   - 檢查檔案是否存在
   - 使用 `open::that()` 開啟系統預設瀏覽器
   - 回傳成功/失敗狀態

2. **`find_latest_training_report(window, state)`**
   - 從 `AppState.current_paths` 取得當前視窗的檔案路徑
   - 以 `path.parent()` 取得 baseDir，再 join `model`
   - 遞迴搜尋 `*_training_report.html`
   - 回傳 `Vec<ReportInfo>`（含 `path`、`project_name`、`mtime_millis`）
   - 根據修改時間排序（最新的在前）
   - 前端根據數量決定直接開啟或顯示 QuickPick

**`ReportInfo` 結構體**：
```rust
#[derive(Serialize)]
pub struct ReportInfo {
    pub path: String,
    pub project_name: String,
    pub mtime_millis: u128,
}
```

#### 1.2 註冊指令
**檔案**：`src-tauri/src/commands/mod.rs`
- 加入 `pub mod training;`
- 加入 `pub use training::*;`

**檔案**：`src-tauri/src/lib.rs`
- `invoke_handler` 加入 `commands::open_report` 和 `commands::find_latest_training_report`

#### 1.3 更新權限設定
**檔案**：`src-tauri/permissions/commands.toml`
- `commands.allow` 陣列加入 `"open_report"` 和 `"find_latest_training_report"`

**檔案**：`src-tauri/capabilities/default.json`
- **無需修改**，已引用 `"allow-all-commands"`

---

### Phase 2：前端整合

#### 2.1 更新 `tauri.js`
**檔案**：`ui/src/bridge/tauri.js`

替換原有的空殼 case（第 465-470 行），改為實際呼叫 Tauri 指令：

- **`openTrainingReport`**：呼叫 `open_report` 指令，失敗時顯示錯誤訊息
- **`openLatestTrainingReport`**：呼叫 `find_latest_training_report` 取得報告列表
  - 0 個報告：顯示「尚無訓練結果」提示
  - 1 個報告：直接開啟
  - 多個報告：顯示 QuickPick 讓使用者選擇

#### 2.2 `datasetUploadArchive` 保留原邏輯
`datasetUploadArchive` 仍維持 `_dispatchToFrontend` 空殼，因尚未實作 sidecar 支援。

---

### Phase 3：中文路徑處理

VSIX 版本阻擋中文路徑，但 Tauri 版本使用 `open::that()`，在 Windows 上對中文路徑處理較佳。**Tauri 版本不阻擋中文路徑**，直接嘗試開啟，失敗時再提示錯誤訊息。

---

## 📦 相關檔案

### 已修改的檔案
1. **`src-tauri/src/commands/training.rs`** - 新增指令模組
2. **`src-tauri/src/commands/mod.rs`** - 註冊模組
3. **`src-tauri/src/lib.rs`** - invoke_handler 註冊指令
4. **`src-tauri/permissions/commands.toml`** - 權限設定
5. **`ui/src/bridge/tauri.js`** - 前端處理邏輯

### 參考檔案
- **`src/handlers/trainingOps.ts`** - VSIX 版本的完整實作
- **`src-tauri/src/commands/app.rs`** - `open_help` 指令（同樣使用 `open::that()`）
- **`src-tauri/src/state.rs`** - `AppState.current_paths` 用於 baseDir

### 不需修改的檔案
- **`src-tauri/Cargo.toml`** - 已有 `open = "5"` 依賴
- **`src-tauri/capabilities/default.json`** - 已引用 `"allow-all-commands"`

---

## 🔗 相關任務

- **todo.md**：B2. `openTrainingReport` — Rust `open::that()` 開 HTML ✅ 已完成
- **依賴任務**：無
- **後續任務**：無

---

## 📝 備註

1. **與 VSIX 的差異**：
   - VSIX 使用 `vscode.env.openExternal()`
   - Tauri 使用 `open::that()`
   - VSIX 阻擋中文路徑，Tauri 不阻擋（`open::that()` 處理較佳）

2. **baseDir 取得方式**：
   - VSIX：`vscode.workspace.workspaceFolders[0].uri.fsPath` 或 `currentFilePath`
   - Tauri：`AppState.current_paths` 中取得當前視窗路徑，再取 `parent()`

3. **多報告選擇**：
   - VSIX：使用 `vscode.window.showQuickPick()`
   - Tauri：使用 `window.CocoyaUI.showQuickPick()`（前端 UI 元件）

---

## ✅ 實作檢查清單

- [x] 確認 `open` crate 已加入 `Cargo.toml`
- [x] 實作 `open_report` 指令
- [x] 實作 `find_latest_training_report` 指令
- [x] 註冊指令到 `mod.rs`
- [x] 註冊指令到 `lib.rs`
- [x] 更新 `commands.toml` 權限
- [x] 更新 `tauri.js` 前端處理
- [x] 編譯驗證通過
- [ ] 測試開啟現有報告
- [ ] 測試搜尋最新報告
- [ ] 測試錯誤處理
- [x] 更新 `todo.md` 標記為已完成

---

*最後更新：2026-08-01*