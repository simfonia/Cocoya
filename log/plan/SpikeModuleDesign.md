# Lego SPIKE Prime 模組開發計畫

**建立日期**：2026-09-03
**狀態**：規劃完成，待實作
**設計文件**：`log/plan/SpikeModuleDesign.md`

---

## 摘要

新增 `spike` 積木模組，支援 Lego SPIKE Prime 機器人，使用 Pybricks 第三方 MicroPython 韌體。

## 計畫內容

### 韌體選擇

採用 **Pybricks** 第三方韌體，原因：
- 高層次 API，適合初學者
- 簡潔的馬達/感測器抽象
- 與 Cocoya 透過 Blockly 產生 MicroPython 代碼的理念一致
- 支援 SPIKE Prime、Technic Hub、BOOST、City Hub、Robot Inventor

### 上傳機制重構

現有 `deploy_mcu.py` 使用 Serial Raw REPL 上傳（~268 行）。
Pybricks 使用不同協定，因此需重構為模組化結構：

```
resources/deploy/
├── __init__.py          # Factory + 共同工具
├── base.py              # 序列埠偵測、Monitor 等共用功能
├── micropython.py       # MicroPython Raw REPL 上傳（現有邏輯）
└── pybricks.py          # Pybricks SPIKE 上傳（新增）
```

向後相容：`deploy_mcu.py` 保留為 CLI 入口 thin wrapper。

### Toolbox 設計

使用 Blockly 原生巢狀 `<category>` 實現多層分類：

```
📁 Lego SPIKE Prime
├── 📁 初始化
├── 📁 馬達控制
├── 📁 顏色感測器
├── 📁 距離感測器
├── 📁 力道感測器
├── 📁 Hub 內建（螢幕/按鈕/IMU）
└── 📁 工具
```

### 積木清單

#### 初始化
- `spike_init_hub` - 初始化 Hub
- `spike_motor_init` - 初始化馬達（端口 A-F，Large/Medium）
- `spike_color_init` - 初始化顏色感測器
- `spike_distance_init` - 初始化距離感測器
- `spike_force_init` - 初始化力道感測器

#### 馬達控制
- `spike_motor_run` - 以速度運轉
- `spike_motor_run_angle` - 轉到指定角度
- `spike_motor_run_target` - 轉到目標角度（絕對/相對）
- `spike_motor_stop` - 停止（煞車/慣性）
- `spike_motor_angle` - 取得當前角度

#### 感測器
- `spike_color_detect` - 偵測顏色
- `spike_color_reflection` - 反射率
- `spike_color_ambient` - 環境光
- `spike_distance_get` - 距離（mm）
- `spike_force_pressed` - 是否被按壓
- `spike_force_force` - 力道（N）

#### Hub 內建
- `spike_display_text` - 螢幕顯示文字
- `spike_display_clear` - 清除螢幕
- `spike_button_pressed` - 按鈕狀態
- `spike_wait_button` - 等待按鈕按下
- `spike_play_note` - 播放音符
- `spike_play_beep` - 嗶聲
- `spike_imu_tilt` - 傾斜角度
- `spike_imu_up` - 判斷朝向

#### 工具
- `spike_wait` - 等待（毫秒）

### 檔案結構

```
ui/src/modules/spike/
├── spike_blocks.js        # 積木定義
├── spike_generators.js    # Python 產生器
├── toolbox.xml            # Toolbox 分類
└── i18n/
    ├── zh-hant.js         # 繁體中文
    └── en.js              # 英文
```

### 產生器輸出範例

```python
from pybricks.hubs import PrimeHub
from pybricks.pupdevices import Motor, ColorSensor
from pybricks.parameters import Port, Color, Stop
from pybricks.tools import wait

hub = PrimeHub()
left_motor = Motor(Port.A)
color_sensor = ColorSensor(Port.B)

left_motor.run(500)
detected = color_sensor.color()
if detected == Color.RED:
    hub.display.text('Red!')
    hub.speaker.play_notes(['C4/4', 'E4/4'])
left_motor.stop()
```

## 開發階段

### Phase 0：基礎設施
- [ ] 重構 deploy_mcu.py 為模組化結構
- [ ] 新增 deploy/pybricks.py 上傳支援
- [ ] 更新 serialOps.ts / mcu.rs 的 VID/PID 偵測（Pybricks hub）

### Phase 1：Hub + 馬達基礎控制
- [ ] spike_init_hub
- [ ] spike_motor_init
- [ ] spike_motor_run
- [ ] spike_motor_stop
- [ ] spike_motor_angle
- [ ] Toolbox + i18n + Help

### Phase 2：感測器積木
- [ ] 顏色感測器積木
- [ ] 距離感測器積木
- [ ] 力道感測器積木

### Phase 3：Hub 內建設備
- [ ] 螢幕顯示
- [ ] 按鈕
- [ ] 喇叭
- [ ] IMU

### Phase 4：進階功能
- [ ] 彩色積木（檔案 >2KB 時的替代方案）
- [ ] 完整範例檔

## 參考資料

- [Pybricks 官網](https://pybricks.com/)
- [Pybricks API 文件](https://docs.pybricks.com/)
- [Pybricks GitHub](https://github.com/pybricks/pybricks-micropython)
- [LEGO SPIKE Prime 官網](https://education.lego.com/en-us/product-resources/spike-prime/)

## 相關任務

- 完成 Dataset Manager Phase 6 收尾（手動測試待辦）
- Tauri Release 訓練範例實機驗證