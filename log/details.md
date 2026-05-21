# Cocoya 技術細節 (Details)
... (略)

## 關鍵技術實作紀錄 (2026-05-14 更新)

### 1. 通訊橋樑能力動態同步機制 (Bridge Capabilities Sync)
- **問題**：原本 Bridge 的 `capabilities` 是唯讀 Getter，無法反應啟動後從 Host 端獲取的環境資訊（如 Remote-SSH 連線狀態）。
- **解決方案**：
    - 將 `BaseBridge.capabilities` 改為回傳內部的 `_caps` 物件，並提供 `updateCapabilities(caps)` 方法。
    - 在 `AppController` 收到 `manifestData` 時，優先更新能力清單。
- **效果**：UI 層能即時校準「雲端模式」開關的合法性與持久化狀態。

### 2. 基於 definitions_ 的代碼生成順序控制
- **原理**：Blockly Python 產生器在執行 `finish()` 時，會自動將 `definitions_` 陣列中的內容拼接在 Imports 之後。
- **實作**：將 `py_function_def`、`py_import` 等宣告型積木由 Statement 改為 Definitions 模式。
- **好處**：解決了因積木空間位置（高度）導致的「未定義即呼叫」報錯。

### 3. VSIX 遠端環境感知與測試配置
- **Hostname 識別**：透過 Node.js 的 `os.hostname()` 區分不同學生的物理機器，作為雲端沙盒目錄的唯一鍵。
- **Extension Kind 策略**：在 `package.json` 中宣告 `"extensionKind": ["ui"]`。這確保插件邏輯跑在本機，能同時讀取本地 `globalState` 與渲染 Webview，但又能透過 API 偵測視窗是否連入 SSH 遠端。
- **環境隔離**：在 `extension.ts` 中透過 `vscode.env.remoteName` 判斷當前是否允許開啟雲端 AI 功能，並在 UI 上實作自動歸位邏輯。

### 4. 遠端路徑沙盒化與自動初始化
- **規範**：統一目錄結構 `~/cocoya_ai/sessions/[MachineID]/`。
- **實作方式**：為了規避權限問題，不直接使用 FileSystem API 在遠端建立目錄，而是調用 VS Code 內建終端機發送 `mkdir -p` 指令。這在 Remote-SSH 激活狀態下會自動於伺服器端執行。
