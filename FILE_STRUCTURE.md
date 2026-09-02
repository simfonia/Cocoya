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
│   │   ├── py_ai_pose_calc_angle_zh-hant.html # [NEW] 三點夾角積木說明 (計算內/外/符號角)
│   │   └── py_ai_pose_calc_angle_en.html     # [NEW] Angle of 3 Points block help
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
│   ├── AI_01_classifier/   # AI 影像分類控制 πCar
│   ├── AI_02_detector_pan_tilt/ # [NEW] 物件偵測追蹤雲台範例
│   │   ├── 01_README.md    # 完整 PBL 說明文件
│   │   ├── 02_PC_train.xml # 物件偵測訓練積木
│   │   ├── 03_PC_inference.xml # PC 端推論與視覺化
│   │   └── 04_MCU_tracking.xml # MCU 端雲台追蹤控制
│   ├── AI_03_Pose_EZ_Robot/   # AI 姿勢辨識，雙手肘角度控制小機器人
│   └── AI_04_Pose_piCar/   # AI 姿勢辨識控制 πCar
├── log/                   # 專案日誌與任務追蹤
│   ├── details.md         # 技術細節與 API 踩坑紀錄
│   ├── handover.md        # 任務交接檔
│   ├── todo.md            # 任務清單
│   ├── todo/              # 任務規格與開發流程文件
│   │   ├── dataset_manager_development_spec.md # Dataset Manager 分階段開發規格
│   │   └── hand_gesture_pitch_pbl_plan.md # 手勢分類控制 πCar 音高 PBL 計畫
│   ├── plan/              # 開發方案與架構決策 (Markdown)
│   │   ├── StartupProjectAnchoring.md # 啟動專案錨定 + Startup Home 計畫
│   │   ├── StartupHomePlatformAndExamples.md # [NEW] Startup Home 平台選擇 + 範例 + 設定計畫
│   │   ├── DatasetManagerProgressAndGuardrails.md # Dataset Manager 進度與防呆
│   │   ├── DatasetManagerUXImprovement.md # Dataset Manager UX 改善
│   │   ├── BboxAnnotationUIImprovement.md # BBox 標註 UI 改善
│   │   ├── DatasetManagerOptimization.md # Dataset Manager 優化
│   │   ├── ObjectDetectorTrain.md # 物件偵測訓練計畫
│   │   └── openTrainingReport.md # 開啟訓練報告計畫
│   ├── work/              # 每日工作紀錄
│   │   ├── 2026-05-03.md  # UI/UX 響應式佈局與收合面板實作
│   │   ├── 2026-05-04.md  # 重大修復：Tauri 多視窗關閉攔截與備份隔離
│   │   ├── 2026-05-08.md  # [NEW] 建置自動化與 Rust 後端模組化
│   │   ├── 2026-05-31.html # [NEW] 系統還原診斷與 Sidecar 架構 #trim 修整
│   │   ├── 2026-06-04.html # [NEW] 優化專案指南與規範同步
│   │   ├── 2026-06-05.html # [NEW] 初始化今日日誌與開發 context
│   │   ├── 2026-06-24.html # Phase 5 MVP 驗證 + DGX Spark Docker 建置
│   │   ├── 2026-08-06.md  # [NEW] BBox 標註 UI 重構（全寬 3 欄布局）
│   │   ├── 2026-08-07.md  # [NEW] BBox 標註 UI 除錯（Tauri/VSIX 雙平台驗證通過）
│   │   ├── 2026-08-20.md  # [NEW] Tauri 多視窗 terminal/serial 隔離 + 視窗焦點交接（方案 B）
│   └── mappings/          # 長期結構化知識庫（對照表）
│       ├── cocoya_ssh_sftp_api.html # SSH/SFTP API 使用對照表
│       ├── Framework_API_Index.html # Framework API 索引 (含 findLocatableBlock)
│       ├── DatasetManager.html      # Dataset Manager API 對照表（公開 API/UI 模式分流/路徑政策；遠端節已標記前端移除後端保留）
│       ├── DatasetManager_DevGuide.html # [NEW Stage 6] Dataset Manager 開發手冊 SOP（新增資料集類型/i18n key/--dsm-* token 三處同步/bridge adapter/錯誤碼契約/測試）
│       ├── Tauri_Sidecar_API.html   # Tauri Sidecar API 使用對照表
│       └── Renderer_API.html        # UI Renderer API (syncSelection, findLocatableBlock)
│       └── ThemeManager.html        # [NEW] 主題管理模組對照表（API/主題定義格式/reloadWebview 鏈/新增主題 SOP）


├── ui/                    # 雙模共用前端根目錄 (Vite Project)
│   ├── index.html         # Webview 與 Tauri 共用入口
│   ├── vite.config.js     # Vite 配置 (含資產同步外掛)
│   ├── favicon.ico        # 本地圖示以解決 404 報錯
│   ├── blockly/           # Blockly 核心庫與靜態插件
│   ├── src/               # 前端原始碼與模組 (SSOT 單一事實來源)
│   │   ├── bridge/      # 通訊橋樑子模組
│   │   │   ├── base.js    # 橋接基底類別 (含 saveDatasetProgress/loadDatasetProgress 便捷方法 [NEW])
│   │   │   ├── tauri.js   # Tauri 專屬橋接 (含介面適配；datasetSaveProgress/datasetLoadProgress 路由 [NEW])
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
│   │   │   ├── theme_manager/ # [NEW] 主題管理模組（registry + 模式切換 + 系統深淺色偵測）
│   │   │   │   ├── theme_manager.js # 核心：registerTheme/getThemes/setMode/getMode/apply/startWatching (window.CocoyaTheme)
│   │   │   │   └── themes/    # 內建主題（一主題一檔，載入時 registerTheme）
│   │   │   │       ├── cocoya_light.js # 淺色主題 (Blockly Classic + 淺色 cssVars)
│   │   │   │       └── cocoya_dark.js  # 深色主題 (Blockly Theme componentStyles + 深色 cssVars, hideGrid)
│   │   │   ├── ai_inference/ # AI 訓練與推論積木模組
│   │   │   │   └── ai_inference_generators.js # 訓練/推論積木 Python 產生器（多候選路徑搜尋，候選 0 讀 COCOYA_TRAIN_TEMPLATES env）
│   │   │   ├── ai_pose/            # AI 姿勢偵測積木模組 (MediaPipe Pose)
│   │   │   │   ├── ai_pose_blocks.js      # 積木定義 (含 py_ai_pose_calc_angle [NEW])
│   │   │   │   ├── ai_pose_generators.js  # Python 產生器 (含 cocoya_calc_angle_3pts [NEW])
│   │   │   │   ├── toolbox.xml             # 工具箱 (含 calc_angle 示範積木 [NEW])
│   │   │   │   └── i18n/
│   │   │   │       ├── zh-hant.js          # 繁體中文 (含 AI_ANGLE_* [NEW])
│   │   │   │       └── en.js               # English (含 AI_ANGLE_* [NEW])
│   │   │   └── dataset_manager/ # Dataset Spec 與資料集管理器應用層模組
│   │   │       ├── core/      # 純資料規則層，禁止依賴 DOM、Bridge、window 與 i18n
│   │   │       │   ├── labelMap.js # label map 清理、建立與下一個類別 id
│   │   │       │   ├── projectNaming.js # 專案名稱純函式清理與比較
│   │   │       │   ├── pathPolicy.js # 專案名稱與路徑安全規則（canonical path 組裝、containment、traversal 防護）
│   │   │       │   ├── pathPolicy.test.mjs # path contract Node 測試（node --test 執行，不打包）
│   │   │       │   ├── stats.js # 影像、bbox、line 統計純計算
│   │   │       │   └── state.js # DatasetStore 與初始狀態（逐步接入中）
│   │   │       ├── io/
│   │   │       │   ├── bridge.js # [Stage 2] Dataset Manager 唯一 Bridge Port（request correlation、timeout、cancel、subscribe/unsubscribe、dispose；雙平台單一通道）
│   │   │       │   └── bridge.test.mjs # Bridge Port fake transport Node 測試（node --test 執行）
│   │   │       ├── application/
│   │   │       │   ├── progressUseCases.js # [Stage 3] 進度存讀與自動落盤 use-case（load/save/autosave/cancelAutoSave；注入 UI 依賴，通訊經 io/bridge.js）
│   │   │       │   ├── importUseCases.js # [Stage 3] 資料匯入 use-case（parseDataFileRows 純轉換 + importDataFile/importDirectory 編排；canonical 匯入閘語意不變）
│   │   │       │   ├── importUseCases.test.mjs # parseDataFileRows Node 測試（node --test 執行）
│   │   │       │   ├── exportUseCases.js # [Stage 3] 匯出 use-case（未標註/未分類確認 + Spec 驗證 + datasetExport correlation 編排）
│   │   │       │   ├── annotationMutations.js # [Stage 3] 標註/分類 mutation 純函式（計數、class_id 過濾、label→unlabeled、刪除索引解析）
│   │   │       │   └── annotationMutations.test.mjs # annotationMutations Node 測試（node --test 執行）
│   │   │       ├── ui/
│   │   │       │   ├── form.js # [Stage 4 切片 3] 表單讀取 Presenter（createFormPresenter({getModalRoot})→{getFormValue,getColumnsFromUI,dispose}；唯讀、modal root 可注入）
│   │   │       │   ├── form.test.mjs # form presenter Node 測試（node --test 執行）
│   │   │       │   ├── thumbnails.js # [Stage 4 切片 4] 縮圖網格 scroll save/restore 集中管理（createGridScrollManager({state,getContainer,hasImages})；沿用 state._savedGridScrollTop、契約不變）
│   │   │       │   ├── thumbnails.test.mjs # grid scroll manager Node 測試（node --test 執行）
│   │   │       │   ├── classification.js # [Stage 4 切片 5] 分類校正模式狀態機 controller（createClassificationController；enter/load/renderControls/updateProgress/鍵盤 bind-unbind/dispose；依賴全注入、沿用 state.annotationMode）
│   │   │       │   ├── classification.test.mjs # classification controller Node 測試（node --test 執行）
│   │   │       │   ├── annotation.js # [Stage 4 切片 6] bbox/line 標註模式編排 controller（createAnnotationController；enter/load(UICanvas.init+debounce 落盤)/renderControls/renderListUI/progress/畫布鍵盤/delete/saveCurrentAnnotations/dispose；mutation 純函式 import application/annotationMutations.js；分流與 exit 留協調層）
│   │   │       │   ├── annotation.test.mjs # annotation controller Node 測試（node --test 執行）
│   │   │       │   ├── panels.js # [Stage 4 切片 7] 面板呈現 Presenter（createPanelsPresenter；renderColumnRow/renderValidation/renderPreviewTable/addColumn/renderAllColumns/dispose；唯呈現層、refreshDynamicPanels 留協調層）
│   │   │       │   ├── panels.test.mjs # panels presenter Node 測試（node --test 執行）
│   │   │       │   ├── modal.js # [Stage 4 切片 2] Modal 模板純函式 buildModalTemplate（注入 t/optionList/projectTypes/sourceModes；無 DOM 副作用）
│   │   │       │   ├── modal.test.mjs # buildModalTemplate Node 測試（node --test 執行）
│   │   │       │   ├── statusMessage.js # [Stage 4 切片 1] 集中式狀態訊息 Presenter（createStatusMessageUI→{showStatusMessage,dispose}；計時器重置/dispose 語意自 ui_layout 抽出，契約不變）
│   │   │       │   └── statusMessage.test.mjs # statusMessage 行為契約 Node 測試（node --test 執行）
│   │   │       ├── dataset_manager.css # Dataset Manager Modal、縮圖牆與標註畫布樣式 (含 3 欄標註模式、.dataset-name-warning 名稱衝突警示)
│   │   │       ├── i18n.js # [NEW] 共享 i18n t() 函式庫 (支援佔位符替換)
│   │   │       ├── index.js # 靜態 ESM 入口與 window.CocoyaDataset API 掛載（loadI18n 以 in-flight promise 防 locale race，Stage 5 收尾）
│   │   │       ├── spec.js  # DatasetSpec 類別、Schema 偵測、強健型 CSV 解析與驗證邏輯 (i18n 化)
│   │   │       ├── sampler.js # [Stage 2 重構] 攝影機採集核心、連拍邏輯（通訊改經 io/bridge.js：request correlation + timeout + dispose）
│   │   │       ├── ui_layout.js # 協調層（Stage 4）：modal 生命週期、面板編排 refreshDynamicPanels、模式進入/退出分流；同名委派 wrapper 呼叫 core/application/ui/* presenter（呼叫點零改動），死 wrapper 已於 Stage 6 清理
│   │   │       ├── ui_components.js # 動態視圖組件 (影像網格、字典序標籤統計、標註縮圖欄、getLabelColor FNV-1a+黃金角色相，含 XSS 防護)
│   │   │       ├── ui_canvas.js # 標註互動畫布 (物件偵測拉框與自駕循線畫線，支援座標限幅防護、bbox 高亮與雙模互動)
│   │   │       └── i18n/      # 語系檔目錄
│   │   │           ├── zh-hant.js # 繁體中文 i18n 鍵值 (VALIDATE_* 驗證、ANNOTATION_* 標註、NEED_ANCHOR/IMPORT_* 匯入閘、SOURCE_* 來源對齊；118 key 與 en 完全 parity)
│   │   │           └── en.js      # 英文 i18n 鍵值 (同 zh-hant 118 key 全對齊)
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
│       ├── datasetOps.ts    # 資料集：capture/export/upload/scan/pickFolder + SaveProgress/LoadProgress 存讀 [NEW]
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
│           ├── mod.rs       # 指令集匯出
│           ├── python.rs    # Python 執行與環境診斷（注入 UTF-8 編碼與 COCOYA_TRAIN_TEMPLATES 環境變數）
│           ├── file.rs      # 檔案讀寫、備份與鎖定 (+ dataset_save_progress/dataset_load_progress 進度存讀 [NEW] + 內建範例唯讀保護：Release 開啟時確認後複製範例專案到 Documents\Cocoya\Projects)
│           ├── mcu.rs       # 硬體通訊、韌體與序列埠
│           ├── app.rs       # 視窗控制與系統資訊
│           ├── dataset.rs   # [NEW] Sidecar 通訊 (start/send/stop)
│           └── training.rs  # [NEW] 訓練報告開啟 (open_report, find_latest_training_report)
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
│   │   ├── common/        # 共同模組（重命名為任務前綴 + 共用功能）
│   │   │   ├── __init__.py            # 模組包
│   │   │   ├── classifier_dataset.py  # 分類資料集載入、驗證、分割、擴增
│   │   │   ├── classifier_model.py    # 分類模型建立、backbone 管理、FC 層自訂
│   │   │   ├── detector_dataset.py    # [NEW] YOLO 格式資料載入、bbox 解析
│   │   │   ├── detector_model.py      # [NEW] 物件偵測回歸模型（MobileNetV2 + Dense(4, sigmoid)）
│   │   │   ├── training_loop.py       # 訓練迴圈、class weight、優化器選擇（共用）
│   │   │   ├── model_export.py        # TFLite 轉換、模型儲存（共用）
│   │   │   └── training_report.py     # 訓練曲線繪製、HTML 報告產生（共用）
│   │   ├── classifier/
│   │   │   └── classifier_train.py    # 分類訓練腳本（使用 common 模組）
│   │   └── detector/
│   │       └── detector_train.py      # [NEW] 物件偵測訓練腳本（單一目標，MSE loss）
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
└── tsconfig.json          # TS 編譯設定ui/src/modules/theme_manager/themes/cocoya_dark.js # [REFACTORED] 完全自足深色主題：componentStyles+cssVars+css（主題專屬規則由 ThemeManager 注入 <style>，style.css 不再含任何深色規則）

| log/KNOWLEDGE_BASE.md | 知識蒸餾基礎（2026-08-24）：十章整理重大技術、開發鐵律、踩坑快查表與過時知識校正；關鍵點已對照現行程式碼求證 |
