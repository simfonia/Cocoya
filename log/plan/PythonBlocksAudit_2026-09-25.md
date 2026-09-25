# Cocoya Python 語法積木群全面檢查報告

- **檢查日期**：2026-09-25
- **檢查範圍**：`ui/src/modules/core/*` 的 Python 語法積木、產生器、toolbox、核心 i18n、平台分流與三個主題
- **目標平台**：PC Python、MicroPython
- **檢查方式**：原始碼盤點、模組註冊與 toolbox 流程追蹤、產生器契約檢查、i18n/theme key 對照
- **本文件性質**：檢查報告與後續執行計畫；本次已實作 MicroPython serial flush 與 Candy SPIKE 顏色補齊

## 1. 執行摘要

Cocoya 目前的 Python 語法積木群分為 11 個核心模組，約 64 個積木：

- `core/structure`
- `core/io`
- `core/time`
- `core/logic`
- `core/loops`
- `core/math`
- `core/text`
- `core/types`
- `core/coding`
- `core/variables`
- `core/functions`

現有架構已具備三層能力：

1. `ui/src/core_manifest.json` 控制整個模組可使用的平台。
2. `toolbox.xml` 的 `platform` 屬性控制單一積木顯示平台。
3. `Blockly.Python.PLATFORM` 供 generator 依 PC／MicroPython 產生不同程式碼。

此架構足以支援目前需求，不建議重寫。主要問題集中在既有積木的對帳、平台 API 分支、產碼邊界與 i18n key 一致性。

## 2. 問題總表

| 優先級 | 問題 | 影響 | 建議 |
|---|---|---|---|
| 高 | `py_text_zfill` 曾有定義和 generator，但未加入 toolbox | 已修正；使用者現在可從 Text 工具箱建立 | 保留 toolbox/block/generator 對帳測試 |
| 高 | `py_math_single` 使用 `math.*`，未保證注入 `import math` | 產生的 Python 可能 `NameError` | 已依操作值注入 `import math` |
| 高 | MicroPython 的 `py_io_serial_flush` 固定輸出 `ser.reset_input_buffer()` | MCU 產碼引用不存在的 PC `ser` 物件 | 已改為以 `sys.stdin`／`uselect` 排空輸入並清除行緩衝 |
| 高 | SPIKE 顏色 key 中英文不一致 | 英文模式可能得到 undefined 顏色 | 統一 `COLOUR_SPIKE_SENSOR_*` 命名並建立 parity 測試 |
| 中高 | 單元素 tuple 曾產生 `(x)` | 產碼語意不是 tuple | 已修正為 `(x,)`，零元素維持 `()` |
| 中 | `py_math_single` 曾有不可達的 `math.atan2` 分支 | 產生器與積木選項不一致，增加維護誤導 | 已移除死分支，保留獨立 `py_math_atan2` |
| 中 | atan2 tooltip 硬編碼繁中 | 英文介面 tooltip 不一致 | 改為 i18n key |
| 中 | raw Python 積木在 MicroPython 也顯示 | 可輸入不相容的 CPython API | 保留雙平台，已補雙語 tooltip，明確說明由使用者負責相容性 |
| 中 | 繁中核心分類名稱仍多為英文 | 教學術語策略容易被誤判為 i18n 缺漏 | 規格已註記刻意保留英文，不需翻譯 |
| 低至中 | Candy SPIKE 顏色覆寫 | 已補齊 SPIKE 類別與子分類；仍需測試所有 key 為有效色值 | 保留主題顏色 parity 回歸測試 |

## 3. 外觀欄位與 generator 對帳

### 3.1 目前已確認的結構

多數積木使用 `jsonInit()`，少數動態積木使用 imperative API 與 mutation。現有測試 `ui/src/app/block_jsoninit.test.mjs` 能檢查 JSON 積木的 message／args placeholder，但尚不能完整覆蓋：

- imperative block 的欄位與輸入名稱
- toolbox 是否列出所有已註冊積木
- generator 是否取用正確的 input／field 名稱
- mutation 產生的動態 input 是否與 generator 一致
- output／statement connection 是否符合 generator 回傳型態

### 3.2 明確對帳缺口

#### `py_text_zfill`

- 積木定義：`ui/src/modules/core/text/text_blocks.js`
- generator：`ui/src/modules/core/text/text_generators.js`
- 修正：已加入 `ui/src/modules/core/text/toolbox.xml`，並提供預設文字 shadow `7`
- 判定：既有功能曝光缺漏已排除，不是新功能需求
- 功能：將文字左側補上 `0` 至指定寬度，例如 `"7".zfill(3)` 產生 `"007"`；適合固定寬度的編號、檔名或資料欄位，不是數值四捨五入或小數格式化。

#### `py_math_single`

- 積木 dropdown 提供 `math.sqrt`、`abs`、`math.sin`、`math.cos`、`math.tan`、`math.degrees`、`math.radians`
- generator 直接呼叫選定函式
- 現已依 `math.*` 操作注入 `import math`
- 不可達的 `math.atan2` 分支已移除，atan2 統一由獨立積木處理

#### `py_io_serial_flush`

- 積木是 statement block
- PC 產碼使用 `ser.reset_input_buffer()` 合理
- MicroPython 現已使用 `sys.stdin` 與 `uselect.poll()` 排空目前可讀字元，並清除 `_cocoya_serial_buf`
- PC 仍使用 `ser.reset_input_buffer()`
- 兩個分支都由同一個 `py_io_serial_flush` 積木依平台產生

#### tuple

目前 generator 以括號包住元素：

```python
(x, y)
```

但只有一個元素時必須保留尾逗號：

```python
(x,)
```

零元素則應為：

```python
()
```

## 4. PC 與 MicroPython 平台分流

### 4.1 現有規則

平台分流應維持以下責任邊界：

- 整個模組不支援某平台：修改 `core_manifest.json` 的 `platforms`。
- 只有單一積木不支援某平台：在 toolbox 的 `<block>` 加 `platform="PC"` 或 `platform="MicroPython"`。
- 積木在兩平台都存在但 API 不同：保留同一積木，由 generator 依 `generator.PLATFORM` 分支。
- 不應把 Python 語法相容性判斷放到 `bridge.capabilities`；bridge capabilities 是環境能力，不是 Blockly 語言平台。

### 4.2 目前已知風險

#### raw Python 積木

`core/coding/toolbox.xml` 目前讓 raw statement 與 raw expression 在兩個平台都可見。這些積木本身無法驗證使用者輸入的程式碼是否適合 MicroPython。

產品決策：保留雙平台顯示，因 raw Python 積木的目的就是提供高彈性；使用者輸入的內容由使用者自行負責平台相容性。應補充清楚的說明文案與 tooltip，不應因無法靜態判斷而隱藏積木。

#### serial flush

目前這是最明確的跨平台產碼錯誤。不能只依賴使用者知道 `ser` 是 PC 物件；MicroPython toolbox 若顯示該積木，就必須產生 MicroPython 可執行語意。

### 4.3 工作區還原

既有 XML 還原流程已建立「先依 XML 平台切換，再建立 workspace」的契約，應保留此順序，避免平台專屬積木尚未註冊時被建立成空積木。

## 5. i18n 檢查

### 5.1 已確認完整部分

核心 11 個模組目前都有：

- `i18n/zh-hant.js`
- `i18n/en.js`

大部分積木 message、tooltip 與 toolbox 分類使用 i18n placeholder。

### 5.2 已確認缺漏或疑似缺漏

#### SPIKE 顏色 key 不一致

目前繁中與英文核心語系對 SPIKE 感測器顏色的命名不同：

- 繁中：`COLOUR_SPIKE_SENSOR_COLOR`
- 英文：`COLOUR_SPIKE_SENSOR`
- SPIKE 積木程式碼另有更細分的感測器顏色 key

應選定單一命名規則，並讓：

- `ui/src/zh-hant.js`
- `ui/src/en.js`
- `ui/src/modules/spike/spike_blocks.js`
- 三個主題的覆寫資料

使用同一組 key。

#### atan2 tooltip

`py_math_atan2` 的 tooltip 直接寫繁中，應移到核心 i18n，至少建立：

- `MATH_ATAN2_TOOLTIP` 繁中
- `MATH_ATAN2_TOOLTIP` 英文

#### 核心分類名稱與原語法文字

繁中核心分類與積木中的 Python 原語法文字刻意保留英文，原因是對應 Python／MicroPython 原生語法與教學專用術語。這不是 i18n 缺漏，規格已在 `docs/system_spec.html` 的 Python 語法教學術語策略中註記。積木用途說明與 tooltip 仍需提供雙語。

## 6. 三個主題檢查

### 6.1 Light

Light 使用 Blockly Classic，主要依核心語系的 `COLOUR_*` fallback。沒有 `msgColours` 不代表缺陷，但需確認所有核心色碼在兩種語系都存在且是有效色值。

### 6.2 Dark

Dark 使用完整的 Blockly component styles 與 CSS 規則，未使用獨立 `msgColours`。目前應視為「沿用核心色碼」的設計，而非必須逐一複製所有顏色。

需測試：

- toolbox 分類仍可見
- 核心積木顏色不為 undefined
- icon filter 不影響積木欄位辨識

### 6.3 Candy

Candy 有 `msgColours`。本次已補齊 SPIKE 類別與子分類顏色：

- `SPIKE`
- `SPIKE_MOTOR`
- `SPIKE_MUSIC`
- `SPIKE_LED`
- `SPIKE_SENSOR_*`
- `SPIKE_BUTTON`

後續仍需以主題測試確認所有 key 均為有效色值。

Light 與 Dark 沒有獨立 `msgColours` 時，仍可沿用核心語系色碼 fallback；這與 Candy 的專屬覆寫策略並不衝突。

## 7. 是否需要新增積木

### 7.1 本輪結論

目前不建議立即新增積木。現階段最重要的是修正既有積木的：

- toolbox 曝光
- 平台限制
- 產碼正確性
- i18n 對等性
- 主題顏色 key 對等性

`py_text_zfill` 是既有積木未曝光，不算新增積木。

### 7.2 後續候選

完成本報告的修正與測試後，可依教學需求評估：

- `try/finally`
- `pass` 或空操作
- `del`
- 更完整的 dictionary 操作
- set 相關操作

每個候選都必須先確認 PC 與 MicroPython 語意，再同步完成 block、generator、toolbox、雙語 i18n、三主題色彩與測試。

## 8. 架構是否需要修改

### 8.1 不需要重寫的部分

目前下列架構已足夠：

- manifest 的模組平台過濾
- toolbox 的單一積木平台過濾
- generator 的 `PLATFORM` 分支
- XML 還原前的平台切換
- `Blockly.Python` 作為共用產生器入口

不建議新增第三種平台判定來源，也不建議將語法相容性移到 bridge。

### 8.2 建議新增的驗證層

應新增一組「核心積木契約檢查」，而不是新的 runtime registry。檢查至少包含：

1. block 定義 ID 與 generator ID 對等。
2. toolbox 中的 block ID 都已註冊。
3. 已註冊且需公開的 block 都有 toolbox 入口。
4. generator 使用的 field/input 名稱存在於 block 定義或 mutation。
5. zh-hant/en 的 message、tooltip、分類與顏色 key 對等。
6. 三個主題的覆寫 key 都是有效核心 key。
7. 平台限制與 generator 的平台分支一致。

### 8.3 Manifest 資源同步

目前不是由另一個腳本重新產生 manifest，而是採單一來源加建置複製：

- `ui/src/core_manifest.json`
- `src-tauri/resources/core_manifest.json`

`ui/src/core_manifest.json` 是唯一編輯來源。VSIX 由 `src/cocoyaManager.ts` 直接讀取；Tauri 由 `src-tauri/tauri.conf.json` 的 `bundle.resources` 在打包時複製到 Resource。`src-tauri/resources/core_manifest.json` 是建置輸出，不應手工編輯。若未來需要顯式同步命令，應由 UI SSOT 複製到該位置，並掛在 Tauri build 前置流程，而不是反向維護兩份內容。

## 9. 建議執行階段

### Phase 1：建立基線對帳

- 掃描所有核心 `*_blocks.js`、`*_generators.js`、`toolbox.xml`。
- 建立 block ID、toolbox ID、generator ID 對照。
- 補檢查 imperative block 與 mutation block。
- 建立 zh/en message、tooltip、colour key parity 檢查。
- 建立主題 key fallback 檢查。

### Phase 2：修正確定缺陷

建議順序：

1. 補 `py_text_zfill` toolbox。
2. 修 `py_math_single` 的 `import math`。
3. 決定並修正 serial flush 的 MicroPython 政策。
4. 修正單元素 tuple。
5. 統一 SPIKE 顏色 key。
6. 移除不可達的 atan2 分支。
7. 將 atan2 tooltip i18n 化。
8. 補 raw coding block 的雙語說明與 tooltip，保留雙平台顯示並明確標示使用者自行負責相容性。

### Phase 3：建立回歸測試

已建立 `ui/src/modules/core/core_generators.test.mjs`，4/4 PASS，覆蓋：

- zfill toolbox 可見性
- math single 的 import
- PC/MicroPython serial flush 產碼
- tuple 零元素、單元素、多元素
- block/toolbox/generator 三方對帳
- zh-hant/en key parity
- 三主題 colour key parity
- MicroPython 產碼不含不應出現的 `ser`／`pyserial`

### Phase 4：建置與手動驗證

```powershell
cd c:\Workspace\cocoya\ui
node --test "src/app/*.test.mjs"
node --test "src/modules/core/*.test.mjs"
npm run build
cd ..
npm run compile
```

各變更 JavaScript 檔案另執行 `node --check`。若新增 Python 產碼測試，PC 輸出應以 `py_compile` 驗證；MicroPython 輸出至少做語法與平台 API 字串契約檢查。

## 10. 驗證矩陣

| 情境 | 應驗證內容 |
|---|---|
| PC 平台 | math single 產生 `import math`；serial 使用 `ser`；tuple 正確 |
| MicroPython 平台 | toolbox 不顯示 PC-only 積木；產碼不引用 PC `ser` 或 `pyserial` |
| zh-hant | 分類、tooltip、SPIKE 顏色 key 均可解析 |
| en | 分類、tooltip、SPIKE 顏色 key 均可解析，無 undefined |
| Light | 核心色碼與 fallback 正常 |
| Dark | 深色 component styles、icon 與 toolbox 正常 |
| Candy | 核心與 SPIKE 顏色覆寫或 fallback 行為明確且正常 |
| XML 還原 | 先切換 XML 指定平台，再建立 workspace，無空積木 |

## 11. 最終判定

1. **外觀與 generator**：整體結構完整，但缺少自動化三方對帳；已發現 zfill、math import、tuple 等具體問題。
2. **PC／MicroPython**：現有分流架構正確，但 serial flush 與 raw coding 顯示政策需要修正或明確限制。
3. **i18n 與三主題**：核心模組語系檔大致齊全，但 SPIKE 顏色 key、硬編碼 tooltip、繁中分類名稱需要整理；Candy 的 SPIKE 覆寫不完整。
4. **新增積木**：目前不建議立即新增；先完成既有積木正確性與契約測試。
5. **架構**：不需要重寫 loader、toolbox 或 generator；應新增可測的核心積木契約檢查層，並確認雙 manifest 的同步策略。

**建議優先處理順序：高優先級產碼與平台錯誤 → block/toolbox 遺漏 → i18n key 對齊 → 主題完整性 → 新積木需求評估。**

## 12. 新增核心語法積木（2026-09-25）

本次已依原待辦新增核心語法積木，所有產碼都使用 Python 與 MicroPython 共同支援的語法或內建容器方法，不需要額外套件。

### 控制流程與變數

- `py_try_finally`：產生 `try ... finally`；`finally` 無論 try 區塊是否發生例外都會執行，適合教學中的清理、關閉資源與狀態復原。
- `py_logic_pass`：產生 `pass`；用於函式、條件或例外區塊暫時留空，但仍需保留合法 Python 語句的情境。
- `py_variables_del`：產生 `del variable`；示範刪除目前作用域的變數名稱。未提供自動復原，避免初學者誤以為只是清空變數值。
- Variables 分類使用 Blockly `custom="VARIABLE"` callback 動態建立內容；因此 `py_variables_del` 除了 XML toolbox 外，也必須註冊於 `ui/src/app/workspace.js::registerVariablesCallback()`，否則會被動態分類內容覆蓋。

### Dictionary

新增常見且可在兩平台使用的操作：

- `get(key, default)`：安全讀取，鍵不存在時回傳預設值。
- `del dict[key]`：刪除指定鍵和值。
- `dict.update(other)`：合併另一個字典的鍵和值。
- `dict.clear()`：清空字典。
- 既有 keys／values 操作擴充為 items，形成建立、讀取、修改、刪除、列舉、更新與清空的基本教學閉環。

### Set

新增集合 literal、加入、移除、清空與集合運算：

- 空集合固定產生 `set()`；不可產生 `{}`，因為 `{}` 在 Python 中是空字典。
- 非空集合產生 `{a, b}`，重複元素由 Python 集合語意自動去重。
- 移除使用 `discard`，項目不存在時不拋出例外，較適合作為初學教學預設。
- 集合運算提供 `union`、`intersection`、`difference`。

### 驗證

- 新增 `ui/src/modules/core/core_generators.test.mjs`。
- 核心 generator 測試 7/7 PASS。
- 既有 `src/app/block_jsoninit.test.mjs` PASS。
- 新增 blocks、generators、toolbox、i18n 均完成語法與結構檢查。

## 13. 核心積木契約驗證層（2026-09-25）

已新增 `ui/src/modules/core/core_contract.test.mjs`，作為 Node 建置測試的一部分。此測試不是 runtime registry，而是靜態對帳層，驗證：

- core block 定義、generator 與 toolbox block ID 對等。
- core toolbox 可引用其他 core module 的 shadow block。
- Variables 的 `custom="VARIABLE"` dynamic callback 也納入公開積木對帳。
- 使用 `itemCount_` 的 mutation block 必須同時提供 `mutationToDom` 與 `domToMutation`。
- toolbox platform 只使用 `PC`／`MicroPython`，且不得超出該模組 manifest 平台。
- toolbox 的 zh-hant／en placeholder 都能找到對應 key。
- block 使用的核心 `COLOUR_*` key 在中英文核心語系存在。
- 三個主題的 `msgColours` key 都對應已註冊的核心顏色 key。

驗證結果：核心契約 4/4、核心 generator 與新增語法測試 7/7、全模組 `block_jsoninit` 1/1、UI build PASS、Extension compile PASS。
