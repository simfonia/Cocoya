C:\Workspace\cocoya\
├── docs/                  # 專案文檔
│   └── system_spec.html   # 系統規格說明書 (電子書)
├── examples/              # 範例檔
├── log/                   # 專案日誌與任務追蹤
│   ├── details.md         # 技術細節與 API 踩坑紀錄
│   ├── handover.md        # 任務交接檔
│   ├── todo.md            # 任務清單
│   └── work/              # 每日工作紀錄
├── media/                 # Webview 前端資源
│   ├── blockly/           # Blockly 核心庫與插件
│   ├── icons/             # 工具列與功能圖示
│   ├── modules/           # 統一模組目錄
│   │   ├── core/          # 基礎積木 (logic, loops, math, etc.)
│   │   ├── cv_basic/      # OpenCV 基礎操作
│   │   ├── cv_draw/       # OpenCV 繪圖標註
│   │   ├── ai_hand/       # MediaPipe 手勢偵測
│   │   ├── ai_face/       # MediaPipe 臉部網格偵測
│   │   ├── ai_pose/       # MediaPipe 姿勢偵測模組
│   │   └── hardware/      # CircuitPython 硬體控制
│   ├── core_manifest.json # 模組載入清單 (含路徑定義)
│   ├── index.html         # 主介面
│   ├── main.js            # Webview 進入點 (CocoyaApp)
│   ├── module_loader.js   # 動態模組載入器 (平行載入 & 分散 i18n)
│   ├── ui_manager.js      # UI 渲染與互動管理器 (CocoyaUI)
│   ├── utils.js           # 通用工具庫 (Mutator, ID Parser)
│   ├── zh-hant.js         # 核心語系檔 (UI 與分類文字)
│   └── en.js              # 核心語系檔 (UI 與分類文字)
├── resources/             # 延伸模組靜態資源
│   └── deploy_mcu.py      # CircuitPython 部署與監控輔助腳本
├── src/                   # Extension 後端 (TypeScript)
│   └── extension.ts       # 擴充功能管理器 (CocoyaManager 類別)
├── temp_scripts/          # 執行期間暫存目錄
├── LICENSE.md             # MIT License
├── README.md              # 專案說明文件
├── package.json           # 插件配置與依賴
└── tsconfig.json          # TS 編譯設定

