"""
循線資料集處理模組
讀取 images/ + lines/（Dataset Manager 匯出），提供回歸切分與 tf.data.Dataset pipeline。

目錄結構（Dataset Manager 匯出）：
    dataset_dir/
    ├── images/        (jpg/png 影像)
    ├── lines/         (每張標註影像一個同名 .txt，一行: x1 y1 x2 y2 歸一化比例座標)
    └── dataset.json   (Dataset Spec)

line 標註無類別欄位（class_id 恆 0）→ 屬回歸型任務，依規範採隨機切分
（seed 固定確保再現性），報告需註明「無類別欄位（回歸），隨機切分」。
"""

import os
import sys
import numpy as np
import tensorflow as tf

AUTOTUNE = tf.data.AUTOTUNE


def load_line_dataset(dataset_dir, img_size=224, batch_size=32, validation_split=0.2, seed=123):
    """
    載入循線資料集。

    Returns:
        (train_ds, val_ds, meta)
        - train_ds: tf.data.Dataset，元素為 (image_batch, line_batch)
          line_batch shape: (batch, 4)，值為 [x1, y1, x2, y2] 歸一化座標
        - val_ds: 驗證集 Dataset（或 None）
        - meta: dict 含 sample_count / class_counts
    """
    images_dir = os.path.join(dataset_dir, 'images')
    lines_dir = os.path.join(dataset_dir, 'lines')

    if not os.path.exists(images_dir):
        print(f"錯誤: 找不到 images 目錄 {images_dir}")
        sys.exit(1)

    if not os.path.exists(lines_dir):
        print(f"錯誤: 找不到 lines 目錄 {lines_dir}（請先在 Dataset Manager 標註線段並匯出）")
        sys.exit(1)

    # 掃描所有影像與對應線段標註
    image_paths = []
    lines = []

    image_extensions = ('.jpg', '.jpeg', '.png', '.webp', '.bmp')
    for fname in sorted(os.listdir(images_dir)):
        if not fname.lower().endswith(image_extensions):
            continue

        img_path = os.path.join(images_dir, fname)
        txt_name = os.path.splitext(fname)[0] + '.txt'
        txt_path = os.path.join(lines_dir, txt_name)

        if not os.path.exists(txt_path):
            continue  # 未標註影像直接跳過（匯出端已統計比例）

        with open(txt_path, 'r', encoding='utf-8') as f:
            parts = f.read().split()

        if len(parts) < 4:
            print(f"警告: 線段格式錯誤 {txt_path}，跳過此影像")
            continue

        x1, y1, x2, y2 = (float(p) for p in parts[:4])
        image_paths.append(img_path)
        lines.append([x1, y1, x2, y2])

    if len(image_paths) < 2:
        print(f"錯誤: 有效標註樣本僅 {len(image_paths)} 筆（至少需要 2 筆才能切分訓練/驗證集）")
        sys.exit(1)

    print(f"找到 {len(image_paths)} 張已標註影像（線段回歸任務）")

    # === 回歸型：隨機切分（無類別欄位，依規範允許，報告需註明） ===
    lines = np.array(lines, dtype=np.float32)
    if validation_split > 0:
        import random
        rng = random.Random(seed)
        indices = list(range(len(image_paths)))
        rng.shuffle(indices)
        n_val = int(round(len(indices) * validation_split))
        # 教學保護：樣本 >= 2 時，驗證/訓練各至少 1 筆
        n_val = max(1, min(n_val, len(indices) - 1))
        val_idx = np.array(indices[:n_val])
        train_idx = np.array(indices[n_val:])

        if len(val_idx) == 0 or len(train_idx) == 0:
            print("錯誤: 切分後訓練集或驗證集為空，請增加樣本數或降低 validation_split")
            sys.exit(1)

        print("隨機切分 (random split，無類別欄位（回歸），隨機切分):")
        print(f"  train {len(train_idx)} / val {len(val_idx)}")

        rng.shuffle(train_idx)
        rng.shuffle(val_idx)

        train_paths = [image_paths[i] for i in train_idx]
        train_lines = lines[train_idx]
        val_paths = [image_paths[i] for i in val_idx]
        val_lines = lines[val_idx]
    else:
        print("  validation_split=0，不使用驗證集")
        train_paths = list(image_paths)
        train_lines = lines
        val_paths = []
        val_lines = None

    # 解碼影像函數（與 detector 同前處理：resize + /255，座標系不變）
    def load_and_preprocess(path, line):
        image = tf.io.read_file(path)
        image = tf.io.decode_jpeg(image, channels=3)
        image = tf.image.resize(image, [img_size, img_size])
        image = tf.cast(image, tf.float32) / 255.0
        return image, line

    def make_ds(paths, line_values, shuffle):
        ds = tf.data.Dataset.from_tensor_slices((list(paths), line_values))
        if shuffle:
            ds = ds.shuffle(buffer_size=len(paths), seed=seed, reshuffle_each_iteration=True)
        ds = ds.map(load_and_preprocess, num_parallel_calls=AUTOTUNE)
        return ds.batch(batch_size).prefetch(AUTOTUNE)

    train_ds = make_ds(train_paths, train_lines, shuffle=True)
    val_ds = make_ds(val_paths, val_lines, shuffle=False) if val_paths else None

    meta = {
        'sample_count': len(image_paths),
        'class_counts': {'line': len(image_paths)}
    }
    return train_ds, val_ds, meta


def create_line_augmentation(enabled=True):
    """
    循線專用資料擴增：僅亮度/對比（不改變幾何，避免線段座標失真）。
    與 detector_augmentation 同策略。
    """
    if not enabled:
        return tf.keras.Sequential()

    return tf.keras.Sequential([
        tf.keras.layers.RandomBrightness(0.1),
        tf.keras.layers.RandomContrast(0.2),
    ])


def prepare_line_dataset(dataset, augmentation=None, augment_enabled=True):
    """對循線資料集套用資料擴增（僅影像，座標不動）。"""
    if augmentation is not None and augment_enabled:
        dataset = dataset.map(
            lambda x, y: (augmentation(x, training=True), y),
            num_parallel_calls=AUTOTUNE
        )
    return dataset.prefetch(buffer_size=AUTOTUNE)