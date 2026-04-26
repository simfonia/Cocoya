C:\Workspace\cocoya\
├── .vscodeignore          # [NEW] VSIX 打包過濾清單 (排除 node_modules, src-tauri 等)
├── docs/                  # 專案文檔
│   ├── system_spec.html   # 系統規格說明書 (v5.0 雙模架構版)
│   ├── pico-w_pinout.png  # 原始腳位圖
│   └── XIAO-ESP32-S3_pinout.jpg # 原始腳位圖
├── examples/              # 範例檔 (.xml)
├── log/                   # 專案日誌與任務追蹤
│   ├── details.md         # 技術細節與 API 踩坑紀錄
│   ├── handover.md        # 任務交接檔
│   ├── todo.md            # 任務清單
│   └── work/              # 每日工作紀錄
├── ui/                    # 雙模共用前端根目錄 (Vite Project)
│   ├── index.html         # Webview 與 Tauri 共用入口
│   ├── blockly/           # Blockly 核心庫與靜態插件
│   ├── src/               # 前端原始碼與模組 (SSOT 單一事實來源)
│   │   ├── bridge.js      # CocoyaBridge 通訊抽象層 (支援 VSCode/Tauri)
│   │   ├── main.js        # Webview 進入點 (對接 CocoyaBridge)
│   │   ├── module_loader.js # 動態模組載入器
│   │   ├── ui_manager.js  # UI 渲染與互動管理器
│   │   ├── utils.js       # 全域攔截器、搜尋引擎、縮排縮放器
│   │   ├── style.css      # 主樣式表
│   │   ├── zh-hant.js     # 核心語系檔
│   │   ├── en.js          # 核心語系檔
│   │   ├── core_manifest.json # 模組載入清單
│   │   └── modules/       # 雙模共用積木模組 (core, cv_*, ai_*, hardware)
│   └── package.json       # Vite 設定
├── src/                   # Extension 後端 (TypeScript)
│   └── extension.ts       # 擴充功能管理器 (處理 ui/ 目錄資源映射)
├── src-tauri/             # [NEW] Tauri 後端專案 (Rust)
│   ├── Cargo.toml         # Rust 專案配置與依賴
│   ├── tauri.conf.json    # Tauri 應用配置 (視窗、權限、資源映射)
│   ├── build.rs           # Tauri 編譯腳本
│   ├── src/
│   │   ├── main.rs        # 應用程式入口
│   │   └── lib.rs         # 核心指令 (Python 執行、日誌串流、資源讀取)
│   ├── capabilities/      # [NEW] 權限定義目錄
│   │   └── default.json   # 預設開放的 API 權限 (Shell, Event, FS)
│   └── resources/         # [NEW] Tauri 運行時資源
│       └── core_manifest.json # 從前端同步的模組清單
├── resources/             # 延伸模組靜態資源
│   ├── deploy_mcu.py      # CircuitPython 部署輔助腳本
│   └── firmware/          # [NEW] 各型號 CircuitPython 韌體庫 (.uf2)
│       └── CircuitPython/
│           ├── MakerPi_RP2040/
│           └── XIAO_ESP32_S3/
├── temp_scripts/          # 執行期間暫存目錄
├── package.json           # 根目錄設定 (含 dev/build/tauri 代理指令)
└── tsconfig.json          # TS 編譯設定
