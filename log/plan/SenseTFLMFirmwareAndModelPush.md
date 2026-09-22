# Sense（XIAO ESP32-S3 Sense）C++ 韌體開發 + 模型推送通道 計畫
> 產出：2026-09-19（#task[討論Xiao ESP32S sense 接 Maker Pi RP2040 的問題] 收斂；使用者拍板 OpenMV 不考慮、走 Sense TFLM 路線）
> 狀態：**backlog（未施工）**。本檔為將來開啟任務時的單一入口（SSOT）。
> 背景：目標鏈路＝Sense 當 πCar 的「AI 眼睛」：端側推論（int8 TFLite）→ UART 指令 → Maker Pi RP2040（πCar）執行避障/抓取/追蹤/循跡。

## 0. 已定案決策（勿推翻）
1. **推論框架＝esp-tflite-micro（TFLM），非 ESP-DL**。
   - ESP-DL v3 官方 README：量化走 esp-ppq、模型格式為 `.espdl`（自 ONNX 轉），**不吃 `.tflite`**——需另建 PyTorch/ONNX 工具鏈，Cocoya 無此管線，排除。
   - TFLM（`espressif/esp-tflite-micro`）**直接吃 Cocoya 訓練管線已產的 int8 `.tflite`**（`common/model_export.py` 的 `TFLITE_BUILTINS_INT8 + uint8 in/out`），零轉檔成本；ESP-NN 優化後 ESP32-S3 Person Detection invoke 僅 54ms（官方數據）。
2. **韌體架構＝「一支通用韌體 + 外掛模型檔」**：不依任務類型重寫重燒。
   - 固定韌體：開鏡頭 → resize(模型輸入尺寸) → TFLM invoke → 依 `model.json` 的 `task_type` 格式化 → UART 送出。
   - 換模型＝推送 `model.tflite` + `labels.txt` + `model.json` 三檔（秒級），不需重編譯。
   - 複合任務（雙模型融合）＝韌體 v2 一次寫好通用支援，backlog。
3. **積木分工**：Sense 端程式是固定 C++ 韌體模板，使用者**不在 Cocoya 寫 C++**；Cocoya 負責上游（DM 採集 → `py_ai_train_run` 訓練 → 模型推送）。
4. **訓練積木（A 案）**：`py_ai_train_run` 新增兩欄位——「輸入尺寸（96/128/160/224）」＋「部署目標（PC/Sense）」；`MODEL_OUTPUT` 下拉**不動**。選 Sense 時套約束（見 §2 P1）。
5. **接線（已依兩份規格書驗證）**：Sense D6/D7（UART）↔ Maker Pi Grove1（GP0=TX/GP1=RX）交叉；共地；Sense 不得取電 Grove 3V3（Maker Pi Table 2：3V3 軌上限 300mA）；Sense 供電採背面 BAT+/- 焊 3.7V 小鋰電池（方案 A）。πCar 電池 >6V 不得進 Vin 端子（Vin 上限 6V）。
6. UART 通訊協定（Sense→Pi，9600~115200）：`CLS:<label>:<conf>\n`／`DET:x=<cx>,y=<cy>,s=<score>\n`（正規化座標）／`LINE:x1=,y1=,x2=,y2=\n`／`HB:ok\n` 心跳。

## 1. 已驗證規格證據（2026-09-19 查證）
| 項目 | 結論 | 來源 |
|---|---|---|
| ESP-DL 不吃 tflite | esp-ppq 從 ONNX 量化成 `.espdl`（FlatBuffers） | github.com/espressif/esp-dl README |
| TFLM 支援 S3 | ESP-NN：S3 person_detection 2300ms→**54ms**（240MHz） | github.com/espressif/esp-tflite-micro README |
| Sense 規格 | ESP32-S3R8 雙核 240MHz、8MB PSRAM+8MB Flash、OV2640（新版 OV3660）、SD、WiFi+BLE5 | Seeed wiki（XIAO ESP32-S3 Getting Started） |
| Maker Pi 3V3 上限 | Total +3V3 Output Current = 300mA | Cytron MAKER-PI-RP2040 Datasheet Rev1.2 Table 2 #11 |
| Maker Pi Vin 上限 | 3.6~6V；馬達真值表 Low/Low=Brake、High/High=Coast（與 mcu_car_generators 一致） | 同上 Table 2 #1、Table 3 |
| Grove 表 | Grove1=UART0(GP0/GP1)、Grove4 亦標 UART0（共用）、GP26 同列 Grove5/6 | 同上 Table 1（與 board_defs.js 一致） |
| int8 產檔 | `classifier_train.py` `--model_output int8` + representative 量化已可用 | `resources/train_templates/classifier/classifier_train.py` L78/175 |

## 2. 分階段施工計畫
### P0｜TFLM Spike（先驗證再投入）
- [ ] Sense 刷 esp-tflite-micro person_detection 範例（ESP-IDF ≥5.3），實測 128×128 輸入 int8 分類模型：invoke 時間、剩餘 RAM（目標 >5fps、RAM 餘 >1MB）。
- [ ] 驗證 OV2640/OV3660 在 IDF esp_camera 驅動下取幀 → uint8 量化輸入的前處理管線。
- **Gate**：不達標回到此處重新評估（後備：MobileNetV2 alpha 縮小或 96 輸入）。

### P1｜訓練端積木（A 案）
- [ ] `ai_inference_blocks.js`：`py_ai_train_run` 進階區新增 `IMG_SIZE` dropdown（96/128/160/224，預設 224）＋ `DEPLOY_TARGET`（pc/sense）。
- [ ] `ai_inference_generators.js`：`--img_size` 參數；sense 時自動 `--model_output int8`＋尺寸約束。
- [ ] `classifier/detector/line_follower_train.py`：IMG_SIZE 由寫死 224 改吃 `--img_size`（貫穿 load_dataset→build_model→export；三模板同改）。
- [ ] Sense 目標約束：模型大小 >500KB 警告；匯出附 `model.json`（task_type、img_size、normalization、labels、量化參數）。
- [ ] 測試：本地訓練 128 輸入 int8 → 檔案/labels/model.json 齊；f32/int8 前處理一致（防 representative 值域坑，見 KNOWLEDGE_BASE §11.4）。

### P2｜通用韌體模板
- [ ] `resources/firmware/Arduino/Sense_TFLM/`：esp_camera + TFLM interpreter + UART 傳送 + `model.json` 解析（classifier/detector/line_follower 三條輸出格式化路徑）。
- [ ] 模型檔讀取：SPIFFS/LittleFS 或 SD 卡分區。
- [ ] 編譯指南文件（ESP-IDF 版本 pin、分區表、flash 指令）。

### P3｜模型推送通道
- [ ] `resources/deploy/` 新增 Sense 部署器（工廠 `get_deployer()` 註冊）：偵測 VID/PID 303A:* → esptool 或自訂 CLI 推 `.tflite`/`labels.txt`/`model.json`。
- [ ] 前端「部署到 Sense」按鈕（與 MCU 部署按鈕分流，依 `py_ai_train_run` 的 DEPLOY_TARGET）。
- [ ] `docs/backend_api_manifest.md` 同步新指令。

### P4｜UART 橋與 πCar 端
- [ ] hardware 模組新增 `mcu_uart_read_line` 等積木（解析 `CLS:/DET:/LINE:`）。
- [ ] 範例：AI_05_Sense_piCar（避障/追蹤/循線各一 XML）。

### P5｜雙平台實機
- [ ] VSIX+Tauri：採集→訓練(128)→推送→車跑全程；i18n parity；FILE_STRUCTURE/todo 收斂。

## 3. 風險
| 風險 | 對策 |
|---|---|
| TFLM op 不支援（MobileNetV2 算子多數支援，仍有殘漏） | P0 spike 先實測；失敗改 alpha 較小的 backbone 或 esp-dl 路線重啟評估 |
| 128 輸入準確率下降（尤其偵測/循線） | 場地實測；必要時 160/224 + 減層取捨 |
| 模型推送佔用序列埠與 serial monitor 衝突 | 沿用 serial_monitors 失焦釋放機制 |
| Sense 供電（馬達壓降） | 獨立 3.7V 電池（BAT 焊盤）；合併供電須實測不重啟 |
| ESP-DL 誘惑（效能更好） | 僅當 TFLM op 缺口無法繞過才重評估；須建 esp-ppq 工具鏈 |

## 4. 同場評估紀錄（2026-09-19）
- HuskyLens 2：官方協定保留 Algorithm ID 128-255「User installed model」，但**無公開安裝工具/格式文件**；已另案進行 Cocoya `mcu_huskylens` 模組 V1/V2 通用升級（見 log/work/2026-09-19.md）。未來 DFRobot 開放自訂模型後可加「模型安裝」積木閉環。
- OpenMV RT1062/H7 Plus：MicroPython 原生 `ml` 模組可直接跑 int8 tflite，契合度最高——**使用者拍板太貴不考慮**。
- M5Stack CoreS3：0.3MP GC0308 鏡頭不足；Grove Vision AI V2：Edge Impulse 管線脫鉤 Cocoya——皆排除。
