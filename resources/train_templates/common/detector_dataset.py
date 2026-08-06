"""
物件偵測資料集處理模組
讀取 YOLO 格式資料集（images/ + labels/），提供 tf.data.Dataset pipeline。
支援單一目標偵測（每張圖 1 個 bbox）。
"""

import os
import sys
import numpy as np
import tensorflow as tf

AUTOTUNE = tf.data.AUTOTUNE


def load_detector_dataset(dataset_dir, img_size=224, batch_size=32, validation_split=0.2, seed=123):
    """
    載入 YOLO 格式物件偵測資料集。

    預期目錄結構：
        dataset_dir/
        ├── images/        (jpg/png 影像)
        ├── labels/        (txt 標註，每行: class_id cx cy w h)
        └── labels.txt     (類別名稱，每行一個)

    Args:
        dataset_dir: 資料集根目錄
        img_size: 輸入影像尺寸（預設 224）
        batch_size: 批次大小
        validation_split: 驗證集比例（0.0~1.0）
        seed: 亂數種子

    Returns:
        (train_ds, val_ds, labels, class_counts)
        - train_ds: tf.data.Dataset，每個元素為 (image_batch, bbox_batch)
          bbox_batch shape: (batch, 4)，值為 [cx, cy, w, h] 歸一化座標
        - val_ds: 驗證集 Dataset（或 None）
        - labels: 類別名稱列表
        - class_counts: 各類別樣本數字典
    """
    images_dir = os.path.join(dataset_dir, 'images')
    labels_dir = os.path.join(dataset_dir, 'labels')
    labels_file = os.path.join(dataset_dir, 'labels.txt')

    if not os.path.exists(images_dir):
        print(f"錯誤: 找不到 images 目錄 {images_dir}")
        sys.exit(1)

    if not os.path.exists(labels_dir):
        print(f"錯誤: 找不到 labels 目錄 {labels_dir}")
        sys.exit(1)

    # 讀取類別名稱
    if os.path.exists(labels_file):
        with open(labels_file, 'r', encoding='utf-8') as f:
            labels = [line.strip() for line in f if line.strip()]
    else:
        # 若無 labels.txt，從標註檔案中推斷類別
        labels = []

    # 掃描所有影像與對應標註
    image_paths = []
    bboxes = []
    class_ids = []

    image_extensions = ('.jpg', '.jpeg', '.png', '.webp', '.bmp')
    for fname in sorted(os.listdir(images_dir)):
        if not fname.lower().endswith(image_extensions):
            continue

        img_path = os.path.join(images_dir, fname)
        label_name = os.path.splitext(fname)[0] + '.txt'
        label_path = os.path.join(labels_dir, label_name)

        if not os.path.exists(label_path):
            print(f"警告: 找不到標註檔案 {label_path}，跳過此影像")
            continue

        # 讀取 YOLO 標註（取第一個物件作為單一目標）
        with open(label_path, 'r') as f:
            lines = f.readlines()

        if len(lines) == 0:
            print(f"警告: 標註檔案為空 {label_path}，跳過此影像")
            continue

        # 解析第一行：class_id cx cy w h
        parts = lines[0].strip().split()
        if len(parts) < 5:
            print(f"警告: 標註格式錯誤 {label_path}，跳過此影像")
            continue

        cid = int(parts[0])
        cx, cy, w, h = float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])

        image_paths.append(img_path)
        bboxes.append([cx, cy, w, h])
        class_ids.append(cid)

        # 推斷類別名稱
        if cid >= len(labels):
            while len(labels) <= cid:
                labels.append(f'class_{len(labels)}')

    if len(image_paths) == 0:
        print("錯誤: 沒有有效的影像-標註配對")
        sys.exit(1)

    # 計算各類別樣本數
    class_counts = {}
    for cid in class_ids:
        label_name = labels[cid] if cid < len(labels) else f'class_{cid}'
        class_counts[label_name] = class_counts.get(label_name, 0) + 1

    print(f"找到 {len(image_paths)} 張影像，{len(labels)} 個類別")
    for label, count in class_counts.items():
        print(f"  {label}: {count} 張")

    bboxes = np.array(bboxes, dtype=np.float32)
    class_ids = np.array(class_ids, dtype=np.int32)

    # 建立 tf.data.Dataset
    dataset = tf.data.Dataset.from_tensor_slices((image_paths, bboxes))

    # 打亂順序
    dataset = dataset.shuffle(buffer_size=len(image_paths), seed=seed, reshuffle_each_iteration=False)

    # 解碼影像函數
    def load_and_preprocess(path, bbox):
        image = tf.io.read_file(path)
        image = tf.image.decode_jpeg(image, channels=3)
        image = tf.image.resize(image, [img_size, img_size])
        image = tf.cast(image, tf.float32) / 255.0
        return image, bbox

    dataset = dataset.map(load_and_preprocess, num_parallel_calls=AUTOTUNE)

    # 分割訓練/驗證集
    if validation_split > 0:
        val_size = max(1, int(len(image_paths) * validation_split))
        val_ds = dataset.take(val_size)
        train_ds = dataset.skip(val_size)
    else:
        train_ds = dataset
        val_ds = None
        print("  validation_split=0，不使用驗證集")

    # 批次與 prefetch
    train_ds = train_ds.batch(batch_size).prefetch(AUTOTUNE)
    if val_ds is not None:
        val_ds = val_ds.batch(batch_size).prefetch(AUTOTUNE)

    return train_ds, val_ds, labels, class_counts


def create_detector_augmentation(enabled=True):
    """
    建立物件偵測專用的資料擴增 pipeline。
    注意：物件偵測的擴增需要同時變換影像與 bbox，
    此處僅做影像層級的擴增（不影響 bbox 座標的幾何變換）。

    Args:
        enabled: 是否啟用資料擴增

    Returns:
        tf.keras.Sequential 資料擴增層
    """
    if not enabled:
        return tf.keras.Sequential()

    # 僅使用不影響 bbox 座標的擴增（亮度、對比、色調）
    return tf.keras.Sequential([
        tf.keras.layers.RandomBrightness(0.1),
        tf.keras.layers.RandomContrast(0.2),
    ])


def prepare_detector_dataset(dataset, augmentation=None, augment_enabled=True):
    """
    對物件偵測資料集套用資料擴增。

    Args:
        dataset: 原始 tf.data.Dataset
        augmentation: 資料擴增層（可為 None）
        augment_enabled: 是否啟用資料擴增

    Returns:
        處理後的 tf.data.Dataset
    """
    if augmentation is not None and augment_enabled:
        dataset = dataset.map(
            lambda x, y: (augmentation(x, training=True), y),
            num_parallel_calls=AUTOTUNE
        )

    return dataset.prefetch(buffer_size=AUTOTUNE)