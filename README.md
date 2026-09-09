# Cocoya: Code, Compute, Yield AI

Cocoya 是一個專為 AI 教育設計的視覺化程式設計工具。它結合了 **Blockly** 的易用性與 **Python (OpenCV / MediaPipe)** 的強大能力，讓學生能快速從積木邏輯跨越到真實的 AI 視覺應用。

Cocoya 採用**混合架構 (Hybrid)**：同一份前端 SSOT 同時服務 **VS Code Extension** 與 **Tauri 2.0 桌面應用**，能為 PC 端產生 Python (AI)、為 MCU 端產生 MicroPython (Hardware) 代碼，並透過 USB Serial 通訊。

---

## 🚀 核心特色

- **雙欄即時預覽**：積木與 Python 程式碼即時同步，支援語法高亮與**雙向點擊定位**——點積木可定位並高亮對應程式碼行，點程式碼行亦可捲動並選取對應積木。
- **AI 視覺整合**：MediaPipe (Face Mesh / Hand Tracking / Pose) 與 OpenCV，提供影像分類、物件偵測、姿勢辨識積木。
- **Dataset Manager**：內建資料集管理（影像採集、標註、模型訓練與 .tflite 匯出），支援本地與 DGX 遠端訓練。
- **硬體橋樑**：PC 與 MCU (MicroPython) 之間透過 Serial (USB) 通訊與部署。
- **多硬體支援**：可直接辨識與部署多種開發板（見下）。

## 🧩 硬體支援

| 平台 | 說明 |
|---|---|
| Raspberry Pi Pico W | MicroPython (Raw REPL) |
| Maker Pi RP2040 | MicroPython，含 mcu_car 車控積木 |
| XIAO ESP32-S3 Sense | MicroPython |
| Micro:bit V1/V2 | MicroPython |
| LEGO SPIKE Prime | Pybricks 韌體專屬部署器 |

> 開發板偵測與腳位映射以 `ui/src/modules/hardware/board_defs.js` 為單一事實來源 (SSOT)。

## 🛠 技術架構

- **混合雙模**：VS Code Extension（`src/`）+ Tauri 2.0 桌面應用（`src-tauri/`），共用同一份前端。
- **前端 SSOT**：`ui/src/` 下的 `app/`（核心）、`ui/`（介面）、`utils/`（Blockly 攔截）、`modules/`（積木模組）。
- **通訊抽象化**：前端經由 `CocoyaBridge`（`ui/src/bridge/`）與後端通訊，以 `bridge.capabilities` 查詢能力差異，禁止直接呼叫環境專屬 API。
- **Blockly**: 視覺化積木引擎。
- **Python 3**: 執行端環境（MediaPipe / OpenCV / TensorFlow）。
- **Python Sidecar**: `resources/` 下的 sidecar 進程負責資料集存取、攝影機服務與 AI 特徵提取。
- **模組動態載入**: 支援內建模組快取機制。

## 📂 專案結構

- `src/`: VSIX Extension Host 端 TypeScript code。
- `src-tauri/`: Tauri 2.0 Rust 後端。
- `ui/src/`: Webview 前端資源（雙模共用 SSOT）。
    - `app/`: 應用核心（config / persistence / workspace / lifecycle / controller）。
    - `ui/`: 通用 UI 邏輯（工具列 / 硬體 / 對話框 / 終端機等）。
    - `utils/`: Blockly 攔截（core / generators / toolbox / mutator / search）。
    - `modules/`: 積木模組（hardware、spike、mcu_car、ai_inference、dataset_manager、theme_manager、core、ai_face、ai_hand、ai_pose、cv_basic、cv_draw、mcu_camera、mcu_huskylens 等）。
- `resources/`: 靜態資源、Python sidecar、訓練模板、部署器 (`deploy/`)。
- `examples/`: 範例 (.xml)。
- `docs/`: 系統規格書、API 清單與開發文件。
- `log/`: 開發紀錄、任務清單 (`todo.md`)、現況快覽 (`COCOYA_STATE.md`) 與知識蒸餾 (`KNOWLEDGE_BASE.md`)。

## 🛠 開發與打包

### VS Code Extension
```bash
npm install
npm run compile    # 編譯 TypeScript
npx vsce package   # 打包 VSIX
```

### Tauri 桌面應用
```bash
npm run tauri dev     # 開發模式（等價 cargo tauri dev）
npm run tauri build   # 建置與打包安裝檔
```

### 前端 (ui/)
```bash
npm run dev          # 開發伺服器
npm run build        # 建置 (vite)
```

## 📜 授權協定

本專案採用 [MIT License](LICENSE.md) 授權。

---
*Powered by simfonia & AI*
