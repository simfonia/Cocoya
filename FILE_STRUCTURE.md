C:\Workspace\cocoya\
├── .vscodeignore          # VSIX 打包過濾清單
├── docs/                  # 專案文檔
│   ├── help/              # 積木說明文件與腳位圖（右鍵 Help 統一位置）
│   │   ├── hardware_pins_en.html        # 硬體腳位說明（英文）
│   │   ├── hardware_pins_zh-hant.html   # 硬體腳位說明（繁體中文）
│   │   ├── pico-w_pinout.png            # Raspberry Pi Pico W 腳位圖
│   │   ├── XIAO-ESP32-S3_pinout.jpg     # XIAO ESP32 S3 腳位圖
│   │   ├── py_ai_train_run_zh-hant.html     # AI 訓練積木說明
│   │   ├── py_ai_model_init_zh-hant.html    # 模型初始化積木說明
│   │   ├── py_ai_model_predict_zh-hant.html # 推論積木說明
│   │   ├── py_ai_get_label_zh-hant.html     # 取得標籤積木說明
│   │   ├── py_ai_get_confidence_zh-hant.html # 取得信心度積木說明
│   │   ├── py_ai_get_bbox_zh-hant.html      # 取得邊界框積木說明
│   │   └── py_ai_get_direction_zh-hant.html # 取得方向積木說明
│   ├── system_spec.html   # 系統規格說明書 (v5.0 雙模架構版)
│   ├── api_manifest.md    # 前端 API SSOT (Source of Truth)
│   ├── backend_api_manifest.md # [NEW] 後端 Rust API SSOT
│   ├── mvp_development_guide.md # AI 模組開發規範與踩坑記錄
│   ├── docker_training_deployment_guide.html # DGX Docker 訓練容器建置指南
├── examples/              # 範例檔 (.xml)
│   ├── basic/              # Python 入門範例（MicroPython MCU 模式）
│   │   ├── 01_Hello Cocoya.xml  # 基礎 Hello World (print + sleep)
│   │   ├── 02_for loop.xml      # for 迴圈入門
│   │   ├── 03_for_loop_LED.xml  # for 迴圈 LED 跑馬燈
│   │   ├── 04_while_button_buzzer.xml # while 迴圈 + 按鈕控制蜂鳴器
│   │   ├── 05_multi_if_buttons.xml   # 多個 if (多選) 按鈕控制
│   │   ├── 06_if_elif_else_priority.xml # if-elif-else (單選) 條件攔截
│   │   ├── 07_variables_counter.xml   # 變數計數器 (累加式 LED)
│   │   └── 08_functions_light_show.xml # 函式定義與聲光表演
│   ├── πCar/               # πCar 小車控制範例
│   ├── AI_01_Pose_piCar/   # AI 姿勢辨識控制 πCar
│   └── AI_02_classifier/   # AI 影像分類控制 πCar
├── log/                   # 專案日誌與任務追蹤
│   ├── details.md         # 技術細節與 API 踩坑紀錄
│   ├── handover.md        # 任務交接檔
│   ├── todo.md            # 任務清單
│   ├── todo/              # 任務規格與開發流程文件
│   │   ├── dataset_manager_development_spec.md # Dataset Manager 分階段開發規格
│   │   └── hand_gesture_pitch_pbl_plan.md # 手勢分類控制 πCar 音高 PBL 計畫
│   ├── work/              # 每日工作紀錄
│   │   ├── 2026-05-03.md  # UI/UX 響應式佈局與收合面板實作
│   │   ├── 2026-05-04.md  # 重大修復：Tauri 多視窗關閉攔截與備份隔離
│   │   ├── 2026-05-08.md  # [NEW] 建置自動化與 Rust 後端模組化
│   │   ├── 2026-05-31.html # [NEW] 系統還原診斷與 Sidecar 架構 #trim 修整
│   │   ├── 2026-06-04.html # [NEW] 優化專案指南與規範同步
│   │   ├── 2026-06-05.html # [NEW] 初始化今日日誌與開發 context
│   │   └── 2026-06-24.html # Phase 5 MVP 驗證 + DGX Spark Docker 建置
│   └── mappings/          # 長期結構化知識庫（對照表）
│       └── cocoya_ssh_sftp_api.html # SSH/SFTP API 使用對照表


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
│   │   │   └── dataset_manager/ # Dataset Spec 與資料集管理器應用層模組
│   │   │       ├── dataset_manager.css # Dataset Manager Modal、縮圖牆與標註畫布樣式
│   │   │       ├── index.js # 靜態 ESM 入口與 window.CocoyaDataset API 掛載
│   │   │       ├── spec.js  # DatasetSpec 類別、Schema 偵測、強健型 CSV 解析與驗證邏輯
│   │   │       ├── importer.js # 影像目錄與檔案匯入解析邏輯
│   │   │       ├── sampler.js # [NEW] 攝影機採集核心、連拍邏輯與 Python 擷取備援方案
│   │   │       ├── ui_layout.js # Modal UI、動態面板管理與標註視圖切換 (含事件清理)
│   │   │       ├── ui_components.js # 動態視圖組件 (影像網格、標籤統計，含 XSS 防護)
│   │   │       └── ui_canvas.js # 標註互動畫布 (物件偵測拉框與自駕循線畫線，支援座標限幅防護與雙模互動)
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
│   ├── extension.ts       # 進入點：activate/deactivate + webview 內容組裝
│   ├── cocoyaManager.ts   # CocoyaManager 主類別 + 訊息分發
│   ├── sidecarManager.ts  # DatasetSidecarManager：Python 進程生命週期
│   └── handlers/          # 業務邏輯處理器
│       ├── trainingOps.ts   # 訓練：startTraining, openTrainingReport, openLatestTrainingReport
│       ├── fileOps.ts       # 檔案：new/open/save/saveAs/backup/recovery
│       ├── firmwareOps.ts   # 韌體：resetFirmware, eraseFilesystem, setupStableMode
│       ├── datasetOps.ts    # 資料集：capture/export/upload/scan/pickFolder
│       ├── serialOps.ts     # 序列埠：refreshPorts, serialMonitor, setPythonPath
│       └── envOps.ts        # 環境：checkEnvironment, installModule, runCode, checkUpdate
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
│   ├── firmware/          # MCU 韌體資源
│   │   └── MicroPython/   # MicroPython 韌體
│   │       ├── MakerPi_RP2040/   # 內含 .uf2
│   │       └── XIAO_ESP32_S3/    # 內含 .bin, .uf2, 及 project_config.json
│   │           ├── Sense_microPython/  # 具備相機支援的 MicroPython
│   │           └── Sense_Factory/      # 原廠出廠 C++ 韌體 (支援多段燒錄)
│   ├── deploy_mcu.py      # [OPTIMIZED] 具備硬體感知與分塊寫入的部署工具
│   └── extension_icon.png # 插件圖示
│       ├── dataset_sidecar.py   # Sidecar 主進程與指令解析
│       ├── camera_service.py    # OpenCV 攝影機預覽與擷取服務
│       ├── dataset_io.py        # 資料集檔案存取與打包工具
│       └── media_pipe_service.py # AI 特徵提取服務 (MediaPipe)
├── mvp_hand_gesture/      # Phase 5 MVP 手勢分類驗證腳本
│   ├── 01_collect_dataset.py # 本地資料收集
│   ├── 02_train_local.py    # 本地訓練 (MobileNetV2)
│   ├── 03_inference_local.py # 本地推論測試
│   ├── 04_upload_to_dgx.py  # 上傳資料集到 DGX
│   ├── 05_train_on_dgx.py   # DGX Docker 訓練
│   ├── 06_download_from_dgx.py # 下載模型
│   ├── 07_inference_with_dgx_model.py # DGX 模型推論
│   ├── 08_picar_receiver.py # πCar 接收端 (MicroPython)
│   ├── 09_full_pipeline.py  # 完整流程整合
│   ├── 訓練過程記錄.txt      # 訓練結果紀錄
│   └── model/               # 本機模型輸出目錄
│       ├── gesture_model.keras # Keras 原始模型
│       ├── gesture_model.tflite # TFLite Float32 模型
│       └── labels.txt         # 分類標籤
├── resources/             # 靜態資源
│   ├── deploy_mcu.py      # [OPTIMIZED] 具備硬體感知與分塊寫入的部署工具
│   ├── extension_icon.png # 插件圖示
│   ├── train_templates/   # AI 訓練模板（共同模組 + 任務專屬）
│   │   ├── common/        # [NEW] 共同模組
│   │   │   ├── __init__.py  # 模組包
│   │   │   ├── dataset.py   # 資料集載入、驗證、分割、擴增
│   │   │   ├── model.py     # 模型建立、backbone 管理、FC 層自訂
│   │   │   ├── training.py  # 訓練迴圈、class weight、優化器選擇
│   │   │   ├── export.py    # TFLite 轉換、模型儲存
│   │   │   └── report.py    # 訓練曲線繪製、HTML 報告產生
│   │   └── classifier/
│   │       └── classifier_train.py # [REFACTORED] 使用 common 模組 + 新參數
│   ├── dataset_manager/   # Dataset Manager 模組
│   │   └── train_templates/ # 訓練容器模板
│   │       └── classifier/  # 手勢分類訓練模板
│   │           ├── Dockerfile.train # Docker 映像定義
│   │           ├── train_classifier.py # 訓練腳本
│   │           └── requirements.txt # Python 套件需求
│   ├── dataset_sidecar.py   # Sidecar 主進程與指令解析
│   ├── camera_service.py    # OpenCV 攝影機預覽與擷取服務
│   ├── dataset_io.py        # 資料集檔案存取與打包工具
│   └── media_pipe_service.py # AI 特徵提取服務 (MediaPipe)
├── temp_scripts/          # 執行期間暫存目錄
├── package.json           # 根目錄設定
└── tsconfig.json          # TS 編譯設定