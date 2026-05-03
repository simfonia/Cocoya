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

## [已完成] 里程碑 v6.0: 全面轉向 MicroPython
- [x] **[核心] 底層通訊重構**：重寫 `deploy_mcu.py`，改採全序列埠 (Raw REPL) 傳輸，解決磁碟鎖定問題。
- [x] **[核心] 硬體產生器 (HAL) 遷移**：重寫馬達、舵機、超音波、音樂引擎與 Camera 驅動邏輯 (使用 `machine` 庫)。
- [x] **[UI] 介面清理與環境優化**：重新設計設定選單，移除過時的 USB 鎖定功能，實作「深度修復磁碟」。
- [x] **[UI/UX]** 為「深度修復」加入 Hover 說明與垃圾桶圖示，修正「重建磁區」誤導術語。
- [x] **[核心/VSIX]** 實作序列埠智慧辨識 (Smart Labeling) 與高效能非同步偵測。
- [x] **[核心/VSIX]** 實作 Terminal Singleton 模式，徹底解決 COM 埠佔用衝突。

## [進行中] 里程碑 v6.0: MicroPython 模式補完
- [x] **[核心] 基礎硬體產生器遷移**：將 `hardware_generators.js` 中的 `board`, `digitalio`, `pwmio` 替換為 MicroPython 的 `machine` 庫。
- [x] **[核心] 數學模組 MicroPython 相容性**：修正 `math_generators.js` 中的隨機種子初始化。
- [ ] **[UI/UX]** (已取消) 自製捲動感應器。目前已將原本插件預設值設為關閉。
- [ ] **[範例] 範例專案更新**：補完並測試 MicroPython 模式下的所有範例專案。
- [ ] **[韌體] 資源包準備**：準備各型號板子的 MicroPython 韌體資源包 (.uf2 / .bin)。

## [進行中] 里程碑 v5.0: 雙模架構轉型 (VSIX + Tauri)
- [x] **資源遷移與目錄重構**：建立 `ui/` SSOT 結構，徹底移除 `media/`。
- [x] **通訊抽象層實作**：建立 `CocoyaBridge` 並支援非同步 API 加載機制。
- [x] **VSIX 模式穩定化**：完成路徑適配與體備優化 (.vscodeignore)。
- [ ] **Tauri 獨立 App 開發**：
    - [x] 建立 `src-tauri` 核心架構 (Rust, Capabilities, tauri.conf.json).
    - [x] 實現部分指令鏡像：`run_python` (含串流日誌)、`get_manifest`、`get_module_toolbox`.
    - [x] 實現檔案系統指令：`save_file` (含 dialog)、`open_file`.
    - [x] 實現序列埠 hardware 指令：`get_serial_ports`、`deploy_mcu`.
    - [ ] 整合 `deploy_mcu.py` 作為 Tauri Sidecar 以利打包發布。
    - [ ] 實作重置韌體功能 (Reset Firmware)：
        - [ ] 策略 A：UF2 複製模式 (適用於 RP2040)。
        - [ ] 策略 B：Serial 模式 (適用於 ESP32-S3，需整合 esptool Sidecar)。
    - [ ] 實現 Tauri 模式下的 **環境診斷** (check_environment)。
- [ ] **建置自動化**：配置 Vite Build，產出 VSIX 運行時資源。
- [x] **[UI/UX] 響應式工具列修正**：解決視窗過小時工具列溢出疊加問題，導入媒體查詢與 `minWidth` 限制。
- [x] **[UI/UX] 程式碼預覽面板收合與縮放**：實作可切換的收合把手 (對齊 #wavecode) 與手動調整垂直分割面積功能。

## [待辦] 里程碑 v5.1: 跨平台與 TinyML
- [ ] **[核心/跨平台]** 實作 macOS/Linux 的序列埠 Friendly Name 偵測 (ioreg/udevadm)。
- [ ] **[核心/Tauri]** 升級 Rust 後端以支援詳細序列埠資訊與進程單一化管理。
- [ ] **TinyML 工具整合**：在獨立應用程式模式下提供影像標註與資料採集面板。

---
*最後更新日期：2026-05-03 (UI/UX 響應式與收合面板實作)*
