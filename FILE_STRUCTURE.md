C:\Workspace\cocoya\
├── .vscodeignore          # VSIX 打包過濾清單
├── docs/                  # 專案文檔
│   ├── system_spec.html   # 系統規格說明書 (v5.0 雙模架構版)
│   ├── api_manifest.md    # 前端 API SSOT (Source of Truth)
│   ├── backend_api_manifest.md # [NEW] 後端 Rust API SSOT
│   ├── pico-w_pinout.png  # 原始腳位圖
│   └── XIAO-ESP32-S3_pinout.jpg # 原始腳位圖
├── examples/              # 範例檔 (.xml)
├── log/                   # 專案日誌與任務追蹤
│   ├── details.md         # 技術細節與 API 踩坑紀錄
│   ├── handover.md        # 任務交接檔
│   ├── todo.md            # 任務清單
│   └── work/              # 每日工作紀錄
│       ├── 2026-05-03.md  # UI/UX 響應式佈局與收合面板實作
│       ├── 2026-05-04.md  # 重大修復：Tauri 多視窗關閉攔截與備份隔離
│       └── 2026-05-08.md  # [NEW] 建置自動化與 Rust 後端模組化
├── ui/                    # 雙模共用前端根目錄 (Vite Project)
│   ├── index.html         # Webview 與 Tauri 共用入口
│   ├── vite.config.js     # Vite 配置 (含資產同步外掛)
│   ├── favicon.ico        # 本地圖示以解決 404 報錯
│   ├── blockly/           # Blockly 核心庫與靜態插件
│   ├── src/               # 前端原始碼與模組 (SSOT 單一事實來源)
│   │   ├── bridge/      # 通訊橋樑子模組
│   │   │   ├── base.js    # 橋接基底類別
│   │   │   ├── tauri.js   # Tauri 專屬橋接 (含介面適配)
│   │   │   └── vscode.js  # VS Code 專屬橋接
│   │   ├── ui/          # UI 功能子模組
│   │   │   ├── terminal.js # 終端機邏輯
│   │   │   ├── renderer.js # 渲染與佈局邏輯
│   │   │   ├── hardware.js # 序列埠與韌體邏輯
│   │   │   ├── dialogs.js  # 對話框與視覺反饋
│   │   │   └── base.js     # 基礎狀態與工具列事件
│   │   ├── app/         # 應用程式核心子模組
│   │   │   ├── config.js   # 平台與主題配置
│   │   │   ├── controller.js # [NEW] 中央分發與解耦控制
│   │   │   ├── persistence.js # 檔案與備份持久化
│   │   │   ├── workspace.js # Blockly 與 Minimap 管理
│   │   │   └── lifecycle.js # 初始化與通訊生命週期
│   │   ├── utils/         # 通用工具子模組
│   │   │   ├── core.js      # DOM 攔截、ID 提取與縮排修復
│   │   │   ├── toolbox.js   # XML 過濾邏輯
│   │   │   ├── generators.js # Blockly 產生器修補
│   │   │   ├── mutator.js   # Mutator Undo 方案
│   │   │   └── search.js    # 積木搜尋引擎
│   │   ├── modules/       # 雙模共用積木模組
│   │   ├── main.js        # Legacy Entry Point
│   │   ├── ui_manager.js  # Legacy Entry Point
│   │   ├── utils.js       # [REFACTORED] 入口與命名空間初始化
│   │   ├── zh-hant.js     # 核心語系檔
│   │   ├── en.js          # 核心語系檔
│   │   ├── vs.min.css     # 本地化 Highlight.js 樣式
│   │   ├── highlight.min.js # 本地化 Highlight.js 核心
│   │   ├── python.min.js  # 本地化 Python 語法解析
│   │   └── core_manifest.json # 模組載入清單
│   └── package.json       # Vite 設定
├── src/                   # Extension 後端 (TypeScript)
│   └── extension.ts       # 擴充功能管理器
├── src-tauri/             # Tauri 後端專案 (Rust)
│   ├── Cargo.toml         # Rust 專案配置
│   ├── tauri.conf.json    # Tauri 應用配置 (含安裝與資源設定)
│   ├── capabilities/      # 視窗權限配置 (default.json)
│   └── src/
│       ├── main.rs        # 應用程式入口
│       ├── lib.rs         # [REFACTORED] 瘦身後的生命週期管理
│       ├── state.rs       # [NEW] AppState 定義 (進程/鎖定狀態)
│       ├── utils.rs       # [NEW] 路徑與資源解析工具
│       └── commands/      # [NEW] 分類指令處理器
│           ├── mod.rs     # 指令集匯出
│           ├── python.rs  # Python 執行與環境診斷
│           ├── file.rs    # 檔案讀寫、備份與鎖定
│           ├── mcu.rs     # 硬體通訊、韌體與序列埠
│           └── app.rs     # 視窗控制與系統資訊
├── resources/             # 延伸模組靜態資源
│   ├── deploy_mcu.py      # [ENHANCED] 強化擦除與監控邏輯
│   └── firmware/          # 韌體資源庫
├── temp_scripts/          # 執行期間暫存目錄
├── package.json           # 根目錄設定
└── tsconfig.json          # TS 編譯設定
