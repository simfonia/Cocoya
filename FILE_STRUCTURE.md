C:\Workspace\cocoya\
├── .vscodeignore          # VSIX 打包過濾清單
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
│       ├── 2026-04-29.md  # 重大架構轉型：全面遷移 MicroPython
│       └── 2026-04-30.md  # UI/UX 精進：Serial 穩定性與硬體辨識優化
├── ui/                    # 雙模共用前端根目錄 (Vite Project)
│   ├── index.html         # Webview 與 Tauri 共用入口
│   ├── blockly/           # Blockly 核心庫與靜態插件
│   ├── src/               # 前端原始碼與模組 (SSOT 單一事實來源)
│   │   ├── bridge.js      # CocoyaBridge 通訊抽象層
│   │   ├── main.js        # Webview 進入點 (對接 MicroPython 模式)
│   │   ├── module_loader.js # 動態模組載入器
│   │   ├── ui_manager.js  # UI 渲染與互動管理器 (含韌體子選單)
│   │   ├── utils.js       # 全域攔截器、搜尋引擎、縮排縮放器
│   │   ├── style.css      # 主樣式表 (含子選單 Hover 樣式)
│   │   ├── zh-hant.js     # 核心語系檔 (MicroPython 標籤更新)
│   │   ├── en.js          # 核心語系檔
│   │   ├── core_manifest.json # 模組載入清單
│   │   └── modules/       # 雙模共用積木模組 (已全面遷移至 MicroPython HAL)
│   └── package.json       # Vite 設定
├── src/                   # Extension 後端 (TypeScript)
│   └── extension.ts       # 擴充功能管理器 (加入終端機自動清理邏輯)
├── src-tauri/             # Tauri 後端專案 (Rust)
│   ├── Cargo.toml         # Rust 專案配置
│   ├── tauri.conf.json    # Tauri 應用配置
│   └── src/
│       ├── main.rs        # 應用程式入口
│       └── lib.rs         # 核心指令 (含 open_serial_monitor 等新指令)
├── resources/             # 延伸模組靜態資源
│   ├── deploy_mcu.py      # [MAJOR] MicroPython 全序列埠部署腳本
│   └── firmware/          # 韌體資源庫
│       └── MicroPython/   # [NEW] 已更換為 MicroPython 資源目錄
│           ├── MakerPi_RP2040/
│           └── XIAO_ESP32_S3/
├── temp_scripts/          # 執行期間暫存目錄
├── package.json           # 根目錄設定
└── tsconfig.json          # TS 編譯設定
