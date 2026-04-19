# Cocoya 專案任務清單 (Todo List)
**專案名稱**：Cocoya (Code, Compute, Yield AI)
**核心目標**：建立一個以 Blockly 為介面，幫助 Python 初學者進入 AI 世界的 VSCode extension 與獨立桌面應用程式。

## [核心開發原則]
- **SSOT (單一事實來源)**：所有積木、產生器與前端邏輯必須統一存放在 `ui/src` 下，由 VSIX 與 Tauri 共享。
- **通訊抽象化**：前端必須透過 `CocoyaBridge` 與後端通訊，禁止在 UI 層直接使用環境專屬 API。

## [已完成] 里程碑 v1.0 ~ v4.9 (功能對齊與 Bug 修復)
- [x] MediaPipe AI 視覺模組、πCar 硬體控制與 MCU 部署基礎。
- [x] **[重大修復]** 解決 VSIX 模式下搜尋影子積木遺失、Minimap 不同步、Python 縮排位移等 Bug。
- [x] **[重大修復]** 強化 MCU 部署韌性，解決 Windows 磁碟鎖定 (Errno 22) 並整合 VS Code 進度通知。

## [進行中] 里程碑 v5.0: 雙模架構轉型 (VSIX + Tauri)
- [x] **資源遷移與目錄重構**：建立 `ui/` SSOT 結構，徹底移除 `media/`。
- [x] **通訊抽象層實作**：建立 `CocoyaBridge` 並支援非同步 API 加載機制。
- [x] **VSIX 模式穩定化**：完成路徑適配與體備優化 (.vscodeignore)。
- [ ] **Tauri 獨立 App 開發**：
    - [x] 建立 `src-tauri` 核心架構 (Rust, Capabilities, tauri.conf.json)。
    - [x] 實現部分指令鏡像：`run_python` (含串流日誌)、`get_manifest`、`get_module_toolbox`。
    - [ ] 實現檔案系統指令：`save_file` (含 dialog)、`open_file`。
    - [ ] 實現序列埠硬體指令：`get_serial_ports`、`deploy_mcu`。
    - [ ] 整合 `deploy_mcu.py` 作為 Tauri Sidecar。
- [ ] **建置自動化**：配置 Vite Build，產出 VSIX 運行時資源。

## [待辦] 里程碑 v5.1: 跨平台與 TinyML
- [ ] **跨平台支援 (Linux/macOS)**：實作 Rust 路徑與部署腳本的自動適配。
- [ ] **TinyML 工具整合**：在獨立應用程式模式下提供影像標註與資料採集面板。

---
*最後更新日期：2026-04-19 (Tauri 模式成功啟動)*
