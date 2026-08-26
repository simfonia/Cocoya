# Dataset Manager 重構施工指引

> 對應計畫：`log/plan/DatasetManagerRefactor.md`
> 建立日期：2026-08-25
> 施工原則：每一階段完成實作與驗證後，才可進入下一階段；任何 gate 失敗時，停止推進並修復目前階段。

---

## 1. 使用方式與放行規則

### 1.1 施工角色

- **施工者**：修改程式、執行自動化檢查、保留測試證據。
- **手動測試者**：依本文件的案例操作 VSIX 與 Tauri；不得只以「看起來正常」作為通過依據。
- **審核者**：確認測試結果、變更範圍與文件同步狀態，於階段末簽核。

### 1.2 每階段固定流程

1. 讀取本階段的施工範圍與不可變更項目。
2. 實作最小變更，避免同時加入新功能。
3. 執行該階段的自動化檢查。
4. 依序執行所有手動測試案例。
5. 將結果、截圖、log、失敗原因與修正 commit 記錄於工作日誌。
6. 只有所有「必測案例」通過，且放行條件全部成立，才可勾選 gate。

### 1.3 強制停止條件

遇到以下任一情況，不得進入下一階段：

- 公開 `window.CocoyaDataset` API 簽名改變但沒有 migration plan。
- VSIX 與 Tauri 的同一操作產生不同資料格式或不同成功/失敗語意。
- 測試案例需要人工猜測預期結果。
- 發現資料遺失、標註遺失、路徑越界、跨視窗事件污染或未處理的非同步錯誤。
- `node --check`、`npm run build --prefix ui`、`npm run compile` 或本階段指定命令失敗。
- 文件描述與實際程式碼或實際測試結果不一致。

### 1.4 測試結果格式

每個案例使用以下狀態：

| 狀態 | 意義 |
|---|---|
| PASS | 預期結果全部符合，附測試日期與證據。 |
| FAIL | 實際結果不符，必須建立修正項目，不得放行。 |
| BLOCKED | 環境、權限或未完成前置工作導致無法測試；不得視為通過。 |
| N/A | 僅限明確不適用，必須寫明原因並由審核者確認。 |

測試記錄最低欄位：`案例 ID`、`平台`、`前置資料`、`步驟`、`預期結果`、`實際結果`、`證據位置`、`狀態`、`測試者`、`日期`。

---

## 2. 測試環境與固定資料

### 2.1 平台矩陣

| 代號 | 平台 | 啟動方式 | 必測內容 |
|---|---|---|---|
| V | VSIX | VS Code Extension Development Host，執行 `npm run compile` 後啟動 | Bridge message、檔案操作、Dataset Manager UI、VSIX sidecar。 |
| T | Tauri Dev | `npm run tauri dev` | Tauri invoke、Rust command、permission、sidecar、原生對話框。 |
| R | Tauri Release | `cargo tauri build` 後安裝產物 | Resource path、sidecar、permission、檔案與匯出功能。 |

若某平台尚未具備可測環境，案例狀態標為 `BLOCKED`，不可改為 `PASS`。

### 2.2 建議固定資料

建立一份不納入正式產品資料的測試資料夾，例如 `temp_scripts/dataset_manager_fixture/`，內容至少包含：

```text
image_fixture/
├── cats/
│   ├── cat_01.jpg
│   └── cat_02.jpg
├── dogs/
│   ├── dog_01.jpg
│   └── dog_02.jpg
└── nested/
    └── cat_03.png

csv_fixture.csv
```

另準備三份進度檔 fixture：

1. image classification：包含 `label_map`、`samples[].label`。
2. object detection：包含兩筆合法 bbox 與一筆未標註樣本。
3. line following：包含合法 normalized line 座標。

測試資料中的路徑、標籤、project name 必須固定，避免每次手動測試產生不同結果。

### 2.3 基線命令

目前已存在的命令：

```powershell
npm run compile
npm run lint
npm run build --prefix ui
```

Tauri 相關命令：

```powershell
npm run tauri dev
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cargo tauri build --config src-tauri/tauri.conf.json
```

若某個命令因環境尚未建立而無法執行，必須在工作日誌標記為 `BLOCKED`，並把補建測試入口列為施工項目。

---

## 3. Stage 0：基線、備份與契約凍結

### 3.1 施工範圍

- 備份目前 `ui/src/modules/dataset_manager/`。
- 記錄現有檔案大小、公開 export、`window.CocoyaDataset` API、DOM id、Bridge command/event。
- 凍結 Dataset JSON schema、save/load canonical path 與 legacy path 策略。
- 建立 VSIX/Tauri parity matrix：command、參數、回傳、事件、錯誤、timeout、取消與 permission。
- 決定 Tauri cloud upload 是否納入本次重構。若延後，從本次成功條件移除並標記 blocker。

### 3.2 不可變更項目

- 不刪除 `ui_layout.js`。
- 不更改公開 `window.CocoyaDataset` API 名稱與參數。
- 不修改訓練器輸出的 Dataset JSON 格式。
- 不把尚未驗證的路徑或事件行為寫入文件作為既定規格。

### 3.3 手動測試

#### B0-1：公開 API 基線

1. 啟動 VSIX 與 Tauri。
2. 開啟瀏覽器/Developer Tools Console。
3. 執行 `Object.keys(window.CocoyaDataset).sort()`。
4. 記錄 `version`、`createSpec`、`detectSchema`、`validateSpec`、`open`、`close`、`toggle`、`getCurrentSpec`、`removeAnnotation`、`refreshI18n` 等 API。
5. 逐一呼叫不具破壞性的 API，記錄回傳型別。

**預期：** VSIX/Tauri API key 與回傳型別一致；無未捕捉例外。

#### B0-2：基線功能煙霧測試

1. 開啟 Dataset Manager。
2. 建立 table、image、object detection、line following 四種類型。
3. 分別執行一次匯入、預覽、關閉與重新開啟。
4. 記錄 console error、UI 異常、縮圖、統計與標註狀態。

**預期：** 基線結果被完整記錄；既有問題不可在重構後被誤判為新回歸。

#### B0-3：資料格式與路徑基線

1. 匯入固定 image fixture。
2. 執行現有儲存進度流程。
3. 記錄實際 `dataset.json` 位置與內容。
4. 關閉 Dataset Manager，重新匯入相同資料夾。
5. 記錄是否能載入進度與恢復標註。

**預期：** 形成現況證據，特別標記 save/load 不對稱問題。

### 3.4 Stage 0 Gate

- [ ] 備份路徑與日期已記錄。
- [ ] API、DOM、Bridge、資料格式基線表已保存。
- [ ] VSIX/Tauri parity matrix 初版已建立。
- [ ] 所有 B0 案例均為 PASS 或明確 BLOCKED。
- [ ] 已決定 Tauri cloud upload 的 scope。
- [ ] 審核者簽核：________ 日期：________

---

## 4. Stage 1：Domain Core 與資料契約

### 4.1 施工範圍

建議新增或移入：

- `core/state.js`
- `core/spec.js`
- `core/labelMap.js`
- `core/projectNaming.js`
- `core/stats.js`
- `core/pathPolicy.js`

Domain core 只能處理資料與規則，不得依賴 DOM、`window.CocoyaBridge`、平台 API 或全域 i18n。驗證結果以 code、severity、參數表示，由 UI 層轉換為文案。

### 4.2 施工步驟

1. 先建立純函式或受控 Store，不先改 UI 流程。
2. 將 label map、stats、project naming 的既有行為逐一搬移。
3. 保留相容 wrapper，使舊 `ui_layout.js` 可以暫時呼叫新 core。
4. 建立 Node 可直接執行的 contract tests。
5. 執行 import graph 檢查，確認 core 沒有反向 import UI/IO。

### 4.3 手動測試

#### C1-1：DatasetSpec round-trip

1. 使用固定 JSON fixture 建立 `DatasetSpec`。
2. 執行 `toJSON()`。
3. 將結果再次建立成 `DatasetSpec`。
4. 比較 project、data_source、schema、stats。

**預期：** 兩次序列化的資料語意一致；沒有遺失 `label_map`、annotations、base_dir 或 stats。

#### C1-2：Schema 與 validate

1. 測試空 table spec。
2. 測試無樣本的 image spec。
3. 測試合法 object detection spec。
4. 測試重複欄位、無效 role、無效 type、負數 label id。
5. 觀察回傳的 error/warning code。

**預期：** domain 回傳穩定 code；不直接產生依賴 UI 語系的硬編碼訊息。

#### C1-3：Label map 與統計

1. 建立 label id 為 0、2、5 的 map。
2. 刪除中間 label。
3. 新增 label。
4. 對 image、bbox、line 三類資料分別重算 stats。
5. 比較空類別是否保留為 0。

**預期：** 新 id 不碰撞；標籤刪除、改名、bbox class id 與統計一致。

#### C1-4：名稱與路徑政策

輸入以下名稱與路徑：

- `demo_project`
- 含空白的名稱
- 含中文與特殊符號的名稱
- `../outside`
- 絕對路徑
- dataset namespace 內的合法相對路徑

**預期：** 只有符合 policy 的名稱與路徑可通過；錯誤以可測試 code 表示，不只依賴 alert 文案。

### 4.4 Stage 1 Gate

- [ ] core 測試可脫離 DOM 與 Bridge 執行。
- [ ] DatasetSpec round-trip 通過。
- [ ] label map、stats、naming、path policy 手動測試通過。
- [ ] core 不 import i18n；若暫時保留，已標註 transitional boundary 與移除期限。
- [ ] 舊 UI 行為未因 core 抽出而改變。
- [ ] 審核者簽核：________ 日期：________

---

## 5. Stage 2：Ports、VSIX/Tauri Adapter 與 Sidecar Protocol

### 5.1 施工範圍

建立明確 bridge port，並完成兩個 adapter：

- VSIX：`CocoyaBridge` message send/on/off。
- Tauri：invoke/listen、camelCase 對映與 capabilities。
- Sidecar：command、requestId、response、progress、error、timeout、cancel、dispose。

所有 Dataset Manager 對平台的通訊，包含 sampler、autosave、import、export、delete、remote diagnostics 與 upload，都必須經過 adapter。

### 5.2 施工步驟

1. 先列出現有所有 direct `window.CocoyaBridge` 呼叫與 listener。
2. 為每一個 command 記錄輸入、輸出、錯誤與事件 payload。
3. 建立 fake adapter，先測試 application 不依賴真實平台。
4. 實作 VSIX adapter 與 Tauri adapter。
5. 將 sidecar response 加上 requestId correlation。
6. 為每個 listener 提供 unsubscribe 或 dispose。
7. 修正 Tauri sidecar 的視窗專屬事件為 `emit_to`。
8. 同步 `commands.toml`、capability、`backend_api_manifest.md`。

### 5.3 手動測試

#### A2-1：VSIX/Tauri command parity

對以下流程逐一測試：

- pick folder
- load progress
- save progress
- delete image
- export dataset
- start/stop camera
- capture image
- remote environment check

每個流程記錄 command、輸入欄位、成功回傳、失敗回傳與事件名稱。

**預期：** 同一流程的資料語意與成功/失敗判定一致；平台差異只存在於 adapter 內部。

#### A2-2：非同步 response correlation

1. 啟動兩個同時請求，例如連續兩次 capture 或兩個進度讀取。
2. 讓回應以不同順序返回，或使用 fake adapter 模擬亂序。
3. 檢查每個 Promise 是否收到自己的 response。
4. 觸發 timeout 與取消。

**預期：** 不會把 A 請求的結果套到 B；timeout 後 listener 被清理；取消不會留下幽靈 callback。

#### A2-3：多視窗 sidecar 隔離

1. 開啟兩個 Tauri 視窗。
2. 視窗 A 啟動 camera 或 sidecar export。
3. 觀察視窗 B 的 log、狀態與圖片事件。
4. 在視窗 B 執行另一個 sidecar 操作。
5. 關閉其中一個視窗，再確認另一個視窗仍可正常接收事件。

**預期：** A 的事件只出現在 A，B 的事件只出現在 B；不得使用全域廣播造成交叉污染。

#### A2-4：權限與錯誤

1. 在 Tauri dev 執行每個新增或修改的 command。
2. 在 Release 產物執行相同 command。
3. 暫時移除或錯置 resource，確認錯誤訊息清楚。
4. 傳入不存在路徑、越界路徑與不合法 project name。

**預期：** dev 與 release 的 command 行為一致；拒絕非法路徑；錯誤不吞掉且不暴露不必要的系統資訊。

### 5.4 Stage 2 Gate

- [ ] direct Bridge 呼叫已完成清單並遷移，或明確列為尚未遷移。
- [ ] VSIX/Tauri parity matrix 已由實際 adapter 結果更新。
- [ ] requestId、timeout、cancel、unsubscribe 測試通過。
- [ ] 兩個視窗的 sidecar event 完全隔離。
- [ ] Tauri permission 與 `emit_to` 規則通過。
- [ ] Tauri cloud upload 已完成 parity，或明確移出本次成功條件。
- [ ] 審核者簽核：________ 日期：________

---

## 6. Stage 3：Application Use Cases 與資料流程

### 6.1 施工範圍

將下列流程從 `ui_layout.js` 的互相呼叫改為 use-case/controller：

- import file/directory
- save/load progress
- autosave
- annotation mutation
- classification review
- camera capture
- export
- cloud upload

Application 層接收 domain state 與 ports，不直接依賴具體 VSIX/Tauri API。

### 6.2 施工步驟

1. 先搬移 save/load progress，因為它是資料一致性的核心。
2. 再搬移 importer/exporter，分離純轉換與 I/O。
3. 搬移 annotation/classification mutation。
4. 接入 autosave，確認 debounce 與 immediate flush 不重複寫入。
5. 最後接入 camera、export 與 cloud upload。
6. 每完成一個 use-case，刪除舊路徑或加上明確的 compatibility wrapper，不保留雙重真實流程。

### 6.3 手動測試

#### U3-1：Save/load round-trip

1. 匯入 image fixture。
2. 修改一個 label，新增一個 bbox，保留一張未標註圖片。
3. 執行儲存進度。
4. 確認 `dataset.json` 位於 canonical path。
5. 關閉 Dataset Manager。
6. 重新選取來源資料夾。
7. 確認 type、schema、label_map、stats、label、annotations 全部恢復。

**預期：** 儲存與載入使用同一 canonical path；標註依 normalized image path 正確套回；未匹配檔案不會清空其他已載入資料。

#### U3-2：Autosave 與關閉流程

1. 匯入資料後修改 label。
2. 在 debounce 時間內連續修改三次。
3. 觀察寫入次數與最後檔案內容。
4. 立即切換圖片、離開標註模式、關閉 modal。
5. 重新開啟資料夾載入。

**預期：** 連續異動只產生預期的 debounce 寫入；切換/離開/關閉會 flush；不會因 modal 銷毀後 timer 回呼而報錯。

#### U3-3：匯入資料一致性

1. 匯入 CSV，確認欄位型別、label 欄位與樣本數。
2. 匯入 image fixture，確認巢狀資料夾與標籤統計。
3. 以相同 project name 匯入不同來源資料夾。
4. 取消名稱更新確認對話框。

**預期：** CSV 與影像資料不互相污染；來源變更不會靜默寫入錯誤 dataset namespace；取消操作不會清空現有資料。

#### U3-4：資料刪除與安全邊界

1. 刪除 dataset 內的合法圖片。
2. 嘗試刪除 dataset 外的檔案。
3. 嘗試使用 `..`、絕對路徑與不存在檔案。
4. 重新掃描資料夾與載入 progress。

**預期：** 合法檔案可刪除；越界路徑被拒絕；不存在檔案的行為與 parity contract 一致；metadata 不留下不存在樣本。

### 6.4 Stage 3 Gate

- [ ] save/load canonical path 已固定且 round-trip 通過。
- [ ] autosave 不重複、不遺失、不在 dispose 後回呼。
- [ ] CSV、image、bbox、line 四種資料流通過。
- [ ] delete/save/load path confinement 通過。
- [ ] use-case 不直接依賴 concrete platform API。
- [ ] 審核者簽核：________ 日期：________

---

## 7. Stage 4：UI Presenter、Annotation 與生命週期

### 7.1 施工範圍

依序拆出：

1. `statusMessage.js`
2. `modal.js`
3. `form.js`
4. `thumbnails.js`
5. `classification.js`
6. `annotation.js`
7. `panels.js`

`ui_canvas.js` 與 `sampler.js` 必須有清楚的 controller 邊界。每個 UI 子模組要能說明資料輸入、輸出 action、DOM ownership 與 dispose 行為。

### 7.2 施工步驟

1. 先移除 status message 的直接 DOM 寫入分支。
2. 建立 modal mount/unmount，確認重建不重複綁定事件。
3. 將 form 讀寫與 spec sync 分離。
4. 將 thumbnails 的 scroll save/restore 集中管理。
5. 分離 classification 與 annotation state machine。
6. 最後搬移 panels 與 sampler/canvas lifecycle。
7. 每次只搬一個 UI slice，完成該 slice 測試後才移動下一個。

### 7.3 手動測試

#### UI4-1：Modal lifecycle

1. 連續執行開啟、關閉、開啟 Dataset Manager 五次。
2. 點擊每個主要按鈕一次。
3. 觀察是否有一次操作觸發多次 command 或多次 status message。
4. 切換 locale 後重建 modal，再重複操作。

**預期：** 每次操作只觸發一次；沒有重複 listener、重複 modal 或殘留 timer。

#### UI4-2：Annotation state machine

1. object detection：進入標註、畫 bbox、修改 class、刪除 bbox、返回列表。
2. line following：畫線、取消、重新畫線、返回列表。
3. image：進入分類校正、修改 label、新增 label、取消新增。
4. 逐一關閉 modal 並重新開啟。

**預期：** `null`、`bbox`、`line`、`classification` 狀態互不污染；取消不產生半成品；重新開啟不殘留舊 canvas 或 annotation。

#### UI4-3：Scroll 與縮圖

1. 匯入至少 50 張圖片。
2. 滾動至中間位置。
3. 點擊圖片進入標註。
4. 修改標註並返回列表。
5. 重複進入另一張圖片，再返回。

**預期：** 返回後 scrollTop 與進入前一致；統計重繪不造成跳動；縮圖狀態、綠勾與分類徽章正確。

#### UI4-4：Status message

1. 觸發成功訊息、進行中訊息與錯誤訊息。
2. 在訊息顯示期間觸發第二筆訊息。
3. 進入 annotation、classification 與 sampler view 觀察訊息。
4. 等待自動清除時間，再觸發空訊息。

**預期：** 所有模式共用 `#dataset-manager-message`；新 timer 取代舊 timer；訊息不被舊 timer 提前清除；空訊息可立即隱藏。

#### UI4-5：Camera lifecycle

1. 啟動 camera，拍攝一張圖片。
2. 停止 camera，關閉 modal。
3. 重新開啟並切換 camera。
4. 重複啟停三次。
5. 觀察 preview Object URL 與 console。

**預期：** 沒有重複 listener、未釋放的 Object URL、關閉後仍更新 DOM 或 capture callback。

### 7.4 Stage 4 Gate

- [ ] 每個 UI 模組的 mount/unmount/dispose 責任已文件化。
- [ ] Modal、annotation、classification、scroll、status、camera 手動測試通過。
- [ ] `ui_layout.js` 已不再是所有流程的唯一協調者。
- [ ] 不存在重複 listener、timer、Object URL 或殘留 DOM 更新。
- [ ] 既有 `window.CocoyaDataset` API 仍可使用。
- [ ] 審核者簽核：________ 日期：________

---

## 8. Stage 5：i18n、主題與樣式

### 8.1 施工範圍

- 將 Dataset Manager 色彩整理為 `--dsm-*` tokens。
- 拆分 base、modal、annotation、theme styles。
- 補齊 `zh-hant` 與 `en` key parity。
- 定義 UI、VSIX Host、Rust、sidecar 各自的訊息責任。
- 保留 VSIX 靜態 CSS 載入相容性。

### 8.2 施工步驟

1. 列出現有 CSS 顏色、尺寸、focus、error、disabled 與狀態 selector。
2. 將語意相同的色彩轉為 token，不先改視覺值。
3. 以 light theme 作為基準，再加入 dark、high-contrast、candy、Tauri fallback。
4. 比對 i18n key，刪除未使用 key，補齊缺少 key。
5. 測試 locale 初始化、refresh、reload 與 modal 重建。
6. 檢查文案長度、按鈕溢位、錯誤訊息換行與高對比可讀性。

### 8.3 手動測試

#### T5-1：語系 key parity

1. 載入 zh-Hant，逐一操作 import、save/load、annotation、classification、camera、export、錯誤流程。
2. 載入 English，重複相同流程。
3. 搜尋畫面是否顯示 translation key、空白、`undefined` 或錯誤 fallback。

**預期：** 所有使用者可見文案均有兩種語系；fallback 只出現在設計允許的位置；沒有混用語系。

#### T5-2：Locale refresh race

1. 在 Dataset Manager 開啟狀態切換語系。
2. 語系切換期間快速開關 modal。
3. 切換後重新進入 annotation 與 classification。
4. 觀察狀態訊息、按鈕、select、label 與錯誤文案。

**預期：** 語系載入完成後所有現有 UI 重建或刷新；不會回到舊語系，也不會出現重複 modal。

#### T5-3：主題矩陣

在 VSIX 與 Tauri 分別測試：

- light
- dark
- high-contrast
- candy
- Tauri fallback

每個主題檢查：

1. modal 與背景對比。
2. 表單、select、button、focus ring。
3. 縮圖、label color、統計圖例。
4. bbox、line、未標註與錯誤狀態。
5. status message、tooltip、disabled 狀態。

**預期：** 沒有文字與背景混色、focus 不可見、圖形顏色失去辨識度、內容溢位或主題切換後殘留舊色。

### 8.4 Stage 5 Gate

- [ ] `--dsm-*` token inventory 已建立。
- [ ] zh-Hant/en key parity 通過。
- [ ] locale refresh/reload 通過。
- [ ] VSIX/Tauri 的 light、dark、high-contrast、candy、fallback 通過。
- [ ] 所有 CSS 檔案的載入順序與打包結果已確認。
- [ ] 審核者簽核：________ 日期：________

---

## 9. Stage 6：文件、冗餘清理與相容性確認

### 9.1 施工範圍

同步以下文件，並確認每份文件只有一種責任：

- `docs/system_spec.html`
- `docs/backend_api_manifest.md`
- `log/mappings/DatasetManager.html`
- `log/mappings/DatasetManager_DevGuide.html`
- `FILE_STRUCTURE.md`
- `DATASET_MANAGER_PLAN.md`
- `log/plan/DatasetManagerOptimization.md`
- `log/plan/DatasetManagerProgressAndGuardrails.md`
- `AGENTS.md`

清理項目：

- 未使用 export/import。
- 重複 handler 與重複 DOM id。
- 舊 importer dead code。
- 未再使用的 `status` 元素。
- direct Bridge 呼叫。
- 未授權全域 emit。
- legacy `ui_layout.js` compatibility wrapper 中已無呼叫的部分。

### 9.2 手動測試

#### D6-1：文件與實作逐項核對

1. 從 `DatasetManager.html` 的每個 API 開始。
2. 找到實際 export、呼叫位置與回傳值。
3. 從 `backend_api_manifest.md` 的每個 Dataset command 開始。
4. 找到 VSIX message、Tauri command、permission 與事件 listener。
5. 對照 `FILE_STRUCTURE.md` 的每個新檔案。

**預期：** 文件中的檔案、函式、API、參數、事件與路徑均存在且與實作一致；已淘汰內容有明確標記。

#### D6-2：公開 API 相容性

1. 重新執行 Stage 0 的 API 清單。
2. 比較名稱、參數、回傳型別與副作用。
3. 使用既有呼叫方執行 `open`、`close`、`getCurrentSpec`、`removeAnnotation`、`refreshPreview`。

**預期：** 沒有未記錄的 breaking change；若有變更，必須停止並補 migration plan。

#### D6-3：靜態清理掃描

執行搜尋並保留結果：

```powershell
rg "window\.CocoyaBridge|\.emit\(|dataset-dir-input|showStatusMessage|export " ui/src/modules/dataset_manager src-tauri/src
```

**預期：** 每個殘留項目都有合法理由、明確 owner 與文件記錄；禁止以搜尋結果為零作為唯一條件，因為 adapter 或公開 API 可能合法使用這些字串。

### 9.3 Stage 6 Gate

- [ ] 文件責任矩陣已落實。
- [ ] API、command、event、permission、resource 文件一致。
- [ ] dead code 與重複 handler 已清理或標記保留原因。
- [ ] 公開 API 相容性通過。
- [ ] `FILE_STRUCTURE.md` 只描述現行結構。
- [ ] 審核者簽核：________ 日期：________

---

## 10. Stage 7：總驗證、Release 與最終放行

### 10.1 自動化驗證

依序執行並保存完整輸出：

```powershell
npm run compile
npm run lint
npm run build --prefix ui
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cargo tauri build --config src-tauri/tauri.conf.json
```

若已建立 Dataset Manager 專用測試入口，額外執行該入口；不得以 `node --check` 取代行為測試。

### 10.2 手動 E2E 矩陣

| 案例 | VSIX | Tauri Dev | Tauri Release |
|---|---:|---:|---:|
| image classification | [ ] | [ ] | [ ] |
| object detection bbox | [ ] | [ ] | [ ] |
| line following line | [ ] | [ ] | [ ] |
| CSV/table import | [ ] | [ ] | [ ] |
| camera capture/savePath | [ ] | [ ] | [ ] |
| autosave/load round-trip | [ ] | [ ] | [ ] |
| dataset export | [ ] | [ ] | [ ] |
| cloud upload | [ ] | [ ] | [ ] |
| clear/type switch/close confirmation | [ ] | [ ] | [ ] |
| locale reload | [ ] | [ ] | [ ] |
| theme switching | [ ] | [ ] | [ ] |
| multi-window event isolation | N/A | [ ] | [ ] |

### 10.3 Release 專用測試

#### R7-1：Resource path

1. 安裝 Tauri Release 產物。
2. 啟動 Dataset Manager。
3. 執行 camera、export、import 與 sidecar 相關流程。
4. 觀察安裝目錄以外的 resource 解析結果與 log。

**預期：** Release 不依賴 repository 目前工作目錄；sidecar、module、firmware、help 與相關資源均可找到。

#### R7-2：Permission

1. 執行所有 Dataset Tauri command。
2. 執行新增或修改過的 permission command。
3. 在無權限或非法 path 情境確認錯誤回傳。

**預期：** 合法操作通過；非法操作明確拒絕；沒有 dev 可用、release 被攔截的差異。

#### R7-3：資料遺失保護

1. 建立含 label、bbox、line 的完整 fixture。
2. 連續執行切換類型、清除資料、關閉 modal、關閉視窗與重新開啟。
3. 每一步都選擇取消、確認與不儲存的不同分支。
4. 重新載入 dataset.json 比較資料內容。

**預期：** 使用者取消時資料不變；確認清除時只清除預期範圍；儲存後資料可完整恢復。

### 10.4 最終放行條件

- [ ] 所有自動化命令通過，或每個 BLOCKED 項目已由負責人與替代方案核准。
- [ ] VSIX、Tauri Dev、Tauri Release 的必要 E2E 全部 PASS。
- [ ] save/load、path security、sidecar isolation、i18n、theme、API compatibility 全部 PASS。
- [ ] Release 產物已實際安裝測試，不只檢查 build exit code。
- [ ] 舊 `ui_layout.js` 僅在確認無引用且備份完成後才刪除。
- [ ] `log/todo.md`、當日工作日誌、`FILE_STRUCTURE.md` 與相關 mapping 已追加更新。
- [ ] 審核者最終簽核：________ 日期：________

---

## 11. 失敗處置與回復策略

### 11.1 失敗分類

| 分類 | 例子 | 處置 |
|---|---|---|
| S0 資料安全 | 標註遺失、錯誤覆寫、路徑越界 | 立即停止該階段，保留 fixture、log 與產物，先修復再測。 |
| S1 契約回歸 | VSIX/Tauri payload 不同、API breaking change | 回到 Stage 0 或對應 adapter/use-case 階段，更新 contract matrix。 |
| S2 UI 回歸 | scroll、listener、主題、i18n、模式狀態異常 | 停留在 Stage 4/5，補 lifecycle 或 presenter 測試。 |
| S3 文件/清理 | 文件漂移、dead code、殘留 direct Bridge | 停留在 Stage 6，不進 Release。 |
| S4 環境阻塞 | 缺 Python、Tauri toolchain、攝影機或 VS Code Host | 標記 BLOCKED，建立替代 fixture 或補環境，不得標 PASS。 |

### 11.2 回復原則

- 不使用破壞性 Git 指令回復使用者未建立的變更。
- 每個階段的備份與 fixture 不得刪除，直到最終放行後再依保留政策處理。
- 優先回復 compatibility wrapper 或 adapter，避免直接回退整個重構。
- 任何已發現但不屬於本階段的問題，記入 `log/todo.md`，不要偷偷混入目前施工範圍。

---

## 12. 階段簽核總表

| 階段 | 名稱 | PASS 日期 | 測試者 | 審核者 | 備註 |
|---|---|---|---|---|---|
| 0 | 基線、備份與契約凍結 | | | | |
| 1 | Domain Core 與資料契約 | | | | |
| 2 | Ports、Adapter 與 Sidecar Protocol | | | | |
| 3 | Application Use Cases 與資料流程 | | | | |
| 4 | UI Presenter、Annotation 與生命週期 | | | | |
| 5 | i18n、主題與樣式 | | | | |
| 6 | 文件、冗餘清理與相容性 | | | | |
| 7 | 總驗證、Release 與最終放行 | | | | |

---

## 13. 施工紀錄（Append-Only）

- 2026-08-25：建立施工指引，尚未開始實作。

---

## 14. AI Agent 施工與交接協定

本章是所有後續 AI agent 的強制入口。接手 agent 不得只依賴對話上下文，必須依本章建立自己的工作狀態與交接證據。

### 14.1 接手前必讀順序

接手任何階段前，依序讀取以下文件：

1. `AGENTS.md`。
2. 本文件目前階段與上一階段的 Gate 結果。
3. `log/plan/DatasetManagerRefactor.md` 的最新修訂與決策。
4. `log/todo.md` 的相關未完成項目。
5. 最新 `log/work/` 工作日誌的「下次啟動方向」。
6. 相關 `docs/`、`log/mappings/` 與實際程式碼；文件與程式碼衝突時，以實際驗證結果為準，並記錄漂移。

若上述任一文件不存在、互相矛盾或上一階段沒有 Gate 結果，狀態必須標記為 `BLOCKED`，先補齊交接資料，不得直接修改下一階段程式碼。

### 14.2 接手前環境與工作樹檢查

接手 agent 必須先執行或記錄下列檢查：

```powershell
git status --short
git branch --show-current
git log -1 --oneline
Get-Location
node --version
npm --version
cargo --version
```

檢查結果必須記錄：

- 工作目錄是否為 `c:\Workspace\cocoya`。
- 目前 branch、HEAD 與上一個交接點是否一致。
- 是否存在未由本 agent 建立的修改。
- Node、npm、Rust、Cargo、Python、VS Code/Tauri toolchain 是否可用。
- 是否需要攝影機、實體資料夾、VSIX Host 或 Tauri Release 安裝環境。

### 14.3 工作樹保護

- 不使用 `git reset --hard`、`git checkout --` 或其他會覆蓋未知修改的命令。
- 接手前發現同一檔案已有未提交修改，先讀懂其內容與目的；若無法安全合併，標記 `BLOCKED`。
- 只修改本階段允許的檔案；跨階段修改必須在 handoff 中列出原因。
- 不建立未登錄的暫存檔、測試資料或產物於產品目錄；固定 fixture 應放在指引指定位置或測試目錄。
- 不將密碼、SSH 私鑰、token、完整個人路徑或其他秘密寫入 source、log、fixture、截圖與 commit message。
- 不擅自 commit、rebase、merge、建立 branch 或刪除使用者既有修改；除非使用者明確要求。

### 14.4 階段狀態機

每個階段只能處於以下其中一種狀態：

```text
NOT_STARTED -> IN_PROGRESS -> READY_FOR_TEST -> PASS
                       \-> FAIL -> IN_PROGRESS
                       \-> BLOCKED
```

- `NOT_STARTED`：尚未施工。
- `IN_PROGRESS`：正在修改，禁止宣稱完成。
- `READY_FOR_TEST`：程式修改暫停，等待手動測試者執行案例。
- `PASS`：所有必要自動化與手動案例通過，且 Gate 已簽核。
- `FAIL`：測試不符合預期，必須留在同一階段修復。
- `BLOCKED`：缺少環境、決策、前置產物或權限；不得用「暫時跳過」代替。

只有 `PASS` 才能進入下一階段。`READY_FOR_TEST` 不等於 `PASS`。

### 14.5 每階段必須交付的產物

每一階段結束時，除程式碼外至少交付：

| 產物 | 內容 |
|---|---|
| 變更清單 | 修改、新增、刪除的檔案與每檔目的。 |
| 依賴圖 | 新增 import、export、port、adapter、DOM ownership 與 state ownership。 |
| 測試證據 | 命令完整輸出、手動案例實際結果、截圖或 log 位置。 |
| 未完成清單 | FAIL、BLOCKED、已知風險與不屬本階段的問題。 |
| 決策紀錄 | 新增或改變的 contract、path、錯誤、i18n、theme 與相容策略。 |
| 文件同步 | 受影響的 system spec、API mapping、backend manifest、FILE_STRUCTURE 與工作日誌。 |
| 下一步 | 下一個 agent 可直接執行的第一個動作與預期檔案。 |

### 14.6 變更範圍與檔案所有權

每個階段開始時，agent 必須在工作日誌記錄：

```text
Stage：
Owner：
允許修改：
禁止修改：
前置 Gate：
本階段成功條件：
預計驗證命令：
需要人工測試的平台：
```

若施工途中需要修改不在「允許修改」內的檔案，必須先說明：

1. 為何目前階段無法在原範圍內完成。
2. 該修改是否改變公開 API、資料格式或平台契約。
3. 會新增哪些測試與文件。
4. 是否應拆成新的階段或 blocker。

### 14.7 測試證據規格

測試結果不得只寫「已測試」或「正常」。每個 PASS 必須能回答：

1. 使用哪個平台與版本。
2. 使用哪份 fixture 或測試資料。
3. 執行哪些精確步驟與命令。
4. 預期結果與實際結果是否逐項一致。
5. 輸出、截圖、console log 或產物放在哪裡。
6. 是否測試了取消、錯誤、空資料、重複操作與重新開啟。

手動測試若涉及資料寫入，必須在測試前後比較：

- dataset.json 的內容。
- 標註數量、label_map 與 stats。
- 來源資料夾與輸出資料夾。
- 產生或刪除的檔案清單。

### 14.8 跨 agent 交接範本

每次交接必須在當日工作日誌末尾追加以下格式。不可只在聊天訊息中交接：

```text
## AI Agent Handoff

- 日期：
- Agent：
- 階段：Stage X
- 狀態：PASS / READY_FOR_TEST / FAIL / BLOCKED
- HEAD：
- 工作樹：clean / dirty（說明未由本 agent 建立的修改）
- 本次目的：
- 已完成：
- 修改檔案：
- 未完成或風險：
- 測試命令與結果：
- 手動案例與結果：
- 證據位置：
- 文件同步狀態：
- 下一個 agent 第一動作：
- 禁止重做或修改的事項：
- 需要產品決策的問題：
- 交接者：
```

### 14.9 接手 agent 的第一個回覆格式

接手 agent 在開始編輯前，必須先回報以下內容：

```text
我已讀取：
- 規範：
- 重構計畫：
- 本施工指引：
- 上一階段 Gate：
- 最新工作日誌：

目前判定：NOT_STARTED / IN_PROGRESS / READY_FOR_TEST / FAIL / BLOCKED
本階段目標：
第一個驗證點：
允許修改檔案：
發現的既有未提交修改：
```

未完成這個確認前，不得開始實質編輯。

### 14.10 決策與 blocker 管理

- 未決定的產品問題不可由 agent 默認猜測後寫成規格。
- 每個 blocker 必須包含：問題、影響、重現步驟、需要誰決策、暫時替代方案與解除條件。
- contract、path、資料格式、公開 API、Tauri permission、Release resource 或安全策略的變更，必須同步更新 parity matrix 與相關文件。
- 發現不屬於本階段的 bug，記入 `log/todo.md`，附檔案、函式、重現步驟與風險，不偷偷順手修理。

### 14.11 交接完成 Gate

- [ ] 本階段狀態已明確寫為 `PASS`、`READY_FOR_TEST`、`FAIL` 或 `BLOCKED`。
- [ ] 修改檔案、測試證據與未完成事項已記錄。
- [ ] 所有手動測試案例都有實際結果，不以空白核取框代替證據。
- [ ] 文件與程式碼的差異已標記。
- [ ] 最新工作日誌已追加 AI Agent Handoff。
- [ ] 下一個 agent 的第一個動作與禁止事項已寫明。
- [ ] 若為 `PASS`，審核者已簽核；若為 `FAIL/BLOCKED`，已列出解除條件。

---

## 15. 施工前快速檢查表

接手 agent 可直接使用以下清單，不得以「已看過」取代勾選與證據：

- [ ] 已確認工作目錄與 branch。
- [ ] 已確認沒有覆蓋使用者未提交修改。
- [ ] 已讀取規範、重構計畫、施工指引、todo 與最新工作日誌。
- [ ] 已確認上一階段 Gate 狀態。
- [ ] 已確認本階段允許修改檔案與禁止修改檔案。
- [ ] 已確認測試平台、fixture、Python/Node/Rust/Tauri 前置條件。
- [ ] 已確認本階段的資料格式、API 與錯誤契約不可變更項目。
- [ ] 已確認測試證據儲存位置，不含秘密資料。
- [ ] 已確認失敗時停留在本階段，不跨階段補洞。
- [ ] 已在工作日誌建立本階段施工紀錄。

## 16. 指引修訂紀錄（Append-Only）

- 2026-08-25：新增 AI agent 施工與交接協定、階段狀態機、交付物規格、工作樹保護與 handoff 範本。
