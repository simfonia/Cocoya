# Cocoya 任務交接 (Handover)

## 2026-02-12 專案啟動
... (略)

## 2026-05-09 核心架構模組化與安全性加固 (里程碑 v5.0 Phase 2 完成)
- **核心進度**：
    - **[重構] 前端工具模組化 (utils.js Refactor)**: 
        - 成功將單一龐大的 `ui/src/utils.js` 拆分為 5 個專用子模組：`core`, `toolbox`, `generators`, `mutator`, `search`。
        - 建立 `ui/src/utils/` 目錄並優化 `index.html` 載入順序，確保命名空間初始化與功能載入的原子性。
    - **[優化] AppController 指令分發**: 
        - 將指令處理邏輯由 `switch` 重構為 `Map` 映射處理器模式，顯著提升指令擴展性與維護性。
    - **[安全性] Tauri 2.0 權限白名單**: 
        - 實作 Tauri 2.0 二階段權限定義（`permissions/commands.toml` -> `capabilities/default.json`）。
        - 解決生產環境 (Release Build) 下自定義指令被攔截導致功能失效的問題。
    - **[修復] 環境診斷與參數同步**: 
        - 修正 `BridgeTauri` 指令映射錯誤，恢復 Python 環境診斷功能。
        - 同步 `mcu.rs` 指令參數，確保「深度修復」等指令在雙模下行為一致。
- **文檔同步**：
    - 更新 `FILE_STRUCTURE.md` 與 `api_manifest.md` 以對齊新的模組化結構。
    - 在 `GEMINI.md` 寫入 Tauri 2.0 指令權限管理規範。
- **目前狀態**：前端與後端均已完成階段性重構，架構高度解耦且安全性達標。
- **下一步目標**：
    - 整合 `deploy_mcu.py` 作為 Tauri Sidecar 以實現「免安裝 Python」運行。
    - 研究 ESP32-S3 Serial 模式燒錄 (esptool 整合)。
    - 驗證 MicroPython 範例與資源包。

## 未來開發導向 (Future Roadmap)
... (略)
