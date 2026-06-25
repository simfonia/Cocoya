# Cocoya AI 模組開發規範與踩坑記錄

> 建立日期：2026-06-24
> 依據 Phase 5 MVP 驗證過程的實際經驗整理

---

## 1. 架構與平台規範

### 1.1 DGX Spark 為 ARM64 架構

| 項目 | 說明 |
|------|------|
| **CPU 架構** | ARM64 (aarch64)，非一般桌機的 AMD64 (x86_64) |
| **影響** | Docker 映像須使用 ARM64 版本，TensorFlow/PyTorch 套件也須為 ARM64 |
| **解決方案** | 使用 NVIDIA NGC 提供的 ARM64 容器（如 `nvcr.io/nvidia/pytorch:25.04-py3`） |

### 1.2 跨平台檔案路徑

| 情境 | 正確做法 | 避免 |
|------|---------|------|
| Python 本機路徑 | `os.path.join()` | 直接寫死反斜線 `/` 或 `\` |
| SSH 指令中的 `~` | `ssh.exec_command('echo $HOME')` 先取得家目錄 | 直接在 SSH 指令中用 `~` |
| SFTP 檔案路徑 | **絕對路徑**（SFTP 不支援 `~`） | `sftp.stat('~/path')` |
| Windows → Linux 傳輸 | 在 Windows 用 `/` 斜線 | Windows 的 `\` |

### 1.3 主機名稱取得（跨平台）

```python
# ✅ 跨平台正確寫法
import socket
MACHINE_ID = socket.gethostname()

# ❌ Windows 不支援
MACHINE_ID = os.uname().nodename  # Windows 無此函式
```

---

## 2. 訓練容器規範

### 2.1 Dockerfile 寫法

```dockerfile
# ✅ 正確：使用 NGC ARM64 容器
FROM nvcr.io/nvidia/pytorch:25.04-py3

# ❌ 錯誤：AMD64 容器在 ARM64 DGX 上無法執行
FROM tensorflow/tensorflow:2.13.0-gpu  # 無 ARM64 版本
```

### 2.2 TFLite 轉換限制

| 平台 | TFLite 轉換 | 說明 |
|------|------------|------|
| 本地 PC (AMD64) | ✅ 支援 | `tf.lite.TFLiteConverter.from_keras_model()` |
| DGX (ARM64) | ❌ 不相容 | TensorFlow 2.16 on ARM64 的 `get_call_context_function()` bug |

**解決方案**：容器內只訓練並儲存 Keras 模型（`.keras`），TFLite 轉換在本地 PC 進行。

### 2.3 訓練腳本參數化

訓練腳本應支援命令列參數，以便 Sidecar 傳入超參數：

```python
import argparse
parser = argparse.ArgumentParser()
parser.add_argument('--epochs', type=int, default=20)
parser.add_argument('--batch_size', type=int, default=32)
parser.add_argument('--lr', type=float, default=0.001)
args = parser.parse_args()
```

---

## 3. 資料集規範

### 3.1 資料夾結構

```
dataset/{project_name}/
├── label_a/
│   ├── label_a_001.jpg
│   └── ...
├── label_b/
│   ├── label_b_001.jpg
│   └── ...
└── none/       # 建議加入背景/負樣本類別
    ├── none_001.jpg
    └── ...
```

- 子目錄名 = label 名稱（與 Dataset Manager `image` 類型一致）
- 支援 `*.jpg`, `*.jpeg`, `*.png`

### 3.2 建議加入 `none/` 類別

- 拍攝「沒有手勢/物體」的背景照片
- 讓模型學會「沒有目標時不亂猜」
- 建議比例：none 佔總資料量的 10~20%

### 3.3 資料不平衡處理

使用 `sklearn.utils.class_weight` 自動計算權重：

```python
from sklearn.utils import class_weight
import numpy as np

train_label_indices = []
for _, label_batch in train_ds:
    train_label_indices.extend(np.argmax(label_batch.numpy(), axis=1).tolist())

class_weights = class_weight.compute_class_weight(
    class_weight='balanced',
    classes=np.unique(train_label_indices),
    y=np.array(train_label_indices)
)
class_weight_dict = dict(enumerate(class_weights))
```

### 3.4 labels.txt 寫入順序

```python
# ✅ 正確：使用 sorted() 確保順序與模型一致
labels = sorted([d for d in os.listdir(DATASET_DIR)
                 if os.path.isdir(os.path.join(DATASET_DIR, d))])

# ⚠️ 注意：不要在 labels 變數被覆蓋後才寫入
# 詳細 bug 說明見下方 4.1
```

---

## 4. 常見 Bug 與陷阱

### 4.1 變數覆蓋問題

```python
# ❌ 錯誤：for 迴圈覆蓋了 labels 變數
labels = ['none', 'paper', 'rock', 'scissors']
for _, labels in train_ds:  # labels 被覆蓋成 one-hot 陣列！
    ...
# 之後寫入 labels.txt 時會寫成 one-hot 陣列

# ✅ 修正：使用不同變數名稱
for _, label_batch in train_ds:
    train_label_indices.extend(...)
```

### 4.2 TFLite INT8 量化失敗

錯誤訊息：
```
'NoneType' object is not callable
TypeError: 'NoneType' object is not callable
```

**原因**：TensorFlow 2.16 on ARM64 的 `keras_deps.get_call_context_function()` bug。

**解決方案**：
1. 在容器內跳過 TFLite 轉換
2. 只在本地 PC（AMD64）進行轉換
3. 使用 Float32 而非 INT8 量化

### 4.3 SSH 路徑展開

```python
# ❌ 錯誤：SFTP 不支援 ~
sftp.stat('~/cocoya_ai/models/model.keras')  # FileNotFoundError

# ✅ 修正：先取得絕對路徑
stdin, stdout, stderr = ssh.exec_command('echo $HOME')
homedir = stdout.read().decode('utf-8').strip()
abs_path = f"{homedir}/cocoya_ai/models/model.keras"
sftp.stat(abs_path)  # 正常運作
```

### 4.4 Dataset Manager 標註格式對齊

| Dataset 類型 | 標註格式 | 對應積木模組 |
|-------------|---------|-------------|
| `image` | `{ label: "rock" }` | `ai_inference/classifier/` |
| `object_detection` | `{ bbox: [x,y,w,h] 正規化 0~1 }` | `ai_inference/detector/` |
| `line_following` | `{ line: [x1,y1,x2,y2] 正規化 0~1 }` | `ai_inference/line_follower/` |
| `feature`/`table` | CSV 欄位 | `ai_inference/table/` |

---

## 5. 模型輸出規範

### 5.1 三個模型的用途

| 檔案 | 格式 | 大小 | 用途 |
|------|------|------|------|
| `gesture_model.keras` | Keras 原生 | ~9 MB | ✅ 保留用於後續再訓練 |
| `gesture_model.tflite` | TFLite Float32 | ~8.5 MB | ✅ **部署用**：體積小、推論快 |
| `gesture_model_f32.tflite` | TFLite Float32 | ~8.5 MB | 備援（若有 INT8 版本則對比用） |

### 5.2 未來 Sidecar 下載協議

```
指令: downloadModel
參數: {
  projectName,
  taskType: "classifier",
  sshConfig,
  remoteModelDir,
  localOutputDir
}
回傳: { localModelPath: ".../gesture_model.keras" }
```

---

## 6. 開發順序建議

基於 MVP 驗證結果，建議的開發順序：

```
Phase 5 (MVP - 已完成) → Phase 1b (classifier積木) → Phase 2 (Sidecar擴充)
→ Phase 3 (Docker容器) → Phase 4 (PBL範例) → Phase 1a.c.d.e (其他任務類型)
```

### Phase 1 積木開發注意事項

1. **產生器內容**：直接參考 `03_inference_local.py` 的 Python 代碼
2. **支援雙後端**：`tflite_runtime` 和 `tensorflow.lite` 都要支援
3. **輸入型別偵測**：模型可能是 float32 或 uint8，產生器需自動處理
4. **labels 載入**：從 `labels.txt` 逐行讀取，而非寫死在積木中

---

## 7. SSH 連線最佳實踐

```python
# 取得遠端家目錄
stdin, stdout, stderr = ssh.exec_command('echo $HOME')
homedir = stdout.read().decode('utf-8').strip()

# 建立遠端目錄（用絕對路徑）
ssh.exec_command(f'mkdir -p "{homedir}/cocoya_ai/sessions/{project}"')

# 上傳檔案（SFTP 用絕對路徑）
sftp.put(local_path, f"{homedir}/cocoya_ai/sessions/{project}/file.zip")

# 執行指令（用 eval 展開 ~）
ssh.exec_command(f'eval ls -la "~/cocoya_ai/sessions/{project}"')

# 檢查指令執行結果
exit_status = stdout.channel.recv_exit_status()
```

---

*本文件將隨著開發進度持續更新。*