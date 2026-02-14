# Cocoya: Code, Compute, Yield AI

Cocoya 是一個專為 AI 教育設計的視覺化程式設計工具。它結合了 **Blockly** 的易用性與 **Python (OpenCV/MediaPipe)** 的強大能力，讓學生能快速從積木邏輯跨越到真實的 AI 視覺應用。

## 🚀 核心特色

- **雙欄即時預覽**：積木與 Python 程式碼即時同步，支援語法高亮與雙向點擊定位。
- **AI 視覺整合**：預計整合 MediaPipe (Face Mesh, Hand Tracking) 與 OpenCV。
- **硬體橋樑**：支援 PC 與 MCU (CircuitPython) 之間的 Serial 通訊與部署。
- **精確定位技術**：讓積木與產生出的程式碼行號精確對齊。

## 🛠 技術架構

- **VS Code Extension API**: 擴充功能核心。
- **Blockly V12.3.1**: 視覺化積木引擎。
- **Python 3**: 執行端環境。
- **Hybrid Module Loader**: 支援內建與 GlobalStorage 快取的模組動態載入機制。

## 📂 專案結構

- `src/`: Extension Host 端 TypeScript code。
- `media/`: Webview 前端資源。
    - `core_modules/`: 內建基礎積木模組 (Logic, Loops, Math, Structure...)。
    - `icons/`: 工具列與積木圖示。
    - `zh-hant.js` / `en.js`: 多國語系定義。
- `log/`: 開發紀錄、任務清單與技術細節。

## 🛠 開發與打包

1. **安裝依賴**：
   ```bash
   npm install
   ```
2. **編譯 TypeScript**：
   ```bash
   npm run compile
   ```
3. **打包 VSIX**：
   ```bash
   npx vsce package
   ```

## 📜 授權協定

本專案採用 [MIT License](LICENSE.md) 授權。

---
*Powered by Gemini CLI & simfonia*
