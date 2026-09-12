"""
表格資料集處理模組
讀取 data.csv（由 Dataset Manager 匯出），提供分層/隨機切分與 tf.data.Dataset pipeline。

label 欄位型別決定任務：
- 全部可解析為數值 → 回歸（Dense(1) linear + MSE，隨機切分，報告註明）
- 其他 → 分類（label_map 編碼 + 分層抽樣 + 教學保護）
"""

import os
import csv
import sys
import json
import random
import numpy as np
import tensorflow as tf

AUTOTUNE = tf.data.AUTOTUNE


def _read_csv_rows(csv_path):
    with open(csv_path, 'r', encoding='utf-8-sig', newline='') as f:
        reader = csv.reader(f)
        rows = [r for r in reader if any(cell.strip() for cell in r)]
    if len(rows) < 2:
        print(f"錯誤: {csv_path} 至少需要標題列與 1 筆資料")
        sys.exit(1)
    header = [h.strip() for h in rows[0]]
    data = []
    for r in rows[1:]:
        if len(r) != len(header):
            continue
        data.append(dict(zip(header, [c.strip() for c in r])))
    return header, data


def _parse_number(text):
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def _resolve_columns(dataset_dir, header):
    """決定 label 與 feature 欄位：優先讀 dataset.json 的 schema，否則啟發式。"""
    label_col = None
    feature_cols = list(header)
    spec_path = os.path.join(dataset_dir, 'dataset.json')
    if os.path.exists(spec_path):
        try:
            with open(spec_path, 'r', encoding='utf-8') as f:
                schema = json.load(f).get('schema', {})
            label_col = schema.get('label') or None
            features = schema.get('features')
            if features:
                feature_cols = [c for c in features if c in header]
        except Exception as e:
            print(f"警告: dataset.json 解析失敗 ({e})，改用啟發式欄位偵測")
    if label_col is None:
        lowered = [h.lower() for h in header]
        for cand in ('label', 'class', 'target'):
            if cand in lowered:
                label_col = header[lowered.index(cand)]
                break
    if label_col is None:
        label_col = header[-1]
        print(f"警告: 找不到 label 欄位，使用最後一欄 '{label_col}' 作為 label")
    feature_cols = [c for c in feature_cols if c != label_col]
    if not feature_cols:
        feature_cols = [h for h in header if h != label_col]
    if not feature_cols:
        print("錯誤: 沒有可用的 feature 欄位")
        sys.exit(1)
    print(f"欄位: label='{label_col}', features={feature_cols}")
    return label_col, feature_cols


def load_table_dataset(dataset_dir, batch_size=32, validation_split=0.2, seed=123):
    """
    載入表格資料集。

    預期目錄結構：
        dataset_dir/
        ├── data.csv       (標題列 + 資料列，由 Dataset Manager 匯出)
        └── dataset.json   (選用：schema.label / schema.features)

    Returns:
        (train_ds, val_ds, meta)
        - train_ds: tf.data.Dataset，元素為 (feature_vector_batch, y_batch)
        - val_ds: 驗證集 Dataset（或 None）
        - meta: dict 含 task / labels / label_map / num_classes / feature_names / feature_stats
    """
    csv_path = os.path.join(dataset_dir, 'data.csv')
    if not os.path.exists(csv_path):
        print(f"錯誤: 找不到 data.csv ({csv_path})，請先由 Dataset Manager 匯出資料集")
        sys.exit(1)

    header, rows = _read_csv_rows(csv_path)
    label_col, feature_cols = _resolve_columns(dataset_dir, header)
    print(f"找到 {len(rows)} 筆資料")

    label_values = [r[label_col] for r in rows]
    numeric_labels = [_parse_number(v) for v in label_values]
    is_regression = all(v is not None for v in numeric_labels)

    rng = random.Random(seed)

    if is_regression:
        # --- 回歸：隨機切分（label 為連續數值，依規範允許，但需報告註明） ---
        print("任務型別: 回歸 (label 為連續數值)")
        print("切分方式: 隨機切分 (regression split, label 為連續數值)")
        indices = list(range(len(rows)))
        rng.shuffle(indices)
        if validation_split > 0:
            n_val = int(round(len(indices) * validation_split))
            n_val = max(1, min(n_val, len(indices) - 1)) if len(indices) >= 2 else 0
            val_idx = indices[:n_val]
            train_idx = indices[n_val:]
        else:
            train_idx, val_idx = indices, []
        y_all = np.array(numeric_labels, dtype=np.float32)
        labels, label_map, num_classes = None, {}, 1
    else:
        # --- 分類：依 label 值分層抽樣（鐵則：禁止全域隨機切） ---
        print("任務型別: 分類 (label 為類別)")
        unique_labels = sorted(set(label_values))
        label_map = {name: idx for idx, name in enumerate(unique_labels)}
        labels = unique_labels
        num_classes = len(unique_labels)
        if num_classes < 2:
            print(f"錯誤: 分類任務至少需要 2 個類別，目前只有 {num_classes} 個")
            sys.exit(1)
        print("分層抽樣 (stratified split):")
        by_class = {name: [] for name in unique_labels}
        for i, v in enumerate(label_values):
            by_class[v].append(i)
        train_idx, val_idx = [], []
        for name in unique_labels:
            idx = by_class[name]
            rng.shuffle(idx)
            n = len(idx)
            n_val = int(round(n * validation_split))
            if n_val == 0 and n >= 2:
                n_val = 1
            if n_val >= n and n >= 2:
                n_val = n - 1
            val_idx.extend(idx[:n_val])
            train_idx.extend(idx[n_val:])
            print(f"  {name}: train {n - n_val} / val {n_val}")
        if not val_idx:
            print("錯誤: 分層抽樣後驗證集為空，請增加樣本數或降低 validation_split")
            sys.exit(1)
        if not train_idx:
            print("錯誤: 分層抽樣後訓練集為空，請增加樣本數")
            sys.exit(1)
        y_all = np.array([label_map[v] for v in label_values], dtype=np.int32)
        rng.shuffle(train_idx)
        rng.shuffle(val_idx)

    # --- feature 前處理統計（數值 z-score、非數值 sorted-unique 編碼） ---
    feature_stats = []
    X = np.zeros((len(rows), len(feature_cols)), dtype=np.float32)
    for ci, col in enumerate(feature_cols):
        values = [r[col] for r in rows]
        nums = [_parse_number(v) for v in values]
        if all(v is not None for v in nums):
            arr = np.array(nums, dtype=np.float32)
            mean = float(arr.mean())
            std = float(arr.std())
            if std < 1e-8:
                std = 1.0
            X[:, ci] = (arr - mean) / std
            feature_stats.append({'name': col, 'kind': 'numeric', 'mean': mean, 'std': std})
        else:
            mapping = {u: i for i, u in enumerate(sorted(set(values)))}
            X[:, ci] = np.array([mapping[v] for v in values], dtype=np.float32)
            feature_stats.append({'name': col, 'kind': 'categorical', 'mapping': mapping})

    meta = {
        'task': 'regression' if is_regression else 'classification',
        'labels': labels,
        'label_map': label_map,
        'num_classes': 1 if is_regression else num_classes,
        'feature_names': feature_cols,
        'feature_stats': feature_stats
    }

    def make_ds(idx_list, shuffle):
        xs = X[idx_list]
        if is_regression:
            ys = y_all[idx_list].reshape(-1, 1)
        else:
            ys = tf.one_hot(y_all[idx_list], num_classes).numpy()
        ds = tf.data.Dataset.from_tensor_slices((xs, ys))
        if shuffle:
            ds = ds.shuffle(buffer_size=len(idx_list), seed=seed,
                            reshuffle_each_iteration=True)
        return ds.batch(batch_size).prefetch(AUTOTUNE)

    train_ds = make_ds(np.array(train_idx), shuffle=True)
    val_ds = make_ds(np.array(val_idx), shuffle=False) if val_idx else None

    if val_ds is None:
        print("  validation_split=0，不使用驗證集")

    return train_ds, val_ds, meta