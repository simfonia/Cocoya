"""
循線資料集處理模組
提供回歸切分與 tf.data.Dataset pipeline。

雙佈局（C2 對齊分類，2026-09-23）：
  A. 匯出佈局（Dataset Manager ZIP 解壓後）：
        dataset_dir/images/ + dataset_dir/lines/*.txt
  B. DM 落盤佈局（拍完即可直練，與分類對稱，無需匯出/扁平化）：
        dataset_dir/<label>/*.jpg + dataset_dir/dataset.json（標註真相）
  偵測順序：images/ 存在 → A；否則 → B。
  線段為歸一化比例座標；循線標註無類別（class_id 恆 0）→ 屬回歸型任務，
  依規範採隨機切分（seed 固定確保再現性），報告需註明「無類別欄位（回歸），隨機切分」。
"""

import os
import sys
import numpy as np
import tensorflow as tf

from common.image_formats import is_supported_image, decode_train_image

AUTOTUNE = tf.data.AUTOTUNE


def _collect_exported_lines(images_dir, lines_dir):
    """佈局 A：掃 images/ + lines/*.txt（匯出包）。"""
    if not os.path.exists(lines_dir):
        print(f"錯誤: 找不到 lines 目錄 {lines_dir}（請先在 Dataset Manager 標註線段並匯出，或確認資料集含 dataset.json）")
        sys.exit(1)

    image_paths = []
    lines = []

    for fname in sorted(os.listdir(images_dir)):
        if not is_supported_image(fname):
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

    return image_paths, lines


def _collect_dm_lines(dataset_dir):
    """佈局 B（C2 落盤直練）：<label>/*.jpg + dataset.json 線段標註（無需 images/）。"""
    import json

    spec_path = os.path.join(dataset_dir, 'dataset.json')
    if not os.path.exists(spec_path):
        print(f"錯誤: 找不到 images 目錄，也找不到 {spec_path}（無法讀取線段標註）")
        sys.exit(1)

    with open(spec_path, 'r', encoding='utf-8') as f:
        spec = json.load(f)
    samples = ((spec.get('data_source') or {}).get('samples')) or []

    # 影像索引：掃所有標籤子資料夾（相對路徑優先，basename 唯一時兜底）
    by_rel = {}
    by_base = {}
    for entry in sorted(os.listdir(dataset_dir)):
        sub = os.path.join(dataset_dir, entry)
        if not os.path.isdir(sub) or entry in ('images', 'labels', 'lines'):
            continue
        for fn in sorted(os.listdir(sub)):
            if not is_supported_image(fn):
                continue
            abs_p = os.path.join(sub, fn)
            by_rel[f'{entry}/{fn}'] = abs_p
            by_base.setdefault(fn, []).append(abs_p)

    image_paths = []
    lines = []
    skipped_no_ann = 0
    skipped_missing = 0

    for s in samples:
        img_rel = str(s.get('image_path') or '').replace('\\', '/')
        base = img_rel.split('/')[-1]
        img_abs = by_rel.get(img_rel)
        if img_abs is None:
            cands = by_base.get(base) or []
            if len(cands) == 1:
                img_abs = cands[0]
        if img_abs is None or not os.path.exists(img_abs):
            skipped_missing += 1
            continue

        # 線段標註：annotations = [{ class_id, line:[x1,y1,x2,y2] }]，每張取第一條有效線
        seg = None
        for a in (s.get('annotations') or []):
            ln = a.get('line')
            if ln and len(ln) >= 4:
                seg = [float(ln[0]), float(ln[1]), float(ln[2]), float(ln[3])]
                break
        if seg is None:
            skipped_no_ann += 1  # 未標註（同佈局 A「無 txt 即跳過」）
            continue

        image_paths.append(img_abs)
        lines.append(seg)

    if skipped_no_ann:
        print(f"警告: 跳過 {skipped_no_ann} 張未標註影像（先到 Dataset Manager 標註線段）")
    if skipped_missing:
        print(f"警告: {skipped_missing} 筆樣本的影像檔不存在，跳過")

    return image_paths, lines


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

    # 雙佈局分派（C2）：images/ 存在 → 匯出佈局；否則 → DM 落盤直練
    if os.path.exists(images_dir):
        image_paths, lines = _collect_exported_lines(images_dir, lines_dir)
    else:
        print(f"註: 無 images 目錄，改以 DM 落盤佈局讀取 {dataset_dir}")
        image_paths, lines = _collect_dm_lines(dataset_dir)

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

        print("隨機切分 (random split，線段回歸任務無類別欄位):")
        print(f"  train {len(train_idx)} / val {len(val_idx)}")

        # 型別面：random.shuffle 的簽章要求「可變序列」，ndarray 不符合；
        # 執行面：ndarray 雖可 item assignment，但以 list 洗牌再轉回 ndarray
        # 可同時滿足靜態檢查與執行期語意（不依賴 ndarray 的 item assignment 行為）。
        train_shuffled = list(train_idx)
        rng.shuffle(train_shuffled)
        val_shuffled = list(val_idx)
        rng.shuffle(val_shuffled)
        train_idx = np.array(train_shuffled)
        val_idx = np.array(val_shuffled)

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
        # 解碼程序統一走專用入口（decode_image 可解 bmp/gif，decode_jpeg 不行）
        image = decode_train_image(image, img_size)
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
    循線專用色彩擴增：僅亮度/對比（不改變幾何，避免線段座標失真）。

    幾何擴增（水平翻轉）由 _random_hflip_line() 在 prepare_line_dataset()
    的 tf.data.map 中單獨處理，以確保線段端點 x 座標同步鏡射。
    """
    if not enabled:
        return tf.keras.Sequential()

    return tf.keras.Sequential([
        tf.keras.layers.RandomBrightness(0.1),
        tf.keras.layers.RandomContrast(0.2),
    ])


def _random_hflip_line(image, line):
    """
    對批次中的每張影像獨立以 50% 機率水平翻轉，並同步鏡射線段 x1、x2 座標。

    線段格式：[x1, y1, x2, y2]（歸一化比例座標）
    翻轉規則：x1_new = 1.0 - x1；x2_new = 1.0 - x2；y1、y2 不變。

    翻轉後 x1_new 可能大於 x2_new（端點順序互換），這是正常的——
    模型學習迴歸端點座標，不強制端點順序，訓練集混合兩種順序不影響收斂。

    Args:
        image: float32 Tensor，shape (B, H, W, C)，值域 [0, 1]
        line: float32 Tensor，shape (B, 4)，格式 [x1, y1, x2, y2]

    Returns:
        (image, line) tuple，翻轉後的影像與座標批次
    """
    batch_size = tf.shape(image)[0]
    flips = tf.random.uniform((batch_size, 1, 1, 1)) < 0.5
    image_flipped = tf.image.flip_left_right(image)
    image = tf.where(flips, image_flipped, image)

    flips_1d = tf.reshape(flips, [batch_size, 1])
    x1 = line[:, 0:1]
    y1 = line[:, 1:2]
    x2 = line[:, 2:3]
    y2 = line[:, 3:4]
    line_flipped = tf.concat([1.0 - x1, y1, 1.0 - x2, y2], axis=-1)
    line = tf.where(flips_1d, line_flipped, line)
    return image, line


def prepare_line_dataset(dataset, augmentation=None, augment_enabled=True):
    """
    對循線資料集套用資料擴增（僅訓練集使用；驗證集 augment_enabled=False）。

    擴增順序（augment_enabled=True 時）：
      1. 水平翻轉（座標感知，線段 x1/x2 同步鏡射）
      2. 色彩擴增（亮度、對比；由 augmentation Sequential 層處理）

    Args:
        dataset: 原始 tf.data.Dataset，元素為 (image, line)
        augmentation: 色彩擴增 Sequential 層（可為 None）
        augment_enabled: 是否啟用資料擴增

    Returns:
        處理後的 tf.data.Dataset
    """
    if augment_enabled:
        # 1. 水平翻轉（與線段座標同步）
        dataset = dataset.map(
            _random_hflip_line,
            num_parallel_calls=AUTOTUNE
        )
        # 2. 色彩擴增（不影響座標）
        if augmentation is not None:
            dataset = dataset.map(
                lambda x, y: (augmentation(x, training=True), y),
                num_parallel_calls=AUTOTUNE
            )
    return dataset.prefetch(buffer_size=AUTOTUNE)