C:\Workspace\cocoya\
├── log/                   # 專案日誌與任務追蹤
│   ├── details.md         # 技術細節與 API 踩坑紀錄
│   ├── handover.md        # 任務交接檔
│   ├── todo.md            # 任務清單
│   └── work/              # 每日工作紀錄
├── media/                 # Webview 前端資源
│   ├── blockly/           # Blockly 核心庫與插件
│   ├── core_modules/      # 內建積木模組 (math, text, logic, etc.)
│   │   ├── functions/     # 函式與程式入口模組 (New!)
│   │   ├── math/          # 算術模組
│   │   ├── variables/     # 變數模組 (Engineer Style)
│   │   └── ...
│   ├── core_manifest.json # 模組載入清單
│   ├── index.html         # 主介面 (雙欄佈局)
│   ├── main.js            # Webview 進入點與事件調度
│   ├── module_loader.js   # 動態模組載入器
│   ├── ui_manager.js      # 代碼預覽渲染與高亮庫 (New!)
│   ├── utils.js           # 通用工具庫 (New!)
│   ├── zh-hant.js         # 正體中文語系
│   └── en.js              # 英文語系
├── src/                   # Extension 後端
│   └── extension.ts       # VS Code 擴充功能進入點 (含 Prompt 橋樑)
├── package.json
└── tsconfig.json
