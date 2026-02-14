C:\Workspace\cocoya\
├── docs/                  # 專案文檔
│   └── system_spec.html   # 系統規格說明書 (電子書)
├── log/                   # 專案日誌與任務追蹤
│   ├── details.md         # 技術細節與 API 踩坑紀錄
│   ├── handover.md        # 任務交接檔
│   ├── todo.md            # 任務清單
│   └── work/              # 每日工作紀錄
├── media/                 # Webview 前端資源
│   ├── blockly/           # Blockly 核心庫與插件
│   ├── core_modules/      # 內建積木模組 (math, text, logic, etc.)
│   ├── icons/             # 工具列與功能圖示
│   ├── core_manifest.json # 模組載入清單
│   ├── index.html         # 主介面 (雙欄佈局 + 工具列)
│   ├── main.js            # Webview 進入點 (CocoyaApp)
│   ├── module_loader.js   # 動態模組載入器
│   ├── ui_manager.js      # UI 渲染與互動管理器 (CocoyaUI)
│   ├── utils.js           # 通用工具庫 (Mutator, ID Parser)
│   ├── zh-hant.js         # 正體中文語系
│   └── en.js              # 英文語系
├── src/                   # Extension 後端 (TypeScript)
│   └── extension.ts       # 擴充功能管理器 (CocoyaManager)
├── temp_scripts/          # 執行期間暫存目錄
├── LICENSE.md             # MIT License
├── README.md              # 專案說明文件
├── package.json           # 插件配置與依賴
└── tsconfig.json          # TS 編譯設定
