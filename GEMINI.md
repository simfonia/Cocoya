# Cocoya 專案指南 (GEMINI.md)

## 專案概述
Cocoya 是一個針對 Python AI視覺的教學工具。它透過 Blockly 產生 PC 端的 Python (AI) 與 MCU 端的 CircuitPython (Hardware) 代碼。

## 技術規範
- **核心架構**：混合架構 (Hybrid)，支援雲台熱更新與內建基礎版。
- **目標語言**：
    - PC: Python 3 (MediaPipe, OpenCV)。
    - MCU: CircuitPython (XIAO S3 Sense, Maker Pi RP2040)。
- **通訊方式**：Serial (USB)。

### 產生器開發規範 (Generator Standards)
- **基準縮排 (Base 4-Space Indent)**: 
    - **強制要求**: 所有在產生器 (.js) 中以字串形式定義的靜態 Python 程式碼（例如注入 `generator.definitions_` 的輔助函式），**必須統一使用 4 個空白** 作為縮排基準。
    - **原理**: `ui/src/utils.js` 中的全域攔截器會自動偵測行首的 4 空白倍數，並根據使用者選定的 `INDENT` (如 2 或 8) 進行等比例縮放。若不遵守 4 空白基準，將導致全域區程式碼對齊失效。
- **路徑處理**: 
    - ...

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
