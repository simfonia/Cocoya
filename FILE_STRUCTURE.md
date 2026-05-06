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
│       ├── 2026-05-03.md  # UI/UX 響應式佈局與收合面板實作
│       └── 2026-05-04.md  # 重大修復：Tauri 多視窗關閉攔截與備份隔離
├── ui/                    # 雙模共用前端根目錄 (Vite Project)
│   ├── index.html         # Webview 與 Tauri 共用入口 (新增 Terminal 佈局)
│   ├── favicon.ico        # 本地圖示以解決 404 報錯
│   ├── blockly/           # Blockly 核心庫與靜態插件
├── src/               # 前端原始碼與模組 (SSOT 單一事實來源)
│   ├── bridge.js      # CocoyaBridge 通訊抽象層 (多視窗隔離對接)
│   ├── main.js        # Webview 進入點 (自動平台遷移邏輯)
│   ├── module_loader.js # 動態模組載入器
│   ├── ui_manager.js  # UI 基礎邏輯與 I18n 管理 (原 Monolithic 檔案瘦身中)
├── ui/            # UI 子模組 (抽離自 ui_manager)
│   ├── terminal.js # 終端機邏輯
│   ├── renderer.js # 渲染與佈局邏輯
│   ├── hardware.js # [NEW] 序列埠與韌體邏輯
│   ├── dialogs.js  # [NEW] 對話框與視覺反饋
│   └── base.js     # [NEW] 基礎狀態與工具列事件
├── app/           # [NEW] 應用程式核心子模組 (抽離自 main.js)
│   ├── config.js   # 平台與主題配置
│   ├── persistence.js # 檔案與備份持久化
│   ├── workspace.js # Blockly 與 Minimap 管理
│   └── lifecycle.js # 初始化與通訊生命週期
├── utils.js       # 全域攔截器與工具函式
│   │   ├── style.css      # 主樣式表 (Terminal 動畫與響應式佈局)
│   │   ├── zh-hant.js     # 核心語系檔
│   │   ├── en.js          # 核心語系檔
│   │   ├── vs.min.css     # 本地化 Highlight.js 樣式
│   │   ├── highlight.min.js # 本地化 Highlight.js 核心
│   │   ├── python.min.js  # 本地化 Python 語法解析
│   │   ├── core_manifest.json # 模組載入清單
│   │   └── modules/       # 雙模共用積木模組
│   └── package.json       # Vite 設定
├── src/                   # Extension 後端 (TypeScript)
│   └── extension.ts       # 擴充功能管理器
├── src-tauri/             # Tauri 後端專案 (Rust)
│   ├── Cargo.toml         # Rust 專案配置
│   ├── tauri.conf.json    # Tauri 應用配置 (資源白名單映射)
│   ├── capabilities/      # [UPDATED] 視窗權限配置 (default.json)
│   └── src/
│       ├── main.rs        # 應用程式入口
│       └── lib.rs         # [MAJOR] AppState 隔離重構與多視窗指令
├── resources/             # 延伸模組靜態資源
│   ├── deploy_mcu.py      # [ENHANCED] 強化擦除與監控邏輯
│   └── firmware/          # 韌體資源庫
├── temp_scripts/          # 執行期間暫存目錄
├── package.json           # 根目錄設定
└── tsconfig.json          # TS 編譯設定
