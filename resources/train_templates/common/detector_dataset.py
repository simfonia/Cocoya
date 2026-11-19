"""
物件偵測資料集處理模組 (Spatial Head & Bbox 雙模式)
提供 tf.data.Dataset pipeline，支援單一目標偵測（每張圖最多 1 個 bbox）與負樣本背景學習。

雙佈局（C2 對齊分類，2026-09-23）：
  A. YOLO 佈局（Dataset Manager 匯出 ZIP 解壓後）：
        dataset_dir/images/ + dataset_dir/labels/ + dataset_dir/labels.txt
  B. DM 落盤佈局（拍完即可直練，與分類對稱，無需匯出/扁平化）：
        dataset_dir/<label>/*.jpg + dataset_dir/dataset.json（標註真相）
  偵測順序：images/ 存在 → A；否則 → B。
  B 的 bbox 為 DM 左上角 [x,y,w,h]，載入時轉 YOLO 中心點 [cx,cy,w,h]。

Spatial Head 升級規範（2026-11-19 拍板）：
  1. 支援無標註影像作為負樣本保留（產生全零熱圖，尺寸 mask 全零）。
  2. 僅含未分類框 (class_id=-1) 的影像明確略過並計數警告（不可誤當負樣本）。
  3. 單影像含有 >1 個有效標註框時明確拒絕並拋錯，提示切換 YOLO 模組。
  4. 產生 Stride-8 Gaussian Heatmap (28x28x1) 與 Size map (28x28x3)。
  5. 批次隨機水平翻轉同步鏡像 2D 空間特徵圖，與影像幾何座標嚴格一致。
"""

import os
import sys
import numpy as np
import tensorflow as tf

from common.image_formats import is_supported_image, decode_train_image

AUTOTUNE = tf.data.AUTOTUNE


def gaussian_heatmap(center_x, center_y, heatmap_size=28, sigma=1.5):
    """
    產生單目標之 2D 高斯熱圖 (heatmap)。
    峰值落在歸一化座標 (center_x, center_y) 對應之網格上，值域 [0, 1]。

    Args:
        center_x: 歸一化中心 x 座標 [0.0, 1.0]
        center_y: 歸一化中心 y 座標 [0.0, 1.0]
        heatmap_size: 熱圖解析度（預設 28，即 224 // 8）
        sigma: 高斯分佈標準差（預設 1.5 格）

    Returns:
        np.ndarray, shape (heatmap_size, heatmap_size, 1), float32
    """
    grid_x = min(max(int(center_x * heatmap_size), 0), heatmap_size - 1)
    grid_y = min(max(int(center_y * heatmap_size), 0), heatmap_size - 1)
    yy, xx = np.mgrid[0:heatmap_size, 0:heatmap_size]
    heatmap = np.exp(-((xx - grid_x) ** 2 + (yy - grid_y) ** 2) / (2.0 * sigma * sigma))
    heatmap[grid_y, grid_x] = 1.0
    return heatmap.astype(np.float32)[..., np.newaxis]


def generate_spatial_targets(bbox, heatmap_size=28, sigma=1.5):
    """
    為單一樣本產生 Spatial Head 訓練目標 (heatmap, size_map)。

    Args:
        bbox: [cx, cy, w, h] 歸一化座標；若為 None 則代表負樣本（無目標）
        heatmap_size: 特徵圖解析度（預設 28）
        sigma: 高斯熱圖核大小（預設 1.5 格）

    Returns:
        heatmap: float32, shape (heatmap_size, heatmap_size, 1)
        size_map: float32, shape (heatmap_size, heatmap_size, 3)
                  通道 0:2 為 [w, h]，通道 2 為 mask（有效目標鄰域 >= 0.3 為 1.0，其餘 0.0）
    """
    if bbox is None:
        # 負樣本（無物件）：全零熱圖，尺寸 mask 全零
        heatmap = np.zeros((heatmap_size, heatmap_size, 1), dtype=np.float32)
        size_map = np.zeros((heatmap_size, heatmap_size, 3), dtype=np.float32)
        return heatmap, size_map

    cx, cy, w, h = float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])
    heatmap = gaussian_heatmap(cx, cy, heatmap_size=heatmap_size, sigma=sigma)
    size_map = np.zeros((heatmap_size, heatmap_size, 3), dtype=np.float32)
    # 取熱圖響應 >= 0.3 的鄰域填入框寬高，並將 mask 設為 1.0
    size_mask = heatmap[..., 0] >= 0.3
    size_map[size_mask, 0] = w
    size_map[size_mask, 1] = h
    size_map[size_mask, 2] = 1.0
    return heatmap, size_map


def _collect_yolo_pairs(images_dir, labels_dir, labels_file):
    """佈局 A：掃 images/ + labels/*.txt（YOLO 匯出包）。"""
    if not os.path.exists(labels_dir):
        print(f"錯誤: 找不到 labels 目錄 {labels_dir}")
        sys.exit(1)

    # 讀取類別名稱
    if os.path.exists(labels_file):
        with open(labels_file, 'r', encoding='utf-8') as f:
            labels = [line.strip() for line in f if line.strip()]
    else:
        labels = []

    image_paths = []
    bboxes = []
    class_ids = []
    skipped_unclassified = 0
    negative_count = 0

    for fname in sorted(os.listdir(images_dir)):
        if not is_supported_image(fname):
            continue

        img_path = os.path.join(images_dir, fname)
        label_name = os.path.splitext(fname)[0] + '.txt'
        label_path = os.path.join(labels_dir, label_name)

        if not os.path.exists(label_path):
            # 標註檔不存在：保留作為負樣本（無物件背景圖）
            image_paths.append(img_path)
            bboxes.append(None)
            class_ids.append(-1)
            negative_count += 1
            continue

        with open(label_path, 'r', encoding='utf-8', errors='replace') as f:
            lines = [l.strip() for l in f if l.strip()]

        if len(lines) == 0:
            # 標註檔案為空：保留作為負樣本（無物件背景圖）
            image_paths.append(img_path)
            bboxes.append(None)
            class_ids.append(-1)
            negative_count += 1
            continue

        valid_boxes = []
        unclassified_boxes = []
        for line in lines:
            parts = line.split()
            if len(parts) < 5:
                continue
            try:
                cid = int(parts[0])
                cx, cy, w, h = float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])
            except (ValueError, IndexError):
                continue
            if cid >= 0:
                valid_boxes.append((cid, [cx, cy, w, h]))
            else:
                unclassified_boxes.append([cx, cy, w, h])

        if len(valid_boxes) > 1:
            raise ValueError(
                f"Spatial Head 單目標架構目前每張影像最多僅支援一個標註目標，影像 {fname} 含有 {len(valid_boxes)} 個標註。多物件偵測請使用 YOLO 模組。"
            )
        elif len(valid_boxes) == 1:
            cid, box = valid_boxes[0]
            image_paths.append(img_path)
            bboxes.append(box)
            class_ids.append(cid)
            if cid >= len(labels):
                while len(labels) <= cid:
                    labels.append(f'class_{len(labels)}')
        elif len(unclassified_boxes) > 0:
            # 僅含未分類框（class_id=-1），不可誤當負樣本
            skipped_unclassified += 1
            continue
        else:
            # 格式不合或無有效框，作為負樣本
            image_paths.append(img_path)
            bboxes.append(None)
            class_ids.append(-1)
            negative_count += 1

    if skipped_unclassified:
        print(f"警告: 跳過 {skipped_unclassified} 張僅含未分類框的影像（class_id=-1，匯出前請先分類）")
    if negative_count:
        print(f"資訊: 包含 {negative_count} 張無物件負樣本影像（產生全零熱圖訓練抑制誤報）")

    return image_paths, bboxes, class_ids, labels


def _collect_dm_pairs(dataset_dir):
    """佈局 B（C2 落盤直練）：<label>/*.jpg + dataset.json 標註（無需 images/）。"""
    import json

    spec_path = os.path.join(dataset_dir, 'dataset.json')
    if not os.path.exists(spec_path):
        print(f"錯誤: 找不到 images 目錄，也找不到 {spec_path}（無法讀取標註）")
        sys.exit(1)

    with open(spec_path, 'r', encoding='utf-8') as f:
        spec = json.load(f)

    samples = ((spec.get('data_source') or {}).get('samples')) or []
    label_map = ((spec.get('schema') or {}).get('label_map')) or {}

    labels = []
    for name, cid in label_map.items():
        try:
            cid = int(cid)
        except (TypeError, ValueError):
            continue
        if cid < 0:
            continue
        while len(labels) <= cid:
            labels.append(f'class_{len(labels)}')
        labels[cid] = str(name)

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
    bboxes = []
    class_ids = []
    skipped_unclassified = 0
    skipped_missing = 0
    negative_count = 0

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

        anns = s.get('annotations') or []
        valid_boxes = []
        unclassified_boxes = []
        for a in anns:
            try:
                cid = int(a.get('class_id', -1))
            except (TypeError, ValueError):
                cid = -1
            box = a.get('bbox')
            if cid >= 0 and box and len(box) >= 4:
                valid_boxes.append((cid, box))
            elif box and len(box) >= 4:
                unclassified_boxes.append(box)

        if len(valid_boxes) > 1:
            raise ValueError(
                f"Spatial Head 單目標架構目前每張影像最多僅支援一個標註目標，影像 {img_rel} 含有 {len(valid_boxes)} 個標註。多物件偵測請使用 YOLO 模組。"
            )
        elif len(valid_boxes) == 1:
            cid, bbox = valid_boxes[0]
            x, y, w, h = float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])
            image_paths.append(img_abs)
            bboxes.append([x + w / 2.0, y + h / 2.0, w, h])
            class_ids.append(cid)
            while len(labels) <= cid:
                labels.append(f'class_{len(labels)}')
        elif len(unclassified_boxes) > 0:
            skipped_unclassified += 1
            continue
        else:
            # anns 為空：保留為無物件負樣本
            image_paths.append(img_abs)
            bboxes.append(None)
            class_ids.append(-1)
            negative_count += 1

    if skipped_unclassified:
        print(f"警告: 跳過 {skipped_unclassified} 張僅含未分類框的影像（class_id=-1，請先在標籤管理員分類）")
    if skipped_missing:
        print(f"警告: {skipped_missing} 筆樣本的影像檔不存在，跳過")
    if negative_count:
        print(f"資訊: 包含 {negative_count} 張無物件負樣本影像（產生全零熱圖訓練抑制誤報）")

    return image_paths, bboxes, class_ids, labels


def load_detector_dataset(dataset_dir, img_size=224, batch_size=32, validation_split=0.2, seed=123,
                          target_format='spatial'):
    """
    載入物件偵測資料集（雙佈局，支援 Spatial Head 熱圖目標與傳統 Bbox 格式）。

    佈局 A（images/ 存在，YOLO 匯出包）：
        dataset_dir/
        ├── images/        (jpg/png 影像)
        ├── labels/        (txt 標註，每行: class_id cx cy w h)
        └── labels.txt     (類別名稱，每行一個)
    佈局 B（DM 落盤，拍完直練）：
        dataset_dir/<label>/*.jpg + dataset_dir/dataset.json

    Args:
        dataset_dir: 資料集根目錄
        img_size: 輸入影像尺寸（預設 224）
        batch_size: 批次大小
        validation_split: 驗證集比例（0.0~1.0）
        seed: 亂數種子
        target_format: 'spatial' (預設，輸出 (heatmap, size_map)) 或 'bbox' (輸出 [cx, cy, w, h])

    Returns:
        (train_ds, val_ds, labels, class_counts)
        - train_ds: tf.data.Dataset
            - 若 target_format='spatial': 元素為 (image_batch, (heatmap_batch, size_batch))
              heatmap_batch shape: (B, H_m, W_m, 1)
              size_batch shape: (B, H_m, W_m, 3) (通道 0:2 為 w/h，通道 2 為 mask)
            - 若 target_format='bbox': 元素為 (image_batch, bbox_batch)
              bbox_batch shape: (B, 4)
        - val_ds: 驗證集 Dataset（或 None）
        - labels: 類別名稱列表
        - class_counts: 各類別樣本數字典
    """
    images_dir = os.path.join(dataset_dir, 'images')
    labels_dir = os.path.join(dataset_dir, 'labels')
    labels_file = os.path.join(dataset_dir, 'labels.txt')

    if os.path.exists(images_dir):
        image_paths, bboxes, class_ids, labels = _collect_yolo_pairs(
            images_dir, labels_dir, labels_file)
    else:
        print(f"註: 無 images 目錄，改以 DM 落盤佈局讀取 {dataset_dir}")
        image_paths, bboxes, class_ids, labels = _collect_dm_pairs(dataset_dir)

    if len(image_paths) == 0:
        print("錯誤: 沒有有效的影像-標註配對")
        sys.exit(1)

    # 計算各類別樣本數（包含負樣本）
    class_counts = {}
    for cid in class_ids:
        if cid == -1:
            label_name = "[負樣本]"
        else:
            label_name = labels[cid] if cid < len(labels) else f'class_{cid}'
        class_counts[label_name] = class_counts.get(label_name, 0) + 1

    print(f"找到 {len(image_paths)} 張影像，{len(labels)} 個類別")
    print("各類別樣本數:")
    for name, cnt in sorted(class_counts.items(), key=lambda kv: kv[0]):
        print(f"  {name}: {cnt} 張")

    positive_counts = [cnt for name, cnt in class_counts.items() if name != "[負樣本]"]
    if positive_counts and min(positive_counts) > 0 and max(positive_counts) / min(positive_counts) >= 3:
        ratio = max(positive_counts) / min(positive_counts)
        print(f"警告: 類別不平衡（最大/最小 ≈ {ratio:.1f}）——"
              f"分層抽樣已確保驗證集各類比例一致；建議補拍樣本較少的類別以提升訓練穩定性")

    class_ids_arr = np.array(class_ids, dtype=np.int32)

    # --- 分層抽樣 (stratified split)：依類別（含負樣本）各自切出驗證集 ---
    if validation_split > 0:
        rng = np.random.RandomState(seed)
        train_idx, val_idx = [], []
        for cid in np.unique(class_ids_arr):
            idx = np.where(class_ids_arr == cid)[0]
            rng.shuffle(idx)
            n_val = int(len(idx) * validation_split)
            # 教學保護：樣本數 >= 2 時，驗證集與訓練集各至少 1 張
            if len(idx) >= 2:
                n_val = max(1, min(n_val, len(idx) - 1))
            else:
                n_val = 0
            val_idx.extend(idx[:n_val])
            train_idx.extend(idx[n_val:])

        if len(val_idx) == 0:
            print("錯誤: 分層抽樣後驗證集為空，請增加樣本數或降低 validation_split")
            sys.exit(1)
        if len(train_idx) == 0:
            print("錯誤: 分層抽樣後訓練集為空，請增加樣本數")
            sys.exit(1)

        print("分層抽樣 (stratified split):")
        for cid in np.unique(class_ids_arr):
            label_name = "[負樣本]" if cid == -1 else (labels[cid] if cid < len(labels) else f'class_{cid}')
            n_tr = sum(1 for i in train_idx if class_ids_arr[i] == cid)
            n_va = sum(1 for i in val_idx if class_ids_arr[i] == cid)
            print(f"  {label_name}: train {n_tr} / val {n_va}")

        train_idx = np.array(train_idx)
        val_idx = np.array(val_idx)
        rng.shuffle(train_idx)
        rng.shuffle(val_idx)

        train_paths = [image_paths[i] for i in train_idx]
        val_paths = [image_paths[i] for i in val_idx]
    else:
        print("  validation_split=0，不使用驗證集")
        train_idx = np.arange(len(image_paths))
        val_idx = np.array([], dtype=np.int32)
        train_paths = list(image_paths)
        val_paths = []

    heatmap_size = img_size // 8

    if target_format == 'spatial':
        # 預先計算 Spatial Head 目標 (heatmap, size_map)
        heatmaps = np.zeros((len(image_paths), heatmap_size, heatmap_size, 1), dtype=np.float32)
        sizes = np.zeros((len(image_paths), heatmap_size, heatmap_size, 3), dtype=np.float32)
        for i, box in enumerate(bboxes):
            heatmaps[i], sizes[i] = generate_spatial_targets(box, heatmap_size=heatmap_size)

        train_heatmaps = heatmaps[train_idx]
        train_sizes = sizes[train_idx]
        val_heatmaps = heatmaps[val_idx] if len(val_idx) > 0 else None
        val_sizes = sizes[val_idx] if len(val_idx) > 0 else None

        def load_and_preprocess_spatial(path, hm, sz):
            image = tf.io.read_file(path)
            image = decode_train_image(image, img_size)
            image = tf.cast(image, tf.float32) / 255.0
            return image, (hm, sz)

        def make_spatial_ds(paths, hms, szs, shuffle):
            ds = tf.data.Dataset.from_tensor_slices((list(paths), hms, szs))
            if shuffle:
                ds = ds.shuffle(buffer_size=len(paths), seed=seed, reshuffle_each_iteration=True)
            ds = ds.map(load_and_preprocess_spatial, num_parallel_calls=AUTOTUNE)
            return ds.batch(batch_size).prefetch(AUTOTUNE)

        train_ds = make_spatial_ds(train_paths, train_heatmaps, train_sizes, shuffle=True)
        val_ds = make_spatial_ds(val_paths, val_heatmaps, val_sizes, shuffle=False) if val_paths else None

    else:
        # 傳統 bbox 格式 [cx, cy, w, h] (負樣本以全零填充)
        bbox_arr = np.array([b if b is not None else [0.0, 0.0, 0.0, 0.0] for b in bboxes], dtype=np.float32)
        train_bboxes = bbox_arr[train_idx]
        val_bboxes = bbox_arr[val_idx] if len(val_idx) > 0 else None

        def load_and_preprocess_bbox(path, bbox):
            image = tf.io.read_file(path)
            image = decode_train_image(image, img_size)
            image = tf.cast(image, tf.float32) / 255.0
            return image, bbox

        def make_bbox_ds(paths, boxes, shuffle):
            ds = tf.data.Dataset.from_tensor_slices((list(paths), boxes))
            if shuffle:
                ds = ds.shuffle(buffer_size=len(paths), seed=seed, reshuffle_each_iteration=True)
            ds = ds.map(load_and_preprocess_bbox, num_parallel_calls=AUTOTUNE)
            return ds.batch(batch_size).prefetch(AUTOTUNE)

        train_ds = make_bbox_ds(train_paths, train_bboxes, shuffle=True)
        val_ds = make_bbox_ds(val_paths, val_bboxes, shuffle=False) if val_paths else None

    return train_ds, val_ds, labels, class_counts


def create_detector_augmentation(enabled=True):
    """
    建立物件偵測專用的色彩擴增 pipeline（不改變幾何，不影響 bbox 座標）。

    幾何擴增（水平翻轉）由 _random_hflip_detector() 在 prepare_detector_dataset()
    的 tf.data.map 中單獨處理，以確保空間目標同步鏡射。
    """
    if not enabled:
        return tf.keras.Sequential()

    return tf.keras.Sequential([
        tf.keras.layers.RandomBrightness(0.1),
        tf.keras.layers.RandomContrast(0.2),
    ])


def _random_hflip_detector(image, target):
    """
    對批次中的每張影像獨立以 50% 機率水平翻轉，並同步鏡射目標。

    支援兩種格式：
      - Spatial Head 目標：target 為 tuple (heatmaps, sizes)
        heatmaps: (B, H_m, W_m, 1)，sizes: (B, H_m, W_m, 3)
        特徵圖與影像同步進行空間水平翻轉，幾何中心自然鏡射且寬高不變。
      - Legacy Bbox 目標：target 為 (B, 4)，格式 [cx, cy, w, h]
        cx_new = 1.0 - cx，cy/w/h 不變。
    """
    batch_size = tf.shape(image)[0]
    flips = tf.random.uniform((batch_size, 1, 1, 1)) < 0.5
    image_flipped = tf.image.flip_left_right(image)
    image = tf.where(flips, image_flipped, image)

    if isinstance(target, (tuple, list)):
        heatmaps, sizes = target
        heatmaps_flipped = tf.image.flip_left_right(heatmaps)
        heatmaps = tf.where(flips, heatmaps_flipped, heatmaps)

        sizes_flipped = tf.image.flip_left_right(sizes)
        sizes = tf.where(flips, sizes_flipped, sizes)
        return image, (heatmaps, sizes)
    else:
        flips_1d = tf.reshape(flips, [batch_size, 1])
        cx = target[:, 0:1]
        cy = target[:, 1:2]
        w = target[:, 2:3]
        h = target[:, 3:4]
        target_flipped = tf.concat([1.0 - cx, cy, w, h], axis=-1)
        target = tf.where(flips_1d, target_flipped, target)
        return image, target


def prepare_detector_dataset(dataset, augmentation=None, augment_enabled=True):
    """
    對物件偵測資料集套用資料擴增。

    擴增順序（augment_enabled=True 時）：
      1. 水平翻轉（座標/特徵圖感知同步鏡射）
      2. 色彩擴增（亮度、對比；由 augmentation Sequential 層處理）
    """
    if augment_enabled:
        dataset = dataset.map(
            _random_hflip_detector,
            num_parallel_calls=AUTOTUNE
        )
        if augmentation is not None:
            dataset = dataset.map(
                lambda x, y: (augmentation(x, training=True), y),
                num_parallel_calls=AUTOTUNE
            )

    return dataset.prefetch(buffer_size=AUTOTUNE)
