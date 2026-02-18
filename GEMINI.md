# Cocoya 專案指南 (GEMINI.md)

## 專案概述
Cocoya 是一個針對 Python AI視覺的教學工具。它透過 Blockly 產生 PC 端的 Python (AI) 與 MCU 端的 CircuitPython (Hardware) 代碼。

## 技術規範
- **核心架構**：混合架構 (Hybrid)，支援雲台熱更新與內建基礎版。
- **目標語言**：
    - PC: Python 3 (MediaPipe, OpenCV)。
    - MCU: CircuitPython (XIAO S3 Sense, Maker Pi RP2040)。
- **通訊方式**：Serial (USB)。

## 開發慣例
- **積木與產生器**：參考 `piBlockly` 風格，模組化設計。
- **代碼風格**：
    - Extension: TypeScript (Strict)。
    - Webview: ES6 JavaScript。
- **系統規格書**：`docs/system_spec.html`。
    - **強制規範**：在進行任何積木或產生器開發前，**必須先詳細閱讀系統規格書**，以確保 ID 注入機制、轉義字元 (\\n) 與 AI 座標規範被嚴格執行。
- **日誌要求**：異動需記錄於 `log/work/` 與 `log/todo.md`。

## 重要路徑
- **模組路徑**：`media/core_modules/` (內建), `globalStorage/modules/` (快取)。
