# SPIKE Prime 支援現況說明（凍結狀態）

> 狀態：**凍結（實驗性支援）**——保留現有成果，只修不增。
> 決策日期：2026-09-09（與使用者討論結論）。
> 決策理由：LEGO 官方 IDE（SPIKE App）與 code.pybricks.com 已足夠成熟；官方 API 無文件可查、維護成本高；Cocoya 開發火力集中於核心四板（Pico / Maker Pi / XIAO / micro:bit）。
> Cocoya 的 spike 價值定位：積木入門＋跨硬體統一流程（偵測→上傳→監看），純文字碼開發請用官方 IDE。

## 已完成並可用的部分

| # | 內容 | 檔案 |
|---|------|------|
| 1 | 偵測：0694:0009（實測值，官方/Pybricks 韌體同 VID/PID）→ boardId `spike-prime`，下拉正確顯示名稱 | `src-tauri/src/commands/mcu.rs`（`detect_board_id`）、`src/handlers/serialOps.ts`（boardIdMap 有 0694 標籤） |
| 2 | `board_defs.js` 有 `spike-prime` 條目（pins 留空：SPIKE 無 GPIO，走 Port A~F 專屬積木）→ board_init 下拉有 SPIKE Prime | `ui/src/modules/hardware/board_defs.js` |
| 3 | spike 積木**韌體雙模式**（`spike_init_hub` 的 FIRMWARE 下拉：官方 SPIKE 3 / Pybricks）：模式掃描工作區 init_hub（`getAllBlocks`，非 top block），import 經 `definitions_` 注入；修掉原版「無 import」「wait_button 產生不存在函式」兩個缺陷 | `ui/src/modules/spike/spike_blocks.js`、`spike_generators.js`、i18n ×2；原版備份 `backup/spike_generators_pre_dual_20260909.js` |
| 4 | 官方韌體上傳通道 `official_spike.py`（探測優先：Raw → 逐行送入），`deploy_mcu.py --board-type` 加 `spike-official`；LEGO 系 VID 走 `auto` 由 `detect_board()` REPL 握手分流；`pybricks.py` 加 REPL 回聲確認防誤判 | `resources/deploy/official_spike.py`、`__init__.py`、`base.py`（`detect_board`）、`pybricks.py`、`deploy_mcu.py`、`src-tauri/src/commands/mcu.rs`（`detect_board_type`） |

## 已知限制（實機待驗）

1. 官方模式 `display.text` / `speaker.play_notes` / `speaker.beep` 簽名、`button.pressed()` 回傳字串大小寫、IMU 以 `motion_sensor.get_acceleration()` 分量近似傾斜——均以常識推寫，**未實機驗證**（程式碼內標 `実機検証`）。
2. 官方韌體 REPL 多行上傳（行式逐行送入）在 COM8 的零星測試外未做完整迴歸。
3. micro:bit 的 `Pin(n)=pin_n` 語義假設同理待驗（不同板，同類問題）。

## Pybricks 韌體支援（未來里程碑，未開工）

- 背景：Pybricks 韌體走 **WinUSB/WebUSB**（非 CDC-ACM），Windows 不建立 COM 埠，現行 pyserial 鏈路碰不到 hub（log/work/2026-09-07.md 第三輪有完整診斷）。
- 要做：Rust `nusb`/`rusb` WinUSB 傳輸層 ＋ Pybricks USB 協議 ＋「偵測到 LEGO hub 但無 COM」UI 提示。
- **啟動條件**：先在目標機器跑 `pip install pybricksdev --pre`＋`pybricksdev run usb <程式.py>` 一次成功；教室驅動（Zadig/udev）問題先排除，否則不必開工。
- 過渡期：Pybricks 模式積木可生成完整代碼，貼到 `code.pybricks.com` 執行。

## 相關日誌索引（重啟時由此進入）

| 日期 | 檔案 | 內容 |
|------|------|------|
| 2026-09-06 | `log/work/2026-09-06.md`（末段） | board_init 架構定案（board_init 宣告＝工作區板子 SSOT、上傳比對、範例 XML 批次） |
| 2026-09-07 晨 | `log/work/2026-09-07.md`（前段） | 開發板偵測除錯：deploy/ 打包坑、`_applyBoardFromPort`、serial 下拉「(無序列埠)」鐵壁版根治（trigger.textContent，不依賴 span query、避開 applyI18n 重置） |
| 2026-09-07 | `log/work/2026-09-07.md`（第二輪） | 按鈕拆分（偵測板子/序列監看 toggle）＋Rust `toggle_serial_monitor`＋`serial-monitor-stopped`/`serial-ports-changed`＋1.5s 熱插拔輪詢＋Micro:bit＋board_init 帽子積木（hat=cap）＋初始積木座標重排＋SSH Enter 連線 |
| 2026-09-09 | `log/work/2026-09-07.md`（第三輪） | Pybricks 韌體 WinUSB 診斷（本質限制非 bug）、刷回官方韌體決策、PID 0009 實測 |
| 2026-09-09 | `log/work/2026-09-07.md`（第四輪） | 官方韌體上傳失敗診斷（行式 REPL 被整包貼上）＋ `official_spike.py` 探測優先部署器＋路由修正（0694 走 auto） |
| 2026-09-09 | `log/work/2026-09-07.md`（本輪） | spike 雙模式產生器＋board_init 清單＋凍結決策（含官方 API 兩代差異分析） |
| 任務清單 | `log/todo.md`（尾段） | [2026-09-09] SPIKE 條目＋実機検証待辦＋Pybricks 里程碑待辦 |
| 舊計畫 | `log/plan/SpikeModuleDesign.md` | 最初的 Spike 模組開發計畫（Pybricks 導向，已被後續決策部分取代） |

## 凍結實作方式（解凍時移除以下機制即可）

**Toolbox 隱藏**：`ui/src/utils/toolbox.js` 的 `filterToolboxXML` 函數開頭有下列判斷。整個 SPIKE 工具箱以 "SPIKE" 命名分類包裹，偵測到即整組剔除（直接回傳空字串，不進 DOMParser，避免 Blockly "Ignoring unknown tag: BLOCK" 警告）：

```javascript
// 凍結：剔除 SPIKE 分類（2026-09-09，詳 log/plan/SpikeSupportStatus.md）
// 整個 SPIKE 工具箱以 "SPIKE" 命名分類包裹，偵測到即整組剔除
if (xmlString.indexOf('SPIKE') !== -1) {
    return '';
}
```

**解凍步驟**：
1. 刪除上述 3 行（含註解）
2. 重新 build（`npx vite build`）→ SPIKE 分類自動回到 toolbox
3. 不需動其他檔案（blocks.js / generators.js / i18n 都還在本模組目錄）

**⚠️ 邊緣風險**：未來新增模組時，若其 `toolbox.xml` 任何屬性或文字包含 "SPIKE" 字串（例如積木命名 "SPIKE Sensor"），會被此判斷誤殺。實務上 LEGO SPIKE 是專有名詞，極少發生；若發生，把該模組改名或拿掉 "SPIKE" 字樣即可。

## 重啟檢查清單（未來解凍時）

1. 先讀本文件＋上表日誌（尤其第四輪的 REPL 行式特性與第三輪的 WinUSB 診斷）。
2. 依上方「解凍步驟」移除 `toolbox.js` 的 SPIKE 過濾。
3. 實機先跑：偵測（tooltip 應見 `0694:0009`）→ 官方模式上傳 test.xml（終端機應見 `[Detected: spike-official]`）→ 顯示/聲音/按鈕/IMU 逐項對 API。
4. 再決定：補官方 API 細節，或啟動 Pybricks WinUSB 里程碑（先跑 `pybricksdev run usb` 驗證）。
