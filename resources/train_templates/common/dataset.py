"""
資料集處理共同模組
提供圖片資料集載入、驗證、分割、資料擴增與預處理功能。
未來可擴充表格資料集（load_table_dataset）。
"""

import os
import sys
import tensorflow as tf

AUTOTUNE = tf.data.AUTOTUNE


def load_image_dataset(dataset_dir, img_size=224, batch_size=32, validation_split=0.2, seed=123):
    """
    載入圖片資料集，自動分割訓練/驗證集，計算各分類張數。

    Args:
        dataset_dir: 資料集目錄路徑（包含子資料夾作為分類標籤）
        img_size: 輸入影像尺寸（預設 224）
        batch_size: 批次大小
        validation_split: 驗證集比例（0.0~1.0）
        seed: 亂數種子

    Returns:
        (train_ds, val_ds, labels, class_counts)
        - train_ds: 訓練集 tf.data.Dataset
        - val_ds: 驗證集 tf.data.Dataset
        - labels: 分類標籤列表（排序後）
        - class_counts: 各分類張數字典型
    """
    if not os.path.exists(dataset_dir):
        print(f"錯誤: 找不到資料集目錄 {dataset_dir}")
        sys.exit(1)

    # 掃描分類
    labels = sorted([d for d in os.listdir(dataset_dir)
                     if os.path.isdir(os.path.join(dataset_dir, d))])

    if len(labels) < 2:
        print(f"錯誤: 至少需要 2 個分類，目前只有 {len(labels)} 個")
        sys.exit(1)

    print(f"找到 {len(labels)} 個分類: {labels}")

    # 計算各分類張數
    class_counts = {}
    for label in labels:
        count = len([f for f in os.listdir(os.path.join(dataset_dir, label))
                     if f.lower().endswith(('.jpg', '.jpeg', '.png'))])
        class_counts[label] = count
        print(f"  {label}: {count} 張")

    # 載入資料集
    if validation_split > 0:
        train_ds = tf.keras.preprocessing.image_dataset_from_directory(
            dataset_dir,
            validation_split=validation_split,
            subset='training',
            seed=seed,
            image_size=(img_size, img_size),
            batch_size=batch_size,
            label_mode='categorical'
        )

        val_ds = tf.keras.preprocessing.image_dataset_from_directory(
            dataset_dir,
            validation_split=validation_split,
            subset='validation',
            seed=seed,
            image_size=(img_size, img_size),
            batch_size=batch_size,
            label_mode='categorical'
        )
    else:
        # 不使用驗證集分割：全部作為訓練集
        full_ds = tf.keras.preprocessing.image_dataset_from_directory(
            dataset_dir,
            image_size=(img_size, img_size),
            batch_size=batch_size,
            label_mode='categorical'
        )
        train_ds = full_ds
        val_ds = None
        print("  validation_split=0，不使用驗證集")

    return train_ds, val_ds, labels, class_counts


def create_data_augmentation(enabled=True):
    """
    建立資料擴增 pipeline。

    Args:
        enabled: 是否啟用資料擴增

    Returns:
        tf.keras.Sequential 資料擴增層
    """
    if not enabled:
        return tf.keras.Sequential()

    return tf.keras.Sequential([
        tf.keras.layers.RandomFlip('horizontal'),
        tf.keras.layers.RandomRotation(0.2),
        tf.keras.layers.RandomZoom(0.2),
        tf.keras.layers.RandomContrast(0.2),
        tf.keras.layers.RandomBrightness(0.1),
        tf.keras.layers.RandomTranslation(0.1, 0.1),
    ])


def prepare_dataset(dataset, augmentation=None, normalization=True, augment_enabled=True):
    """
    對資料集套用正規化與資料擴增，並啟用 prefetch 優化。

    Args:
        dataset: 原始 tf.data.Dataset
        augmentation: 資料擴增層（可為 None）
        normalization: 是否進行 1/255 正規化
        augment_enabled: 是否啟用資料擴增（僅對訓練集）

    Returns:
        處理後的 tf.data.Dataset
    """
    normalization_layer = tf.keras.layers.Rescaling(1./255)

    if augmentation is not None and augment_enabled:
        dataset = dataset.map(lambda x, y: (augmentation(x, training=True), y),
                              num_parallel_calls=AUTOTUNE)

    if normalization:
        dataset = dataset.map(lambda x, y: (normalization_layer(x), y),
                              num_parallel_calls=AUTOTUNE)

    return dataset.prefetch(buffer_size=AUTOTUNE)


# === 預留接口：表格資料集 ===

def load_table_dataset(dataset_dir, **kwargs):
    """
    載入表格資料集（CSV/JSON）。
    目前尚未實作，留待後續擴充。
    """
    raise NotImplementedError(
        "表格資料集載入功能尚未實作。"
        "請使用 image 類型的資料集進行訓練。"
    )