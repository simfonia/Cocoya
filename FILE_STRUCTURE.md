C:\Workspace\cocoya\
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
├── ui/                    # [NEW] 雙模共用前端根目錄 (Vite Project)
│   ├── index.html         # Webview 與 Tauri 共用入口
│   ├── blockly/           # Blockly 核心庫與靜態插件
│   │   ├── core/          # 核心引擎與產生器
│   │   ├── msg/           # 核心語系 (動態載入預留)
│   │   └── plugins/       # 插件 (地圖、捲動、顏色、多行文字等)
│   ├── src/               # 前端原始碼與模組 (SSOT 單一事實來源)
│   │   ├── icons/         # 工具列與功能圖示 (已從 ui/icons 遷移至此以對齊路徑)
│   │   ├── modules/       # 雙模共用積木模組目錄
│   │   │   ├── core/      # 基礎積木 (logic, loops, math, text, variables...)
│   │   │   ├── cv_basic/      # OpenCV 基礎操作
│   │   │   ├── cv_draw/       # OpenCV 繪圖標註
│   │   │   ├── ai_hand/       # MediaPipe 手勢偵測
│   │   │   ├── ai_face/       # MediaPipe 臉部網格偵測
│   │   │   ├── ai_pose/       # MediaPipe 姿勢偵測模組
│   │   │   ├── hardware/      # 基礎硬體控制
│   │   │   ├── mcu_camera/    # XIAO S3 相機與資料採集
│   │   │   ├── mcu_huskylens/ # HuskyLens AI 視覺感測器
│   │   │   └── mcu_car/       # πCar / 馬達與舵機控制
│   ├── core_manifest.json # 模組載入清單 (含路徑與平台定義│   │   │   ├── cv_*/      # AI 視覺積木 (OpenCV, MediaPipe)
│   │   │   └── hardware/  # 硬體與 MCU 控制積木
│   │   ├── bridge.js      # [NEW] CocoyaBridge 通訊抽象層 (封裝 vscode/tauri 差異)
│   │   ├── main.js        # Webview 進入點 (對接 CocoyaBridge)
│   │   ├── module_loader.js # 動態模組載入器
│   │   ├── ui_manager.js  # UI 渲染與互動管理器 (CocoyaUI)
│   │   ├── utils.js       # 通用工具庫 (NaN 攔截、搜尋引擎、產生器覆寫)
│   │   ├── style.css      # 主樣式表
│   │   ├── zh-hant.js     # 核心語系檔
│   │   ├── en.js          # 核心語系檔
│   │   └── core_manifest.json # 模組載入清單
│   ├── package.json       # Vite 設定
│   └── vite.config.js     # Vite 建置配置
├── src/                   # Extension 後端 (TypeScript)
│   └── extension.ts       # 擴充功能管理器 (處理 ui/ 目錄資源映射)
├── src-tauri/             # [NEW] Tauri 後端 (Rust)
│   ├── src/               # Rust 指令與系統集成
│   └── tauri.conf.json    # Tauri 配置
├── resources/             # 延伸模組靜態資源
│   └── deploy_mcu.py      # CircuitPython 部署輔助腳本
├── temp_scripts/          # 執行期間暫存目錄
├── LICENSE.md             # MIT License
├── README.md              # 專案說明文件
├── package.json           # VS Code 插件配置
└── tsconfig.json          # TS 編譯設定
