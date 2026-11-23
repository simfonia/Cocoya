# Cocoya: Code, Compute, Yield AI

Cocoya 是一個專為 AI 教育設計的視覺化程式設計工具。它結合了 **Blockly** 的易用性與 **Python (OpenCV / MediaPipe)** 的強大能力，讓學生能快速從積木邏輯跨越到真實的 AI 視覺應用。

Cocoya 採用 Tauri 2.0 桌面應用架構，能為 PC 端產生 Python (AI)、為 MCU 端產生 MicroPython (Hardware) 代碼，並透過 USB Serial 通訊與硬體互動。

---

## 🚀 核心功能

### 1. 視覺化積木程式設計
- **Blockly 積木編輯器**：拖放式積木組裝程式邏輯，無需撰寫程式碼即可開始 AI 與硬體專案。
- **即時 Python 產生**：積木即時轉換為可執行的 Python 程式碼，支援語法高亮。
- **雙向點擊定位**：點擊積木可定位並高亮對應程式碼行；點擊程式碼行亦可捲動並選取對應積木。

### 2. AI 視覺整合
- **MediaPipe**：Face Mesh（人臉網格）、Hand Tracking（手部追蹤）、Pose（姿勢辨識）。
- **OpenCV**：影像處理與電腦視覺基礎功能。
- **AI 積木**：內建影像分類、物件偵測、姿勢辨識等 AI 視覺積木，可直接套用於專案。

### 3. 資料集管理 (Dataset Manager)
- **影像採集**：內建相機即時預覽與影像擷取。
- **標註工具**：支援資料集標註與管理。
- **模型訓練**：本地與 DGX 遠端訓練支援。
- **模型匯出**：匯出為 `.tflite` 格式，部署至 MCU 端運行。

### 4. 硬體橋樑 (Hardware Bridge)
- **PC 與 MCU 通訊**：透過 Serial (USB) 進行雙向通訊與程式部署。
- **MicroPython 產出**：為 MCU 端產生可直接燒錄的 MicroPython 代碼。
- **多硬體支援**：可直接辨識與部署多種開發板（見下）。

### 5. 桌面應用 (Tauri 2.0)
- 跨平台桌面應用，無需額外安裝 VS Code。
- 統一的前端介面（SSOT），所有功能透過 Tauri 視窗提供。
- 支援本地檔案儲存、專案管理與 Python 執行環境整合。

---

## 🧩 支援的硬體

| 平台 | 說明 |
|---|---|
| Raspberry Pi Pico W | MicroPython (Raw REPL) |
| Maker Pi RP2040 | MicroPython，含 mcu_car 車控積木 |
| XIAO ESP32-S3 Sense | MicroPython |
| Micro:bit V1/V2 | MicroPython |
| LEGO SPIKE Prime | Pybricks 韌體專屬部署器(未完成) |

> 開發板偵測與腳位映射以 `ui/src/modules/hardware/board_defs.js` 為單一事實來源 (SSOT)。

---

## 🛠 技術架構

- **桌面應用**：Tauri 2.0 Rust 後端，提供視窗管理、檔案系統存取與 Python 子進程控制。
- **前端 SSOT**：`ui/src/` 下的 `app/`（核心）、`ui/`（介面）、`utils/`（Blockly 攔截）、`modules/`（積木模組）。
- **通訊抽象化**：前端經由 `CocoyaBridge`（`ui/src/bridge/`）與後端通訊，以 `bridge.capabilities` 查詢能力差異。
- **Blockly**：視覺化積木引擎，負責積木渲染與程式碼產生。
- **Python 3**：執行端環境（MediaPipe / OpenCV / TensorFlow）。
- **Python Sidecar**：`resources/` 下的 sidecar 進程負責資料集存取、攝影機服務與 AI 特徵提取。
- **模組動態載入**：支援內建模組快取機制。

---

## 📂 專案結構

- `src-tauri/`: Tauri 2.0 Rust 後端。
- `ui/src/`: Webview 前端資源（SSOT）。
    - `app/`: 應用核心（config / persistence / workspace / lifecycle / controller）。
    - `ui/`: 通用 UI 邏輯（工具列 / 硬體 / 對話框 / 終端機等）。
    - `utils/`: Blockly 攔截（core / generators / toolbox / mutator / search）。
    - `modules/`: 積木模組（hardware、spike、mcu_car、ai_inference、dataset_manager、theme_manager、core、ai_face、ai_hand、ai_pose、cv_basic、cv_draw、mcu_camera、mcu_huskylens 等）。
- `resources/`: 靜態資源、Python sidecar、訓練模板、部署器 (`deploy/`)。
- `examples/`: 範例 (.xml)。
- `docs/`: 系統規格書、API 清單與開發文件。
- `log/`: 開發紀錄、任務清單 (`todo.md`)、現況快覽 (`COCOYA_STATE.md`) 與知識蒸餾 (`KNOWLEDGE_BASE.md`)。

---

## 🚀 快速開始

### Tauri 桌面應用

```bash
# 安裝依賴
npm install

# 開發模式
npm run tauri dev

# 建置與打包安裝檔
npm run tauri build
```

### 前端 (ui/)

```bash
npm run dev          # 開發伺服器
npm run build        # 建置 (vite)
```

---

## 📜 授權協定

本專案採用 [MIT License](LICENSE.md) 授權。

---
*Powered by simfonia & AI*
