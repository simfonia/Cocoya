# Cocoya 專案任務清單 (Todo List)
**專案名稱**：Cocoya (Code, Compute, Yield AI)
**核心目標**：建立一個以 Blockly 為介面，幫助 Python 初學者進入 AI 世界的 VSCode extension 與獨立桌面應用程式。

## [核心開發原則]
- **SSOT (單一事實來源)**：所有積木、產生器與前端邏輯必須統一存放在 `ui/src` 下，由 VSIX 與 Tauri 共享。
- **通訊抽象化**：前端必須透過 `CocoyaBridge` 與後端通訊，禁止在 UI 層直接使用環境專屬 API (如 `vscode.postMessage`)。

## [已完成] 里程碑 v1.0 ~ v3.4 (核心架構、視覺 AI、硬體對齊)
- [x] UI 佈局、積木定位、硬體部署基礎。
- [x] MediaPipe 手勢/臉部/姿勢偵測模組。
- [x] AR 濾鏡 (Overlay PNG) 與中文顯示支援。
- [x] 環境診斷與一鍵安裝助手。
- [x] **πCar 功能全面移植**與 MCU 基礎腳位控制。
- [x] **積木說明文件系統 (Help System)**。

## [進行中] 里程碑 v5.0: 雙模架構轉型 (VSIX + Tauri)
- [x] **資源遷移與目錄重構**：
    - [x] 建立 `ui/` 目錄並初始化結構。
    - [x] 遷移所有資源至 `ui/src` (含圖示、語系、積木、插件)。
    - [x] 徹底移除舊有的 `media/` 目錄。
- [x] **通訊抽象層實作**：
    - [x] 建立 `ui/src/bridge.js` 並完成 `CocoyaBridge` 實作。
    - [x] 重構 `main.js` 與 `module_loader.js` 對接橋樑。
- [x] **VSIX 模式穩定化**：
    - [x] 更新 `extension.ts` 資源映射邏輯，支援 Vite 風格的路徑。
    - [x] 修復積木搜尋、Minimap 切換、Python 縮排等 UI 功能。
- [ ] **Tauri 獨立 App 開發**：
    - [ ] 初始化 `src-tauri` 專案。
    - [ ] 實現 Rust 後端指令鏡像（檔案開檔/存檔、序列埠掃描、代碼執行）。
    - [ ] 實作 Sidecar 整合 `deploy_mcu.py`。
- [ ] **建置自動化**：
    - [ ] 配置 Vite Build 流程，確保產出物能同時被 VSIX 與 Tauri 打包。

## [待辦] 里程碑 v5.1: 功能同步與優化
- [ ] **跨平台支援 (Linux/macOS)**：在 Tauri 模式下實現自動適配。
- [ ] **TinyML 資料採集強化**：在獨立應用程式模式下提供更高效的影像儲存介面。

---
*最後更新日期：2026-04-09 (雙模架構 VSIX 穩定版達成)*
